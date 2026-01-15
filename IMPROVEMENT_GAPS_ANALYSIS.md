# Kernel-Driven Development Flow - 改善点の洗い出し

## 理想のフロー vs 現実のギャップ

### 🎯 あるべき姿 (ユーザーの構想)

```
Issue (ユーザー要望)
  ↓
【Kernel生成】NRVV原則でブレイクダウン
  - Needs: 何のために？
  - Requirements: 何を満たす？
  - Verification: どう検証？
  - Validation: 妥当か？
  ↓
【タスク洗い出し】Kernelを基にタスク分解
  ↓
【プランニング】実行計画作成
  ↓
【コーディング】実装
  ↓
【Kernel更新】Verification/Validation結果を追記
  ↓
【次のIssue】蓄積されたKernelが品質向上に寄与
```

### ❌ 現状の問題点

#### 1. **CoordinatorAgent がKernelを参照していない**

**ファイル**: `src/agents/coordinator-agent.ts:258-319`

**問題**:
```typescript
private async decomposeToDAG(issue: GitHubIssue, _executionContext: any = {}): Promise<TaskDAG> {
  // ❌ executionContext を受け取っているが使っていない
  // ❌ Kernel Registry を参照していない
  // ❌ 固定のタスク定義のみ使用

  const taskDefinitions = this.getTaskDefinitions(type, complexity);
  // ⬆️ Issue のラベルと複雑度だけでタスク決定
}
```

**影響**:
- 過去のKernelから学習した「このタイプの要求には○○が必要」という知識が活用されない
- 毎回同じタスク定義で分解される
- **Kernelが蓄積されても品質向上につながらない**

**あるべき姿**:
```typescript
private async decomposeToDAG(issue: GitHubIssue, executionContext: any = {}): Promise<TaskDAG> {
  // ✅ Kernel Registry から関連Kernelを検索
  const relatedKernels = await this.findRelatedKernels(issue);

  // ✅ Kernelの Requirements からタスクを生成
  const taskDefinitions = this.generateTasksFromKernels(relatedKernels, issue);

  // ✅ 過去の Verification パターンからテスト戦略を決定
  const testStrategy = this.determineTestStrategy(relatedKernels);
}
```

---

#### 2. **CodeGenAgent がKernelを参照していない**

**ファイル**: `src/agents/codegen-agent.ts:113-150`

**問題**:
```typescript
private analyzeIssue(issue: GitHubIssue): { ... } {
  // ❌ Issue body とラベルだけで分析
  // ❌ Kernel Registry を参照していない
  // ❌ 過去の Requirements や Constraints を考慮しない

  let type: 'feature' | 'bug' | 'refactor' | 'test' | 'docs' = 'feature';
  if (labels.includes('bug') || title.includes('fix')) {
    type = 'bug';
  }
  // ⬆️ ラベルベースの単純な判定のみ
}
```

**影響**:
- 類似の要求で過去に定義された Requirements が無視される
- セキュリティや品質の Constraints が毎回ゼロから考え直される
- **Kernelに蓄積された知識が活用されない**

**あるべき姿**:
```typescript
private async analyzeIssueWithKernels(
  issue: GitHubIssue,
  kernels: KernelWithNRVV[]
): Promise<EnrichedAnalysis> {
  // ✅ Kernel の Requirements を参照
  const requirements = this.extractRequirementsFromKernels(kernels);

  // ✅ Kernel の Constraints を取得 (セキュリティ、品質基準)
  const constraints = this.extractConstraintsFromKernels(kernels);

  // ✅ 過去の Verification 結果から注意点を抽出
  const caveats = this.extractCaveatsFromVerifications(kernels);

  return {
    type, complexity, language,
    requirements,    // ← Kernelから
    constraints,     // ← Kernelから
    caveats,        // ← Kernelから
  };
}
```

---

#### 3. **CodeGenAgent がKernelを更新していない**

**ファイル**: `src/agents/codegen-agent.ts:40-107`

**問題**:
```typescript
async execute(issueNumber: number): Promise<AgentResult<CodeGenContext>> {
  // 1. Issue取得
  // 2. Issue分析
  // 3. コード生成
  // 4. 品質メトリクス計算
  // 5. 結果作成

  return { status: 'success', data: context };
  // ❌ Kernel を更新していない
  // ❌ Verification 結果を記録していない
}
```

**影響**:
- コード生成の結果が Kernel に反映されない
- Verification (テスト結果) が Kernel に記録されない
- **Self-Improvement Loop が閉じない**

**あるべき姿**:
```typescript
async execute(issueNumber: number): Promise<AgentResult<CodeGenContext>> {
  // ... コード生成 ...

  // ✅ Kernel を更新
  await this.updateKernelWithGeneratedCode(kernelId, {
    relatedArtifacts: generatedCode.map(c => ({
      type: 'code',
      path: c.path,
      description: c.description,
    })),
    history: [{
      timestamp: new Date().toISOString(),
      action: 'code_generated',
      by: 'CodeGenAgent',
      notes: `Generated ${generatedCode.length} files`,
    }],
  });

  return { status: 'success', data: context };
}
```

---

#### 4. **TestAgent の結果がKernelに反映されていない**

**ファイル**: `src/agents/test-agent.ts`

**問題**:
- テスト実行結果が独立して保存される
- Kernel の Verification セクションに自動追加されない

**あるべき姿**:
```typescript
async execute(codegenContext: CodeGenContext): Promise<AgentResult<TestContext>> {
  // ... テスト実行 ...

  // ✅ Kernel の Verification を更新
  await this.kernelRegistry.addVerificationToKernel(kernelId, {
    id: `VER-${Date.now()}`,
    statement: '生成されたコードがテストをパスすること',
    method: 'Jest unit tests + integration tests',
    testCase: testContext.testSuite,
    criteria: [
      `All ${testContext.testsPassed} tests pass`,
      `Coverage >= ${testContext.coveragePercent}%`,
    ],
    traceability: { upstream: relatedRequirements, downstream: [] },
    status: testContext.allTestsPassed ? 'passed' : 'failed',
    verifiedAt: new Date().toISOString(),
    verifiedBy: 'TestAgent',
    evidence: [{
      type: 'test_result',
      path: 'test-results.json',
      hash: 'sha256:...',
    }],
  });
}
```

---

#### 5. **Issue → Kernel 自動変換が不完全**

**ファイル**: `src/agents/ssot-agent-v2.ts:111-141`

**現状**:
```typescript
// ✅ DecisionRecord → Kernel 変換は実装済み
if (planningDataToUse.decisionRecord) {
  const kernelFromDecision = await this.convertDecisionToKernel(...);
}

// ⚠️ しかしIssue body の自然言語から直接Kernelを生成する機能が弱い
```

**問題**:
- Planning Layer (DecisionRecord) を経由しないとKernel生成されない
- Issue を書いただけでは Kernel が作られない
- 手動で DecisionRecord を書く必要がある

**あるべき姿**:
```typescript
// ✅ Issue body から AI で Needs/Requirements を抽出
async extractNRVVFromIssue(issue: GitHubIssue): Promise<Partial<KernelWithNRVV>> {
  const prompt = `
    Extract NRVV structure from this Issue:
    Title: ${issue.title}
    Body: ${issue.body}

    Output:
    - Needs (why this is needed)
    - Requirements (what must be satisfied)
    - Verification plan (how to test)
  `;

  const response = await this.anthropic.messages.create({
    model: 'claude-sonnet-4.5-20250929',
    messages: [{ role: 'user', content: prompt }],
  });

  return this.parseNRVVResponse(response);
}
```

---

#### 6. **Kernel Convergence 監視が手動**

**ファイル**: `src/ssot/kernel-registry.ts:361-379`

**現状**:
```typescript
async getConvergenceRate(): Promise<number> {
  // ✅ 実装済み
  // ❌ しかし自動的にチェックされない
  // ❌ Convergence Rate が低くても何も起きない
}
```

**問題**:
- Convergence Rate = 0% でも放置される
- 誰かが手動で `getConvergenceRate()` を呼ばないとチェックされない

**あるべき姿**:
```typescript
// ✅ 週次で自動チェック
// .github/workflows/weekly-kernel-check.yml
name: Weekly Kernel Convergence Check
on:
  schedule:
    - cron: '0 0 * * 1'  # 毎週月曜日
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - run: npx tsx scripts/check-kernel-convergence.ts
      - if: convergenceRate < 70
        run: gh issue create --title "Kernel Convergence Low" --body "..."
```

---

#### 7. **NRVV 自動補完機能がない**

**現状**:
- Kernel に Needs と Requirements があっても、Verification/Validation が空のまま
- 手動で埋める必要がある

**あるべき姿**:
```typescript
// ✅ AI でVerification/Validation を提案
async suggestVerificationValidation(kernel: KernelWithNRVV): Promise<{
  suggestedVerifications: Verification[];
  suggestedValidations: Validation[];
}> {
  const prompt = `
    Given these Requirements:
    ${kernel.requirements.map(r => r.statement).join('\n')}

    Suggest:
    1. Verification methods (how to test)
    2. Validation criteria (how to confirm it meets needs)
  `;

  const response = await this.anthropic.messages.create({ ... });
  return this.parseVerificationValidation(response);
}
```

---

## 📊 改善優先度マトリクス

| 改善項目 | 影響度 | 緊急度 | 実装難易度 | 優先度 |
|---------|-------|-------|-----------|-------|
| **1. CoordinatorAgent がKernelを参照** | 🔴 High | 🔴 High | 🟡 Medium | **P0** |
| **2. CodeGenAgent がKernelを参照** | 🔴 High | 🔴 High | 🟡 Medium | **P0** |
| **3. CodeGenAgent がKernelを更新** | 🔴 High | 🔴 High | 🟢 Low | **P0** |
| **4. TestAgent がKernelを更新** | 🟡 Medium | 🔴 High | 🟢 Low | **P1** |
| **5. Issue → Kernel 自動変換強化** | 🔴 High | 🟡 Medium | 🔴 High | **P1** |
| **6. Kernel Convergence 自動監視** | 🟡 Medium | 🟡 Medium | 🟢 Low | **P2** |
| **7. NRVV 自動補完** | 🟡 Medium | 🟢 Low | 🟡 Medium | **P2** |

---

## 🎯 実装計画

### Phase 1: Self-Improvement Loop を閉じる (P0)

1. **CoordinatorAgent の改修**:
   - `decomposeToDAG` で Kernel Registry を参照
   - 関連Kernelの Requirements からタスク生成

2. **CodeGenAgent の改修**:
   - `analyzeIssue` で Kernel を参照
   - コード生成後に Kernel を更新

3. **TestAgent の改修**:
   - テスト結果を Kernel の Verification に自動追加

### Phase 2: Kernel 生成の自動化 (P1)

4. **Issue → Kernel 自動変換強化**:
   - AI で Issue body から NRVV を抽出
   - SSOTAgentV2 に統合

5. **Kernel Convergence 自動監視**:
   - GitHub Actions で週次チェック
   - Convergence Rate 低下時に Issue 自動作成

### Phase 3: NRVV 自動補完 (P2)

6. **NRVV 自動補完機能**:
   - Requirements から Verification/Validation を提案
   - AI で自動生成

---

## 📁 影響ファイル一覧

| ファイル | 変更内容 | 優先度 |
|---------|---------|-------|
| `src/agents/coordinator-agent.ts` | Kernel参照、タスク生成ロジック改修 | P0 |
| `src/agents/codegen-agent.ts` | Kernel参照、Kernel更新機能追加 | P0 |
| `src/agents/test-agent.ts` | Verification自動追加 | P1 |
| `src/agents/ssot-agent-v2.ts` | Issue→Kernel自動変換強化 | P1 |
| `src/services/kernel-enhancement-service.ts` | NRVV自動補完 (新規) | P2 |
| `scripts/check-kernel-convergence.ts` | 収束率チェック (新規) | P2 |
| `.github/workflows/weekly-kernel-check.yml` | 週次自動チェック (新規) | P2 |

---

## ✅ 期待される効果

### Before (現状):
```
Issue → 固定タスク → コード生成 → テスト → (終了)
                                     ↓
                              Kernelは更新されない
                              次のIssueも同じパターン
```

### After (改善後):
```
Issue → Kernel生成 (NRVV)
         ↓
    Kernel参照 → タスク生成 (過去の学習を活用)
         ↓
    コード生成 (Requirements/Constraints考慮)
         ↓
    テスト実行 → Verification更新
         ↓
    Kernel更新 (知識蓄積)
         ↓
    次のIssue → より高品質なタスク/コード生成 🔄
```

**Self-Improvement Loop が完成し、Lunaが使われるほど賢くなる**

---

Generated by: Luna Self-Analysis
Date: 2026-01-15
