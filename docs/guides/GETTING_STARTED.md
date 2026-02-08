# Luna - Getting Started Guide

> **⚠️ LEGACY DOCUMENT WARNING (2026-02-08)**
>
> このドキュメントは Phase 1 MVP（Miyabiフレームワーク）に基づいており、**Phase A-C実装（2026-02-08完了）後は一部情報が古くなっています**。
>
> 最新の Core Architecture (Phase A-C) については以下を参照してください：
> - [`README.md`](../../README.md) - 最新のアーキテクチャ概要
> - [`docs/input/CORE_ARCHITECTURE_PROPOSAL.md`](../input/CORE_ARCHITECTURE_PROPOSAL.md) - Phase A-C実装詳細
>
> このガイドは参考資料として残されていますが、新しいプロジェクトでは Phase A-C アーキテクチャの使用を推奨します。

## 🌸 Welcome to Luna

Luna は Miyabi フレームワークで構築された**自律型開発プラットフォーム**です。

このガイドでは、Lunaを初めて使用する方向けに、セットアップから本番検証までの手順を説明します。

---

## 📚 目次

1. [概要](#概要)
2. [クイックスタート](#クイックスタート)
3. [セットアップ](#セットアップ)
4. [使い方](#使い方)
5. [次のステップ](#次のステップ)

---

## 概要

### Luna Phase 1 MVP の機能

Luna Phase 1 MVPは、以下の自律型エージェントを実装しています:

#### 🎯 CoordinatorAgent
- タスクを自動的にDAG（有向非巡回グラフ）に分解
- Critical Path分析で最適な実行計画を生成
- 並列実行可能なタスクを特定し、効率的に実行

#### 📝 SSOTAgentV2 (Single Source of Truth)
- Kernel（システムの真実）を中央管理
- NRVV（Needs-Requirements-Verification-Validation）トレーサビリティ
- Maturity管理（draft → under_review → agreed → frozen）

#### 🤖 CodeGenAgent
- AI（Claude Sonnet 4.5）駆動のコード生成
- Issue分析とコード品質メトリクス

#### 🔍 ReviewAgent
- 自動コードレビュー
- セキュリティスキャン
- 品質スコアリング（80点以上で合格）

#### 🧪 TestAgent
- 自動テスト実行
- カバレッジレポート生成（80%+目標）

#### 🚀 DeploymentAgent
- 環境別自動デプロイ（dev/staging/prod）
- ヘルスチェック
- 自動Rollback

#### 📊 MonitoringAgent
- システム監視
- メトリクス収集
- アラート生成

---

## クイックスタート

### 最速でLunaを試す

```bash
# 1. リポジトリのクローン
git clone <repository-url>
cd luna

# 2. 依存関係のインストール
npm install

# 3. ビルド
npm run build

# 4. デモの実行（環境変数不要）
npm run demo:kernel-registry
npm run test:e2e
```

これだけで、Lunaの基本機能を体験できます！

---

## セットアップ

### 1. 前提条件

- **Node.js** v20.0.0以上
- **npm** v10.0.0以上
- **Git**

### 2. インストール

```bash
cd luna
npm install
```

### 3. ビルド確認

```bash
npm run build
```

エラーがなければ成功です！

### 4. 基本テストの実行

```bash
# Kernel Registry デモ
npm run demo:kernel-registry

# SSOT Agent テスト
npm run test:ssot-v2

# Coordinator Agent テスト
npm run test:coordinator

# E2E 統合テスト
npm run test:e2e
```

すべてのテストが成功すれば、Lunaは正しくセットアップされています！

---

## 使い方

### レベル1: デモモード（環境変数不要）

Luna の機能をシミュレーションで体験:

```bash
# Kernel Registry の動作確認
npm run demo:kernel-registry

# End-to-End パイプラインのシミュレーション
npm run test:e2e
```

**結果:**
- Kernel Registry の CRUD 操作
- NRVV トレーサビリティ検証
- タスク分解とDAG生成
- エージェント実行（シミュレーション）

### レベル2: 環境設定（実際のGitHub連携）

実際のGitHubリポジトリと連携する場合:

#### ステップ1: 環境変数の設定

```bash
# GitHub Personal Access Token
export GITHUB_TOKEN="ghp_your_token_here"

# リポジトリ（owner/repo形式）
export GITHUB_REPOSITORY="your-username/test-repo"
```

詳細は [`SETUP_GUIDE.md`](./SETUP_GUIDE.md) を参照してください。

#### ステップ2: 環境確認

```bash
npm run check-env
```

**期待される出力:**
```
✅ GITHUB_TOKEN: Set
✅ GITHUB_REPOSITORY: Set
⚠️ ANTHROPIC_API_KEY: Not set (optional)
```

#### ステップ3: テストIssueの作成

```bash
npm run create-test-issue
```

**出力例:**
```
✅ Test issue created successfully!
📋 Issue #100: [TEST] Implement user profile feature
🔗 URL: https://github.com/your-username/test-repo/issues/100
```

#### ステップ4: CoordinatorAgentの実行（Dry-Run）

```bash
npm run run-coordinator -- --issue 100 --dry-run
```

**結果:**
- 実際のIssueを取得
- タスク分解とDAG生成
- エージェント実行（シミュレーション）
- GitHubには**書き込まない**（安全）

### レベル3: 本番実行（AI + 実際の変更）

⚠️ **注意**: 実際にコード生成、PR作成、デプロイを実行します

#### ステップ1: Anthropic API Keyの設定

```bash
export ANTHROPIC_API_KEY="sk-ant-your_key_here"
```

#### ステップ2: 実行

```bash
npm run run-coordinator -- --issue 100
```

**実行内容:**
- AI（Claude）による実際のコード生成
- コードレビューの実行
- テストの実行
- GitHubへのコメント投稿
- ラベルの自動更新

---

## 次のステップ

### ドキュメント

| ドキュメント | 内容 |
|------------|------|
| [`README.md`](./README.md) | プロジェクト概要 |
| [`CLAUDE.md`](./CLAUDE.md) | Claude Code コンテキスト |
| [`SETUP_GUIDE.md`](./SETUP_GUIDE.md) | 詳細なセットアップ手順 |
| [`MVP_VERIFICATION.md`](./MVP_VERIFICATION.md) | MVP検証ドキュメント |

### 利用可能なコマンド

```bash
# ビルド・テスト
npm run build                # TypeScriptビルド
npm test                     # 全テスト実行
npm run lint                 # ESLint実行
npm run format               # Prettier実行

# デモ・テスト
npm run demo:kernel-registry # Kernel Registry デモ
npm run test:ssot-v2         # SSOT Agent テスト
npm run test:coordinator     # Coordinator Agent テスト
npm run test:e2e             # E2E統合テスト

# 環境・実行
npm run check-env            # 環境変数確認
npm run create-test-issue    # テストIssue作成
npm run run-coordinator      # CoordinatorAgent実行
```

### エージェント個別実行

```bash
# 各エージェントを個別に実行（開発用）
npm run agents:coordinator
npm run agents:ssot-v2
npm run agents:codegen
npm run agents:review
npm run agents:test
npm run agents:deployment
npm run agents:monitoring
```

---

## トラブルシューティング

### Q: `npm install` でエラーが出る

**A:** Node.jsのバージョンを確認してください:
```bash
node --version  # v20.0.0以上が必要
```

### Q: `npm run build` でエラーが出る

**A:** TypeScriptの型エラーです。以下を確認:
```bash
# node_modulesを再インストール
rm -rf node_modules package-lock.json
npm install

# ビルド再実行
npm run build
```

### Q: 環境変数が設定できない

**A:** OSごとに設定方法が異なります。詳細は [`SETUP_GUIDE.md`](./SETUP_GUIDE.md) を参照。

### Q: GitHub API Rate Limitエラー

**A:** Personal Access Tokenを使用すると、制限が5000req/hに増えます:
```bash
export GITHUB_TOKEN="ghp_your_token_here"
```

---

## サポート

### 問題が発生した場合

1. **ドキュメント確認**:
   - [`SETUP_GUIDE.md`](./SETUP_GUIDE.md)
   - [`MVP_VERIFICATION.md`](./MVP_VERIFICATION.md)

2. **環境確認**:
   ```bash
   npm run check-env
   ```

3. **詳細ログ出力**:
   ```bash
   npm run run-coordinator -- --issue <number> --verbose
   ```

4. **GitHub Issues**:
   - バグ報告や機能要望は GitHub Issues へ

---

## まとめ

### Luna を使い始める3ステップ

1. **インストール**
   ```bash
   npm install && npm run build
   ```

2. **デモ実行**
   ```bash
   npm run test:e2e
   ```

3. **実環境テスト**（オプション）
   ```bash
   npm run check-env
   npm run create-test-issue
   npm run run-coordinator -- --issue <number> --dry-run
   ```

---

## リソース

- **GitHub**: https://github.com/your-org/luna
- **ドキュメント**: このリポジトリの docs/ フォルダ
- **Miyabi Framework**: https://github.com/ShunsukeHayashi/Autonomous-Operations

---

**🌸 Enjoy autonomous development with Luna!**

---

**最終更新日**: 2026-01-13
**バージョン**: Phase 1 MVP
**ステータス**: Production Ready
