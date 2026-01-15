---
description: Luna State Transition - Kernel Maturity State のロールベース遷移制御
---

# Luna State Transition

Kernel の Maturity State（成熟度）遷移をロールベース権限で制御し、責任を明確化します。

## 概要

**State Transition Authority** は、識学理論（Shikigaku Theory）に基づき、Kernelの状態遷移に対する責任者を明確化する仕組みです。各遷移には「誰が実行できるか」が定義されており、権限のないユーザーは状態を変更できません。

## Maturity State（成熟度）

Kernelは以下の5つの状態を持ちます：

```
draft → under_review → agreed → frozen → deprecated
  ↑          ↓           ↓
  └──────────┴───────────┘
   (差し戻し・再レビュー)
```

| State | 説明 |
|-------|------|
| **draft** | 下書き（作成中） |
| **under_review** | レビュー中 |
| **agreed** | 合意済み（承認済み） |
| **frozen** | 凍結（Baseline化、変更不可） |
| **deprecated** | 廃止 |

## 6種類のロール

| Role | 説明 | 責任 |
|------|------|------|
| **product_owner** | プロダクトオーナー | 価値裁定、Decision承認、例外承認、Baseline化、緊急リセット |
| **engineering_lead** | 技術リード | 技術評価、実装判断、アーキテクチャ決定 |
| **ssot_reviewer** | SSOT レビュワー | 整合性検証、状態遷移承認、トレーサビリティ確認 |
| **compliance_owner** | コンプライアンス責任者 | 法規評価、安全性評価、監査対応 |
| **security_owner** | セキュリティ責任者 | セキュリティ評価、脆弱性対応 |
| **author** | コンテンツ作成者 | Draft作成、レビュー要求 |

## 8つの遷移ルール

| 遷移 | 許可されたロール | 説明 |
|------|------------------|------|
| **draft → under_review** | author, ssot_reviewer | レビュー要求 |
| **under_review → agreed** | ssot_reviewer, product_owner | 承認 |
| **under_review → draft** | ssot_reviewer, product_owner | 差し戻し |
| **agreed → frozen** | product_owner, ssot_reviewer | Baseline化 |
| **frozen → deprecated** | product_owner のみ | 廃止 |
| **\* → draft** | product_owner のみ | 緊急リセット |
| **agreed → under_review** | product_owner, ssot_reviewer | 再レビュー |
| **deprecated → draft** | product_owner のみ | 復活 |

## 使用方法

### ロール割り当て

```bash
# テストスクリプトを実行
npx tsx scripts/test-authority-service.ts
```

または、TypeScriptコードで直接実行：

```typescript
import { AuthorityService } from './src/services/authority-service';

const service = new AuthorityService({
  verbose: true,
  dryRun: false,
});

// ユーザーにロールを割り当て
await service.assignRole('alice', ['product_owner'], 'admin', 'Product Owner');
await service.assignRole('bob', ['engineering_lead'], 'admin', 'Engineering Lead');
await service.assignRole('carol', ['ssot_reviewer'], 'admin', 'SSOT Reviewer');
await service.assignRole('dave', ['author'], 'admin', 'Content Author');

console.log('✅ Roles assigned to 4 users');
```

### 複数ロールの割り当て

```typescript
// 1人のユーザーが複数のロールを持つことが可能
await service.assignRole(
  'eve',
  ['product_owner', 'ssot_reviewer'],
  'admin',
  'Product Owner & SSOT Reviewer'
);

const eveRoles = await service.getUserRoles('eve');
console.log(`eve has roles: ${eveRoles.join(', ')}`);
// → "product_owner, ssot_reviewer"
```

### 権限チェック

```typescript
// ユーザーが遷移を実行できるかチェック
const canDaveReview = await service.canTransition('draft', 'under_review', 'dave');
console.log(`dave can transition draft → under_review: ${canDaveReview}`);
// → true (author は draft → under_review が可能)

const canDaveApprove = await service.canTransition('under_review', 'agreed', 'dave');
console.log(`dave can transition under_review → agreed: ${canDaveApprove}`);
// → false (author は under_review → agreed が不可)
```

### 状態遷移の実行

```typescript
import { TransitionRequest } from './src/types/authority';

// 遷移リクエストを作成
const request: TransitionRequest = {
  resourceId: 'KRN-001',
  from: 'draft',
  to: 'under_review',
  requestedBy: 'dave',
  requestedByRole: 'author',
  reason: 'Implementation completed, ready for review',
};

// 遷移を実行
const result = await service.executeTransition(request);

if (result.success) {
  console.log(`✅ Transition executed: ${result.history?.from} → ${result.history?.to}`);
  console.log(`   Changed by: ${result.history?.changedBy} (${result.history?.changedByRole})`);
  console.log(`   Reason: ${result.history?.reason}`);
} else {
  console.log(`❌ Transition failed: ${result.error}`);
}
```

### 遷移履歴の追跡

```typescript
// Kernel に maturityHistory が記録される
export interface KernelWithNRVV {
  // ... 既存フィールド

  // Maturity State Transition History
  maturityHistory?: TransitionHistory[];
}

// TransitionHistory の構造
export interface TransitionHistory {
  from: MaturityLevel;            // 遷移元
  to: MaturityLevel;              // 遷移先
  changedAt: string;              // 変更日時
  changedBy: string;              // 変更者
  changedByRole: Role;            // 変更者のロール
  reason?: string;                // 変更理由
}
```

## Self-Improvement での使用例

### luna自体の新機能追加時（Kernel遷移）

```typescript
// 例: Issue #30 - SignalRegistryに新機能を追加

// 1. ロール割り当て（初回のみ）
await service.assignRole('sawadari', ['author', 'ssot_reviewer'], 'admin');

// 2. Kernel を draft で作成
const kernel = {
  id: 'KRN-030',
  statement: 'SignalRegistry に Webhook 通知機能を追加',
  category: 'architecture',
  owner: 'sawadari',
  maturity: 'draft',
  maturityHistory: [],
  // ... 他のフィールド
};

// 3. 実装完了後、under_review へ遷移
const reviewRequest: TransitionRequest = {
  resourceId: 'KRN-030',
  from: 'draft',
  to: 'under_review',
  requestedBy: 'sawadari',
  requestedByRole: 'author',
  reason: 'Implementation completed, tests passed',
};

const reviewResult = await service.executeTransition(reviewRequest);
console.log(`Kernel ${reviewRequest.resourceId}: ${reviewResult.success ? 'REVIEW' : 'FAILED'}`);

// 4. レビュー後、agreed へ遷移
const agreeRequest: TransitionRequest = {
  resourceId: 'KRN-030',
  from: 'under_review',
  to: 'agreed',
  requestedBy: 'sawadari',
  requestedByRole: 'ssot_reviewer',
  reason: 'Review passed, NRVV traceability complete',
};

const agreeResult = await service.executeTransition(agreeRequest);
console.log(`Kernel ${agreeRequest.resourceId}: ${agreeResult.success ? 'AGREED' : 'FAILED'}`);

// 5. Baseline化（frozen）
const frozenRequest: TransitionRequest = {
  resourceId: 'KRN-030',
  from: 'agreed',
  to: 'frozen',
  requestedBy: 'ProductOwner',
  requestedByRole: 'product_owner',
  reason: 'Ready for production, create baseline',
};

const frozenResult = await service.executeTransition(frozenRequest);
console.log(`Kernel ${frozenRequest.resourceId}: ${frozenResult.success ? 'FROZEN' : 'FAILED'}`);
```

### 緊急リセット（Product Owner のみ）

```typescript
// 緊急時、Product Owner は任意の状態から draft へリセット可能
const resetRequest: TransitionRequest = {
  resourceId: 'KRN-030',
  from: 'frozen',
  to: 'draft',
  requestedBy: 'ProductOwner',
  requestedByRole: 'product_owner',
  reason: 'Critical bug found, rollback to draft for urgent fix',
};

const resetResult = await service.executeTransition(resetRequest);
console.log(`Emergency reset: ${resetResult.success ? 'SUCCESS' : 'FAILED'}`);
```

### 差し戻し（レビュー失敗）

```typescript
// レビュワーが under_review から draft へ差し戻し
const rejectRequest: TransitionRequest = {
  resourceId: 'KRN-031',
  from: 'under_review',
  to: 'draft',
  requestedBy: 'carol',
  requestedByRole: 'ssot_reviewer',
  reason: 'NRVV traceability incomplete, missing verification criteria',
};

const rejectResult = await service.executeTransition(rejectRequest);
console.log(`Review rejected: ${rejectResult.success ? 'BACK_TO_DRAFT' : 'FAILED'}`);
```

## 遷移履歴の確認

```typescript
// Kernel の maturityHistory を確認
const kernel = await kernelRegistry.getKernel('KRN-030');

console.log(`Kernel ${kernel.id} - Maturity History:`);
for (const history of kernel.maturityHistory || []) {
  console.log(`  ${history.from} → ${history.to}`);
  console.log(`    Changed by: ${history.changedBy} (${history.changedByRole})`);
  console.log(`    Reason: ${history.reason}`);
  console.log(`    At: ${history.changedAt}`);
}
```

## ロール統計

```typescript
// ユーザーロールの統計を取得
const stats = await service.getUserRoleStats();

console.log(`Total Users: ${stats.totalUsers}`);
console.log(`By Role:`);
console.log(`  - product_owner: ${stats.byRole.product_owner}`);
console.log(`  - engineering_lead: ${stats.byRole.engineering_lead}`);
console.log(`  - ssot_reviewer: ${stats.byRole.ssot_reviewer}`);
console.log(`  - compliance_owner: ${stats.byRole.compliance_owner}`);
console.log(`  - security_owner: ${stats.byRole.security_owner}`);
console.log(`  - author: ${stats.byRole.author}`);
```

## 永続化

ロール割り当ては `role-assignments.yaml` に保存されます：

```yaml
userRoles:
  - userId: alice
    roles:
      - product_owner
    assignedAt: '2026-01-15T10:00:00.000Z'
    assignedBy: admin
    notes: Product Owner

  - userId: dave
    roles:
      - author
    assignedAt: '2026-01-15T10:01:00.000Z'
    assignedBy: admin
    notes: Content Author

  - userId: eve
    roles:
      - product_owner
      - ssot_reviewer
    assignedAt: '2026-01-15T10:02:00.000Z'
    assignedBy: admin
    notes: Product Owner & SSOT Reviewer
```

## 識学理論（Shikigaku Theory）準拠

### 責任の明確化

各状態遷移に対して、**誰が実行できるか**を明確に定義：

```
draft → under_review: author, ssot_reviewer
under_review → agreed: ssot_reviewer, product_owner
agreed → frozen: product_owner, ssot_reviewer
frozen → deprecated: product_owner のみ
```

### 権限の委譲

- **Product Owner** は最終責任者（緊急リセット、廃止決定）
- **SSOT Reviewer** は品質保証責任者（整合性検証、状態遷移承認）
- **Author** はコンテンツ作成責任者（Draft作成、レビュー要求）

### 階層の設計

```
product_owner (最終責任者)
    ├── ssot_reviewer (品質保証)
    ├── engineering_lead (技術)
    ├── compliance_owner (法規)
    ├── security_owner (セキュリティ)
    └── author (作成者)
```

## 権限エラーの詳細ログ

権限がない場合、詳細なログが出力されます：

```
User dave does NOT have permission for transition: under_review → agreed
  User roles: author
  Required roles: ssot_reviewer, product_owner
```

## 関連コマンド

- `/luna-gate` - Gate Control (G2-G6)
- `/luna-decision` - DecisionRecord作成
- `/luna-exception` - Exception提案
- `/luna-status` - Luna全体のステータス

---

💡 **ヒント**: State Transition Authority を使うことで、「誰が何をする権限を持つか」が明確になり、責任の所在が明確化されます。
