/**
 * PlanningAgent - Decision Management & Planning Layer
 */

import { Octokit } from '@octokit/rest';
import * as yaml from 'yaml';
import {
  GitHubIssue,
  AgentConfig,
  AgentResult,
  PlanningData,
  PlanningContext,
  Opportunity,
  Option,
  DecisionRecord,
  Constraint,
  LeveragePoint,
} from '../types';

export class PlanningAgent {
  private octokit: Octokit;
  private config: AgentConfig;

  constructor(config: AgentConfig) {
    this.config = config;
    this.octokit = new Octokit({ auth: config.githubToken });
  }

  private log(message: string): void {
    if (this.config.verbose) {
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] [PlanningAgent] ${message}`);
    }
  }

  /**
   * メイン実行
   */
  async execute(
    issueNumber: number,
    destJudgment?: import('../types').DESTJudgmentResult
  ): Promise<AgentResult<PlanningContext>> {
    this.log(`📋 Planning Layer execution starting for issue #${issueNumber}`);

    if (destJudgment) {
      this.log(`  DEST Judgment: AL=${destJudgment.al}, outcomeOk=${destJudgment.outcomeOk}, safetyOk=${destJudgment.safetyOk}`);
    }

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
    const planningData = this.parsePlanningData(githubIssue.body || '');
    const context = this.extractPlanningContext(issueNumber, planningData);

    const comments: string[] = [];
    const labels: string[] = [];

    // 3. Opportunityチェック
    if (!context.hasOpportunity) {
      this.log('No opportunity found, generating...');
      const opportunity = this.generateOpportunity(githubIssue);
      if (!planningData) {
        context.planningData = {
          opportunity,
          lastUpdatedAt: new Date().toISOString(),
          lastUpdatedBy: 'PlanningAgent',
        };
      } else {
        planningData.opportunity = opportunity;
      }

      comments.push(this.buildOpportunityComment(opportunity));
    }

    // 4. Options評価
    if (context.hasOpportunity && context.planningData?.options) {
      this.log(`Evaluating ${context.planningData.options.length} options`);
      for (const option of context.planningData.options) {
        if (!option.leveragePointId) {
          option.leveragePointId = this.analyzeLeveragePoint(option);
        }
      }
    }

    // 5. DecisionRecord作成チェック
    if (
      context.hasOpportunity &&
      !context.hasDecision &&
      context.planningData?.options &&
      context.planningData.options.length >= 2
    ) {
      const selectedOption = this.findSelectedOption(
        githubIssue.body || '',
        context.planningData.options
      );

      if (selectedOption) {
        this.log(`Selected option found: ${selectedOption.id}`);
        const decisionRecord = this.createDecisionRecord(
          context.planningData.opportunity!,
          selectedOption,
          context.planningData.options,
          destJudgment
        );

        context.planningData!.decisionRecord = decisionRecord;
        context.hasDecision = true;

        comments.push(this.buildDecisionComment(decisionRecord, selectedOption));
        labels.push(`Decision:${this.capitalizeFirst(decisionRecord.decisionType)}`);
      }
    }

    // 6. Constraint検証
    if (context.hardConstraints.length > 0 && context.planningData?.options) {
      const violations = this.validateConstraints(
        context.planningData.options,
        context.hardConstraints
      );

      if (violations.length > 0) {
        comments.push(this.buildConstraintViolationComment(violations));
      }
    }

    // 7. Planning Data埋め込み
    if (context.planningData) {
      const updatedBody = this.embedPlanningData(githubIssue.body || '', context.planningData);

      if (!this.config.dryRun) {
        await this.octokit.issues.update({
          owner,
          repo,
          issue_number: issueNumber,
          body: updatedBody,
        });
        this.log('Issue body updated with Planning Data');
      }
    }

    // 8. コメント投稿
    for (const comment of comments) {
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
    if (labels.length > 0 && !this.config.dryRun) {
      await this.octokit.issues.addLabels({
        owner,
        repo,
        issue_number: issueNumber,
        labels,
      });
      this.log(`Labels applied: ${labels.join(', ')}`);
    }

    this.log(`Planning Layer processed: ${comments.length} comments, ${labels.length} labels`);

    return {
      status: 'success',
      data: context,
      metrics: {
        durationMs: 0,
        timestamp: new Date().toISOString(),
      },
    };
  }

  // ========================================================================
  // Planning Data パース・生成
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
   * Planning DataをYAML frontmatterとしてIssue bodyに埋め込み
   */
  private embedPlanningData(issueBody: string, planningData: PlanningData): string {
    // 既存のYAML frontmatterを削除
    const bodyWithoutFrontmatter = issueBody.replace(/^---\n[\s\S]*?\n---\n/, '');

    // 新しいYAML frontmatterを生成
    const yamlData = {
      planning_layer: planningData,
    };
    const yamlString = yaml.stringify(yamlData);

    return `---\n${yamlString}---\n${bodyWithoutFrontmatter}`;
  }

  /**
   * Planning Contextを抽出
   */
  private extractPlanningContext(
    issueNumber: number,
    planningData: PlanningData | null
  ): PlanningContext {
    if (!planningData) {
      return {
        issueNumber,
        planningData: null,
        hasOpportunity: false,
        hasDecision: false,
        activeAssumptions: [],
        invalidatedAssumptions: [],
        hardConstraints: [],
        softConstraints: [],
      };
    }

    return {
      issueNumber,
      planningData,
      hasOpportunity: !!planningData.opportunity,
      hasDecision: !!planningData.decisionRecord,
      activeAssumptions: planningData.assumptions?.filter((a) => a.status === 'active') || [],
      invalidatedAssumptions:
        planningData.assumptions?.filter((a) => a.status === 'invalidated') || [],
      hardConstraints: planningData.constraints?.filter((c) => c.type === 'hard') || [],
      softConstraints: planningData.constraints?.filter((c) => c.type === 'soft') || [],
    };
  }

  // ========================================================================
  // Opportunity生成
  // ========================================================================

  /**
   * Issueから自動的にOpportunityを生成
   */
  private generateOpportunity(issue: GitHubIssue): Opportunity {
    const id = this.generateOpportunityId();

    // Issue本文から情報を抽出
    const targetCustomer = this.extractFieldValue(issue.body || '', 'Target Customer') || 'Unknown';
    const problem = this.extractFieldValue(issue.body || '', 'Current state') || 'Problem not defined';
    const desiredOutcome =
      this.extractFieldValue(issue.body || '', 'Target state') || 'Outcome not defined';

    return {
      id,
      title: issue.title,
      targetCustomer,
      problem,
      desiredOutcome,
      constraints: [],
      createdAt: new Date().toISOString(),
      createdBy: 'PlanningAgent',
    };
  }

  /**
   * Opportunity ID生成
   */
  private generateOpportunityId(): string {
    const year = new Date().getFullYear();
    const random = Math.floor(Math.random() * 1000)
      .toString()
      .padStart(3, '0');
    return `OPP-${year}-${random}`;
  }

  // ========================================================================
  // Options評価
  // ========================================================================

  /**
   * Leverage Point分析
   */
  private analyzeLeveragePoint(option: Option): LeveragePoint {
    const text = `${option.title} ${option.hypothesis}`.toLowerCase();

    // LP1-LP3: Paradigm/Goal level
    if (text.match(/paradigm|fundamental|belief|mindset|culture/)) {
      return 'LP1-Transcend';
    }
    if (text.match(/goal|purpose|mission|vision|objective/)) {
      return 'LP3-Goal';
    }

    // LP4-LP6: Structure level
    if (text.match(/self-organiz|evolve|adapt|learn/)) {
      return 'LP4-SelfOrganize';
    }
    if (text.match(/rule|policy|regulation|governance|authority/)) {
      return 'LP5-Rules';
    }
    if (text.match(/information|data flow|communication|visibility|transparency/)) {
      return 'LP6-InfoFlow';
    }

    // LP7-LP9: Feedback level
    if (text.match(/amplif|positive feedback|growth|scaling/)) {
      return 'LP7-PositiveFB';
    }
    if (text.match(/control|negative feedback|stabiliz|balanc/)) {
      return 'LP8-NegativeFB';
    }
    if (text.match(/delay|timing|latency|lag|response time/)) {
      return 'LP9-Delay';
    }

    // LP10-LP11: Structure/Buffer
    if (text.match(/structure|architecture|design|flow|stock/)) {
      return 'LP10-StockFlow';
    }
    if (text.match(/buffer|capacity|reserve|margin|slack/)) {
      return 'LP11-Buffer';
    }

    // LP12: Default (Parameter level)
    return 'LP12-Parameter';
  }

  /**
   * 選択されたOptionを検出（✅マーカー）
   */
  private findSelectedOption(issueBody: string, options: Option[]): Option | null {
    for (const option of options) {
      const optionPattern = new RegExp(`${option.id}.*?✅|✅.*?${option.id}`, 'i');
      if (issueBody.match(optionPattern)) {
        return option;
      }
    }
    return null;
  }

  // ========================================================================
  // DecisionRecord作成
  // ========================================================================

  /**
   * DecisionRecordを作成
   */
  private createDecisionRecord(
    opportunity: Opportunity,
    chosenOption: Option,
    allOptions: Option[],
    destJudgment?: import('../types').DESTJudgmentResult
  ): DecisionRecord {
    const id = this.generateDecisionId();

    return {
      id,
      opportunityId: opportunity.id,
      decisionType: 'adopt',
      chosenOptionId: chosenOption.id,
      decidedBy: 'ProductOwner',
      decidedAt: new Date().toISOString(),
      rationale: `Option ${chosenOption.id} selected based on hypothesis: ${chosenOption.hypothesis}`,
      tradeoffs: this.extractTradeoffs(chosenOption),
      alternatives: allOptions.filter((o) => o.id !== chosenOption.id).map((o) => o.id),
      // ✨ NEW: Reevaluation & Traceability (Phase 1)
      falsificationConditions: this.generateFalsificationConditions(chosenOption),
      linkedEvaluationIds: [], // Phase 2 で実装予定
      remainingRisks: chosenOption.risks || [],
      // ✨ NEW: DEST Judgment Integration (Phase 0)
      linked_dest_judgment: destJudgment?.judgmentId,
      outcome_ok: destJudgment?.outcomeOk,
      safety_ok: destJudgment?.safetyOk,
      assurance_level: destJudgment?.al,
      dissentingViews: [], // オプション（Phase 2 で実装予定）
      impactScope: this.extractImpactScope(chosenOption),
      linkedEvidence: [], // Phase 2 で実装予定
    };
  }

  /**
   * Decision ID生成
   */
  private generateDecisionId(): string {
    const year = new Date().getFullYear();
    const random = Math.floor(Math.random() * 1000)
      .toString()
      .padStart(3, '0');
    return `DEC-${year}-${random}`;
  }

  /**
   * Tradeoffs抽出
   */
  private extractTradeoffs(option: Option): string[] {
    const tradeoffs: string[] = [];

    if (option.pros.length > 0 && option.cons.length > 0) {
      tradeoffs.push(`${option.pros[0]} vs. ${option.cons[0]}`);
    }

    if (option.risks.length > 0) {
      tradeoffs.push(`Risk: ${option.risks[0]}`);
    }

    return tradeoffs;
  }

  /**
   * Falsification Conditions 生成（Phase 1: 簡易実装）
   *
   * Option の risks と cons から再評価条件を自動生成
   * Phase 2: ユーザー入力による条件追加
   */
  private generateFalsificationConditions(option: Option): any[] {
    const conditions: any[] = [];

    // Risk から条件生成
    if (option.risks.length > 0) {
      conditions.push({
        id: `fc-${Date.now()}-1`,
        condition: `Risk materialized: ${option.risks[0]}`,
        signalRef: undefined, // Phase 2 で Signal 統合
        threshold: undefined,
        thresholdComparison: undefined,
      });
    }

    // Cons から条件生成
    if (option.cons.length > 0) {
      conditions.push({
        id: `fc-${Date.now()}-2`,
        condition: `Negative impact observed: ${option.cons[0]}`,
        signalRef: undefined, // Phase 2 で Signal 統合
        threshold: undefined,
        thresholdComparison: undefined,
      });
    }

    // デフォルト条件（常に追加）
    conditions.push({
      id: `fc-${Date.now()}-3`,
      condition: 'Customer satisfaction drops below 70%',
      signalRef: 'sig.customer_satisfaction',
      threshold: 0.7,
      thresholdComparison: 'lt',
    });

    return conditions;
  }

  /**
   * Impact Scope 抽出（Phase 1: 簡易実装）
   *
   * Option の hypothesis と title から影響範囲を抽出
   * Phase 2: より精緻な抽出ロジック
   */
  private extractImpactScope(option: Option): string[] {
    const scope: string[] = [];
    const text = `${option.title} ${option.hypothesis}`.toLowerCase();

    // キーワードベースで影響範囲を抽出
    if (text.match(/user|customer|client/)) scope.push('ユーザー体験');
    if (text.match(/auth|login|security/)) scope.push('認証・セキュリティ');
    if (text.match(/performance|speed|latency/)) scope.push('パフォーマンス');
    if (text.match(/ui|interface|design/)) scope.push('UI/UX');
    if (text.match(/api|integration|service/)) scope.push('API/統合');
    if (text.match(/database|data|storage/)) scope.push('データストレージ');
    if (text.match(/deploy|infrastructure|server/)) scope.push('インフラ・デプロイ');
    if (text.match(/test|quality|coverage/)) scope.push('テスト・品質');

    // デフォルト
    if (scope.length === 0) {
      scope.push('システム全体');
    }

    return scope;
  }

  // ========================================================================
  // Constraint検証
  // ========================================================================

  /**
   * Hard Constraint違反をチェック
   */
  private validateConstraints(
    options: Option[],
    hardConstraints: Constraint[]
  ): Array<{ option: Option; constraint: Constraint }> {
    const violations: Array<{ option: Option; constraint: Constraint }> = [];

    for (const option of options) {
      for (const constraint of hardConstraints) {
        if (this.violatesConstraint(option, constraint)) {
          violations.push({ option, constraint });
        }
      }
    }

    return violations;
  }

  /**
   * Constraint違反判定（簡易実装）
   */
  private violatesConstraint(option: Option, constraint: Constraint): boolean {
    const optionText = `${option.title} ${option.hypothesis}`.toLowerCase();
    const constraintText = constraint.statement.toLowerCase();

    // "no breaking changes" constraint check
    if (constraintText.includes('no breaking') && optionText.includes('breaking')) {
      return true;
    }

    // "no external dependency" constraint check
    if (constraintText.includes('no external') && optionText.includes('external')) {
      return true;
    }

    return false;
  }

  // ========================================================================
  // コメント生成
  // ========================================================================

  /**
   * Opportunity定義完了コメント
   */
  private buildOpportunityComment(opportunity: Opportunity): string {
    return `📋 **Opportunity 定義完了**

**${opportunity.id}**: ${opportunity.title}

**Target Customer**: ${opportunity.targetCustomer}
**Problem**: ${opportunity.problem}
**Desired Outcome**: ${opportunity.desiredOutcome}

**次のステップ**:
1. Options（選択肢）を 3 個以上追加
2. 各 Option の Pros/Cons/Risks を評価
3. Leverage Point 分析を実施

---
*Automated by PlanningAgent*`;
  }

  /**
   * Decision作成コメント
   */
  private buildDecisionComment(decision: DecisionRecord, chosenOption: Option): string {
    return `✅ **Decision Record 作成: ${decision.id}**

**Decision Type**: ${this.capitalizeFirst(decision.decisionType)}
**Chosen Option**: ${decision.chosenOptionId} (${chosenOption.title})
**Decided By**: ${decision.decidedBy}
**Decided At**: ${new Date(decision.decidedAt).toLocaleString()}

**Rationale**:
${decision.rationale}

**Tradeoffs**:
${decision.tradeoffs.map((t) => `- ${t}`).join('\n')}

**Alternatives Considered**:
${decision.alternatives.map((a) => `- ${a}`).join('\n')}

**Label Applied**: \`Decision:${this.capitalizeFirst(decision.decisionType)}\`

**次のステップ**:
1. AssumptionTrackerAgent で Assumptions 検証
2. B4 (Developed Solution) へ遷移
3. 実装計画を作成

---
*Automated by PlanningAgent*`;
  }

  /**
   * Constraint違反コメント
   */
  private buildConstraintViolationComment(
    violations: Array<{ option: Option; constraint: Constraint }>
  ): string {
    const violationList = violations
      .map((v) => `- **${v.option.id}** violates **${v.constraint.id}**: ${v.constraint.statement}`)
      .join('\n');

    return `🚫 **Hard Constraint 違反検出**

以下の Options が Hard Constraints に違反しています:

${violationList}

**Action Required**:
1. 違反している Options を修正または削除
2. Constraint を見直す必要がある場合は Product Owner にエスカレーション

---
*Automated by PlanningAgent*`;
  }

  // ========================================================================
  // ヘルパーメソッド
  // ========================================================================

  /**
   * フィールド値抽出
   */
  private extractFieldValue(body: string, fieldName: string): string | null {
    const pattern = new RegExp(`[-*]\\s*${fieldName}\\s*[::：]\\s*(.+?)(?=\\n|$)`, 'i');
    const match = body.match(pattern);
    return match ? match[1].trim() : null;
  }

  /**
   * 文字列の最初を大文字に
   */
  private capitalizeFirst(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }
}
