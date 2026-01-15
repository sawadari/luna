# [P0] State Transition Authority を実装して責任を明確化

## 📋 概要

理想設計（unified_planning_and_ssot_framework.yaml）では、Maturity State（draft → under_review → agreed → frozen）の遷移には権限制御があり、特定のロールのみが状態を変更できますが、現在の実装にはこの制御が存在しません。これにより、誰でも状態を変更できてしまい、責任の主語が不明確になります。

## 🎯 理想設計

```yaml
maturity_state_machine:
  states: [draft, under_review, agreed, frozen, deprecated]

  transition_authority:
    - transition: "draft -> under_review"
      allowed_roles: [role.author, role.ssot_reviewer]

    - transition: "under_review -> agreed"
      allowed_roles: [role.ssot_reviewer, role.product_owner]

    - transition: "agreed -> frozen"
      allowed_roles: [role.product_owner, role.ssot_reviewer]

    - transition: "frozen -> deprecated"
      allowed_roles: [role.product_owner]

    - transition: "* -> draft"
      allowed_roles: [role.product_owner]  # 緊急時のリセット

responsibility_model:
  roles:
    - role: product_owner
      responsibilities: [価値裁定, Decision承認, 例外承認, Baseline化]

    - role: engineering_lead
      responsibilities: [技術評価, 実装判断, アーキテクチャ決定]

    - role: ssot_reviewer
      responsibilities: [整合性検証, 状態遷移承認, トレーサビリティ確認]

    - role: compliance_owner
      responsibilities: [法規評価, 安全性評価, 監査対応]
```

## 📊 現在の実装

```typescript
// src/types/nrvv.ts
type MaturityLevel = 'draft' | 'under_review' | 'agreed' | 'frozen' | 'deprecated';

// ❌ 状態遷移の権限制御なし
// ❌ ロールベースの責任分離なし
// ❌ 遷移履歴の記録なし
```

## ❌ ギャップと影響

1. **権限制御不在** - 誰でも状態を変更できてしまう
2. **責任の主語不明** - 誰が承認したか記録されない
3. **ロール定義なし** - product_owner, engineering_lead などの概念がない
4. **遷移履歴なし** - いつ・誰が・なぜ状態を変更したか不明
5. **例外承認の主語不明** - 例外を誰が承認したか不明

## 🚀 実装内容

### 1. Role & Authority 型定義

```typescript
// src/types/authority.ts

export type Role =
  | 'product_owner'
  | 'engineering_lead'
  | 'ssot_reviewer'
  | 'compliance_owner'
  | 'security_owner'
  | 'author';

export interface UserRole {
  userId: string;
  roles: Role[];
}

export interface StateTransition {
  from: MaturityLevel | '*';
  to: MaturityLevel;
  allowedRoles: Role[];
}

export interface TransitionHistory {
  from: MaturityLevel;
  to: MaturityLevel;
  changedAt: string;
  changedBy: string;
  changedByRole: Role;
  reason?: string;
}
```

### 2. StateTransitionAuthority 設定

`src/config/state-transition-authority.ts` に全ての遷移ルールを定義します。

### 3. AuthorityService 実装

- assignRole メソッド - ユーザーにロールを割り当て
- getUserRoles メソッド - ユーザーのロールを取得
- canTransition メソッド - 状態遷移の権限チェック
- executeTransition メソッド - 状態遷移を実行

### 4. KernelRegistryService への統合

KernelRegistryService に `transitionKernelState` メソッドを追加し、権限チェック付きで状態遷移を行います。

### 5. Kernel 型への maturityHistory 追加

```typescript
export interface KernelWithNRVV {
  id: string;
  statement: string;
  category: KernelCategory;
  owner: string;
  maturity: MaturityLevel;

  // ✨ NEW: 遷移履歴
  maturityHistory?: TransitionHistory[];

  // ... 他のフィールド
}
```

## ✅ Acceptance Criteria

- [ ] Role & Authority 型定義を作成（authority.ts）
- [ ] STATE_TRANSITION_RULES を定義（state-transition-authority.ts）
- [ ] AuthorityService 実装
  - [ ] assignRole メソッド
  - [ ] getUserRoles メソッド
  - [ ] canTransition メソッド
  - [ ] executeTransition メソッド
- [ ] KernelRegistryService に transitionKernelState メソッド追加
- [ ] Kernel 型に maturityHistory フィールド追加
- [ ] TypeScript ビルドが成功する
- [ ] テストコード作成（authority-service.test.ts）
- [ ] ドキュメント更新

## 🔗 関連Issue

- Issue #2: ChangeRequest Flow 実装
- Issue #3: Gate Control 実装
- Issue #4: Exception Registry 実装

## 📚 参考資料

- `GAP_ANALYSIS.md` - Section 2.3 Maturity State Machine (line 389-410)
- `GAP_ANALYSIS.md` - Section 1.9 ResponsibilityModel (line 274-291)
- `unified_planning_and_ssot_framework.yaml` - transition_authority, ResponsibilityModel

## 優先度

**P0 - Critical**: 責任の明確化。Phase 1 で必須。

---

**推定工数**: 1-2週間
**Phase**: Phase 1 - Week 9-10
