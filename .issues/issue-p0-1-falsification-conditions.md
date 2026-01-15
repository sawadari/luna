# [P0] DecisionRecord に falsification_conditions フィールドを追加して再評価機能を実装

## 📋 概要

理想設計（unified_planning_and_ssot_framework.yaml）では、DecisionRecord に `falsification_conditions` フィールドが定義されていますが、現在の実装には存在しません。このフィールドは再評価（Reevaluation）の核となる機能です。

## 🎯 理想設計

```yaml
DecisionRecord:
  required_fields:
    - falsification_conditions  # 「どうなったら再評価すべきか」の条件
    - linked_evaluation_ids
    - remaining_risks
    - dissenting_views
    - impact_scope
    - linked_evidence
```

## 📊 現在の実装

```typescript
interface DecisionRecord {
  id: string;
  opportunityId: string;
  decisionType: 'adopt' | 'defer' | 'reject' | 'explore';
  chosenOptionId: string;
  decidedBy: string;
  decidedAt: string;
  rationale: string;
  tradeoffs: string[];
  alternatives: string[];
  // ❌ falsification_conditions 欠落
}
```

## ❌ ギャップ

1. **falsification_conditions** - 再評価トリガー条件が記録できない
2. **linked_evaluation_ids** - 評価記録へのリンクがない
3. **remaining_risks** - 残存リスクの記録がない
4. **dissenting_views** - 反対意見の記録がない
5. **impact_scope** - 影響範囲の記録がない
6. **linked_evidence** - 証跡へのリンクがない

## 🚀 実装内容

### 1. DecisionRecord型定義の拡張

```typescript
interface FalsificationCondition {
  id: string;
  condition: string;  // 「市場シェアが20%低下したら」など
  signal_ref?: string;  // 監視シグナルへの参照
  threshold?: number;
}

interface DecisionRecord {
  // 既存フィールド
  id: string;
  opportunityId: string;
  decisionType: 'adopt' | 'defer' | 'reject' | 'explore';
  chosenOptionId: string;
  decidedBy: string;
  decidedAt: string;
  rationale: string;
  tradeoffs: string[];
  alternatives: string[];

  // ✨ NEW: 追加フィールド
  falsificationConditions: FalsificationCondition[];  // 再評価条件
  linkedEvaluationIds: string[];  // 評価記録へのリンク
  remainingRisks: string[];  // 残存リスク
  dissentingViews?: string[];  // 反対意見
  impactScope: string[];  // 影響範囲
  linkedEvidence: string[];  // 証跡へのリンク
}
```

### 2. PlanningAgent での記録

```typescript
// src/agents/planning-agent.ts
const decisionRecord: DecisionRecord = {
  // ...既存フィールド
  falsificationConditions: [
    {
      id: 'fc-001',
      condition: 'ユーザー満足度が70%を下回る',
      signal_ref: 'sig.user_satisfaction',
      threshold: 0.7,
    },
    {
      id: 'fc-002',
      condition: 'コストが予算の120%を超える',
      signal_ref: 'sig.cost_ratio',
      threshold: 1.2,
    },
  ],
  linkedEvaluationIds: [],  // Phase 2 で実装予定
  remainingRisks: ['技術スタックの成熟度', 'サードパーティAPIの可用性'],
  dissentingViews: [],  // オプション
  impactScope: ['ユーザー認証', 'セッション管理'],
  linkedEvidence: [],  // Phase 2 で実装予定
};
```

### 3. ReevaluationPolicy の基礎実装

```typescript
// src/types/reevaluation.ts
interface ReevaluationTrigger {
  type: 'signal_threshold' | 'assumption_invalidated' | 'manual';
  source: string;  // Signal ID or Assumption ID
  detectedAt: string;
}

// src/services/reevaluation-service.ts
class ReevaluationService {
  async checkFalsificationConditions(
    decisionId: string
  ): Promise<ReevaluationTrigger[]> {
    // falsification_conditions を評価
    // threshold を超えた場合、ReevaluationTrigger を生成
  }
}
```

## ✅ Acceptance Criteria

- [ ] DecisionRecord 型に6つの新フィールドを追加
- [ ] PlanningAgent が falsificationConditions を記録
- [ ] TypeScript ビルドが成功する
- [ ] planning-agent.test.ts でテストが通る
- [ ] ReevaluationService の基礎実装（Phase 2 で本格実装）
- [ ] ドキュメント更新（型定義、使用例）

## 🔗 関連Issue

- Phase 2: #TBD - EvaluationRecord 実装（linked_evaluation_ids のため）
- Phase 2: #TBD - ReevaluationPolicy 完全実装

## 📚 参考資料

- `GAP_ANALYSIS.md` - Section 1.3 DecisionRecord (line 98-138)
- `unified_planning_and_ssot_framework.yaml` - DecisionRecord 定義

## 優先度

**P0 - Critical**: 再評価の核となる機能。Phase 1 で必須。

---

**推定工数**: 1-2週間
**Phase**: Phase 1 - Week 7-8
