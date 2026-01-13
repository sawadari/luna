/**
 * AssumptionTrackerAgent - Assumption Validation & Tracking
 */

import { Octokit } from '@octokit/rest';
import * as yaml from 'yaml';
import {
  GitHubIssue,
  AgentConfig,
  AgentResult,
  PlanningData,
  Assumption,
  AssumptionStatus,
  DecisionRecord,
} from '../types';

interface AssumptionTrackingResult {
  issueNumber: number;
  detectedAssumptions: Assumption[];
  overdueAssumptions: Assumption[];
  invalidatedAssumptions: Assumption[];
  affectedDecisions: DecisionRecord[];
  comments: string[];
  labels: string[];
}

export class AssumptionTrackerAgent {
  private octokit: Octokit;
  private config: AgentConfig;

  constructor(config: AgentConfig) {
    this.config = config;
    this.octokit = new Octokit({ auth: config.githubToken });
  }

  private log(message: string): void {
    if (this.config.verbose) {
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] [AssumptionTrackerAgent] ${message}`);
    }
  }

  /**
   * メイン実行
   */
  async execute(issueNumber: number): Promise<AgentResult<AssumptionTrackingResult>> {
    this.log(`✅ Assumption tracking starting for issue #${issueNumber}`);

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

    // 2. Planning Data抽出
    const planningData = this.parsePlanningData(githubIssue.body);

    const result: AssumptionTrackingResult = {
      issueNumber,
      detectedAssumptions: [],
      overdueAssumptions: [],
      invalidatedAssumptions: [],
      affectedDecisions: [],
      comments: [],
      labels: [],
    };

    // 3. Assumption自動検出
    const detectedStatements = this.detectAssumptions(githubIssue.body);
    if (detectedStatements.length > 0) {
      this.log(`Detected ${detectedStatements.length} assumption statements`);

      const existingAssumptions = planningData?.assumptions || [];
      const newAssumptions = this.createAssumptions(detectedStatements, existingAssumptions);

      result.detectedAssumptions = newAssumptions;

      if (newAssumptions.length > 0) {
        result.comments.push(this.buildDetectionComment(newAssumptions));
        result.labels.push('Assumption:Active');

        // Planning Dataに追加
        if (!planningData) {
          const updatedPlanning: PlanningData = {
            assumptions: newAssumptions,
            lastUpdatedAt: new Date().toISOString(),
            lastUpdatedBy: 'AssumptionTrackerAgent',
          };
          await this.updatePlanningData(githubIssue, updatedPlanning);
        } else {
          planningData.assumptions = [...existingAssumptions, ...newAssumptions];
          planningData.lastUpdatedAt = new Date().toISOString();
          planningData.lastUpdatedBy = 'AssumptionTrackerAgent';
          await this.updatePlanningData(githubIssue, planningData);
        }
      }
    }

    // 4. 既存Assumptionsの検証期限チェック
    if (planningData?.assumptions) {
      const activeAssumptions = planningData.assumptions.filter((a) => a.status === 'active');

      for (const assumption of activeAssumptions) {
        if (this.isValidationOverdue(assumption)) {
          result.overdueAssumptions.push(assumption);
        }
      }

      if (result.overdueAssumptions.length > 0) {
        this.log(`Found ${result.overdueAssumptions.length} overdue assumptions`);
        result.comments.push(this.buildOverdueComment(result.overdueAssumptions));
      }
    }

    // 5. Invalidated Assumptionsの影響分析
    if (planningData?.assumptions) {
      const invalidated = planningData.assumptions.filter((a) => a.status === 'invalidated');

      for (const assumption of invalidated) {
        result.invalidatedAssumptions.push(assumption);

        // 関連DecisionRecordを特定
        if (planningData.decisionRecord && assumption.relatedDecisions.includes(planningData.decisionRecord.id)) {
          result.affectedDecisions.push(planningData.decisionRecord);
        }
      }

      if (result.invalidatedAssumptions.length > 0) {
        this.log(`Found ${result.invalidatedAssumptions.length} invalidated assumptions`);
        result.comments.push(
          this.buildInvalidationComment(result.invalidatedAssumptions, result.affectedDecisions)
        );
        result.labels.push('Assumption:Invalidated');

        // Critical assumptionの場合はエスカレーション
        const criticalInvalidated = result.invalidatedAssumptions.filter((a) =>
          result.affectedDecisions.some(
            (d) => d.decisionType === 'adopt' && d.chosenOptionId
          )
        );

        if (criticalInvalidated.length > 0) {
          result.comments.push(
            this.buildEscalationComment(criticalInvalidated, result.affectedDecisions)
          );
        }
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
      message: `Assumption tracking completed: ${result.detectedAssumptions.length} detected, ${result.overdueAssumptions.length} overdue`,
    };
  }

  // ========================================================================
  // Planning Data パース・更新
  // ========================================================================

  /**
   * YAML frontmatterからPlanning Dataを抽出
   */
  private parsePlanningData(issueBody: string): PlanningData | null {
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
   * Planning DataをIssue bodyに更新
   */
  private async updatePlanningData(issue: GitHubIssue, planningData: PlanningData): Promise<void> {
    const bodyWithoutFrontmatter = issue.body.replace(/^---\n[\s\S]*?\n---\n/, '');

    const yamlData = {
      planning_layer: planningData,
    };
    const yamlString = yaml.stringify(yamlData);
    const updatedBody = `---\n${yamlString}---\n${bodyWithoutFrontmatter}`;

    if (!this.config.dryRun) {
      const [owner, repo] = this.config.repository.split('/');
      await this.octokit.issues.update({
        owner,
        repo,
        issue_number: issue.number,
        body: updatedBody,
      });
      this.log('Issue body updated with new assumptions');
    }
  }

  // ========================================================================
  // Assumption検出・生成
  // ========================================================================

  /**
   * Assumptionを自動検出
   */
  private detectAssumptions(issueBody: string): string[] {
    const patterns = [
      /assuming (?:that )?(.+?)(?:\.|,|;|\n)/gi,
      /仮定として(.+?)(?:。|、|;|\n)/g,
      /we believe (.+?)(?:\.|,|;|\n)/gi,
      /と考えている(.+?)(?:。|、|;|\n)/g,
      /expected to be (.+?)(?:\.|,|;|\n)/gi,
      /と期待される(.+?)(?:。|、|;|\n)/g,
      /should work because (.+?)(?:\.|,|;|\n)/gi,
      /動作するはず(.+?)(?:。|、|;|\n)/g,
    ];

    const assumptions: string[] = [];
    for (const pattern of patterns) {
      const matches = issueBody.matchAll(pattern);
      for (const match of matches) {
        const statement = match[1].trim();
        if (statement.length > 10 && !assumptions.includes(statement)) {
          assumptions.push(statement);
        }
      }
    }

    return assumptions;
  }

  /**
   * AssumptionオブジェクトをAssumption生成
   */
  private createAssumptions(
    statements: string[],
    existingAssumptions: Assumption[]
  ): Assumption[] {
    const newAssumptions: Assumption[] = [];

    for (const statement of statements) {
      // 既存のAssumptionと重複チェック
      const isDuplicate = existingAssumptions.some(
        (a) => a.statement.toLowerCase() === statement.toLowerCase()
      );

      if (!isDuplicate) {
        const id = this.generateAssumptionId(existingAssumptions);
        const validationMethod = this.suggestValidationMethod(statement);
        const validationDate = this.calculateValidationDeadline('normal');

        newAssumptions.push({
          id,
          statement,
          owner: 'TechLead',
          status: 'active',
          validationMethod,
          validationDate,
          relatedDecisions: [],
          createdAt: new Date().toISOString(),
        });

        existingAssumptions.push(newAssumptions[newAssumptions.length - 1]);
      }
    }

    return newAssumptions;
  }

  /**
   * Assumption ID生成
   */
  private generateAssumptionId(existingAssumptions: Assumption[]): string {
    const maxId =
      existingAssumptions.length > 0
        ? Math.max(
            ...existingAssumptions.map((a) => parseInt(a.id.replace('ASM-', '')) || 0)
          )
        : 0;

    return `ASM-${String(maxId + 1).padStart(3, '0')}`;
  }

  /**
   * 検証方法を提案
   */
  private suggestValidationMethod(statement: string): string {
    const text = statement.toLowerCase();

    if (text.match(/performance|speed|latency|response time/)) {
      return 'Benchmark or load testing';
    } else if (text.match(/user|customer|access pattern|behavior/)) {
      return 'Access log analysis or A/B testing';
    } else if (text.match(/capacity|scale|volume|throughput/)) {
      return 'Capacity planning and simulation';
    } else if (text.match(/integration|api|external|third-party/)) {
      return 'Spike/POC with actual integration';
    } else if (text.match(/data|database|query|storage/)) {
      return 'Data analysis and profiling';
    } else {
      return 'Review with domain expert';
    }
  }

  /**
   * 検証期限を計算
   */
  private calculateValidationDeadline(
    priority: 'critical' | 'high' | 'normal'
  ): string {
    const daysMap = {
      critical: 3,
      high: 7,
      normal: 14,
    };

    const deadline = new Date();
    deadline.setDate(deadline.getDate() + daysMap[priority]);
    return deadline.toISOString();
  }

  // ========================================================================
  // 検証期限チェック
  // ========================================================================

  /**
   * 検証期限切れチェック
   */
  private isValidationOverdue(assumption: Assumption): boolean {
    if (!assumption.validationDate) {
      return false;
    }

    const now = new Date();
    const validationDate = new Date(assumption.validationDate);
    return now > validationDate;
  }

  // ========================================================================
  // コメント生成
  // ========================================================================

  /**
   * Assumption検出コメント
   */
  private buildDetectionComment(assumptions: Assumption[]): string {
    const assumptionList = assumptions
      .map(
        (a) => `**${a.id}**: "${a.statement}"
- **Owner**: @${a.owner}
- **Validation Method**: ${a.validationMethod}
- **Due Date**: ${new Date(a.validationDate!).toLocaleDateString()}`
      )
      .join('\n\n');

    return `📝 **Assumption 検出: ${assumptions.length}件**

以下の Assumption が検出されました:

${assumptionList}

**Label Applied**: \`Assumption:Active\`

**次のステップ**:
1. 各 Owner が検証を実施
2. 検証完了後、結果をコメントで報告
3. Assumption を Validated または Invalidated に更新

---
*Automated by AssumptionTrackerAgent*`;
  }

  /**
   * 検証期限切れアラートコメント
   */
  private buildOverdueComment(overdueAssumptions: Assumption[]): string {
    const overdueList = overdueAssumptions
      .map((a) => {
        const daysOverdue = Math.floor(
          (Date.now() - new Date(a.validationDate!).getTime()) / (1000 * 60 * 60 * 24)
        );

        return `**${a.id}**: "${a.statement}"
- **Owner**: @${a.owner}
- **Status**: Active (検証未完了)
- **Validation Method**: ${a.validationMethod}
- **Due Date**: ${new Date(a.validationDate!).toLocaleDateString()} (${daysOverdue} days overdue)`;
      })
      .join('\n\n');

    return `⚠️ **Assumption 検証期限切れ: ${overdueAssumptions.length}件**

以下の Assumption の検証期限が過ぎています:

${overdueList}

**Action Required**:
1. 検証を実施
2. 検証結果をコメントで報告
3. Assumption を Validated または Invalidated に更新

---
*Automated by AssumptionTrackerAgent*`;
  }

  /**
   * Assumption無効化コメント
   */
  private buildInvalidationComment(
    invalidatedAssumptions: Assumption[],
    affectedDecisions: DecisionRecord[]
  ): string {
    const invalidatedList = invalidatedAssumptions
      .map(
        (a) => `**${a.id}**: "${a.statement}"
- **Invalidated Reason**: ${a.invalidatedReason || 'Not specified'}
- **Related Decisions**: ${a.relatedDecisions.join(', ') || 'None'}`
      )
      .join('\n\n');

    const impactSection =
      affectedDecisions.length > 0
        ? `\n**Impact Analysis**:
- **Affected Decisions**: ${affectedDecisions.map((d) => d.id).join(', ')}
- **Severity**: ${affectedDecisions.some((d) => d.decisionType === 'adopt') ? 'High' : 'Medium'}
- **Risk**: Decision may need re-evaluation`
        : '';

    return `🚨 **Assumption 無効化: ${invalidatedAssumptions.length}件**

以下の Assumption が無効化されました:

${invalidatedList}
${impactSection}

**Label Applied**: \`Assumption:Invalidated\`

**次のステップ**:
1. 関連する DecisionRecord を再評価
2. PlanningAgent を再実行して代替案を検討
3. 必要に応じて Product Owner にエスカレーション

---
*Automated by AssumptionTrackerAgent*`;
  }

  /**
   * エスカレーションコメント
   */
  private buildEscalationComment(
    criticalAssumptions: Assumption[],
    affectedDecisions: DecisionRecord[]
  ): string {
    const decisionList = affectedDecisions
      .map((d) => `- **${d.id}**: ${d.decisionType} decision for ${d.chosenOptionId}`)
      .join('\n');

    return `🚨 **Critical Assumption Invalidation - Product Owner Escalation**

**Critical Assumptions Invalidated**: ${criticalAssumptions.map((a) => a.id).join(', ')}

**Affected Adopted Decisions**:
${decisionList}

**Recommendations**:
1. Product Owner review required
2. Re-evaluate decision viability
3. Consider alternative options
4. Update assumptions and re-run planning

@ProductOwner - Please review and provide guidance.

---
*Automated by AssumptionTrackerAgent*`;
  }
}
