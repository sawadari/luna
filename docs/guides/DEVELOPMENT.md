# luna Development with luna itself

> **⚠️ LEGACY DOCUMENT WARNING (2026-02-08)**
>
> このドキュメントは Phase 1 MVP (DEST理論) に基づいています。**Phase A-C実装（2026-02-08完了）後は開発フローが変更されています**。
>
> **Phase A-C開発フロー**:
> 1. Issue作成（すべての変更の起点）
> 2. ChangeRequest作成・承認
> 3. KernelRuntime.apply(op) で実行
> 4. Ledgerに記録（Event Sourcing）
> 5. Graph構造検証
>
> 最新情報は [`README.md`](../../README.md) を参照してください。

**lunaでlunaを開発する** - メタ開発フロー

## 🌸 基本原則

lunaは自己改善型システムとして、自身の開発にlunaの機能を活用します。

## 📋 開発フロー

### 1. Issue作成（DEST対応）

すべてのIssueにはDEST判定のための情報を含めます：

```markdown
# [Issue タイトル]

[問題や機能の説明]

## Outcome Assessment
- Current state: [現在の状態]
- Target state: [目標状態]
- Progress: [improving/stable/degrading]

## Safety Assessment
- Feedback loops: [stable/oscillating/amplifying]
- Safety constraints: [安全要件]
- Violations: [none / 違反リスト]
```

### 2. DESTAgent実行

```bash
# Issue #2に対してDEST判定を実行
npm run agents:dest -- --issue=2
```

DESTAgentが自動的に：
- AL判定（AL0/AL1/AL2）
- AL0の場合、Reason検出（R01-R11）
- Protocol適用（P0-P4）
- ラベル付与とコメント投稿

### 3. Planning Layer（Phase 3）

AL1以上の場合、PlanningAgentが実行されます：

```bash
# 仮説生成、オプション比較、前提追跡
npm run agents:planning -- --issue=2
```

- Opportunity識別
- Option生成（3個以上）
- Decision記録
- Assumption追跡

### 4. SSOT Layer（Phase 4）

採用された決定はKernelとして管理されます：

```bash
# Kernel提案、成熟度管理
npm run agents:ssot -- --issue=2
```

- Kernel提案（DecisionRecord/Constraintから）
- Maturity遷移（draft → under_review → agreed → frozen）
- Violation検出
- 収束チェック

### 5. 実装フェーズ

```bash
# コード生成
npm run agents:codegen -- --issue=2

# コードレビュー
npm run agents:review -- --issue=2

# テスト実行
npm run agents:test -- --issue=2

# デプロイ
npm run agents:deploy -- --issue=2

# 監視
npm run agents:monitoring -- --issue=2
```

### 6. 完全自律実行

```bash
# CoordinatorAgentがすべてを統括
npm run agents:coordinator -- --issue=2
```

CoordinatorAgentがDAGベースでタスク分解し、並列実行します。

## 🎯 現在のIssue #2への適用

### ステップ1: DEST判定

Issue #2には既にOutcome/Safety Assessmentが含まれています。
DESTAgentを実行してAL判定を受けます：

```bash
cd luna
npm run agents:dest -- --issue=2
```

予想される結果：
- **AL1（条件付き）**: Outcomeは明確（100%合格）だが、Safety要監視（詳細実装が必要）
- **Reason**: なし（AL1なのでReasonは不要）
- **Next Action**: PlanningAgent実行へ

### ステップ2: 計画立案

```bash
npm run agents:planning -- --issue=2
```

PlanningAgentが：
1. 各エージェントの失敗テストを分析
2. 修正オプションを3個以上生成
3. 最適なアプローチを選択
4. 前提条件を記録

### ステップ3: Kernel化

採用された修正方針をKernelとして登録：

```bash
npm run agents:ssot -- --issue=2
```

例：
- **KRN-001**: "Planning LayerスキーマはYAML decision_record.ratiOnaileを優先的に使用する"（constraint）
- **KRN-002**: "Exception extension検出は改行を含むmultilineパターンを使用する"（requirement）

### ステップ4: 実装

CoordinatorAgentが自動実行：

```bash
npm run agents:coordinator -- --issue=2
```

または手動で各ステップ実行：

```bash
# コード生成（AI駆動）
npm run agents:codegen -- --issue=2

# レビュー（品質スコア80点以上必要）
npm run agents:review -- --issue=2

# テスト実行（100%合格目標）
npm run agents:test -- --issue=2
```

### ステップ5: デプロイ

```bash
# 自動デプロイ（health check + auto-rollback）
npm run agents:deploy -- --issue=2

# 監視開始
npm run agents:monitoring -- --issue=2
```

## 📊 識学理論（Shikigaku）の適用

luna開発は識学5原則に従います：

1. **責任の明確化**: 各AgentがIssueに責任を持つ
2. **権限の委譲**: Agentは自律的に判断・実行
3. **階層の設計**: CoordinatorAgent → 専門Agent
4. **結果の評価**: テスト合格率、品質スコア、カバレッジで評価
5. **曖昧性の排除**: DAG依存関係、明確な状態ラベル

## 🔄 継続的改善

### メトリクス追跡

```bash
# テスト合格率
npm test | grep "Tests"

# カバレッジ
npm run test:coverage

# エージェント実行履歴
gh issue list --label "agent:*"
```

### フィードバックループ

1. Issue作成 → DEST判定 → AL0なら即修正
2. 実装 → テスト → 失敗なら再計画
3. デプロイ → 監視 → アラートなら自動ロールバック

## 🌟 次のステップ

Issue #2を使ってlunaの自己改善サイクルを実証：

```bash
# 1. DEST判定
npm run agents:dest -- --issue=2

# 2. 計画立案
npm run agents:planning -- --issue=2

# 3. 完全自律実行
npm run agents:coordinator -- --issue=2
```

これにより、lunaは自身を改善しながら世界最高の知識創造プラットフォームへと進化します。

---

🌸 **luna** - Beauty in Autonomous Development
