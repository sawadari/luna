# [P0] ChangeRequest Flow を実装して変更手続きを一本化

## 📋 概要

理想設計（unified_planning_and_ssot_framework.yaml）では、全ての変更は ChangeRequest (CR) を経由する形式で正規化されますが、現在の実装にはこのフローが存在しません。これにより、変更手続きが野放しになり、トレーサビリティが失われています。

## 🎯 理想設計

```yaml
ChangeRequest:
  required_fields:
    - cr_id
    - raised_by
    - trigger_type  # regulation_change, safety_incident, etc.
    - affected_scope
    - proposed_operations  # [u.record_decision, u.set_state, etc.]
    - required_reviews  # [gate.review, gate.po_approval, etc.]
    - gate_outcome
    - state_transitions
    - decision_update_rule  # must_update_decision / may_update_decision
    - evidence_pack_refs
    - rollback_plan_ref

disturbance_to_cr_rules:
  - trigger_type: "regulation_change"
    default_proposed_operations: [u.link_evidence, u.record_decision, u.set_state, u.create_baseline]
    required_reviews: [gate.review, gate.po_approval, gate.evidence_verification]
    decision_update_rule: "must_update_decision"
```

## 📊 現在の実装

❌ **なし** - 変更手続きが一本化されていない

## ❌ ギャップと影響

1. **変更手続きの野放し** - 誰がどんな変更をしたか追跡できない
2. **Rollback 不可** - 変更を元に戻す仕組みがない
3. **外乱の正規化不可** - 法規変更などの外乱が CR に変換されない
4. **ゲート制御不在** - 承認プロセスがない
5. **トレーサビリティ断絶** - 変更理由が記録されない

## 🚀 実装内容

### 1. ChangeRequest 型定義

```typescript
// src/types/change-control.ts

export type TriggerType =
  | 'regulation_change'
  | 'safety_or_quality_incident'
  | 'market_or_customer_shift'
  | 'key_assumption_invalidated'
  | 'cost_or_schedule_disruption'
  | 'supplier_or_boundary_change'
  | 'ai_generated_contamination'
  | 'manual';

export type OperationType =
  | 'u.split'
  | 'u.merge'
  | 'u.retype'
  | 'u.rewire'
  | 'u.alias'
  | 'u.normalize_id'
  | 'u.link_evidence'
  | 'u.quarantine_evidence'
  | 'u.set_state'
  | 'u.create_baseline'
  | 'u.deprecate'
  | 'u.raise_exception'
  | 'u.close_exception'
  | 'u.record_decision';

export type GateType =
  | 'gate.review'
  | 'gate.po_approval'
  | 'gate.evidence_verification'
  | 'gate.compliance_check'
  | 'gate.security_review';

export type GateOutcome = 'approved' | 'rejected' | 'conditional' | 'pending';

export interface ChangeRequest {
  cr_id: string;
  raised_by: string;
  raised_at: string;
  trigger_type: TriggerType;
  affected_scope: string[];  // Kernel IDs or Need/Req IDs
  proposed_operations: OperationType[];
  required_reviews: GateType[];
  gate_outcome: GateOutcome;
  state_transitions?: string[];  // "draft -> under_review" など
  decision_update_rule: 'must_update_decision' | 'may_update_decision' | 'no_decision_update';
  evidence_pack_refs: string[];
  rollback_plan_ref?: string;
  notes?: string;
}
```

### 2. ChangeControlAgent 実装の骨格

- createChangeRequest メソッド
- executeChangeRequest メソッド
- rollbackChangeRequest メソッド
- getDefaultOperations メソッド
- getRequiredReviews メソッド
- getDecisionUpdateRule メソッド

### 3. change-requests.yaml への永続化

YAMLファイルで全てのChangeRequestを記録し、トレーサビリティを確保します。

## ✅ Acceptance Criteria

- [ ] ChangeRequest 型定義を作成（change-control.ts）
- [ ] ChangeControlAgent 実装
  - [ ] createChangeRequest メソッド
  - [ ] executeChangeRequest メソッド
  - [ ] rollbackChangeRequest メソッド
- [ ] change-requests.yaml への永続化
- [ ] 外乱からCRへの自動変換ルール実装
- [ ] Gate制御との統合（Issue #3 との連携）
- [ ] TypeScript ビルドが成功する
- [ ] テストコード作成（change-control-agent.test.ts）

## 🔗 関連Issue

- Issue #3: Gate Control (G2-G6) 実装
- Issue #5: State Transition Authority 実装
- Issue #4: Exception Registry 実装

## 📚 参考資料

- `GAP_ANALYSIS.md` - Section 2.9 Change Control (line 533-562)
- `unified_planning_and_ssot_framework.yaml` - ChangeRequest 定義

## 優先度

**P0 - Critical**: 変更手続きの一本化。Phase 1 で必須。

---

**推定工数**: 1-2週間
**Phase**: Phase 1 - Week 1-2
