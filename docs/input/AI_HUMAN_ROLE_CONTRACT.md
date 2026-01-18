# AI/Human Role Contract
**目的**: 人間とAIの役割・権限を固定し、AI駆動開発を安全かつ再現可能に運用するための契約。

日付: 2026-01-16

---

## 1. 基本原則

- **唯一入口**: 変更の入口はIssueのみ（CRは内部生成）。
- **正本**: DecisionはKernel内に第一級要素として保持。
- **運用強制**: Kernel更新は`u.*`操作ログ経由のみ。
- **承認分離**: 人間は承認と価値判断、AIは提案・生成・検証。

---

## 2. 役割定義（最小）

### Human（意思決定・承認）
- **Product Owner**: 価値判断、例外承認、最終承認
- **Safety/Compliance Owner**: 安全性・法規・重大リスクの承認
- **SSOT Reviewer**: Kernelの成熟度遷移承認、整合性監査

### AI（実行・生成・検証）
- **Analysis**: DEST判定、Planning抽出、Kernel提案
- **Execution**: Task分解、コード生成、レビュー、テスト、監視
- **Evidence/Observation**: 証跡・観測の収集と記録

---

## 3. 決定権限（Decision Rights）

- **人間のみ可能**
  - Decisionの承認（Adopt/Defer/Reject）
  - 例外の承認（ExceptionRecordの確定）
  - Kernel成熟度の重要遷移（agreed/frozen）

- **AIのみ可能**
  - Issueの解析・分類
  - NRVV抽出とKernel提案
  - Task生成・実装・検証・監視

- **共同**
  - CRの生成（AIが作成、人間が承認）

---

## 4. 運用フロー（強制ルール）

```
Issue → DEST → Planning → Kernel提案 → CR(内部)
                                ↓
                           Human Approval
                                ↓
                           u.* Operation Log
                                ↓
                        Kernel/Decision更新
```

- 承認がない限りKernelは更新不可
- Issue以外の変更は禁止

---

## 5. RACI（簡易）

| 項目 | Human | AI |
|---|---|---|
| DEST判定 | I | R |
| Planning抽出 | I | R |
| Decision承認 | A | C |
| Kernel更新 | A | R |
| テスト/検証 | I | R |
| 例外承認 | A | C |

R=Responsible, A=Accountable, C=Consulted, I=Informed

---

## 6. 例外・停止ルール

- **AL0**: 実装停止（Freeze/Reviseのみ）
- **重大安全違反**: 人間承認まで停止
- **Evidence欠落**: 当面は記録のみ、昇格条件は将来

---

## 7. 運用の禁止事項

- Issue以外の入口でKernelを直接更新しない
- 人間がAIの実装内容を直接編集しない
- `u.*`操作ログを経由せずに変更しない

---

## 8. 成果指標（運用確認）

- Decisionの承認に対するAI生成の再現率
- Kernel更新の承認率（拒否/再提出の比率）
- AL0検出後の実装回避率
- 監査再構成時間（数分以内を目標）

---

## 9. 将来拡張（実用段階）

- Evidenceを昇格条件化（verifiedになるまでKernel昇格不可）
- Approvalの自動化条件（安全域が確認された領域のみ）

