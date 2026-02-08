# Luna Documentation

**最終更新**: 2026-02-08

---

## 📚 ドキュメント構成

### 🏗️ Core Architecture (Phase A-C) - **現行アーキテクチャ** ✅

**Phase A-C実装完了日**: 2026-02-08

Luna は Phase A-C コアアーキテクチャを完全実装しました。以下のドキュメントが最新のアーキテクチャを反映しています：

| ドキュメント | 説明 | 状態 |
|------------|------|------|
| [`../README.md`](../README.md) | プロジェクト概要、Phase A-C詳細 | ✅ 最新 |
| [`input/CORE_ARCHITECTURE_PROPOSAL.md`](input/CORE_ARCHITECTURE_PROPOSAL.md) | Phase A-C実装提案と完了報告 | ✅ 最新 |

**Phase A-C の主要機能**:
- **Phase A1**: Kernel Runtime一本化 - `KernelRuntime.apply(op)` 単一エントリーポイント
- **Phase A2**: Kernel Ledger正本化 - Event Sourcing、append-only、Replay機能
- **Phase A3**: CR-Runtime接続 - ChangeRequestから自動実行
- **Phase B1**: Kernel Graph Schema - 型付き知識グラフ、NRVV構造強制
- **Phase C1**: Issue一本道の運用固定 - Bootstrap Kernel、Issue必須強制

---

### 📖 Guides - **一部レガシー情報を含む** ⚠️

以下のガイドは Phase 1 MVP（Miyabiフレームワーク、DEST理論、CrePS）に基づいており、Phase A-C後は一部情報が古くなっています。各ガイドの先頭にレガシー警告を追加済みです。

| ドキュメント | 内容 | 状態 |
|------------|------|------|
| [`guides/GETTING_STARTED.md`](guides/GETTING_STARTED.md) | クイックスタートガイド | ⚠️ レガシー |
| [`guides/SETUP_GUIDE.md`](guides/SETUP_GUIDE.md) | セットアップ手順 | ⚠️ レガシー |
| [`guides/DEVELOPMENT.md`](guides/DEVELOPMENT.md) | 開発ガイド | ⚠️ レガシー |
| [`guides/SELF_IMPROVEMENT_GUIDE.md`](guides/SELF_IMPROVEMENT_GUIDE.md) | Self-Improvement Loop | ⚠️ レガシー |
| [`guides/MVP_VERIFICATION.md`](guides/MVP_VERIFICATION.md) | MVP検証 | ⚠️ レガシー |
| [`guides/PRODUCTION_READINESS.md`](guides/PRODUCTION_READINESS.md) | 本番準備 | ⚠️ レガシー |
| [`guides/RULES_CONFIGURATION.md`](guides/RULES_CONFIGURATION.md) | ルール設定 | ⚠️ レガシー |

**推奨**: 新しいプロジェクトでは [`../README.md`](../README.md) の Phase A-C アーキテクチャを使用してください。

---

### 📝 Input - **理論的基盤と提案**

| ドキュメント | 内容 | 状態 |
|------------|------|------|
| [`input/CORE_ARCHITECTURE_PROPOSAL.md`](input/CORE_ARCHITECTURE_PROPOSAL.md) | Phase A-C実装提案 | ✅ 最新 |
| [`input/LUNA_VISION_AND_ARCHITECTURE.md`](input/LUNA_VISION_AND_ARCHITECTURE.md) | Lunaビジョン | 📚 参考 |
| [`input/AI_HUMAN_ROLE_CONTRACT.md`](input/AI_HUMAN_ROLE_CONTRACT.md) | 人間-AI責任分界 | 📚 参考 |
| [`input/MBSE_SIMULATION_FRAMEWORK.md`](input/MBSE_SIMULATION_FRAMEWORK.md) | MBSEシミュレーション | 📚 参考 |
| [`input/dest.yaml`](input/dest.yaml) | DEST理論仕様 | ⚠️ レガシー |
| [`input/unified_planning_and_ssot_framework.yaml`](input/unified_planning_and_ssot_framework.yaml) | Planning + SSOT仕様 | ⚠️ レガシー |
| [`input/sales_input.md`](input/sales_input.md) | 営業インプット | 📚 参考 |

**レガシー理論について**:
- `dest.yaml` - DEST理論（AL0/AL1/AL2判定）は Phase 1 MVPで使用されました
- `unified_planning_and_ssot_framework.yaml` - Planning/SSOTフレームワークの一部が Phase A-Cで再実装されました

---

### 📊 Output - **生成されたドキュメント**

| ドキュメント | 内容 | 状態 |
|------------|------|------|
| [`output/LUNA_ACADEMIC_PAPER.md`](output/LUNA_ACADEMIC_PAPER.md) | 学術論文形式 | ⚠️ Phase 1 MVP基準 |
| [`output/LUNA_BLOG_POST.md`](output/LUNA_BLOG_POST.md) | ブログ記事形式 | ⚠️ Phase 1 MVP基準 |

**注意**: これらは Phase 1 MVP 時点で生成されたものです。Phase A-C を反映した新しいバージョンの作成を推奨します。

---

### 📖 Reference - **参考資料**

| フォルダ | 内容 | 状態 |
|----------|------|------|
| [`ref/tankyu_chapters/`](ref/tankyu_chapters/) | たんきゅう（MBSE本）の章 | 📚 参考資料 |

システムズエンジニアリングとMBSEの理論的基盤として参照されています。

---

### 📈 Reports - **実装レポート**

| フォルダ | 内容 | 状態 |
|----------|------|------|
| `reports/issues/` | Issue完了報告 | ⚠️ Phase 1 MVP期間 |
| `reports/analysis/` | ギャップ分析レポート | ⚠️ Phase 1 MVP期間 |
| `reports/progress/` | 進捗状況レポート | ⚠️ Phase 1 MVP期間 |

**注意**: これらは Phase 1 MVP 開発中に作成されたレポートです。

---

## 🎯 クイックリファレンス

### Phase A-C を学ぶには

1. **概要を理解**: [`../README.md`](../README.md) の Phase A-C セクションを読む
2. **詳細を確認**: [`input/CORE_ARCHITECTURE_PROPOSAL.md`](input/CORE_ARCHITECTURE_PROPOSAL.md) のSection 11（実行プラン）を読む
3. **テスト実行**: Phase A-Cテストスクリプトを実行して動作を確認
   ```bash
   npx tsx scripts/test-phase-a1-a2-integration.ts
   npx tsx scripts/test-phase-a3-cr-runtime.ts
   npx tsx scripts/test-phase-b1-graph-schema.ts
   npx tsx scripts/test-phase-c1-bootstrap.ts
   ```

### Phase 1 MVP（レガシー）を理解するには

1. [`guides/GETTING_STARTED.md`](guides/GETTING_STARTED.md) - Miyabiフレームワーク概要
2. [`input/dest.yaml`](input/dest.yaml) - DEST理論仕様
3. [`CLAUDE.md`](../CLAUDE.md) - 8つのエージェント説明

**注意**: これらは参考資料として残されていますが、新しいプロジェクトでは Phase A-C の使用を推奨します。

---

## 🔄 アーキテクチャ移行ガイド

### Phase 1 MVP → Phase A-C 主な変更点

| 項目 | Phase 1 MVP | Phase A-C |
|-----|-------------|-----------|
| **変更方法** | YAML直接編集 | `KernelRuntime.apply(op)` |
| **履歴管理** | Git commitのみ | Event Sourcing Ledger |
| **Rollback** | Git revert（部分的） | 完全な状態復元 |
| **NRVV検証** | 手動チェック | 自動グラフ検証 |
| **監査証跡** | コミットログ | 詳細な操作ログ |
| **変更の起点** | 不明確 | Issue必須 |

### 移行ステップ

1. **Ledger初期化**: `data/ssot/ledger.ndjson` を作成
2. **Bootstrap Kernel確認**: `data/ssot/bootstrap-kernel.yaml` を確認
3. **Issue一本道の適用**: すべての変更を Issue 経由で実行
4. **Graph検証の有効化**: `KernelGraphValidator` を使用

---

## 📞 サポート

- **最新アーキテクチャ**: [`../README.md`](../README.md)
- **Phase A-C詳細**: [`input/CORE_ARCHITECTURE_PROPOSAL.md`](input/CORE_ARCHITECTURE_PROPOSAL.md)
- **GitHub Issues**: 質問や報告は GitHub Issues で管理

---

🌸 **Luna** - 使えば使うほど賢くなる知識創造プラットフォーム

**Phase A-C 完了**: 2026-02-08
