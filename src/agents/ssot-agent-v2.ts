/**
 * SSOTAgent V2 - with Kernel Registry Integration
 */

import { Octokit } from '@octokit/rest';
import Anthropic from '@anthropic-ai/sdk';
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
import { KernelRuntime } from '../ssot/kernel-runtime';
import { CreateKernelOperation, SetStateOperation } from '../types/kernel-operations';

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
  private kernelRuntime: KernelRuntime;
  private anthropic?: Anthropic;

  constructor(config: AgentConfig, registryPath?: string) {
    this.config = config;
    this.octokit = new Octokit({ auth: config.githubToken });
    this.kernelRegistry = new KernelRegistryService(registryPath);

    // Initialize KernelRuntime (Issue #43: Phase A1 compliance)
    this.kernelRuntime = new KernelRuntime({
      registryPath,
      enableLedger: true,
      soloMode: true,
      defaultActor: 'SSOTAgentV2',
      dryRun: config.dryRun,
      verbose: config.verbose,
    });

    // ✨ Phase 2: Optional Anthropic initialization (Issue #32)
    if (config.anthropicApiKey) {
      this.anthropic = new Anthropic({ apiKey: config.anthropicApiKey });
      this.log('Anthropic API initialized for NRVV extraction');
    }
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
  async execute(
    issueNumber: number,
    context?: {
      destJudgment?: import('../types').DESTJudgmentResult;
      planningData?: any;
    }
  ): Promise<AgentResult<SSOTResult>> {
    this.log(`✅ SSOT Agent V2 starting for issue #${issueNumber}`);
    if (context?.destJudgment) {
      this.log(`  DEST Judgment: AL=${context.destJudgment.al}`);
    }
    if (context?.planningData) {
      this.log(`  Planning Data available: ${context.planningData.opportunity ? 'with opportunity' : 'no opportunity'}`);
    }

    // For backward compatibility
    const planningData = context?.planningData;

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
      // First try to use planningData passed as argument
      let planningDataToUse = planningData;

      // If not provided, try to parse from Issue body
      if (!planningDataToUse) {
        planningDataToUse = this.parsePlanningData(githubIssue.body || '');
      }

      if (planningDataToUse) {
        const kernelsFromPlanning = await this.suggestKernelsFromDecisions(
          planningDataToUse,
          githubIssue
        );
        result.suggestedKernels.push(...kernelsFromPlanning);

        // If DecisionRecord exists, automatically convert it to Kernel
        if (planningDataToUse.decisionRecord) {
          this.log('  DecisionRecord found - converting to Kernel');
          const kernelFromDecision = await this.convertDecisionToKernel(
            planningDataToUse.decisionRecord,
            planningDataToUse.opportunity,
            githubIssue,
            context?.destJudgment
          );
          result.suggestedKernels.push(kernelFromDecision.id);
        }
      }

      // ✨ NEW (Issue #32): Planning Dataがない場合のフォールバック
      // Phase 2: AI-powered extraction with template fallback
      if (!planningDataToUse || result.suggestedKernels.length === 0) {
        this.log('  No Planning Data found - extracting NRVV from Issue directly');

        const kernelFromIssue = await this.extractNRVVFromIssueAI(githubIssue);

        // Issue #43: Use KernelRuntime.apply() instead of direct saveKernel()
        const createOp: CreateKernelOperation = {
          op: 'u.create_kernel',
          actor: 'SSOTAgentV2',
          issue: issueNumber.toString(),
          payload: {
            kernel_id: kernelFromIssue.id,
            statement: kernelFromIssue.statement,
            category: kernelFromIssue.category,
            owner: kernelFromIssue.owner,
            maturity: kernelFromIssue.maturity,
            sourceIssue: kernelFromIssue.sourceIssue,
            needs: kernelFromIssue.needs as any,
            requirements: kernelFromIssue.requirements as any,
            verification: kernelFromIssue.verification as any,
            validation: kernelFromIssue.validation as any,
            tags: kernelFromIssue.tags,
            relatedArtifacts: kernelFromIssue.relatedArtifacts,
          },
        };
        await this.kernelRuntime.apply(createOp);

        result.suggestedKernels.push(kernelFromIssue.id);

        const method = this.anthropic ? 'AI-extracted' : 'template-based';
        this.log(`  Kernel ${kernelFromIssue.id} created from Issue (${method})`);
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

        // Issue #43: Use KernelRuntime.apply() for state transitions
        const setStateOp: SetStateOperation = {
          op: 'u.set_state',
          actor: transition.approvedBy || (transition as any).freezedBy || 'SSOTAgentV2',
          issue: issueNumber.toString(),
          payload: {
            kernel_id: kernel.id,
            from: transition.from,
            to: transition.to,
            reason: `Maturity transition via Issue #${issueNumber}`,
          },
        };
        await this.kernelRuntime.apply(setStateOp);

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

            // Issue #43: Use KernelRuntime.apply() instead of direct saveKernel()
            const createOp: CreateKernelOperation = {
              op: 'u.create_kernel',
              actor: decision.decided_by || decision.owner || 'SSOTAgentV2',
              issue: issue.number.toString(),
              payload: {
                kernel_id: kernel.id,
                statement: kernel.statement,
                category: kernel.category,
                owner: kernel.owner,
                maturity: kernel.maturity,
                sourceIssue: kernel.sourceIssue,
                needs: kernel.needs as any,
                requirements: kernel.requirements as any,
                verification: kernel.verification as any,
                validation: kernel.validation as any,
                tags: kernel.tags,
                relatedArtifacts: kernel.relatedArtifacts,
              },
            };
            await this.kernelRuntime.apply(createOp);
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

  /**
   * Convert DecisionRecord to Kernel
   */
  private async convertDecisionToKernel(
    decision: any,
    opportunity: any,
    issue: GitHubIssue,
    destJudgment?: import('../types').DESTJudgmentResult
  ): Promise<KernelWithNRVV> {
    const kernelId = this.generateKernelId();

    // Extract statement from decision
    const statement = decision.rationale || opportunity?.title || issue.title;

    // Create Kernel
    const kernel: KernelWithNRVV = {
      id: kernelId,
      statement,
      category: 'requirement',
      owner: decision.decidedBy || 'TechLead',
      maturity: 'draft',
      createdAt: new Date().toISOString(),
      lastUpdatedAt: new Date().toISOString(),
      sourceIssue: `#${issue.number}`,
      sourceDecisionRecord: decision.id,
      // ✨ NEW: DEST Judgment Integration (Phase 0)
      linked_dest_judgment: destJudgment?.judgmentId,
      assurance_level: destJudgment?.al,
      needs: opportunity
        ? [
            {
              id: `NEED-${kernelId}`,
              statement: opportunity.problem || 'Requirement not defined',
              stakeholder: 'ProductOwner',
              sourceType: 'business_requirement' as any,
              priority: 'high' as any,
              traceability: {
                upstream: [],
                downstream: [`REQ-${kernelId}`],
              },
            },
          ]
        : [],
      requirements: [
        {
          id: `REQ-${kernelId}`,
          statement: statement,
          type: 'functional',
          priority: 'must',
          rationale: decision.rationale || 'Decision from Planning Layer',
          traceability: {
            upstream: opportunity ? [`NEED-${kernelId}`] : [],
            downstream: [],
          },
        },
      ],
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
      tags: ['planning-layer', 'decision'],
    };

    // Issue #43: Use KernelRuntime.apply() instead of direct saveKernel()
    const createOp: CreateKernelOperation = {
      op: 'u.create_kernel',
      actor: decision.decided_by || 'SSOTAgentV2',
      issue: issue.number.toString(),
      payload: {
        kernel_id: kernel.id,
        statement: kernel.statement,
        category: kernel.category,
        owner: kernel.owner,
        maturity: kernel.maturity,
        sourceIssue: kernel.sourceIssue,
        needs: kernel.needs as any,
        requirements: kernel.requirements as any,
        verification: kernel.verification as any,
        validation: kernel.validation as any,
        tags: kernel.tags,
        relatedArtifacts: kernel.relatedArtifacts,
      },
    };
    await this.kernelRuntime.apply(createOp);
    this.log(`  Kernel ${kernelId} created from DecisionRecord ${decision.id}`);

    return kernel;
  }

  private capitalizeFirst(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  // ========================================================================
  // Phase 1: Template-based NRVV Extraction (Issue #32)
  // ========================================================================

  /**
   * Extract NRVV from Issue body (Template-based fallback)
   * @param issue GitHub Issue
   * @returns Basic Kernel with minimal NRVV
   */
  private extractNRVVFromIssueTemplate(issue: GitHubIssue): KernelWithNRVV {
    const kernelId = this.generateKernelId();

    // Extract basic info from Issue
    const statement = issue.title;
    const category = this.inferCategoryFromIssue(issue);
    const owner = this.inferOwnerFromIssue(issue);

    // Create minimal NRVV structure
    const needId = `NEED-${kernelId}-1`;
    const reqId = `REQ-${kernelId}-1`;

    const kernel: KernelWithNRVV = {
      id: kernelId,
      statement,
      category,
      owner,
      maturity: 'draft',
      createdAt: new Date().toISOString(),
      lastUpdatedAt: new Date().toISOString(),
      sourceIssue: `#${issue.number}`,

      // Template-based NRVV
      needs: [
        {
          id: needId,
          statement: `User need derived from: ${issue.title}`,
          stakeholder: 'ProductOwner',
          sourceType: 'stakeholder_requirement',
          priority: 'high',
          traceability: {
            upstream: [],
            downstream: [reqId],
          },
        },
      ],

      requirements: [
        {
          id: reqId,
          statement: issue.title,
          type: 'functional',
          priority: 'must',
          rationale: `Derived from Issue #${issue.number}`,
          traceability: {
            upstream: [needId],
            downstream: [],
          },
        },
      ],

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

      tags: ['auto-generated', 'template-based'],
    };

    return kernel;
  }

  /**
   * Infer category from Issue labels and content
   */
  private inferCategoryFromIssue(issue: GitHubIssue): import('../types/nrvv').KernelCategory {
    const text = `${issue.title} ${issue.body || ''}`.toLowerCase();
    const labels = issue.labels.map((l) => l.name.toLowerCase());

    if (labels.includes('security') || text.includes('security')) return 'security';
    if (labels.includes('architecture') || text.includes('architecture'))
      return 'architecture';
    if (labels.includes('quality') || text.includes('quality')) return 'quality';
    if (labels.includes('interface') || text.includes('api')) return 'interface';
    if (labels.includes('constraint')) return 'constraint';

    return 'requirement'; // default
  }

  /**
   * Infer owner from Issue assignee or labels
   */
  private inferOwnerFromIssue(issue: GitHubIssue): string {
    const labels = issue.labels.map((l) => l.name.toLowerCase());

    if (labels.includes('security')) return 'CISO';
    if (labels.includes('architecture')) return 'TechLead';

    return 'ProductOwner'; // default
  }

  // ========================================================================
  // Phase 2: AI-powered NRVV Extraction (Issue #32)
  // ========================================================================

  /**
   * Extract NRVV from Issue using AI (Anthropic Claude)
   * @param issue GitHub Issue
   * @returns Kernel with AI-extracted NRVV
   */
  private async extractNRVVFromIssueAI(issue: GitHubIssue): Promise<KernelWithNRVV> {
    if (!this.anthropic) {
      this.log('⚠️  No Anthropic API key, falling back to template-based extraction');
      return this.extractNRVVFromIssueTemplate(issue);
    }

    this.log('🤖 Extracting NRVV using Claude Sonnet 4.5...');

    const prompt = this.buildNRVVExtractionPrompt(issue);

    try {
      const response = await this.anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      });

      const content = response.content[0];
      if (content.type === 'text') {
        const extractedNRVV = this.parseNRVVResponse(content.text, issue);
        if (extractedNRVV) {
          this.log(
            `✅ NRVV extracted: ${extractedNRVV.needs.length} needs, ${extractedNRVV.requirements.length} requirements`
          );
          return extractedNRVV;
        }
      }

      // Fallback if parsing fails
      this.log('⚠️  Failed to parse AI response, falling back to template');
      return this.extractNRVVFromIssueTemplate(issue);
    } catch (error) {
      this.log(`⚠️  Claude API error: ${(error as Error).message}`);
      return this.extractNRVVFromIssueTemplate(issue);
    }
  }

  /**
   * Build prompt for NRVV extraction
   */
  private buildNRVVExtractionPrompt(issue: GitHubIssue): string {
    return `# NRVV Extraction from GitHub Issue

## Your Task
Extract structured NRVV (Needs-Requirements-Verification-Validation) traceability from the following Issue.

## Issue Information
**Title**: ${issue.title}
**Number**: #${issue.number}
**Labels**: ${issue.labels.map((l) => l.name).join(', ')}

**Body**:
${issue.body || 'No description provided'}

## NRVV Framework

### Needs (N)
- Stakeholder-level requirements
- Business value and rationale
- Format: NEED-XXXX

### Requirements (R)
- Functional and non-functional requirements
- Acceptance criteria
- Format: REQ-XXXX

### Verification (V)
- How to test/validate requirements
- Test strategies and criteria

### Validation (V)
- End-user validation
- Business value confirmation

## Output Format (JSON)

Please respond ONLY with a valid JSON object in this exact format:

\`\`\`json
{
  "kernel": {
    "statement": "Brief statement of the Kernel",
    "category": "requirement|security|architecture|quality|interface|constraint",
    "owner": "ProductOwner|TechLead|CISO"
  },
  "needs": [
    {
      "statement": "User need description",
      "stakeholder": "ProductOwner|TechLead|CISO|Customer|EndUser",
      "sourceType": "stakeholder_requirement|business_requirement|regulatory_requirement",
      "priority": "critical|high|medium|low",
      "rationale": "Why this need exists"
    }
  ],
  "requirements": [
    {
      "statement": "Specific requirement",
      "type": "functional|non-functional|security|performance",
      "priority": "must|should|could|wont",
      "rationale": "Why this requirement is needed",
      "acceptanceCriteria": ["Criterion 1", "Criterion 2"]
    }
  ],
  "verification": [
    {
      "statement": "How to verify this requirement",
      "method": "test|analysis|inspection|demonstration",
      "testCase": "Description of test approach",
      "criteria": ["Pass criterion 1", "Pass criterion 2"]
    }
  ],
  "validation": [
    {
      "statement": "How to validate with end users",
      "method": "acceptance_test|user_trial|field_test|audit",
      "criteria": ["Success indicator 1", "Success indicator 2"]
    }
  ]
}
\`\`\`

**Important**:
- Extract 1-3 Needs (high-level stakeholder requirements)
- Extract 2-5 Requirements (specific technical/functional requirements)
- Verification and Validation can be empty initially (will be filled during implementation)
- Ensure traceability: Needs → Requirements → Verification/Validation
- Use clear, actionable language

Generate the JSON now:`;
  }

  /**
   * Parse NRVV from AI response
   */
  private parseNRVVResponse(response: string, issue: GitHubIssue): KernelWithNRVV | null {
    try {
      // Extract JSON from markdown code blocks
      const jsonMatch =
        response.match(/```json\n([\s\S]*?)\n```/) ||
        response.match(/```\n([\s\S]*?)\n```/) ||
        [null, response];

      const jsonText = jsonMatch[1] || response;
      const parsed = JSON.parse(jsonText);

      // Validate structure
      if (!parsed.kernel || !parsed.needs || !parsed.requirements) {
        throw new Error('Invalid NRVV structure');
      }

      const kernelId = this.generateKernelId();

      // Generate IDs and build traceability
      const needIds: string[] = [];
      const reqIds: string[] = [];

      const needs = parsed.needs.map((n: any, idx: number) => {
        const needId = `NEED-${kernelId}-${idx + 1}`;
        needIds.push(needId);

        return {
          id: needId,
          statement: n.statement,
          stakeholder: n.stakeholder || 'ProductOwner',
          sourceType: n.sourceType || 'stakeholder_requirement',
          priority: n.priority || 'high',
          rationale: n.rationale,
          traceability: {
            upstream: [],
            downstream: [], // Will be filled below
          },
        };
      });

      const requirements = parsed.requirements.map((r: any, idx: number) => {
        const reqId = `REQ-${kernelId}-${idx + 1}`;
        reqIds.push(reqId);

        return {
          id: reqId,
          statement: r.statement,
          type: r.type || 'functional',
          priority: r.priority || 'must',
          rationale: r.rationale || `Derived from Issue #${issue.number}`,
          acceptanceCriteria: r.acceptanceCriteria || [],
          traceability: {
            upstream: needIds, // Link to all needs
            downstream: [],
          },
        };
      });

      // Update Need downstream links
      needs.forEach((need: any) => {
        need.traceability.downstream = reqIds;
      });

      const verification = (parsed.verification || []).map((v: any, idx: number) => ({
        id: `VER-${kernelId}-${idx + 1}`,
        statement: v.statement,
        method: v.method || 'test',
        testCase: v.testCase,
        criteria: v.criteria || [],
        status: 'not_started' as const,
        traceability: {
          upstream: reqIds,
          downstream: [],
        },
      }));

      const validation = (parsed.validation || []).map((v: any, idx: number) => ({
        id: `VAL-${kernelId}-${idx + 1}`,
        statement: v.statement,
        method: v.method || 'acceptance_test',
        criteria: v.criteria || [],
        status: 'not_started' as const,
        traceability: {
          upstream: reqIds,
          downstream: [],
        },
      }));

      const kernel: KernelWithNRVV = {
        id: kernelId,
        statement: parsed.kernel.statement,
        category: parsed.kernel.category || 'requirement',
        owner: parsed.kernel.owner || 'ProductOwner',
        maturity: 'draft',
        createdAt: new Date().toISOString(),
        lastUpdatedAt: new Date().toISOString(),
        sourceIssue: `#${issue.number}`,

        needs,
        requirements,
        verification,
        validation,

        history: [
          {
            timestamp: new Date().toISOString(),
            action: 'created',
            by: 'SSOTAgentV2',
            maturity: 'draft',
            notes: 'AI-extracted NRVV from Issue',
          },
        ],

        tags: ['auto-generated', 'ai-extracted'],
      };

      return kernel;
    } catch (error) {
      this.log(`❌ Failed to parse NRVV response: ${(error as Error).message}`);
      return null;
    }
  }
}
