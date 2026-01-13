/**
 * SSOTAgent V2 - with Kernel Registry Integration
 */

import { Octokit } from '@octokit/rest';
import * as yaml from 'yaml';
import {
  GitHubIssue,
  AgentConfig,
  AgentResult,
  KernelViolation,
  MaturityLevel,
} from '../types';
import { KernelWithNRVV } from '../types/nrvv';
import { KernelRegistryService } from '../ssot/kernel-registry';

interface SSOTResult {
  issueNumber: number;
  suggestedKernels: string[]; // Kernel IDs (saved to registry)
  violations: KernelViolation[];
  detectedViolations: KernelViolation[];
  maturityTransitions: Array<{
    kernelId: string;
    from: MaturityLevel;
    to: MaturityLevel;
    approvedBy?: string;
    freezedBy?: string;
  }>;
  isConverged: boolean;
  convergenceStatus: { [kernelId: string]: boolean };
  nrvvValidation?: {
    kernelId: string;
    isValid: boolean;
    traceabilityComplete: boolean;
    errors: string[];
    warnings: string[];
  }[];
  comments: string[];
  labels: string[];
}

export class SSOTAgentV2 {
  private octokit: Octokit;
  private config: AgentConfig;
  private kernelRegistry: KernelRegistryService;

  constructor(config: AgentConfig, registryPath?: string) {
    this.config = config;
    this.octokit = new Octokit({ auth: config.githubToken });
    this.kernelRegistry = new KernelRegistryService(registryPath);
  }

  private log(message: string): void {
    if (this.config.verbose) {
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] [SSOTAgentV2] ${message}`);
    }
  }

  /**
   * メイン実行
   */
  async execute(issueNumber: number): Promise<AgentResult<SSOTResult>> {
    this.log(`✅ SSOT Agent V2 starting for issue #${issueNumber}`);

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

    const result: SSOTResult = {
      issueNumber,
      suggestedKernels: [],
      violations: [],
      detectedViolations: [],
      maturityTransitions: [],
      isConverged: false,
      convergenceStatus: {},
      nrvvValidation: [],
      comments: [],
      labels: [],
    };

    // 2. Load Kernel Registry
    await this.kernelRegistry.load();
    this.log('Kernel Registry loaded');

    // 3. Check for Kernel references in Issue
    const kernelRefs = this.extractKernelReferences(githubIssue.body || '');
    this.log(`Found ${kernelRefs.length} kernel references in Issue`);

    // 4. Kernel提案（参照がない場合）
    if (kernelRefs.length === 0) {
      this.log('No kernel references found, suggesting...');

      // Planning LayerからKernel提案
      const planningData = this.parsePlanningData(githubIssue.body || '');
      if (planningData) {
        const kernelsFromPlanning = await this.suggestKernelsFromDecisions(
          planningData,
          githubIssue
        );
        result.suggestedKernels.push(...kernelsFromPlanning);
      }

      if (result.suggestedKernels.length > 0) {
        result.comments.push(
          this.buildKernelSuggestionComment(result.suggestedKernels)
        );
        result.labels.push('Maturity:Draft');

        // Issue bodyにKernel参照を埋め込む
        const updatedBody = this.embedKernelReferences(
          githubIssue.body || '',
          result.suggestedKernels
        );

        if (!this.config.dryRun) {
          await this.octokit.issues.update({
            owner,
            repo,
            issue_number: issueNumber,
            body: updatedBody,
          });
          this.log('Issue body updated with Kernel references');
        }
      }
    }

    // 5. Load referenced Kernels from Registry
    const referencedKernels: KernelWithNRVV[] = [];
    for (const kernelId of kernelRefs) {
      const kernel = await this.kernelRegistry.getKernel(kernelId);
      if (kernel) {
        referencedKernels.push(kernel);
      } else {
        this.log(`Warning: Kernel ${kernelId} not found in registry`);
      }
    }

    // 6. Maturity遷移チェック
    for (const kernel of referencedKernels) {
      const transition = this.checkMaturityTransition(kernel, githubIssue);
      if (transition) {
        result.maturityTransitions.push(transition);

        // Update Kernel in registry
        kernel.maturity = transition.to;
        kernel.lastUpdatedAt = new Date().toISOString();

        if (transition.to === 'agreed' && transition.approvedBy) {
          kernel.approvedAt = new Date().toISOString();
          kernel.approvedBy = transition.approvedBy;
        }

        if (transition.to === 'frozen') {
          kernel.frozenAt = new Date().toISOString();
        }

        await this.kernelRegistry.saveKernel(kernel);

        result.comments.push(
          this.buildMaturityTransitionComment(
            kernel,
            transition.from,
            transition.to
          )
        );
        result.labels.push(`Maturity:${this.capitalizeFirst(transition.to)}`);
      }
    }

    // 7. NRVV検証（Agreed/Frozenのみ）
    const agreedOrFrozenKernels = referencedKernels.filter(
      (k) => k.maturity === 'agreed' || k.maturity === 'frozen'
    );

    for (const kernel of agreedOrFrozenKernels) {
      const validation = await this.kernelRegistry.validateNRVV(kernel.id);

      result.nrvvValidation?.push({
        kernelId: kernel.id,
        isValid: validation.isValid,
        traceabilityComplete: validation.traceabilityComplete,
        errors: validation.errors,
        warnings: validation.warnings,
      });

      if (!validation.isValid || !validation.traceabilityComplete) {
        result.comments.push(
          this.buildNRVVValidationComment(kernel, validation)
        );

        if (!validation.isValid) {
          result.labels.push('NRVV:Invalid');
        } else if (!validation.traceabilityComplete) {
          result.labels.push('NRVV:Incomplete');
        }
      }
    }

    // 8. Kernel違反検出
    for (const kernel of agreedOrFrozenKernels) {
      const violations = this.detectViolations(kernel, githubIssue.body || '');
      result.detectedViolations.push(...violations);
      result.violations.push(...violations);
    }

    if (result.detectedViolations.length > 0) {
      result.comments.push(this.buildViolationComment(result.detectedViolations));
    }

    // 9. 収束チェック
    let allConverged = true;
    for (const kernel of agreedOrFrozenKernels) {
      const validation = await this.kernelRegistry.validateNRVV(kernel.id);
      const isConverged =
        validation.isValid &&
        validation.traceabilityComplete &&
        validation.missingLinks.length === 0;

      result.convergenceStatus[kernel.id] = isConverged;

      if (!isConverged) {
        allConverged = false;
      }

      if (isConverged) {
        result.comments.push(this.buildConvergenceComment(kernel));
        result.labels.push('Convergent');
      }
    }

    result.isConverged =
      agreedOrFrozenKernels.length === 0 ||
      (allConverged && result.violations.length === 0);

    // 10. コメント投稿
    for (const comment of result.comments) {
      if (!this.config.dryRun) {
        await this.octokit.issues.createComment({
          owner,
          repo,
          issue_number: issueNumber,
          body: comment,
        });
      }
      this.log(`Comment posted`);
    }

    // 11. Label適用
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
      metrics: {
        durationMs: Date.now() - Date.now(),
        timestamp: new Date().toISOString(),
      },
    };
  }

  // ========================================================================
  // Kernel Reference Management
  // ========================================================================

  /**
   * Extract Kernel references from Issue body
   */
  private extractKernelReferences(body: string): string[] {
    const yamlMatch = body.match(/^---\n([\s\S]*?)\n---/);
    if (!yamlMatch) {
      return [];
    }

    try {
      const data = yaml.parse(yamlMatch[1]);
      return data.kernel_refs || [];
    } catch (error) {
      this.log(`YAML parse error: ${error}`);
      return [];
    }
  }

  /**
   * Embed Kernel references into Issue body
   */
  private embedKernelReferences(body: string, kernelIds: string[]): string {
    const bodyWithoutFrontmatter = body.replace(/^---\n[\s\S]*?\n---\n/, '');

    const yamlData = {
      kernel_refs: kernelIds,
    };
    const yamlString = yaml.stringify(yamlData);

    return `---\n${yamlString}---\n${bodyWithoutFrontmatter}`;
  }

  // ========================================================================
  // Kernel提案（NRVV対応）
  // ========================================================================

  /**
   * Planning Layerの決定レコードからKernel提案
   */
  private async suggestKernelsFromDecisions(
    planningData: any,
    issue: GitHubIssue
  ): Promise<string[]> {
    const kernelIds: string[] = [];

    if (!planningData) {
      return kernelIds;
    }

    // DecisionRecordからKernel提案
    if (planningData.decision_record) {
      const decisionRecords = Array.isArray(planningData.decision_record)
        ? planningData.decision_record
        : [planningData.decision_record];

      for (const decision of decisionRecords) {
        if (decision.decision_type === 'adopt') {
          const statement =
            decision.rationale ||
            decision.decision_statement ||
            (decision.chosen_option
              ? `Adopt decision: ${decision.chosen_option}`
              : null);

          if (statement) {
            const kernel: KernelWithNRVV = {
              id: this.generateKernelId(),
              statement,
              category: 'requirement',
              owner: decision.decided_by || decision.owner || 'TechLead',
              maturity: 'draft',
              createdAt: new Date().toISOString(),
              lastUpdatedAt: new Date().toISOString(),
              sourceIssue: `#${issue.number}`,
              sourceDecisionRecord: decision.id || 'DR-auto',

              // NRVV初期化
              needs: [],
              requirements: [],
              verification: [],
              validation: [],
              history: [
                {
                  timestamp: new Date().toISOString(),
                  action: 'created',
                  by: 'SSOTAgentV2',
                  maturity: 'draft',
                },
              ],
            };

            // Kernel Registry に保存
            await this.kernelRegistry.saveKernel(kernel);
            kernelIds.push(kernel.id);

            this.log(`Kernel ${kernel.id} suggested and saved to registry`);
          }
        }
      }
    }

    return kernelIds;
  }

  /**
   * Parse Planning Data from Issue body
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
   * Generate Kernel ID
   */
  private generateKernelId(): string {
    const random = Math.floor(Math.random() * 10000)
      .toString()
      .padStart(4, '0');
    return `KRN-${random}`;
  }

  // ========================================================================
  // Maturity Transition
  // ========================================================================

  private checkMaturityTransition(
    kernel: KernelWithNRVV,
    issue: GitHubIssue
  ): { kernelId: string; from: MaturityLevel; to: MaturityLevel; approvedBy?: string } | null {
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
        const approval = this.hasApproval(issue, kernel.id);
        if (approval.approved) {
          return {
            kernelId: kernel.id,
            from: 'under_review',
            to: 'agreed',
            approvedBy: approval.approver,
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
        if (this.hasDeprecateCommand(issue, kernel.id)) {
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

  private isKernelComplete(kernel: KernelWithNRVV): boolean {
    return !!(kernel.statement && kernel.category && kernel.owner);
  }

  private hasApproval(
    issue: GitHubIssue,
    kernelId?: string
  ): { approved: boolean; approver?: string } {
    const approvalPattern = kernelId
      ? new RegExp(String.raw`\/approve-kernel\s+${kernelId}`, 'i')
      : /\/approve-kernel|LGTM|Approved/i;

    const body = issue.body || '';
    if (!approvalPattern.test(body)) {
      return { approved: false };
    }

    const mentionPattern = /@(\w+)/;
    const mentionMatch = body.match(mentionPattern);
    const approver = mentionMatch ? mentionMatch[1] : undefined;

    return { approved: true, approver };
  }

  private hasFreezeCommand(issue: GitHubIssue): boolean {
    const freezePattern = /\/freeze-kernel/i;
    return freezePattern.test(issue.body || '');
  }

  private hasDeprecateCommand(issue: GitHubIssue, kernelId: string): boolean {
    const deprecatePattern = new RegExp(
      String.raw`\/deprecate-kernel\s+${kernelId}`,
      'i'
    );
    return deprecatePattern.test(issue.body || '');
  }

  // ========================================================================
  // Kernel違反検出
  // ========================================================================

  private detectViolations(
    kernel: KernelWithNRVV,
    issueBody: string
  ): KernelViolation[] {
    const violations: KernelViolation[] = [];

    // HTTPS Kernel例
    if (kernel.statement.match(/HTTPS/i)) {
      const httpPattern = /http:\/\/[^\s]+/gi;
      const httpMatches = issueBody.match(httpPattern);
      if (httpMatches) {
        violations.push({
          id: this.generateViolationId(),
          kernelId: kernel.id,
          violationType: 'contradiction',
          detectedIn: httpMatches[0],
          description: `HTTP usage detected, violates Kernel ${kernel.id}: "${kernel.statement}"`,
          severity: 'critical',
          detectedAt: new Date().toISOString(),
        });
      }
    }

    return violations;
  }

  private generateViolationId(): string {
    const random = Math.floor(Math.random() * 1000)
      .toString()
      .padStart(3, '0');
    return `VIO-${random}`;
  }

  // ========================================================================
  // コメント生成
  // ========================================================================

  private buildKernelSuggestionComment(kernelIds: string[]): string {
    const kernelList = kernelIds.map((id) => `- **${id}**`).join('\n');

    return `📋 **Kernel 提案: ${kernelIds.length}件**

以下の Kernel が提案され、中央レジストリ（kernels.yaml）に保存されました:

${kernelList}

**次のステップ**:
1. Kernelの詳細を確認: \`kernels.yaml\`
2. NRVV (Needs-Requirements-Verification-Validation) を追加
3. \`/approve-kernel ${kernelIds[0]}\` でKernelを承認

**Label Applied**: \`Maturity:Draft\`

---
*Automated by SSOTAgentV2 with Kernel Registry*`;
  }

  private buildMaturityTransitionComment(
    kernel: KernelWithNRVV,
    from: MaturityLevel,
    to: MaturityLevel
  ): string {
    return `🔄 **Maturity Transition: ${kernel.id}**

**Kernel**: "${kernel.statement}"

**Transition**: ${this.capitalizeFirst(from)} → ${this.capitalizeFirst(to)}

**Label Applied**: \`Maturity:${this.capitalizeFirst(to)}\`

---
*Automated by SSOTAgentV2*`;
  }

  private buildNRVVValidationComment(
    kernel: KernelWithNRVV,
    validation: any
  ): string {
    let comment = `🔍 **NRVV Validation: ${kernel.id}**\n\n`;
    comment += `**Kernel**: "${kernel.statement}"\n\n`;

    comment += `**Status**:\n`;
    comment += `- Valid: ${validation.isValid ? '✓' : '✗'}\n`;
    comment += `- Traceability Complete: ${validation.traceabilityComplete ? '✓' : '✗'}\n\n`;

    if (validation.errors.length > 0) {
      comment += `**Errors**:\n`;
      for (const error of validation.errors) {
        comment += `- ${error}\n`;
      }
      comment += `\n`;
    }

    if (validation.warnings.length > 0) {
      comment += `**Warnings**:\n`;
      for (const warning of validation.warnings) {
        comment += `- ${warning}\n`;
      }
      comment += `\n`;
    }

    if (validation.missingLinks && validation.missingLinks.length > 0) {
      comment += `**Missing Traceability Links**:\n`;
      for (const link of validation.missingLinks) {
        comment += `- ${link.from} → ${link.to} (${link.type})\n`;
      }
      comment += `\n`;
    }

    comment += `**Required Action**: Complete NRVV traceability in \`kernels.yaml\`\n\n`;
    comment += `---\n*Automated by SSOTAgentV2*`;

    return comment;
  }

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
*Automated by SSOTAgentV2*`;
  }

  private buildConvergenceComment(kernel: KernelWithNRVV): string {
    return `✅ **Convergence Achieved: ${kernel.id}**

**Kernel**: "${kernel.statement}"

**Convergence Status**:
- ✅ No unresolved violations
- ✅ NRVV traceability complete
- ✅ No missing links

すべての要素がKernelに収束しています。

**Label Applied**: \`Convergent\`

---
*Automated by SSOTAgentV2*`;
  }

  private capitalizeFirst(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }
}
