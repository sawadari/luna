---
description: Luna Status - Luna全体のステータス・統計・健全性チェック
---

# Luna Status

Luna全体のステータス、統計情報、健全性を一括確認します。

## 概要

**Luna Status** は、Luna Self-Improvement System の全コンポーネントの状態を確認するコマンドです。Gate、Decision、Exception、ChangeRequest、Kernel、ロール割り当ての統計を一覧表示し、システムの健全性をチェックします。

## 使用方法

### 全体ステータス確認

```bash
# TypeScriptスクリプトで実行
npx tsx scripts/luna-status.ts
```

または、個別にコンポーネントの統計を取得：

```typescript
import { GateKeeperAgent } from './src/agents/gatekeeper-agent';
import { PlanningAgent } from './src/agents/planning-agent';
import { ExceptionRegistryAgent } from './src/agents/exception-agent';
import { ChangeRequestAgent } from './src/agents/change-request-agent';
import { AuthorityService } from './src/services/authority-service';
import { KernelRegistryService } from './src/services/kernel-registry';

// 各エージェントを初期化
const gateAgent = new GateKeeperAgent({ verbose: false });
const planningAgent = new PlanningAgent({ verbose: false });
const exceptionAgent = new ExceptionRegistryAgent({ verbose: false });
const changeRequestAgent = new ChangeRequestAgent({ verbose: false });
const authorityService = new AuthorityService({ verbose: false });
const kernelRegistry = new KernelRegistryService({ verbose: false });

// Gate 統計
const gateStats = await gateAgent.getGateStats();
console.log('📊 Gate Statistics:');
console.log(`  Total checks: ${gateStats.totalChecks}`);
console.log(`  Passed: ${gateStats.passedCount}`);
console.log(`  Failed: ${gateStats.failedCount}`);
console.log(`  Skipped: ${gateStats.skippedCount}`);
console.log(`  Pass rate: ${gateStats.passRate.toFixed(1)}%`);

// Decision 統計
const decisionStats = await planningAgent.getDecisionStats();
console.log('\n📊 Decision Statistics:');
console.log(`  Total decisions: ${decisionStats.totalDecisions}`);
console.log(`  Reevaluated: ${decisionStats.reevaluatedCount}`);
console.log(`  Active falsification conditions: ${decisionStats.activeFalsificationConditions}`);

// Exception 統計
const exceptionStats = await exceptionAgent.getExceptionStats();
console.log('\n📊 Exception Statistics:');
console.log(`  Total exceptions: ${exceptionStats.totalExceptions}`);
console.log(`  Approved: ${exceptionStats.approvedCount}`);
console.log(`  Expired: ${exceptionStats.expiredCount}`);
console.log(`  Pending approval: ${exceptionStats.proposedCount}`);

// ChangeRequest 統計
const crStats = await changeRequestAgent.getChangeRequestStats();
console.log('\n📊 ChangeRequest Statistics:');
console.log(`  Total change requests: ${crStats.totalChangeRequests}`);
console.log(`  Approved: ${crStats.approvedCount}`);
console.log(`  Implemented: ${crStats.implementedCount}`);
console.log(`  Pending approval: ${crStats.proposedCount}`);

// Role 統計
const roleStats = await authorityService.getUserRoleStats();
console.log('\n📊 Role Statistics:');
console.log(`  Total users: ${roleStats.totalUsers}`);
console.log(`  By role:`);
console.log(`    - product_owner: ${roleStats.byRole.product_owner}`);
console.log(`    - engineering_lead: ${roleStats.byRole.engineering_lead}`);
console.log(`    - ssot_reviewer: ${roleStats.byRole.ssot_reviewer}`);
console.log(`    - author: ${roleStats.byRole.author}`);

// Kernel 統計
const kernelStats = await kernelRegistry.getStatistics();
console.log('\n📊 Kernel Statistics:');
console.log(`  Total kernels: ${kernelStats.total_kernels}`);
console.log(`  By maturity:`);
console.log(`    - draft: ${kernelStats.by_maturity.draft}`);
console.log(`    - under_review: ${kernelStats.by_maturity.under_review}`);
console.log(`    - agreed: ${kernelStats.by_maturity.agreed}`);
console.log(`    - frozen: ${kernelStats.by_maturity.frozen}`);
console.log(`    - deprecated: ${kernelStats.by_maturity.deprecated}`);
console.log(`  Convergence rate: ${(kernelStats.convergence_rate * 100).toFixed(1)}%`);
```

## 統計情報の詳細

### Gate Statistics

```typescript
export interface GateStats {
  totalChecks: number;      // 総チェック数
  passedCount: number;      // 合格数
  failedCount: number;      // 不合格数
  skippedCount: number;     // スキップ数（例外承認）
  passRate: number;         // 合格率（%）
  byGate: Record<GateId, { passed: number; failed: number; skipped: number }>;
}
```

### Decision Statistics

```typescript
export interface DecisionStats {
  totalDecisions: number;                   // 総Decision数
  reevaluatedCount: number;                 // 再評価された数
  activeFalsificationConditions: number;    // アクティブな反証条件数
  byStatus: Record<string, number>;
}
```

### Exception Statistics

```typescript
export interface ExceptionStats {
  totalExceptions: number;      // 総Exception数
  approvedCount: number;        // 承認済み数
  rejectedCount: number;        // 却下数
  expiredCount: number;         // 期限切れ数
  proposedCount: number;        // 提案中（承認待ち）数
  invalidatedCount: number;     // 失効数
}
```

### ChangeRequest Statistics

```typescript
export interface ChangeRequestStats {
  totalChangeRequests: number;  // 総ChangeRequest数
  approvedCount: number;        // 承認済み数
  implementedCount: number;     // 実装完了数
  rejectedCount: number;        // 却下数
  proposedCount: number;        // 提案中（承認待ち）数
  cancelledCount: number;       // キャンセル数
  averageApprovalTime: number;  // 平均承認時間（時間）
}
```

### Role Statistics

```typescript
export interface RoleStats {
  totalUsers: number;           // 総ユーザー数
  byRole: Record<Role, number>; // ロール別ユーザー数
}
```

### Kernel Statistics

```typescript
export interface KernelStatistics {
  total_kernels: number;                        // 総Kernel数
  by_maturity: Record<MaturityLevel, number>;   // Maturity別数
  convergence_rate: number;                     // 収束率（frozen / total）
  last_computed: string;                        // 最終計算日時
}
```

## 健全性チェック

```typescript
// Luna システムの健全性をチェック
async function checkLunaHealth() {
  const gateStats = await gateAgent.getGateStats();
  const exceptionStats = await exceptionAgent.getExceptionStats();
  const crStats = await changeRequestAgent.getChangeRequestStats();
  const kernelStats = await kernelRegistry.getStatistics();

  console.log('\n🏥 Luna Health Check:');

  // Gate合格率
  if (gateStats.passRate < 80) {
    console.log('  ⚠️  Gate pass rate is low:', gateStats.passRate.toFixed(1), '%');
  } else {
    console.log('  ✅ Gate pass rate is healthy:', gateStats.passRate.toFixed(1), '%');
  }

  // Exception期限切れ
  if (exceptionStats.expiredCount > 0) {
    console.log('  ⚠️  Expired exceptions found:', exceptionStats.expiredCount);
  } else {
    console.log('  ✅ No expired exceptions');
  }

  // ChangeRequest承認待ち
  if (crStats.proposedCount > 5) {
    console.log('  ⚠️  Many pending change requests:', crStats.proposedCount);
  } else {
    console.log('  ✅ Pending change requests:', crStats.proposedCount);
  }

  // Kernel収束率
  if (kernelStats.convergence_rate < 0.5) {
    console.log('  ⚠️  Kernel convergence rate is low:', (kernelStats.convergence_rate * 100).toFixed(1), '%');
  } else {
    console.log('  ✅ Kernel convergence rate:', (kernelStats.convergence_rate * 100).toFixed(1), '%');
  }

  // 全体の健全性
  const isHealthy =
    gateStats.passRate >= 80 &&
    exceptionStats.expiredCount === 0 &&
    crStats.proposedCount <= 5 &&
    kernelStats.convergence_rate >= 0.5;

  if (isHealthy) {
    console.log('\n✅ Luna system is healthy');
  } else {
    console.log('\n⚠️  Luna system requires attention');
  }
}

await checkLunaHealth();
```

## Self-Improvement での使用例

### 開発セッション開始時

```typescript
// luna開発セッション開始時に全体ステータスを確認
console.log('🌙 Luna Development Session Starting...\n');

// 1. 全体ステータスを確認
await displayLunaStatus();

// 2. 健全性チェック
await checkLunaHealth();

// 3. 注意が必要な項目を表示
await displayActionItems();
```

### 定期レビュー

```typescript
// 週次レビューでLunaの状態を確認
async function weeklyReview() {
  console.log('📅 Luna Weekly Review\n');

  // Gate統計
  const gateStats = await gateAgent.getGateStats();
  console.log('Gate Results (This Week):');
  console.log(`  Passed: ${gateStats.passedCount}`);
  console.log(`  Failed: ${gateStats.failedCount}`);
  console.log(`  Pass Rate: ${gateStats.passRate.toFixed(1)}%`);

  // Decision統計
  const decisionStats = await planningAgent.getDecisionStats();
  console.log('\nDecisions (This Week):');
  console.log(`  New decisions: ${decisionStats.totalDecisions}`);
  console.log(`  Reevaluations: ${decisionStats.reevaluatedCount}`);

  // Exception統計
  const exceptionStats = await exceptionAgent.getExceptionStats();
  console.log('\nExceptions (This Week):');
  console.log(`  New exceptions: ${exceptionStats.proposedCount}`);
  console.log(`  Approved: ${exceptionStats.approvedCount}`);
  console.log(`  Expired: ${exceptionStats.expiredCount}`);

  // ChangeRequest統計
  const crStats = await changeRequestAgent.getChangeRequestStats();
  console.log('\nChange Requests (This Week):');
  console.log(`  New CRs: ${crStats.proposedCount}`);
  console.log(`  Implemented: ${crStats.implementedCount}`);
  console.log(`  Avg approval time: ${crStats.averageApprovalTime.toFixed(1)} hours`);

  // Kernel収束率
  const kernelStats = await kernelRegistry.getStatistics();
  console.log('\nKernel Convergence:');
  console.log(`  Total: ${kernelStats.total_kernels}`);
  console.log(`  Frozen: ${kernelStats.by_maturity.frozen}`);
  console.log(`  Convergence: ${(kernelStats.convergence_rate * 100).toFixed(1)}%`);
}

await weeklyReview();
```

## アクションアイテム検出

```typescript
// 対応が必要な項目を検出
async function displayActionItems() {
  console.log('\n📋 Action Items:\n');

  // 失敗したGateをチェック
  const failedGates = await gateAgent.getFailedGates();
  if (failedGates.length > 0) {
    console.log('⚠️  Failed Gates:');
    for (const gate of failedGates) {
      console.log(`  - ${gate.gateId}: ${gate.checkResults.filter(c => !c.passed).length} failures`);
    }
  }

  // 期限切れExceptionをチェック
  const expiredExceptions = await exceptionAgent.getExpiredExceptions();
  if (expiredExceptions.length > 0) {
    console.log('\n⚠️  Expired Exceptions:');
    for (const exception of expiredExceptions) {
      console.log(`  - ${exception.id}: ${exception.reason}`);
    }
  }

  // 承認待ちChangeRequestをチェック
  const proposedCRs = await changeRequestAgent.getChangeRequestsByStatus('proposed');
  if (proposedCRs.length > 0) {
    console.log('\n⏳ Pending Change Requests:');
    for (const cr of proposedCRs) {
      console.log(`  - ${cr.id}: ${cr.reason} (${cr.priority})`);
    }
  }

  // レビュー待ちKernelをチェック
  const underReviewKernels = await kernelRegistry.getKernelsByMaturity('under_review');
  if (underReviewKernels.length > 0) {
    console.log('\n👀 Kernels Under Review:');
    for (const kernel of underReviewKernels) {
      console.log(`  - ${kernel.id}: ${kernel.statement}`);
    }
  }
}

await displayActionItems();
```

## GitHub連携

GitHub Issueにステータスレポートを投稿：

```typescript
import { Octokit } from '@octokit/rest';

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

// ステータスレポートを生成
const statusReport = await generateStatusReport();

// Issueにコメント投稿
await octokit.issues.createComment({
  owner: 'sawadari',
  repo: 'luna',
  issue_number: 35,
  body: statusReport,
});
```

## ステータスレポート例

```markdown
# Luna Status Report - 2026-01-15

## 📊 Overall Statistics

- **Gate Pass Rate**: 92.5%
- **Total Decisions**: 15
- **Active Exceptions**: 2
- **Pending Change Requests**: 1
- **Kernel Convergence**: 68.3%

## ✅ Passed Gates (Last 7 days)

- G2: 5/5 (100%)
- G3: 4/5 (80%)
- G4: 6/6 (100%)
- G5: 5/5 (100%)
- G6: 8/9 (88.9%)

## ⚠️ Action Items

- [ ] Review failed G3 check (Issue #26)
- [ ] Approve pending ChangeRequest CR-003
- [ ] Invalidate expired Exception EXC-BND-002

## 📈 Trends

- Gate pass rate: ↑ 5% (from last week)
- Kernel convergence: ↑ 8% (from last week)
- Average approval time: ↓ 2 hours (from last week)

---

🌙 Generated by Luna Status
```

## 関連コマンド

- `/luna-gate` - Gate Control統計
- `/luna-decision` - Decision統計
- `/luna-exception` - Exception統計
- `/luna-transition` - ロール統計
- `/luna-change-request` - ChangeRequest統計

---

💡 **ヒント**: `/luna-status` を定期的に実行することで、Lunaシステム全体の健全性を把握し、問題を早期に発見できます。
