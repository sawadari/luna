/**
 * SSOTAgent - Single Source of Truth & Kernel Management
 */

import { Octokit } from '@octokit/rest';
import * as yaml from 'yaml';
import {
  GitHubIssue,
  AgentConfig,
  AgentResult,
  SSOTData,
  SSOTContext,
  Kernel,
  KernelViolation,
  MaturityLevel,
} from '../types';

interface SSOTResult {
  issueNumber: number;
  suggestedKernels: Kernel[];
  violations: KernelViolation[];
  detectedViolations: KernelViolation[]; // Alias for backward compatibility
  maturityTransitions: Array<{ kernelId: string; from: MaturityLevel; to: MaturityLevel }>;
  isConverged: boolean;
  convergenceStatus: { [kernelId: string]: boolean };
  comments: string[];
  labels: string[];
}

export class SSOTAgent {
  private octokit: Octokit;
  private config: AgentConfig;

  constructor(config: AgentConfig) {
    this.config = config;
    this.octokit = new Octokit({ auth: config.githubToken });
  }

  private log(message: string): void {
    if (this.config.verbose) {
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] [SSOTAgent] ${message}`);
    }
  }

  /**
   * メイン実行
   */
  async execute(issueNumber: number): Promise<AgentResult<SSOTResult>> {
    this.log(`✅ SSOT Agent starting for issue #${issueNumber}`);

    const [owner, repo] = this.config.repository.split('/');

    // 1. Issue取得
    const { data: issue } = await this.octokit.issues.get({
      owner,
      repo,
      issue_number: issueNumber,
    });

    const githubIssue: GitHubIssue = {
      number: issue.number,
      title: issue.title,
      body: issue.body || '',
      labels: issue.labels.map((l) =>
        typeof l === 'string' ? { name: l, color: '' } : { name: l.name!, color: l.color! }
      ),
      state: issue.state as 'open' | 'closed',
      created_at: issue.created_at,
      updated_at: issue.updated_at,
    };

    // 2. SSOT Data抽出
    const ssotData = this.parseSSOTData(githubIssue.body);
    const context = this.extractSSOTContext(issueNumber, ssotData);

    const result: SSOTResult = {
      issueNumber,
      suggestedKernels: [],
      violations: [],
      detectedViolations: [],
      maturityTransitions: [],
      isConverged: false,
      convergenceStatus: {},
      comments: [],
      labels: [],
    };

    // 3. Kernel提案
    if (!ssotData || !ssotData.kernels || ssotData.kernels.length === 0) {
      this.log('No kernels found, suggesting...');

      // Planning LayerからKernelを提案
      const planningData = this.parsePlanningData(githubIssue.body);
      if (planningData) {
        const kernelsFromPlanning = this.suggestKernelsFromDecisions(planningData);
        result.suggestedKernels.push(...kernelsFromPlanning);
      }

      // 従来の提案ロジックも実行
      const suggestedKernels = this.suggestKernels(githubIssue, context);
      result.suggestedKernels.push(...suggestedKernels);

      if (result.suggestedKernels.length > 0) {
        result.comments.push(this.buildKernelSuggestionComment(result.suggestedKernels));
        result.labels.push('Maturity:Draft');
      }
    }

    // 4. Maturity遷移チェック
    if (context.activeKernels.length > 0) {
      this.log(`Checking maturity transitions for ${context.activeKernels.length} kernels`);
      for (const kernel of context.activeKernels) {
        const transition = this.checkMaturityTransition(kernel, githubIssue);
        if (transition) {
          result.maturityTransitions.push(transition);
          result.comments.push(
            this.buildMaturityTransitionComment(kernel, transition.from, transition.to)
          );
          result.labels.push(`Maturity:${this.capitalizeFirst(transition.to)}`);
        }
      }
    }

    // 5. Kernel違反検出（Agreed/Frozenのみ）
    const agreedOrFrozenKernels = [...context.activeKernels, ...context.frozenKernels].filter(
      (k) => k.maturity === 'agreed' || k.maturity === 'frozen'
    );

    if (agreedOrFrozenKernels.length > 0) {
      this.log(`Checking violations for ${agreedOrFrozenKernels.length} kernels`);
      for (const kernel of agreedOrFrozenKernels) {
        const violations = this.detectViolations(kernel, githubIssue.body);
        result.detectedViolations.push(...violations);
        result.violations.push(...violations);
      }

      if (result.detectedViolations.length > 0) {
        result.comments.push(this.buildViolationComment(result.detectedViolations));
      }
    }

    // 6. 収束チェック
    let allConverged = true;
    for (const kernel of agreedOrFrozenKernels) {
      const isConverged = this.isConverged(kernel, context);
      result.convergenceStatus[kernel.id] = isConverged;

      if (!isConverged) {
        allConverged = false;
      }

      if (isConverged) {
        result.comments.push(this.buildConvergenceComment(kernel));
        result.labels.push('Convergent');
      }
    }

    // 全体の収束状態を設定（kernelが無い場合、またはすべて収束している場合はtrue）
    result.isConverged = agreedOrFrozenKernels.length === 0 || (allConverged && result.violations.length === 0 && context.activeExceptions.length === 0);

    // 7. SSOT Data埋め込み
    if (result.suggestedKernels.length > 0 || result.maturityTransitions.length > 0) {
      const updatedSSOTData = this.updateSSOTData(ssotData, result);
      const updatedBody = this.embedSSOTData(githubIssue.body, updatedSSOTData);

      if (!this.config.dryRun) {
        await this.octokit.issues.update({
          owner,
          repo,
          issue_number: issueNumber,
          body: updatedBody,
        });
        this.log('Issue body updated with SSOT Data');
      }
    }

    // 8. コメント投稿
    for (const comment of result.comments) {
      if (!this.config.dryRun) {
        await this.octokit.issues.createComment({
          owner,
          repo,
          issue_number: issueNumber,
          body: comment,
        });
      }
      this.log(`Comment posted: ${comment.substring(0, 50)}...`);
    }

    // 9. Label適用
    if (result.labels.length > 0 && !this.config.dryRun) {
      await this.octokit.issues.addLabels({
        owner,
        repo,
        issue_number: issueNumber,
        labels: result.labels,
      });
      this.log(`Labels applied: ${result.labels.join(', ')}`);
    }

    return {
      status: 'success',
      data: result,
      message: `SSOT Agent processed: ${result.suggestedKernels.length} kernels suggested, ${result.detectedViolations.length} violations`,
    };
  }

  // ========================================================================
  // SSOT Data パース・更新
  // ========================================================================

  /**
   * YAML frontmatterからSSOT Dataを抽出
   */
  private parseSSOTData(issueBody: string): SSOTData | null {
    const yamlMatch = issueBody.match(/^---\n([\s\S]*?)\n---/);
    if (!yamlMatch) {
      return null;
    }

    try {
      const data = yaml.parse(yamlMatch[1]);
      return data.ssot_layer || null;
    } catch (error) {
      this.log(`YAML parse error: ${error}`);
      return null;
    }
  }

  /**
   * YAML frontmatterからPlanning Layer Dataを抽出
   */
  private parsePlanningData(issueBody: string): any | null {
    const yamlMatch = issueBody.match(/^---\n([\s\S]*?)\n---/);
    if (!yamlMatch) {
      return null;
    }

    try {
      const data = yaml.parse(yamlMatch[1]);
      return data.planning_layer || null;
    } catch (error) {
      this.log(`YAML parse error: ${error}`);
      return null;
    }
  }

  /**
   * SSOT DataをYAML frontmatterとしてIssue bodyに埋め込み
   */
  private embedSSOTData(issueBody: string, ssotData: SSOTData): string {
    const bodyWithoutFrontmatter = issueBody.replace(/^---\n[\s\S]*?\n---\n/, '');

    const yamlData = {
      ssot_layer: ssotData,
    };
    const yamlString = yaml.stringify(yamlData);

    return `---\n${yamlString}---\n${bodyWithoutFrontmatter}`;
  }

  /**
   * SSOT Contextを抽出
   */
  private extractSSOTContext(issueNumber: number, ssotData: SSOTData | null): SSOTContext {
    if (!ssotData) {
      return {
        issueNumber,
        ssotData: null,
        activeKernels: [],
        frozenKernels: [],
        deprecatedKernels: [],
        unresolvedViolations: [],
        quarantinedContent: [],
        activeExceptions: [],
        expiredExceptions: [],
        pendingChangeRequests: [],
      };
    }

    return {
      issueNumber,
      ssotData,
      activeKernels:
        ssotData.kernels?.filter(
          (k) => k.maturity === 'draft' || k.maturity === 'under_review' || k.maturity === 'agreed'
        ) || [],
      frozenKernels: ssotData.kernels?.filter((k) => k.maturity === 'frozen') || [],
      deprecatedKernels: ssotData.kernels?.filter((k) => k.maturity === 'deprecated') || [],
      unresolvedViolations: ssotData.violations?.filter((v) => !v.resolvedAt) || [],
      quarantinedContent: ssotData.evidences?.filter((e) => e.status === 'quarantined') || [],
      activeExceptions: ssotData.exceptions?.filter((e) => e.status === 'active') || [],
      expiredExceptions: ssotData.exceptions?.filter((e) => e.status === 'expired') || [],
      pendingChangeRequests:
        ssotData.changeRequests?.filter((c) => !c.approvedAt && !c.rejectedAt) || [],
    };
  }

  /**
   * SSOT Data更新
   */
  private updateSSOTData(ssotData: SSOTData | null, result: SSOTResult): SSOTData {
    const updated: SSOTData = ssotData || {
      lastUpdatedAt: new Date().toISOString(),
      lastUpdatedBy: 'SSOTAgent',
    };

    // Kernels追加
    if (result.suggestedKernels.length > 0) {
      updated.kernels = [...(updated.kernels || []), ...result.suggestedKernels];
    }

    // Maturity遷移適用
    if (result.maturityTransitions.length > 0) {
      for (const transition of result.maturityTransitions) {
        const kernel = updated.kernels?.find((k) => k.id === transition.kernelId);
        if (kernel) {
          kernel.maturity = transition.to;
          kernel.lastUpdatedAt = new Date().toISOString();
        }
      }
    }

    // Violations追加
    if (result.detectedViolations.length > 0) {
      updated.violations = [...(updated.violations || []), ...result.detectedViolations];
    }

    updated.lastUpdatedAt = new Date().toISOString();
    updated.lastUpdatedBy = 'SSOTAgent';

    return updated;
  }

  // ========================================================================
  // Kernel提案
  // ========================================================================

  /**
   * Planning Layer の決定レコードから Kernel を提案
   */
  private suggestKernelsFromDecisions(planningData: any): Kernel[] {
    const suggestions: Kernel[] = [];

    if (!planningData || !planningData.decision_record) {
      return suggestions;
    }

    const decisionRecords = Array.isArray(planningData.decision_record)
      ? planningData.decision_record
      : [planningData.decision_record];

    for (const decision of decisionRecords) {
      if (decision.decision_type === 'adopt') {
        // rationale または decision_statement を使用
        const statement = decision.rationale || decision.decision_statement;
        if (statement) {
          suggestions.push({
            id: this.generateKernelId(),
            statement: statement,
            category: 'requirement',
            owner: decision.decided_by || decision.owner || 'TechLead',
            maturity: 'draft',
            createdAt: new Date().toISOString(),
            lastUpdatedAt: new Date().toISOString(),
          });
        }
      }
    }

    // Hard Constraints からも提案
    if (planningData.constraints) {
      const constraints = Array.isArray(planningData.constraints)
        ? planningData.constraints
        : [planningData.constraints];

      for (const constraint of constraints) {
        if (constraint.type === 'hard') {
          // statement または description を使用
          const statement = constraint.statement || constraint.description;
          if (statement) {
            suggestions.push({
              id: this.generateKernelId(),
              statement: statement,
              category: 'constraint',
              owner: 'ProductOwner',
              maturity: 'draft',
              createdAt: new Date().toISOString(),
              lastUpdatedAt: new Date().toISOString(),
            });
          }
        }
      }
    }

    return suggestions;
  }

  /**
   * Kernelを提案
   */
  private suggestKernels(issue: GitHubIssue, context: SSOTContext): Kernel[] {
    const suggestions: Kernel[] = [];

    // DecisionRecordからKernel提案
    const decisionPattern = /Decision:Adopt/i;
    if (issue.labels.some((l) => decisionPattern.test(l.name))) {
      const statement = this.extractDecisionStatement(issue.body);
      if (statement) {
        suggestions.push({
          id: this.generateKernelId(),
          statement,
          category: 'architecture',
          owner: 'TechLead',
          maturity: 'draft',
          createdAt: new Date().toISOString(),
          lastUpdatedAt: new Date().toISOString(),
        });
      }
    }

    // Hard ConstraintからKernel提案
    const constraintPattern = /Constraint:Hard/i;
    if (issue.labels.some((l) => constraintPattern.test(l.name))) {
      const constraints = this.extractConstraints(issue.body);
      for (const constraint of constraints) {
        suggestions.push({
          id: this.generateKernelId(),
          statement: constraint,
          category: 'constraint',
          owner: 'ProductOwner',
          maturity: 'draft',
          createdAt: new Date().toISOString(),
          lastUpdatedAt: new Date().toISOString(),
        });
      }
    }

    return suggestions;
  }

  /**
   * Decision statementを抽出
   */
  private extractDecisionStatement(body: string): string | null {
    const pattern = /Decision.*?:\s*(.+?)(?:\n|$)/i;
    const match = body.match(pattern);
    return match ? match[1].trim() : null;
  }

  /**
   * Constraintsを抽出
   */
  private extractConstraints(body: string): string[] {
    const constraints: string[] = [];
    const pattern = /Hard Constraint:\s*(.+?)(?:\n|$)/gi;
    const matches = body.matchAll(pattern);

    for (const match of matches) {
      constraints.push(match[1].trim());
    }

    return constraints;
  }

  /**
   * Kernel ID生成
   */
  private generateKernelId(): string {
    const random = Math.floor(Math.random() * 1000)
      .toString()
      .padStart(3, '0');
    return `KRN-${random}`;
  }

  // ========================================================================
  // Maturity遷移
  // ========================================================================

  /**
   * Maturity遷移をチェック
   */
  private checkMaturityTransition(
    kernel: Kernel,
    issue: GitHubIssue
  ): { kernelId: string; from: MaturityLevel; to: MaturityLevel } | null {
    switch (kernel.maturity) {
      case 'draft':
        // Draft → UnderReview: 定義完全
        if (this.isKernelComplete(kernel)) {
          return {
            kernelId: kernel.id,
            from: 'draft',
            to: 'under_review',
          };
        }
        break;

      case 'under_review':
        // UnderReview → Agreed: 承認検出
        if (this.hasApproval(issue)) {
          return {
            kernelId: kernel.id,
            from: 'under_review',
            to: 'agreed',
          };
        }
        break;

      case 'agreed':
        // Agreed → Frozen: Freeze command検出
        if (this.hasFreezeCommand(issue)) {
          return {
            kernelId: kernel.id,
            from: 'agreed',
            to: 'frozen',
          };
        }
        break;

      case 'frozen':
        // Frozen → Deprecated: Deprecate command検出
        if (this.hasDeprecateCommand(issue)) {
          return {
            kernelId: kernel.id,
            from: 'frozen',
            to: 'deprecated',
          };
        }
        break;

      default:
        break;
    }

    return null;
  }

  /**
   * Kernelが完全か確認
   */
  private isKernelComplete(kernel: Kernel): boolean {
    return !!(kernel.statement && kernel.category && kernel.owner);
  }

  /**
   * 承認コメント検出
   */
  private hasApproval(issue: GitHubIssue): boolean {
    const approvalPattern = /\/approve-kernel|LGTM|Approved/i;
    return approvalPattern.test(issue.body);
  }

  /**
   * Freeze command検出
   */
  private hasFreezeCommand(issue: GitHubIssue): boolean {
    const freezePattern = /\/freeze-kernel/i;
    return freezePattern.test(issue.body);
  }

  /**
   * Deprecate command検出
   */
  private hasDeprecateCommand(issue: GitHubIssue): boolean {
    const deprecatePattern = /\/deprecate-kernel/i;
    return deprecatePattern.test(issue.body);
  }

  // ========================================================================
  // Kernel違反検出
  // ========================================================================

  /**
   * Kernel違反を検出
   */
  private detectViolations(kernel: Kernel, issueBody: string): KernelViolation[] {
    const violations: KernelViolation[] = [];

    // HTTPS Kernel例
    if (kernel.statement.match(/HTTPS/i)) {
      const httpUsage = issueBody.match(/http:\/\//gi);
      if (httpUsage) {
        violations.push({
          id: this.generateViolationId(),
          kernelId: kernel.id,
          violationType: 'contradiction',
          detectedIn: `Issue body`,
          description: `HTTP usage detected, violates Kernel ${kernel.id}: "${kernel.statement}"`,
          severity: 'critical',
          detectedAt: new Date().toISOString(),
        });
      }
    }

    // JWT Kernel例
    if (kernel.statement.match(/JWT/i)) {
      const basicAuthUsage = issueBody.match(/Basic Auth/i);
      if (basicAuthUsage) {
        violations.push({
          id: this.generateViolationId(),
          kernelId: kernel.id,
          violationType: 'inconsistency',
          detectedIn: `Issue body`,
          description: `Basic Auth usage detected, violates Kernel ${kernel.id}`,
          severity: 'high',
          detectedAt: new Date().toISOString(),
        });
      }
    }

    return violations;
  }

  /**
   * Violation ID生成
   */
  private generateViolationId(): string {
    const random = Math.floor(Math.random() * 1000)
      .toString()
      .padStart(3, '0');
    return `VIO-${random}`;
  }

  // ========================================================================
  // 収束チェック
  // ========================================================================

  /**
   * Kernelが収束しているか確認
   */
  private isConverged(kernel: Kernel, context: SSOTContext): boolean {
    // 1. 未解決違反がないか
    const unresolvedViolations = context.unresolvedViolations.filter(
      (v) => v.kernelId === kernel.id
    );
    if (unresolvedViolations.length > 0) {
      return false;
    }

    // 2. 期限切れExceptionがないか
    const expiredExceptions = context.expiredExceptions.filter((e) => e.kernelId === kernel.id);
    if (expiredExceptions.length > 0) {
      return false;
    }

    // 3. Pending Change Requestがないか
    const pendingChanges = context.pendingChangeRequests.filter((c) => c.kernelId === kernel.id);
    if (pendingChanges.length > 0) {
      return false;
    }

    return true; // 収束している
  }

  // ========================================================================
  // コメント生成
  // ========================================================================

  /**
   * Kernel提案コメント
   */
  private buildKernelSuggestionComment(kernels: Kernel[]): string {
    const kernelList = kernels
      .map(
        (k) => `**${k.id}**: "${k.statement}"
- **Category**: ${k.category}
- **Owner**: @${k.owner}
- **Maturity**: ${this.capitalizeFirst(k.maturity)}`
      )
      .join('\n\n');

    return `📋 **Kernel 提案: ${kernels.length}件**

以下の Kernel が提案されました:

${kernelList}

**次のステップ**:
1. Kernel定義を精査
2. \`Maturity:UnderReview\` へ遷移
3. 承認を得る

**Label Applied**: \`Maturity:Draft\`

---
*Automated by SSOTAgent*`;
  }

  /**
   * Maturity遷移コメント
   */
  private buildMaturityTransitionComment(
    kernel: Kernel,
    from: MaturityLevel,
    to: MaturityLevel
  ): string {
    return `🔄 **Maturity Transition: ${kernel.id}**

**Kernel**: "${kernel.statement}"

**Transition**: ${this.capitalizeFirst(from)} → ${this.capitalizeFirst(to)}

**Label Applied**: \`Maturity:${this.capitalizeFirst(to)}\`

---
*Automated by SSOTAgent*`;
  }

  /**
   * Violation検出コメント
   */
  private buildViolationComment(violations: KernelViolation[]): string {
    const violationList = violations
      .map(
        (v) => `**${v.id}**: Kernel ${v.kernelId}
- **Type**: ${v.violationType}
- **Severity**: ${v.severity}
- **Description**: ${v.description}
- **Detected In**: ${v.detectedIn}`
      )
      .join('\n\n');

    return `🚨 **Kernel Violation Detected: ${violations.length}件**

${violationList}

**Required Action**: Resolve violations to converge to Kernel.

---
*Automated by SSOTAgent*`;
  }

  /**
   * 収束達成コメント
   */
  private buildConvergenceComment(kernel: Kernel): string {
    return `✅ **Convergence Achieved: ${kernel.id}**

**Kernel**: "${kernel.statement}"

**Convergence Status**:
- ✅ No unresolved violations
- ✅ No expired exceptions
- ✅ No pending change requests

すべての要素がKernelに収束しています。

**Label Applied**: \`Convergent\`

---
*Automated by SSOTAgent*`;
  }

  // ========================================================================
  // ヘルパーメソッド
  // ========================================================================

  /**
   * 文字列の最初を大文字に
   */
  private capitalizeFirst(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }
}
