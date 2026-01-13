# Luna セットアップガイド

## 🚀 Phase 1 MVP 本番検証の準備

このガイドでは、Lunaの本番検証を実行するための環境設定を説明します。

---

## 📋 前提条件

### 必須

1. **Node.js**: v20.0.0以上
2. **npm**: v10.0.0以上
3. **Git**: インストール済み
4. **GitHub アカウント**:
   - テスト用リポジトリへのアクセス権
   - Personal Access Token（PAT）の作成権限

### 推奨（AI機能使用時）

5. **Anthropic API Key**: Claude APIアクセス用

---

## 🔑 環境変数の設定

Luna では、環境変数を `.env` ファイルで管理します。これにより、Claude Code の認証と競合しません。

### 1. .env ファイルの作成

プロジェクトルートに `.env` ファイルを作成します：

```bash
cd luna
cp .env.example .env
```

### 2. GitHub Personal Access Token（PAT）の作成と設定

#### ステップ1: GitHubでトークンを作成

1. GitHubにログイン
2. Settings → Developer settings → Personal access tokens → Tokens (classic)
3. "Generate new token (classic)" をクリック
4. 以下の権限を選択:
   ```
   ✅ repo (Full control of private repositories)
   ✅ workflow (Update GitHub Action workflows)
   ✅ write:discussion (Read & write discussions)
   ```
5. "Generate token" をクリック
6. **トークンをコピーして安全に保存**（再表示されません）

#### ステップ2: .env ファイルに設定

`.env` ファイルを編集して、以下を設定します：

```bash
# GitHub Configuration
GITHUB_TOKEN=ghp_your_actual_token_here
REPOSITORY=your-username/your-repo

# Anthropic API (optional - for AI-powered features)
ANTHROPIC_API_KEY=sk-ant-your_key_here

# DEST Configuration
ENABLE_DEST_JUDGMENT=true
ENABLE_CREPS_GATES=false
ENABLE_PLANNING_LAYER=false
ENABLE_SSOT_LAYER=false

# Agent Configuration
DRY_RUN=false
VERBOSE=true
```

**重要な注意事項:**
- ⚠️ **グローバル環境変数として `ANTHROPIC_API_KEY` を設定しないでください**
- Claude Code と競合するため、必ず `.env` ファイルで管理してください
- `.env` ファイルは `.gitignore` に含まれており、Gitにコミットされません

### 3. Anthropic API Key の取得（オプション）

AI駆動コード生成を使用する場合に必要です。

#### API Keyを取得

1. https://console.anthropic.com/ にアクセス
2. アカウント作成/ログイン
3. API Keys → Create Key
4. **キーをコピーして `.env` ファイルに貼り付け**

---

## ✅ 環境変数の確認

設定確認スクリプトを実行して、`.env` ファイルが正しく設定されているか確認します：

```bash
cd luna
npm run check-env
```

このスクリプトは `.env` ファイルから環境変数を読み込んで表示します。

**期待される出力:**
```
✅ GITHUB_TOKEN: Set (ghp_***)
✅ GITHUB_REPOSITORY: Set (your-username/your-repo)
✅ ANTHROPIC_API_KEY: Set (sk-ant-***)
```

---

## 🏗️ プロジェクトのセットアップ

### 1. 依存関係のインストール

```bash
cd luna
npm install
```

### 2. ビルド確認

```bash
npm run build
```

### 3. テストの実行

```bash
# 全テスト
npm test

# Kernel Registry デモ
npm run demo:kernel-registry

# SSOTAgentV2 テスト
npm run test:ssot-v2

# CoordinatorAgent テスト
npm run test:coordinator

# E2E統合テスト
npm run test:e2e
```

---

## 🎯 本番検証の実行

### Phase 1: Dry-Run テスト（推奨）

GitHubやAnthropicに実際にアクセスせずにテスト:

```bash
npm run test:e2e
```

### Phase 2: テストIssue作成

実際のGitHubリポジトリにテストIssueを作成:

```bash
npm run create-test-issue
```

出力例:
```
✅ Test issue created successfully!
📋 Issue #100: [TEST] Implement user profile feature
🔗 URL: https://github.com/owner/repo/issues/100
```

### Phase 3: CoordinatorAgent実行（Dry-Run）

```bash
npm run run-coordinator -- --issue 100 --dry-run
```

### Phase 4: CoordinatorAgent実行（実際の実行）

⚠️ **注意**: 実際にコード生成、PR作成、デプロイを実行します

```bash
npm run run-coordinator -- --issue 100
```

---

## 🔧 トラブルシューティング

### 問題1: GITHUB_TOKEN エラー

**エラー:**
```
❌ Error: GITHUB_TOKEN environment variable not set
```

**解決:**
1. 環境変数が正しく設定されているか確認
2. ターミナルを再起動
3. トークンの権限を確認（repo権限が必要）

### 問題2: API Rate Limit

**エラー:**
```
API rate limit exceeded
```

**解決:**
1. GitHub Personal Access Tokenを使用（認証済みは5000req/h）
2. 少し待ってから再試行
3. https://api.github.com/rate_limit で残り回数を確認

### 問題3: Anthropic API エラー

**エラー:**
```
Anthropic API key is invalid
```

**解決:**
1. API Keyが正しいか確認
2. API Keyの有効期限を確認
3. アカウントのクレジット残高を確認

---

## 📊 検証チェックリスト

本番検証を実行する前に、以下を確認してください:

### 環境設定
- [ ] Node.js v20.0.0以上がインストール済み
- [ ] npm install 完了
- [ ] npm run build 成功
- [ ] GITHUB_TOKEN 設定済み
- [ ] GITHUB_REPOSITORY 設定済み
- [ ] ANTHROPIC_API_KEY 設定済み（AI機能使用時）

### テスト実行
- [ ] npm run demo:kernel-registry 成功
- [ ] npm run test:ssot-v2 成功
- [ ] npm run test:coordinator 成功
- [ ] npm run test:e2e 成功

### リポジトリ準備
- [ ] テスト用GitHubリポジトリの作成
- [ ] リポジトリへの書き込み権限確認
- [ ] Issue作成権限確認

### 実行準備
- [ ] dry-runモードでテスト完了
- [ ] テストIssueの作成成功
- [ ] バックアップ取得（重要なリポジトリの場合）

---

## 📞 サポート

問題が発生した場合:

1. **GitHub Issues**: https://github.com/your-repo/luna/issues
2. **ドキュメント**: `README.md`, `CLAUDE.md`, `MVP_VERIFICATION.md`
3. **ログ確認**: `--verbose` フラグを使用して詳細ログを出力

---

## 🔗 関連ドキュメント

- `README.md` - プロジェクト概要
- `CLAUDE.md` - Claude Code コンテキスト
- `MVP_VERIFICATION.md` - MVP検証ドキュメント
- `kernels.yaml` - Kernel Registry

---

**最終更新日**: 2026-01-13
**バージョン**: Phase 1 MVP
**ステータス**: 本番検証準備完了
