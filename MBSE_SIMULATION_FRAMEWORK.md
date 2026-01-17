# MBSE Simulation Framework
**目的**: MBSE経験を“再現可能なシミュレーション”として形式化し、方法論の質を継続改善する。

日付: 2026-01-16

---

## 1. コア思想

- **Method-as-Model**: 開発手順そのものをモデル化し、シミュレーション対象にする。
- **Disturbance Injection**: 外乱を注入し、方法論の耐性を測る。
- **Policy Comparison**: 運用ポリシーを差し替え、性能を比較する。

---

## 2. 入力/出力

### 入力
- Issueストリーム（例: 週次の要求変更）
- Kernel Registry（知識の現在状態）
- 運用ルール（ゲート/権限/承認ポリシー）
- 外乱シナリオ（安全事故/法規変更/AI混入など）

### 出力
- 収束率、再発率、変更影響時間
- Decisionの安定性（falsification頻度）
- 学習効率（Kernel再利用率）
- 承認ボトルネックの発生率

---

## 3. シミュレーション対象（最小モデル）

### エンティティ
- Kernel / Decision / NRVV
- Issue / CR / u.* Operation
- Evidence / Observation
- Gate / Authority / Approval

### プロセス
```
Issue → DEST → Planning → Kernel生成 → Task → Code → Test → Observe → Update
```

---

## 4. 外乱カタログ（最小）

- 仕様変更（Scope拡大）
- 安全事故（AL0判定）
- 法規変更（Compliance強制）
- AI混入（Evidence不確実性）
- 依存境界の変化（外部API変更）

---

## 5. ポリシー差し替え例

- Gate厳格度: strict / balanced / fast
- 承認レベル: single / dual / safety-first
- Evidence運用: record-only / promotion-gated
- NRVV自動補完: on/off

---

## 6. 指標（Method Quality Metrics）

- **Convergence Rate**: NRVVの完全性と安定度
- **Violation Recurrence**: Φ違反の再発率
- **Decision Stability**: falsification頻度
- **Impact Predictability**: 影響分析時間
- **Audit Readiness**: 監査再構成時間

---

## 7. MVS（Minimal Viable Simulation）

### 目的
方法論の「質比較」を最小コストで可能にする。

### 構成
- 20件程度のIssueストリーム
- 3種の外乱シナリオ
- 2種の運用ポリシー
- 主要指標5つで比較

### 成果
「どの運用ルールが最も収束率と安全性を高めるか」を定量化。

---

## 8. 実験設計（ベース）

1. ポリシーA/Bを設定
2. 同一Issueストリームでシミュレーション
3. 外乱を同じタイミングで注入
4. 指標の差を計測

---

## 9. 実装ロードマップ（コア集中）

### Phase A: Simulation Core
- Issueストリームの再生
- Kernel更新の再現（Ledger経由）
- 指標の集計

### Phase B: Disturbance Engine
- 外乱注入のスケジューラ
- 安全/法規/AI混入シナリオ

### Phase C: Policy Layer
- Gate/Authority/Approvalの切り替え
- Evidence運用の切り替え

---

## 10. まとめ

この枠組みは「方法論そのものを測定・改善できる」ことを目的とする。
Lunaの価値は実装能力だけでなく、**方法論の質を高め続ける仕組み**にある。

