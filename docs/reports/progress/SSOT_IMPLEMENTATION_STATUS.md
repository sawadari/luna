# SSOT Self-Improvement Implementation Status

## 概要

`unified_planning_and_ssot_framework.yaml` に記載されている構想と現在のLuna実装の対応状況を分析しました。

日付: 2026-01-15

---

## 🎯 ユーザーの構想

> Lunaの機能が改善されるとともにSSOTとしてデータが蓄積されていき、その蓄積されたデータによって、機能改善の品質を上げていく

この構想は **Self-Improvement Loop** として、以下の3段階で実現されるべきです:

1. **Luna の機能改善** → データ生成
2. **SSOT へのデータ蓄積** → 知識の蓄積
3. **蓄積データによる品質向上** → 学習と改善

---

## ✅ 実装済み: Planning Layer (上位レイヤ)

### DecisionRecord 管理
- **実装**: `src/services/reevaluation-service.ts` (328 lines)
- **保存先**: `decisions.yaml`
- **機能**:
  - ✅ DecisionRecord の登録・管理
  - ✅ FalsificationConditions の評価
  - ✅ 再評価トリガーの検出
  - ✅ ReevaluationRecord の生成

### 主要オブジェクト
| Planning Layer オブジェクト | 実装状況 | 保存場所 |
|-------------------------|---------|---------|
| Opportunity | ⚠️ 部分的 | Issue body / Planning data |
| OptionSet | ⚠️ 部分的 | Issue body / Planning data |
| ConstraintModel | ❌ 未実装 | - |
| ValueModel | ❌ 未実装 | - |
| EvaluationRecord | ❌ 未実装 | - |
| **DecisionRecord** | ✅ 完全実装 | `decisions.yaml` |
| Assumption | ❌ 未実装 | - |
| ReevaluationPolicy | ✅ 実装済み | ReevaluationService |

---

## ✅ 実装済み: SSOT Layer (中位レイヤ)

### Kernel Registry (核の蓄積)
- **実装**: `src/ssot/kernel-registry.ts` (500+ lines)
- **保存先**: `kernels.yaml`
- **現在の蓄積データ**:
  ```yaml
  Total Kernels: 3
  - KRN-001: HTTPS通信 (maturity: agreed)
  - KRN-002: JWT認証 (maturity: frozen)
  - KRN-003: 入力検証 (maturity: draft)

  Statistics:
    by_maturity:
      draft: 1
      agreed: 1
      frozen: 1
    convergence_rate: 0% (未収束)
  ```

### NRVV Traceability (トレーサビリティ)
- **実装**: ✅ 完全実装
- **機能**:
  - ✅ Needs → Requirements → Verification → Validation の連鎖
  - ✅ Traceability Matrix 生成
  - ✅ NRVV 検証 (validateNRVV)
  - ✅ Missing Links の検出

### Convergence Monitoring (収束監視)
- **実装**: ✅ 実装済み
- **メトリクス**:
  - ✅ `getConvergenceRate()` - 収束率の計算
  - ✅ Maturity 状態遷移の追跡
  - ✅ History 記録

### SSOTAgentV2 (統合エージェント)
- **実装**: `src/agents/ssot-agent-v2.ts`
- **機能**:
  - ✅ DecisionRecord → Kernel 変換
  - ✅ Maturity 遷移管理
  - ✅ NRVV 検証
  - ✅ Violation 検出
  - ✅ Convergence チェック

### Agent Model - 6つのオペレータ
| オペレータ | 説明 | 実装状況 |
|----------|------|---------|
| θ_understand | コンテキスト解釈・核へ正準化 | ✅ SSOTAgentV2 (Issue → Kernel) |
| θ_generate | 仮説・構造・候補の生成 | ✅ CoordinatorAgent (DAG分解) |
| θ_allocate | 責任・境界・所有権の割当 | ⚠️ 部分的 (owner フィールド) |
| θ_execute | 核から成果物を生成 | ✅ CodeGenAgent |
| θ_integrate | 境界間で共有核を整合 | ❌ 未実装 (Boundary composition) |
| **θ_learn** | 違反・滞留・コストを観測、設計更新 | ⚠️ **部分的** |

---

## ⚠️ 部分的実装: Self-Improvement Loop

### 現在できていること ✅

1. **データの蓄積**:
   - Kernel Registry に3件のKernelが蓄積
   - NRVV トレーサビリティの記録
   - Decision Registry に DecisionRecord 蓄積
   - History (変更履歴) の記録

2. **収束の測定**:
   - `getConvergenceRate()` で収束率を計算
   - NRVV 検証で incomplete links を検出
   - Maturity 遷移の追跡

3. **自己監視**:
   - `scripts/luna-status-check.ts` で自己監視
   - Issue, PR, Gate 統計の取得

### まだできていないこと ❌

#### 1. θ_learn (Continuous Improvement) の自動化

**構想 (unified_planning_and_ssot_framework.yaml:276-279)**:
```yaml
θ_learn:
  description: "違反・滞留・コストを観測し、設計を更新する"
  yaml_binding:
    - "ssot_layer.operating_playbook.continuous_improvement"
    - "ssot_layer.operating_playbook.kpi_examples"
```

**現状**:
- ❌ KPI の自動収集なし
- ❌ 週次/月次/四半期のチェック自動化なし
- ❌ 改善アクションの自動提案なし

**必要な実装**:
```typescript
// 未実装の機能例
class ContinuousImprovementService {
  // 週次チェック
  async weeklyCheck(): Promise<{
    violationRate: number;        // Φ違反率
    stalledReviews: number;       // under_review 滞留
    decisionWithoutOwner: number; // 主語欠落
    expiredAssumptions: number;   // 期限切れ Assumption
  }>;

  // 改善アクション提案
  async suggestImprovements(): Promise<ImprovementAction[]>;

  // 自動適用
  async applyImprovement(action: ImprovementAction): Promise<void>;
}
```

#### 2. 蓄積データからの学習ループ

**構想**:
- 過去のDecisionRecordから成功パターンを学習
- 違反の多いKernelの粒度を自動調整
- Quality Score の傾向分析

**現状**:
- ❌ パターン学習なし
- ❌ 自動粒度調整なし
- ❌ 傾向分析なし

#### 3. Evidence Governance の完全実装

**構想 (unified_planning_and_ssot_framework.yaml:463-487)**:
```yaml
EvidenceItem:
  source_type: [human_doc, tool_output, ai_generated, transcript]
  verification_status: [unverified, verified, disputed, quarantined]

promotion_gate_X_to_K:
  rule: "ai_generatedはverified になるまでKernel昇格禁止"
```

**現状**:
- ⚠️ Evidence フィールドは存在 (kernels.yaml)
- ❌ verification_status の自動管理なし
- ❌ AI生成物の自動検証ゲートなし

#### 4. Boundary Composition (境界間統合)

**構想**:
- 共有核 S_ij の管理
- 秘匿射影 σ の実装
- Arbitration (矛盾裁定)

**現状**:
- ❌ 完全未実装

---

## 📊 実装率の定量評価

### 全体実装率: **55%**

| レイヤ / 機能 | 実装率 | 状態 |
|------------|-------|------|
| **Planning Layer** | 40% | 🟡 部分的 |
| - DecisionRecord | 100% | ✅ 完全 |
| - Reevaluation | 80% | ✅ ほぼ完全 |
| - Opportunity/OptionSet | 30% | 🔴 不十分 |
| - ValueModel/Assumption | 0% | 🔴 未実装 |
| **SSOT Layer** | 70% | 🟢 良好 |
| - Kernel Registry | 100% | ✅ 完全 |
| - NRVV Traceability | 100% | ✅ 完全 |
| - Convergence Monitoring | 90% | ✅ ほぼ完全 |
| - θ_understand/generate/execute | 80% | ✅ 良好 |
| - θ_learn (Continuous Improvement) | 20% | 🔴 不十分 |
| - θ_integrate (Boundary) | 0% | 🔴 未実装 |
| **Self-Improvement Loop** | 35% | 🔴 不十分 |
| - データ蓄積 | 90% | ✅ 良好 |
| - 収束測定 | 70% | 🟡 部分的 |
| - 自動改善 | 10% | 🔴 未実装 |

---

## 🔍 具体的な証拠

### ✅ データは蓄積されている

**kernels.yaml (285 lines)**:
```yaml
kernels:
  KRN-001: { maturity: agreed, needs: [...], requirements: [...], verification: [...] }
  KRN-002: { maturity: frozen, ... }
  KRN-003: { maturity: draft, ... }

statistics:
  total_kernels: 3
  convergence_rate: 0
```

**実行ログ (scripts/luna-status-check.ts)**:
```
📊 Gate Statistics: Total checks: 0
📊 Issue Statistics: Total: 10, Open: 10, P1-High: 2, P2-Medium: 8
📊 PR Statistics: Total PRs: 0
✅ Luna is running and monitoring itself!
```

### ⚠️ しかし自動改善は動いていない

**問題点**:
1. Convergence Rate = 0% のまま放置
2. 違反検出後の自動改善アクションなし
3. KPI の定期チェックが手動
4. 蓄積データから学習するロジックなし

---

## 🎯 Self-Improvement を完成させるために必要なこと

### Priority 1: θ_learn の完全実装

```typescript
// src/services/continuous-improvement-service.ts (新規作成)
export class ContinuousImprovementService {
  // 1. 週次KPIチェック
  async weeklyCheck(): Promise<KPIReport> {
    const violationRate = await this.checkViolationRate();
    const stalledReviews = await this.checkStalledReviews();
    const convergenceRate = await this.kernelRegistry.getConvergenceRate();

    return { violationRate, stalledReviews, convergenceRate };
  }

  // 2. 改善アクション提案
  async analyzeAndSuggest(kpi: KPIReport): Promise<ImprovementAction[]> {
    const actions: ImprovementAction[] = [];

    // Convergence Rate が低い → NRVV リンク補完を提案
    if (kpi.convergenceRate < 70) {
      actions.push({
        type: 'complete_nrvv_links',
        reason: `Convergence rate is ${kpi.convergenceRate}%`,
        affectedKernels: await this.findIncompleteKernels(),
      });
    }

    // 同一違反の再発 → 粒度調整を提案
    if (kpi.violationRate > 5) {
      actions.push({
        type: 'adjust_granularity',
        reason: 'High violation recurrence rate',
      });
    }

    return actions;
  }

  // 3. 自動適用
  async applyImprovement(action: ImprovementAction): Promise<void> {
    // GitHub Issue 自動作成 or 直接修正
  }
}
```

### Priority 2: 自動スケジューリング

```typescript
// scripts/luna-continuous-improvement.ts (新規作成)
import { ContinuousImprovementService } from '../src/services/continuous-improvement-service';

async function main() {
  const service = new ContinuousImprovementService();

  // 週次チェック
  const kpi = await service.weeklyCheck();
  console.log('📊 Weekly KPI:', kpi);

  // 改善提案
  const actions = await service.analyzeAndSuggest(kpi);
  console.log('💡 Suggested improvements:', actions);

  // GitHub Issue として提案
  for (const action of actions) {
    await service.createImprovementIssue(action);
  }
}

// GitHub Actions で週次実行
```

### Priority 3: 学習ループ

```typescript
// src/services/learning-service.ts (新規作成)
export class LearningService {
  // 過去のDecisionから成功パターンを抽出
  async extractSuccessPatterns(): Promise<Pattern[]> {
    const decisions = await this.reevaluationService.getAllDecisions();
    const successful = decisions.filter(d => !d.falsified);

    // パターン抽出 (例: 特定のConstraintを含むDecisionは成功率高い)
    return this.analyzePatternsFromData(successful);
  }

  // 新しいDecision作成時にパターン推奨
  async recommendBasedOnHistory(newDecision: DecisionRecord): Promise<Recommendation[]> {
    const patterns = await this.extractSuccessPatterns();
    return this.matchPatterns(newDecision, patterns);
  }
}
```

---

## 📝 結論

### ✅ できていること
1. **データ蓄積の基盤は整っている** (Kernel Registry, Decision Registry)
2. **NRVV トレーサビリティは完全実装**
3. **収束率の測定は可能**
4. **Luna は自己監視できている**

### ❌ できていないこと
1. **蓄積データからの自動学習なし**
2. **KPI の定期チェックが手動**
3. **改善アクションの自動提案・適用なし**
4. **Self-Improvement Loop が閉じていない**

### 🎯 ユーザーの構想は **55% 実現**

**Self-Improvement Loop を完成させるには**:
- `ContinuousImprovementService` の実装
- GitHub Actions による週次/月次の自動チェック
- `LearningService` によるパターン学習
- 自動改善アクションの適用

**次のステップ**:
1. `src/services/continuous-improvement-service.ts` を実装
2. `.github/workflows/weekly-improvement-check.yml` を作成
3. Convergence Rate を 80%+ に向上
4. 学習ループを閉じる

---

Generated by: Luna Self-Analysis
Date: 2026-01-15
