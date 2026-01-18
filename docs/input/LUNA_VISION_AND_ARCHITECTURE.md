# Luna - Vision, Principles, Architecture, and Workflow

**Luna: Self-Improving Autonomous Development System**

日付: 2026-01-15

---

## 目次

1. [Lunaでやりたいこと](#1-lunaでやりたいこと)
2. [Lunaを使ってLunaを改善する目的](#2-lunaを使ってlunaを改善する目的)
3. [プリンシプル](#3-プリンシプル)
4. [必要な機能](#4-必要な機能)
5. [アーキテクチャー](#5-アーキテクチャー)
6. [実現すべきワークフロー](#6-実現すべきワークフロー)

---

## 1. Lunaでやりたいこと

### 1.1 本質的な目的

**「ソフトウェア開発における知識の蓄積と品質の継続的向上」**

- **Issue (ユーザー要望) を受け取ったとき、過去の知識を活用して高品質な実装を自動生成する**
- **実装のたびに知識が蓄積され、次の実装がより高品質になる**
- **人間の介入を最小限に、自律的に開発を進める**

### 1.2 具体的にやりたいこと

#### (1) **問題領域の正確な理解**

Issue を受け取ったとき:
- これは「効果的」か? (Outcome Assessment)
- これは「安全」か? (Safety Assessment)
- 実装すべきか、観測すべきか、停止すべきか? (DEST判定)

#### (2) **意思決定の記録と追跡**

- なぜこの機能を実装するのか? (Opportunity)
- どの案を採用するのか? (OptionSet → DecisionRecord)
- どの制約を守るべきか? (ConstraintModel: Hard/Soft)
- どのように検証するのか? (Verification Plan)

#### (3) **知識の蓄積 (Kernel Registry)**

Issue → 実装の過程で:
- **Needs**: 何のために実装するのか
- **Requirements**: 何を満たす必要があるのか
- **Verification**: どうやって検証したのか
- **Validation**: 妥当性はどう確認したのか

これらを **Kernel** として蓄積する。

#### (4) **過去の知識を活用した実装**

次の Issue を受け取ったとき:
- 関連する Kernel を検索
- 過去の Requirements を参照
- 過去の Constraints を考慮
- 過去の Verification パターンを再利用
- **より高品質なコードを生成**

#### (5) **Self-Improvement Loop**

```
Issue → DEST判定 → Planning → Kernel生成 → Task分解 → 実装 → Kernel更新
  ↑                                                              ↓
  └──────────────── 蓄積された知識が品質向上に寄与 ─────────────────┘
```

---

## 2. Lunaを使ってLunaを改善する目的

### 2.1 メタレベルの Self-Improvement

**「Luna が Luna 自身を改善する」**

Luna 自身のリポジトリ (sawadari/luna) に対して:
- Luna の Issue を Luna が処理
- Luna のコードを Luna が生成
- Luna のテストを Luna が実行
- Luna の品質を Luna が監視

### 2.2 具体的な効果

#### (1) **Dogfooding による品質保証**

- Luna が自分自身を使うことで、不具合や使いにくさを即座に発見
- 「使えない機能」は自然淘汰される
- 「使える機能」は洗練されていく

#### (2) **知識の自己蓄積**

Luna の Kernel Registry には:
- Luna の設計決定 (なぜこのアーキテクチャにしたか)
- Luna の制約 (TypeScript strict mode, NRVV トレーサビリティ)
- Luna の検証方法 (テスト戦略, 統合テスト)

これらが蓄積され、Luna の改善に活用される。

#### (3) **収束率の向上**

```yaml
# kernels.yaml
statistics:
  total_kernels: 3
  convergence_rate: 0%  # 現在
  convergence_rate: 80% # 目標
```

収束率が上がるほど:
- NRVV トレーサビリティが完全になる
- 知識の再利用性が高まる
- 実装の品質が向上する

#### (4) **実証と信頼性**

- Luna が Luna を改善できるなら、他のプロジェクトでも使える
- 自己改善できないツールは信頼できない
- **"Luna eats its own dog food"** が品質保証

### 2.3 最終的なビジョン

**「Luna を起動すれば、Issue を書くだけで高品質な実装が完成する」**

- AI (Claude) の力を借りつつ
- 過去の知識 (Kernel) を活用し
- 問題領域 (DEST) を正確に判定し
- 自律的に (Autonomous) 実装する

---

## 3. プリンシプル

Luna の設計原則は2つの YAML ファイルに記述されています。

### 3.1 dest.yaml - Problem Space (問題領域)

**DEST = Destination + Effectiveness + Safety + Traceability**

```yaml
dest_theory:
  purpose: "システム介入の効果性と安全性を判定する"

  outcome_assessment:
    question: "この介入は効果的か?"
    progress: [better, same, worse]
    outcomeOk: boolean

  safety_assessment:
    question: "この介入は安全か?"
    feedbackLoops: [present, absent, harmful]
    violations: []
    safetyOk: boolean

  assurance_level:
    AL2_Assured:
      condition: "outcome_ok AND safety_ok"
      meaning: "実装を進めてよい"

    AL1_Qualified:
      condition: "outcome_ok XOR safety_ok"
      meaning: "条件付きで実装可能、監視必要"

    AL0_NotAssured:
      condition: "NOT safety_ok OR 重大な不確実性"
      meaning: "実装を停止すべき"

  al0_reasons:
    - harmful_sideeffects: "有害な副作用が予想される"
    - unsafe_assumption: "前提が安全でない"
    - insufficient_feedback: "フィードバックが不足"
    - system_understanding_incomplete: "システム理解が不完全"
    - high_uncertainty: "重大な不確実性"

  protocol:
    Wait: "観測継続 (軽微な不確実性)"
    Freeze: "介入停止 (重大な副作用)"
    Revise: "設計見直し (前提崩壊)"
```

#### **なぜ DEST が重要か?**

- **Solution Space (Kernel, コード) の前に Problem Space (効果性・安全性) を判定する**
- AL0 の Issue を実装すると、有害な副作用が発生する可能性
- 「何を作るか」より「作るべきか」が先

### 3.2 unified_planning_and_ssot_framework.yaml - Solution Space (解決領域)

3層構造:

```yaml
# L0) Planning Layer (上位概念: Why/What/Decide)
planning_layer:
  purpose: "価値・選択肢・制約をもとに意思決定を生成"

  core_objects:
    Opportunity:
      description: "価値が発生しうる機会の定義"
      fields: [target_customer, problem, usage_context, success_description]

    OptionSet:
      description: "単一案ではなく複数案の集合"
      purpose: "早期コミットを避け、制約確定とともに絞り込む"

    ConstraintModel:
      Hard: [physical_limits, legal, safety, contract]
      Soft: [cost, schedule, organizational_capacity]

    ValueModel:
      dimensions: [user_value, business_value, risk_value, societal_value]
      note: "価値は正負・多次元で表す (単一スカラー化しない)"

    DecisionRecord:
      description: "採否・延期・探索継続の決定を固定"
      required: [decided_by, decision_type, rationale, falsification_conditions]
      decision_type: [adopt, defer, reject, continue_explore]

    Assumption:
      description: "重要前提。再評価と意思決定に直結"
      required: [statement, owner, confidence_level, validation_method, falsification_signal]

# L1) SSOT / Convergence Layer (中位: Converge/Govern)
ssot_layer:
  purpose: "Planning Layer の DecisionRecord を核 (Kernel) に固定し、収束させる"

  agent_model:
    operators:
      θ_understand: "入力コンテキストを解釈し、核へ正準化"
      θ_generate: "仮説・構造・候補を生成"
      θ_allocate: "責任・境界・所有権を割当て"
      θ_execute: "核から成果物を生成"
      θ_integrate: "境界間で共有核を整合"
      θ_learn: "違反・滞留・コストを観測し、設計を更新"

  kernel_registry:
    KernelWithNRVV:
      Needs: "何のために?"
      Requirements: "何を満たす?"
      Verification: "どう検証?"
      Validation: "妥当か?"

    maturity_states: [draft, under_review, agreed, frozen, deprecated]

    convergence_criteria:
      invariant_stability: "不変条件Φ違反が再発しない"
      flow_stability: "under_review が滞留しない"
      impact_predictability: "変更影響範囲が即座に特定できる"
      audit_readiness: "監査連鎖が共有核で即時再構成できる"

  evidence_governance:
    source_type: [human_doc, tool_output, ai_generated, transcript]
    verification_status: [unverified, verified, disputed, quarantined]
    rule: "ai_generated は verified になるまで Kernel 昇格禁止"

# L2) Layer Coupling (接続写像: Planning → SSOT)
layer_coupling:
  mappings:
    - DecisionRecord → Kernel (第一級要素として固定)
    - Opportunity → inputs (企画資料として入力)
    - Hard constraints → Phi (不変条件に入る)
    - Assumption → signals_catalog (再評価トリガーに接続)
```

#### **なぜこのフレームワークが重要か?**

1. **Planning と SSOT の分離**
   - Planning: 意思決定 (なぜ作るか、何を作るか)
   - SSOT: 知識の蓄積と収束 (どう作るか、どう検証するか)

2. **DecisionRecord を Kernel の第一級要素に**
   - 意思決定が知識として蓄積される
   - 「なぜこの実装にしたか」が追跡可能

3. **NRVV トレーサビリティ**
   - Needs → Requirements → Verification → Validation
   - 監査連鎖が機械的に検証できる

4. **収束 (Convergence) の定義**
   - 「完成」ではなく「実用上の安定状態」
   - 違反率・滞留日数・影響分析時間で定量評価

---

## 4. 必要な機能

### 4.1 Phase 0: Problem Space Analysis (DEST判定)

**機能**: DESTAgent

**目的**: Issue が実装すべきか判定

**入力**: Issue (title, body, labels)

**処理**:
1. Outcome Assessment フィールドを抽出
   ```yaml
   ## Outcome Assessment
   progress: better/same/worse
   ```

2. Safety Assessment フィールドを抽出
   ```yaml
   ## Safety Assessment
   feedbackLoops: present/absent/harmful
   violations: []
   ```

3. AL 判定
   ```typescript
   if (outcome_ok && safety_ok) → AL2 (Assured)
   else if (outcome_ok XOR safety_ok) → AL1 (Qualified)
   else → AL0 (NotAssured)
   ```

4. AL0 Reason Detection
   - harmful_sideeffects
   - unsafe_assumption
   - insufficient_feedback

5. Protocol Routing
   - Wait / Freeze / Revise

**出力**: DESTJudgmentResult
- al: AL0/AL1/AL2
- outcomeOk: boolean
- safetyOk: boolean
- al0Reasons: []
- protocol: Wait/Freeze/Revise

**重要**: **AL0 なら実装をブロック**

---

### 4.2 Phase 1: Planning Layer

**機能**: PlanningAgent

**目的**: Issue から意思決定を抽出・記録

**入力**: Issue + DESTJudgmentResult

**処理**:
1. Opportunity 抽出
   - 誰に? 何を? なぜ?

2. OptionSet 生成
   - 複数案の列挙
   - 制約による絞り込み

3. ConstraintModel 構築
   - Hard constraints (交渉不可能)
   - Soft constraints (交渉可能)

4. ValueModel 構築
   - 正負・多次元の価値評価

5. DecisionRecord 生成
   - decided_by: Product Owner
   - decision_type: adopt/defer/reject
   - falsification_conditions: 反証条件

**出力**: PlanningData
- opportunity
- optionSet
- decisionRecord

---

### 4.3 Phase 2: SSOT Layer - Kernel生成

**機能**: SSOTAgentV2

**目的**: DecisionRecord を Kernel に変換・保存

**入力**: PlanningData (DecisionRecord)

**処理**:
1. DecisionRecord → Kernel 変換
   ```typescript
   kernel.id = `KRN-${nextId}`;
   kernel.statement = decisionRecord.rationale_summary;
   kernel.sourceDecisionRecord = decisionRecord.id;
   ```

2. NRVV 構築
   - **Needs**: Opportunity から抽出
   - **Requirements**: DecisionRecord の採用オプションから生成
   - **Verification**: (初期は空、TestAgent が追加)
   - **Validation**: (初期は空、DeploymentAgent が追加)

3. Traceability Links
   ```typescript
   need.traceability.downstream = [req.id];
   requirement.traceability.upstream = [need.id];
   requirement.traceability.downstream = [ver.id, val.id];
   ```

4. Kernel Registry に保存
   - maturity: 'draft'
   - kernels.yaml に永続化

**出力**: KernelWithNRVV[]

---

### 4.4 Phase 3: Task Decomposition

**機能**: CoordinatorAgent

**目的**: Kernel の Requirements からタスクを生成

**入力**: Issue + Kernels + DESTJudgmentResult

**処理**:
1. **Kernel の Requirements を参照してタスク生成**
   ```typescript
   for (const kernel of kernels) {
     for (const req of kernel.requirements) {
       tasks.push({
         name: `Implement: ${req.statement}`,
         description: req.rationale,
         requirements: [req],
         constraints: req.constraints,
       });
     }
   }
   ```

2. 過去の Verification パターンを活用
   ```typescript
   if (kernel.verification.length > 0) {
     // 過去のテスト戦略を参考にタスク追加
   }
   ```

3. DAG 構築
   - タスク間の依存関係
   - Critical Path 分析

**出力**: TaskDAG, ExecutionPlan

---

### 4.5 Phase 4: Implementation

**機能**: CodeGenAgent (✅ Kernel統合完了)

**目的**: Kernel を考慮してコード生成

**入力**: Issue + Kernels + Task

**処理**:
1. **関連 Kernel を検索**
   - Issue body から Kernel参照 (KRN-001)
   - タグで検索 (security, authentication)
   - カテゴリで検索 (security, quality)

2. **Kernel を考慮した Issue 分析**
   - Requirements を抽出
   - Constraints を抽出

3. **AI プロンプトに Kernel 情報を含める**
   ```typescript
   const prompt = `
   ## Related Kernel Requirements
   ${kernel.requirements.map(r => r.statement).join('\n')}

   ## Constraints
   ${kernel.requirements.flatMap(r => r.constraints || []).join('\n')}

   ## Code Generation
   Generate code that satisfies the above requirements.
   `;
   ```

4. AI (Claude) でコード生成

**出力**: GeneratedCode[]

---

### 4.6 Phase 5: Verification

**機能**: TestAgent

**目的**: テスト実行 + Kernel の Verification 更新

**入力**: CodeGenContext (Generated Code)

**処理**:
1. テスト実行
   - Jest / Vitest
   - カバレッジ計測

2. **Kernel の Verification を自動追加**
   ```typescript
   await kernelRegistry.addVerificationToKernel(kernelId, {
     id: `VER-${timestamp}`,
     statement: `Generated code for Issue #${issueNumber} passes all tests`,
     method: 'Jest unit tests',
     status: 'passed',
     verifiedAt: timestamp,
     verifiedBy: 'TestAgent',
     evidence: [{ type: 'test_result', path: 'test-results.json' }],
   });
   ```

**出力**: TestContext + Updated Kernels

---

### 4.7 Phase 6: Validation

**機能**: DeploymentAgent

**目的**: デプロイ + Kernel の Validation 更新

**入力**: TestContext

**処理**:
1. デプロイ実行
   - dev / staging / prod
   - ヘルスチェック

2. **Kernel の Validation を自動追加**
   ```typescript
   await kernelRegistry.addValidationToKernel(kernelId, {
     id: `VAL-${timestamp}`,
     statement: `Deployed code meets user needs`,
     method: 'Production health check',
     status: 'passed',
     validatedAt: timestamp,
     validatedBy: 'DeploymentAgent',
   });
   ```

3. **Maturity 遷移**
   ```typescript
   if (allVerificationsPassed) kernel.maturity = 'agreed';
   if (allValidationsPassed) kernel.maturity = 'frozen';
   ```

**出力**: DeploymentContext + Updated Kernels

---

### 4.8 Phase 7: Continuous Improvement

**機能**: ContinuousImprovementService (未実装)

**目的**: KPI 監視 + 改善アクション提案

**処理**:
1. 週次 KPI チェック
   - Φ違反率
   - under_review 滞留日数
   - Convergence Rate

2. 改善アクション提案
   - Convergence Rate < 70% → NRVV リンク補完を提案
   - 違反率 > 5% → 粒度調整を提案

3. GitHub Issue 自動作成
   - 改善提案を Issue として起票

---

## 5. アーキテクチャー

### 5.1 全体構成

```
┌────────────────────────────────────────────────────────────┐
│                    Luna Architecture                        │
└────────────────────────────────────────────────────────────┘

┌─────────────┐
│   GitHub    │  Issue, PR, Comments
│ Repository  │
└──────┬──────┘
       │
       ↓
┌─────────────────────────────────────────────────────────────┐
│                   Luna Agents Pipeline                       │
│                                                              │
│  Issue → DESTAgent → PlanningAgent → SSOTAgent → Coordinator│
│           ↓            ↓               ↓           ↓         │
│         AL判定      DecisionRecord   Kernel      TaskDAG    │
│                                                              │
│  → CodeGenAgent → ReviewAgent → TestAgent → DeploymentAgent │
│      ↓              ↓            ↓           ↓              │
│    Code生成       品質判定     Verification  Validation      │
│                                                              │
│  → MonitoringAgent → ContinuousImprovement                  │
│      ↓                  ↓                                    │
│    メトリクス         改善提案                               │
└─────────────────────────────────────────────────────────────┘
       │                 │
       ↓                 ↓
┌──────────────┐   ┌──────────────┐
│   Kernel     │   │  Decision    │
│  Registry    │   │  Registry    │
│ (kernels.yaml)│   │(decisions.yaml)│
└──────────────┘   └──────────────┘
       ↑                 ↑
       │                 │
       └─────── Self-Improvement Loop ─────┘
```

### 5.2 データフロー

```
┌─────────────────────────────────────────────────────────────┐
│                      Data Flow                               │
└─────────────────────────────────────────────────────────────┘

Issue (GitHub)
  ↓
DESTJudgmentResult
  { al: AL0/AL1/AL2, outcomeOk, safetyOk, al0Reasons, protocol }
  ↓ (AL0 なら Block)
PlanningData
  { opportunity, optionSet, decisionRecord }
  ↓
KernelWithNRVV[] (SSOT)
  { id, statement, needs, requirements, verification, validation }
  ↓
TaskDAG
  { nodes: Task[], edges: Dependency[] }
  ↓
CodeGenContext
  { generatedCode: GeneratedCode[], metrics, relatedKernels }
  ↓
ReviewContext
  { qualityScore, issues, recommendations }
  ↓
TestContext
  { testResults, coverage, verificationUpdates }
  ↓
DeploymentContext
  { deployStatus, healthCheck, validationUpdates }
  ↓
MonitoringContext
  { metrics, alerts }
  ↓
Kernel Registry 更新 (kernels.yaml)
  ↓
次の Issue → より高品質な実装 🔄
```

### 5.3 エージェント間のコンテキスト伝播

```typescript
interface ExecutionContext {
  // Phase 0
  destJudgment?: DESTJudgmentResult;

  // Phase 1
  planningData?: {
    opportunity: Opportunity;
    optionSet: OptionSet;
    decisionRecord: DecisionRecord;
  };

  // Phase 2
  kernels?: KernelWithNRVV[];

  // Phase 3
  taskDAG?: TaskDAG;
  executionPlan?: ExecutionPlan;

  // Phase 4
  codeGenContext?: CodeGenContext;

  // Phase 5
  reviewContext?: ReviewContext;

  // Phase 6
  testContext?: TestContext;

  // Phase 7
  deploymentContext?: DeploymentContext;

  // Phase 8
  monitoringContext?: MonitoringContext;
}
```

各 Agent は前の Agent の出力を受け取り、それを基に実行します。
これにより、パイプライン全体で情報が一貫して保持されます。

### 5.4 Kernel Registry の構造

```yaml
# kernels.yaml
meta:
  registry_version: "1.0"
  last_updated: 2026-01-13T12:03:24.265Z
  schema_version: nrvv-1.0

kernels:
  KRN-001:
    id: KRN-001
    statement: "すべてのAPI通信はHTTPSで行う"
    category: architecture
    owner: TechLead
    maturity: agreed  # draft/under_review/agreed/frozen/deprecated

    # DEST 接続
    linked_dest_judgment: JDG-2026-001
    assurance_level: AL2

    # Planning 接続
    sourceIssue: "#123"
    sourceDecisionRecord: DR-001

    # NRVV
    needs:
      - id: NEED-001
        statement: "システムのセキュリティを確保する"
        stakeholder: CISO
        traceability:
          downstream: [REQ-001]

    requirements:
      - id: REQ-001
        statement: "すべてのHTTP通信をHTTPSに変換すること"
        type: functional
        priority: must
        rationale: "中間者攻撃を防止するため"
        constraints:
          - "TLS 1.2以上を使用"
          - "証明書検証を必須とする"
        traceability:
          upstream: [NEED-001]
          downstream: [VER-001, VAL-001]

    verification:
      - id: VER-001
        statement: "HTTP通信が存在しないことを確認"
        method: "静的コード解析 + 動的テスト"
        status: passed
        verifiedAt: 2025-01-16T00:00:00Z
        verifiedBy: TestAgent
        evidence:
          - type: test_result
            path: tests/security/https_verification.log
            hash: sha256:abc123...

    validation:
      - id: VAL-001
        statement: "システムが安全な通信を実現していることを確認"
        method: "セキュリティ監査"
        status: passed
        validatedAt: 2025-01-17T00:00:00Z
        validatedBy: CISO

    # 実装成果物
    relatedArtifacts:
      - type: code
        path: src/api/client.ts
        description: "HTTPS通信実装"
      - type: test
        path: tests/security/https_test.ts

    # 変更履歴
    history:
      - timestamp: 2025-01-13T00:00:00Z
        action: created
        by: TechLead
        maturity: draft
      - timestamp: 2025-01-15T00:00:00Z
        action: approved
        by: ProductOwner
        maturity: agreed
      - timestamp: 2025-01-16T00:00:00Z
        action: verified
        by: TestAgent
      - timestamp: 2026-01-15T00:00:00Z
        action: code_generated
        by: CodeGenAgent
        notes: "Generated 2 files for Issue #456"

indices:
  by_maturity:
    draft: []
    under_review: []
    agreed: [KRN-001]
    frozen: []

  by_category:
    architecture: [KRN-001]
    security: [KRN-001]

statistics:
  total_kernels: 1
  convergence_rate: 100  # NRVV完全 → 100%
```

---

## 6. 実現すべきワークフロー

### 6.1 完全なワークフロー

```
┌─────────────────────────────────────────────────────────────┐
│            Luna Self-Improving Development Flow              │
└─────────────────────────────────────────────────────────────┘

User: GitHub Issue 作成
  ↓
┌─────────────────────────────────────────────────────────────┐
│ Phase 0: Problem Space Analysis (DEST判定)                  │
│                                                              │
│ [DESTAgent]                                                  │
│  1. Outcome Assessment: progress, outcomeOk                 │
│  2. Safety Assessment: feedbackLoops, violations, safetyOk  │
│  3. AL Judgment: AL0/AL1/AL2                                │
│  4. AL0 Reason Detection: harmful_sideeffects, unsafe_...   │
│  5. Protocol Routing: Wait/Freeze/Revise                    │
│                                                              │
│ Output: DESTJudgmentResult                                   │
│  - al: AL2 (Assured) → 次へ進む                             │
│  - al: AL0 (NotAssured) → 実装をブロック ❌                 │
└─────────────────────────────────────────────────────────────┘
  ↓ (AL1/AL2 のみ)
┌─────────────────────────────────────────────────────────────┐
│ Phase 1: Planning Layer (意思決定)                          │
│                                                              │
│ [PlanningAgent]                                              │
│  1. Opportunity 抽出: 誰に? 何を? なぜ?                     │
│  2. OptionSet 生成: 複数案の列挙                            │
│  3. ConstraintModel: Hard/Soft 制約の分類                   │
│  4. ValueModel: 正負・多次元の価値評価                       │
│  5. DecisionRecord 生成:                                     │
│     - decided_by: Product Owner                             │
│     - decision_type: adopt/defer/reject/explore             │
│     - falsification_conditions: 反証条件                     │
│                                                              │
│ Output: PlanningData                                         │
│  - opportunity, optionSet, decisionRecord                   │
└─────────────────────────────────────────────────────────────┘
  ↓
┌─────────────────────────────────────────────────────────────┐
│ Phase 2: SSOT Layer - Kernel生成                            │
│                                                              │
│ [SSOTAgentV2]                                                │
│  1. DecisionRecord → Kernel 変換                            │
│  2. NRVV 構築:                                              │
│     - Needs: Opportunity から抽出                           │
│     - Requirements: DecisionRecord から生成                 │
│     - Verification: (初期は空、TestAgentが追加)             │
│     - Validation: (初期は空、DeploymentAgentが追加)         │
│  3. Traceability Links 構築                                 │
│  4. Kernel Registry (kernels.yaml) に保存                   │
│     - maturity: 'draft'                                     │
│                                                              │
│ Output: KernelWithNRVV[]                                     │
└─────────────────────────────────────────────────────────────┘
  ↓
┌─────────────────────────────────────────────────────────────┐
│ Phase 3: Task Decomposition (タスク分解)                     │
│                                                              │
│ [CoordinatorAgent]                                           │
│  1. Kernel の Requirements を参照してタスク生成              │
│     for req in kernel.requirements:                         │
│       tasks.add("Implement: " + req.statement)              │
│  2. 過去の Verification パターンを活用                       │
│     if kernel.verification.exists():                        │
│       tasks.add("Run similar tests")                        │
│  3. DAG 構築:                                               │
│     - タスク間の依存関係を定義                              │
│     - Critical Path 分析                                    │
│  4. Execution Plan 生成:                                    │
│     - 並列実行可能なタスクを特定                            │
│                                                              │
│ Output: TaskDAG, ExecutionPlan                               │
└─────────────────────────────────────────────────────────────┘
  ↓
┌─────────────────────────────────────────────────────────────┐
│ Phase 4: Implementation (実装)                               │
│                                                              │
│ [CodeGenAgent] ✅ Kernel統合完了                            │
│  1. 関連 Kernel を検索:                                     │
│     - Issue body から Kernel参照 (KRN-001)                  │
│     - タグで検索 (security, authentication)                 │
│     - カテゴリで検索 (security, quality)                    │
│  2. Kernel を考慮した Issue 分析:                           │
│     - Requirements を抽出                                   │
│     - Constraints を抽出                                    │
│  3. AI プロンプトに Kernel 情報を含める:                    │
│     prompt = f"""                                           │
│     ## Related Kernel Requirements                          │
│     {kernel.requirements}                                   │
│                                                              │
│     ## Constraints                                          │
│     {kernel.constraints}                                    │
│                                                              │
│     ## Code Generation                                      │
│     Generate code that satisfies the above requirements.    │
│     """                                                      │
│  4. AI (Claude) でコード生成                                │
│  5. Kernel 更新:                                            │
│     - relatedArtifacts に Generated Code を追加             │
│     - history に記録                                        │
│                                                              │
│ Output: GeneratedCode[], Updated Kernels                     │
└─────────────────────────────────────────────────────────────┘
  ↓
┌─────────────────────────────────────────────────────────────┐
│ Phase 5: Review (品質判定)                                   │
│                                                              │
│ [ReviewAgent]                                                │
│  1. 静的解析                                                │
│  2. セキュリティスキャン                                    │
│  3. 品質スコアリング (100点満点、80点以上で合格)            │
│                                                              │
│ Output: ReviewContext                                        │
└─────────────────────────────────────────────────────────────┘
  ↓
┌─────────────────────────────────────────────────────────────┐
│ Phase 6: Verification (検証)                                 │
│                                                              │
│ [TestAgent]                                                  │
│  1. テスト実行 (Jest/Vitest)                                │
│  2. カバレッジ計測 (80%+ 目標)                              │
│  3. Kernel の Verification を自動追加:                      │
│     kernel.verification.add({                               │
│       id: "VER-" + timestamp,                               │
│       statement: "Generated code passes all tests",         │
│       method: "Jest unit tests",                            │
│       status: "passed",                                     │
│       verifiedBy: "TestAgent",                              │
│       evidence: [test_results.json]                         │
│     })                                                       │
│                                                              │
│ Output: TestContext, Updated Kernels                         │
└─────────────────────────────────────────────────────────────┘
  ↓
┌─────────────────────────────────────────────────────────────┐
│ Phase 7: Validation (妥当性確認)                             │
│                                                              │
│ [DeploymentAgent]                                            │
│  1. デプロイ実行 (dev/staging/prod)                         │
│  2. ヘルスチェック                                          │
│  3. Kernel の Validation を自動追加:                        │
│     kernel.validation.add({                                 │
│       id: "VAL-" + timestamp,                               │
│       statement: "Deployed code meets user needs",          │
│       method: "Production health check",                    │
│       status: "passed",                                     │
│       validatedBy: "DeploymentAgent"                        │
│     })                                                       │
│  4. Maturity 遷移:                                          │
│     if all_verifications_passed:                            │
│       kernel.maturity = 'agreed'                            │
│     if all_validations_passed:                              │
│       kernel.maturity = 'frozen'                            │
│                                                              │
│ Output: DeploymentContext, Updated Kernels (frozen)          │
└─────────────────────────────────────────────────────────────┘
  ↓
┌─────────────────────────────────────────────────────────────┐
│ Phase 8: Monitoring (監視)                                   │
│                                                              │
│ [MonitoringAgent]                                            │
│  1. メトリクス収集                                          │
│  2. ヘルスチェック実行                                      │
│  3. アラート生成                                            │
│                                                              │
│ Output: MonitoringContext                                    │
└─────────────────────────────────────────────────────────────┘
  ↓
┌─────────────────────────────────────────────────────────────┐
│ Phase 9: Continuous Improvement (継続的改善)                 │
│                                                              │
│ [ContinuousImprovementService] (未実装)                      │
│  1. 週次 KPI チェック:                                      │
│     - Φ違反率                                              │
│     - under_review 滞留日数                                 │
│     - Convergence Rate                                      │
│  2. 改善アクション提案:                                     │
│     if convergence_rate < 70%:                              │
│       suggest("Complete NRVV links")                        │
│     if violation_rate > 5%:                                 │
│       suggest("Adjust granularity")                         │
│  3. GitHub Issue 自動作成                                   │
│                                                              │
│ Output: Improvement Actions                                  │
└─────────────────────────────────────────────────────────────┘
  ↓
┌─────────────────────────────────────────────────────────────┐
│                 Self-Improvement Loop                        │
│                                                              │
│  次の Issue:                                                │
│    - Kernel Registry に蓄積された知識を活用                 │
│    - 過去の Requirements/Constraints を参照                 │
│    - 過去の Verification パターンを再利用                   │
│    - より高品質なコード生成 🔄                              │
│                                                              │
│  Convergence Rate が上がるほど:                             │
│    - NRVV トレーサビリティが完全になる                      │
│    - 知識の再利用性が高まる                                 │
│    - 実装の品質が向上する                                   │
│    - 実装速度が向上する                                     │
└─────────────────────────────────────────────────────────────┘
```

### 6.2 具体例: Issue から実装まで

#### **Example: Issue #100 "Add JWT Authentication"**

```yaml
# Issue #100
title: "Add JWT Authentication"
body: |
  ## Outcome Assessment
  progress: better
  Expected: User authentication will be more secure

  ## Safety Assessment
  feedbackLoops: present
  violations: []

  ## Description
  Implement JWT-based authentication for API endpoints.

  ## Requirements
  - Use JWT tokens for stateless authentication
  - Token expiration: 15 minutes
  - Refresh token support
  - Secure token storage

  ## Related Kernels
  - KRN-002 (User authentication using JWT)

labels: [feature, security, priority:P1-High]
```

#### **Phase 0: DEST判定**

```typescript
DESTAgent.execute(100) →
  outcome: { progress: 'better', outcomeOk: true }
  safety: { feedbackLoops: 'present', violations: [], safetyOk: true }
  al: 'AL2'  // ✅ Assured → 実装を進める
```

#### **Phase 1: Planning**

```typescript
PlanningAgent.execute(100) →
  opportunity: {
    target_customer: "API users",
    problem: "Stateless authentication needed for scalability",
    success_description: "Users can authenticate securely with JWT"
  }
  decisionRecord: {
    id: "DR-100",
    decided_by: "ProductOwner",
    decision_type: "adopt",
    rationale: "JWT provides stateless auth suitable for distributed systems",
    falsification_conditions: [
      { signal: "token_compromise_rate", threshold: 5, operator: "gt" }
    ]
  }
```

#### **Phase 2: Kernel生成**

```yaml
# kernels.yaml
KRN-003:
  id: KRN-003
  statement: "API authentication uses JWT tokens"
  sourceIssue: "#100"
  sourceDecisionRecord: "DR-100"
  maturity: draft

  needs:
    - id: NEED-003
      statement: "Provide secure, scalable user authentication"

  requirements:
    - id: REQ-003
      statement: "Implement JWT-based stateless authentication"
      constraints:
        - "HS256 or RS256 algorithm"
        - "Token expiration: 15 minutes"
        - "Refresh token support required"
```

#### **Phase 3: Task分解**

```typescript
CoordinatorAgent.decomposeToDAG(issue, kernels) →
  tasks: [
    { id: "TASK-001", name: "Implement JWT token generation", agent: "codegen" },
    { id: "TASK-002", name: "Implement token verification", agent: "codegen" },
    { id: "TASK-003", name: "Implement refresh token logic", agent: "codegen" },
    { id: "TASK-004", name: "Add authentication middleware", agent: "codegen" },
    { id: "TASK-005", name: "Write unit tests", agent: "test", dependencies: ["TASK-001", "TASK-002"] },
    { id: "TASK-006", name: "Integration tests", agent: "test", dependencies: ["TASK-004"] },
  ]
```

#### **Phase 4: 実装**

```typescript
CodeGenAgent.execute(100) →
  // 1. 関連Kernel検索
  relatedKernels: [KRN-002 (既存), KRN-003 (新規)]

  // 2. Kernel考慮の分析
  analysis: {
    type: "feature",
    relatedKernels: ["KRN-002", "KRN-003"],
    requirements: [
      "Implement JWT-based stateless authentication",
      "HS256 or RS256 algorithm",
      "Token expiration: 15 minutes"
    ],
    constraints: ["Secure token storage", "Refresh token support"]
  }

  // 3. AI プロンプト (Kernel情報を含む)
  prompt: """
  ## Related Kernel Requirements
  - KRN-002: User authentication using JWT
  - KRN-003: API authentication uses JWT tokens
    Requirements:
    - Implement JWT-based stateless authentication
    - HS256 or RS256 algorithm
    - Token expiration: 15 minutes
    Constraints:
    - Secure token storage
    - Refresh token support required

  ## Code Generation
  Generate TypeScript code for JWT authentication...
  """

  // 4. Generated Code
  generatedCode: [
    { filename: "src/auth/jwt.ts", content: "..." },
    { filename: "src/auth/jwt.test.ts", content: "..." },
    { filename: "src/middleware/auth.ts", content: "..." }
  ]

  // 5. Kernel更新
  KRN-003.relatedArtifacts.add({
    type: "code",
    path: "src/auth/jwt.ts",
    description: "JWT authentication implementation"
  })
  KRN-003.history.add({
    timestamp: "2026-01-15T10:00:00Z",
    action: "code_generated",
    by: "CodeGenAgent",
    notes: "Generated 3 files for Issue #100"
  })
```

#### **Phase 6: Verification**

```typescript
TestAgent.execute(codegenContext) →
  testResults: {
    testsPassed: 15,
    testsFailed: 0,
    coveragePercent: 95
  }

  // Kernel の Verification 自動追加
  KRN-003.verification.add({
    id: "VER-003",
    statement: "JWT authentication code passes all tests",
    method: "Jest unit tests + integration tests",
    status: "passed",
    verifiedAt: "2026-01-15T10:30:00Z",
    verifiedBy: "TestAgent",
    evidence: [
      { type: "test_result", path: "test-results.json", hash: "sha256:..." }
    ],
    traceability: { upstream: ["REQ-003"], downstream: [] }
  })
```

#### **Phase 7: Validation**

```typescript
DeploymentAgent.execute(testContext) →
  deployStatus: "success"
  healthCheck: "passed"

  // Kernel の Validation 自動追加
  KRN-003.validation.add({
    id: "VAL-003",
    statement: "JWT authentication works in production",
    method: "Production health check + user authentication test",
    status: "passed",
    validatedAt: "2026-01-15T11:00:00Z",
    validatedBy: "DeploymentAgent"
  })

  // Maturity 遷移
  KRN-003.maturity: "draft" → "agreed" → "frozen"
```

#### **次の Issue #101 "Add OAuth2 Support"**

```typescript
// Issue #101 を受け取ったとき
CodeGenAgent.findRelatedKernels(issue) →
  // 自動的に KRN-003 (JWT authentication) を発見
  relatedKernels: [KRN-003]

  // KRN-003 の Requirements/Constraints を参照
  // - "HS256 or RS256 algorithm" → OAuth2 でも同じアルゴリズムを使用
  // - "Token expiration: 15 minutes" → OAuth2 でも同じ期限を設定
  // - "Refresh token support" → OAuth2 の Refresh token と統合

  // より高品質なコード生成 ✅
  // - 過去の実装パターンを再利用
  // - 既存の JWT 実装と整合性のあるコード
  // - セキュリティ制約を自動的に満たす
```

---

## 7. まとめ

### 7.1 Luna の本質

**「過去の知識を活用し、使うほど賢くなる自律型開発システム」**

- **Problem Space (DEST) → Solution Space (Kernel) の順序を守る**
- **DecisionRecord を Kernel に変換し、NRVV で蓄積する**
- **Kernel が蓄積されるほど、実装の品質が向上する**
- **Luna が Luna を改善することで、信頼性を実証する**

### 7.2 現在の実装状況

| レイヤ / 機能 | 実装状況 |
|------------|---------|
| Phase 0: DEST判定 | ⚠️ 部分的 (次の最優先タスク) |
| Phase 1: Planning | ⚠️ 部分的 |
| Phase 2: Kernel生成 | ✅ 実装済み |
| Phase 3: Task分解 | ⚠️ Kernel参照未実装 |
| Phase 4: 実装 (CodeGenAgent) | ✅ **Kernel統合完了** |
| Phase 5: Review | ✅ 実装済み |
| Phase 6: Verification (TestAgent) | ⏳ Kernel更新未実装 |
| Phase 7: Validation (DeploymentAgent) | ⏳ Kernel更新未実装 |
| Phase 8: Monitoring | ✅ 実装済み |
| Phase 9: Continuous Improvement | ❌ 未実装 |

**Self-Improvement Loop 実装率: 55%**

### 7.3 次のステップ

#### **最優先 (P0)**:
1. **DEST判定の統合** - CoordinatorAgent に Phase 0 を追加
2. **TestAgent の Verification 自動追加**
3. **CoordinatorAgent の Kernel 参照**

#### **次期 (P1)**:
4. **Issue → Kernel 自動変換強化**
5. **DeploymentAgent の Validation 自動追加**

#### **将来 (P2)**:
6. **Continuous Improvement Service**
7. **Kernel Convergence 自動監視**

### 7.4 ビジョンの実現に向けて

```
現在:  Issue → 手動分析 → 手動実装 → 手動テスト
         ↓
目標:  Issue → Luna (自動分析・実装・テスト・デプロイ) → Done
         ↓
         Kernel に知識が蓄積
         ↓
未来:  Issue → Luna (より高品質・高速な実装) → Done ✨
```

**Luna が使われるほど賢くなり、開発者の生産性が向上する。**

これが **Luna Self-Improving Autonomous Development System** のビジョンです。

---

Generated by: Luna Self-Analysis
Date: 2026-01-15
Based on: dest.yaml, unified_planning_and_ssot_framework.yaml, and user conversations
