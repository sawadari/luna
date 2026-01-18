# 正しいKernel-Driven Development Flow

## ユーザーからの重要な指摘

> [unified_planning_and_ssot_framework.yaml]と[dest.yaml]に対する理解を深めてください。
> **kernelよりも、問題領域としてイシューの内容を判定する必要もあります。**

## 📖 理論的基盤

### unified_planning_and_ssot_framework.yaml の構造

```yaml
# L0) Planning Layer (上位概念: Why/What/Decide)
planning_layer:
  - Opportunity (価値が発生しうる機会)
  - OptionSet (複数案の集合)
  - ConstraintModel (Hard/Soft 制約)
  - ValueModel (価値の多次元評価)
  - EvaluationRecord (評価の記録)
  - DecisionRecord (採否・延期・探索継続の決定)
  - Assumption (重要前提)

# L1) SSOT / Convergence Layer (中位: Converge/Govern)
ssot_layer:
  - Kernel Registry (核の蓄積)
  - NRVV Traceability (Needs→Requirements→Verification→Validation)
  - Convergence Monitoring (収束監視)

# L2) Layer Coupling (接続写像)
layer_coupling:
  - DecisionRecord → Kernel (第一級要素として固定)
  - Opportunity → inputs (企画資料として入力)
  - Hard constraints → Phi (不変条件に入る)

# Problem Space Interface (dest.yaml 接続)
problem_space_interfaces:
  - dest.case_id ↔ Opportunity.id
  - dest.outcome_ok/safety_ok ↔ DecisionRecord (判定基準)
  - dest.AL ↔ AssuranceObservationRecord
```

### dest.yaml の役割 (Problem Space)

**DEST = Destination + Effectiveness + Safety + Traceability**

```yaml
Problem Space:
  1. Outcome Assessment (効果性判定)
     - progress: [better/same/worse]
     - outcomeOk: boolean

  2. Safety Assessment (安全性判定)
     - feedbackLoops: present/absent/harmful
     - violations: []
     - safetyOk: boolean

  3. Assurance Level (保証レベル)
     - AL2: Assured (outcome_ok AND safety_ok)
     - AL1: Qualified (outcome_ok XOR safety_ok)
     - AL0: NotAssured (NOT safety_ok OR 重大な不確実性)

  4. AL0 Reason (AL0の理由)
     - harmful_sideeffects
     - unsafe_assumption
     - insufficient_feedback
     - system_understanding_incomplete
     - ...

  5. Protocol (対応方針)
     - Wait (観測継続)
     - Freeze (介入停止)
     - Revise (設計見直し)
```

---

## ❌ 間違ったフロー (現在の実装)

```
Issue
  ↓
【Kernel検索】← ❌ いきなりKernelを探している
  ↓
タスク分解
  ↓
コード生成
```

**問題点**:
- Issue が「何を解決しようとしているのか」(Outcome) を判定していない
- Issue が「安全か」(Safety) を判定していない
- Problem Space を飛ばして Solution Space (Kernel) に直行している

---

## ✅ 正しいフロー

```
Issue (ユーザー要望)
  ↓
┌─────────────────────────────────────────┐
│ Phase 0: Problem Space Analysis (DEST)  │
│ - Outcome Assessment: outcomeOk?       │
│ - Safety Assessment: safetyOk?         │
│ - AL Judgment: AL0/AL1/AL2             │
│ - AL0 Reason Detection                 │
│ - Protocol Routing: Wait/Freeze/Revise │
└─────────────────────────────────────────┘
  ↓ (AL0 なら Block)
┌─────────────────────────────────────────┐
│ Phase 1: Planning Layer                │
│ - Opportunity 抽出                     │
│ - OptionSet 生成                       │
│ - ConstraintModel (Hard/Soft)         │
│ - ValueModel (正負・多次元)            │
│ - EvaluationRecord                     │
│ - DecisionRecord (PO承認)              │
└─────────────────────────────────────────┘
  ↓
┌─────────────────────────────────────────┐
│ Phase 2: SSOT Layer - Kernel生成       │
│ - DecisionRecord → Kernel 変換         │
│ - NRVV Traceability:                  │
│   - Needs: 何のために?                 │
│   - Requirements: 何を満たす?          │
│   - Verification: どう検証?            │
│   - Validation: 妥当か?                │
│ - Kernel Registry に保存               │
└─────────────────────────────────────────┘
  ↓
┌─────────────────────────────────────────┐
│ Phase 3: Task Decomposition            │
│ - Kernel の Requirements を参照        │
│ - 過去の Verification パターンを活用   │
│ - タスクを DAG 分解                    │
└─────────────────────────────────────────┘
  ↓
┌─────────────────────────────────────────┐
│ Phase 4: Implementation                │
│ - Kernel の Requirements/Constraints 考慮 │
│ - コード生成                           │
│ - テスト生成                           │
└─────────────────────────────────────────┘
  ↓
┌─────────────────────────────────────────┐
│ Phase 5: Kernel Update                 │
│ - Generated Code → relatedArtifacts    │
│ - Test Results → Verification 追加     │
│ - Deployment → Validation 追加         │
│ - History 記録                         │
└─────────────────────────────────────────┘
  ↓
次のIssue → Phase 0 から再開 (蓄積されたKernelが品質向上に寄与)
```

---

## 🔄 Self-Improvement Loop の完全版

```
┌─────────────────────────────────────────────────────────┐
│                 Self-Improvement Loop                    │
│                                                          │
│  Issue → DEST → Planning → Kernel → Task → Code → ✓    │
│            ↑                                       ↓     │
│            │                                       │     │
│            │     Verification/Validation 追加      │     │
│            │                                       │     │
│            └───────── Kernel Update ───────────────┘     │
│                                                          │
│  蓄積されたKernel → 次のIssueの品質向上                    │
└─────────────────────────────────────────────────────────┘
```

---

## 📋 Phase 別の詳細

### Phase 0: Problem Space Analysis (DEST判定)

**入力**: Issue (title, body, labels)

**処理**:
1. Outcome Assessment フィールドを抽出
   - `## Outcome Assessment`
   - `progress: better/same/worse`

2. Safety Assessment フィールドを抽出
   - `## Safety Assessment`
   - `feedbackLoops: present/absent/harmful`
   - `violations: []`

3. AL 判定
   ```typescript
   if (outcome.outcomeOk && safety.safetyOk) {
     al = 'AL2';  // Assured
   } else if (outcome.outcomeOk XOR safety.safetyOk) {
     al = 'AL1';  // Qualified
   } else {
     al = 'AL0';  // NotAssured
   }
   ```

4. AL0 Reason Detection (AL0 の場合)
   - harmful_sideeffects
   - unsafe_assumption
   - insufficient_feedback
   - system_understanding_incomplete

5. Protocol Routing
   - Wait: 観測継続 (軽微な不確実性)
   - Freeze: 介入停止 (重大な副作用)
   - Revise: 設計見直し (前提崩壊)

**出力**: DESTJudgmentResult

**重要**:
- **AL0 の場合は実装をブロック**
- AL1/AL2 のみ次のPhaseへ進む

---

### Phase 1: Planning Layer

**入力**: Issue + DESTJudgmentResult

**処理**:
1. Opportunity 抽出
   - target_customer_or_user
   - problem_or_desired_outcome
   - success_description

2. OptionSet 生成
   - 単一案ではなく複数案の集合
   - 制約確定とともに集合を絞り込む

3. ConstraintModel 構築
   - Hard constraints (物理/法規/安全/契約)
   - Soft constraints (コスト/スケジュール/組織)

4. ValueModel 構築
   - user_value (使いやすさ、体験)
   - business_value (収益性、戦略)
   - risk_value (安全、法務、品質)
   - societal_value (環境、倫理)

5. DecisionRecord 生成
   - decision_type: adopt/defer/reject/continue_explore
   - decided_by: Product Owner
   - falsification_conditions (反証条件)
   - linked_evaluation_ids

**出力**: PlanningData (Opportunity, OptionSet, DecisionRecord)

---

### Phase 2: SSOT Layer - Kernel生成

**入力**: PlanningData (DecisionRecord)

**処理**:
1. DecisionRecord → Kernel 変換
   ```typescript
   kernel.id = `KRN-${nextId}`;
   kernel.statement = decisionRecord.rationale_summary;
   kernel.sourceDecisionRecord = decisionRecord.id;
   ```

2. NRVV 構築
   - **Needs**: Opportunity の problem_or_desired_outcome から抽出
   - **Requirements**: DecisionRecord の採用オプションから生成
   - **Verification**: (初期は空、後でTestAgentが追加)
   - **Validation**: (初期は空、後でDeploymentAgentが追加)

3. Traceability Links 構築
   ```typescript
   need.traceability.downstream = [req.id];
   requirement.traceability.upstream = [need.id];
   requirement.traceability.downstream = [ver.id, val.id];
   ```

4. Kernel Registry に保存
   - maturity: 'draft'
   - owner: Product Owner
   - category: (Issue から推論)
   - tags: (Issue labels から抽出)

**出力**: KernelWithNRVV[]

---

### Phase 3: Task Decomposition (CoordinatorAgent)

**入力**: Issue + DESTJudgmentResult + PlanningData + Kernels

**処理**:
1. **Kernel の Requirements を参照してタスク生成**
   ```typescript
   for (const kernel of kernels) {
     for (const req of kernel.requirements) {
       // Requirement ごとにタスクを生成
       tasks.push({
         name: `Implement: ${req.statement}`,
         description: req.rationale,
         agent: 'codegen',
         constraints: req.constraints,
       });
     }
   }
   ```

2. 過去の Verification パターンを活用
   ```typescript
   const pastVerifications = kernel.verification || [];
   if (pastVerifications.length > 0) {
     // 過去のテスト戦略を参考にタスク追加
     tasks.push({
       name: 'Run similar tests as previous Kernels',
       agent: 'test',
     });
   }
   ```

3. DAG 構築
   - タスク間の依存関係を定義
   - Critical Path 分析

**出力**: TaskDAG, ExecutionPlan

---

### Phase 4: Implementation (CodeGenAgent)

**入力**: Issue + Kernels + Task

**処理**:
1. **Kernel の Requirements/Constraints を AI プロンプトに含める**
   ```typescript
   const prompt = `
   ## Related Kernel Requirements
   ${kernel.requirements.map(r => r.statement).join('\n')}

   ## Constraints
   ${kernel.requirements.flatMap(r => r.constraints || []).join('\n')}

   ## Code Generation
   Generate code that satisfies the above requirements and constraints.
   `;
   ```

2. AI (Claude) でコード生成

3. 品質メトリクス計算

**出力**: GeneratedCode[]

---

### Phase 5: Kernel Update

**入力**: Kernels + GeneratedCode + TestResults + DeploymentResults

**処理**:
1. **Generated Code を relatedArtifacts に追加**
   ```typescript
   kernel.relatedArtifacts.push({
     type: 'code',
     path: file.filename,
     description: `Generated for Issue #${issue.number}`,
   });
   ```

2. **Test Results を Verification に追加** (TestAgent)
   ```typescript
   kernel.verification.push({
     id: `VER-${timestamp}`,
     statement: 'Generated code passes all tests',
     method: 'Jest unit tests',
     status: 'passed',
     verifiedAt: timestamp,
     verifiedBy: 'TestAgent',
     evidence: [{ type: 'test_result', path: 'test-results.json' }],
   });
   ```

3. **Deployment Results を Validation に追加** (DeploymentAgent)
   ```typescript
   kernel.validation.push({
     id: `VAL-${timestamp}`,
     statement: 'Deployed code meets user needs',
     method: 'Production health check',
     status: 'passed',
     validatedAt: timestamp,
     validatedBy: 'DeploymentAgent',
     evidence: [{ type: 'health_check', path: 'health-check.json' }],
   });
   ```

4. **Maturity 遷移**
   ```typescript
   if (allVerificationsPassed && !hasValidation) {
     kernel.maturity = 'agreed';  // draft → agreed
   }
   if (allValidationsPassed) {
     kernel.maturity = 'frozen';  // agreed → frozen
   }
   ```

5. Kernel Registry に保存

**出力**: Updated Kernels

---

## 🎯 実装計画 (Phase 0 を最優先)

### Priority 0: DEST判定の統合 (最優先)

**なぜ最優先か?**:
- AL0 の Issue を実装すると、有害な副作用や安全性問題が発生する可能性
- Problem Space の分析なしに Solution Space (Kernel) に進むのは危険

**必要な実装**:
1. CoordinatorAgent の execute メソッドに DEST判定を追加
   ```typescript
   // Phase 0: DEST Judgment (最優先)
   const destResult = await this.destAgent.execute(issueNumber);
   if (destResult.data?.al === 'AL0') {
     // Block implementation
     return { status: 'blocked', reason: 'AL0 detected' };
   }
   ```

2. DESTAgent の結果を PlanningAgent に渡す
   ```typescript
   const planningResult = await this.planningAgent.execute(
     issueNumber,
     destResult.data  // ← DEST結果を渡す
   );
   ```

3. PlanningAgent が DEST結果を DecisionRecord に反映
   ```typescript
   decisionRecord.linked_dest_judgment = destResult.judgmentId;
   decisionRecord.outcome_ok = destResult.outcomeOk;
   decisionRecord.safety_ok = destResult.safetyOk;
   ```

### Priority 1: CodeGenAgent のKernel統合 (✅ 完了)

- ✅ Kernel Registry 統合
- ✅ Kernel 参照
- ✅ Kernel 更新

### Priority 2: TestAgent のVerification自動追加

### Priority 3: CoordinatorAgent のKernel参照

---

## 📊 期待される効果

### Before (間違ったフロー):
```
Issue → Kernel検索 → タスク → コード
        ↑
        │ (過去のKernelを探すだけ)
        │ (新しいKernelは生成されない)
        │ (Self-Improvement が閉じていない)
```

### After (正しいフロー):
```
Issue
  ↓
DEST判定 (Outcome/Safety) ← 問題領域の分析
  ↓ (AL1/AL2 のみ進む)
Planning (DecisionRecord) ← 意思決定の記録
  ↓
Kernel生成 (NRVV) ← 知識の蓄積
  ↓
Task分解 (Kernel参照) ← 過去の学習を活用
  ↓
コード生成 (Requirements考慮) ← 品質向上
  ↓
Kernel更新 (Verification追加) ← 知識の更新
  ↓
次のIssue → より高品質 🔄
```

**Self-Improvement Loop が完全に閉じる**

---

Generated by: Luna Self-Analysis
Date: 2026-01-15
