---
description: Luna Gate Control - CrePS Box間遷移の品質ゲートチェック
---

# Luna Gate Control

CrePS (Creative Problem Solving) の Box 間遷移を管理する品質ゲート（G2-G6）をチェックします。

## 概要

Luna の Gate Control システムを使って、開発プロセスの各段階で品質基準を満たしているかチェックします。

## 利用可能な Gate

| Gate | 名称 | 遷移 | 説明 |
|------|------|------|------|
| **G2** | Problem Definition Gate | B1→B2 | 問題定義が明確か |
| **G3** | Understanding & Hypotheses Gate | B2→B3 | システム理解と仮説が十分か |
| **G4** | Idea Traceability Gate | B3→B4 | アイデアのトレーサビリティとLP分析 |
| **G5** | Concept Feasibility Gate | B4→B5 | コンセプトの実現可能性 |
| **G6** | Field Validity Gate | B5→B6 | 実装が現場で有効か |

## 使用方法

### Gate チェック実行

```bash
# テストスクリプトを実行
npx tsx scripts/test-gatekeeper-agent.ts
```

または、TypeScriptコードで直接実行：

```typescript
import { GateKeeperAgent } from './src/agents/gatekeeper-agent';

const agent = new GateKeeperAgent({
  githubToken: process.env.GITHUB_TOKEN,
  repository: 'sawadari/luna',
  verbose: true,
  dryRun: false,
});

// G2 チェック: Problem Definition
const result = await agent.checkGate({
  gateId: 'G2',
  checkedBy: 'username',
  issueNumber: 26,
  context: {
    opportunity: 'ReevaluationServiceに自動トリガー機能を追加',
    problem: '現在は手動でSignal値を入力する必要がある',
  },
});

console.log(`Gate ${result.data.gateId}: ${result.data.status}`);
result.data.checkResults.forEach(check => {
  console.log(`  ${check.message}`);
});
```

### Gate 例外承認

緊急時や特別な理由で Gate をスキップ：

```typescript
const exemptResult = await agent.exemptGate({
  gateId: 'G3',
  reason: '緊急修正のため、後で Understanding フェーズを完了予定',
  approvedBy: 'ProductOwner',
  expiresAt: '2026-Q2',
  linkedExceptionId: 'EXC-BND-001',
});
```

### Gate シーケンス強制

G2→G3→G4→G5→G6 の順序をチェック：

```typescript
const enforceResult = await agent.enforceGateSequence('G5');

if (!enforceResult.data.canProceed) {
  console.log(`Missing gates: ${enforceResult.data.missingGates.join(', ')}`);
}
```

## Gate チェック項目

### G2: Problem Definition Gate

- ✅ Opportunity が定義されている（必須）
- ✅ Problem statement が記述されている（必須）
- ✅ Outcome/Safety が DEST へ写像されている（必須）
- ⚪ Stakeholder が特定されている（任意）

### G3: Understanding & Hypotheses Gate

- ✅ stock/flow/delay/feedback/decision-info の5点セットが最低1つある（必須）
- ⚪ システムダイナミクスが記述されている（任意）
- ✅ 仮説が検証可能な形で記述されている（必須）
- ⚪ 制約条件が明示されている（任意）

### G4: Idea Traceability Gate

- ✅ 各アイデアに lp_level_id（12..1）が付与されている（必須）
- ✅ Decision Record が作成されている（必須）
- ✅ Option Set が評価されている（必須）
- ⚪ Value Model による評価が行われている（任意）

### G5: Concept Feasibility Gate

- ✅ Wait/Freeze/Revise の運用姿勢が仕様化されている（必須）
- ✅ Kernel が SSOT に登録されている（必須）
- ✅ NRVV トレーサビリティが完成している（必須）
- ⚪ テスト計画が作成されている（任意）

### G6: Field Validity Gate

- ✅ AL判定ログ（assurance_observation）がある（必須）
- ✅ テストが実行され、カバレッジ 80% 以上（必須）
- ✅ デプロイが成功している（必須）
- ⚪ 監視メトリクスが収集されている（任意）

## Self-Improvement での使用例

### luna自体の新機能追加時

```typescript
// 1. Issue #26: ReevaluationService自動トリガー機能追加

// 2. G2 チェック（Problem Definition）
const g2Result = await agent.checkGate({
  gateId: 'G2',
  checkedBy: 'sawadari',
  issueNumber: 26,
  context: {
    opportunity: 'Signal統合による自動再評価',
    problem: '現在は手動でSignal値を入力する必要がある',
  },
});
// → passed/failed

// 3. 実装...

// 4. G5 チェック（Concept Feasibility）
const g5Result = await agent.checkGate({
  gateId: 'G5',
  checkedBy: 'sawadari',
  issueNumber: 26,
  context: {
    kernel_registered: true,
    nrvv_complete: true,
  },
});
// → passed/failed

// 5. G6 チェック（Field Validity）
const g6Result = await agent.checkGate({
  gateId: 'G6',
  checkedBy: 'sawadari',
  issueNumber: 26,
  context: {
    test_coverage: 85,
    deploy_success: true,
  },
});
// → passed/failed
```

## Gate 統計

```typescript
const stats = await agent.getGateStats();

console.log(`Total checks: ${stats.totalChecks}`);
console.log(`Pass rate: ${stats.passRate.toFixed(1)}%`);
console.log(`Skipped: ${stats.skippedCount}`);
```

## 永続化

Gate 結果は `gates.yaml` に保存されます：

```yaml
gateResults:
  - gateId: G2
    status: passed
    checkedAt: '2026-01-15T12:00:00.000Z'
    checkedBy: sawadari
    issueNumber: 26
    checkResults:
      - checkId: G2-1
        passed: true
        message: ✅ Opportunity が定義されている
```

## 関連コマンド

- `/luna-decision` - DecisionRecord作成
- `/luna-exception` - Exception提案
- `/luna-status` - Luna全体のステータス

---

💡 **ヒント**: Gate を使うことで、luna開発の各段階で品質基準を満たしているか確認できます。
