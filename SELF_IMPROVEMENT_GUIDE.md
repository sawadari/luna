# Luna Self-Improvement Guide

**日時**: 2026-01-15
**ステータス**: 📚 **完了**

---

## 📋 概要

このガイドでは、**Luna自身を使ってLunaを改善する**ワークフローを説明します。Lunaは自己改善システムとして設計されており、開発プロセス全体でLunaの機能（Gate Control、DecisionRecord、Exception Registry、State Transition Authority）を活用できます。

## 🎯 Self-Improvement の目的

1. **品質管理の自動化** - Gateチェックで各フェーズの品質を保証
2. **設計判断の追跡** - DecisionRecordで「なぜこう決めたか」を記録
3. **例外の明示化** - Exceptionで特別な判断を追跡可能に
4. **責任の明確化** - State Transitionでロールベース権限を管理
5. **変更の制御** - ChangeRequestで凍結Kernelへの変更を制御

## 🔄 Self-Improvement Workflow

### Phase 1: 問題定義（B1 → B2）

#### 1.1 GitHub Issue作成

Luna自身の改善・新機能を提案：

```bash
# GitHub上でIssue作成
# タイトル: [Luna Self-Improvement] SignalRegistryにWebhook機能を追加
# 本文:
#   - Opportunity: Signal値変化時に外部システムへ通知したい
#   - Problem: 現在は手動でSignal値を確認する必要がある
#   - Outcome: リアルタイムでSignal値変化を通知できる
```

#### 1.2 Gate G2 チェック（Problem Definition）

Claude Code上で `/luna-gate` コマンドを使用：

```typescript
// scripts/self-improve/check-g2.ts
import { GateKeeperAgent } from './src/agents/gatekeeper-agent';

const agent = new GateKeeperAgent({
  githubToken: process.env.GITHUB_TOKEN,
  repository: 'sawadari/luna',
  verbose: true,
});

const g2Result = await agent.checkGate({
  gateId: 'G2',
  checkedBy: 'sawadari',
  issueNumber: 36,
  context: {
    opportunity: 'Signal値変化時に外部システムへ通知',
    problem: '現在は手動でSignal値を確認する必要がある',
    outcome: 'リアルタイムでSignal値変化を通知できる',
  },
});

if (g2Result.data.status === 'passed') {
  console.log('✅ G2 passed - Ready to move to B2');
} else {
  console.log('❌ G2 failed - Fix issues before proceeding');
  g2Result.data.checkResults.forEach(check => {
    if (!check.passed) {
      console.log(`  - ${check.message}`);
    }
  });
}
```

### Phase 2: 理解と仮説（B2 → B3）

#### 2.1 システム分析

既存のSignalRegistryとReevaluationServiceを理解：

```bash
# コードを探索
npx tsx scripts/explore-codebase.ts --component SignalRegistry
npx tsx scripts/explore-codebase.ts --component ReevaluationService
```

#### 2.2 仮説作成

「Webhook機能を追加すれば、リアルタイム通知が可能」という仮説を立てる。

#### 2.3 Gate G3 チェック（Understanding & Hypotheses）

```typescript
const g3Result = await agent.checkGate({
  gateId: 'G3',
  checkedBy: 'sawadari',
  issueNumber: 36,
  context: {
    system_dynamics: '5点セット: stock(Signal値), flow(Webhook送信), delay(ネットワーク遅延), feedback(送信失敗時のリトライ), decision-info(Webhook設定)',
    hypothesis: 'HTTP Webhookを使えば、Signal値変化時に外部システムへリアルタイム通知できる',
    constraints: ['セキュリティ考慮（HMAC署名）', 'リトライ処理', 'レート制限'],
  },
});
```

### Phase 3: アイデア評価（B3 → B4）

#### 3.1 Decision作成

Claude Code上で `/luna-decision` コマンドを使用：

```typescript
// scripts/self-improve/create-decision.ts
import { PlanningAgent } from './src/agents/planning-agent';

const planningAgent = new PlanningAgent({
  githubToken: process.env.GITHUB_TOKEN,
  repository: 'sawadari/luna',
  verbose: true,
});

const decisionResult = await planningAgent.makeDecision({
  title: 'SignalRegistryにWebhook通知機能を追加',
  context: 'Issue #36: Signal値変化時に外部システムへ通知したい',
  options: [
    {
      id: 'OPT-1',
      name: 'HTTP Webhook',
      description: 'HTTP POSTでWebhookを送信',
      pros: ['標準的', '多くのツールで対応', '実装が比較的簡単'],
      cons: ['リトライ処理が必要', 'セキュリティ考慮必須', 'レート制限が必要'],
      estimatedCost: 'medium',
      estimatedRisk: 'medium',
    },
    {
      id: 'OPT-2',
      name: 'Message Queue (RabbitMQ)',
      description: 'Message Queueを使用した非同期通知',
      pros: ['信頼性が高い', 'スケーラブル', 'リトライ機能標準装備'],
      cons: ['インフラが必要', 'コストが高い', '複雑度が上がる'],
      estimatedCost: 'high',
      estimatedRisk: 'low',
    },
    {
      id: 'OPT-3',
      name: 'Server-Sent Events (SSE)',
      description: 'SSEでリアルタイムストリーム',
      pros: ['リアルタイム性が高い', 'HTTP上で動作', 'ブラウザ対応'],
      cons: ['サーバー側でコネクション管理必要', '双方向通信不可'],
      estimatedCost: 'low',
      estimatedRisk: 'medium',
    },
  ],
  criteria: {
    simplicity: 0.3,
    reliability: 0.4,
    cost: 0.3,
  },
  decidedBy: 'sawadari',
  issueNumber: 36,
});

console.log(`✅ Decision created: ${decisionResult.data.id}`);
console.log(`   Chosen: ${decisionResult.data.chosenOption.name}`);
console.log(`   Falsification conditions: ${decisionResult.data.falsificationConditions.length}`);
```

#### 3.2 Gate G4 チェック（Idea Traceability）

```typescript
const g4Result = await agent.checkGate({
  gateId: 'G4',
  checkedBy: 'sawadari',
  issueNumber: 36,
  context: {
    decision_record_id: decisionResult.data.id,
    option_set: 'OPT-1, OPT-2, OPT-3',
    lp_level_id: '8', // Level 8: Solution Alternatives
  },
});
```

### Phase 4: コンセプト実現（B4 → B5）

#### 4.1 実装開始

Webhookサービスを実装：

```typescript
// src/services/webhook-service.ts
export class WebhookService {
  async sendWebhook(url: string, payload: any): Promise<void> {
    // Webhook送信実装
  }

  async registerWebhook(signalId: string, url: string): Promise<void> {
    // Webhook登録実装
  }
}
```

#### 4.2 Kernel作成

```typescript
// scripts/self-improve/create-kernel.ts
import { KernelRegistryService } from './src/services/kernel-registry';

const kernelRegistry = new KernelRegistryService();

const kernel = await kernelRegistry.registerKernel({
  statement: 'SignalRegistry は Webhook 通知機能を提供する',
  category: 'architecture',
  owner: 'sawadari',
  maturity: 'draft',
  needs: [
    {
      id: 'N-036-1',
      statement: 'Signal値変化時にリアルタイムで通知が必要',
      stakeholder: 'ProductOwner',
      sourceType: 'stakeholder_requirement',
      priority: 'high',
      traceability: { upstream: [], downstream: ['R-036-1'] },
    },
  ],
  requirements: [
    {
      id: 'R-036-1',
      statement: 'Webhook URLを登録できる',
      type: 'functional',
      priority: 'must',
      rationale: 'Signal値変化時に外部システムへ通知するため',
      traceability: { upstream: ['N-036-1'], downstream: ['V-036-1'] },
    },
  ],
  verification: [
    {
      id: 'V-036-1',
      statement: 'Webhook送信のテスト',
      method: 'test',
      testCase: 'scripts/test-webhook-service.ts',
      criteria: ['正常にWebhookが送信される', 'リトライ処理が動作する'],
      traceability: { upstream: ['R-036-1'], downstream: [] },
      status: 'not_started',
    },
  ],
  validation: [],
});

console.log(`✅ Kernel created: ${kernel.id}`);
```

#### 4.3 State Transition: draft → under_review

Claude Code上で `/luna-transition` コマンドを使用：

```typescript
// scripts/self-improve/transition-kernel.ts
import { AuthorityService } from './src/services/authority-service';

const authorityService = new AuthorityService({ verbose: true });

// ロール割り当て（初回のみ）
await authorityService.assignRole('sawadari', ['author', 'ssot_reviewer'], 'admin');

// draft → under_review へ遷移
const transitionResult = await authorityService.executeTransition({
  resourceId: kernel.id,
  from: 'draft',
  to: 'under_review',
  requestedBy: 'sawadari',
  requestedByRole: 'author',
  reason: 'Implementation completed, tests passed, ready for review',
});

if (transitionResult.success) {
  console.log(`✅ Kernel ${kernel.id}: draft → under_review`);
} else {
  console.log(`❌ Transition failed: ${transitionResult.error}`);
}
```

#### 4.4 Gate G5 チェック（Concept Feasibility）

```typescript
const g5Result = await agent.checkGate({
  gateId: 'G5',
  checkedBy: 'sawadari',
  issueNumber: 36,
  context: {
    kernel_id: kernel.id,
    kernel_registered: true,
    nrvv_complete: true,
    test_coverage: 85,
  },
});
```

### Phase 5: 現場検証（B5 → B6）

#### 5.1 テスト実行

```bash
# テスト実行
npm test -- --coverage

# 期待: カバレッジ 80%以上
```

#### 5.2 State Transition: under_review → agreed

```typescript
// レビュー完了後、agreed へ遷移
const agreeResult = await authorityService.executeTransition({
  resourceId: kernel.id,
  from: 'under_review',
  to: 'agreed',
  requestedBy: 'sawadari',
  requestedByRole: 'ssot_reviewer',
  reason: 'NRVV traceability complete, all tests passed',
});

console.log(`✅ Kernel ${kernel.id}: under_review → agreed`);
```

#### 5.3 デプロイ

```bash
# 実際のデプロイ
npm run deploy -- --env production
```

#### 5.4 Gate G6 チェック（Field Validity）

```typescript
const g6Result = await agent.checkGate({
  gateId: 'G6',
  checkedBy: 'sawadari',
  issueNumber: 36,
  context: {
    test_coverage: 85,
    deploy_success: true,
    assurance_observation: 'Webhook通知が正常に動作していることを確認',
  },
});
```

#### 5.5 State Transition: agreed → frozen（Baseline化）

```typescript
// Product Ownerが承認後、frozen へ遷移
const frozenResult = await authorityService.executeTransition({
  resourceId: kernel.id,
  from: 'agreed',
  to: 'frozen',
  requestedBy: 'ProductOwner',
  requestedByRole: 'product_owner',
  reason: 'Production deployment successful, create baseline',
});

console.log(`✅ Kernel ${kernel.id}: agreed → frozen (Baseline)`);
```

### Phase 6: 継続的改善

#### 6.1 Falsification Condition のモニタリング

```typescript
// 反証条件をモニタリング
import { ReevaluationService } from './src/services/reevaluation-service';

const reevalService = new ReevaluationService({ verbose: true });

// Signal値を渡して反証条件をチェック
const checkResult = await reevalService.checkFalsificationConditions(
  decisionResult.data.id,
  {
    'webhook.failure_rate': 0.08,  // 失敗率8%
    'webhook.latency_p99': 2500,   // P99レイテンシ2.5秒
  }
);

if (checkResult.triggered.length > 0) {
  console.log('🚨 Falsification conditions triggered:');
  for (const trigger of checkResult.triggered) {
    console.log(`  - ${trigger.message}`);
  }

  // 再評価を開始
  const reevaluation = await reevalService.startReevaluation(
    decisionResult.data.id,
    checkResult.triggered[0],
    'sawadari'
  );
}
```

#### 6.2 Exception提案（必要な場合）

緊急修正が必要な場合、Exceptionを提案：

```typescript
// Claude Code上で /luna-exception コマンドを使用
import { ExceptionRegistryAgent } from './src/agents/exception-agent';

const exceptionAgent = new ExceptionRegistryAgent({
  githubToken: process.env.GITHUB_TOKEN,
  repository: 'sawadari/luna',
  verbose: true,
});

const exceptionResult = await exceptionAgent.proposeException({
  reason: 'Webhook送信でメモリリークが発見されたため、緊急修正が必要',
  proposedBy: 'sawadari',
  expiresAt: '2026-Q2',
  impactScope: ['WebhookService', 'SignalRegistry'],
  linkedDecisionId: decisionResult.data.id,
  invalidationCondition: 'メモリリーク修正完了後、正規フローに復帰',
  issueNumber: 37,
});

// Product Ownerが承認
const approveResult = await exceptionAgent.approveException({
  exceptionId: exceptionResult.data.id,
  approvedBy: 'ProductOwner',
  approvalNotes: 'Critical memory leak - approved for emergency fix',
});
```

#### 6.3 ChangeRequest作成（frozen Kernel変更時）

```typescript
// Claude Code上で /luna-change-request コマンドを使用
import { ChangeRequestAgent } from './src/agents/change-request-agent';

const changeRequestAgent = new ChangeRequestAgent({
  githubToken: process.env.GITHUB_TOKEN,
  repository: 'sawadari/luna',
  verbose: true,
});

const crResult = await changeRequestAgent.createChangeRequest({
  kernelId: kernel.id,
  reason: 'セキュリティ脆弱性CVE-2026-XXXXの修正',
  proposedChanges: 'HMAC署名検証アルゴリズムをSHA-256からSHA-3に変更',
  impactAnalysis: ['WebhookService', 'SignalRegistry', 'API Gateway'],
  priority: 'critical',
  proposedBy: 'sawadari',
  issueNumber: 38,
});

// Product Ownerが承認
const approveResult = await changeRequestAgent.approveChangeRequest({
  changeRequestId: crResult.data.id,
  approvedBy: 'ProductOwner',
  approvalNotes: 'Critical security vulnerability - approved',
});
```

#### 6.4 Status確認

Claude Code上で `/luna-status` コマンドを使用：

```typescript
// scripts/self-improve/check-status.ts
console.log('🌙 Luna Status Check\n');

// 全体ステータスを確認
const gateStats = await gateAgent.getGateStats();
const decisionStats = await planningAgent.getDecisionStats();
const exceptionStats = await exceptionAgent.getExceptionStats();
const crStats = await changeRequestAgent.getChangeRequestStats();
const roleStats = await authorityService.getUserRoleStats();
const kernelStats = await kernelRegistry.getStatistics();

console.log('📊 Overall Statistics:');
console.log(`  Gate Pass Rate: ${gateStats.passRate.toFixed(1)}%`);
console.log(`  Total Decisions: ${decisionStats.totalDecisions}`);
console.log(`  Active Exceptions: ${exceptionStats.approvedCount}`);
console.log(`  Pending CRs: ${crStats.proposedCount}`);
console.log(`  Kernel Convergence: ${(kernelStats.convergence_rate * 100).toFixed(1)}%`);

// 健全性チェック
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
```

## 🛠️ 利用可能なコマンド

Luna Self-Improvement System では、以下のコマンドをClaude Code上で使用できます：

| コマンド | 説明 |
|---------|------|
| `/luna-gate` | Gate Control (G2-G6) |
| `/luna-decision` | DecisionRecord作成 |
| `/luna-exception` | Exception提案 |
| `/luna-transition` | State Transition実行 |
| `/luna-change-request` | ChangeRequest作成 |
| `/luna-status` | 全体ステータス確認 |

## 📊 Self-Improvement の測定指標

Luna Self-Improvement Systemの効果を測定するための指標：

### 1. Gate Pass Rate

```
Gate Pass Rate = (Passed Gates / Total Gate Checks) × 100%

目標: 80%以上
```

### 2. Kernel Convergence Rate

```
Convergence Rate = (Frozen Kernels / Total Kernels) × 100%

目標: 50%以上
```

### 3. Decision Reevaluation Rate

```
Reevaluation Rate = (Reevaluated Decisions / Total Decisions) × 100%

適切な範囲: 5-15%
```

### 4. Exception Approval Time

```
Average Approval Time = Σ(Approved At - Proposed At) / Total Exceptions

目標: 24時間以内
```

### 5. ChangeRequest Implementation Time

```
Average Implementation Time = Σ(Implemented At - Approved At) / Total CRs

目標: 7日以内
```

## 🎯 ベストプラクティス

### 1. Gate を段階的にチェック

各フェーズで対応するGateをチェックし、品質を保証します。

### 2. Decision を早期に記録

設計判断は実装前に記録し、反証条件を明示します。

### 3. Exception は一時的に

例外は常に失効日または失効条件を設定し、永続化を避けます。

### 4. State Transition で責任を明確化

Kernelの状態遷移はロールベース権限で管理し、誰が何をするかを明確にします。

### 5. ChangeRequest で変更を制御

frozen Kernelへの変更は必ずChangeRequestを通し、影響分析を実施します。

### 6. Status を定期的に確認

週次または月次でLuna全体のステータスを確認し、健全性を維持します。

## 🔗 関連ドキュメント

- [README.md](./README.md) - プロジェクト概要
- [CLAUDE.md](./CLAUDE.md) - Claude Code コンテキスト
- [SETUP_GUIDE.md](./SETUP_GUIDE.md) - セットアップ手順
- [GETTING_STARTED.md](./GETTING_STARTED.md) - クイックスタート
- [MVP_VERIFICATION.md](./MVP_VERIFICATION.md) - MVP検証ドキュメント

## 📝 例: 完全なSelf-Improvementセッション

Issue #36「SignalRegistryにWebhook機能を追加」を例に、完全なワークフローを示します：

```bash
# 1. Issue作成
# GitHub上で Issue #36 を作成

# 2. G2 チェック
npx tsx scripts/self-improve/check-g2.ts --issue 36

# 3. G3 チェック
npx tsx scripts/self-improve/check-g3.ts --issue 36

# 4. Decision作成
npx tsx scripts/self-improve/create-decision.ts --issue 36

# 5. G4 チェック
npx tsx scripts/self-improve/check-g4.ts --issue 36

# 6. 実装
# WebhookService実装...

# 7. Kernel作成
npx tsx scripts/self-improve/create-kernel.ts --issue 36

# 8. State Transition: draft → under_review
npx tsx scripts/self-improve/transition-kernel.ts --kernel KRN-036 --to under_review

# 9. G5 チェック
npx tsx scripts/self-improve/check-g5.ts --issue 36

# 10. テスト実行
npm test -- --coverage

# 11. State Transition: under_review → agreed
npx tsx scripts/self-improve/transition-kernel.ts --kernel KRN-036 --to agreed

# 12. デプロイ
npm run deploy -- --env production

# 13. G6 チェック
npx tsx scripts/self-improve/check-g6.ts --issue 36

# 14. State Transition: agreed → frozen
npx tsx scripts/self-improve/transition-kernel.ts --kernel KRN-036 --to frozen

# 15. Status確認
npx tsx scripts/self-improve/check-status.ts
```

## 🚀 次のステップ

1. **Phase 1完了**: Luna Self-Improvement Systemの基本機能が完成
2. **Phase 2**: GitHub Actions統合、自動化の強化
3. **Phase 3**: Web UI/CLI ツールの開発
4. **Phase 4**: メトリクスダッシュボード、可視化

---

**作成日時**: 2026-01-15
**作成者**: Claude (Claude Code)
**リポジトリ**: [sawadari/luna](https://github.com/sawadari/luna)

🌙 **Luna Self-Improvement System - Use Luna to Improve Luna**
