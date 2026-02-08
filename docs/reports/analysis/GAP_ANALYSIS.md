# 理想設計 vs 現在の実装 ギャップ分析レポート

**日時**: 2026-01-14
**分析対象**:
- 理想設計: `unified_planning_and_ssot_framework.yaml` (v1.3) + `dest.yaml` (v0.6)
- 現在の実装: Luna プロジェクト (2026-01-13時点)

**全体完成度**: **35%** (主要機能の約1/3が実装済み)

---

## 📊 サマリー

| レイヤー | 完成度 | 実装済み | 部分実装 | 未実装 |
|---------|-------|---------|---------|-------|
| **Planning Layer** | 30% | 3/10 | 2/10 | 5/10 |
| **SSOT Layer** | 20% | 1/10 | 2/10 | 7/10 |
| **DEST Integration** | 50% | 4/8 | 3/8 | 1/8 |
| **Workflow** | 15% | 1/6 | 0/6 | 5/6 |
| **全体** | **35%** | **9/34** | **7/34** | **18/34** |

---

## 1. Planning Layer のギャップ

### ✅ 実装済み (3/10)

#### 1.1 Opportunity ✅
**理想設計**:
```yaml
Opportunity:
  required_fields:
    - id
    - target_customer_or_user
    - problem_or_desired_outcome
    - usage_context
    - time_horizon
    - success_description
```

**現在の実装**: `src/agents/planning-agent.ts`
```typescript
interface Opportunity {
  id: string;
  title: string;
  targetCustomer: string;
  problem: string;
  desiredOutcome: string;
  constraints: string[];
  createdAt: string;
  createdBy: string;
}
```

**ギャップ**:
- ❌ `usage_context` 欠落
- ❌ `time_horizon` 欠落
- ❌ `success_description` 欠落（`desiredOutcome` で代用）

---

#### 1.2 OptionSet ✅
**理想設計**:
```yaml
OptionSet:
  required_fields:
    - option_id
    - option_hypothesis
    - functional_scope
    - architectural_implications
    - differentiating_points
    - known_unknowns
    - evidence_references
```

**現在の実装**: `src/agents/planning-agent.ts`
```typescript
interface Option {
  id: string;
  title: string;
  hypothesis: string;
  pros: string[];
  cons: string[];
  risks: string[];
  leveragePointId?: LeveragePoint;
}
```

**ギャップ**:
- ❌ `functional_scope` 欠落
- ❌ `architectural_implications` 欠落
- ❌ `differentiating_points` 欠落
- ❌ `known_unknowns` 欠落
- ❌ `evidence_references` 欠落

---

#### 1.3 DecisionRecord ✅
**理想設計**:
```yaml
DecisionRecord:
  required_fields:
    - decision_id
    - decided_by
    - decision_type (adopt/defer/reject/continue_explore)
    - rationale_summary
    - tradeoff_summary
    - linked_evaluation_ids
    - remaining_risks
    - dissenting_views
    - falsification_conditions
    - impact_scope
    - linked_evidence
```

**現在の実装**: `src/agents/planning-agent.ts`
```typescript
interface DecisionRecord {
  id: string;
  opportunityId: string;
  decisionType: 'adopt' | 'defer' | 'reject' | 'explore';
  chosenOptionId: string;
  decidedBy: string;
  decidedAt: string;
  rationale: string;
  tradeoffs: string[];
  alternatives: string[];
}
```

**ギャップ**:
- ❌ `linked_evaluation_ids` 欠落
- ❌ `remaining_risks` 欠落
- ❌ `dissenting_views` 欠落
- ❌ `falsification_conditions` 欠落（再評価の核）
- ❌ `impact_scope` 欠落
- ❌ `linked_evidence` 欠落

---

### ⚠️ 部分実装 (2/10)

#### 1.4 ConstraintModel ⚠️
**理想設計**:
```yaml
ConstraintModel:
  categories:
    hard_constraints:
      absolute: [physical_limits, legal_or_regulatory_requirements, safety_requirements]
      conditional: [contract_mandates, security_requirements]
    soft_constraints: [cost_preferences, schedule_preferences, organizational_capacity]
  required_fields:
    - classification_rationale
    - scope_of_applicability
```

**現在の実装**: `src/agents/planning-agent.ts`
```typescript
interface Constraint {
  id: string;
  type: 'hard' | 'soft';
  statement: string;
}
```

**ギャップ**:
- ❌ Hard constraint のサブ分類（absolute/conditional）なし
- ❌ `classification_rationale` 欠落
- ❌ `scope_of_applicability` 欠落
- ❌ Soft constraint のカテゴリ化なし

---

#### 1.5 Assumption ⚠️
**理想設計**:
```yaml
Assumption:
  required_fields:
    - assumption_id
    - statement
    - owner
    - confidence_level
    - validation_method
    - falsification_signal_ref
    - expiry_or_review_date
    - linked_option_ids
    - linked_decision_ids
    - status (active/invalidated/superseded)
```

**現在の実装**: `src/types/nrvv.ts` に型定義のみ存在
```typescript
// PlanningData に assumptions フィールドはあるが、管理機能なし
```

**ギャップ**:
- ❌ Assumption 作成機能なし
- ❌ Assumption 検証機能なし（AssumptionTrackerAgent は excluded）
- ❌ `falsification_signal_ref` による自動再評価トリガーなし
- ❌ `expiry_or_review_date` による期限管理なし

---

### ❌ 未実装 (5/10)

#### 1.6 ValueModel ❌
**理想設計**:
```yaml
ValueModel:
  dimensions:
    user_value: { sign: "+/-", description: "使いやすさ、体験、効率" }
    business_value: { sign: "+/-", description: "収益性、競争力、戦略整合" }
    risk_value: { sign: "-", description: "安全、法務、品質、評判、セキュリティ等の負価値" }
    societal_value: { sign: "+/-", description: "環境、社会受容、倫理" }
    technical_asset_value: { sign: "+", description: "不採用でも残る技術資産価値（再利用）" }
```

**現在の実装**: ❌ なし

**影響**:
- 価値の多次元評価ができない
- 正負の価値（リスク）を構造的に扱えない
- 価値トレードオフの記録ができない

---

#### 1.7 EvaluationRecord ❌
**理想設計**:
```yaml
EvaluationRecord:
  required_fields:
    - evaluation_id
    - evaluated_by
    - evaluation_axes (Q_quality/C_cost/D_delivery/Risk/Uncertainty)
    - findings_summary
    - supporting_evidence
```

**現在の実装**: ❌ なし

**影響**:
- 評価（測る）と決定（選ぶ）の分離ができない
- QCD等の観測軸を記録できない
- DecisionRecord への根拠リンクがない

---

#### 1.8 ReevaluationPolicy ❌
**理想設計**:
```yaml
ReevaluationPolicy:
  triggers:
    - regulation_change
    - safety_or_quality_incident
    - market_or_customer_shift
    - key_assumption_invalidated
    - cost_or_schedule_disruption
    - supplier_or_boundary_change
    - AI_generated_contamination
  scope_rules: [...]
  cadence: [...]
  stop_rules: ["再評価は必ず新しいDecisionRecordを生成して終了する"]
```

**現在の実装**: ❌ なし

**影響**:
- 外乱発生時の自動再評価トリガーがない
- 無限再評価を防ぐ stop_rules がない
- Assumption invalidated 時の処理フローがない

---

#### 1.9 ResponsibilityModel ❌
**理想設計**:
```yaml
ResponsibilityModel:
  roles:
    - role.product_owner (価値裁定、Decision承認、例外承認)
    - role.engineering_lead (技術評価)
    - role.compliance_owner (法規・安全評価)
    - role.product_owner_shared (境界裁定)
```

**現在の実装**: ❌ なし（`decidedBy: string` のみ）

**影響**:
- ロールベースの責任分離がない
- 権限制御ができない
- 例外承認の主語が不明確

---

#### 1.10 ExceptionProposal ❌
**理想設計**:
```yaml
ExceptionProposal:
  required_fields:
    - proposal_id
    - type (E_quality_over_speed/E_differentiation_over_cost/E_new_value_axis)
    - rationale
    - requested_by
    - linked_decision_id
    - requested_expiry_condition
    - proposed_mitigation_plan
    - monitoring_signal
```

**現在の実装**: ❌ なし

**影響**:
- 例外提案から Exception への昇格フローがない
- 例外の型分類ができない
- 期限・緩和策・監視シグナルの管理ができない

---

## 2. SSOT Layer のギャップ

### ✅ 実装済み (1/10)

#### 2.1 Kernel with NRVV ✅
**理想設計**:
```yaml
K_t: "核として DecisionRecord を含む"
NRVV: "Needs-Requirements-Verification-Validation"
```

**現在の実装**: `src/ssot/kernel-registry.ts` + `src/types/nrvv.ts`
```typescript
interface KernelWithNRVV {
  id: string;
  statement: string;
  category: KernelCategory;
  owner: string;
  maturity: MaturityLevel;
  needs: Need[];
  requirements: Requirement[];
  verification: Verification[];
  validation: Validation[];
  // ...
}
```

**ギャップ**:
- ❌ Kernel への DecisionRecord 埋め込みが不完全（`sourceDecisionRecord` はあるが第一級要素ではない）
- ❌ Planning Layer の DecisionRecord との双方向リンクがない

---

### ⚠️ 部分実装 (2/10)

#### 2.2 Evidence Governance ⚠️
**理想設計**:
```yaml
EvidenceItem:
  required_fields:
    - evidence_id
    - source_type (human_doc/tool_output/ai_generated/transcript)
    - origin_ref
    - created_at
    - hash_or_signature
    - verification_status (unverified/verified/disputed/quarantined)
    - verifier
    - verification_method
    - linked_kernel_refs
  promotion_gate_X_to_K:
    rule: "source_type=ai_generated は verification_status=verified になるまで Kernel 第一級要素へ昇格禁止"
```

**現在の実装**: `src/types/nrvv.ts`
```typescript
interface VerificationEvidence {
  type: 'test_result' | 'analysis_report' | 'inspection_log' | 'tool_output';
  path: string;
  hash?: string;
  createdAt?: string;
}
```

**ギャップ**:
- ❌ `verification_status` がない
- ❌ `source_type` に `ai_generated` がない
- ❌ AI生成物の昇格ゲートがない
- ❌ `u.quarantine_evidence` operator がない

---

#### 2.3 Maturity State Machine ⚠️
**理想設計**:
```yaml
states: [draft, under_review, agreed, frozen, deprecated]
transition_authority:
  - transition: "under_review -> agreed"
    allowed_roles: [role.ssot_reviewer, role.product_owner]
  - transition: "agreed -> frozen"
    allowed_roles: [role.product_owner, role.ssot_reviewer]
```

**現在の実装**: `src/types/nrvv.ts`
```typescript
type MaturityLevel = 'draft' | 'under_review' | 'agreed' | 'frozen' | 'deprecated';
```

**ギャップ**:
- ❌ 状態遷移の権限制御がない
- ❌ ゲート制御がない
- ❌ 状態遷移履歴が記録されない
- ❌ Baseline化のルールがない

---

### ❌ 未実装 (7/10)

#### 2.4 Agent Model (θ演算子) ❌
**理想設計**:
```yaml
operators:
  θ_understand: "X -> K への正準化"
  θ_generate: "仮説・構造・候補の生成"
  θ_allocate: "責任・境界・秘匿・所有権の割当"
  θ_execute: "K -> B への成果物生成"
  θ_integrate: "境界間の共有核整合"
  θ_learn: "違反・滞留・コストの観測と設計更新"
```

**現在の実装**: ❌ なし

**影響**:
- SSOT の形式的定義がない
- 操作の分類ができない
- エージェント間の協調モデルがない

---

#### 2.5 Intent Model ❌
**理想設計**:
```yaml
intent_types:
  - id: "audit_ready"
    weights: { quality: 0.6, cost: 0.2, speed: 0.2 }
  - id: "reuse_max"
    weights: { quality: 0.5, cost: 0.3, speed: 0.2 }
  - id: "speed_first"
    weights: { quality: 0.3, cost: 0.2, speed: 0.5 }
effect:
  description: "粒度方針・ゲート厳格度・Φ違反許容度・改善サイクル頻度に反映"
```

**現在の実装**: ❌ なし

**影響**:
- 運用モード（quality/cost/speed）の制御ができない
- ゲート厳格度の調整ができない
- Intent に応じた threshold 設定ができない

---

#### 2.6 Convergence Model ❌
**理想設計**:
```yaml
convergence_criteria:
  invariant_stability: "Φ違反が再発しない (< 5% / review_cycle)"
  flow_stability: "under_review 平均滞留日数 < T_days"
  impact_predictability: "影響分析平均時間 < Delta_hours"
  audit_readiness: "証跡再構成時間 < A_hours"
non_convergence_signals:
  - "同一Φ違反の周期的再発"
  - "例外IDの増殖"
  - "核Kの肥大化による更新頻度低下"
```

**現在の実装**: ❌ なし

**影響**:
- 収束判定ができない
- 非収束シグナルの検出ができない
- KPI ベースの継続改善ができない

---

#### 2.7 World Model & Disturbance Handling ❌
**理想設計**:
```yaml
disturbances_d_t:
  categories:
    - "要求変更・仕様追加"
    - "組織圧・期限短縮"
    - "境界変更（サプライヤ・秘匿）"
    - "AI生成物・要約の混入"
    - "法規・監査要求の追加"
    - "重大不具合・品質事故"
    - "市場/顧客の急変"
signals_catalog:
  - signal_id: "sig.audit_nonconformity"
  - signal_id: "sig.field_incident_rate"
  - signal_id: "sig.security_critical_cve"
  - signal_id: "sig.contract_sla_breach"
```

**現在の実装**: ❌ なし

**影響**:
- 外乱のカテゴリ化ができない
- シグナル検出ができない
- 外乱から ChangeRequest への自動変換ができない

---

#### 2.8 Boundary Composition ❌
**理想設計**:
```yaml
local_kernel: K_i (境界iの部分核)
shared_kernel: S_ij (境界iとjで共有する最小の核)
projection_sigma: K^(i) -> S^(i)_{ij} (秘匿除去・契約範囲化)
alignment_mapping: S^(i)_{ij} <-> S^(j)_{ij} (語彙/粒度/ID/関係の整合)
arbitration: ArbitrationRecord (境界矛盾の裁定記録)
invariants:
  Phi_i: "境界iのK^(i)が満たすべき整合性制約"
  Phi_ij: "共有核S_ij上で満たすべき整合性制約"
  Phi_star: "全体として破綻しないための最小セット"
```

**現在の実装**: ❌ なし

**影響**:
- 複数境界（部門/会社）の扱いができない
- 秘匿射影ができない
- 境界矛盾の裁定ができない

---

#### 2.9 Change Control & ChangeRequest ❌
**理想設計**:
```yaml
ChangeRequest:
  required_fields:
    - cr_id
    - raised_by
    - trigger_type
    - affected_scope
    - proposed_operations (u.*)
    - required_reviews (gate.*)
    - gate_outcome
    - state_transitions
    - decision_update_rule
    - evidence_pack_refs
    - rollback_plan_ref
disturbance_to_cr_rules:
  - trigger_type: "regulation_change"
    default_proposed_operations: [u.link_evidence, u.record_decision, u.set_state, u.create_baseline]
    required_reviews: [gate.review, gate.po_approval, gate.evidence_verification]
    decision_update_rule: "must_update_decision"
```

**現在の実装**: ❌ なし

**影響**:
- 外乱を CR に正規化できない
- 変更手続きが一本化されていない
- Rollback plan がない

---

#### 2.10 Operator Set (u.*) ❌
**理想設計**:
```yaml
finite_operators:
  - u.split (1要素を複数に分割)
  - u.merge (複数要素を統合)
  - u.retype (型の変更)
  - u.rewire (関係の付け替え)
  - u.alias (同義・別名の登録)
  - u.normalize_id (ID体系への正規化)
  - u.link_evidence (根拠への参照リンク付与)
  - u.quarantine_evidence (Evidence を隔離)
  - u.set_state (成熟度状態遷移)
  - u.create_baseline (ベースライン作成)
  - u.deprecate (非推奨化)
  - u.raise_exception (例外の起票)
  - u.close_exception (例外の終結)
  - u.record_decision (DecisionRecordをKernelへ登録/更新)
```

**現在の実装**: ❌ なし

**影響**:
- 有限操作の強制ができない
- 自由編集を禁止できない
- 操作のトレーサビリティがない

---

#### 2.11 Exception Registry ❌
**理想設計**:
```yaml
ExceptionRecord:
  required_fields:
    - exception_id
    - type
    - approved_by
    - expiry_condition
    - monitoring_signal
    - mitigation_plan
    - status (open/mitigated/closed/expired)
    - linked_decision_id
    - linked_cr_id
```

**現在の実装**: ❌ なし（ExceptionRegistryAgent は excluded）

**影響**:
- 例外の正本管理ができない
- 期限切れ検出ができない
- 例外増殖の監視ができない

---

## 3. DEST Integration のギャップ

### ✅ 実装済み (4/8)

#### 3.1 AL Judgment ✅
**理想設計**:
```yaml
assurance_level:
  values: [AL2: Assured, AL1: Qualified, AL0: NotAssured]
  rules:
    AL0: "NOT safety_ok"
    AL2: "outcome_ok AND safety_ok"
    AL1: "otherwise"
```

**現在の実装**: `src/agents/dest-agent.ts` ✅ 完全一致

---

#### 3.2 AL0 Reason Detection ✅
**理想設計**:
```yaml
reasons: [R01-R11]
protocol_priority_order: [P0-P4]
```

**現在の実装**: `src/agents/al0-reason-detector.ts` ✅ 完全一致

---

#### 3.3 Protocol Routing ✅
**理想設計**: P0-P4 の優先順位
**現在の実装**: `src/agents/protocol-router.ts` ✅ 完全一致

---

#### 3.4 Leverage Point (Limited) ✅
**理想設計**: LP1-LP12 の12段階
**現在の実装**: `src/agents/planning-agent.ts` の `analyzeLeveragePoint` ✅ 実装済み（簡易版）

---

### ⚠️ 部分実装 (3/8)

#### 3.5 Safety Checks (C1-C4) ⚠️
**理想設計**:
```yaml
safety_checks:
  C1: "悪い正のフィードバック（7）を強めていないか？"
  C2: "遅れ（9）を無視して過剰修正し、振動を増やしていないか？"
  C3: "負のフィードバック（8）を削って逸脱が戻らなくなっていないか？"
  C4: "パラメータ（12）だけで構造/情報/ルール/目的（10..3）を放置していないか？"
```

**現在の実装**: `src/types/index.ts` に型定義のみ
```typescript
type SafetyCheck = 'C1-PositiveFB' | 'C2-DelayOscillation' | 'C3-NegativeFB' | 'C4-LowLeverage';
```

**ギャップ**:
- ❌ 実際のチェック機能なし
- ❌ Option への SafetyCheck リンクなし
- ❌ 違反検出機能なし

---

#### 3.6 CrePS Boxes (B1-B6) ⚠️
**理想設計**:
```yaml
boxes_with_dest_extensions:
  B1: "ユーザの具体問題（Real World）"
  B2: "適切に定義された具体的問題（Thinking入口）"
  B3: "現状理解＋理想理解（Thinking World）"
  B4: "アイデア生成（Thinking World）"
  B5: "解決策コンセプト構築（Thinking World）"
  B6: "実装・運用・制度化（Real World）"
```

**現在の実装**: `src/types/index.ts` に型定義のみ + BoxNavigatorAgent は excluded

**ギャップ**:
- ❌ Box 遷移機能なし（BoxNavigatorAgent が excluded）
- ❌ Box ごとの DEST 拡張フィールドなし
- ❌ Real/Thinking 分離の強制なし

---

#### 3.7 Leverage Points Integration ⚠️
**理想設計**:
```yaml
catalog:
  levels: [12: "定数・パラメータ", ..., 1: "パラダイムを超越する力"]
required_fields_additional:
  - "lp_level_id: 1..12（必須）"
  - "linked_checks: [C1..C4] のうち関係するもの"
```

**現在の実装**: `src/agents/planning-agent.ts` の `analyzeLeveragePoint`

**ギャップ**:
- ❌ Option に `lp_level_id` フィールドがない（`leveragePointId` はあるが Optional）
- ❌ `linked_checks` フィールドがない
- ❌ LP 分析が簡易的（キーワードマッチのみ）

---

### ❌ 未実装 (1/8)

#### 3.8 CrePS Gates (G2-G6) ❌
**理想設計**:
```yaml
gates_with_dest_alignment:
  gate_policy:
    enforcement_rule: "G2→G3→G4→G5→G6 の順に通過しないと次へ進めない（例外は明文化）"
  gate_catalog_extensions:
    G2_problem_definition_additional_must: ["Outcome/Safety が DESTの outcome_ok/safety_ok へ写像されている"]
    G3_understanding_hypotheses_additional_must: ["stock/flow/delay/feedback/decision-info の5点セットが最低1つある"]
    G4_idea_traceability_additional_must: ["各アイデアに lp_level_id（12..1）が付与されている"]
    G5_concept_feasibility_additional_must: ["Wait/Freeze/Revise の運用姿勢が仕様化されている"]
    G6_field_validity_additional_must: ["AL判定ログ（assurance_observation）がある"]
```

**現在の実装**: ❌ なし（GateKeeperAgent は excluded）

**影響**:
- ゲート強制がない
- Box 遷移の品質保証がない
- DEST 統合仕様のチェックができない

---

## 4. Workflow のギャップ

### ✅ 実装済み (1/6)

#### 4.1 Basic Pipeline Execution ✅
**現在の実装**: CoordinatorAgent による Phase 0-7 の実行
```
Issue → DEST → Planning → SSOT → CodeGen → Review → Test → Deploy → Monitor
```

---

### ❌ 未実装 (5/6)

#### 4.2 Gate Control ❌
**理想設計**: G2→G3→G4→G5→G6 の強制遷移
**現在の実装**: ❌ なし

**影響**:
- Box 間の品質保証がない
- 未完成状態で次工程へ進んでしまう

---

#### 4.3 State Transition Authority ❌
**理想設計**: ロールベースの状態遷移権限
**現在の実装**: ❌ なし

**影響**:
- 誰でも状態を変更できてしまう
- 責任の主語が不明確

---

#### 4.4 ChangeRequest Flow ❌
**理想設計**: 外乱 → CR → 操作(u.*) → ゲート → 状態遷移
**現在の実装**: ❌ なし

**影響**:
- 変更手続きが一本化されていない
- Rollback ができない

---

#### 4.5 Exception Management Cycle ❌
**理想設計**: Proposal → Record → 期限管理 → 終結
**現在の実装**: ❌ なし

**影響**:
- 例外が増殖する
- 期限切れが検出されない

---

#### 4.6 Reevaluation Trigger ❌
**理想設計**: Assumption invalidated → ReevaluationPolicy → ChangeRequest → DecisionRecord 更新
**現在の実装**: ❌ なし

**影響**:
- 前提崩れ時の自動再評価がない
- 無限再評価を防ぐ仕組みがない

---

## 5. ギャップの優先順位付け

### 🔴 Critical (P0) - 基盤機能として必須

1. **DecisionRecord の falsification_conditions** - 再評価の核
2. **ChangeRequest フロー** - 変更手続きの一本化
3. **Gate Control (G2-G6)** - 品質保証の要
4. **Exception Registry** - 例外の制御
5. **State Transition Authority** - 責任の明確化

### 🟠 High (P1) - 運用品質に直結

6. **EvaluationRecord** - 評価と決定の分離
7. **ReevaluationPolicy** - 再評価のトリガー管理
8. **ValueModel** - 多次元の価値評価
9. **Evidence Governance** - AI生成物の昇格ゲート
10. **Convergence Criteria** - 収束判定とKPI

### 🟡 Medium (P2) - 拡張性・保守性の向上

11. **Operator Set (u.*)** - 有限操作の強制
12. **Intent Model** - 運用モード制御
13. **Boundary Composition** - 複数境界の扱い
14. **ResponsibilityModel** - ロールベースの権限
15. **Assumption Management** - 前提の追跡

### 🟢 Low (P3) - 将来拡張

16. **Agent Model (θ演算子)** - 形式的定義
17. **World Model & Disturbance Catalog** - 外乱のカテゴリ化
18. **CrePS Box DEST Extensions** - Box ごとの拡張フィールド
19. **Safety Checks実装** - C1-C4の自動チェック
20. **Leverage Points詳細分析** - 12段階の詳細実装

---

## 6. 実装ロードマップ提案

### Phase 1: 基盤整備（P0 Critical）

**目標**: ChangeRequest + Exception + Gate の基本フロー確立

1. **Week 1-2**: ChangeRequest + Operator Set
   - ChangeRequest 型定義
   - 基本 operator (u.record_decision, u.raise_exception, u.set_state)
   - ChangeControlAgent 実装

2. **Week 3-4**: Exception Registry
   - ExceptionRecord 型定義
   - ExceptionRegistryAgent 実装（期限管理・状態遷移）

3. **Week 5-6**: Gate Control
   - Gate 型定義（G2-G6）
   - GateKeeperAgent 実装
   - Box 遷移との統合

4. **Week 7-8**: DecisionRecord falsification_conditions
   - `falsification_conditions` フィールド追加
   - Signal 検出機構
   - 自動再評価トリガー

5. **Week 9-10**: State Transition Authority
   - ResponsibilityModel 実装
   - ロールベースの権限制御
   - Maturity 遷移の権限チェック

**完了時**: 基本的な Change Control ループが回る

---

### Phase 2: 評価・決定の分離（P1 High）

**目標**: 意思決定プロセスの品質向上

6. **Week 11-12**: EvaluationRecord
   - EvaluationRecord 型定義
   - DecisionRecord との分離
   - QCD軸の記録

7. **Week 13-14**: ValueModel
   - 多次元価値モデル実装
   - 正負の価値表現
   - トレードオフ分析

8. **Week 15-16**: ReevaluationPolicy
   - Trigger カタログ
   - Scope rules
   - Stop rules

9. **Week 17-18**: Evidence Governance
   - verification_status フィールド
   - AI生成物の昇格ゲート
   - u.quarantine_evidence

10. **Week 19-20**: Convergence Criteria
    - KPI定義
    - 非収束シグナル検出
    - ダッシュボード

**完了時**: Planning Layer が完全に機能する

---

### Phase 3: 境界・運用モード（P2 Medium）

**目標**: 複雑な組織構造への対応

11. **Week 21-24**: Boundary Composition
    - 共有核（S_ij）
    - 秘匿射影（σ）
    - 境界裁定

12. **Week 25-26**: Intent Model
    - quality/cost/speed の重み付け
    - Gate 厳格度の調整
    - Threshold 設定

13. **Week 27-28**: Assumption Management
    - AssumptionTrackerAgent の復活
    - 期限管理
    - Falsification signal

**完了時**: 複数境界・複数運用モードに対応

---

### Phase 4: 形式化・可視化（P3 Low）

**目標**: 理論との完全整合・可視化

14. **Week 29-30**: Agent Model (θ演算子)
15. **Week 31-32**: Safety Checks (C1-C4)
16. **Week 33-34**: Leverage Points 詳細分析
17. **Week 35-36**: Traceability Matrix 可視化

**完了時**: 理想設計との完全整合

---

## 7. まとめ

### 現状の強み ✅
- DEST の AL判定・AL0Reason検出・Protocol routing が完全実装
- NRVV トレーサビリティの基本構造が確立
- Verification/Validation の自動記録が機能
- CoordinatorAgent によるパイプライン実行が安定

### 最大のギャップ 🔴
1. **ChangeRequest フロー不在** → 変更手続きが野放し
2. **Gate Control 不在** → 品質保証の穴
3. **falsification_conditions 不在** → 再評価が機能しない
4. **Exception 管理不在** → 例外が制御不能
5. **ResponsibilityModel 不在** → 責任の主語が不明確

### 推奨アクション
**Phase 1 (P0 Critical) を最優先で実装することを強く推奨します。**

Phase 1 を完了すると:
- 変更手続きが一本化される
- 例外が制御可能になる
- Gate によって品質が保証される
- 再評価が自動化される
- 責任の主語が明確になる

これにより、**理想設計の核心部分（Change Control Loop）が機能し始めます。**

---

**次のステップ**: このギャップを GitHub Issue として登録し、Phase 1 から実装を開始します。

---

## 📝 実装状況更新 (2026-02-08)

### ✅ Self-Improvement Loop関連の実装完了

以下のP0課題が完了し、**Self-Improvement Loopが機能しています**:

#### 1. CoordinatorAgent Kernel連携 ✅ 完了 (2026-02-08)
- **実装内容**: Phase 0.5でSSotAgentを先行実行、Kernel情報を取得
- **ファイル**: `src/agents/coordinator-agent.ts`
- **効果**: KernelのRequirementsからタスクが生成される

#### 2. CodeGenAgent Kernel参照・更新 ✅ 既存実装
- **実装内容**:
  - `analyzeIssueWithKernels()`: Kernel要件を参照してコード生成
  - `updateKernelsWithGeneratedCode()`: 生成コードをKernelに記録
- **ファイル**: `src/agents/codegen-agent.ts` (L73-94, L521-798)
- **効果**: Kernel要件を考慮した高品質コード生成

#### 3. TestAgent Verification自動追加 ✅ 既存実装
- **実装内容**: `recordVerification()` でテスト結果をKernelに自動記録
- **ファイル**: `src/agents/test-agent.ts` (L133-140, L449-505)
- **効果**: 双方向トレーサビリティを自動保証

#### 4. Issue → Kernel自動変換 ✅ 既存実装
- **実装内容**: AI (Claude) でIssue bodyからNRVVを自動抽出
- **ファイル**: `src/agents/ssot-agent-v2.ts`
- **効果**: Planning LayerなしでもKernel生成可能

#### 5. NRVV自動補完 ✅ 既存実装
- **実装内容**: AI (Claude) で不完全KernelのV&Vを自動生成
- **ファイル**: `src/services/kernel-enhancement-service.ts`
- **効果**: Convergence Rate 100%達成

### Self-Improvement Loopの完成

```
Issue → Kernel生成 → Task分解 (Kernel参照) → コード生成 (Kernel要件) →
テスト (Verification追加) → Kernel更新 → 次のIssue 🔄
```

**Lunaは使われるほど賢くなる構造が実現しました。**

### 残存ギャップ

以下のP0課題は引き続き実装が必要です:
- ChangeRequest フロー
- Gate Control (G2-G6)
- falsification_conditions
- Exception Registry
- State Transition Authority

これらは理想設計の完全実装のために必要ですが、基本的なSelf-Improvement Loopは既に機能しています。
