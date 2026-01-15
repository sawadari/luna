---
description: Luna ChangeRequest - Kernel変更の提案・承認・追跡
---

# Luna ChangeRequest

凍結された Kernel（frozen）を変更する場合の ChangeRequest（変更要求）を管理します。

## 概要

**ChangeRequest** は、Baseline化（frozen）された Kernel を変更する際に必要なプロセスです。Kernelが frozen になると変更が制限されるため、変更が必要な場合は ChangeRequest を提出し、承認を得る必要があります。

## ChangeRequest とは

以下の要素を含む変更要求の記録です：

- **変更対象Kernel** - どのKernelを変更するか
- **変更理由** - なぜ変更が必要か
- **変更内容** - 何を変更するか
- **影響分析** - どこに影響するか
- **承認者** - 誰が承認したか
- **優先度** - 緊急度

## 使用方法

### ChangeRequest 作成

```bash
# テストスクリプトを実行
npx tsx scripts/test-change-request-agent.ts
```

または、TypeScriptコードで直接作成：

```typescript
import { ChangeRequestAgent } from './src/agents/change-request-agent';

const agent = new ChangeRequestAgent({
  githubToken: process.env.GITHUB_TOKEN,
  repository: 'sawadari/luna',
  verbose: true,
  dryRun: false,
});

// ChangeRequest 作成
const result = await agent.createChangeRequest({
  kernelId: 'KRN-001',
  reason: 'セキュリティ脆弱性の修正が必要',
  proposedChanges: 'AuthenticationService の暗号化アルゴリズムを SHA-256 から SHA-3 に変更',
  impactAnalysis: ['AuthenticationService', 'UserService', 'API Gateway'],
  priority: 'high',
  proposedBy: 'sawadari',
  issueNumber: 32,
});

console.log(`ChangeRequest created: ${result.data.id}`);
console.log(`Status: ${result.data.status}`);
```

### ChangeRequest 承認

Product Ownerが変更要求を承認：

```typescript
// ChangeRequest を承認
const approveResult = await agent.approveChangeRequest({
  changeRequestId: 'CR-001',
  approvedBy: 'ProductOwner',
  approvalNotes: 'Critical security fix approved',
});

console.log(`ChangeRequest approved: ${approveResult.data.id}`);
console.log(`Approved by: ${approveResult.data.approvedBy}`);
console.log(`Approved at: ${approveResult.data.approvedAt}`);
```

### ChangeRequest 却下

```typescript
// ChangeRequest を却下
const rejectResult = await agent.rejectChangeRequest({
  changeRequestId: 'CR-002',
  rejectedBy: 'ProductOwner',
  rejectionReason: 'Alternative solution exists',
});

console.log(`ChangeRequest rejected: ${rejectResult.data.id}`);
console.log(`Rejection reason: ${rejectResult.data.rejectionReason}`);
```

### ChangeRequest 実装完了

```typescript
// ChangeRequest の実装が完了
const implementResult = await agent.implementChangeRequest({
  changeRequestId: 'CR-001',
  implementedBy: 'sawadari',
  implementationNotes: 'SHA-3 migration completed, all tests passed',
  relatedPR: 'PR-123',
});

console.log(`ChangeRequest implemented: ${implementResult.data.id}`);
console.log(`Implemented by: ${implementResult.data.implementedBy}`);
console.log(`Related PR: ${implementResult.data.relatedPR}`);
```

### ChangeRequest 検索

```typescript
// ステータスで検索
const proposed = await agent.getChangeRequestsByStatus('proposed');
console.log(`Proposed change requests: ${proposed.length}`);

// Kernelで検索
const kernelChanges = await agent.getChangeRequestsByKernel('KRN-001');
console.log(`Change requests for KRN-001: ${kernelChanges.length}`);

// 優先度で検索
const highPriority = await agent.getChangeRequestsByPriority('high');
console.log(`High priority change requests: ${highPriority.length}`);
```

## ChangeRequest のステータス

```typescript
export type ChangeRequestStatus =
  | 'proposed'      // 提案済み（承認待ち）
  | 'approved'      // 承認済み（実装待ち）
  | 'rejected'      // 却下
  | 'implemented'   // 実装完了
  | 'cancelled';    // キャンセル
```

## ChangeRequest の構造

```typescript
export interface ChangeRequest {
  id: string;                           // 例: "CR-001"
  kernelId: string;                     // 変更対象Kernel
  reason: string;                       // 変更理由
  proposedChanges: string;              // 変更内容
  impactAnalysis: string[];             // 影響範囲
  priority: ChangeRequestPriority;      // 優先度
  proposedBy: string;                   // 提案者
  proposedAt: string;                   // 提案日時
  status: ChangeRequestStatus;          // ステータス
  approvedBy?: string;                  // 承認者
  approvedAt?: string;                  // 承認日時
  approvalNotes?: string;               // 承認メモ
  rejectedBy?: string;                  // 却下者
  rejectedAt?: string;                  // 却下日時
  rejectionReason?: string;             // 却下理由
  implementedBy?: string;               // 実装者
  implementedAt?: string;               // 実装日時
  implementationNotes?: string;         // 実装メモ
  sourceIssue?: string;                 // GitHub Issue番号
  relatedPR?: string;                   // 関連PR番号
  tags?: string[];                      // タグ
}
```

## 優先度

```typescript
export type ChangeRequestPriority =
  | 'critical'      // 緊急（セキュリティ、本番障害など）
  | 'high'          // 高（重要な機能変更）
  | 'medium'        // 中（通常の変更）
  | 'low';          // 低（軽微な変更）
```

## Self-Improvement での使用例

### luna自体のKernel変更時

```typescript
// 例: Issue #32 - AuthenticationServiceのセキュリティ強化

// 1. ChangeRequest 作成
const crResult = await changeRequestAgent.createChangeRequest({
  kernelId: 'KRN-005',
  reason: 'CVE-2026-XXXX により SHA-256 が脆弱性として報告された',
  proposedChanges: `
    1. AuthenticationService の暗号化アルゴリズムを SHA-256 から SHA-3 に変更
    2. 既存のハッシュ値をマイグレーション
    3. テストケースを更新
  `,
  impactAnalysis: [
    'AuthenticationService',
    'UserService',
    'API Gateway',
    'Database Schema',
  ],
  priority: 'critical',
  proposedBy: 'sawadari',
  issueNumber: 32,
});

// 2. Product Owner が承認
const approveResult = await changeRequestAgent.approveChangeRequest({
  changeRequestId: crResult.data.id,
  approvedBy: 'ProductOwner',
  approvalNotes: 'Critical security vulnerability - approved for immediate implementation',
});

// 3. 実装...

// 4. 実装完了を記録
const implementResult = await changeRequestAgent.implementChangeRequest({
  changeRequestId: crResult.data.id,
  implementedBy: 'sawadari',
  implementationNotes: `
    - SHA-3 migration completed
    - All tests passed (coverage: 95%)
    - Database migration successful
    - Deployed to production
  `,
  relatedPR: 'PR-156',
});

console.log(`ChangeRequest ${crResult.data.id}: ${implementResult.data.status}`);
```

### 通常の機能改善

```typescript
// 例: Issue #33 - KernelRegistryのパフォーマンス改善

const result = await changeRequestAgent.createChangeRequest({
  kernelId: 'KRN-010',
  reason: 'Kernel数が1000を超え、検索パフォーマンスが劣化',
  proposedChanges: `
    1. インデックス構造を最適化
    2. キャッシュ層を追加
    3. 検索アルゴリズムを改善
  `,
  impactAnalysis: [
    'KernelRegistryService',
    'SearchService',
    'Cache Layer',
  ],
  priority: 'medium',
  proposedBy: 'bob',
  issueNumber: 33,
});

// 承認プロセス...
```

### 緊急修正（Critical Priority）

```typescript
// 例: Issue #34 - 本番障害の緊急修正

const emergencyResult = await changeRequestAgent.createChangeRequest({
  kernelId: 'KRN-015',
  reason: '本番環境でメモリリークが発生、サービス停止の可能性',
  proposedChanges: `
    1. メモリリークの原因となっているコードを修正
    2. メモリ監視を強化
    3. 自動再起動メカニズムを追加
  `,
  impactAnalysis: [
    'MonitoringAgent',
    'DeploymentAgent',
    'HealthCheck Service',
  ],
  priority: 'critical',
  proposedBy: 'dave',
  issueNumber: 34,
});

// 緊急承認
const emergencyApprove = await changeRequestAgent.approveChangeRequest({
  changeRequestId: emergencyResult.data.id,
  approvedBy: 'ProductOwner',
  approvalNotes: 'Production incident - approved for emergency deployment',
});
```

## ChangeRequest の永続化

ChangeRequest は `change-requests.yaml` に保存されます：

```yaml
changeRequests:
  - id: CR-001
    kernelId: KRN-005
    reason: CVE-2026-XXXX により SHA-256 が脆弱性として報告された
    proposedChanges: |
      1. AuthenticationService の暗号化アルゴリズムを SHA-256 から SHA-3 に変更
      2. 既存のハッシュ値をマイグレーション
      3. テストケースを更新
    impactAnalysis:
      - AuthenticationService
      - UserService
      - API Gateway
      - Database Schema
    priority: critical
    proposedBy: sawadari
    proposedAt: '2026-01-15T14:00:00.000Z'
    status: implemented
    approvedBy: ProductOwner
    approvedAt: '2026-01-15T14:30:00.000Z'
    approvalNotes: Critical security vulnerability - approved for immediate implementation
    implementedBy: sawadari
    implementedAt: '2026-01-15T18:00:00.000Z'
    implementationNotes: SHA-3 migration completed, all tests passed
    sourceIssue: '32'
    relatedPR: 'PR-156'
```

## 統計情報

```typescript
// ChangeRequest統計を取得
const stats = await changeRequestAgent.getChangeRequestStats();

console.log(`Total change requests: ${stats.totalChangeRequests}`);
console.log(`Approved: ${stats.approvedCount}`);
console.log(`Implemented: ${stats.implementedCount}`);
console.log(`Pending approval: ${stats.proposedCount}`);
console.log(`Average approval time: ${stats.averageApprovalTime} hours`);
```

## Kernel との連携

Kernel が frozen の場合、変更には ChangeRequest が必要：

```typescript
import { KernelRegistryService } from './src/services/kernel-registry';
import { AuthorityService } from './src/services/authority-service';

const kernelRegistry = new KernelRegistryService();
const authorityService = new AuthorityService();

// Kernel を取得
const kernel = await kernelRegistry.getKernel('KRN-005');

if (kernel.maturity === 'frozen') {
  console.log('⚠️  Kernel is frozen. ChangeRequest required.');

  // ChangeRequest を作成
  const cr = await changeRequestAgent.createChangeRequest({
    kernelId: kernel.id,
    reason: 'Need to update security implementation',
    proposedChanges: '...',
    impactAnalysis: ['...'],
    priority: 'high',
    proposedBy: 'sawadari',
  });

  console.log(`ChangeRequest created: ${cr.data.id}`);
} else {
  console.log('✅ Kernel is not frozen. Direct changes allowed.');
}
```

## ワークフロー

```
1. Kernel が frozen
   ↓
2. ChangeRequest 作成
   ↓
3. Product Owner が承認 / 却下
   ↓
4. 承認された場合、実装開始
   ↓
5. 実装完了を記録
   ↓
6. Kernel を更新（新しいバージョン or 修正）
```

## ベストプラクティス

### 1. 影響分析を詳細に記録

`impactAnalysis` には、変更が影響する全てのコンポーネントを記録します。これにより、変更の影響範囲を把握できます。

### 2. 優先度を正確に設定

- **critical**: 本番障害、セキュリティ脆弱性
- **high**: 重要な機能変更
- **medium**: 通常の変更
- **low**: 軽微な変更

### 3. 実装メモを詳細に記録

`implementationNotes` には、実装内容、テスト結果、デプロイ結果を記録します。

### 4. GitHub Issue/PR とリンク

`sourceIssue` と `relatedPR` を必ず設定し、トレーサビリティを維持します。

## 関連コマンド

- `/luna-transition` - Maturity State遷移（frozen → draft は Product Owner のみ）
- `/luna-gate` - Gate Control（変更前にGateチェック推奨）
- `/luna-decision` - DecisionRecord作成（大きな変更には Decision が必要）
- `/luna-status` - Luna全体のステータス（ChangeRequest統計を含む）

---

💡 **ヒント**: ChangeRequest を使うことで、frozen Kernel への変更を追跡可能にし、無秩序な変更を防ぎます。
