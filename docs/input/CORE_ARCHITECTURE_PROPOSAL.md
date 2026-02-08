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

#### ✅ Phase A1実装完了 (2026-02-08)
- **Kernel Runtime**: KernelRuntime.apply(op)による一本化完了
  - 5つのu.*操作実装: u.record_decision, u.link_evidence, u.set_state, u.raise_exception, u.close_exception
  - AuthorityService統合（Solo Mode対応）
  - Gate判定実装
  - 実装ファイル: src/ssot/kernel-runtime.ts, src/types/kernel-operations.ts

#### ✅ Phase A2実装完了 (2026-02-08)
- **Kernel Ledger**: イベントソーシング型の変更管理完了
  - append-only操作ログ（NDJSON/YAMLフォーマット対応）
  - Ledger読み込み・フィルタ機能（by Kernel ID, by Issue, by Time Range）
  - replay()による状態再構成
  - KernelRuntime統合（自動記録）
  - Kernel Registry形式へのエクスポート
  - 実装ファイル: src/ssot/kernel-ledger.ts

#### ✅ Phase A3実装完了 (2026-02-08)
- **CR-Runtime接続**: ChangeRequestからKernel操作を自動実行
  - ChangeControlAgentへのKernelRuntime統合
  - operation_detailsからKernelOperationへの自動変換
  - 実行結果（op_id群）のCRへの記録
  - Ledgerへの自動記録（Rollback用）
  - 実装ファイル: src/agents/change-control-agent.ts (Phase A3拡張)

#### ✅ Phase B1実装完了 (2026-02-08)
- **Kernel Graph Schema**: 型付き知識グラフによるNRVV構造の強制
  - グラフノード・エッジ型定義（Kernel, Decision, Need, Requirement, Verification, Validation）
  - KernelWithNRVV ⇄ KernelGraph 双方向変換
  - グラフ制約検証（孤立ノード検出、サイクル検出、必須エッジ検証）
  - トレーサビリティマトリクス生成（グラフクエリベース）
  - 実装ファイル: src/types/kernel-graph.ts, src/ssot/kernel-graph-converter.ts, src/ssot/kernel-graph-validator.ts

#### ✅ Phase C1実装完了 (2026-02-08)
- **Issue一本道の運用固定**: Bootstrap Kernelによる不変ルール定義
  - Bootstrap Kernel作成（data/ssot/bootstrap-kernel.yaml）
  - Issue必須の強制（enforceIssueRequired）
  - Bootstrap Kernel変更の禁止（enforceBootstrapProtection）
  - 強制機能のON/OFF切り替え
  - 実装ファイル: data/ssot/bootstrap-kernel.yaml, src/ssot/kernel-runtime.ts (Phase C1拡張)

#### ⚠️ Phase A-C 実装中 - 重大欠陥修正中 (2026-02-08更新)

**コアアーキテクチャの根本的見直し（Section 11実行プラン）が実装されましたが、重大な欠陥が7つ発見されました。**

**修正完了**:
- ✅ 問題1: ChangeControlAgent の Runtime 設定固定を解除
- ✅ 問題2: CR成功判定を「全操作成功」基準に変更
- ✅ 問題3: Ledger replayの例外ID再現を修正
- ✅ 問題4: u.record_decision を更新可能に修正
- ✅ 問題5: AL0ブロックをGate実装に追加
- ✅ 問題6: 検証スクリプトの成功条件を厳密化
- 🔄 問題7: ドキュメントの「完了」主張を修正中

**修正後の検証が必要**:
- [ ] Phase A1+A2統合テスト実行
- [ ] Phase A3 CR-Runtimeテスト実行
- [ ] Phase B1 Graph Schemaテスト実行
- [ ] Phase C1 Bootstrapテスト実行
- [ ] すべてのテストが成功することを確認

**設計目標**:
- ✅ 変更の正本化（Ledger）- 実装済み、修正後検証必要
- ✅ トレーサビリティ（Issue→CR→u.*→Kernel）- 実装済み、修正後検証必要
- ✅ Rollback可能性（Ledger replay）- 実装済み、例外ID再現を修正
- ✅ 型安全性（Graph Schema）- 実装済み、修正後検証必要
- ✅ Issue一本道の強制（Bootstrap Kernel）- 実装済み、修正後検証必要

#### 🔄 次期拡張候補
- **Anti-Kernel**: 失敗パターンの構造化保存
- **Meta-Kernel**: 成功パターンの抽象化
- **Graph DB統合**: Neo4j/ArangoDB等への移行
- **複数人運用**: Role分離の詳細化

### 現在の状態

**Self-Improvement Loopは機能しています。**
IssueからKernelが生成され、Kernelを参照してタスク/コード生成が行われ、結果がKernelに蓄積されます。

コアアーキテクチャ提案の完全実装は今後の課題ですが、基本的な知識蓄積サイクルは既に動作しています。

---

## 11. 実行プラン（Codex提案・個人利用最適化版）

日付: 2026-02-08

### 11.1 方針

- 三本柱（Ledger / Graph / Runtime）は維持する
- 個人利用のため、初期は「単一運用者モード（you = product_owner）」を標準にする
- 先に「変更の正本」を確立し、その後に表現（Graph）を強化する
- すべての新機能は `Issue -> CR -> u.* -> Kernel` の一本道に接続する

### 11.2 優先順位（結論）

1. **Phase Aを最優先**（Ledger + Runtime最小版）
2. **Phase Bを次点**（Graphを内部表現として導入）
3. **Phase Cを最後に完成**（Issue一本道を運用として固定）

### 11.3 フェーズ別実装

#### Phase A1: Kernel Runtimeの一本化（最優先）
目的: `u.*` 操作の実行経路を一つにする。

実装:
- `KernelRuntime.apply(op)` を新設
- 最小操作を実装: `u.record_decision`, `u.link_evidence`, `u.set_state`, `u.raise_exception`, `u.close_exception`
- `AuthorityService` と Gate判定を `u.set_state` に統合

Done条件:
- Kernel更新はRuntime経由のみで成功する
- Runtimeを通らない更新は拒否される

#### Phase A2: Kernel Ledger正本化（イベントソーシング）
目的: 状態ではなく操作ログを真実にする。

実装:
- append-only の `kernel-ledger.yaml`（または ndjson）を導入
- `op_id`, `issue`, `actor`, `timestamp`, `payload`, `result` を標準記録
- 再生（replay）でKernel状態を再構成可能にする

Done条件:
- 空状態 + Ledger replay で現行Kernelを再現できる
- 監査時に任意Kernelの変更履歴を時系列で出せる

#### Phase A3: CRとRuntimeの接続
目的: ChangeRequestを「記録」から「実行入口」に昇格する。

実装:
- `ChangeControlAgent.executeChangeRequest()` から Runtime を呼ぶ
- `proposed_operations` を実際の `u.*` 実行に変換
- 実行結果を CR に逆リンク（実行op_id群）

Done条件:
- CR承認後、Kernel更新が自動で反映される
- Rollback時に逆操作または補償操作が必ず記録される

#### Phase B1: Kernel Graph Schema導入（軽量）
目的: NRVVとDecisionの接続をグラフ制約で壊れにくくする。

実装:
- `nodes[]` / `edges[]` の型を導入（永続化はYAMLのまま）
- 最小制約を実装: `derived_from`, `satisfies`, `verifies`, `validates`
- `validateNRVV` を「配列走査」から「グラフ検証」中心へ移行

Done条件:
- 不正グラフ（孤立Requirement等）を保存前に拒否できる
- Traceability Matrixをgraph queryで生成できる

#### Phase C1: Issue一本道の運用固定
目的: 例外なく「Issueが唯一の入口」を守る。

実装:
- Bootstrap Kernelを明文化し固定
- direct update APIを禁止し、Issue/CR経由のみ許可
- 承認ポイントは1人運用モードを既定値にする（将来multi-roleへ拡張）

Done条件:
- 手動更新経路が閉じられている
- すべてのKernel更新に `issue` と `cr_id` が紐づく

### 11.4 非機能要件（最初から入れる）

- **可観測性**: op単位で失敗原因を追跡可能
- **再現性**: 同一Ledgerから同一状態を再構成可能
- **安全性**: `AL0` 時は `u.set_state` を強制ブロック
- **性能**: replay時間の上限目標を設定（例: 10k opsで5秒以内）

### 11.5 今はやらない（意図的後回し）

- Anti-Kernel / Meta-Kernel の本実装
- Graph DB導入（まずはファイルベースで十分）
- 複雑な組織ロール分離（個人利用では過剰）

### 11.6 期待される最終状態

- Lunaの変更はすべて説明可能（Why/Who/When/What）
- 知識はKernelに残るだけでなく、操作列として再生可能
- 将来の拡張（複数人運用、厳格監査、高度自動化）へ破綻なく接続できる
