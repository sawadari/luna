/**
 * ExceptionRegistryAgent - Exception & Timeout Management
 */

import { Octokit } from '@octokit/rest';
import * as yaml from 'yaml';
import {
  GitHubIssue,
  AgentConfig,
  AgentResult,
  SSOTData,
  Exception,
  ExceptionStatus,
} from '../types';

interface ExceptionRegistryResult {
  issueNumber: number;
  createdExceptions: Exception[];
  expiredExceptions: Exception[];
  extendedExceptions: Exception[];
  comments: string[];
  labels: string[];
}

export class ExceptionRegistryAgent {
  private octokit: Octokit;
  private config: AgentConfig;

  constructor(config: AgentConfig) {
    this.config = config;
    this.octokit = new Octokit({ auth: config.githubToken });
  }

  private log(message: string): void {
    if (this.config.verbose) {
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] [ExceptionRegistryAgent] ${message}`);
    }
  }

  /**
   * メイン実行
   */
  async execute(issueNumber: number): Promise<AgentResult<ExceptionRegistryResult>> {
    this.log(`✅ Exception Registry starting for issue #${issueNumber}`);

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

    const result: ExceptionRegistryResult = {
      issueNumber,
      createdExceptions: [],
      expiredExceptions: [],
      extendedExceptions: [],
      comments: [],
      labels: [],
    };

    // 3. Exception申請検出
    const requestCommands = this.extractRequestCommands(githubIssue.body);
    if (requestCommands.length > 0) {
      for (const cmd of requestCommands) {
        const exception = this.createException(
          cmd.kernelId,
          cmd.reason,
          cmd.duration,
          cmd.convergencePlan,
          cmd.requestedBy,
          cmd.relatedIssues
        );

        result.createdExceptions.push(exception);
        result.comments.push(this.buildRequestComment(exception));
        result.labels.push('Exception:Active');

        this.log(`Exception created: ${exception.id}`);
      }
    }

    // 4. 延長コマンド検出（期限切れ検出の前に処理）
    const extendCommands = this.extractExtendCommands(githubIssue.body);
    const extendedExceptionIds = new Set<string>();
    if (extendCommands.length > 0 && ssotData?.exceptions) {
      for (const cmd of extendCommands) {
        const exception = ssotData.exceptions.find((e) => e.id === cmd.exceptionId);
        if (exception && exception.status === 'active') {
          const extended = this.extendException(
            exception,
            cmd.newExpiryDate,
            cmd.reason,
            cmd.approver
          );

          // 元のexceptionオブジェクトも更新して、後の期限切れ検出でスキップされるようにする
          exception.expiresAt = cmd.newExpiryDate;
          exception.extendedAt = extended.extendedAt;
          exception.extendedReason = extended.extendedReason;

          result.extendedExceptions.push(extended);
          result.comments.push(this.buildExtensionComment(extended));
          extendedExceptionIds.add(exception.id);

          this.log(`Exception extended: ${extended.id}`);
        }
      }
    }

    // 5. 期限切れ検出（延長されたexceptionは除外）
    if (ssotData?.exceptions) {
      const expiredExceptions = this.detectExpiredExceptions(ssotData.exceptions).filter(
        (e) => !extendedExceptionIds.has(e.id)
      );
      if (expiredExceptions.length > 0) {
        result.expiredExceptions = expiredExceptions;

        for (const expired of expiredExceptions) {
          result.comments.push(this.buildExpirationComment(expired, ssotData));
          result.labels.push('Exception:Expired');

          this.log(`Exception expired: ${expired.id}`);
        }
      }
    }

    // 6. SSOT Data更新
    if (
      result.createdExceptions.length > 0 ||
      result.expiredExceptions.length > 0 ||
      result.extendedExceptions.length > 0
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
        this.log('Issue body updated with Exception data');
      }
    }

    // 7. コメント投稿
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

    // 8. Label適用
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
      message: `Exception Registry processed: ${result.createdExceptions.length} created, ${result.expiredExceptions.length} expired, ${result.extendedExceptions.length} extended`,
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
  private updateSSOTData(
    ssotData: SSOTData | null,
    result: ExceptionRegistryResult
  ): SSOTData {
    const updated: SSOTData = ssotData || {
      lastUpdatedAt: new Date().toISOString(),
      lastUpdatedBy: 'ExceptionRegistryAgent',
    };

    // Exceptions追加
    if (result.createdExceptions.length > 0) {
      updated.exceptions = [...(updated.exceptions || []), ...result.createdExceptions];
    }

    // Exceptions更新（期限切れ）
    if (result.expiredExceptions.length > 0) {
      for (const expired of result.expiredExceptions) {
        const index = updated.exceptions?.findIndex((e) => e.id === expired.id);
        if (index !== undefined && index !== -1 && updated.exceptions) {
          updated.exceptions[index] = expired;
        }
      }
    }

    // Exceptions更新（延長）
    if (result.extendedExceptions.length > 0) {
      for (const extended of result.extendedExceptions) {
        const index = updated.exceptions?.findIndex((e) => e.id === extended.id);
        if (index !== undefined && index !== -1 && updated.exceptions) {
          updated.exceptions[index] = extended;
        }
      }
    }

    updated.lastUpdatedAt = new Date().toISOString();
    updated.lastUpdatedBy = 'ExceptionRegistryAgent';

    return updated;
  }

  // ========================================================================
  // Exception作成・管理
  // ========================================================================

  /**
   * Exception申請コマンドを抽出
   */
  private extractRequestCommands(
    body: string
  ): Array<{
    kernelId: string;
    reason: string;
    duration: number;
    convergencePlan: string;
    requestedBy: string;
    relatedIssues: string[];
  }> {
    const commands: Array<{
      kernelId: string;
      reason: string;
      duration: number;
      convergencePlan: string;
      requestedBy: string;
      relatedIssues: string[];
    }> = [];

    // Pattern: /request-exception KRN-NNN
    const pattern = /\/request-exception\s+(KRN-\d{3})\s+Reason:\s*(.+?)\s+Duration:\s*(\d+)\s*days?\s+Convergence Plan:\s*(.+?)(?:\s+Related Issues:\s*(.+?))?$/gim;
    const matches = body.matchAll(pattern);

    for (const match of matches) {
      const relatedIssues = match[5]
        ? match[5]
            .split(',')
            .map((s) => s.trim())
            .filter((s) => s.startsWith('#'))
        : [];

      commands.push({
        kernelId: match[1],
        reason: match[2].trim(),
        duration: parseInt(match[3], 10),
        convergencePlan: match[4].trim(),
        requestedBy: 'TechLead', // Default (should extract from Issue author)
        relatedIssues,
      });
    }

    return commands;
  }

  /**
   * Exception作成
   */
  private createException(
    kernelId: string,
    reason: string,
    duration: number,
    convergencePlan: string,
    requestedBy: string,
    relatedIssues: string[]
  ): Exception {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + duration * 24 * 60 * 60 * 1000);

    const exception: Exception = {
      id: this.generateExceptionId(),
      kernelId,
      reason,
      requestedBy,
      approvedBy: '', // Pending approval
      status: 'active',
      approvedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      convergencePlan,
      relatedIssues,
    };

    return exception;
  }

  /**
   * Exception ID生成
   */
  private generateExceptionId(): string {
    const random = Math.floor(Math.random() * 1000)
      .toString()
      .padStart(3, '0');
    return `EXC-${random}`;
  }

  /**
   * 期限切れException検出
   */
  private detectExpiredExceptions(exceptions: Exception[]): Exception[] {
    const expiredExceptions = exceptions.filter(
      (e) => e.status === 'active' && this.isExpired(e)
    );

    for (const exception of expiredExceptions) {
      exception.status = 'expired';
      exception.expiredAt = new Date().toISOString();
    }

    return expiredExceptions;
  }

  /**
   * Exception期限チェック
   */
  private isExpired(exception: Exception): boolean {
    const now = new Date();
    const expiresAt = new Date(exception.expiresAt);
    return now > expiresAt;
  }

  /**
   * Timeout計算
   */
  private calculateTimeout(reason: string): string {
    const now = new Date();
    let days = 7; // Default

    if (reason.match(/hotfix|incident|emergency/i)) {
      days = 3;
    } else if (reason.match(/migration|phased/i)) {
      days = 14;
    } else if (reason.match(/poc|experiment|spike/i)) {
      days = 7;
    }

    const expiresAt = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
    return expiresAt.toISOString();
  }

  // ========================================================================
  // Exception延長
  // ========================================================================

  /**
   * 延長コマンドを抽出
   */
  private extractExtendCommands(
    body: string
  ): Array<{
    exceptionId: string;
    newExpiryDate: string;
    reason: string;
    approver: string;
  }> {
    const commands: Array<{
      exceptionId: string;
      newExpiryDate: string;
      reason: string;
      approver: string;
    }> = [];

    // Pattern: /extend-exception EXC-NNN (supports multiline, flexible whitespace)
    const pattern =
      /\/extend-exception\s+(EXC-\d{3})\s+Reason:\s*(.+?)\s+New Expiry:\s*(.+)/gims;
    const matches = body.matchAll(pattern);

    for (const match of matches) {
      commands.push({
        exceptionId: match[1],
        reason: match[2].trim(),
        newExpiryDate: match[3].trim(),
        approver: 'Guardian', // Default
      });
    }

    return commands;
  }

  /**
   * Exception延長
   */
  private extendException(
    exception: Exception,
    newExpiryDate: string,
    reason: string,
    approver: string
  ): Exception {
    return {
      ...exception,
      expiresAt: newExpiryDate,
      extendedAt: new Date().toISOString(),
      extendedReason: reason,
    };
  }

  // ========================================================================
  // 収束進捗チェック
  // ========================================================================

  /**
   * 収束進捗チェック
   */
  private checkConvergenceProgress(
    exception: Exception,
    ssotData: SSOTData
  ): 'on_track' | 'delayed' | 'blocked' {
    const relatedIssues = exception.relatedIssues;

    // Simplification: Assume all related issues are open (needs GitHub API call)
    const closedCount = 0; // TODO: Check actual Issue status
    const progressRate = closedCount / (relatedIssues.length || 1);

    const daysRemaining = this.getDaysRemaining(exception.expiresAt);

    if (progressRate >= 0.8) {
      return 'on_track';
    } else if (daysRemaining < 1 && progressRate < 0.5) {
      return 'blocked';
    } else {
      return 'delayed';
    }
  }

  /**
   * 残り日数計算
   */
  private getDaysRemaining(expiresAt: string): number {
    const now = new Date();
    const expires = new Date(expiresAt);
    const diff = expires.getTime() - now.getTime();
    return Math.ceil(diff / (24 * 60 * 60 * 1000));
  }

  // ========================================================================
  // コメント生成
  // ========================================================================

  /**
   * Exception申請コメント
   */
  private buildRequestComment(exception: Exception): string {
    return `📝 **Exception Request: ${exception.id}**

**Kernel**: ${exception.kernelId}
**Reason**: ${exception.reason}

**Requested By**: @${exception.requestedBy}
**Duration**: ${this.getDaysRemaining(exception.expiresAt)} days
**Expires At**: ${new Date(exception.expiresAt).toISOString().split('T')[0]} ${new Date(exception.expiresAt).toISOString().split('T')[1].substring(0, 8)}

**Convergence Plan**:
${exception.convergencePlan}

**Related Issues**: ${exception.relatedIssues.join(', ') || 'None'}

**Approval Required**: @Guardian

Use \`/approve-exception ${exception.id}\` to approve.

---
*Automated by ExceptionRegistryAgent*`;
  }

  /**
   * 期限切れアラートコメント
   */
  private buildExpirationComment(exception: Exception, ssotData: SSOTData): string {
    const convergenceStatus = this.checkConvergenceProgress(exception, ssotData);

    const statusEmoji = {
      on_track: '✅',
      delayed: '⚠️',
      blocked: '🔴',
    };

    const relatedIssuesStatus = exception.relatedIssues
      .map((issueRef) => `- ${issueRef}: 🔴 Still Open`) // Simplification
      .join('\n');

    return `🚨 **Exception Expired: ${exception.id}**

**Kernel**: ${exception.kernelId}
**Exception**: ${exception.reason}
**Expired At**: ${new Date(exception.expiresAt).toISOString().split('T')[0]} ${new Date(exception.expiresAt).toISOString().split('T')[1].substring(0, 8)}

**Convergence Status**: ${statusEmoji[convergenceStatus]} ${convergenceStatus.toUpperCase().replace('_', ' ')}

**Related Issues**:
${relatedIssuesStatus || '- None'}

**Required Actions**:
1. 🚨 **Immediate**: Converge to Kernel ${exception.kernelId}
2. Complete convergence plan
3. Close related issues

**Escalation**: @Guardian @ProductOwner

**Label Applied**: \`Exception:Expired\`

⛔ **Blocking**: Cannot proceed until convergence is complete.

---
*Automated by ExceptionRegistryAgent*`;
  }

  /**
   * 延長完了コメント
   */
  private buildExtensionComment(exception: Exception): string {
    return `⏰ **Exception Extended: ${exception.id}**

**Kernel**: ${exception.kernelId}
**Exception**: ${exception.reason}

**Original Expiry**: ${exception.approvedAt}
**New Expiry**: ${new Date(exception.expiresAt).toISOString().split('T')[0]} ${new Date(exception.expiresAt).toISOString().split('T')[1].substring(0, 8)}

**Extension Reason**: ${exception.extendedReason || 'N/A'}
**Extended At**: ${exception.extendedAt}

**Approved By**: @${exception.approvedBy || 'Guardian'}

**Reminder**: This is a time-limited extension. Please ensure convergence by the new deadline.

---
*Automated by ExceptionRegistryAgent*`;
  }
}
