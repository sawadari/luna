# [P0] Exception Registry を実装して例外制御を確立

## 📋 概要

理想設計（unified_planning_and_ssot_framework.yaml）では、例外（Exception）は ExceptionRegistry で一元管理され、期限・監視シグナル・緩和策が記録されますが、現在の実装には存在しません（ExceptionRegistryAgent は excluded）。これにより、例外が増殖し、期限切れが検出されず、制御不能になります。

## 🎯 理想設計

```yaml
ExceptionRecord:
  required_fields:
    - exception_id
    - type  # E_quality_over_speed, E_differentiation_over_cost, E_new_value_axis
    - approved_by
    - expiry_condition  # "2026-Q2終了時" など
    - monitoring_signal  # sig.quality_score など
    - mitigation_plan
    - status  # open/mitigated/closed/expired
    - linked_decision_id
    - linked_cr_id

lifecycle:
  - ExceptionProposal → 承認 → ExceptionRecord (open)
  - 期限到達 or 条件達成 → (expired/closed)
  - 緩和策実施 → (mitigated)
```

## 📊 現在の実装

❌ **なし** - ExceptionRegistryAgent は excluded

## ❌ ギャップと影響

1. **例外の正本管理不在** - どんな例外があるか不明
2. **期限切れ検出不可** - 無期限例外が放置される
3. **例外増殖の監視不可** - 例外IDが増え続ける
4. **緩和策の追跡不可** - 対策が実施されたか不明
5. **監視シグナルなし** - 例外が改善されたか検出できない

## 🚀 実装内容

### 1. Exception 型定義

```typescript
// src/types/exception.ts

export type ExceptionType =
  | 'E_quality_over_speed'      // 品質 > 速度
  | 'E_differentiation_over_cost' // 差別化 > コスト
  | 'E_new_value_axis'          // 新しい価値軸
  | 'E_boundary_exception'      // 境界例外
  | 'E_regulation_override'     // 規制オーバーライド
  | 'E_technical_debt';         // 技術的負債

export type ExceptionStatus = 'open' | 'mitigated' | 'closed' | 'expired';

export interface ExceptionProposal {
  proposal_id: string;
  type: ExceptionType;
  rationale: string;
  requested_by: string;
  requested_at: string;
  linked_decision_id?: string;
  requested_expiry_condition: string;
  proposed_mitigation_plan: string;
  monitoring_signal?: string;
}

export interface ExceptionRecord {
  exception_id: string;
  type: ExceptionType;
  approved_by: string;
  approved_at: string;
  expiry_condition: string;
  monitoring_signal?: string;
  mitigation_plan: string;
  status: ExceptionStatus;
  linked_decision_id?: string;
  linked_cr_id?: string;
  notes?: string;

  // 状態遷移履歴
  statusHistory: Array<{
    status: ExceptionStatus;
    changedAt: string;
    changedBy: string;
    reason: string;
  }>;
}
```

### 2. ExceptionRegistryAgent 実装

- proposeException メソッド - ExceptionProposal を提出
- approveException メソッド - ExceptionProposal を承認して ExceptionRecord に昇格
- updateExceptionStatus メソッド - Exception のステータスを更新
- detectExpiredExceptions メソッド - 期限切れ例外を検出
- evaluateExceptionsBySignal メソッド - 監視シグナルに基づいて例外を評価
- getExceptionStats メソッド - 例外統計を取得

### 3. exceptions.yaml への永続化

```yaml
# exceptions.yaml
proposals:
  - proposal_id: PROP-001
    type: E_quality_over_speed
    rationale: ユーザー体験を優先するため、パフォーマンス要件を緩和
    # ...

exceptions:
  - exception_id: EXC-QUA-1736856000000
    type: E_quality_over_speed
    approved_by: ProductOwner
    status: open
    # ...
```

### 4. CoordinatorAgent への統合

Phase 7（監視フェーズ）で期限切れ例外を検出し、GitHub Issue にコメント投稿します。

## ✅ Acceptance Criteria

- [ ] Exception 型定義を作成（exception.ts）
- [ ] ExceptionRegistryAgent 実装
  - [ ] proposeException メソッド
  - [ ] approveException メソッド
  - [ ] updateExceptionStatus メソッド
  - [ ] detectExpiredExceptions メソッド
  - [ ] evaluateExceptionsBySignal メソッド
  - [ ] getExceptionStats メソッド
- [ ] exceptions.yaml への永続化
- [ ] CoordinatorAgent への統合（期限切れ検出）
- [ ] TypeScript ビルドが成功する
- [ ] テストコード作成（exception-registry-agent.test.ts）
- [ ] ドキュメント更新

## 🔗 関連Issue

- Issue #2: ChangeRequest Flow 実装
- Issue #5: State Transition Authority 実装

## 📚 参考資料

- `GAP_ANALYSIS.md` - Section 2.11 Exception Registry (line 594-616)
- `unified_planning_and_ssot_framework.yaml` - ExceptionProposal, ExceptionRecord

## 優先度

**P0 - Critical**: 例外の制御。Phase 1 で必須。

---

**推定工数**: 1-2週間
**Phase**: Phase 1 - Week 3-4
