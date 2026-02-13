# Luna - Getting Started Guide

世界最高の知識創造プラットフォームへようこそ 🌸

---

## 📚 目次

1. [Lunaとは](#lunaとは)
2. [クイックスタート](#クイックスタート)
3. [Phase A-C: Core Architectureを体験](#phase-a-c-core-architectureを体験)
4. [Rules Configuration: ルール設定](#rules-configuration-ルール設定)
5. [次のステップ](#次のステップ)

---

## Lunaとは

**Luna**は以下を統合した世界最高の知識創造プラットフォームです：

### 🏗️ Core Architecture (Phase A-C)

- **Phase A1: Kernel Runtime** - すべてのKernel操作の単一エントリーポイント
- **Phase A2: Kernel Ledger** - Event Sourcing型の追記専用ログ（完全な監査証跡）
- **Phase A3: CR-Runtime接続** - ChangeRequestからKernel操作の自動実行
- **Phase B1: Kernel Graph Schema** - 型付き知識グラフ（10種ノード、8種エッジ）
- **Phase C1: Issue一本道** - すべての変更はIssue経由、Bootstrap Kernel保護

### 📝 Rules Configuration (Issue #40)

人間-AI責任分界ルールを`rules-config.yaml`で一元管理：

- **DEST Judgment**: Issue実装前の価値判断（AL0/AL1/AL2判定）
- **Planning Layer**: 解決策探索とCrePS Gatesによる品質保証
- **Kernel Generation**: NRVV自動抽出と収束監視
- **Code Generation & Review**: AI生成コードの品質保証（80点以上）
- **Auto Deployment**: 環境別デプロイ制御（dev/staging/production）

### ✨ 主な特徴

- **📚 使えば使うほど賢くなる**: すべての変更がKernelに蓄積され、知識が収束
- **🔍 完全な監査証跡**: Event Sourcing型Ledgerですべての変更を記録
- **🔄 Replay機能**: 任意の時点にKernel状態を復元可能
- **🛡️ Bootstrap Kernel保護**: システムの根本ルールは不変
- **⚖️ 人間-AI責任分界**: 価値判断は人間、技術評価はAI

---

## クイックスタート

### 前提条件

- **Node.js** v20.0.0以上
- **npm** v10.0.0以上
- **Git**

### インストール

```bash
# 1. リポジトリのクローン
git clone <repository-url>
cd luna

# 2. 依存関係のインストール
npm install

# 3. ビルド
npm run build
```

**✅ これだけで完了です！**

### 🎯 最速で始める: ワンコマンド実行 (NEW!)

Lunaは**自然文でやりたいことを伝えるだけで、Issue化から実行まで自動化**できます：

```bash
# 環境変数を設定（初回のみ）
export GITHUB_TOKEN=<your-github-token>
export GITHUB_REPOSITORY=owner/repo
export ANTHROPIC_API_KEY=<your-anthropic-key>

# 自然文 → Issue生成 → 即座に実行
npm run luna:do -- "ユーザー認証機能を追加したい"
```

**これで以下がすべて自動実行されます**:
1. ✅ AI（Claude Sonnet 4）が自然文からIssue本文を生成
2. ✅ DEST判定フィールドを自動的に含める
3. ✅ GitHub Issueを作成（適切なラベル付き）
4. ✅ CoordinatorAgentが自動実行

#### 他の使い方

```bash
# Issue作成のみ（実行はしない）
npm run luna:plan -- "ダークモードを実装したい"

# 既存Issueを実行
npm run luna:run -- --issue 123

# dry-runモード（プレビューのみ）
npm run luna:do -- "キャッシュ機能を追加" --dry-run
```

#### 環境変数の設定

`.env`ファイルを作成して環境変数を設定することもできます：

```bash
# .env ファイル
GITHUB_TOKEN=ghp_xxxxxxxxxxxxx
GITHUB_REPOSITORY=your-org/luna
ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxxx
```

**重要**: `.env`ファイルは絶対にコミットしないでください（`.gitignore`に含まれています）。

---

---

## Phase A-C: Core Architectureを体験

Phase A-Cは、Lunaの核となるアーキテクチャです。Event Sourcing、Kernel Runtime、型付き知識グラフなど、最先端の技術が統合されています。

### Phase A1: Kernel Runtime

すべてのKernel操作の単一エントリーポイントをテストします。

```bash
npx tsx scripts/test-kernel-runtime-a1.ts
```

**期待される出力:**
```
🧪 Phase A1: Kernel Runtime テスト

✅ Rules configuration loaded

1. KernelRuntime初期化（Solo Mode）...
   ✅ KernelRuntime初期化完了

2. u.record_decision テスト...
   ✅ u.record_decision 成功

3. u.link_evidence テスト...
   ✅ u.link_evidence 成功

...
```

**実行内容:**
- 6つのKernel操作（`u.record_decision`, `u.link_evidence`, `u.set_state`等）を実行
- 権限チェック（Authority Service）の動作確認
- Gateチェック（AL0ブロック等）の動作確認

### Phase A2: Kernel Ledger

Event Sourcing型のLedger（追記専用ログ）をテストします。

```bash
npx tsx scripts/test-kernel-ledger-a2.ts
```

**期待される出力:**
```
🧪 Phase A2: Kernel Ledger テスト

✅ Rules configuration loaded

1. KernelRuntime初期化（Ledger有効）...
   ✅ KernelRuntime初期化完了

2. Kernel操作を実行（Ledgerに記録）...
   ✅ u.record_decision 成功
   ✅ u.set_state 成功

3. Ledgerからエントリを読み込み...
   ✅ 3件のエントリを読み込み

4. Ledger Replay機能をテスト...
   ✅ Replay成功: 3件のエントリを再実行
```

**実行内容:**
- Ledgerへの追記（append-only）
- Ledger読み込みとReplay機能
- 決定論的例外ID生成（再現性保証）

### Phase A3: CR-Runtime接続

ChangeRequestからKernel操作を自動実行します。

```bash
npx tsx scripts/test-phase-a3-cr-runtime.ts
```

**期待される出力:**
```
🧪 Phase A3: CR-Runtime統合テスト

✅ Rules configuration loaded

📦 Phase A3: ChangeRequest実行テスト

1️⃣  ChangeRequest作成
   ✅ CR作成成功: CR-2026-010
   ✅ 3件の操作を含む

2️⃣  ChangeRequest承認
   ✅ CR承認成功: CR-2026-010

3️⃣  ChangeRequest実行（Kernel操作実行）
   ✅ CR実行完了: CR-2026-010
   実行成功率: 3/3
```

**実行内容:**
- ChangeRequest作成（operation_details含む）
- ChangeRequest承認（人間の意思決定をシミュレート）
- ChangeRequest実行（Kernel操作の自動実行）

### Phase A1+A2: 統合テスト

Kernel RuntimeとLedgerの統合動作を確認します。

```bash
npx tsx scripts/test-phase-a1-a2-integration.ts
```

**期待される出力:**
```
🧪 Phase A1+A2 統合テスト

✅ Rules configuration loaded

📦 Phase A1: Kernel Runtime テスト
   1️⃣ u.record_decision テスト: ✅ Success
   2️⃣ u.link_evidence テスト: ✅ Success
   3️⃣ u.raise_exception テスト: ✅ Success
   4️⃣ u.close_exception テスト: ✅ Success
   5️⃣ u.set_state テスト: ✅ Success
   Phase A1テスト結果: 6/6 成功

📚 Phase A2: Kernel Ledger テスト
   7️⃣ Ledger全エントリ読み込み: ✅ 6件
   8️⃣ Ledger Replay: ✅ 6件再実行成功

🎉 Phase A1+A2統合テスト完了！
```

### Phase C1: Bootstrap Kernel保護

システムの根本ルールを保護する機能をテストします。

```bash
npx tsx scripts/test-phase-c1-bootstrap.ts
```

**期待される出力:**
```
🧪 Phase C1: Bootstrap Kernel & Issue一本道テスト

✅ Rules configuration loaded

1️⃣  Issue必須チェック
   ✅ Issue なし操作が正しく拒否されました
   ✅ Issue あり操作が正しく許可されました

2️⃣  Bootstrap Kernel保護チェック
   ✅ Bootstrap Kernel変更が正しく拒否されました
   ✅ 通常のKernel変更が正しく許可されました

🎉 Phase C1テスト完了！
```

**実行内容:**
- Issue必須の強制（すべてのKernel操作は`issue`パラメータが必須）
- Bootstrap Kernel保護（`BOOTSTRAP-*`は変更禁止）
- 強制機能の有効/無効切り替え

---

## Rules Configuration: ルール設定

Lunaは`rules-config.yaml`ファイルで人間-AI責任分界ルールを一元管理します。

### ルール設定の確認

```bash
cat rules-config.yaml
```

**主要な設定項目:**

```yaml
human_ai_boundary:
  # Phase 0: DEST Judgment
  dest_judgment:
    enabled: true
    al_threshold:
      block_below: "AL0"        # AL0: 実装ブロック
      require_approval: "AL1"   # AL1: 人間承認必要
      auto_proceed: "AL2"       # AL2以上: 自動進行

  # Phase 8: Auto Deployment
  auto_deployment:
    environments:
      dev:
        enabled: true
        require_approval: false  # 自動デプロイ
      staging:
        enabled: true
        require_approval: true   # 承認必要
      production:
        enabled: false
        require_approval: true   # 承認必須

core_architecture:
  # Kernel Runtime設定
  kernel_runtime:
    default_registry_path: "data/ssot/kernels-luna-base.yaml"
    default_ledger_path: "data/ssot/ledger.ndjson"
    solo_mode_default: false  # 権限チェック有効

  # AL0ブロック
  al0_gate:
    enabled: true  # AL0（Not Assured）は状態遷移をブロック
```

### ルールのカスタマイズ

開発環境向けの設定例：

```yaml
core_architecture:
  kernel_runtime:
    solo_mode_default: true   # 権限チェック無効（開発用）

  al0_gate:
    enabled: false            # AL0でも遷移許可（テスト用）

individual_preferences:
  verbose_logging: true       # 詳細ログ出力
  dry_run_default: true       # Dry-runモードをデフォルトに
```

**詳細は [`RULES_CONFIGURATION.md`](./RULES_CONFIGURATION.md) を参照してください。**

### ルール設定のテスト

```bash
npx tsx scripts/test-rules-config.ts
```

**期待される出力:**
```
🧪 Testing Rules Configuration Service

✅ Rules configuration loaded
✅ Validation passed
✅ All rules accessible
✅ Fallback to defaults working

🎉 Rules configuration test complete!
```

---

## 次のステップ

### 📖 ドキュメント

| ドキュメント | 内容 |
|------------|------|
| [`README.md`](../../README.md) | プロジェクト概要 |
| [`CLAUDE.md`](../../CLAUDE.md) | Claude Code コンテキスト |
| [`RULES_CONFIGURATION.md`](./RULES_CONFIGURATION.md) | ルール設定ガイド（理論的背景含む） |
| [`SETUP_GUIDE.md`](./SETUP_GUIDE.md) | 詳細なセットアップ手順 |
| [`MVP_VERIFICATION.md`](./MVP_VERIFICATION.md) | MVP検証ドキュメント |

### 🧪 利用可能なテスト

```bash
# Phase A-C統合テスト
npx tsx scripts/test-phase-a1-a2-integration.ts  # Phase A1+A2
npx tsx scripts/test-phase-a3-cr-runtime.ts      # Phase A3
npx tsx scripts/test-phase-b1-graph-schema.ts    # Phase B1
npx tsx scripts/test-phase-c1-bootstrap.ts       # Phase C1

# 個別テスト
npx tsx scripts/test-kernel-runtime-a1.ts        # Kernel Runtime
npx tsx scripts/test-kernel-ledger-a2.ts         # Kernel Ledger
npx tsx scripts/test-rules-config.ts             # Rules Config
npx tsx scripts/test-change-control-agent.ts     # Change Control
```

### 🚀 実際のプロジェクトで使う

1. **環境変数の設定**
   ```bash
   export GITHUB_TOKEN="ghp_your_token_here"
   export GITHUB_REPOSITORY="your-username/repo"
   export ANTHROPIC_API_KEY="sk-ant-your_key_here"
   ```

2. **CoordinatorAgentの実行**
   ```bash
   npm run run-coordinator -- --issue <issue-number>
   ```

3. **Dry-runモードでテスト**
   ```bash
   npm run run-coordinator -- --issue <issue-number> --dry-run
   ```

**詳細は [`SETUP_GUIDE.md`](./SETUP_GUIDE.md) を参照してください。**

---

## トラブルシューティング

### Q: `npm install` でエラーが出る

**A:** Node.jsのバージョンを確認してください:
```bash
node --version  # v20.0.0以上が必要
```

### Q: `npm run build` でエラーが出る

**A:** 以下を実行してください:
```bash
rm -rf node_modules package-lock.json
npm install
npm run build
```

### Q: テストで警告が出る

**A:** `⚠️ Rules config not loaded!` という警告が出た場合、テストスクリプトに `ensureRulesConfigLoaded()` が呼ばれているか確認してください。Phase A-Cのテストスクリプトは既に対応済みです。

### Q: Kernel操作が失敗する

**A:** 以下を確認してください:
- `data/ssot/kernels-luna-base.yaml` にKernelが存在するか
- `issue` パラメータが設定されているか（Issue必須）
- AL0 Gateが有効な場合、KernelのALが AL1以上か

**詳細は [`RULES_CONFIGURATION.md`](./RULES_CONFIGURATION.md) を参照してください。**

---

## まとめ

### Lunaを使い始める3ステップ

1. **インストール**
   ```bash
   npm install && npm run build
   ```

2. **Phase A-Cテスト実行**
   ```bash
   npx tsx scripts/test-phase-a1-a2-integration.ts
   ```

3. **ルール設定確認**
   ```bash
   cat rules-config.yaml
   ```

**🎉 これでLunaの基本機能を体験できました！**

---

## リソース

- **GitHub**: https://github.com/sawadari/luna
- **ドキュメント**: [`docs/guides/`](.) フォルダ
- **理論的背景**: [`RULES_CONFIGURATION.md`](./RULES_CONFIGURATION.md)

---

**🌸 Enjoy autonomous development with Luna!**

---

**最終更新日**: 2026-02-08
**バージョン**: Phase A-C & Issue #40 Complete
**ステータス**: Production Ready
