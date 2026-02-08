# Luna Core Architecture Proposal
**Goal**: 世界最高の知識生産プラットフォームのために、コア機能・コアアーキテクチャのみを定義する。

日付: 2026-01-16

---

## 0. 前提（ユーザー方針の反映）

- **変更の唯一入口**: 初期はベースKernelを作成し、その後は **Issueのみ** が入口。
- **CRの扱い**: CRは内部プロトコルとして自動生成し、**人間は承認のみ**。
- **Decisionの正本**: Kernel内に **NRVV拡張として内包**。
- **Evidence**: 当面は“記録”。昇格条件は実用段階で検討。

---

## 1. コアの三本柱（すべて必須）

### 1.1 Kernel Ledger（イベントソーシング）
**すべての変更は `u.*` 操作として記録される。**

- Kernelは「現在状態」ではなく「操作ログ」から再構成される
- 変更理由・責任・再現性が標準化される
- Issueは唯一の入口、CRは内部イベント

### 1.2 Kernel Graph Schema（型付きグラフ）
**KernelはYAMLの集合ではなく“型付き知識グラフ”として定義する。**

- DecisionはKernel内部の第一級ノード
- NRVVはDecisionから導出される義務グラフ
- Traceabilityはグラフのエッジで保証する

### 1.3 Kernel Runtime（運用エンジン）
**Gate/Authority/Validationの強制はRuntimeが解釈して実行する。**

- 権限・ゲートを“状態遷移API”に昇格
- すべての操作はRuntime経由で実行
- 実装の分散を排し、Kernel中心の運用を貫く

---

## 2. 最小コア定義

### 2.1 Kernel（第一級の知識単位）
Kernelは「Decisionを核に持つ知識単位」。NRVVは派生構造。

必須フィールド（最小）:
- `id`, `statement`, `owner`, `maturity`
- `decision`（DecisionRecordの実体）
- `needs`, `requirements`, `verification`, `validation`（NRVV）
- `history`（Kernel Ledger由来）

### 2.2 DecisionRecord（Kernel内の正本）
DecisionはKernelの中に **実体として内包**される。

最低限のフィールド:
- `decision_id`, `decided_by`, `decision_type`
- `rationale`, `falsification_conditions`
- `linked_issue`, `assurance_level`

### 2.3 Kernel Ledger（操作ログ）
**全更新は `u.*` 操作として記録**。操作ログが真実。

最低限の操作:
- `u.record_decision`
- `u.link_evidence`
- `u.set_state`
- `u.raise_exception`
- `u.close_exception`

ログ形式（例）:
```yaml
- op_id: OP-0001
  op: u.record_decision
  actor: product_owner
  issue: "#123"
  timestamp: 2026-01-16T10:00:00Z
  payload:
    kernel_id: KRN-001
    decision_id: DR-123
```

---

## 3. 入口モデル（Issue一本化）

### 3.1 Bootstrap Kernel（初期のみ）
最初だけ「ベースKernel作成」を専用フローで行う。

Bootstrap Kernelの責務:
- system purpose / vision
- global invariants
- safety constraints
- organization-level assumptions

### 3.2 Issue → CR → Kernel（運用標準）
Issueが唯一の入口。CRは内部生成され、人は承認のみ。

```
Issue → DEST → Planning → CR(内部) → u.* → Kernel更新
                               ↓
                            Approval (human)
```

人間は「承認点」だけに介入する。

---

## 4. Kernel Graph Schema（型付きグラフ）

### 4.1 ノード型
- Kernel
- Decision
- Need / Requirement / Verification / Validation
- Evidence / Observation
- Exception / Signal
- Task / Artifact

### 4.2 エッジ型（最小）
- `derived_from` (Decision → NRVV)
- `satisfies` (Requirement → Need)
- `verifies` (Verification → Requirement)
- `validates` (Validation → Need)
- `references` (Artifact → Kernel)
- `blocked_by` (Kernel → Exception)

### 4.3 合法グラフ（最小制約）
- Decisionは必ずKernelに内包される
- RequirementはNeedに必ず接続される
- Verification/Validationは対応するRequirement/Needに接続される

---

## 5. Kernel Runtime（運用強制）

### 5.1 Authority（権限）
Maturity遷移は **AuthorityService** を通過しない限り不可。

### 5.2 Gate（状態遷移API）
- Gateは“チェックリスト”ではなく“遷移許可API”
- Kernel RuntimeがGate適合を機械的に評価

### 5.3 Evidence（当面は記録）
Evidenceは“記録”として扱う。昇格条件は将来の切替に備え、
`source_type` / `verification_status` だけ先にスキーマ準備する。

---

## 6. Observation Layer（知識生産の燃料）

Evidenceとは別に、**Observation** を統一管理する。

- テスト結果、運用メトリクス、監視アラートはObservationとして保存
- 後続の学習や改善提案の“素材”となる

---

## 7. Self-Improvement Loop（コア仕様）

```
Issue → DEST → Planning → Kernel生成 → Task → Code → Test → Deploy → Observe
  ↑                                                               ↓
  └──────── Kernel Ledger/Graphが学習を強制 ───────────────────────┘
```

設計上のポイント:
- “改善提案”ではなく、**改善が起きる構造**を設計する
- Convergence/KPIは後で“運用制約”に昇格できるよう準備

---

## 8. Near-Core（将来の核拡張）

### 8.1 Anti-Kernel（失敗の正本化）
Reject/Deferの理由・失敗パターンを構造化して保存。
同じ失敗の再発率を下げる。

### 8.2 Meta-Kernel（知識の知識）
成功パターン・頻出制約を抽象化して保存。
次のDecisionに自動で影響させる。

---

## 9. 最小実装ロードマップ（コア集中）

### Phase A: Kernel Ledger + Runtime最小版
- `u.*` 操作ログを導入
- Authority遷移を強制化
- Kernel更新をLedger経由に一本化

### Phase B: Kernel Graph Schema
- 内部表現をグラフ化（YAMLはシリアライズ）
- Decision内包を必須化

### Phase C: Issue一本道
- Bootstrap Kernel確立
- CR自動生成＋人間承認のみ

---

## 10. まとめ

Lunaのコアは「Issue一本化」「Decision正本のKernel化」「Ledger/Graph/Runtimeの三本柱」。
これにより **知識が必ず再利用可能な構造として残る** ことを保証できる。

---

## 📝 実装状況 (2026-02-08更新)

### 現在実装されている機能

#### ✅ Kernel中心のSelf-Improvement Loop
- **CoordinatorAgent**: Kernel参照によるタスク生成（Phase 0.5実装）
- **CodeGenAgent**: Kernel要件を考慮したコード生成・更新
- **TestAgent**: Verification自動追加による知識蓄積
- **SSOTAgentV2**: Issue → Kernel自動変換
- **KernelEnhancementService**: AI-powered NRVV自動補完

#### 🔄 次期実装予定
- **Kernel Ledger**: イベントソーシング型の変更管理（Phase A）
- **Kernel Graph Schema**: 型付き知識グラフ（Phase B）
- **Kernel Runtime**: 運用エンジン（Phase A-B）
- **Issue一本道**: Bootstrap Kernel + CR自動生成（Phase C）

### 現在の状態

**Self-Improvement Loopは機能しています。**
IssueからKernelが生成され、Kernelを参照してタスク/コード生成が行われ、結果がKernelに蓄積されます。

コアアーキテクチャ提案の完全実装は今後の課題ですが、基本的な知識蓄積サイクルは既に動作しています。
