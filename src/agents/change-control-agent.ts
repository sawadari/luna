/**
 * ChangeControlAgent - Formal Change Management for Frozen/Agreed Kernels
 */

import { Octokit } from '@octokit/rest';
import * as yaml from 'yaml';
import {
  GitHubIssue,
  AgentConfig,
  AgentResult,
  SSOTData,
  ChangeRequest,
  ChangeApproval,
  Kernel,
} from '../types';

interface ChangeControlResult {
  issueNumber: number;
  detectedChangeRequests: ChangeRequest[];
  approvals: ChangeApproval[];
  approvedChanges: ChangeApproval[]; // Alias for backward compatibility
  rejections: ChangeApproval[];
  rejectedChanges: ChangeApproval[]; // Alias for backward compatibility
  executedChanges: Kernel[];
  comments: string[];
  labels: string[];
}

export class ChangeControlAgent {
  private octokit: Octokit;
  private config: AgentConfig;

  constructor(config: AgentConfig) {
    this.config = config;
    this.octokit = new Octokit({ auth: config.githubToken });
  }

  private log(message: string): void {
    if (this.config.verbose) {
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] [ChangeControlAgent] ${message}`);
    }
  }

  /**
   * メイン実行
   */
  async execute(issueNumber: number): Promise<AgentResult<ChangeControlResult>> {
    this.log(`✅ Change Control starting for issue #${issueNumber}`);

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

    const result: ChangeControlResult = {
      issueNumber,
      detectedChangeRequests: [],
      approvals: [],
      approvedChanges: [],
      rejections: [],
      rejectedChanges: [],
      executedChanges: [],
      comments: [],
      labels: [],
    };

    // 3. Change Request検出
    if (ssotData?.kernels) {
      const frozenOrAgreedKernels = ssotData.kernels.filter(
        (k) => k.maturity === 'frozen' || k.maturity === 'agreed'
      );

      for (const kernel of frozenOrAgreedKernels) {
        const changeRequest = await this.detectChangeRequest(githubIssue, kernel);
        if (changeRequest) {
          result.detectedChangeRequests.push(changeRequest);
          result.comments.push(this.buildChangeRequestComment(changeRequest, kernel));
          this.log(`Change request detected: ${changeRequest.id}`);
        }
      }
    }

    // 4. 承認コマンド検出
    const approvalCommands = this.extractApprovalCommands(githubIssue.body);
    if (approvalCommands.length > 0 && ssotData?.changeRequests) {
      for (const cmd of approvalCommands) {
        const changeRequest = ssotData.changeRequests.find((c) => c.id === cmd.changeRequestId);
        if (changeRequest) {
          const approval = this.createApproval(
            changeRequest,
            cmd.approver,
            cmd.decision,
            cmd.comments,
            cmd.conditions
          );

          if (cmd.decision === 'approved') {
            result.approvedChanges.push(approval);
            result.approvals.push(approval);

            // 変更実行
            const kernel = ssotData.kernels?.find((k) => k.id === changeRequest.kernelId);
            if (kernel) {
              const updatedKernel = await this.executeChange(changeRequest, kernel);
              result.executedChanges.push(updatedKernel);
              result.comments.push(this.buildApprovalComment(approval, changeRequest));
            }
          } else {
            result.rejectedChanges.push(approval);
            result.rejections.push(approval);
            result.comments.push(this.buildRejectionComment(approval, changeRequest));
          }

          this.log(`Change request ${cmd.decision}: ${changeRequest.id}`);
        }
      }
    }

    // 5. SSOT Data更新
    if (
      result.detectedChangeRequests.length > 0 ||
      result.approvedChanges.length > 0 ||
      result.executedChanges.length > 0
    ) {
      const updatedSSOTData = this.updateSSOTData(ssotData, result);
      const updatedBody = this.embedSSOTData(githubIssue.body, updatedSSOTData);

      if (!this.config.dryRun) {
        await this.octokit.issues.update({
          owner,
          repo,
          issue_number: issueNumber,
          body: updatedBody,
        });
        this.log('Issue body updated with Change Control data');
      }
    }

    // 6. コメント投稿
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

    // 7. Label適用
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
      message: `Change Control processed: ${result.detectedChangeRequests.length} requests, ${result.approvedChanges.length} approved`,
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
   * SSOT Data更新
   */
  private updateSSOTData(ssotData: SSOTData | null, result: ChangeControlResult): SSOTData {
    const updated: SSOTData = ssotData || {
      lastUpdatedAt: new Date().toISOString(),
      lastUpdatedBy: 'ChangeControlAgent',
    };

    // Change Requests追加
    if (result.detectedChangeRequests.length > 0) {
      updated.changeRequests = [
        ...(updated.changeRequests || []),
        ...result.detectedChangeRequests,
      ];
    }

    // Change Approvals追加
    if (result.approvedChanges.length > 0 || result.rejectedChanges.length > 0) {
      updated.changeApprovals = [
        ...(updated.changeApprovals || []),
        ...result.approvedChanges,
        ...result.rejectedChanges,
      ];
    }

    // Kernels更新（変更実行）
    if (result.executedChanges.length > 0) {
      for (const executedKernel of result.executedChanges) {
        const index = updated.kernels?.findIndex((k) => k.id === executedKernel.id);
        if (index !== undefined && index !== -1 && updated.kernels) {
          updated.kernels[index] = executedKernel;
        }
      }
    }

    updated.lastUpdatedAt = new Date().toISOString();
    updated.lastUpdatedBy = 'ChangeControlAgent';

    return updated;
  }

  // ========================================================================
  // Change Request検出
  // ========================================================================

  /**
   * Change Requestを検出
   */
  private async detectChangeRequest(
    issue: GitHubIssue,
    kernel: Kernel
  ): Promise<ChangeRequest | null> {
    // Frozen Kernelへの変更意図を検出
    if (kernel.maturity === 'frozen' || kernel.maturity === 'agreed') {
      const changeIntent = this.detectChangeIntent(issue.body, kernel, issue.title);

      if (changeIntent) {
        const impact = this.analyzeImpact(changeIntent, kernel);

        return {
          id: this.generateChangeRequestId(),
          kernelId: kernel.id,
          changeType: changeIntent.type,
          proposedChange: changeIntent.description,
          rationale: changeIntent.reason,
          requestedBy: 'TechLead', // Default
          requestedAt: new Date().toISOString(),
          impact,
          affectedComponents: changeIntent.affectedComponents,
        };
      }
    }

    return null;
  }

  /**
   * 変更意図を検出
   */
  private detectChangeIntent(
    body: string,
    kernel: Kernel,
    title?: string
  ): {
    type: 'update' | 'deprecate' | 'freeze' | 'unfreeze';
    description: string;
    reason: string;
    affectedComponents: string[];
  } | null {
    const fullText = `${title || ''} ${body}`;

    // キーワードとkernel statementの関連性を抽出
    const statementKeywords = this.extractKeywords(kernel.statement);
    const hasRelevantKeywords = statementKeywords.some(kw =>
      fullText.toLowerCase().includes(kw.toLowerCase())
    );

    // Update検出（change/update/modifyキーワードと関連性）
    const updatePattern = /\b(update|modify|change)\b/i;
    if (updatePattern.test(fullText) && hasRelevantKeywords) {
      return {
        type: 'update',
        description: 'Kernel update proposed',
        reason: this.extractReason(body),
        affectedComponents: this.extractAffectedComponents(body),
      };
    }

    // Deprecate検出（deprecate/retireキーワードと関連性）
    const deprecatePattern = /\b(deprecate|retire)\b/i;
    if (deprecatePattern.test(fullText) && hasRelevantKeywords) {
      return {
        type: 'deprecate',
        description: 'Kernel deprecation proposed',
        reason: this.extractReason(body),
        affectedComponents: this.extractAffectedComponents(body),
      };
    }

    // Freeze検出
    if (/\/freeze-kernel/i.test(body)) {
      return {
        type: 'freeze',
        description: 'Kernel freeze proposed',
        reason: this.extractReason(body),
        affectedComponents: [],
      };
    }

    // Unfreeze検出
    if (/\/unfreeze-kernel/i.test(body)) {
      return {
        type: 'unfreeze',
        description: 'Kernel unfreeze proposed',
        reason: this.extractReason(body),
        affectedComponents: [],
      };
    }

    return null;
  }

  /**
   * 理由を抽出
   */
  private extractReason(body: string): string {
    const reasonPattern = /Reason:\s*(.+?)(?:\n|$)/i;
    const match = body.match(reasonPattern);
    return match ? match[1].trim() : 'No reason provided';
  }

  /**
   * 影響を受けるコンポーネントを抽出
   */
  private extractAffectedComponents(body: string): string[] {
    const components: string[] = [];
    const pattern = /Affected:\s*(.+?)(?:\n|$)/i;
    const match = body.match(pattern);

    if (match) {
      const componentStr = match[1];
      components.push(...componentStr.split(',').map((c) => c.trim()));
    }

    return components;
  }

  /**
   * Statementから重要なキーワードを抽出
   */
  private extractKeywords(statement: string): string[] {
    // 一般的なストップワードを除外
    const stopWords = new Set(['the', 'is', 'are', 'a', 'an', 'to', 'for', 'of', 'in', 'on', 'at', 'by', 'with']);

    // 単語に分割し、ストップワードと短い単語を除外
    const words = statement
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length >= 3 && !stopWords.has(word));

    return words;
  }

  /**
   * Impact分析
   */
  private analyzeImpact(
    changeIntent: { type: string; affectedComponents: string[] },
    kernel: Kernel
  ): 'breaking' | 'major' | 'minor' | 'patch' {
    // Deprecateは常にBreaking
    if (changeIntent.type === 'deprecate') {
      return 'breaking';
    }

    // Freeze/Unfreezeは Major
    if (changeIntent.type === 'freeze' || changeIntent.type === 'unfreeze') {
      return 'major';
    }

    // Affected Components数でImpact判定
    if (changeIntent.affectedComponents.length > 10) {
      return 'breaking';
    } else if (changeIntent.affectedComponents.length > 5) {
      return 'major';
    } else if (changeIntent.affectedComponents.length > 2) {
      return 'minor';
    }

    // Kernel Categoryで判定
    if (kernel.category === 'interface' || kernel.category === 'architecture') {
      return 'major';
    }

    return 'patch';
  }

  /**
   * Change Request ID生成
   */
  private generateChangeRequestId(): string {
    const random = Math.floor(Math.random() * 1000)
      .toString()
      .padStart(3, '0');
    return `CHG-${random}`;
  }

  // ========================================================================
  // 承認処理
  // ========================================================================

  /**
   * 承認コマンドを抽出
   */
  private extractApprovalCommands(
    body: string
  ): Array<{
    changeRequestId: string;
    approver: string;
    decision: 'approved' | 'rejected' | 'conditional';
    comments: string;
    conditions?: string[];
  }> {
    const commands: Array<{
      changeRequestId: string;
      approver: string;
      decision: 'approved' | 'rejected' | 'conditional';
      comments: string;
      conditions?: string[];
    }> = [];

    // Approve検出
    const approvePattern = /\/approve\s+(CHG-\d{3})/gi;
    const approveMatches = body.matchAll(approvePattern);

    for (const match of approveMatches) {
      commands.push({
        changeRequestId: match[1],
        approver: 'Guardian', // Default
        decision: 'approved',
        comments: 'Approved',
      });
    }

    // Reject検出
    const rejectPattern = /\/reject\s+(CHG-\d{3})/gi;
    const rejectMatches = body.matchAll(rejectPattern);

    for (const match of rejectMatches) {
      commands.push({
        changeRequestId: match[1],
        approver: 'Guardian',
        decision: 'rejected',
        comments: 'Rejected',
      });
    }

    return commands;
  }

  /**
   * Approvalを作成
   */
  private createApproval(
    changeRequest: ChangeRequest,
    approver: string,
    decision: 'approved' | 'rejected' | 'conditional',
    comments: string,
    conditions?: string[]
  ): ChangeApproval {
    return {
      id: this.generateApprovalId(),
      changeRequestId: changeRequest.id,
      approver,
      decision,
      conditions,
      comments,
      approvedAt: new Date().toISOString(),
    };
  }

  /**
   * Approval ID生成
   */
  private generateApprovalId(): string {
    const random = Math.floor(Math.random() * 1000)
      .toString()
      .padStart(3, '0');
    return `APR-${random}`;
  }

  /**
   * 変更実行
   */
  private async executeChange(changeRequest: ChangeRequest, kernel: Kernel): Promise<Kernel> {
    const updatedKernel = { ...kernel };

    switch (changeRequest.changeType) {
      case 'update':
        updatedKernel.statement = changeRequest.proposedChange;
        updatedKernel.lastUpdatedAt = new Date().toISOString();
        break;

      case 'deprecate':
        updatedKernel.maturity = 'deprecated';
        updatedKernel.deprecatedReason = changeRequest.rationale;
        break;

      case 'freeze':
        updatedKernel.maturity = 'frozen';
        updatedKernel.frozenAt = new Date().toISOString();
        break;

      case 'unfreeze':
        updatedKernel.maturity = 'agreed';
        break;
    }

    return updatedKernel;
  }

  // ========================================================================
  // コメント生成
  // ========================================================================

  /**
   * Change Request作成コメント
   */
  private buildChangeRequestComment(changeRequest: ChangeRequest, kernel: Kernel): string {
    return `📋 **Change Request: ${changeRequest.id}**

**Kernel**: ${kernel.id} - "${kernel.statement}"
**Change Type**: ${this.capitalizeFirst(changeRequest.changeType)}
**Proposed Change**: ${changeRequest.proposedChange}

**Rationale**:
${changeRequest.rationale}

**Impact Analysis**:
- **Impact Level**: ${this.capitalizeFirst(changeRequest.impact)}
- **Affected Components**: ${changeRequest.affectedComponents.join(', ') || 'None'}

**Approval Required**: @${this.getRequiredApprover(changeRequest.impact)}

Use \`/approve ${changeRequest.id}\` or \`/reject ${changeRequest.id}\` to respond.

---
*Automated by ChangeControlAgent*`;
  }

  /**
   * 承認コメント
   */
  private buildApprovalComment(approval: ChangeApproval, changeRequest: ChangeRequest): string {
    return `✅ **Change Approved: ${changeRequest.id}**

**Approver**: @${approval.approver}
**Decision**: ${this.capitalizeFirst(approval.decision)}
**Approved At**: ${approval.approvedAt}

**Comments**: ${approval.comments}

**Change Executed**: Kernel updated with new change.

---
*Automated by ChangeControlAgent*`;
  }

  /**
   * 却下コメント
   */
  private buildRejectionComment(approval: ChangeApproval, changeRequest: ChangeRequest): string {
    return `❌ **Change Rejected: ${changeRequest.id}**

**Approver**: @${approval.approver}
**Decision**: Rejected
**Rejected At**: ${approval.approvedAt}

**Reason**: ${approval.comments}

---
*Automated by ChangeControlAgent*`;
  }

  /**
   * 必要な承認者を取得
   */
  private getRequiredApprover(impact: string): string {
    switch (impact) {
      case 'breaking':
        return 'Guardian';
      case 'major':
        return 'TechLead';
      default:
        return 'KernelOwner';
    }
  }

  /**
   * 文字列の最初を大文字に
   */
  private capitalizeFirst(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }
}
