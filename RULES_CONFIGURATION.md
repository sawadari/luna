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

**カスタマイズ例**:
```yaml
# より厳格な設定（AL3以上のみ自動進行）
al_threshold:
  auto_proceed: "AL3"
```

#### Phase 1: Planning Layer（解決策探索）

```yaml
planning_layer:
  enabled: true
  rationale: "解決策探索は人間の意思決定支援が必要"

  creps_gates:
    enabled: true
    threshold: 70  # 70点以下は人間レビュー必要
```

**カスタマイズ例**:
```yaml
# より高品質を求める設定
creps_gates:
  threshold: 80  # 80点以下は人間レビュー
```

#### Phase 2: Kernel Generation（知識管理）

```yaml
kernel_generation:
  enabled: true
  rationale: "知識をKernelとして蓄積"

  convergence_monitoring:
    enabled: true
    threshold: 70  # 70%以下でアラート
    weekly_check: true
```

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

**カスタマイズ例**:
```yaml
# 厳格な品質基準
code_generation:
  quality_threshold: 90
  test_coverage_target: 90

review_required:
  min_quality_score: 90
```

### 3. 組織ルール (`organization_rules`)

組織レベルの制約を定義します。

```yaml
organization_rules:
  max_issue_complexity: "large"  # small/medium/large/xlarge

  require_approval_for:
    - "breaking changes"
    - "security-related"
    - "architecture changes"

  auto_execution_limits:
    max_files_generated: 50
    max_lines_per_file: 1000
    max_deployment_environments: 3
```

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
