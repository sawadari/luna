# [P1] 対話型Luna基礎実装 - ChatAgent + IntentParser + SessionManager (Phase 1)

## 📋 概要

現在のLunaはGitHub IssueベースのCLI実行ですが、AIと対話しながらLuna機能を使えるようにします。「このコードをレビューして」「テストを実行して」などの自然言語指示でエージェントを呼び出せる対話型インターフェースを実装します。

**Phase 1**: 基礎的な対話機能を実装（ChatAgent、IntentParser、SessionManager、AgentRouter）

## 🎯 目指すべき体験

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

## 🏗️ アーキテクチャ

```
User ←→ [ChatAgent] ←→ [IntentParser] ←→ [AgentRouter] ←→ [既存Agents]
                           ↓
                    [SessionManager]
                           ↓
                    [Context Store]
```

## 🚀 実装内容

### 1. ChatAgent 実装

```typescript
// src/agents/chat-agent.ts

export class ChatAgent {
  private intentParser: IntentParser;
  private agentRouter: AgentRouter;
  private sessionManager: SessionManager;

  constructor(config: AgentConfig) {
    this.intentParser = new IntentParser();
    this.agentRouter = new AgentRouter(config);
    this.sessionManager = new SessionManager();
  }

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
    return this.generateResponse(result, intent);
  }

  private generateResponse(result: AgentResult<any>, intent: Intent): ChatResponse {
    // 結果を自然言語に変換
    const message = this.formatResultAsMessage(result, intent);

    // 次のアクション提案
    const suggestedActions = this.suggestNextActions(result, intent);

    return {
      message,
      data: result.data,
      suggestedActions,
    };
  }
}

export interface ChatResponse {
  message: string;  // ユーザーへのメッセージ
  data?: any;       // 実行結果の詳細
  suggestedActions?: string[];  // 次のアクション提案
}
```

### 2. IntentParser 実装

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
   * 自然言語からインテントを抽出（パターンマッチング版）
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
            parameters: this.extractParameters(userMessage, intentType as IntentType, context),
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

  private extractParameters(
    message: string,
    intentType: IntentType,
    context: SessionContext
  ): Record<string, any> {
    const params: Record<string, any> = {};

    // Issue番号抽出
    const issueMatch = message.match(/#(\d+)|issue\s+(\d+)/i);
    if (issueMatch) {
      params.issueNumber = parseInt(issueMatch[1] || issueMatch[2]);
    } else if (context.currentIssue) {
      params.issueNumber = context.currentIssue;
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

### 3. SessionManager 実装

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
  currentIssue?: number;
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

### 4. AgentRouter 実装

```typescript
// src/services/agent-router.ts

export class AgentRouter {
  private reviewAgent: ReviewAgent;
  private testAgent: TestAgent;
  private deploymentAgent: DeploymentAgent;
  private monitoringAgent: MonitoringAgent;
  private planningAgent: PlanningAgent;
  private codeGenAgent: CodeGenAgent;

  constructor(config: AgentConfig) {
    this.reviewAgent = new ReviewAgent(config);
    this.testAgent = new TestAgent(config);
    this.deploymentAgent = new DeploymentAgent(config);
    this.monitoringAgent = new MonitoringAgent(config);
    this.planningAgent = new PlanningAgent(config);
    this.codeGenAgent = new CodeGenAgent(config);
  }

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
    const codeGenContext = session.context.lastCodeGenContext;

    if (!codeGenContext) {
      throw new Error('コードが生成されていません。先にコード生成を実行してください。');
    }

    return await this.reviewAgent.execute(
      intent.parameters.issueNumber || session.currentIssue || 0,
      codeGenContext
    );
  }

  private async executeTest(intent: Intent, session: ChatSession): Promise<AgentResult<TestContext>> {
    const reviewContext = session.context.lastReviewContext;

    if (!reviewContext) {
      throw new Error('レビューが完了していません。先にレビューを実行してください。');
    }

    return await this.testAgent.execute(
      intent.parameters.issueNumber || session.currentIssue || 0,
      reviewContext.codeGenContext,
      reviewContext
    );
  }

  private async executeDeploy(intent: Intent, session: ChatSession): Promise<AgentResult<DeploymentContext>> {
    const testContext = session.context.lastTestContext;

    if (!testContext || !testContext.overallSuccess) {
      throw new Error('テストが通過していません。先にテストを実行してください。');
    }

    return await this.deploymentAgent.execute(
      intent.parameters.issueNumber || session.currentIssue || 0,
      testContext.codeGenContext,
      testContext.reviewContext,
      testContext,
      { environment: intent.parameters.environment || 'staging' }
    );
  }

  // ... 他のメソッド
}
```

### 5. Claude Code統合（/lunaコマンド）

```typescript
// .claude/commands/luna.ts

import { ChatAgent } from '../../src/agents/chat-agent';

export const lunaCommand = {
  name: 'luna',
  description: 'Luna AIエージェントと対話',
  handler: async (args: string[], context: any) => {
    const chatAgent = new ChatAgent({
      githubToken: process.env.GITHUB_TOKEN || '',
      repository: process.env.GITHUB_REPOSITORY || '',
      verbose: true,
      dryRun: false,
    });

    const sessionId = context.sessionId || 'default';
    const userMessage = args.join(' ');

    if (!userMessage) {
      console.log('使用例: /luna このコードをレビューして');
      return;
    }

    try {
      const response = await chatAgent.chat(userMessage, sessionId);

      console.log('\n' + response.message + '\n');

      if (response.suggestedActions && response.suggestedActions.length > 0) {
        console.log('次にできること:');
        response.suggestedActions.forEach(action => {
          console.log(`  - ${action}`);
        });
      }
    } catch (error) {
      console.error('エラー:', (error as Error).message);
    }
  },
};
```

## ✅ Acceptance Criteria

- [ ] ChatAgent 実装完了
- [ ] IntentParser 実装完了（パターンマッチング版）
- [ ] SessionManager 実装完了
- [ ] AgentRouter 実装完了
- [ ] `/luna` コマンド実装完了
- [ ] 以下の対話が動作する:
  - [ ] `/luna レビューして` → ReviewAgent実行
  - [ ] `/luna テストして` → TestAgent実行
  - [ ] `/luna デプロイして` → DeploymentAgent実行
- [ ] セッションが保持され、連続した会話ができる
- [ ] 前回の実行結果を参照して次のアクションが実行される
- [ ] TypeScript ビルドが成功する
- [ ] テストコード作成（chat-agent.test.ts）
- [ ] ドキュメント更新

## 🔗 関連Issue

- Phase 2: #7 - 対話型Luna機能拡張（AI分類、会話フロー改善、MCP Server）
- Phase 3: #8 - 対話型Luna高度機能（並列実行、永続化、Web UI）

## 📚 参考資料

- `CONVERSATIONAL_LUNA_DESIGN.md` - 詳細設計ドキュメント
- 既存エージェント: ReviewAgent, TestAgent, DeploymentAgent, MonitoringAgent

## 優先度

**P1 - High**: 対話型インターフェースの基盤。Phase 1実装で基本的な対話機能を確立。

---

**推定工数**: 2-3週間
**Phase**: Conversational Luna Phase 1
