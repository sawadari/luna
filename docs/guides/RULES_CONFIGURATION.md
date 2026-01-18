# Rules Configuration Guide

人間-AI責任分界ルールの設定ガイド

---

## 📖 概要

Lunaは`rules-config.yaml`ファイルで人間-AI責任分界のルールを一元管理します。このファイルにより、どの判断を人間が行い、どの判断をAIが行うかを明確に定義できます。

### 主な機能

- **一元管理**: 全てのルールが1ファイルで管理される
- **理由の明記**: 各ルールに`rationale`（理由）が記録される
- **変更履歴**: ルール変更が`change_history`に記録される
- **後方互換性**: 環境変数へのフォールバック対応
- **バリデーション**: 設定ミスを自動検出

---

## 🧠 理論的基盤

### なぜルール管理が必要なのか

Lunaは**知識創造プラットフォーム**であり、単なる開発自動化ツールではありません。知識創造には以下の3つの核心的な問題があります：

1. **問題空間の判断**：実装する価値があるのか？（DEST理論）
2. **解決策の探索**：どう実装するのが最適か？（Planning Layer）
3. **知識の収束**：実装結果をどう蓄積・統治するか？（SSOT Layer）

これらの問題に対して、**人間とAIのどちらが責任を持つべきか**を明確にするのがルール管理の目的です。

### DEST理論：保証レベル（Assurance Level）の必要性

**DEST（Decision-Embedded Systems Thinking: 判断内蔵システム思考）**は、システム介入の良否を判定する理論です。

#### 2軸評価の原理

システム介入は以下の2軸で評価されます：

- **Outcome（成果軸）**: 目的に近づいているか（値より傾向）
- **Safety（安全軸）**: 暴走・増幅の兆候がないか（最低ライン）

この2軸から**保証レベル（AL: Assurance Level）**が決定されます：

| AL | 名称 | 条件 | 意味 | アクション |
|----|------|------|------|-----------|
| **AL2** | Assured | outcome_ok **AND** safety_ok | 保証成立 | ✅ デプロイ許可 |
| **AL1** | Qualified | outcome_ok **OR** safety_ok（両方成立かつ不確実性高） | 条件付き保証 | ⚠️ 注意深く監視 |
| **AL0** | Not Assured | **NOT** safety_ok | 保証なし | 🚫 実装ブロック |

**重要**: Safetyが第一ゲートです。safetyがNGの場合、outcomeに関係なく必ずAL0になります。

#### なぜAL判定が人間の責任なのか

`rules-config.yaml`では、DEST judgmentを以下のように設定しています：

```yaml
dest_judgment:
  enabled: true
  rationale: "Issue実装前の価値判断は人間の責任範囲。無駄な実装を防ぎリソースを最適化する。"
```

**理論的根拠**:
- **価値判断は文脈依存**: 価値は市場・文化・時間・組織によって変化します（Planning Layer公理A4）
- **責任主体の必須性**: 意思決定には責任主体が必須です（Planning Layer公理A8）
- **物理的真実と価値の分離**: 物理的制約（交渉不可能）と価値判断（交渉可能）を混同してはいけません

AIは技術的成立性を評価できますが、**ビジネス価値・戦略整合・ステークホルダー影響**の最終判断は人間が行う必要があります。

#### AL0 Reasonと標準処方

AL0と判定された場合、**失敗パターン（R01-R11）**を特定し、**標準処方（P0-P4）**に従います：

**Protocol優先順位**:
- **P0**: 破壊的増幅を止める（連打/燃料遮断/制御復元）
- **P1**: 観測を直す（情報フロー）
- **P2**: 遅れと介入の整合を取る（Wait/Freeze/変化速度の調整）
- **P3**: 低レバレッジ偏重を止める（パラメータ調整のみ禁止）
- **P4**: それでもダメなら上位介入（目的/前提）へエスカレーション

### Planning Layer：意思決定と評価の分離

**Planning Layer**は、価値・選択肢集合・制約をもとに、採否・延期・探索継続の意思決定を生成します。

#### 核心的な公理

1. **A5: 評価と決定の分離**
   - 評価（測る/推定）と決定（選ぶ）は分離されます
   - AIは評価を支援できますが、決定は人間が行います

2. **A6: 創造性は逸脱を含む**
   - 創造性は逸脱を含みます
   - 逸脱の型は有限集合で管理します（例外管理）

3. **A7: 再評価は制御される**
   - 再評価は原則すべて対象ですが、トリガーと影響範囲で制御します
   - 無限再評価を防ぎます

#### なぜCREPS Gatesが必要なのか

`rules-config.yaml`では：

```yaml
planning_layer:
  creps_gates:
    enabled: true
    threshold: 70  # 70点以下は人間レビュー必要
```

**理論的根拠**:
- **品質の手続き化**: ゲートで「先に進めない」を明文化し、品質を保証します
- **Real/Thinking分離**: 対象/主体、現実/モデルの混線を禁止します
- **再現可能な記録**: B1..B6をケースレコード（再現可能な状態）として保存します

CrePS 6-Box（B1-B6）とゲート（G2-G6）は、**案件運用OS**として機能します。

### SSOT Layer：収束と統治の理論

**SSOT（Single Source of Truth）Layer**は、Planning Layerで生成されたDecisionRecordを核（Kernel）に固定し、境界・外乱下でも不変条件とトレーサビリティを保って反復収束させます。

#### SSOTはデータではなくプロトコル

```
SSOT ≠ 単一データ置き場
SSOT = 核・変換規則・状態遷移・不変条件・監査可能性を含む統治構造
```

**核心的な原理**:
- **情報ボトルネック**: 核Kは情報ボトルネックとして振る舞い、保持情報と運用コストのトレードオフを支配します
- **外乱の吸収**: 外乱（要求変更・組織圧・期限短縮・AI生成物混入等）は排除対象ではなく、状態遷移として吸収します
- **監査可能性**: 要求↔設計↔検証↔証拠の連鎖が共有核で検証できます

#### なぜKernel成熟度遷移に人間承認が必要なのか

`rules-config.yaml`では：

```yaml
kernel_generation:
  maturity_transition:
    auto_promote: false  # 自動昇格は無効
    require_approval:
      - "under_review -> agreed"
      - "agreed -> frozen"
```

**理論的根拠**:
- **状態遷移の権限分離**: 成熟度状態遷移の権限は、遷移段階ごとにロールで分離します
- **責任の明確化**: 各遷移に責任主体（role.product_owner、role.ssot_reviewer）が必要です
- **監査適合性**: 誰が・いつ・なぜ承認したかが記録され、監査連鎖が成立します

#### なぜコード生成後に人間レビューが必須なのか

`rules-config.yaml`では：

```yaml
code_generation:
  quality_threshold: 80  # 80点以上で合格

review_required:
  enabled: true
  rationale: "生成コードは必ず人間がレビュー。品質保証の最終責任は人間。"
```

**理論的根拠**:
- **AI生成物の隔離**: `source_type=ai_generated`は`verification_status=verified`になるまでKernel第一級要素へ昇格禁止です
- **Evidence Governance**: AI生成物は証拠として扱われ、検証プロセスを経る必要があります
- **品質保証の責任**: 品質保証の最終責任は人間が負います

### 人間-AI責任分界の3原則

Lunaのルール設定は、以下の3原則に基づいています：

#### 原則1: 価値判断は人間、技術評価はAI

- **人間**: ビジネス価値、戦略整合、ステークホルダー影響の最終判断
- **AI**: 技術的成立性、コード品質、テストカバレッジの評価

#### 原則2: 決定は人間、評価はAI支援

- **人間**: DecisionRecord発行、例外承認、Maturity遷移承認
- **AI**: EvaluationRecord生成、品質スコア算出、影響分析

#### 原則3: 監査可能性の保証は人間

- **人間**: 監査連鎖の最終確認、証跡整合の統制、責任主体の明確化
- **AI**: 証跡の自動生成、リンク整合性チェック、違反検出

---

## 📁 ファイル構造

```
luna/
├── rules-config.yaml          # ルール設定ファイル（メイン）
├── .env                       # 環境変数（後方互換性）
└── RULES_CONFIGURATION.md     # このファイル
```

---

## ⚙️ rules-config.yaml の構造

### 1. Meta情報

```yaml
meta:
  version: "1.0"
  last_updated: "2026-01-16T15:30:00Z"
  last_updated_by: "System"
  description: "Luna Human-AI Responsibility Boundary Rules Configuration"
```

### 2. 人間-AI責任分界 (`human_ai_boundary`)

Lunaの9フェーズそれぞれについて、人間-AI責任分界を定義します。

#### Phase 0: DEST Judgment（問題空間分析）

```yaml
dest_judgment:
  enabled: true
  rationale: "Issue実装前の価値判断は人間の責任範囲"

  al_threshold:
    block_below: "AL0"        # AL0: 実装ブロック
    require_approval: "AL1"   # AL1: 人間承認必要
    auto_proceed: "AL2"       # AL2以上: 自動進行
```

**なぜこのルールが存在するのか**:

1. **無駄な実装の防止**: AL0のIssueを実装すると、リソースが浪費されます。DEST判定により、問題空間（Why/What）を明確にしてから解決策空間（How）に進みます。

2. **Safetyファースト**: `safety_ok`がNGの場合、`outcome_ok`に関係なく必ずAL0になります。これは、システム思考における「暴走・増幅の兆候」を最優先で防ぐためです。

3. **価値の文脈依存性**: 価値は市場・文化・時間・組織によって変化します（Planning Layer公理A4）。AIは技術的成立性を評価できますが、ビジネス価値の最終判断は人間が行う必要があります。

4. **AL閾値の意味**:
   - **block_below: AL0**: 安全性が確保されていないため、実装を完全にブロックします
   - **require_approval: AL1**: 条件付き保証のため、人間が最終判断します
   - **auto_proceed: AL2**: 成果・安全の両方が確保されているため、自動進行を許可します

**カスタマイズ例**:
```yaml
# より厳格な設定（AL3以上のみ自動進行）
al_threshold:
  auto_proceed: "AL3"  # より高い保証レベルを要求
```

**理論的背景**: DEST理論では、Problem Space（問題空間）とSolution Space（解決策空間）を明確に分離します。DEST判定は Problem Space における最初の意思決定であり、「実装する価値があるか」を判断します。

#### Phase 1: Planning Layer（解決策探索）

```yaml
planning_layer:
  enabled: true
  rationale: "解決策探索は人間の意思決定支援が必要"

  creps_gates:
    enabled: true
    threshold: 70  # 70点以下は人間レビュー必要
```

**なぜこのルールが存在するのか**:

1. **評価と決定の分離**: Planning Layer公理A5により、評価（測る/推定）と決定（選ぶ）は分離されます。AIは複数の解決策を評価できますが、最終的な選択は人間が行います。

2. **正解の一意性を仮定しない**: Planning Layerは「正解の一意性」を仮定しません。複数の有効な解決策が存在する場合、どれを選ぶかは価値判断です。

3. **CREPS Gatesの役割**: CrePS（Creative Problem Solving）6-Box スキームは、Real/Thinking分離・ゲート・再現可能記録を提供します：
   - **G2**: Problem Definition（Outcome/Safety写像）
   - **G3**: Understanding（stock/flow/delay/feedback/decision-infoの5点セット）
   - **G4**: Idea Traceability（LPレベル + 安全チェック）
   - **G5**: Concept Feasibility（Wait/Freeze/Revise運用姿勢）
   - **G6**: Field Validity（AL観測）

4. **閾値70点の意味**: CREPS Gatesスコアが70点以下の場合、以下の問題が考えられます：
   - **C: Completeness（網羅性）不足**: 重要な選択肢が見落とされている
   - **R: Relevance（関連性）不足**: 問題定義と解決策がずれている
   - **E: Evidence（根拠）不足**: 評価の根拠が弱い
   - **P: Prioritization（優先度）不足**: 優先順位が不明確
   - **S: Synergy（相乗効果）不足**: 複数の解決策の組み合わせが考慮されていない

**カスタマイズ例**:
```yaml
# より高品質を求める設定
creps_gates:
  threshold: 80  # 80点以下は人間レビュー
```

**理論的背景**: Planning Layerは、価値（正負）・選択肢集合（OptionSet）・制約（ConstraintModel）をもとに、採否・延期・探索継続の意思決定を生成します。ここでは「単一案への早期コミット」を避け、複数案の集合として保持します。

#### Phase 2: Kernel Generation（知識管理）

```yaml
kernel_generation:
  enabled: true
  rationale: "知識をKernelとして蓄積"

  convergence_monitoring:
    enabled: true
    threshold: 70  # 70%以下でアラート
    weekly_check: true

  maturity_transition:
    auto_promote: false  # 自動昇格は無効
    require_approval:
      - "under_review -> agreed"
      - "agreed -> frozen"
```

**なぜこのルールが存在するのか**:

1. **SSOTは単一データではなくプロトコル**: SSOT（Single Source of Truth）は「単一データ置き場」ではなく、「核・変換規則・状態遷移・不変条件・監査可能性を含む統治構造」です。

2. **情報ボトルネック理論**: 核K（Kernel）は情報ボトルネックとして振る舞い、以下のトレードオフを支配します：
   - **圧縮強度**: 核を薄くするほど運用は軽くなるが、根拠/再利用/監査適合を失いやすい
   - **有用性**: 成果物B（仕様・図・帳票等）に必要な骨格情報（要求↔設計↔検証の骨）は落とさない

3. **Convergence Rate（収束率）の意味**: Convergence Rateは「完全なKernel（NRVVが完全に揃っている）の割合」を示します。70%以下の場合：
   - **不完全なKernelが多い**: Needs/Requirements/Verification/Validationのいずれかが欠けている
   - **トレーサビリティ欠落**: 要求↔設計↔検証の連鎖が切れている
   - **監査不適合リスク**: 監査連鎖が証明できない

4. **なぜMaturity自動昇格を無効にするのか**:
   - **責任主体の必須性**: 成熟度遷移（draft → under_review → agreed → frozen）には、各段階で責任主体が必要です
   - **監査可能性**: 誰が・いつ・なぜ承認したかが記録され、監査連鎖が成立します
   - **品質ゲート**: `under_review -> agreed`の遷移には、role.ssot_reviewer と role.product_owner の承認が必要です

5. **AI抽出の位置付け**:
   ```yaml
   ai_extraction:
     enabled: true
     fallback_to_template: true
   ```
   AIはIssueからNRVVを「提案」できますが、Kernelへの昇格は人間が承認します。これは Evidence Governance の原則に従っています：
   - `source_type=ai_generated`は`verification_status=verified`になるまでKernel第一級要素へ昇格禁止

**理論的背景**: SSOT Layerは、Planning Layerで生成されたDecisionRecordを核（Kernel）に固定し、外乱（要求変更・組織圧・期限短縮・AI生成物混入等）を状態遷移として吸収しながら、不変条件Φとトレーサビリティを保って反復収束させます。

#### Phase 4-5: Code Generation & Review（コード生成・レビュー）

```yaml
code_generation:
  enabled: true
  quality_threshold: 80  # 80点以上で合格
  generate_tests: true
  test_coverage_target: 80

review_required:
  enabled: true
  rationale: "生成コードは必ず人間がレビュー"
  static_analysis: true
  security_scan: true
  min_quality_score: 80
```

**なぜこのルールが存在するのか**:

1. **AI生成物の Evidence Governance**: AI生成コードは「証拠（Evidence）」として扱われ、以下のプロセスを経る必要があります：
   ```yaml
   EvidenceItem:
     source_type: ai_generated
     verification_status: unverified → verified
   ```
   `verification_status=verified`になるまで、Kernel第一級要素（本番デプロイ可能な成果物）へ昇格できません。

2. **品質閾値80点の意味**:
   - **技術的成立性**: コードが動作する
   - **保守性**: 人間が理解・修正できる
   - **セキュリティ**: 基本的な脆弱性がない
   - **テスト可能性**: テストが書ける構造になっている

3. **なぜ人間レビューが必須なのか**:
   - **責任の明確化**: 品質保証の最終責任は人間が負います
   - **文脈理解**: AIはコード品質を評価できますが、ビジネスロジック・アーキテクチャ整合・長期保守性の判断は人間が行います
   - **監査連鎖**: 誰が・いつ・なぜコードを承認したかが記録され、監査可能性が保たれます

4. **静的解析とセキュリティスキャンの役割**:
   - **静的解析**: コード品質メトリクス（複雑度・重複・命名規則等）を自動評価
   - **セキュリティスキャン**: OWASP Top 10等の脆弱性を自動検出

   これらはAIが得意な「形式的検証」です。人間は「意味的検証」（ビジネスロジックの妥当性）に集中できます。

5. **テストカバレッジ80%の根拠**:
   - **クリティカルパスの保証**: 主要な機能フローがテストされる
   - **リグレッション防止**: 将来の変更で既存機能が壊れないことを保証
   - **ドキュメントとしてのテスト**: テストコードが「期待動作の仕様書」として機能

**カスタマイズ例**:
```yaml
# 厳格な品質基準（ミッションクリティカルなシステム向け）
code_generation:
  quality_threshold: 90
  test_coverage_target: 90

review_required:
  min_quality_score: 90
```

**理論的背景**: SSOT LayerのOperator Set（許された操作）において、コード生成は`θ_generate`（仮説・構造・候補の生成）と`θ_execute`（核Kから成果物Bを生成）に対応します。生成された成果物は、必ず`θ_learn`（違反・滞留・コストを観測し、設計を更新）を経由して、核Kにフィードバックされます。

### 3. 組織ルール (`organization_rules`)

組織レベルの制約を定義します。

```yaml
organization_rules:
  max_issue_complexity: "large"  # small/medium/large/xlarge

  require_approval_for:
    - "breaking changes"
    - "security-related"
    - "architecture changes"
    - "kernel maturity promotion"

  auto_execution_limits:
    max_files_generated: 50
    max_lines_per_file: 1000
    max_deployment_environments: 3

  security_policy:
    scan_dependencies: true
    check_vulnerabilities: true
    require_security_review: true
```

**なぜこのルールが存在するのか**:

1. **Hard Constraint（交渉不能条件）の明示**: Planning Layer公理A2/A3により：
   - **A2: 物理的制約は交渉不可能**: システムの物理的限界は価値判断で上書きできません
   - **A3: 規範的真実は強制力を持つ**: 法規・安全・契約などの外部規範は強制力を持ちます

2. **承認が必要な変更タイプ**:
   - **breaking changes**: 既存システムへの影響が大きく、Backward Compatibilityが失われる
   - **security-related**: セキュリティ要件は Hard Constraint です
   - **architecture changes**: アーキテクチャ変更は複数の境界（部門/会社/秘匿区分）に影響します
   - **kernel maturity promotion**: Kernel成熟度遷移は監査連鎖に影響するため、責任主体の承認が必須

3. **自動実行制限の理由**:
   - **max_files_generated: 50**: 大量ファイル生成は、レビュー負荷・テスト負荷・CI/CD負荷を考慮
   - **max_lines_per_file: 1000**: 1ファイルあたりの行数制限により、保守性・理解性を保証
   - **max_deployment_environments: 3**: 環境増殖を防ぎ、運用コストを制御

4. **セキュリティポリシーの必須性**:
   - **scan_dependencies**: 依存関係の脆弱性スキャン（OWASP Dependency Check等）
   - **check_vulnerabilities**: CVE（Common Vulnerabilities and Exposures）チェック
   - **require_security_review**: セキュリティ関連変更には専門家レビューが必須

**理論的背景**: 組織ルールは、SSOT Layerの不変条件Φ（Phi）と対応します。特に`Phi_star`（全体として破綻しないための最小セット）において、「Hard constraint（物理/法規/安全/契約）が価値判断で上書きされない」ことが保証されます。

### 4. 個人設定 (`individual_preferences`)

開発者個人の好みを設定します。

```yaml
individual_preferences:
  verbose_logging: true
  dry_run_default: false
  notification_level: "all"  # all/important/critical
  language: "ja"  # ja/en
```

### 5. 変更履歴 (`change_history`)

ルール変更が自動記録されます。

```yaml
change_history:
  - timestamp: "2026-01-16T15:30:00Z"
    changed_by: "TechLead"
    rule: "dest_judgment.al_threshold.auto_proceed"
    old_value: "AL3"
    new_value: "AL2"
    rationale: "AL2でも十分な品質が確認されたため"
```

---

## 🛠️ 使い方

### 基本的な使い方

1. **ルール設定を確認**
   ```bash
   cat rules-config.yaml
   ```

2. **ルールをカスタマイズ**
   ```yaml
   # rules-config.yaml を編集
   vim rules-config.yaml
   ```

3. **Lunaを実行**
   ```bash
   npm run run-coordinator -- --issue 40
   ```

   Lunaは自動的に`rules-config.yaml`をロードし、ルールに従って動作します。

### 環境変数との併用（後方互換性）

`rules-config.yaml`が存在しない場合、または値が設定されていない場合、環境変数にフォールバックします。

```bash
# 環境変数での設定（従来の方法）
export ENABLE_DEST_JUDGMENT=false
export ENABLE_PLANNING_LAYER=false
```

**優先順位**:
1. `rules-config.yaml`の値
2. 環境変数の値
3. デフォルト値

---

## 📝 よくあるカスタマイズ

### 1. DESTを無効化（テスト時）

```yaml
human_ai_boundary:
  dest_judgment:
    enabled: false
    rationale: "テスト環境のためDEST無効化"
```

### 2. より厳格な品質基準

```yaml
human_ai_boundary:
  code_generation:
    quality_threshold: 90
    test_coverage_target: 90

  review_required:
    min_quality_score: 90
```

### 3. より緩い自動進行（開発時）

```yaml
human_ai_boundary:
  dest_judgment:
    al_threshold:
      auto_proceed: "AL1"  # AL1でも自動進行
```

### 4. Dry-runモードをデフォルトに

```yaml
individual_preferences:
  dry_run_default: true
```

---

## ⚠️ 注意事項

### 1. セキュリティ上の注意

- `rules-config.yaml`はGitで管理されるため、機密情報を含めないでください
- APIキー等は引き続き`.env`ファイルで管理してください

### 2. 変更の影響範囲

ルール変更は即座に反映されます。重要な設定変更前には:

1. バックアップを作成
2. Dry-runモードでテスト
3. 変更履歴に理由を記録

### 3. バリデーション

Lunaは起動時に`rules-config.yaml`をバリデーションします。

```
⚠️  Rules config validation found 1 errors
   - human_ai_boundary.code_generation.quality_threshold: Quality threshold must be between 0 and 100
```

エラーがある場合は修正してください。

---

## 🔧 トラブルシューティング

### Q1: ルール設定が反映されない

**A1**: Lunaがルール設定をロードしているか確認してください。

```bash
# ログで確認
npm run run-coordinator -- --issue 40 --verbose
```

### Q2: バリデーションエラーが出る

**A2**: エラーメッセージを確認し、該当箇所を修正してください。

```yaml
# 間違い
quality_threshold: 150  # 100を超えている

# 正しい
quality_threshold: 90
```

### Q3: 環境変数と併用したい

**A3**: `rules-config.yaml`に値を設定しなければ、環境変数にフォールバックします。

```yaml
# 値を設定しない（環境変数を使用）
dest_judgment:
  enabled:   # 値なし → 環境変数 ENABLE_DEST_JUDGMENT を使用
```

---

## 🗺️ 理論統合マップ

このセクションでは、`unified_planning_and_ssot_framework.yaml`と`dest.yaml`に記述されていた理論が、`rules-config.yaml`のどのルールに対応しているかを示します。

### DEST理論 → rules-config.yaml

| DEST理論の要素 | rules-config.yamlの対応 | 理由 |
|--------------|------------------------|------|
| **AL（保証レベル）判定** | `human_ai_boundary.dest_judgment` | 問題空間の価値判断は人間の責任 |
| **AL0 Reason（失敗パターン）** | `dest_judgment.dest_analysis` | Destination/Effectiveness/Safety/Traceabilityの4次元分析 |
| **Protocol（標準処方）** | `dest_judgment.al_threshold` | AL0は実装ブロック、AL1は人間承認、AL2は自動進行 |
| **CrePS 6-Box（B1-B6）** | `planning_layer.creps_gates` | Real/Thinking分離、ゲート、再現可能記録 |
| **CrePS Gates（G2-G6）** | `planning_layer.creps_gates.threshold` | 品質ゲート（70点以下は人間レビュー） |
| **Leverage Points（介入点）** | Planning Layerの`OptionSet`にLP levelを記録 | 介入点の質を評価（12: パラメータ → 1: パラダイム超越） |

### Planning Layer理論 → rules-config.yaml

| Planning Layer要素 | rules-config.yamlの対応 | 理由 |
|------------------|------------------------|------|
| **A5: 評価と決定の分離** | `planning_layer`全体 | AIは評価支援、人間が決定 |
| **A6: 創造性は逸脱を含む** | `organization_rules.require_approval_for` | 例外の明示的承認 |
| **A7: 再評価は制御される** | `kernel_generation.convergence_monitoring` | 無限再評価を防ぐトリガーと影響範囲 |
| **A8: 責任主体が必須** | すべての`rationale`フィールド | 各ルールに理由と責任が記録される |
| **Opportunity** | DEST判定の入力 | 価値が発生しうる機会の定義 |
| **OptionSet** | Planning Layerで生成 | 単一案への早期コミットを避ける |
| **ConstraintModel** | `organization_rules` | Hard/Soft制約の分離 |
| **DecisionRecord** | Kernelの第一級要素 | 決定を核として固定（主語・反証条件必須） |
| **Assumption** | Kernel内で管理 | 前提の反証が再評価のトリガー |

### SSOT Layer理論 → rules-config.yaml

| SSOT Layer要素 | rules-config.yamlの対応 | 理由 |
|--------------|------------------------|------|
| **Agent Model（θ演算子）** | 各Phaseのenable/disable | 理解・生成・割当・実行・統合・学習 |
| **Intent Model** | `individual_preferences.notification_level` | 運用モード（audit/reuse/speed） |
| **Convergence Criteria** | `kernel_generation.convergence_monitoring.threshold` | Φ違反再発率、滞留、影響予測可能性、監査即応性 |
| **Maturity State** | `kernel_generation.maturity_transition` | draft → under_review → agreed → frozen |
| **Evidence Governance** | `review_required` | ai_generatedはverifiedになるまでKernel昇格禁止 |
| **Change Control** | すべてのrule変更 | `change_history`に記録される |
| **Φ（不変条件）** | `organization_rules` | 型制約、必須属性、必須リンク、Hard constraint |
| **Operator Set（u）** | Kernel操作の有限集合 | split/merge/retype/rewire/set_state/record_decision等 |

### 理論の3層構造

Lunaの知識創造プラットフォームは、以下の3層構造で設計されています：

```
┌─────────────────────────────────────────┐
│ Problem Space (DEST理論)                │
│ - AL判定（Outcome/Safety）               │
│ - AL0 Reason検出                        │
│ - Protocol適用                          │
└────────────┬────────────────────────────┘
             │ 問題定義
             ▼
┌─────────────────────────────────────────┐
│ Solution Space - Planning Layer         │
│ - Opportunity定義                        │
│ - OptionSet生成（複数案）                │
│ - EvaluationRecord作成（評価）           │
│ - DecisionRecord発行（決定）             │
└────────────┬────────────────────────────┘
             │ 意思決定
             ▼
┌─────────────────────────────────────────┐
│ Solution Space - SSOT Layer             │
│ - Kernel固定（DecisionRecordを核に）      │
│ - Maturity遷移（draft→agreed→frozen）    │
│ - Evidence統治（AI生成物の検証）          │
│ - Change Control（外乱を状態遷移に吸収）   │
└─────────────────────────────────────────┘
```

### rules-config.yaml が統合するもの

`rules-config.yaml`は、以下を一元管理します：

1. **理論の実装**: DEST理論、Planning Layer理論、SSOT Layer理論の実装設定
2. **人間-AI責任分界**: 各フェーズで人間が判断すべきこと、AIが支援できること
3. **品質ゲート**: 各フェーズの品質閾値とゲート条件
4. **組織制約**: Hard constraint（交渉不可能条件）とSoft constraint（運用制約）
5. **変更履歴**: ルール変更の理由と責任主体

### 知識の移行計画

`unified_planning_and_ssot_framework.yaml`と`dest.yaml`に記述されていた知識は、以下のように移行されます：

| 従来の場所 | 新しい場所 | 状態 |
|----------|----------|------|
| dest.yaml の理論 | RULES_CONFIGURATION.md の「理論的基盤」セクション | ✅ 移行完了 |
| unified_planning_and_ssot_framework.yaml の理論 | RULES_CONFIGURATION.md の「理論的基盤」セクション | ✅ 移行完了 |
| ルール設定（環境変数） | rules-config.yaml | ✅ 移行完了 |
| 各フェーズのrationale | rules-config.yaml + RULES_CONFIGURATION.md | ✅ 移行完了 |

**最終目標**: `unified_planning_and_ssot_framework.yaml`と`dest.yaml`は、将来的に削除可能です。すべての知識が`rules-config.yaml`と`RULES_CONFIGURATION.md`に統合されました。

---

## 📚 関連ドキュメント

- [README.md](./README.md) - プロジェクト概要
- [SETUP_GUIDE.md](./SETUP_GUIDE.md) - セットアップ手順
- [LUNA_VISION_AND_ARCHITECTURE.md](./LUNA_VISION_AND_ARCHITECTURE.md) - アーキテクチャ詳細
- [Issue #40](https://github.com/sawadari/luna/issues/40) - ルール管理機能の実装Issue

---

## 🤝 貢献

ルール設定のベストプラクティスや改善案があれば、Issueまたは Pull Requestで共有してください。

---

## 📄 ライセンス

このドキュメントはLunaプロジェクトの一部であり、MITライセンスの下で公開されています。

---

**最終更新日**: 2026-01-16
**バージョン**: 1.0
