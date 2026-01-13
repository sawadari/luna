/**
 * GateKeeperAgent - CrePS Gate Judgment
 */

import { Octokit } from '@octokit/rest';
import {
  GitHubIssue,
  CrePSGate,
  GateJudgment,
  GateJudgmentResult,
  SMARTScore,
  AgentConfig,
} from '../types';
import { ALJudge } from './al-judge';

export class GateKeeperAgent {
  private octokit: Octokit;
  private config: AgentConfig;

  constructor(config: AgentConfig) {
    this.config = config;
    this.octokit = new Octokit({ auth: config.githubToken });
  }

  private log(message: string): void {
    if (this.config.verbose) {
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] [GateKeeperAgent] ${message}`);
    }
  }

  /**
   * Gate判定メイン
   */
  async judgeGate(issue: GitHubIssue, gate: CrePSGate): Promise<GateJudgment> {
    this.log(`🚪 Gate judgment starting: ${gate}`);

    let judgment: GateJudgment;

    switch (gate) {
      case 'G1-Understanding':
        judgment = await this.checkG1(issue);
        break;
      case 'G2-ProblemDef':
        judgment = await this.checkG2(issue);
        break;
      case 'G3-IdeaSelection':
        judgment = await this.checkG3(issue);
        break;
      case 'G4-Development':
        judgment = await this.checkG4(issue);
        break;
      case 'G5-Implementation':
        judgment = await this.checkG5(issue);
        break;
      case 'G6-Acceptance':
        judgment = await this.checkG6(issue);
        break;
      default:
        judgment = {
          result: 'fail',
          gate,
          reason: `Unknown gate: ${gate}`,
          timestamp: new Date().toISOString(),
        };
    }

    this.log(`${judgment.result === 'pass' ? '✅' : '❌'} ${gate} judgment: ${judgment.result.toUpperCase()}`);

    return judgment;
  }

  /**
   * G1: Understanding Gate
   * B1 (Real Problem) → B2 (Defined Problem)
   */
  private async checkG1(issue: GitHubIssue): Promise<GateJudgment> {
    const body = issue.body || '';

    // 問題定義セクションチェック
    const hasProblemDef =
      body.includes('## 問題定義') || body.includes('## Problem Definition');

    if (!hasProblemDef) {
      return {
        result: 'fail',
        gate: 'G1-Understanding',
        reason: 'Issue本文に問題定義セクションが不足',
        requiredActions: [
          'Issue本文に「## 問題定義」セクションを追加',
          '現状（Current state）を記述（50文字以上）',
          '目標（Target state）を記述（50文字以上）',
          '制約（Constraints）を記述',
        ],
        timestamp: new Date().toISOString(),
      };
    }

    // 現状・目標・制約の存在チェック
    const hasCurrentState = this.extractFieldValue(body, 'Current state').length >= 50;
    const hasTargetState = this.extractFieldValue(body, 'Target state').length >= 50;
    const hasConstraints =
      body.includes('制約') || body.includes('Constraints');

    if (!hasCurrentState || !hasTargetState || !hasConstraints) {
      return {
        result: 'fail',
        gate: 'G1-Understanding',
        reason: '問題定義の記述が不十分',
        requiredActions: [
          !hasCurrentState ? '現状（Current state）を50文字以上で記述' : '',
          !hasTargetState ? '目標（Target state）を50文字以上で記述' : '',
          !hasConstraints ? '制約（Constraints）を記述' : '',
        ].filter(Boolean),
        timestamp: new Date().toISOString(),
      };
    }

    return {
      result: 'pass',
      gate: 'G1-Understanding',
      reason: '問題定義が適切',
      nextBox: 'B2-DefinedProblem',
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * G2: Problem Definition Gate
   * B2 (Defined Problem) → B3 (Solution Ideas)
   */
  private async checkG2(issue: GitHubIssue): Promise<GateJudgment> {
    // DEST判定完了チェック
    const hasAL = issue.labels.some((l) => l.name.startsWith('AL:'));
    if (!hasAL) {
      return {
        result: 'fail',
        gate: 'G2-ProblemDef',
        reason: 'DEST判定が未完了',
        requiredActions: [
          'Issue本文に「## Outcome Assessment」セクション追加',
          'Issue本文に「## Safety Assessment」セクション追加',
          'DESTAgentを実行: npm run agents:dest -- --issue=<番号>',
        ],
        timestamp: new Date().toISOString(),
      };
    }

    // AL0の場合、AL0 Reason + Protocolチェック
    const isAL0 = issue.labels.some((l) => l.name === 'AL:AL0-NotAssured');
    if (isAL0) {
      const hasReason = issue.labels.some((l) => l.name.startsWith('AL0:'));
      const hasProtocol = issue.labels.some((l) =>
        l.name.startsWith('Protocol:')
      );

      if (!hasReason || !hasProtocol) {
        return {
          result: 'fail',
          gate: 'G2-ProblemDef',
          reason: 'AL0 ReasonまたはProtocolが不明確',
          requiredActions: [
            'AL0 Reasonを特定（R01-R11）',
            '該当するProtocol（P0-P4）を実行',
            'DESTAgent再実行',
          ],
          timestamp: new Date().toISOString(),
        };
      }
    }

    // SMART基準チェック
    const smartScore = this.calculateSMARTScore(issue.body || '');
    if (smartScore.totalScore < 3) {
      return {
        result: 'conditional',
        gate: 'G2-ProblemDef',
        reason: 'SMART基準を一部満たしていない',
        improvements: [
          !smartScore.specific ? '目標を具体的に記述（Specific）' : '',
          !smartScore.measurable ? '測定可能な指標を追加（Measurable）' : '',
          !smartScore.achievable ? '達成可能性を確認（Achievable）' : '',
          !smartScore.relevant ? '関連性を明確化（Relevant）' : '',
          !smartScore.timeBound ? '期限を明示（Time-bound）' : '',
        ].filter(Boolean),
        requiresApproval: 'TechLead',
        timestamp: new Date().toISOString(),
      };
    }

    return {
      result: 'pass',
      gate: 'G2-ProblemDef',
      reason: '問題定義が適切でDEST判定完了',
      nextBox: 'B3-SolutionIdeas',
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * G3: Idea Selection Gate
   * B3 (Solution Ideas) → B4 (Developed Solution)
   */
  private async checkG3(issue: GitHubIssue): Promise<GateJudgment> {
    const body = issue.body || '';

    // 解決アイデアセクションチェック
    const hasIdeasSection =
      body.includes('## 解決アイデア') || body.includes('## Solution Ideas');

    if (!hasIdeasSection) {
      return {
        result: 'fail',
        gate: 'G3-IdeaSelection',
        reason: 'Issue本文に解決アイデアセクションが不足',
        requiredActions: [
          'Issue本文に「## 解決アイデア」セクションを追加',
          '3個以上のアイデアをリストアップ',
          '各アイデアの実現可能性を評価',
        ],
        timestamp: new Date().toISOString(),
      };
    }

    // アイデア数チェック（日本語・英語両対応）
    let ideasSection = this.extractSection(body, '解決アイデア');
    if (!ideasSection) {
      ideasSection = this.extractSection(body, 'Solution Ideas');
    }
    const ideas = this.parseIdeasList(ideasSection);

    if (ideas.length < 3) {
      return {
        result: 'fail',
        gate: 'G3-IdeaSelection',
        reason: `アイデアが${ideas.length}個のみ（3個以上必要）`,
        requiredActions: [
          '最低3個のアイデアをリストアップ',
          '各アイデアの実現可能性を評価',
        ],
        timestamp: new Date().toISOString(),
      };
    }

    // 選択されたアイデアチェック
    const hasSelection = ideas.some((idea) => idea.selected);
    if (!hasSelection) {
      return {
        result: 'fail',
        gate: 'G3-IdeaSelection',
        reason: 'アイデアが選択されていない',
        requiredActions: [
          '最適なアイデアを1つ選択',
          '選択理由を記述（50文字以上）',
        ],
        timestamp: new Date().toISOString(),
      };
    }

    // 選択理由の長さチェック
    const selectedIdea = ideas.find((idea) => idea.selected);
    if (selectedIdea && selectedIdea.reason.length < 50) {
      return {
        result: 'conditional',
        gate: 'G3-IdeaSelection',
        reason: '選択理由が不十分',
        improvements: ['選択理由を50文字以上で詳しく記述'],
        timestamp: new Date().toISOString(),
      };
    }

    return {
      result: 'pass',
      gate: 'G3-IdeaSelection',
      reason: 'アイデア選択が適切',
      nextBox: 'B4-DevelopedSolution',
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * G4: Development Gate
   * B4 (Developed Solution) → B5 (Implemented Solution)
   */
  private async checkG4(issue: GitHubIssue): Promise<GateJudgment> {
    // Pull Request存在チェック
    const hasPR = await this.hasPullRequest(issue);
    if (!hasPR) {
      return {
        result: 'fail',
        gate: 'G4-Development',
        reason: 'Pull Requestが未作成',
        requiredActions: [
          'Pull Requestを作成',
          'コード実装を完了',
        ],
        timestamp: new Date().toISOString(),
      };
    }

    // Draft状態チェック
    const isDraft = await this.isPRDraft(issue);
    if (isDraft) {
      return {
        result: 'fail',
        gate: 'G4-Development',
        reason: 'PRがDraft状態',
        requiredActions: [
          'コード実装を完了',
          'Draft状態を解除',
        ],
        timestamp: new Date().toISOString(),
      };
    }

    // ReviewAgent結果チェック（簡易実装）
    const hasReviewLabel = issue.labels.some((l) =>
      l.name.includes('state:reviewing')
    );

    if (!hasReviewLabel) {
      return {
        result: 'conditional',
        gate: 'G4-Development',
        reason: 'ReviewAgentによる品質チェック待ち',
        improvements: ['ReviewAgentを実行して品質スコアを取得'],
        timestamp: new Date().toISOString(),
      };
    }

    return {
      result: 'pass',
      gate: 'G4-Development',
      reason: '開発品質が基準を満たす',
      nextBox: 'B5-ImplementedSolution',
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * G5: Implementation Gate
   * B5 (Implemented Solution) → B6 (Accepted Solution)
   */
  private async checkG5(issue: GitHubIssue): Promise<GateJudgment> {
    // PR承認チェック
    const isApproved = await this.isPRApproved(issue);
    if (!isApproved) {
      return {
        result: 'fail',
        gate: 'G5-Implementation',
        reason: 'PRが承認されていない',
        requiredActions: [
          'Pull Requestをレビュー',
          '品質基準を満たしていることを確認',
          'PRを承認',
        ],
        timestamp: new Date().toISOString(),
      };
    }

    // テスト実行チェック（簡易実装）
    const hasTestingLabel = issue.labels.some((l) =>
      l.name.includes('state:testing')
    );

    if (!hasTestingLabel) {
      return {
        result: 'fail',
        gate: 'G5-Implementation',
        reason: 'テストが未実行',
        requiredActions: [
          'npm test を実行',
          'テストを80%以上のカバレッジで合格',
        ],
        timestamp: new Date().toISOString(),
      };
    }

    // AL2チェック
    const isAL2 = issue.labels.some((l) => l.name === 'AL:AL2-Assured');
    if (!isAL2) {
      return {
        result: 'fail',
        gate: 'G5-Implementation',
        reason: 'AL2 (Assured) が未達成',
        requiredActions: [
          'Issue本文のOutcome/Safety Assessmentを更新',
          'DESTAgent再実行でAL2を達成',
        ],
        timestamp: new Date().toISOString(),
      };
    }

    return {
      result: 'pass',
      gate: 'G5-Implementation',
      reason: '実装品質が基準を満たす',
      nextBox: 'B6-AcceptedSolution',
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * G6: Acceptance Gate
   * B6 (Accepted Solution) → Done
   */
  private async checkG6(issue: GitHubIssue): Promise<GateJudgment> {
    // PRマージチェック
    const isMerged = await this.isPRMerged(issue);
    if (!isMerged) {
      return {
        result: 'fail',
        gate: 'G6-Acceptance',
        reason: 'PRが未マージ',
        requiredActions: [
          'Pull Requestをマージ',
        ],
        timestamp: new Date().toISOString(),
      };
    }

    // デプロイ成功チェック
    const isDeployed = issue.labels.some((l) =>
      l.name.includes('state:deploying') || l.name.includes('state:done')
    );

    if (!isDeployed) {
      return {
        result: 'fail',
        gate: 'G6-Acceptance',
        reason: 'デプロイが未完了',
        requiredActions: [
          'デプロイを実行',
          '本番動作確認',
        ],
        timestamp: new Date().toISOString(),
      };
    }

    // AL2維持チェック
    const isAL2 = issue.labels.some((l) => l.name === 'AL:AL2-Assured');
    if (!isAL2) {
      return {
        result: 'fail',
        gate: 'G6-Acceptance',
        reason: 'デプロイ後にAL2が失われた',
        requiredActions: [
          '本番環境でのOutcome/Safety状況を確認',
          'DESTAgent再実行',
        ],
        timestamp: new Date().toISOString(),
      };
    }

    // Outcome/Safety再評価
    const body = issue.body || '';
    if (ALJudge.hasRequiredFields(body)) {
      const { outcome, safety } = ALJudge.judgeFromIssue(body);

      if (!outcome.outcomeOk || !safety.safetyOk) {
        return {
          result: 'fail',
          gate: 'G6-Acceptance',
          reason: 'デプロイ後のOutcome/SafetyがNG',
          requiredActions: [
            'Outcome Assessment: Progressが improving/stable であることを確認',
            'Safety Assessment: Feedback loopsが stable であることを確認',
            'Safety Assessment: Violationsが none であることを確認',
          ],
          timestamp: new Date().toISOString(),
        };
      }
    }

    return {
      result: 'pass',
      gate: 'G6-Acceptance',
      reason: '本番受け入れ基準をすべて満たす',
      timestamp: new Date().toISOString(),
    };
  }

  // ========================================================================
  // ヘルパーメソッド
  // ========================================================================

  /**
   * セクション抽出
   */
  private extractSection(body: string, sectionName: string): string {
    const patterns = [
      new RegExp(`## ${sectionName}[\\s\\S]*?(?=##|$)`, 'i'),
      new RegExp(`## ${sectionName.replace(/\s/g, '\\s')}[\\s\\S]*?(?=##|$)`, 'i'),
    ];

    for (const pattern of patterns) {
      const match = body.match(pattern);
      if (match) {
        return match[0].replace(`## ${sectionName}`, '').trim();
      }
    }

    return '';
  }

  /**
   * フィールド値抽出（"- Field name: value" 形式から値を抽出）
   */
  private extractFieldValue(body: string, fieldName: string): string {
    // フィールド名の空白を\sに変換
    const escapedFieldName = fieldName.replace(/\s+/g, '\\s+');

    const patterns = [
      new RegExp(`[-*]\\s*${escapedFieldName}\\s*[::：]\\s*(.+?)(?=\\n|$)`, 'i'),
      new RegExp(`${escapedFieldName}\\s*[::：]\\s*(.+?)(?=\\n|$)`, 'i'),
    ];

    for (const pattern of patterns) {
      const match = body.match(pattern);
      if (match && match[1]) {
        return match[1].trim();
      }
    }

    return '';
  }

  /**
   * アイデアリスト解析
   */
  private parseIdeasList(ideasSection: string): Array<{
    title: string;
    selected: boolean;
    reason: string;
  }> {
    const ideas: Array<{ title: string; selected: boolean; reason: string }> = [];
    const lines = ideasSection.split('\n');

    let currentIdea: { title: string; selected: boolean; reason: string } | null = null;

    for (const line of lines) {
      // アイデアタイトル行
      if (line.match(/^[-*]\s+/)) {
        if (currentIdea) {
          ideas.push(currentIdea);
        }

        const cleaned = line.replace(/^[-*]\s+/, '').trim();
        const selected = line.includes('✅') || line.includes('[選択]');

        // タイトルと理由を分離（同じ行にある場合）
        let title = cleaned;
        let reason = '';

        // "アイデア: 説明。選択理由: ..." パターン
        const reasonMatch = cleaned.match(/[。．.]\s*(選択理由|理由|Reason|reasoning)[::：]\s*(.+)/i);
        if (reasonMatch) {
          title = cleaned.substring(0, reasonMatch.index! + 1);
          reason = reasonMatch[2] || '';
        } else {
          // "アイデア: 説明"の後に続く部分を理由として扱う
          const parts = cleaned.split(/[。．.]/);
          if (parts.length > 1) {
            title = parts[0] + (cleaned.includes('。') ? '。' : cleaned.includes('．') ? '．' : '.');
            reason = parts.slice(1).join('').trim();
          }
        }

        currentIdea = {
          title: title.replace(/✅|\[選択\]/g, '').trim(),
          selected,
          reason: reason.trim(),
        };
      } else if (currentIdea && line.trim()) {
        // 次の行に理由が続く場合
        currentIdea.reason += ' ' + line.trim();
      }
    }

    if (currentIdea) {
      ideas.push(currentIdea);
    }

    return ideas;
  }

  /**
   * SMART基準スコア計算
   */
  private calculateSMARTScore(body: string): SMARTScore {
    const specific = body.length > 200 && (body.includes('具体的') || body.includes('Specific'));
    const measurable = body.includes('測定') || body.includes('指標') || body.includes('Measurable');
    const achievable = body.includes('達成可能') || body.includes('Achievable');
    const relevant = body.includes('関連') || body.includes('Relevant');
    const timeBound = body.match(/\d+日|\d+週間|\d+ヶ月|期限|deadline/i) !== null;

    return {
      specific,
      measurable,
      achievable,
      relevant,
      timeBound,
      totalScore:
        (specific ? 1 : 0) +
        (measurable ? 1 : 0) +
        (achievable ? 1 : 0) +
        (relevant ? 1 : 0) +
        (timeBound ? 1 : 0),
    };
  }

  /**
   * Pull Request存在チェック
   */
  private async hasPullRequest(issue: GitHubIssue): Promise<boolean> {
    // 簡易実装: ラベルで判定
    return issue.labels.some(
      (l) =>
        l.name.includes('state:implementing') ||
        l.name.includes('state:reviewing') ||
        l.name.includes('state:testing') ||
        l.name.includes('state:deploying')
    );
  }

  /**
   * PR Draft状態チェック
   */
  private async isPRDraft(issue: GitHubIssue): Promise<boolean> {
    // 簡易実装: state:implementingでDraftと判定
    return issue.labels.some((l) => l.name.includes('state:implementing'));
  }

  /**
   * PR承認チェック
   */
  private async isPRApproved(issue: GitHubIssue): Promise<boolean> {
    // 簡易実装: state:testingまたはstate:deployingで承認済みと判定
    return issue.labels.some(
      (l) =>
        l.name.includes('state:testing') || l.name.includes('state:deploying')
    );
  }

  /**
   * PRマージチェック
   */
  private async isPRMerged(issue: GitHubIssue): Promise<boolean> {
    // 簡易実装: state:deployingまたはstate:doneでマージ済みと判定
    return issue.labels.some(
      (l) =>
        l.name.includes('state:deploying') || l.name.includes('state:done')
    );
  }
}
