---
description: Luna Decision Record - 設計判断の記録と反証可能性の追跡
---

# Luna Decision Record

Luna の DecisionRecord を作成・管理し、反証可能性（falsifiability）に基づく再評価を実現します。

## 概要

Karl Popperの反証可能性理論に基づき、設計判断（Decision）を記録し、どのような条件で判断が覆されるべきかを明示的に定義します。

## DecisionRecord とは

**DecisionRecord** は以下の情報を含む設計判断の記録です：

- **決定内容** - 何を決めたか
- **オプション評価** - どの選択肢を検討したか
- **評価基準** - 何を重視したか
- **反証条件（Falsification Conditions）** - どうなったら再評価すべきか ⭐
- **影響範囲** - どこに影響するか
- **残存リスク** - 何がリスクとして残るか
- **証拠リンク** - 何を根拠にしたか

## 使用方法

### DecisionRecord 作成

```bash
# テストスクリプトを実行
npx tsx scripts/test-planning-agent.ts
```

または、TypeScriptコードで直接作成：

```typescript
import { PlanningAgent } from './src/agents/planning-agent';

const agent = new PlanningAgent({
  githubToken: process.env.GITHUB_TOKEN,
  repository: 'sawadari/luna',
  verbose: true,
  dryRun: false,
});

// DecisionRecord 作成
const result = await agent.makeDecision({
  title: 'ReevaluationServiceにSignal統合機能を追加',
  context: 'Issue #26: Signal値が変化したときに自動で再評価をトリガーしたい',
  options: [
    {
      id: 'OPT-1',
      name: 'ポーリング方式',
      description: '定期的にSignal値をチェック',
      pros: ['実装が簡単', 'Signal側の変更不要'],
      cons: ['リアルタイム性が低い', 'リソース消費が大きい'],
      estimatedCost: 'low',
      estimatedRisk: 'low',
    },
    {
      id: 'OPT-2',
      name: 'イベント駆動方式',
      description: 'Signal値変化時にイベントを発火',
      pros: ['リアルタイム性が高い', 'リソース効率が良い'],
      cons: ['Signal側の実装が必要', '複雑度が高い'],
      estimatedCost: 'medium',
      estimatedRisk: 'medium',
    },
  ],
  criteria: {
    performance: 0.3,
    maintainability: 0.4,
    cost: 0.3,
  },
  decidedBy: 'sawadari',
  issueNumber: 26,
});

console.log(`Decision created: ${result.data.id}`);
console.log(`Chosen option: ${result.data.chosenOption.name}`);
console.log(`Falsification conditions: ${result.data.falsificationConditions.length}`);
```

### Falsification Conditions（反証条件）

DecisionRecordは**自動的に反証条件を生成**します。反証条件は「この条件を満たしたら判断を再評価すべき」という基準です。

**自動生成される反証条件の例**：

```yaml
falsificationConditions:
  - id: FC-001
    condition: "performance degradation > 20%"
    signalRef: "system.performance.response_time"
    threshold: 1.2
    thresholdComparison: "gt"

  - id: FC-002
    condition: "cost exceeds budget by 50%"
    signalRef: "project.cost.actual"
    threshold: 1.5
    thresholdComparison: "gt"

  - id: FC-003
    condition: "user satisfaction drops below 80%"
    signalRef: "user.satisfaction.score"
    threshold: 0.8
    thresholdComparison: "lt"
```

### ReevaluationService で再評価

```typescript
import { ReevaluationService } from './src/services/reevaluation-service';

const reevalService = new ReevaluationService({
  verbose: true,
  dryRun: false,
});

// Signal値を渡して反証条件をチェック
const checkResult = await reevalService.checkFalsificationConditions(
  'DEC-2026-001',
  {
    'system.performance.response_time': 1.25,  // 20%超の劣化
    'project.cost.actual': 1.3,
    'user.satisfaction.score': 0.85,
  }
);

if (checkResult.triggered.length > 0) {
  console.log('🚨 Falsification conditions triggered:');
  for (const trigger of checkResult.triggered) {
    console.log(`  - ${trigger.message}`);
  }

  // 再評価を開始
  const reevaluation = await reevalService.startReevaluation(
    'DEC-2026-001',
    checkResult.triggered[0],
    'sawadari'
  );

  console.log(`Reevaluation started: ${reevaluation.id}`);
}
```

## Self-Improvement での使用例

### luna自体の新機能追加時

```typescript
// 例: Issue #27 - SignalRegistryにWebhook機能を追加

// 1. DecisionRecord 作成
const decisionResult = await planningAgent.makeDecision({
  title: 'SignalRegistryにWebhook通知機能を追加',
  context: 'Signal値が変化したときに外部システムに通知したい',
  options: [
    {
      id: 'OPT-1',
      name: 'HTTP Webhook',
      description: 'HTTP POSTでWebhookを送信',
      pros: ['標準的', '多くのツールで対応'],
      cons: ['リトライ処理が必要', 'セキュリティ考慮必須'],
      estimatedCost: 'medium',
      estimatedRisk: 'medium',
    },
    {
      id: 'OPT-2',
      name: 'Message Queue',
      description: 'RabbitMQやKafkaを使用',
      pros: ['信頼性が高い', 'スケーラブル'],
      cons: ['インフラが必要', 'コストが高い'],
      estimatedCost: 'high',
      estimatedRisk: 'low',
    },
  ],
  criteria: {
    simplicity: 0.4,
    reliability: 0.3,
    cost: 0.3,
  },
  decidedBy: 'sawadari',
  issueNumber: 27,
});

// 2. 実装...

// 3. 運用中に反証条件をチェック
const checkResult = await reevalService.checkFalsificationConditions(
  decisionResult.data.id,
  {
    'webhook.failure_rate': 0.12,  // 失敗率12%
    'webhook.latency_p99': 3500,   // P99レイテンシ3.5秒
  }
);

// 4. 反証条件がトリガーされた場合、再評価
if (checkResult.triggered.length > 0) {
  console.log('Decision needs reevaluation due to:');
  for (const trigger of checkResult.triggered) {
    console.log(`  - ${trigger.message}`);
  }
}
```

## DecisionRecord の構造

```typescript
export interface DecisionRecord {
  id: string;
  createdAt: string;
  decidedBy: string;

  // 決定内容
  title: string;
  context: string;
  options: Option[];
  chosenOption: Option;
  criteria: Record<string, number>;
  rationale: string;

  // ✨ 反証可能性（Falsifiability）
  falsificationConditions: FalsificationCondition[];

  // トレーサビリティ
  linkedEvaluationIds: string[];
  linkedEvidence: string[];

  // リスク管理
  remainingRisks: string[];
  dissentingViews?: string[];

  // 影響範囲
  impactScope: string[];

  // メタデータ
  sourceIssue?: string;
  relatedPRs?: string[];
  tags?: string[];
}
```

## Falsification Condition の構造

```typescript
export interface FalsificationCondition {
  id: string;
  condition: string;              // 条件の説明
  signalRef?: string;             // Signalへの参照（例: "system.performance.cpu_usage"）
  threshold?: number;             // 閾値
  thresholdComparison?: 'gt' | 'lt' | 'gte' | 'lte' | 'eq' | 'neq';
}
```

## 再評価（Reevaluation）のワークフロー

```
1. Decision作成
   ↓
2. Falsification Conditions自動生成
   ↓
3. Signal値をモニタリング
   ↓
4. Falsification Conditionがトリガー
   ↓
5. 再評価開始（Reevaluation）
   ↓
6. 新しいDecisionを作成 or 既存Decisionを維持
   ↓
7. 再評価完了
```

## DecisionRecord の永続化

DecisionRecord は `decisions.yaml` に保存されます：

```yaml
decisions:
  - id: DEC-2026-001
    title: ReevaluationServiceにSignal統合機能を追加
    chosenOption:
      name: イベント駆動方式
    falsificationConditions:
      - id: FC-001
        condition: "performance degradation > 20%"
        signalRef: "system.performance.response_time"
        threshold: 1.2
        thresholdComparison: "gt"
    impactScope:
      - ReevaluationService
      - SignalRegistry
    remainingRisks:
      - Signal側の実装遅延リスク
    createdAt: '2026-01-15T12:00:00.000Z'
    decidedBy: sawadari
```

## 統計情報

```typescript
// Decision統計を取得
const stats = await planningAgent.getDecisionStats();

console.log(`Total decisions: ${stats.totalDecisions}`);
console.log(`Reevaluated: ${stats.reevaluatedCount}`);
console.log(`Active falsification conditions: ${stats.activeFalsificationConditions}`);
```

## 関連コマンド

- `/luna-gate` - Gate Control (G2-G6)
- `/luna-exception` - Exception提案
- `/luna-transition` - Maturity State遷移
- `/luna-status` - Luna全体のステータス

---

💡 **ヒント**: DecisionRecordは反証可能性を重視します。「どうなったら判断が間違っていたとわかるか」を明示することで、適切なタイミングで判断を見直せます。
