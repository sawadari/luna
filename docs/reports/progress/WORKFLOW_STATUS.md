# Luna ワークフロー統合状況

## 📋 目標ワークフロー

```
Issue作成
  ↓
1. DEST判定（AL0/AL1/AL2）
  ↓
2. Planning Layer（Opportunity/Options/Decision）
  ↓
3. SSOT整合性チェック（既存カーネルとの整合）
  ↓
4. 実装（CodeGen → Review）
  ↓
5. テスト（TestAgent）
  ↓
6. SSOT記録（Verification証跡）
  ↓
7. デプロイ・監視
  ↓
8. SSOT記録（Validation証跡）
```

---

## ✅ 実装済みエージェント

### 独立実行エージェント

| エージェント | ファイル | 実装状況 | 説明 |
|------------|---------|---------|------|
| **DESTAgent** | `src/agents/dest-agent.ts` | ✅ 完成 | AL判定、AL0理由検出、Protocol routing |
| **PlanningAgent** | `src/agents/planning-agent.ts` | ✅ 完成 | Opportunity定義、Options評価、Decision記録 |
| **SSOTAgentV2** | `src/agents/ssot-agent-v2.ts` | ✅ 完成 | Kernel抽出、違反検出、NRVV管理 |
| **CodeGenAgent** | `src/agents/codegen-agent.ts` | ✅ 完成 | AI駆動コード生成（Claude Sonnet 4.5） |
| **ReviewAgent** | `src/agents/review-agent.ts` | ✅ 完成 | 静的解析、品質スコアリング |
| **TestAgent** | `src/agents/test-agent.ts` | ✅ 完成 | テスト実行、カバレッジ計測 |
| **DeploymentAgent** | `src/agents/deployment-agent.ts` | ✅ 完成 | 環境別デプロイ、ヘルスチェック |
| **MonitoringAgent** | `src/agents/monitoring-agent.ts` | ✅ 完成 | メトリクス収集、アラート生成 |

### CoordinatorAgent統合状況

| 工程 | エージェント | CoordinatorAgent統合 | 実行順序 |
|-----|------------|---------------------|---------|
| 0. DEST判定 | DESTAgent | ❌ **未統合** | - |
| 1. Planning | PlanningAgent | ❌ **未統合** | - |
| 2. SSOT整合性 | SSOTAgentV2 | ✅ **統合済み** | TASK-001 (最初) |
| 3. コード生成 | CodeGenAgent | ✅ 統合済み | TASK-002 |
| 4. コードレビュー | ReviewAgent | ✅ 統合済み | TASK-003 |
| 5. テスト | TestAgent | ✅ 統合済み | TASK-004 |
| 6. デプロイ | DeploymentAgent | ✅ 統合済み | TASK-005 |
| 7. 監視 | MonitoringAgent | ✅ 統合済み | TASK-006 |

---

## ❌ 未実装の統合ポイント

### 1. DESTAgent → CoordinatorAgent統合

**現状**: DESTAgentは独立したCLIツールとして実装されており、CoordinatorAgentから呼び出されない

**必要な実装**:
- CoordinatorAgentにDESTAgentを統合
- Issue処理の最初にDEST判定を実行
- AL0の場合は処理をブロック、AL1/AL2の場合は継続
- DEST判定結果をExecutionContextに記録

**ファイル**: `src/agents/coordinator-agent.ts`

```typescript
// 必要な追加
private destAgent: DESTAgent;  // constructor内

// executeWithIssue内の最初に追加
const destResult = await this.destAgent.execute(issue.number);
if (destResult.data?.al === 'AL0') {
  return { status: 'blocked', reason: 'AL0 detected' };
}
```

---

### 2. PlanningAgent → CoordinatorAgent統合

**現状**: PlanningAgentは独立したエージェントとして実装されており、CoordinatorAgentから呼び出されない

**必要な実装**:
- CoordinatorAgentにPlanningAgentを統合
- DEST判定後、Planning Layerを実行
- Opportunity/Options/Decisionを抽出
- PlanningDataをExecutionContextに記録

**ファイル**: `src/agents/coordinator-agent.ts`

```typescript
// 必要な追加
private planningAgent: PlanningAgent;  // constructor内

// DEST判定後に追加
const planningResult = await this.planningAgent.execute(issue.number);
executionContext.planningData = planningResult.data?.planningData;
```

---

### 3. SSOTAgentV2 ← PlanningData統合

**現状**: SSOTAgentV2はIssue本文からのみカーネルを抽出。PlanningLayerのDecisionRecordとの統合がない

**必要な実装**:
- SSOTAgentV2にPlanningDataを渡す
- DecisionRecordからカーネルを自動生成
- Opportunity/Options/Decisionの情報をNRVVに変換

**ファイル**: `src/agents/ssot-agent-v2.ts`

```typescript
// executeメソッドに引数追加
async execute(issueNumber: number, planningData?: PlanningData)

// Decision → Kernel変換ロジック追加
if (planningData?.decisionRecord) {
  const kernel = this.convertDecisionToKernel(planningData.decisionRecord);
  await this.kernelRegistry.saveKernel(kernel);
}
```

---

### 4. TestAgent → Verification証跡記録

**現状**: TestAgentはテストを実行するが、結果をkernels.yamlのVerificationに記録しない

**必要な実装**:
- TestAgent実行結果をVerificationとして記録
- KernelRegistryServiceを使用してVerificationを追加
- 対応するRequirementにトレース

**ファイル**: `src/agents/test-agent.ts`

```typescript
// 必要な追加
import { KernelRegistryService } from '../ssot/kernel-registry';

private kernelRegistry: KernelRegistryService;

// execute後に追加
const verification: Verification = {
  id: this.generateVerificationId(),
  statement: 'テストが正常に実行され、カバレッジ目標を達成することを確認',
  method: 'test',
  testCase: 'automated-tests',
  criteria: [`カバレッジ${context.coveragePercent}%達成`],
  traceability: { upstream: [relatedRequirementId], downstream: [] },
  status: context.allTestsPassed ? 'passed' : 'failed',
  verifiedAt: new Date().toISOString(),
  verifiedBy: 'TestAgent',
  evidence: [{
    type: 'test_result',
    path: 'test-output.log',
    createdAt: new Date().toISOString(),
  }],
};

await this.kernelRegistry.addVerificationToKernel(kernelId, verification);
```

---

### 5. DeploymentAgent/MonitoringAgent → Validation証跡記録

**現状**: DeploymentAgentとMonitoringAgentは実行するが、結果をkernels.yamlのValidationに記録しない

**必要な実装**:
- Deployment成功をValidationとして記録
- Monitoring結果をValidationとして記録
- 対応するNeedにトレース

**ファイル**: `src/agents/deployment-agent.ts`, `src/agents/monitoring-agent.ts`

```typescript
// deployment-agent.ts
const validation: Validation = {
  id: this.generateValidationId(),
  statement: 'システムが本番環境で正常に動作することを確認',
  method: 'field_test',
  criteria: [`デプロイ成功`, `ヘルスチェック通過`],
  traceability: { upstream: [relatedNeedId, relatedRequirementId], downstream: [] },
  status: 'passed',
  validatedAt: new Date().toISOString(),
  validatedBy: 'DeploymentAgent',
  evidence: [{
    type: 'field_data',
    path: 'deployment-log.json',
    createdAt: new Date().toISOString(),
  }],
};

await this.kernelRegistry.addValidationToKernel(kernelId, validation);
```

---

## 📊 統合度マトリクス

| 工程 | エージェント実装 | Coordinator統合 | SSOT記録 | 完成度 |
|-----|---------------|----------------|---------|--------|
| 0. DEST判定 | ✅ | ❌ | - | 50% |
| 1. Planning | ✅ | ❌ | - | 50% |
| 2. SSOT整合性 | ✅ | ✅ | ✅ | 100% |
| 3. コード生成 | ✅ | ✅ | ❌ | 66% |
| 4. コードレビュー | ✅ | ✅ | ❌ | 66% |
| 5. テスト | ✅ | ✅ | ❌ Verification未記録 | 66% |
| 6. デプロイ | ✅ | ✅ | ❌ Validation未記録 | 66% |
| 7. 監視 | ✅ | ✅ | ❌ Validation未記録 | 66% |

**全体完成度**: **62.5%** (5/8工程が完全統合)

---

## 🎯 次のステップ

### 優先度: P0（必須）

1. **DESTAgent統合** - Issue処理の入口となる重要な判定
2. **PlanningAgent統合** - Decision管理の中核
3. **Planning→SSOT連携** - DecisionからKernelへの自動変換

### 優先度: P1（重要）

4. **TestAgent→Verification記録** - テスト証跡の自動化
5. **DeploymentAgent→Validation記録** - デプロイ証跡の自動化
6. **MonitoringAgent→Validation記録** - 運用証跡の自動化

### 推定工数

| タスク | 工数 | 複雑度 |
|-------|-----|--------|
| DESTAgent統合 | 2-3時間 | 中 |
| PlanningAgent統合 | 2-3時間 | 中 |
| Planning→SSOT連携 | 3-4時間 | 高 |
| TestAgent→Verification | 2-3時間 | 中 |
| Deployment/Monitoring→Validation | 2-3時間 | 中 |
| **合計** | **11-16時間** | - |

---

## 💡 設計方針

### 1. CoordinatorAgentの拡張

```typescript
export class CoordinatorAgent {
  private destAgent: DESTAgent;
  private planningAgent: PlanningAgent;
  private ssotAgent: SSOTAgentV2;
  // ... 他のエージェント

  async executeWithIssue(issue: GitHubIssue) {
    // Phase 0: DEST判定
    const destResult = await this.destAgent.execute(issue.number);
    if (destResult.data?.al === 'AL0') {
      return { status: 'blocked', reason: 'AL0' };
    }

    // Phase 1: Planning Layer
    const planningResult = await this.planningAgent.execute(issue.number);
    const planningData = planningResult.data?.planningData;

    // Phase 2: SSOT整合性チェック（planningDataを渡す）
    const ssotResult = await this.ssotAgent.execute(issue.number, planningData);

    // Phase 3-7: 既存のパイプライン
    // ...
  }
}
```

### 2. ExecutionContextの拡張

```typescript
interface ExecutionContext {
  destJudgment?: DESTJudgmentResult;
  planningData?: PlanningData;
  ssotResult?: SSOTResult;
  // ... 既存のフィールド
}
```

### 3. SSOT自動記録

各エージェントは実行結果をKernelRegistryに記録:
- TestAgent → Verification
- DeploymentAgent → Validation
- MonitoringAgent → Validation

---

**最終更新日**: 2026-01-13
**作成**: Claude Sonnet 4.5
