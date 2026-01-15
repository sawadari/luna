---
description: Luna Exception Registry - Boundary Exception の提案・承認・追跡
---

# Luna Exception Registry

Luna の Exception Registry を使って、設計判断の例外（Boundary Exception）を提案・承認・追跡します。

## 概要

**Boundary Exception（境界例外）** は、既存の設計判断（DecisionRecord）やルールに対する例外を管理する仕組みです。例外を明示的に記録することで、「なぜこのケースだけ特別扱いするのか」を追跡可能にします。

## Boundary Exception とは

以下の要素を含む例外の記録です：

- **例外の理由** - なぜ例外が必要か
- **影響範囲** - どこに影響するか
- **期限** - いつまで有効か（例: 2026-Q2）
- **承認者** - 誰が承認したか
- **リンク先Decision** - どのDecisionに対する例外か
- **失効条件** - どうなったら無効になるか

## 使用方法

### Exception 提案

```bash
# テストスクリプトを実行
npx tsx scripts/test-exception-agent.ts
```

または、TypeScriptコードで直接提案：

```typescript
import { ExceptionRegistryAgent } from './src/agents/exception-agent';

const agent = new ExceptionRegistryAgent({
  githubToken: process.env.GITHUB_TOKEN,
  repository: 'sawadari/luna',
  verbose: true,
  dryRun: false,
});

// Exception 提案
const result = await agent.proposeException({
  reason: '緊急修正のため、通常のレビュープロセスをスキップ',
  proposedBy: 'sawadari',
  expiresAt: '2026-Q2',
  impactScope: ['ReviewAgent', 'CoordinatorAgent'],
  linkedDecisionId: 'DEC-2026-001',
  invalidationCondition: '次のリリースサイクルで正規フローを実装',
  issueNumber: 28,
});

console.log(`Exception proposed: ${result.data.id}`);
console.log(`Status: ${result.data.status}`);
```

### Exception 承認

Product Ownerが例外を承認：

```typescript
// Exception を承認
const approveResult = await agent.approveException({
  exceptionId: 'EXC-BND-001',
  approvedBy: 'ProductOwner',
  approvalNotes: 'セキュリティ修正のため、例外を承認',
});

console.log(`Exception approved: ${approveResult.data.id}`);
console.log(`Approved by: ${approveResult.data.approvedBy}`);
console.log(`Approved at: ${approveResult.data.approvedAt}`);
```

### Exception 却下

```typescript
// Exception を却下
const rejectResult = await agent.rejectException({
  exceptionId: 'EXC-BND-002',
  rejectedBy: 'ProductOwner',
  rejectionReason: '通常フローで対応可能',
});

console.log(`Exception rejected: ${rejectResult.data.id}`);
console.log(`Rejection reason: ${rejectResult.data.rejectionReason}`);
```

### DecisionRecord に Exception をリンク

```typescript
// Decision に Exception をリンク
const linkResult = await agent.linkExceptionToDecision({
  exceptionId: 'EXC-BND-001',
  decisionId: 'DEC-2026-001',
  linkedBy: 'sawadari',
});

console.log(`Exception ${linkResult.data.exceptionId} linked to Decision ${linkResult.data.decisionId}`);
```

### Exception 検索

```typescript
// ステータスで検索
const proposed = await agent.getExceptionsByStatus('proposed');
console.log(`Proposed exceptions: ${proposed.length}`);

// Decisionで検索
const linkedExceptions = await agent.getExceptionsByDecision('DEC-2026-001');
console.log(`Exceptions for DEC-2026-001: ${linkedExceptions.length}`);

// 失効した例外を取得
const expired = await agent.getExpiredExceptions();
console.log(`Expired exceptions: ${expired.length}`);
```

## Exception のステータス

```typescript
export type ExceptionStatus =
  | 'proposed'      // 提案済み（承認待ち）
  | 'approved'      // 承認済み（有効）
  | 'rejected'      // 却下
  | 'expired'       // 期限切れ
  | 'invalidated';  // 失効条件により無効化
```

## Exception の構造

```typescript
export interface BoundaryException {
  id: string;                           // 例: "EXC-BND-001"
  reason: string;                       // 例外の理由
  proposedBy: string;                   // 提案者
  proposedAt: string;                   // 提案日時
  expiresAt?: string;                   // 失効日（例: "2026-Q2"）
  impactScope: string[];                // 影響範囲
  linkedDecisionId?: string;            // 関連Decision
  invalidationCondition?: string;       // 失効条件
  status: ExceptionStatus;              // ステータス
  approvedBy?: string;                  // 承認者
  approvedAt?: string;                  // 承認日時
  rejectedBy?: string;                  // 却下者
  rejectedAt?: string;                  // 却下日時
  rejectionReason?: string;             // 却下理由
  sourceIssue?: string;                 // GitHub Issue番号
  relatedPRs?: string[];                // 関連PR番号
  tags?: string[];                      // タグ
}
```

## Self-Improvement での使用例

### luna自体の緊急修正時

```typescript
// 例: Issue #28 - セキュリティ脆弱性の緊急修正

// 1. Exception 提案
const exceptionResult = await exceptionAgent.proposeException({
  reason: 'CVE-2026-XXXX セキュリティ脆弱性修正のため、通常のレビュープロセスをスキップ',
  proposedBy: 'sawadari',
  expiresAt: '2026-02-01',
  impactScope: ['ReviewAgent', 'TestAgent'],
  linkedDecisionId: 'DEC-2026-003',
  invalidationCondition: 'パッチ適用完了後、正規レビュープロセスに復帰',
  issueNumber: 28,
});

// 2. Product Owner が承認
const approveResult = await exceptionAgent.approveException({
  exceptionId: exceptionResult.data.id,
  approvedBy: 'ProductOwner',
  approvalNotes: 'Critical security fix - approved for emergency deployment',
});

// 3. 緊急デプロイ実行...

// 4. パッチ適用完了後、失効条件を確認
const exception = await exceptionAgent.getException(exceptionResult.data.id);
if (exception && exception.invalidationCondition) {
  console.log(`Remember to: ${exception.invalidationCondition}`);
}
```

### 技術的負債の一時的な例外

```typescript
// 例: Issue #29 - レガシーコードへの暫定対応

const result = await exceptionAgent.proposeException({
  reason: 'レガシーコードのリファクタリングが間に合わないため、一時的に古いAPIを維持',
  proposedBy: 'bob',
  expiresAt: '2026-Q3',
  impactScope: ['LegacyAPI', 'BackendService'],
  linkedDecisionId: 'DEC-2026-005',
  invalidationCondition: 'v2.0リリース時に新APIに完全移行',
  issueNumber: 29,
});

// 承認後、技術的負債として追跡
const approveResult = await exceptionAgent.approveException({
  exceptionId: result.data.id,
  approvedBy: 'ProductOwner',
  approvalNotes: 'Approved as technical debt. Must migrate by Q3.',
});
```

### 例外の定期レビュー

```typescript
// 全ての承認済み例外を取得
const approved = await exceptionAgent.getExceptionsByStatus('approved');

console.log('📋 Approved Exceptions Review:');
for (const exception of approved) {
  console.log(`\n  Exception: ${exception.id}`);
  console.log(`  Reason: ${exception.reason}`);
  console.log(`  Expires: ${exception.expiresAt || 'No expiration'}`);
  console.log(`  Impact: ${exception.impactScope.join(', ')}`);

  // 失効期限チェック
  if (exception.expiresAt) {
    const expiryDate = new Date(exception.expiresAt);
    const now = new Date();
    if (expiryDate < now) {
      console.log(`  ⚠️  EXPIRED - Should be invalidated`);
    }
  }
}

// 失効した例外を自動取得
const expired = await exceptionAgent.getExpiredExceptions();
console.log(`\n⚠️  Expired exceptions: ${expired.length}`);
```

## Exception の永続化

Exception は `exceptions.yaml` に保存されます：

```yaml
exceptions:
  - id: EXC-BND-001
    reason: 緊急修正のため、通常のレビュープロセスをスキップ
    proposedBy: sawadari
    proposedAt: '2026-01-15T10:00:00.000Z'
    expiresAt: '2026-Q2'
    impactScope:
      - ReviewAgent
      - CoordinatorAgent
    linkedDecisionId: DEC-2026-001
    invalidationCondition: 次のリリースサイクルで正規フローを実装
    status: approved
    approvedBy: ProductOwner
    approvedAt: '2026-01-15T11:00:00.000Z'
    approvalNotes: セキュリティ修正のため、例外を承認
    sourceIssue: '28'
```

## 統計情報

```typescript
// Exception統計を取得
const stats = await exceptionAgent.getExceptionStats();

console.log(`Total exceptions: ${stats.totalExceptions}`);
console.log(`Approved: ${stats.approvedCount}`);
console.log(`Expired: ${stats.expiredCount}`);
console.log(`Pending approval: ${stats.proposedCount}`);
```

## Gate との連携

Gate チェック時に例外を活用：

```typescript
import { GateKeeperAgent } from './src/agents/gatekeeper-agent';

const gateAgent = new GateKeeperAgent({
  githubToken: process.env.GITHUB_TOKEN,
  repository: 'sawadari/luna',
  verbose: true,
  dryRun: false,
});

// Gate を例外承認でスキップ
const exemptResult = await gateAgent.exemptGate({
  gateId: 'G3',
  reason: '緊急修正のため、Understanding フェーズを後回し',
  approvedBy: 'ProductOwner',
  expiresAt: '2026-Q2',
  linkedExceptionId: 'EXC-BND-001',
});

console.log(`Gate ${exemptResult.data.gateId} exempted`);
console.log(`Linked to exception: ${exemptResult.data.exemption?.linkedExceptionId}`);
```

## ベストプラクティス

### 1. 例外は一時的なもの

例外は常に**失効日（expiresAt）**または**失効条件（invalidationCondition）**を設定すべきです。永続的な例外は設計の欠陥を示します。

### 2. 影響範囲を明示

`impactScope` を正確に記録することで、例外がシステムのどこに影響するかを追跡できます。

### 3. 定期的なレビュー

承認済み例外を定期的にレビューし、失効した例外を無効化します。

### 4. DecisionRecord とのリンク

例外は常に元の Decision にリンクすることで、トレーサビリティを維持します。

## 関連コマンド

- `/luna-gate` - Gate Control (例外承認でGateスキップ可能)
- `/luna-decision` - DecisionRecord作成（例外のリンク先）
- `/luna-transition` - Maturity State遷移
- `/luna-status` - Luna全体のステータス（例外統計を含む）

---

💡 **ヒント**: 例外は「ルールを破る」ではなく「ルールに例外を明示的に記録する」ことで、長期的な品質を維持します。
