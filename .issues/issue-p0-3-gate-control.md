# [P0] Gate Control (G2-G6) を実装して品質保証を強化

## 📋 概要

理想設計（dest.yaml）では、CrePS の Box 間遷移を管理する Gate (G2-G6) が定義されていますが、現在の実装には存在しません（GateKeeperAgent は excluded）。これにより、未完成状態で次工程へ進んでしまい、品質が保証されません。

## 🎯 理想設計

```yaml
gates_with_dest_alignment:
  gate_policy:
    enforcement_rule: "G2→G3→G4→G5→G6 の順に通過しないと次へ進めない（例外は明文化）"

  gate_catalog_extensions:
    G2_problem_definition_additional_must:
      - "Outcome/Safety が DESTの outcome_ok/safety_ok へ写像されている"

    G3_understanding_hypotheses_additional_must:
      - "stock/flow/delay/feedback/decision-info の5点セットが最低1つある"

    G4_idea_traceability_additional_must:
      - "各アイデアに lp_level_id（12..1）が付与されている"

    G5_concept_feasibility_additional_must:
      - "Wait/Freeze/Revise の運用姿勢が仕様化されている"

    G6_field_validity_additional_must:
      - "AL判定ログ（assurance_observation）がある"
```

## 📊 現在の実装

❌ **なし** - GateKeeperAgent は excluded

## ❌ ギャップと影響

1. **品質保証の穴** - 未完成状態で次工程へ進める
2. **Box 遷移の野放し** - B1→B2→...→B6 の強制がない
3. **DEST 統合チェック不在** - AL判定、LP分析などのチェックがない
4. **例外の明文化不在** - Gate をスキップする条件が記録されない

## 🚀 実装内容

### 1. Gate 型定義

```typescript
// src/types/gate.ts

export type GateId = 'G2' | 'G3' | 'G4' | 'G5' | 'G6';

export type GateStatus = 'pending' | 'passed' | 'failed' | 'skipped';

export interface GateCheck {
  id: string;
  description: string;
  required: boolean;  // Must または Should
  checkFunction: (context: any) => Promise<boolean>;
}

export interface GateResult {
  gateId: GateId;
  status: GateStatus;
  checkedAt: string;
  checkedBy: string;
  checkResults: Array<{
    checkId: string;
    passed: boolean;
    message: string;
  }>;
  exemption?: {
    reason: string;
    approvedBy: string;
    expiresAt?: string;
  };
}

export interface GateDefinition {
  id: GateId;
  name: string;
  fromBox: CrePSBox;
  toBox: CrePSBox;
  checks: GateCheck[];
}
```

### 2. Gate 定義

5つのGate（G2-G6）の定義を `src/config/gates.ts` に作成。各Gateには具体的なチェック項目を実装します。

### 3. GateKeeperAgent 実装

- checkGate メソッド - Gate チェックを実行
- exemptGate メソッド - Gate をスキップ（例外承認）
- enforceGateSequence メソッド - Gate 強制（G2→G3→...の順序を保証）

### 4. CoordinatorAgent への統合

- G4: Planning → CodeGen 間
- G5: CodeGen → Deployment 間
- G6: Deployment → Monitor 間

## ✅ Acceptance Criteria

- [ ] Gate 型定義を作成（gate.ts）
- [ ] 5つの Gate 定義を作成（gates.ts）
- [ ] GateKeeperAgent 実装
  - [ ] checkGate メソッド
  - [ ] exemptGate メソッド
  - [ ] enforceGateSequence メソッド
- [ ] CoordinatorAgent への統合
- [ ] TypeScript ビルドが成功する
- [ ] テストコード作成（gatekeeper-agent.test.ts）
- [ ] ドキュメント更新

## 🔗 関連Issue

- Issue #2: ChangeRequest Flow 実装
- Issue #5: State Transition Authority 実装

## 📚 参考資料

- `GAP_ANALYSIS.md` - Section 3.8 CrePS Gates (line 727-747)
- `dest.yaml` - gates_with_dest_alignment

## 優先度

**P0 - Critical**: 品質保証の要。Phase 1 で必須。

---

**推定工数**: 1-2週間
**Phase**: Phase 1 - Week 5-6
