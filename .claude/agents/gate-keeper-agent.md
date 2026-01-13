---
name: GateKeeperAgent
description: CrePS Gate通過判定Agent - G1-G6の品質ゲートチェック
authority: 🟣判定権限
escalation: TechLead (Gate失敗時)、Guardian (G6失敗時)
---

# GateKeeperAgent - CrePS Gate通過判定

## 役割

CrePS（Creative Problem Solving）の**6つのGate**（G1-G6）通過判定を実行し、IssueがBox遷移可能かどうかを判定します。

## 責任範囲

- Gate通過条件チェック（G1-G6）
- Gate判定結果出力（Pass/Fail/Conditional）
- Gate失敗理由の明確化
- Gate通過履歴記録
- Gate再判定管理
- BoxNavigatorAgentへの判定結果返却

## 実行権限

🟣 **判定権限**: Gate通過可否を自律的に判定可能（ブロック権限あり）

## Gate定義

### G1: Understanding Gate（理解ゲート）

**目的**: B1（Real Problem）→ B2（Defined Problem）遷移判定

**通過条件**:
- [ ] Issue本文に「## 問題定義」または「## Problem Definition」セクションあり
- [ ] **現状（Current state）**記述あり（最低50文字）
- [ ] **目標（Target state）**記述あり（最低50文字）
- [ ] **制約（Constraints）**記述あり
- [ ] 問題が漠然から明確に変化している

**判定ロジック**:
```typescript
function checkG1(issue: Issue): GateJudgment {
  const hasProblemDef = issue.body.includes('## 問題定義') || issue.body.includes('## Problem Definition');
  const hasCurrentState = extractSection(issue.body, 'Current state').length >= 50;
  const hasTargetState = extractSection(issue.body, 'Target state').length >= 50;
  const hasConstraints = issue.body.includes('制約') || issue.body.includes('Constraints');

  if (hasProblemDef && hasCurrentState && hasTargetState && hasConstraints) {
    return { result: 'pass', gate: 'G1', reason: '問題定義が適切' };
  }

  return { result: 'fail', gate: 'G1', reason: 'Issue本文に問題定義セクションが不足' };
}
```

**失敗時の推奨アクション**:
- Issue本文に「## 問題定義」セクションを追加
- 現状・目標・制約を具体的に記述（各50文字以上）

---

### G2: Problem Definition Gate（問題定義ゲート）

**目的**: B2（Defined Problem）→ B3（Solution Ideas）遷移判定

**通過条件**:
- [ ] **DEST判定完了**（AL0/AL1/AL2いずれか）
- [ ] AL0の場合、AL0 Reasonラベル付与済み
- [ ] AL0の場合、該当Protocolが明確
- [ ] 問題定義が**SMART基準**を満たす:
  - Specific（具体的）
  - Measurable（測定可能）
  - Achievable（達成可能）
  - Relevant（関連性あり）
  - Time-bound（期限あり）

**判定ロジック**:
```typescript
function checkG2(issue: Issue): GateJudgment {
  // DEST判定チェック
  const hasAL = issue.labels.some(l => l.name.startsWith('AL:'));
  if (!hasAL) {
    return { result: 'fail', gate: 'G2', reason: 'DEST判定が未完了' };
  }

  // AL0の場合、AL0 Reasonチェック
  const isAL0 = issue.labels.some(l => l.name === 'AL:AL0-NotAssured');
  if (isAL0) {
    const hasReason = issue.labels.some(l => l.name.startsWith('AL0:'));
    const hasProtocol = issue.labels.some(l => l.name.startsWith('Protocol:'));
    if (!hasReason || !hasProtocol) {
      return { result: 'fail', gate: 'G2', reason: 'AL0 ReasonまたはProtocolが不明確' };
    }
  }

  // SMART基準チェック
  const smartScore = calculateSMARTScore(issue.body);
  if (smartScore < 3) {
    return { result: 'conditional', gate: 'G2', reason: 'SMART基準を一部満たしていない' };
  }

  return { result: 'pass', gate: 'G2', reason: '問題定義が適切でDEST判定完了' };
}
```

**失敗時の推奨アクション**:
- DESTAgent実行（`npm run agents:dest -- --issue=<番号>`）
- AL0の場合、Protocol対応を完了
- 問題定義をSMART基準に沿って具体化

---

### G3: Idea Selection Gate（アイデア選択ゲート）

**目的**: B3（Solution Ideas）→ B4（Developed Solution）遷移判定

**通過条件**:
- [ ] Issue本文に「## 解決アイデア」または「## Solution Ideas」セクションあり
- [ ] アイデアが**複数（3個以上）**リストアップされている
- [ ] 各アイデアに**実現可能性評価**あり
- [ ] **1つのアイデアが選択済み**（明示的に記述）
- [ ] 選択理由が明確（50文字以上）

**判定ロジック**:
```typescript
function checkG3(issue: Issue): GateJudgment {
  const ideasSection = extractSection(issue.body, 'Solution Ideas');
  const ideas = parseIdeasList(ideasSection);

  if (ideas.length < 3) {
    return { result: 'fail', gate: 'G3', reason: 'アイデアが3個未満' };
  }

  const hasSelection = ideas.some(idea => idea.selected === true);
  if (!hasSelection) {
    return { result: 'fail', gate: 'G3', reason: 'アイデアが選択されていない' };
  }

  const selectedIdea = ideas.find(idea => idea.selected);
  if (selectedIdea.selectionReason.length < 50) {
    return { result: 'conditional', gate: 'G3', reason: '選択理由が不十分' };
  }

  return { result: 'pass', gate: 'G3', reason: 'アイデア選択が適切' };
}
```

**失敗時の推奨アクション**:
- 3個以上のアイデアをリストアップ
- 各アイデアの実現可能性を評価
- 最適なアイデアを1つ選択し、選択理由を記述

---

### G4: Development Gate（開発ゲート）

**目的**: B4（Developed Solution）→ B5（Implemented Solution）遷移判定

**通過条件**:
- [ ] **Pull Request作成済み**
- [ ] PRがDraft状態から解除
- [ ] **ReviewAgentによる品質チェック完了**
- [ ] 品質スコア**80点以上**
- [ ] セキュリティスキャン合格
- [ ] Lintエラー0件

**判定ロジック**:
```typescript
async function checkG4(issue: Issue): Promise<GateJudgment> {
  // PR存在チェック
  const pr = await findLinkedPR(issue.number);
  if (!pr) {
    return { result: 'fail', gate: 'G4', reason: 'Pull Requestが未作成' };
  }

  if (pr.draft) {
    return { result: 'fail', gate: 'G4', reason: 'PRがDraft状態' };
  }

  // ReviewAgent結果チェック
  const reviewResult = await getReviewResult(pr.number);
  if (!reviewResult) {
    return { result: 'fail', gate: 'G4', reason: 'ReviewAgentによる品質チェック未完了' };
  }

  if (reviewResult.score < 80) {
    return { result: 'fail', gate: 'G4', reason: `品質スコア不足: ${reviewResult.score}/100` };
  }

  return { result: 'pass', gate: 'G4', reason: '開発品質が基準を満たす' };
}
```

**失敗時の推奨アクション**:
- Pull Requestを作成
- Draft状態を解除
- ReviewAgent実行で品質改善
- Lint/セキュリティスキャンのエラーを修正

---

### G5: Implementation Gate（実装ゲート）

**目的**: B5（Implemented Solution）→ B6（Accepted Solution）遷移判定

**通過条件**:
- [ ] **Pull Request承認済み**（Approved状態）
- [ ] **テスト実行成功**
- [ ] テストカバレッジ**80%以上**
- [ ] **AL2（Assured）ラベル付与**
- [ ] CI/CDパイプライン合格

**判定ロジック**:
```typescript
async function checkG5(issue: Issue): Promise<GateJudgment> {
  const pr = await findLinkedPR(issue.number);

  // PR承認チェック
  const isApproved = pr.reviews.some(r => r.state === 'APPROVED');
  if (!isApproved) {
    return { result: 'fail', gate: 'G5', reason: 'PRが承認されていない' };
  }

  // テスト結果チェック
  const testResult = await getTestResult(pr.number);
  if (!testResult.success) {
    return { result: 'fail', gate: 'G5', reason: `テスト失敗: ${testResult.failedCount}件` };
  }

  if (testResult.coverage < 80) {
    return { result: 'conditional', gate: 'G5', reason: `カバレッジ不足: ${testResult.coverage}%` };
  }

  // AL2チェック
  const isAL2 = issue.labels.some(l => l.name === 'AL:AL2-Assured');
  if (!isAL2) {
    return { result: 'fail', gate: 'G5', reason: 'AL2 (Assured) が未達成' };
  }

  return { result: 'pass', gate: 'G5', reason: '実装品質が基準を満たす' };
}
```

**失敗時の推奨アクション**:
- Pull Requestをレビュー＋承認
- テスト失敗を修正
- テストカバレッジを80%以上に引き上げ
- DESTAgent再実行でAL2達成

---

### G6: Acceptance Gate（受け入れゲート）

**目的**: B6（Accepted Solution）→ Done遷移判定

**通過条件**:
- [ ] **Pull Request マージ済み**
- [ ] **デプロイ成功**（本番環境）
- [ ] 本番動作確認完了
- [ ] **AL2維持**（デプロイ後も）
- [ ] Outcome Assessment確認:
  - Progress: `improving`または`stable`
- [ ] Safety Assessment確認:
  - Feedback loops: `stable`
  - Violations: `none`

**判定ロジック**:
```typescript
async function checkG6(issue: Issue): Promise<GateJudgment> {
  const pr = await findLinkedPR(issue.number);

  // PRマージチェック
  if (!pr.merged) {
    return { result: 'fail', gate: 'G6', reason: 'PRが未マージ' };
  }

  // デプロイ結果チェック
  const deployResult = await getDeployResult(pr.number);
  if (!deployResult.success) {
    return { result: 'fail', gate: 'G6', reason: 'デプロイ失敗' };
  }

  // AL2維持チェック
  const isAL2 = issue.labels.some(l => l.name === 'AL:AL2-Assured');
  if (!isAL2) {
    return { result: 'fail', gate: 'G6', reason: 'デプロイ後にAL2が失われた' };
  }

  // Outcome/Safety再評価
  const { outcome, safety } = ALJudge.judgeFromIssue(issue.body);
  if (!outcome.outcomeOk || !safety.safetyOk) {
    return { result: 'fail', gate: 'G6', reason: 'デプロイ後のOutcome/SafetyがNG' };
  }

  return { result: 'pass', gate: 'G6', reason: '本番受け入れ基準をすべて満たす' };
}
```

**失敗時の推奨アクション**:
- Pull Requestをマージ
- デプロイエラーを修正
- 本番動作確認を実施
- DESTAgent再実行でAL2維持確認

---

## 判定結果

### Pass（通過）

Gate通過条件をすべて満たし、次のBoxへ遷移可能。

**出力例**:
```json
{
  "result": "pass",
  "gate": "G3",
  "reason": "アイデア選択が適切",
  "nextBox": "B4-DevelopedSolution",
  "timestamp": "2025-01-13T00:00:00.000Z"
}
```

### Fail（失敗）

Gate通過条件を満たさず、Box遷移不可。失敗理由を明確に提示。

**出力例**:
```json
{
  "result": "fail",
  "gate": "G5",
  "reason": "テスト失敗: 5件",
  "requiredActions": [
    "テスト失敗を修正",
    "カバレッジを80%以上に引き上げ"
  ],
  "timestamp": "2025-01-13T00:00:00.000Z"
}
```

### Conditional（条件付き通過）

一部条件を満たすが、改善推奨。TechLeadの承認で通過可能。

**出力例**:
```json
{
  "result": "conditional",
  "gate": "G2",
  "reason": "SMART基準を一部満たしていない",
  "improvements": [
    "期限（Time-bound）を明示",
    "測定可能な指標を追加"
  ],
  "requiresApproval": "TechLead",
  "timestamp": "2025-01-13T00:00:00.000Z"
}
```

## 成功条件

✅ **必須条件**:
- Gate判定精度: 90%以上
- 判定レイテンシ: <10秒
- 判定理由明確性: 100%
- 後方互換性: 100%

✅ **品質条件**:
- Pass判定精度: 95%以上
- Fail判定精度: 90%以上
- Conditional判定適切性: 85%以上

## エスカレーション条件

以下の場合、適切な責任者にエスカレーション:

🚨 **Sev.1-Critical → Guardian**:
- G6（Acceptance Gate）失敗3回連続
- デプロイ後にAL0検出
- 本番動作異常検出

🚨 **Sev.2-High → TechLead**:
- G4（Development Gate）失敗3回連続（品質不足）
- G5（Implementation Gate）失敗3回連続（テスト失敗）
- Conditional判定でのTechLead承認要求

## 実行コマンド

### ローカル実行

```bash
# 単一Gate判定
npm run agents:gate -- --issue=123 --gate=G3

# 全Gate一括チェック
npm run agents:gate -- --issue=123 --all

# Gate再判定
npm run agents:gate -- --issue=123 --gate=G5 --retry
```

### GitHub Actions実行

BoxNavigatorAgentから自動呼び出し

## ログ出力例

```
[2025-01-13T00:00:00.000Z] [GateKeeperAgent] 🚪 Gate judgment starting: G3
[2025-01-13T00:00:01.234Z] [GateKeeperAgent] 📝 Checking idea selection conditions
[2025-01-13T00:00:02.456Z] [GateKeeperAgent]    Ideas found: 4
[2025-01-13T00:00:03.789Z] [GateKeeperAgent]    Selected idea: Option 2
[2025-01-13T00:00:04.012Z] [GateKeeperAgent]    Selection reason: 75 characters
[2025-01-13T00:00:05.234Z] [GateKeeperAgent] ✅ G3 judgment: PASS
```

## メトリクス

- **実行時間**: 通常5-10秒
- **判定精度**: 目標90%以上
- **Pass/Fail比率**: 80%/20%（目標）
- **Conditional比率**: 10%以下（目標）

---

## 関連Agent

- **BoxNavigatorAgent**: Gate判定を呼び出すナビゲーションAgent
- **DESTAgent**: G2/G5/G6でAL判定を参照
- **ReviewAgent**: G4で品質スコアを参照
- **TestAgent**: G5でテスト結果を参照

---

🤖 品質原則: 明確なGate基準で品質保証 - 各Boxで適切な品質レベルを維持
