# 対話型Luna設計方針

**日時**: 2026-01-14
**目的**: Miyabi上でAIと対話しながらLuna機能を使えるようにする

---

## 📋 現状と課題

### 現在のLunaアーキテクチャ

```
GitHub Issue → CoordinatorAgent → [DEST → Planning → SSOT → CodeGen → Review → Test → Deploy → Monitor]
```

**実行方法**: CLI経由
```bash
npm run run-coordinator -- --issue 123
```

### 課題

1. **対話性の欠如**: GitHub Issueを作成してから実行する必要がある
2. **即時性の不足**: 「今すぐレビューして」「テストを実行して」などの要求に即応できない
3. **フィードバックループの遅延**: 結果を確認してから次の指示を出すまでに時間がかかる
4. **自然言語インターフェース不在**: コマンドやIssue番号を指定する必要がある

---

## 🎯 目指すべき姿

### ユーザー体験

```
User: "このコードをレビューして品質スコアを教えて"
Luna: "レビューを開始します..."
Luna: "✅ レビュー完了。品質スコア: 85点。3つの改善提案があります。"

User: "じゃあテストも実行して"
Luna: "テストを実行します..."
Luna: "✅ テスト完了。42件のテストが通過、カバレッジ85.5%です。"

User: "staging環境にデプロイできる？"
Luna: "前提条件を確認します... ✅ レビュー通過、✅ テスト通過。デプロイを開始します。"
Luna: "✅ デプロイ完了。URL: https://staging.example.com"
```

### 対話の特徴

1. **自然言語理解**: 「レビューして」「テストして」などの指示を理解
2. **コンテキスト保持**: 前の会話を記憶して連続した作業を実行
3. **即時実行**: 指示を受けたらすぐにエージェントを起動
4. **進捗報告**: 実行中の状態を随時報告
5. **結果フィードバック**: 結果を分かりやすく要約

---

## 🏗️ アーキテクチャ設計

### Option A: Chat Agent Wrapper（推奨）

```
User ←→ [ChatAgent] ←→ [Intent Parser] ←→ [Agent Router] ←→ [既存Agents]
                           ↓
                    [Session Manager]
                           ↓
                    [Context Store]
```

**利点**:
- 既存エージェントをそのまま再利用
- 段階的実装が可能
- シンプルなアーキテクチャ

**実装コンポーネント**:

1. **ChatAgent** - 対話の窓口
2. **IntentParser** - 自然言語からインテント（意図）を抽出
3. **AgentRouter** - インテントに基づいて適切なエージェントにルーティング
4. **SessionManager** - 会話セッションを管理
5. **ContextStore** - コンテキスト（前回の実行結果など）を保存

---

## 📐 詳細設計

### 1. ChatAgent

```typescript
// src/agents/chat-agent.ts

export class ChatAgent {
  private intentParser: IntentParser;
  private agentRouter: AgentRouter;
  private sessionManager: SessionManager;

  /**
   * ユーザーの指示を受け取って実行
   */
  async chat(userMessage: string, sessionId: string): Promise<ChatResponse> {
    // 1. セッション取得
    const session = await this.sessionManager.getSession(sessionId);

    // 2. インテント抽出
    const intent = await this.intentParser.parse(userMessage, session.context);

    // 3. エージェントにルーティング
    const result = await this.agentRouter.route(intent, session);

    // 4. セッション更新
    await this.sessionManager.updateSession(sessionId, {
      lastIntent: intent,
      lastResult: result,
    });

    // 5. レスポンス生成
    return this.generateResponse(result);
  }
}

interface ChatResponse {
  message: string;  // ユーザーへのメッセージ
  data?: any;       // 実行結果の詳細
  suggestedActions?: string[];  // 次のアクション提案
}
```

### 2. IntentParser

```typescript
// src/services/intent-parser.ts

export type IntentType =
  | 'review'        // コードレビュー
  | 'test'          // テスト実行
  | 'deploy'        // デプロイ
  | 'monitor'       // 監視
  | 'plan'          // プランニング
  | 'codegen'       // コード生成
  | 'query'         // 情報照会
  | 'help';         // ヘルプ

export interface Intent {
  type: IntentType;
  parameters: Record<string, any>;
  confidence: number;  // 0-1の信頼度
}

export class IntentParser {
  /**
   * 自然言語からインテントを抽出
   */
  async parse(userMessage: string, context: SessionContext): Promise<Intent> {
    // パターンマッチングでインテント分類
    const patterns: Record<IntentType, RegExp[]> = {
      review: [
        /レビュー|review|品質|quality/i,
        /チェック|check|検査|inspect/i,
      ],
      test: [
        /テスト|test|カバレッジ|coverage/i,
        /実行|run|動かす|execute/i,
      ],
      deploy: [
        /デプロイ|deploy|リリース|release/i,
        /本番|staging|production/i,
      ],
      monitor: [
        /監視|monitor|メトリクス|metrics/i,
        /ヘルスチェック|health|状態|status/i,
      ],
      plan: [
        /計画|plan|プランニング|planning/i,
        /オプション|option|選択肢|alternative/i,
      ],
      codegen: [
        /生成|generate|作成|create/i,
        /コード|code|実装|implement/i,
      ],
      query: [
        /教えて|知りたい|確認|情報/i,
        /どう|何|いつ|where|what|how/i,
      ],
      help: [
        /ヘルプ|help|使い方|usage/i,
        /できる|機能|feature/i,
      ],
    };

    // マッチング
    for (const [intentType, regexes] of Object.entries(patterns)) {
      for (const regex of regexes) {
        if (regex.test(userMessage)) {
          return {
            type: intentType as IntentType,
            parameters: this.extractParameters(userMessage, intentType as IntentType),
            confidence: 0.8,
          };
        }
      }
    }

    // マッチしない場合はquery
    return {
      type: 'query',
      parameters: { query: userMessage },
      confidence: 0.5,
    };
  }

  private extractParameters(message: string, intentType: IntentType): Record<string, any> {
    const params: Record<string, any> = {};

    // Issue番号抽出
    const issueMatch = message.match(/#(\d+)|issue\s+(\d+)/i);
    if (issueMatch) {
      params.issueNumber = parseInt(issueMatch[1] || issueMatch[2]);
    }

    // ファイルパス抽出
    const fileMatch = message.match(/([a-zA-Z0-9_\-./]+\.(ts|js|py|md|yaml))/);
    if (fileMatch) {
      params.filePath = fileMatch[1];
    }

    // 環境指定抽出
    const envMatch = message.match(/(staging|production|dev)/i);
    if (envMatch) {
      params.environment = envMatch[1].toLowerCase();
    }

    return params;
  }
}
```

### 3. AgentRouter

```typescript
// src/services/agent-router.ts

export class AgentRouter {
  private reviewAgent: ReviewAgent;
  private testAgent: TestAgent;
  private deploymentAgent: DeploymentAgent;
  private monitoringAgent: MonitoringAgent;
  private planningAgent: PlanningAgent;
  private codeGenAgent: CodeGenAgent;

  /**
   * インテントに基づいてエージェントにルーティング
   */
  async route(intent: Intent, session: ChatSession): Promise<AgentResult<any>> {
    switch (intent.type) {
      case 'review':
        return await this.executeReview(intent, session);

      case 'test':
        return await this.executeTest(intent, session);

      case 'deploy':
        return await this.executeDeploy(intent, session);

      case 'monitor':
        return await this.executeMonitor(intent, session);

      case 'plan':
        return await this.executePlanning(intent, session);

      case 'codegen':
        return await this.executeCodeGen(intent, session);

      case 'query':
        return await this.handleQuery(intent, session);

      case 'help':
        return await this.showHelp();

      default:
        throw new Error(`Unknown intent type: ${intent.type}`);
    }
  }

  private async executeReview(intent: Intent, session: ChatSession): Promise<AgentResult<ReviewContext>> {
    // 前回のcodeGenContextがあればそれを使う
    const codeGenContext = session.context.lastCodeGenContext;

    if (!codeGenContext) {
      throw new Error('コードが生成されていません。先にコード生成を実行してください。');
    }

    return await this.reviewAgent.execute(
      intent.parameters.issueNumber || session.currentIssue,
      codeGenContext
    );
  }

  private async executeTest(intent: Intent, session: ChatSession): Promise<AgentResult<TestContext>> {
    // 前回のreviewContextがあればそれを使う
    const reviewContext = session.context.lastReviewContext;

    if (!reviewContext) {
      throw new Error('レビューが完了していません。先にレビューを実行してください。');
    }

    return await this.testAgent.execute(
      intent.parameters.issueNumber || session.currentIssue,
      reviewContext.codeGenContext,
      reviewContext
    );
  }

  private async executeDeploy(intent: Intent, session: ChatSession): Promise<AgentResult<DeploymentContext>> {
    // 前提条件チェック
    const testContext = session.context.lastTestContext;

    if (!testContext || !testContext.overallSuccess) {
      throw new Error('テストが通過していません。先にテストを実行してください。');
    }

    return await this.deploymentAgent.execute(
      intent.parameters.issueNumber || session.currentIssue,
      testContext.codeGenContext,
      testContext.reviewContext,
      testContext,
      { environment: intent.parameters.environment || 'staging' }
    );
  }

  // ... 他のメソッド
}
```

### 4. SessionManager

```typescript
// src/services/session-manager.ts

export interface ChatSession {
  id: string;
  userId: string;
  currentIssue?: number;
  context: SessionContext;
  createdAt: string;
  lastActivityAt: string;
}

export interface SessionContext {
  lastIntent?: Intent;
  lastCodeGenContext?: CodeGenContext;
  lastReviewContext?: ReviewContext;
  lastTestContext?: TestContext;
  lastDeploymentContext?: DeploymentContext;
  conversationHistory: Array<{
    userMessage: string;
    lunaResponse: string;
    timestamp: string;
  }>;
}

export class SessionManager {
  private sessions: Map<string, ChatSession> = new Map();

  async getSession(sessionId: string): Promise<ChatSession> {
    let session = this.sessions.get(sessionId);

    if (!session) {
      session = {
        id: sessionId,
        userId: 'default',
        context: {
          conversationHistory: [],
        },
        createdAt: new Date().toISOString(),
        lastActivityAt: new Date().toISOString(),
      };
      this.sessions.set(sessionId, session);
    }

    return session;
  }

  async updateSession(sessionId: string, updates: Partial<ChatSession>): Promise<void> {
    const session = await this.getSession(sessionId);
    Object.assign(session, updates, {
      lastActivityAt: new Date().toISOString(),
    });
  }

  async clearSession(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId);
  }
}
```

---

## 🔧 インターフェース実装

### Option 1: Claude Code Slash Command（推奨）

```typescript
// .claude/commands/luna.ts

export const lunaCommand = {
  name: 'luna',
  description: 'Luna AIエージェントと対話',
  handler: async (args: string[], context: CommandContext) => {
    const chatAgent = new ChatAgent(context.config);
    const sessionId = context.sessionId || 'default';

    // ユーザーの指示を結合
    const userMessage = args.join(' ');

    // ChatAgentに渡す
    const response = await chatAgent.chat(userMessage, sessionId);

    // 結果を表示
    console.log(response.message);

    if (response.suggestedActions) {
      console.log('\n次にできること:');
      response.suggestedActions.forEach(action => {
        console.log(`  - ${action}`);
      });
    }
  },
};
```

**使用例**:
```bash
/luna このコードをレビューして
/luna テストを実行してカバレッジを確認
/luna staging環境にデプロイ
```

### Option 2: MCP Server（将来拡張）

```typescript
// src/mcp/luna-server.ts

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const server = new Server({
  name: 'luna',
  version: '1.0.0',
});

// ツール定義
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'luna_review',
        description: 'コードレビューを実行',
        inputSchema: {
          type: 'object',
          properties: {
            issueNumber: { type: 'number' },
          },
        },
      },
      {
        name: 'luna_test',
        description: 'テストを実行',
        inputSchema: {
          type: 'object',
          properties: {
            issueNumber: { type: 'number' },
          },
        },
      },
      // ... 他のツール
    ],
  };
});

// ツール実行
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  const chatAgent = new ChatAgent(config);

  // ツール名から自然言語メッセージを生成
  const messageMap: Record<string, string> = {
    luna_review: 'コードレビューを実行してください',
    luna_test: 'テストを実行してください',
    luna_deploy: 'デプロイを実行してください',
  };

  const message = messageMap[name] || name;
  const response = await chatAgent.chat(message, 'mcp-session');

  return {
    content: [{ type: 'text', text: response.message }],
  };
});
```

---

## 📊 実装ロードマップ

### Phase 1: 基礎実装（2-3週間）

1. **Week 1**: ChatAgent + IntentParser + SessionManager
   - 基本的な対話機能
   - パターンマッチングによるインテント分類
   - セッション管理

2. **Week 2**: AgentRouter 実装
   - 既存エージェントとの統合
   - コンテキスト伝播
   - エラーハンドリング

3. **Week 3**: Claude Code統合
   - `/luna` コマンド実装
   - テストとデバッグ
   - ドキュメント作成

### Phase 2: 機能拡張（2-3週間）

4. **Week 4**: インテント分類の高度化
   - AIベースのインテント分類（Claude API使用）
   - パラメータ抽出の改善
   - 曖昧性解決

5. **Week 5**: 会話フロー改善
   - 確認ダイアログ
   - 進捗報告
   - エラーリカバリー

6. **Week 6**: MCP Server実装
   - MCP プロトコル対応
   - Claude Desktop連携
   - リモート実行対応

### Phase 3: 高度な機能（将来）

7. 複数エージェントの並列実行
8. 会話履歴の永続化
9. マルチユーザー対応
10. Web UI実装

---

## ✅ 成功基準

### MVP（Phase 1完了時）

- [ ] `/luna レビューして` でReviewAgentが実行される
- [ ] `/luna テストして` でTestAgentが実行される
- [ ] `/luna デプロイして` でDeploymentAgentが実行される
- [ ] セッションが保持され、連続した会話ができる
- [ ] 前回の実行結果を参照して次のアクションが実行される

### フル機能（Phase 2完了時）

- [ ] 自然言語の多様な表現を理解できる
- [ ] AIベースのインテント分類が動作する
- [ ] MCP ServerとしてClaude Desktopから利用できる
- [ ] エラー時に適切なガイダンスが表示される
- [ ] 次のアクション提案が表示される

---

## 🔗 既存Issueとの関係

### 対話型Lunaと既存P0 Issuesの関係

| P0 Issue | 対話型Lunaへの影響 |
|----------|-------------------|
| #1: falsification_conditions | 対話中に「再評価が必要か？」を自動判定 |
| #2: ChangeRequest Flow | 対話での変更も全てCRとして記録 |
| #3: Gate Control | 対話で次のステップに進む前にGateチェック |
| #4: Exception Registry | 対話中に例外承認を要求 |
| #5: State Transition Authority | 対話中の状態遷移も権限チェック |

**結論**: 対話型Lunaは既存P0 Issuesの**上位レイヤー**として実装し、既存機能を活用する。

---

## 📝 次のステップ

1. ✅ **設計方針策定完了**
2. ⏳ **Issue作成** - 対話型Luna実装Issue（Phase 1-3）
3. ⏳ **プロトタイプ実装** - ChatAgent + IntentParser
4. ⏳ **既存エージェント統合** - AgentRouter実装
5. ⏳ **Claude Code統合** - `/luna` コマンド実装

---

**策定日**: 2026-01-14
**策定者**: Claude (Claude Code)
**ステータス**: ✅ 設計完了、Issue化待ち
