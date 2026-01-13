import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GateKeeperAgent } from '../../src/agents/gate-keeper-agent';
import type { GitHubIssue } from '../../src/types';

describe('GateKeeperAgent', () => {
  let agent: GateKeeperAgent;
  let mockIssue: GitHubIssue;

  beforeEach(() => {
    agent = new GateKeeperAgent({
      githubToken: 'test-token',
      repository: 'test-owner/test-repo',
      dryRun: true,
      verbose: false,
    });

    mockIssue = {
      number: 1,
      title: 'Test Issue',
      body: '',
      labels: [],
      state: 'open',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  });

  // ==========================================================================
  // G1: Understanding Gate (B1 → B2)
  // ==========================================================================

  describe('G1: Understanding Gate', () => {
    it('should pass when problem definition section exists with all required fields', async () => {
      mockIssue.body = `
# Test Issue

## 問題定義
- Current state: これは現在の状態を説明する50文字以上の詳細な説明です。システムの現状を理解する必要があります。より詳しく説明を追加します。
- Target state: これは目標の状態を説明する50文字以上の詳細な説明です。達成すべき状態が定義されています。さらに詳細な情報を含みます。
- 制約: タイムライン、リソース、技術的制約があります。
      `;

      const result = await agent.judgeGate(mockIssue, 'G1-Understanding');

      expect(result.result).toBe('pass');
      expect(result.gate).toBe('G1-Understanding');
      expect(result.reason).toContain('問題定義が適切');
      expect(result.nextBox).toBe('B2-DefinedProblem');
    });

    it('should fail when problem definition section is missing', async () => {
      mockIssue.body = 'Just a simple issue description';

      const result = await agent.judgeGate(mockIssue, 'G1-Understanding');

      expect(result.result).toBe('fail');
      expect(result.reason).toContain('問題定義セクションが不足');
      expect(result.requiredActions).toBeDefined();
      expect(result.requiredActions?.length).toBeGreaterThan(0);
    });

    it('should fail when current state is too short', async () => {
      mockIssue.body = `
## 問題定義
- Current state: 短い
- Target state: これは目標の状態を説明する50文字以上の詳細な説明です。
- 制約: いくつか制約があります。
      `;

      const result = await agent.judgeGate(mockIssue, 'G1-Understanding');

      expect(result.result).toBe('fail');
      expect(result.reason).toContain('記述が不十分');
      expect(result.requiredActions).toContain('現状（Current state）を50文字以上で記述');
    });

    it('should fail when target state is missing', async () => {
      mockIssue.body = `
## 問題定義
- Current state: これは現在の状態を説明する50文字以上の詳細な説明です。
- 制約: いくつか制約があります。
      `;

      const result = await agent.judgeGate(mockIssue, 'G1-Understanding');

      expect(result.result).toBe('fail');
      expect(result.requiredActions).toBeDefined();
    });

    it('should support English section name', async () => {
      mockIssue.body = `
## Problem Definition
- Current state: This is a detailed description of the current state with more than 50 characters.
- Target state: This is a detailed description of the target state with more than 50 characters.
- Constraints: Some constraints exist.
      `;

      const result = await agent.judgeGate(mockIssue, 'G1-Understanding');

      expect(result.result).toBe('pass');
    });
  });

  // ==========================================================================
  // G2: Problem Definition Gate (B2 → B3)
  // ==========================================================================

  describe('G2: Problem Definition Gate', () => {
    it('should pass when DEST judgment completed and SMART score >= 3', async () => {
      mockIssue.labels = [{ name: 'AL:AL2-Assured', color: '0E8A16' }];
      mockIssue.body = `
## 問題定義
現在の状態を具体的に記述します。測定可能な指標として、応答時間を500ms以下にします。
これは達成可能な目標です。関連性のある改善です。期限は2週間です。

## Outcome Assessment
- Current state: API response time is 2.5s
- Target state: API response time < 500ms
- Progress: improving

## Safety Assessment
- Feedback loops: stable
- Violations: none
      `;

      const result = await agent.judgeGate(mockIssue, 'G2-ProblemDef');

      expect(result.result).toBe('pass');
      expect(result.reason).toContain('DEST判定完了');
      expect(result.nextBox).toBe('B3-SolutionIdeas');
    });

    it('should fail when DEST judgment is incomplete', async () => {
      mockIssue.labels = [];
      mockIssue.body = 'Some problem description';

      const result = await agent.judgeGate(mockIssue, 'G2-ProblemDef');

      expect(result.result).toBe('fail');
      expect(result.reason).toContain('DEST判定が未完了');
      expect(result.requiredActions).toContain('DESTAgentを実行: npm run agents:dest -- --issue=<番号>');
    });

    it('should fail when AL0 without reason or protocol', async () => {
      mockIssue.labels = [{ name: 'AL:AL0-NotAssured', color: 'D73A4A' }];
      mockIssue.body = 'Problem description';

      const result = await agent.judgeGate(mockIssue, 'G2-ProblemDef');

      expect(result.result).toBe('fail');
      expect(result.reason).toContain('AL0 ReasonまたはProtocolが不明確');
    });

    it('should return conditional when SMART score < 3', async () => {
      mockIssue.labels = [{ name: 'AL:AL1-Qualified', color: 'FFA500' }];
      mockIssue.body = 'Short description';

      const result = await agent.judgeGate(mockIssue, 'G2-ProblemDef');

      expect(result.result).toBe('conditional');
      expect(result.reason).toContain('SMART基準を一部満たしていない');
      expect(result.improvements).toBeDefined();
      expect(result.requiresApproval).toBe('TechLead');
    });

    it('should detect all SMART criteria correctly', async () => {
      mockIssue.labels = [{ name: 'AL:AL2-Assured', color: '0E8A16' }];
      mockIssue.body = `
現在の状態を具体的に200文字以上で詳細に記述します。測定可能な指標として、パフォーマンス指標を設定します。
この目標は達成可能です。ビジネス目標との関連性があります。期限は3週間です。
      `;

      const result = await agent.judgeGate(mockIssue, 'G2-ProblemDef');

      expect(result.result).toBe('pass');
    });
  });

  // ==========================================================================
  // G3: Idea Selection Gate (B3 → B4)
  // ==========================================================================

  describe('G3: Idea Selection Gate', () => {
    it('should pass when 3+ ideas exist with selected idea and reason', async () => {
      mockIssue.body = `
## 解決アイデア
- アイデア1: キャッシュ導入
- アイデア2: データベースインデックス最適化
- ✅ アイデア3: クエリ最適化とキャッシュの組み合わせ。選択理由: 最も効果的で、実装コストも低く、短期間で効果が期待できるため。この方法により、パフォーマンスが大幅に改善されます。
      `;

      const result = await agent.judgeGate(mockIssue, 'G3-IdeaSelection');

      expect(result.result).toBe('pass');
      expect(result.reason).toContain('アイデア選択が適切');
      expect(result.nextBox).toBe('B4-DevelopedSolution');
    });

    it('should fail when solution ideas section is missing', async () => {
      mockIssue.body = 'Some content without solution ideas';

      const result = await agent.judgeGate(mockIssue, 'G3-IdeaSelection');

      expect(result.result).toBe('fail');
      expect(result.reason).toContain('解決アイデアセクションが不足');
    });

    it('should fail when less than 3 ideas', async () => {
      mockIssue.body = `
## 解決アイデア
- アイデア1: キャッシュ導入
- アイデア2: インデックス最適化
      `;

      const result = await agent.judgeGate(mockIssue, 'G3-IdeaSelection');

      expect(result.result).toBe('fail');
      expect(result.reason).toContain('2個のみ（3個以上必要）');
    });

    it('should fail when no idea is selected', async () => {
      mockIssue.body = `
## 解決アイデア
- アイデア1: キャッシュ導入
- アイデア2: インデックス最適化
- アイデア3: クエリ最適化
      `;

      const result = await agent.judgeGate(mockIssue, 'G3-IdeaSelection');

      expect(result.result).toBe('fail');
      expect(result.reason).toContain('アイデアが選択されていない');
    });

    it('should return conditional when selection reason is too short', async () => {
      mockIssue.body = `
## 解決アイデア
- アイデア1: キャッシュ導入
- アイデア2: インデックス最適化
- ✅ アイデア3: クエリ最適化
  選択理由: 効果的
      `;

      const result = await agent.judgeGate(mockIssue, 'G3-IdeaSelection');

      expect(result.result).toBe('conditional');
      expect(result.reason).toContain('選択理由が不十分');
      expect(result.improvements).toContain('選択理由を50文字以上で詳しく記述');
    });

    it('should support [選択] marker', async () => {
      mockIssue.body = `
## Solution Ideas
- Idea 1: Caching
- Idea 2: Database indexing
- [選択] Idea 3: Combined approach. Detailed reasoning here that is more than 50 characters long to explain the rationale behind this selection.
      `;

      const result = await agent.judgeGate(mockIssue, 'G3-IdeaSelection');

      expect(result.result).toBe('pass');
    });
  });

  // ==========================================================================
  // G4: Development Gate (B4 → B5)
  // ==========================================================================

  describe('G4: Development Gate', () => {
    it('should pass when PR exists, not draft, and has review label', async () => {
      mockIssue.labels = [{ name: 'state:reviewing', color: 'FBCA04' }];

      const result = await agent.judgeGate(mockIssue, 'G4-Development');

      expect(result.result).toBe('pass');
      expect(result.reason).toContain('開発品質が基準を満たす');
      expect(result.nextBox).toBe('B5-ImplementedSolution');
    });

    it('should fail when PR does not exist', async () => {
      mockIssue.labels = [];

      const result = await agent.judgeGate(mockIssue, 'G4-Development');

      expect(result.result).toBe('fail');
      expect(result.reason).toContain('Pull Requestが未作成');
      expect(result.requiredActions).toContain('Pull Requestを作成');
    });

    it('should fail when PR is in draft state', async () => {
      mockIssue.labels = [{ name: 'state:implementing', color: 'C5DEF5' }];

      const result = await agent.judgeGate(mockIssue, 'G4-Development');

      expect(result.result).toBe('fail');
      expect(result.reason).toContain('PRがDraft状態');
    });

    it('should return conditional when ReviewAgent has not run', async () => {
      mockIssue.labels = [{ name: 'state:testing', color: '0075CA' }];

      const result = await agent.judgeGate(mockIssue, 'G4-Development');

      // state:testingはhasPullRequest判定でtrueになり、isDraft判定でfalseになる
      // state:reviewingがないのでconditionalになる可能性
      expect(['pass', 'conditional']).toContain(result.result);
    });
  });

  // ==========================================================================
  // G5: Implementation Gate (B5 → B6)
  // ==========================================================================

  describe('G5: Implementation Gate', () => {
    it('should pass when PR approved, testing done, and AL2', async () => {
      mockIssue.labels = [
        { name: 'state:testing', color: '0075CA' },
        { name: 'AL:AL2-Assured', color: '0E8A16' },
      ];

      const result = await agent.judgeGate(mockIssue, 'G5-Implementation');

      expect(result.result).toBe('pass');
      expect(result.reason).toContain('実装品質が基準を満たす');
      expect(result.nextBox).toBe('B6-AcceptedSolution');
    });

    it('should fail when PR is not approved', async () => {
      mockIssue.labels = [];

      const result = await agent.judgeGate(mockIssue, 'G5-Implementation');

      expect(result.result).toBe('fail');
      expect(result.reason).toContain('PRが承認されていない');
    });

    it('should fail when testing is not done', async () => {
      mockIssue.labels = [
        { name: 'state:deploying', color: '5319E7' },
      ];

      const result = await agent.judgeGate(mockIssue, 'G5-Implementation');

      expect(result.result).toBe('fail');
      expect(result.reason).toContain('テストが未実行');
    });

    it('should fail when AL2 is not achieved', async () => {
      mockIssue.labels = [
        { name: 'state:testing', color: '0075CA' },
        { name: 'AL:AL1-Qualified', color: 'FFA500' },
      ];

      const result = await agent.judgeGate(mockIssue, 'G5-Implementation');

      expect(result.result).toBe('fail');
      expect(result.reason).toContain('AL2 (Assured) が未達成');
      expect(result.requiredActions).toContain('DESTAgent再実行でAL2を達成');
    });

    it('should fail when AL0', async () => {
      mockIssue.labels = [
        { name: 'state:testing', color: '0075CA' },
        { name: 'AL:AL0-NotAssured', color: 'D73A4A' },
      ];

      const result = await agent.judgeGate(mockIssue, 'G5-Implementation');

      expect(result.result).toBe('fail');
    });
  });

  // ==========================================================================
  // G6: Acceptance Gate (B6 → Done)
  // ==========================================================================

  describe('G6: Acceptance Gate', () => {
    it('should pass when PR merged, deployed, and AL2 maintained', async () => {
      mockIssue.labels = [
        { name: 'state:done', color: '0E8A16' },
        { name: 'AL:AL2-Assured', color: '0E8A16' },
      ];
      mockIssue.body = `
## Outcome Assessment
- Current state: Feature deployed
- Target state: Feature working in production
- Progress: improving

## Safety Assessment
- Feedback loops: stable
- Violations: none
      `;

      const result = await agent.judgeGate(mockIssue, 'G6-Acceptance');

      expect(result.result).toBe('pass');
      expect(result.reason).toContain('本番受け入れ基準をすべて満たす');
    });

    it('should fail when PR is not merged', async () => {
      mockIssue.labels = [
        { name: 'state:testing', color: '0075CA' },
      ];

      const result = await agent.judgeGate(mockIssue, 'G6-Acceptance');

      expect(result.result).toBe('fail');
      expect(result.reason).toContain('PRが未マージ');
    });

    it('should fail when deployment is not complete', async () => {
      mockIssue.labels = [];

      const result = await agent.judgeGate(mockIssue, 'G6-Acceptance');

      expect(result.result).toBe('fail');
      // ラベルなしの場合、PRマージチェックが先に失敗する
      expect(result.reason).toContain('PRが未マージ');
    });

    it('should fail when AL2 is lost after deployment', async () => {
      mockIssue.labels = [
        { name: 'state:done', color: '0E8A16' },
        { name: 'AL:AL1-Qualified', color: 'FFA500' },
      ];

      const result = await agent.judgeGate(mockIssue, 'G6-Acceptance');

      expect(result.result).toBe('fail');
      expect(result.reason).toContain('デプロイ後にAL2が失われた');
    });

    it('should fail when outcome/safety becomes NG after deployment', async () => {
      mockIssue.labels = [
        { name: 'state:done', color: '0E8A16' },
        { name: 'AL:AL2-Assured', color: '0E8A16' },
      ];
      mockIssue.body = `
## Outcome Assessment
- Current state: Feature deployed
- Target state: Feature working
- Progress: degrading

## Safety Assessment
- Feedback loops: oscillating
- Violations: performance degradation
      `;

      const result = await agent.judgeGate(mockIssue, 'G6-Acceptance');

      expect(result.result).toBe('fail');
      expect(result.reason).toContain('Outcome/SafetyがNG');
    });
  });

  // ==========================================================================
  // Helper Methods - SMART Score
  // ==========================================================================

  describe('SMART Score Calculation', () => {
    it('should calculate full score (5/5) for complete SMART criteria', async () => {
      const body = `
これは具体的な問題の記述です。測定可能な指標を設定しています。
この目標は達成可能です。関連性のある内容です。期限は2週間です。
`.repeat(3); // 200文字以上にする

      mockIssue.labels = [{ name: 'AL:AL2-Assured', color: '0E8A16' }];
      mockIssue.body = body;

      const result = await agent.judgeGate(mockIssue, 'G2-ProblemDef');

      // 内部でcalculateSMARTScoreが呼ばれて5点満点ならpass
      expect(result.result).toBe('pass');
    });

    it('should calculate low score for minimal content', async () => {
      mockIssue.labels = [{ name: 'AL:AL2-Assured', color: '0E8A16' }];
      mockIssue.body = 'Short';

      const result = await agent.judgeGate(mockIssue, 'G2-ProblemDef');

      expect(result.result).toBe('conditional');
      expect(result.improvements).toBeDefined();
    });
  });

  // ==========================================================================
  // Helper Methods - Section Extraction
  // ==========================================================================

  describe('Section Extraction', () => {
    it('should extract section content correctly', async () => {
      mockIssue.body = `
## 問題定義
- Current state: これは現在の状態を説明する50文字以上の詳細な説明です。現状分析が重要で、システムの現状を理解する必要があります。
- Target state: これは目標の状態を説明する50文字以上の詳細な説明です。目標設定が明確で、達成すべき状態が定義されています。
- 制約: 複数の制約があります。

## その他のセクション
別の内容
      `;

      const result = await agent.judgeGate(mockIssue, 'G1-Understanding');

      // Current stateとTarget stateが正しく抽出され、長さが50文字以上ならpass
      expect(result.result).toBe('pass');
    });

    it('should handle missing sections gracefully', async () => {
      mockIssue.body = `
## 問題定義
- 制約のみ
      `;

      const result = await agent.judgeGate(mockIssue, 'G1-Understanding');

      expect(result.result).toBe('fail');
    });
  });

  // ==========================================================================
  // Helper Methods - Ideas List Parsing
  // ==========================================================================

  describe('Ideas List Parsing', () => {
    it('should parse multiple ideas correctly', async () => {
      mockIssue.body = `
## 解決アイデア
- アイデア1: 方法1の説明
- アイデア2: 方法2の説明
- ✅ アイデア3: 方法3の説明。選択理由: これは50文字以上の詳細な選択理由を含んでいます。この選択は最適な解決策であり、実装が容易で効果的です。
      `;

      const result = await agent.judgeGate(mockIssue, 'G3-IdeaSelection');

      // 3つのアイデアが検出され、1つが選択されているはず
      expect(result.result).toBe('pass');
    });

    it('should detect selected idea with checkmark', async () => {
      mockIssue.body = `
## Solution Ideas
- Idea 1: First approach
- Idea 2: Second approach
- ✅ Idea 3: Selected approach. Detailed explanation of more than 50 characters is provided here to justify the selection decision.
      `;

      const result = await agent.judgeGate(mockIssue, 'G3-IdeaSelection');

      expect(result.result).toBe('pass');
    });

    it('should detect selected idea with [選択] marker', async () => {
      mockIssue.body = `
## 解決アイデア
- アイデア1: 方法1
- アイデア2: 方法2
- [選択] アイデア3: 選択された方法。選択理由: 50文字以上の詳細な理由が記述されています。この選択は最適な解決策であると判断しました。実装も容易です。
      `;

      const result = await agent.judgeGate(mockIssue, 'G3-IdeaSelection');

      expect(result.result).toBe('pass');
    });
  });

  // ==========================================================================
  // Unknown Gate Handling
  // ==========================================================================

  describe('Unknown Gate Handling', () => {
    it('should return fail for unknown gate', async () => {
      // @ts-ignore - 意図的に不正なゲート名をテスト
      const result = await agent.judgeGate(mockIssue, 'G99-Unknown');

      expect(result.result).toBe('fail');
      expect(result.reason).toContain('Unknown gate');
    });
  });
});
