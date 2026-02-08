# Luna レガシーコード分析

**分析日**: 2026-02-08
**Phase A-C 実装完了後のコードベース整理**

---

## 🎯 分析目的

Phase A-C実装後、以下のコードが冗長または非推奨になっている可能性があります：

1. Phase 1 MVP（Miyabi/DEST/CrePS）の実装
2. Phase A-C で置き換えられた古いKernel管理コード
3. 使われていないユーティリティ関数やテスト

---

## 📋 レガシーコード候補

### 🚫 削除推奨（Phase A-Cで置き換え済み）

#### 1. DEST関連エージェント

| ファイル | 理由 | Phase A-C での代替 |
|---------|------|------------------|
| `src/agents/al-judge.ts` | AL判定ロジック（Phase 1 MVP） | Issue一本道 + Bootstrap Kernel |
| `src/agents/al0-reason-detector.ts` | AL0 Reason検出 | Issue一本道 + Bootstrap Kernel |
| `src/agents/dest-agent.ts` | DESTAgent本体 | Issue一本道 + Bootstrap Kernel |
| `src/agents/protocol-router.ts` | Protocol P0-P4 ルーティング | Issue一本道 + Bootstrap Kernel |

**理由**: Phase C1（Issue一本道）により、すべての変更はIssue経由になり、DEST判定は不要になりました。

#### 2. CrePS/Gate関連エージェント

| ファイル | 理由 | Phase A-C での代替 |
|---------|------|------------------|
| `src/agents/box-navigator-agent.ts` | Box B1-B6ナビゲーション | CR-Runtime接続（Phase A3） |
| `src/agents/gate-keeper-agent.ts` | Gate G2-G6チェック | CR-Runtime接続（Phase A3） |
| `src/agents/gatekeeper-agent.ts` | （重複ファイル？） | CR-Runtime接続（Phase A3） |

**理由**: Phase A3（CR-Runtime接続）により、ChangeRequestから直接Kernel操作が実行されます。

#### 3. 古いSSOT実装

| ファイル | 理由 | Phase A-C での代替 |
|---------|------|------------------|
| `src/agents/ssot-agent.ts` | 古いSSOTAgent（v1） | `ssot-agent-v2.ts` + Phase A-C |

**理由**: `ssot-agent-v2.ts` が新しいバージョンです。v1は削除候補。

#### 4. 古いConfig/Service

| ファイル | 理由 | Phase A-C での代替 |
|---------|------|------------------|
| `src/config/gates.ts` | Gate定義（CrePS） | CR-Runtime接続（Phase A3） |
| `src/types/gate.ts` | Gate型定義（CrePS） | CR-Runtime接続（Phase A3） |

**理由**: Gateチェック機構はPhase A3で置き換えられました。

---

### ⚠️ 要確認（使用状況を確認してから判断）

#### 1. Planning Layer関連

| ファイル | 状態 | 判断 |
|---------|------|------|
| `src/agents/planning-agent.ts` | Planning Layer実装 | Phase E（将来）で必要 → **保持** |
| `src/agents/assumption-tracker-agent.ts` | Assumption追跡 | Phase E（将来）で必要 → **保持** |

**理由**: Planning Layerは Phase E で統合予定のため、保持推奨。

#### 2. Evidence/Exception管理

| ファイル | 状態 | 判断 |
|---------|------|------|
| `src/agents/evidence-governance-agent.ts` | Evidence管理 | Phase A1（u.link_evidence）に統合済み → **要確認** |
| `src/agents/exception-registry-agent.ts` | Exception管理 | Phase A1（u.raise_exception/u.close_exception）に統合済み → **要確認** |

**理由**: Phase A1のu.*操作で同じ機能が実現されている場合、削除候補。使用箇所を確認。

#### 3. State Transition Authority

| ファイル | 状態 | 判断 |
|---------|------|------|
| `src/config/state-transition-authority.ts` | 状態遷移の権限管理 | Phase A1（KernelRuntime）に統合済み → **要確認** |
| `src/services/authority-service.ts` | 権限サービス | Phase A1（KernelRuntime）で使用中 → **保持** |
| `src/types/authority.ts` | 権限型定義 | Phase A1（KernelRuntime）で使用中 → **保持** |

**理由**: `authority-service.ts` は Phase A1で使用されているため保持。`state-transition-authority.ts` は要確認。

---

### ✅ 保持推奨（Phase A-Cまたは将来必要）

#### 1. Phase A-C 実装

| ファイル | 理由 |
|---------|------|
| `src/ssot/kernel-runtime.ts` | Phase A1 - 単一エントリーポイント |
| `src/ssot/kernel-ledger.ts` | Phase A2 - Event Sourcing |
| `src/ssot/kernel-graph-converter.ts` | Phase B1 - Graph変換 |
| `src/ssot/kernel-graph-validator.ts` | Phase B1 - Graph検証 |
| `src/agents/change-control-agent.ts` | Phase A3 - CR-Runtime接続 |

**理由**: Phase A-C のコア実装。

#### 2. Miyabi エージェント（Phase 1 MVP）

| ファイル | 理由 |
|---------|------|
| `src/agents/coordinator-agent.ts` | タスク統括（Phase D で Kernel連携強化予定） |
| `src/agents/codegen-agent.ts` | コード生成（Phase D で Kernel連携強化予定） |
| `src/agents/review-agent.ts` | コードレビュー |
| `src/agents/test-agent.ts` | テスト実行（Phase D で Verification記録予定） |
| `src/agents/deployment-agent.ts` | デプロイ |
| `src/agents/monitoring-agent.ts` | 監視 |
| `src/agents/ssot-agent-v2.ts` | SSOT管理（Phase D で強化予定） |

**理由**: Phase D（Self-Improvement Loop強化）で必要。保持推奨。

#### 3. Kernel管理サービス

| ファイル | 理由 |
|---------|------|
| `src/ssot/kernel-registry.ts` | Kernel Registry（Phase A-C で使用中） |
| `src/services/kernel-enhancement-service.ts` | NRVV自動補完（Phase D で使用予定） |
| `src/services/reevaluation-service.ts` | Signal再評価（Planning Layer Phase E で使用予定） |
| `src/services/rules-config-service.ts` | ルール設定管理 |

**理由**: 現在または将来使用予定。

---

## 🗑️ 削除推奨ファイル一覧

### 即座に削除可能（Phase A-Cで完全に置き換え）

```bash
# DEST関連
src/agents/al-judge.ts
src/agents/al0-reason-detector.ts
src/agents/dest-agent.ts
src/agents/protocol-router.ts

# CrePS/Gate関連
src/agents/box-navigator-agent.ts
src/agents/gate-keeper-agent.ts
src/agents/gatekeeper-agent.ts
src/config/gates.ts
src/types/gate.ts

# 古いSSOT
src/agents/ssot-agent.ts

# 対応するテストファイル
tests/agents/al-judge.test.ts
tests/agents/al0-reason-detector.test.ts
tests/agents/protocol-router.test.ts
tests/agents/dest-agent.test.ts
# （他のテストファイルも確認）
```

### 使用箇所確認後に削除

```bash
# Evidence/Exception管理（Phase A1のu.*操作で代替可能か確認）
src/agents/evidence-governance-agent.ts
src/agents/exception-registry-agent.ts

# State Transition Authority（Phase A1で統合済みか確認）
src/config/state-transition-authority.ts
```

---

## 📝 削除手順

### ステップ1: 使用箇所の確認

```bash
# 例: al-judge.ts の使用箇所を確認
cd luna
grep -r "al-judge" src/ tests/ scripts/
grep -r "ALJudge" src/ tests/ scripts/
```

### ステップ2: テストファイルの確認

```bash
# 対応するテストファイルも削除対象
ls tests/agents/al-*.test.ts
ls tests/agents/protocol-*.test.ts
ls tests/agents/dest-*.test.ts
```

### ステップ3: Git管理下での削除

```bash
# バックアップブランチ作成
git checkout -b backup/pre-legacy-cleanup

# ファイル削除
git rm src/agents/al-judge.ts
git rm src/agents/al0-reason-detector.ts
# ... 他のファイル

# コミット
git commit -m "Remove legacy DEST/CrePS code (Phase A-C complete)"
```

---

## 🔍 次のステップ

1. **使用箇所の確認**: `grep` コマンドで削除候補ファイルの使用箇所を確認
2. **テスト実行**: レガシーコード削除後にテストが通ることを確認
3. **ビルド確認**: `npm run build` が成功することを確認
4. **ドキュメント更新**: 削除したファイルの説明を `docs/` から削除

---

## ⚠️ 注意事項

- **バックアップ必須**: 削除前に必ずGitブランチでバックアップ
- **段階的削除**: 一度にすべて削除せず、カテゴリごとに削除してテスト
- **依存関係確認**: 削除対象ファイルが他のファイルから参照されていないか確認
- **CI/CD確認**: GitHub Actionsワークフローが古いファイルを参照していないか確認

---

🌸 **Luna** - Phase A-C 完了後のクリーンアップ

**分析日**: 2026-02-08
