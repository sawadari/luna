/**
 * BoxNavigatorAgent - CrePS 6-Box Navigation Management
 */

import { Octokit } from '@octokit/rest';
import {
  GitHubIssue,
  CrePSBox,
  CrePSGate,
  BoxState,
  BoxNavigationResult,
  BoxTransition,
  GateJudgment,
  AgentConfig,
  AgentResult,
} from '../types';
import { GateKeeperAgent } from './gate-keeper-agent';

export class BoxNavigatorAgent {
  private octokit: Octokit;
  private config: AgentConfig;
  private gateKeeper: GateKeeperAgent;
  private startTime: number;

  constructor(config: AgentConfig) {
    this.config = config;
    this.octokit = new Octokit({ auth: config.githubToken });
    this.gateKeeper = new GateKeeperAgent(config);
    this.startTime = Date.now();
  }

  private log(message: string): void {
    if (this.config.verbose) {
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] [BoxNavigatorAgent] ${message}`);
    }
  }

  /**
   * Box遷移閾値定義（時間単位）
   */
  private readonly BOX_THRESHOLDS: Record<
    CrePSBox,
    { warning: number; escalation: number }
  > = {
    'B1-RealProblem': { warning: 4, escalation: 24 },
    'B2-DefinedProblem': { warning: 8, escalation: 48 },
    'B3-SolutionIdeas': { warning: 4, escalation: 24 },
    'B4-DevelopedSolution': { warning: 120, escalation: 168 }, // 5日, 1週間
    'B5-ImplementedSolution': { warning: 72, escalation: 120 }, // 3日, 5日
    'B6-AcceptedSolution': { warning: 48, escalation: 72 }, // 2日, 3日
  };

  /**
   * メイン実行: Issue番号からBox遷移を管理
   */
  async execute(issueNumber: number): Promise<AgentResult<BoxNavigationResult>> {
    this.startTime = Date.now();
    this.log(`🎯 Navigation starting for Issue #${issueNumber}`);

    try {
      // 1. Issue取得
      const issue = await this.fetchIssue(issueNumber);

      // 2. 現在のBox特定
      const currentBox = this.detectCurrentBox(issue);
      this.log(`📍 Current Box: ${currentBox || 'None'}`);

      // 3. Box状態取得
      const boxState = await this.getBoxState(issue, currentBox);

      // 4. Box遷移チェック
      const { shouldTransition, nextBox, gate } = await this.checkTransition(
        issue,
        currentBox
      );

      let gateJudgment: GateJudgment | undefined;
      let transitionOccurred = false;
      const comments: string[] = [];

      if (shouldTransition && nextBox && gate) {
        // 5. GateKeeperAgentでGate判定
        this.log(`🔍 Checking ${gate} transition conditions`);
        gateJudgment = await this.gateKeeper.judgeGate(issue, gate);

        if (gateJudgment.result === 'pass') {
          // 6. Box遷移実行
          this.log(`✅ ${gate} passed - Transitioning to ${nextBox}`);
          await this.transitionBox(issue, currentBox, nextBox, gate, gateJudgment);
          transitionOccurred = true;
          comments.push(this.buildTransitionComment(currentBox, nextBox, gate, gateJudgment));
        } else if (gateJudgment.result === 'fail') {
          this.log(`❌ ${gate} failed - ${gateJudgment.reason}`);
          comments.push(this.buildGateFailureComment(gate, gateJudgment));
        } else {
          // conditional
          this.log(`⚠️ ${gate} conditional - ${gateJudgment.reason}`);
          comments.push(this.buildConditionalComment(gate, gateJudgment));
        }
      }

      // 7. 滞留監視チェック
      const alertIssued = await this.checkDwellTime(issue, boxState);
      if (alertIssued) {
        comments.push(this.buildDwellAlertComment(boxState));
      }

      // 8. コメント投稿
      for (const comment of comments) {
        await this.postComment(issueNumber, comment);
      }

      const result: BoxNavigationResult = {
        issueNumber,
        previousBox: currentBox,
        currentBox: transitionOccurred ? nextBox! : currentBox!,
        boxState,
        gateJudgment,
        transitionOccurred,
        alertIssued,
        comments,
      };

      this.log(`✅ Navigation complete`);

      return {
        status: 'success',
        data: result,
        metrics: {
          durationMs: Date.now() - this.startTime,
          timestamp: new Date().toISOString(),
        },
      };
    } catch (error) {
      this.log(`❌ Error: ${(error as Error).message}`);
      return {
        status: 'error',
        error: error as Error,
        metrics: {
          durationMs: Date.now() - this.startTime,
          timestamp: new Date().toISOString(),
        },
      };
    }
  }

  /**
   * Issue取得
   */
  private async fetchIssue(issueNumber: number): Promise<GitHubIssue> {
    const [owner, repo] = this.config.repository.split('/');
    const { data } = await this.octokit.issues.get({
      owner,
      repo,
      issue_number: issueNumber,
    });

    return data as GitHubIssue;
  }

  /**
   * 現在のBox検出
   */
  private detectCurrentBox(issue: GitHubIssue): CrePSBox | null {
    const boxLabels = issue.labels.filter((l) =>
      l.name.startsWith('Box:')
    );

    if (boxLabels.length === 0) {
      return null;
    }

    // 最新のBoxラベルを返す（複数ある場合は最後）
    const boxLabel = boxLabels[boxLabels.length - 1].name;
    return boxLabel.replace('Box:', '') as CrePSBox;
  }

  /**
   * Box状態取得
   */
  private async getBoxState(
    issue: GitHubIssue,
    currentBox: CrePSBox | null
  ): Promise<BoxState> {
    if (!currentBox) {
      // Boxなしの場合、B1として扱う
      return {
        currentBox: 'B1-RealProblem',
        enteredAt: issue.created_at,
        dwellTimeHours: this.calculateDwellTime(issue.created_at),
        warningThresholdHours: this.BOX_THRESHOLDS['B1-RealProblem'].warning,
        escalationThresholdHours: this.BOX_THRESHOLDS['B1-RealProblem'].escalation,
        isOverWarning: false,
        isOverEscalation: false,
      };
    }

    // Boxラベルが付与された時刻を取得（イベントAPIから）
    const enteredAt = await this.getBoxEnteredTime(issue, currentBox);
    const dwellTimeHours = this.calculateDwellTime(enteredAt);
    const thresholds = this.BOX_THRESHOLDS[currentBox];

    return {
      currentBox,
      enteredAt,
      dwellTimeHours,
      warningThresholdHours: thresholds.warning,
      escalationThresholdHours: thresholds.escalation,
      isOverWarning: dwellTimeHours > thresholds.warning,
      isOverEscalation: dwellTimeHours > thresholds.escalation,
    };
  }

  /**
   * Boxラベル付与時刻取得
   */
  private async getBoxEnteredTime(
    issue: GitHubIssue,
    box: CrePSBox
  ): Promise<string> {
    const [owner, repo] = this.config.repository.split('/');
    const boxLabel = `Box:${box}`;

    try {
      const { data: events } = await this.octokit.issues.listEvents({
        owner,
        repo,
        issue_number: issue.number,
      });

      const labelEvent = events
        .reverse()
        .find(
          (e) => e.event === 'labeled' && e.label?.name === boxLabel
        );

      return labelEvent?.created_at || issue.created_at;
    } catch {
      return issue.created_at;
    }
  }

  /**
   * 滞留時間計算（時間単位）
   */
  private calculateDwellTime(enteredAt: string): number {
    const now = Date.now();
    const entered = new Date(enteredAt).getTime();
    return (now - entered) / (1000 * 60 * 60); // 時間単位
  }

  /**
   * Box遷移チェック
   */
  private async checkTransition(
    issue: GitHubIssue,
    currentBox: CrePSBox | null
  ): Promise<{
    shouldTransition: boolean;
    nextBox?: CrePSBox;
    gate?: CrePSGate;
  }> {
    // Boxなしの場合、B1に遷移
    if (!currentBox) {
      return {
        shouldTransition: true,
        nextBox: 'B1-RealProblem',
        gate: 'G1-Understanding',
      };
    }

    // 各Box遷移条件チェック
    switch (currentBox) {
      case 'B1-RealProblem':
        if (this.hasProblemDefinitionSection(issue.body || '')) {
          return {
            shouldTransition: true,
            nextBox: 'B2-DefinedProblem',
            gate: 'G1-Understanding',
          };
        }
        break;

      case 'B2-DefinedProblem':
        if (this.hasDESTJudgment(issue)) {
          return {
            shouldTransition: true,
            nextBox: 'B3-SolutionIdeas',
            gate: 'G2-ProblemDef',
          };
        }
        break;

      case 'B3-SolutionIdeas':
        if (this.hasImplementationPlan(issue.body || '')) {
          return {
            shouldTransition: true,
            nextBox: 'B4-DevelopedSolution',
            gate: 'G3-IdeaSelection',
          };
        }
        break;

      case 'B4-DevelopedSolution':
        if (await this.hasPullRequest(issue)) {
          return {
            shouldTransition: true,
            nextBox: 'B5-ImplementedSolution',
            gate: 'G4-Development',
          };
        }
        break;

      case 'B5-ImplementedSolution':
        if (await this.isPRApproved(issue) && this.hasAL2(issue)) {
          return {
            shouldTransition: true,
            nextBox: 'B6-AcceptedSolution',
            gate: 'G5-Implementation',
          };
        }
        break;

      case 'B6-AcceptedSolution':
        if (await this.isPRMerged(issue) && await this.isDeployed(issue)) {
          return {
            shouldTransition: false, // Done状態へはstate-machineが管理
          };
        }
        break;
    }

    return { shouldTransition: false };
  }

  /**
   * 問題定義セクション存在チェック
   */
  private hasProblemDefinitionSection(body: string): boolean {
    return (
      body.includes('## 問題定義') ||
      body.includes('## Problem Definition')
    );
  }

  /**
   * DEST判定完了チェック
   */
  private hasDESTJudgment(issue: GitHubIssue): boolean {
    return issue.labels.some((l) => l.name.startsWith('AL:'));
  }

  /**
   * 実装計画セクション存在チェック
   */
  private hasImplementationPlan(body: string): boolean {
    return (
      body.includes('## 実装計画') ||
      body.includes('## Implementation Plan')
    );
  }

  /**
   * Pull Request存在チェック
   */
  private async hasPullRequest(issue: GitHubIssue): Promise<boolean> {
    const [owner, repo] = this.config.repository.split('/');

    try {
      const { data: timeline } = await this.octokit.issues.listEventsForTimeline({
        owner,
        repo,
        issue_number: issue.number,
      });

      return timeline.some((event: any) => event.event === 'cross-referenced');
    } catch {
      return false;
    }
  }

  /**
   * PR承認チェック
   */
  private async isPRApproved(issue: GitHubIssue): Promise<boolean> {
    // 簡易実装: state:reviewingまたはstate:testingラベルで判定
    return issue.labels.some(
      (l) => l.name === '👀 state:reviewing' || l.name === '🧪 state:testing'
    );
  }

  /**
   * AL2ラベルチェック
   */
  private hasAL2(issue: GitHubIssue): boolean {
    return issue.labels.some((l) => l.name === 'AL:AL2-Assured');
  }

  /**
   * PRマージチェック
   */
  private async isPRMerged(issue: GitHubIssue): Promise<boolean> {
    return issue.labels.some((l) => l.name === '🚀 state:deploying');
  }

  /**
   * デプロイ完了チェック
   */
  private async isDeployed(issue: GitHubIssue): Promise<boolean> {
    return issue.labels.some((l) => l.name === '✅ state:done');
  }

  /**
   * Box遷移実行
   */
  private async transitionBox(
    issue: GitHubIssue,
    fromBox: CrePSBox | null,
    toBox: CrePSBox,
    gate: CrePSGate,
    gateJudgment: GateJudgment
  ): Promise<void> {
    const [owner, repo] = this.config.repository.split('/');

    if (this.config.dryRun) {
      this.log(`[DRY-RUN] Would transition: ${fromBox} → ${toBox}`);
      return;
    }

    // 既存のBoxラベル削除
    if (fromBox) {
      try {
        await this.octokit.issues.removeLabel({
          owner,
          repo,
          issue_number: issue.number,
          name: `Box:${fromBox}`,
        });
      } catch {
        // ラベルが存在しない場合は無視
      }
    }

    // 新しいBoxラベル追加
    await this.octokit.issues.addLabels({
      owner,
      repo,
      issue_number: issue.number,
      labels: [`Box:${toBox}`],
    });

    this.log(`🏷️ Applied Box:${toBox} label`);
  }

  /**
   * 滞留時間チェック
   */
  private async checkDwellTime(
    issue: GitHubIssue,
    boxState: BoxState
  ): Promise<boolean> {
    if (boxState.isOverEscalation) {
      this.log(`🚨 ESCALATION: Box滞留時間超過 (${boxState.dwellTimeHours.toFixed(1)}h)`);
      return true;
    }

    if (boxState.isOverWarning) {
      this.log(`⚠️ WARNING: Box滞留時間警告 (${boxState.dwellTimeHours.toFixed(1)}h)`);
      return true;
    }

    return false;
  }

  /**
   * コメント投稿
   */
  private async postComment(issueNumber: number, body: string): Promise<void> {
    if (this.config.dryRun) {
      this.log(`[DRY-RUN] Would post comment`);
      return;
    }

    const [owner, repo] = this.config.repository.split('/');

    await this.octokit.issues.createComment({
      owner,
      repo,
      issue_number: issueNumber,
      body,
    });

    this.log(`💬 Posted comment`);
  }

  /**
   * Box遷移コメント生成
   */
  private buildTransitionComment(
    fromBox: CrePSBox | null,
    toBox: CrePSBox,
    gate: CrePSGate,
    judgment: GateJudgment
  ): string {
    return `🎯 **Box遷移: ${fromBox || 'None'} → ${toBox}**

**遷移理由**:
- ${gate} 通過
- ${judgment.reason}

**次のステップ**:
${judgment.nextBox ? `- 現在Box: \`Box:${judgment.nextBox}\`` : ''}
${
  judgment.requiredActions
    ? judgment.requiredActions.map((a) => `- ${a}`).join('\n')
    : ''
}

---
*自動投稿: BoxNavigatorAgent*`;
  }

  /**
   * Gate失敗コメント生成
   */
  private buildGateFailureComment(
    gate: CrePSGate,
    judgment: GateJudgment
  ): string {
    return `❌ **${gate} 失敗**

**理由**: ${judgment.reason}

**必須アクション**:
${
  judgment.requiredActions
    ? judgment.requiredActions.map((a) => `- ${a}`).join('\n')
    : '- Gate通過条件を確認してください'
}

---
*自動投稿: BoxNavigatorAgent*`;
  }

  /**
   * 条件付き通過コメント生成
   */
  private buildConditionalComment(
    gate: CrePSGate,
    judgment: GateJudgment
  ): string {
    return `⚠️ **${gate} 条件付き通過**

**理由**: ${judgment.reason}

**改善推奨**:
${
  judgment.improvements
    ? judgment.improvements.map((i) => `- ${i}`).join('\n')
    : ''
}

**承認必要**: ${judgment.requiresApproval || 'TechLead'}

---
*自動投稿: BoxNavigatorAgent*`;
  }

  /**
   * 滞留アラートコメント生成
   */
  private buildDwellAlertComment(boxState: BoxState): string {
    const severity = boxState.isOverEscalation ? '🚨 CRITICAL' : '⚠️ WARNING';

    return `${severity} **Box滞留アラート: ${boxState.currentBox}**

**滞留時間**: ${boxState.dwellTimeHours.toFixed(1)}時間
**警告閾値**: ${boxState.warningThresholdHours}時間
**エスカレーション閾値**: ${boxState.escalationThresholdHours}時間

**推奨アクション**:
- Box遷移条件を確認
- 必要なセクション・ラベルを追加
- 詳細は[BoxNavigatorAgent仕様](.claude/agents/box-navigator-agent.md)を参照

---
*自動投稿: BoxNavigatorAgent*`;
  }
}
