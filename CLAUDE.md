# luna - Claude Code Context

## プロジェクト概要

**luna** - Miyabiフレームワークで構築された自律型開発プロジェクト

このプロジェクトは識学理論(Shikigaku Theory)とAI Agentsを組み合わせた自律型開発環境で運用されています。

## 現在のステータス

**Phase 1 MVP**: ✅ 実装完了 (2026-01-13)
- 8つの自律エージェント実装完了
- End-to-End統合テスト成功
- 本番検証準備完了（環境設定ガイド作成済み）

**Issue #40: Rules Configuration**: ✅ 実装完了 (2026-02-08)
- 人間-AI責任分界ルールの一元管理（`rules-config.yaml`）
- Phase A-C: Core Architecture実装完了（Kernel Runtime, Issue Enforcement, Bootstrap Protection, AL0 Gate）
- すべてのエージェントがRules Configurationに対応

## 🌸 Miyabi Framework - Phase 1 MVP

### 8つの自律エージェント

#### 1. **CoordinatorAgent** - タスク統括・並列実行制御 ✅
- DAG（Directed Acyclic Graph）ベースのタスク分解
- Critical Path分析（PERT/CPM）による最適実行計画
- 並列実行可能タスクの特定
- 全エージェントの調整と実行
- **実装**: `src/agents/coordinator-agent.ts` (738 lines)
- **テスト**: `scripts/test-coordinator-agent.ts` (4シナリオ)

#### 2. **SSOTAgentV2** - Single Source of Truth管理 ✅
- Kernel Registry統合
- NRVV (Needs-Requirements-Verification-Validation) トレーサビリティ
- Maturity遷移管理（draft → under_review → agreed → frozen）
- 違反検出とGitHubコメント投稿
- **実装**: `src/agents/ssot-agent-v2.ts`
- **テスト**: `scripts/test-ssot-agent-v2.ts`

#### 3. **KernelRegistryService** - 中央Kernel管理 ✅
- YAMLベースの永続化（kernels.yaml）
- NRVV検証機能
- トレーサビリティマトリクス生成
- 収束率計算
- **実装**: `src/services/kernel-registry.ts`
- **テスト**: `scripts/demo-kernel-registry.ts`

#### 4. **CodeGenAgent** - AI駆動コード生成 ✅
- Anthropic Claude Sonnet 4.5統合
- Issue分析・コード生成
- 品質メトリクス計算
- **実装**: `src/agents/codegen-agent.ts`
- **統合**: CoordinatorAgentに統合済み

#### 5. **ReviewAgent** - コード品質判定 ✅
- 静的解析・セキュリティスキャン
- 品質スコアリング（100点満点、80点以上で合格）
- CodeGenContextを受け取りレビュー実行
- **実装**: `src/agents/review-agent.ts`
- **統合**: CoordinatorAgentに統合済み

#### 6. **TestAgent** - テスト自動実行 ✅
- テスト実行・カバレッジレポート
- 80%+カバレッジ目標
- ReviewContextを受け取りテスト実行
- **実装**: `src/agents/test-agent.ts`
- **統合**: CoordinatorAgentに統合済み

#### 7. **DeploymentAgent** - CI/CDデプロイ自動化 ✅
- 環境別デプロイ（dev/staging/prod）
- ヘルスチェック実行
- 自動Rollback機能
- **実装**: `src/agents/deployment-agent.ts`
- **統合**: CoordinatorAgentに統合済み

#### 8. **MonitoringAgent** - システム監視・アラート ✅
- メトリクス収集
- ヘルスチェック実行
- アラート生成
- **実装**: `src/agents/monitoring-agent.ts`
- **統合**: CoordinatorAgentに統合済み

## GitHub OS Integration

このプロジェクトは「GitHubをOSとして扱う」設計思想で構築されています:

### 自動化されたワークフロー（Phase 1 MVP）

1. **Issue作成** → GitHub Issue作成
2. **CoordinatorAgent** → タスクをDAG分解、Critical Path分析、並列実行プラン作成
3. **SSOTAgentV2** → Kernel検証、NRVV トレーサビリティ確認
4. **CodeGenAgent** → AI（Claude）でコード実装、テスト生成
5. **ReviewAgent** → 品質チェック（80点以上で合格）
6. **TestAgent** → テスト実行（カバレッジ確認、80%+目標）
7. **DeploymentAgent** → 環境別デプロイ（dev/staging/prod）、ヘルスチェック
8. **MonitoringAgent** → システム監視、メトリクス収集、アラート生成

**全工程がCoordinatorAgentにより調整され、自律実行。人間の介入は最小限。**

### エージェント間のコンテキスト伝播

各エージェントは前のエージェントの出力を受け取り、それを基に実行します：

```
CodeGenContext → ReviewContext → TestContext → DeploymentContext → MonitoringContext
```

これにより、パイプライン全体で情報が一貫して保持されます。

## ラベル体系（識学理論準拠）

### 10カテゴリー、53ラベル

- **type:** bug, feature, refactor, docs, test, chore, security
- **priority:** P0-Critical, P1-High, P2-Medium, P3-Low
- **state:** pending, analyzing, implementing, reviewing, testing, deploying, done
- **agent:** codegen, review, deployment, test, coordinator, issue, pr
- **complexity:** small, medium, large, xlarge
- **phase:** planning, design, implementation, testing, deployment
- **impact:** breaking, major, minor, patch
- **category:** frontend, backend, infra, dx, security
- **effort:** 1h, 4h, 1d, 3d, 1w, 2w
- **blocked:** waiting-review, waiting-deployment, waiting-feedback

## 開発ガイドライン

### TypeScript設定

```json
{
  "compilerOptions": {
    "strict": true,
    "module": "ESNext",
    "target": "ES2022"
  }
}
```

### セキュリティ

- **機密情報は環境変数で管理**: `GITHUB_TOKEN`, `ANTHROPIC_API_KEY`
- **.env を .gitignore に含める**
- **Webhook検証**: HMAC-SHA256署名検証

### テスト

```bash
npm test                    # 全テスト実行
npm run test:watch          # Watch mode
npm run test:coverage       # カバレッジレポート
```

目標: 80%+ カバレッジ

## 使用方法

### レベル1: デモモード（環境変数不要）

Luna の機能をシミュレーションで体験:

```bash
# Kernel Registry の動作確認
npm run demo:kernel-registry

# End-to-End パイプラインのシミュレーション
npm run test:e2e
```

### レベル2: 環境設定（実際のGitHub連携）

実際のGitHubリポジトリと連携する場合:

```bash
# 1. 環境変数設定（詳細は docs/guides/SETUP_GUIDE.md を参照）
export GITHUB_TOKEN="ghp_your_token_here"
export GITHUB_REPOSITORY="your-username/test-repo"

# 2. 環境確認
npm run check-env

# 3. テストIssue作成
npm run create-test-issue

# 4. CoordinatorAgent実行（Dry-Run）
npm run run-coordinator -- --issue 100 --dry-run
```

### レベル3: 本番実行（AI + 実際の変更）

⚠️ **注意**: 実際にコード生成、PR作成、デプロイを実行します

```bash
# Anthropic API Key設定
export ANTHROPIC_API_KEY="sk-ant-your_key_here"

# CoordinatorAgent実行
npm run run-coordinator -- --issue 100
```

### 利用可能なコマンド

```bash
# ビルド・テスト
npm run build                # TypeScriptビルド
npm test                     # 全テスト実行

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

## プロジェクト構造

```
luna/
├── .claude/               # Claude Code設定
│   ├── agents/           # Agent定義
│   ├── commands/         # カスタムコマンド
│   └── settings.json     # Claude設定
├── .github/
│   └── workflows/        # 26+ GitHub Actions
├── data/ssot/            # SSOT Layer データ
│   ├── kernels-luna-base.yaml  # Kernel Registry
│   └── ledger.ndjson     # Event Sourcing Ledger
├── src/                  # ソースコード
│   ├── agents/          # 8つの自律エージェント
│   ├── ssot/            # SSOT Layer実装
│   └── services/        # Rules Config等のサービス
├── tests/                # テストコード
├── rules-config.yaml     # 人間-AI責任分界ルール（新）
├── CLAUDE.md             # このファイル
└── package.json
```

## カスタムスラッシュコマンド

Claude Code で以下のコマンドが使用可能:

- `/test` - プロジェクト全体のテストを実行
- `/generate-docs` - コードからドキュメント自動生成
- `/create-issue` - Agent実行用Issueを対話的に作成
- `/deploy` - デプロイ実行
- `/verify` - システム動作確認（環境・コンパイル・テスト）
- `/security-scan` - セキュリティ脆弱性スキャン実行
- `/agent-run` - Autonomous Agent実行（Issue自動処理パイプライン）

## 識学理論（Shikigaku Theory）5原則

1. **責任の明確化** - 各AgentがIssueに対する責任を負う
2. **権限の委譲** - Agentは自律的に判断・実行可能
3. **階層の設計** - CoordinatorAgent → 各専門Agent
4. **結果の評価** - 品質スコア、カバレッジ、実行時間で評価
5. **曖昧性の排除** - DAGによる依存関係明示、状態ラベルで進捗可視化

## 環境変数

```bash
# GitHub Personal Access Token（必須）
GITHUB_TOKEN=ghp_xxxxx

# Anthropic API Key（必須 - Agent実行時）
ANTHROPIC_API_KEY=sk-ant-xxxxx
```

## ドキュメント

| ドキュメント | 内容 |
|------------|------|
| [`README.md`](./README.md) | プロジェクト概要 |
| [`CLAUDE.md`](./CLAUDE.md) | Claude Code コンテキスト（このファイル） |
| [`rules-config.yaml`](./rules-config.yaml) | 人間-AI責任分界ルール設定 |
| [`docs/guides/RULES_CONFIGURATION.md`](./docs/guides/RULES_CONFIGURATION.md) | ルール設定ガイド（理論的背景含む） |
| [`docs/guides/SETUP_GUIDE.md`](./docs/guides/SETUP_GUIDE.md) | 詳細なセットアップ手順 |
| [`docs/guides/GETTING_STARTED.md`](./docs/guides/GETTING_STARTED.md) | クイックスタートガイド |
| [`docs/guides/MVP_VERIFICATION.md`](./docs/guides/MVP_VERIFICATION.md) | MVP検証ドキュメント |

## トラブルシューティング

### 環境変数が設定できない
OSごとに設定方法が異なります。詳細は [`docs/guides/SETUP_GUIDE.md`](./docs/guides/SETUP_GUIDE.md) を参照。

### GitHub API Rate Limitエラー
Personal Access Tokenを使用すると、制限が5000req/hに増えます:
```bash
export GITHUB_TOKEN="ghp_your_token_here"
```

### npm run build でエラーが出る
TypeScriptの型エラーです。以下を確認:
```bash
# node_modulesを再インストール
rm -rf node_modules package-lock.json
npm install
npm run build
```

## サポート

- **Framework**: [Miyabi](https://github.com/ShunsukeHayashi/Autonomous-Operations)
- **Documentation**: [`README.md`](./README.md), [`docs/guides/SETUP_GUIDE.md`](./docs/guides/SETUP_GUIDE.md), [`docs/guides/GETTING_STARTED.md`](./docs/guides/GETTING_STARTED.md)
- **Issues**: GitHub Issues で管理

---

🌸 **Miyabi** - Beauty in Autonomous Development

**最終更新日**: 2026-01-13
**Phase 1 MVP**: ✅ 実装完了、本番検証準備完了

*このファイルは Claude Code が自動的に参照します。プロジェクトの変更に応じて更新してください。*
