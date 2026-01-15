# [P2] 対話型Luna機能拡張 - AI分類 + 会話フロー改善 + MCP Server (Phase 2)

## 📋 概要

Phase 1の基礎実装の上に、より高度な対話機能を追加します。AIベースのインテント分類、会話フローの改善、MCP Server対応により、より自然で柔軟な対話体験を実現します。

**前提条件**: Phase 1（Issue #6）が完了していること

## 🎯 Phase 2で追加する機能

### 1. AIベースのインテント分類

パターンマッチングの代わりに、Claude APIを使ってインテントを分類します。

**利点**:
- より多様な表現を理解できる
- パラメータ抽出の精度向上
- 曖昧な指示にも対応可能

**例**:
```
User: "さっき生成したコードって大丈夫かな？ちょっと心配"
→ Intent: review (パターンマッチングでは判定不可)

User: "ユニットテストとカバレッジを確認したいんだけど"
→ Intent: test, parameters: { includeUnit: true, checkCoverage: true }
```

### 2. 会話フロー改善

- **確認ダイアログ**: 破壊的操作の前に確認
- **進捗報告**: 長時間実行時にリアルタイム進捗表示
- **エラーリカバリー**: エラー時に適切なガイダンスと代替案提示

**例**:
```
User: "本番環境にデプロイして"
Luna: "⚠️  本番環境へのデプロイは慎重に行う必要があります。確認事項:"
Luna: "  - レビュー: ✅ 通過"
Luna: "  - テスト: ✅ 通過"
Luna: "  - Staging検証: ❌ 未実施"
Luna: "Stagingでの検証を推奨しますが、本番環境にデプロイしますか？ (yes/no)"
```

### 3. MCP Server実装

Model Context Protocol (MCP) サーバーとしてLunaを実装し、Claude DesktopやClaude Codeから直接呼び出せるようにします。

**利点**:
- Claude Desktopからシームレスに利用可能
- 他のMCPツールと組み合わせ可能
- リモート実行対応

## 🚀 実装内容

### 1. AIベースのIntentParser

```typescript
// src/services/ai-intent-parser.ts

export class AIIntentParser extends IntentParser {
  private anthropic: Anthropic;

  constructor() {
    super();
    this.anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
  }

  /**
   * Claude APIを使ってインテントを抽出
   */
  async parse(userMessage: string, context: SessionContext): Promise<Intent> {
    const systemPrompt = `あなたはLunaというAI開発エージェントのインテント分類器です。
ユーザーの指示から、以下のインテントを判定してください：

- review: コードレビュー
- test: テスト実行
- deploy: デプロイ
- monitor: 監視・メトリクス確認
- plan: プランニング・意思決定
- codegen: コード生成
- query: 情報照会
- help: ヘルプ

また、パラメータ（Issue番号、ファイルパス、環境など）を抽出してください。

レスポンスはJSON形式で返してください：
{
  "intent": "review",
  "parameters": {
    "issueNumber": 123,
    "filePath": "src/example.ts"
  },
  "confidence": 0.95
}`;

    const message = await this.anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 1024,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: `ユーザーの指示: "${userMessage}"\n\n会話コンテキスト: ${JSON.stringify(context, null, 2)}`,
        },
      ],
    });

    const content = message.content[0];
    if (content.type === 'text') {
      const result = JSON.parse(content.text);
      return {
        type: result.intent,
        parameters: result.parameters || {},
        confidence: result.confidence || 0.8,
      };
    }

    // Fallback to pattern matching
    return await super.parse(userMessage, context);
  }
}
```

### 2. 会話フロー改善

```typescript
// src/services/conversation-manager.ts

export class ConversationManager {
  /**
   * 破壊的操作の前に確認
   */
  async confirmDestructiveAction(
    action: string,
    checks: Array<{ label: string; passed: boolean; message?: string }>
  ): Promise<boolean> {
    console.log(`\n⚠️  ${action}は慎重に行う必要があります。確認事項:\n`);

    for (const check of checks) {
      const icon = check.passed ? '✅' : '❌';
      console.log(`  ${icon} ${check.label}${check.message ? ': ' + check.message : ''}`);
    }

    const allPassed = checks.every(c => c.passed);
    if (!allPassed) {
      console.log('\n⚠️  一部のチェックが通過していません。続行しますか？');
    }

    // TODO: ユーザー入力を受け取る実装
    return true; // デモでは常にtrue
  }

  /**
   * 進捗報告
   */
  async reportProgress(message: string, progress: number): Promise<void> {
    const barLength = 30;
    const filledLength = Math.floor((progress / 100) * barLength);
    const bar = '█'.repeat(filledLength) + '░'.repeat(barLength - filledLength);
    console.log(`\r${message} [${bar}] ${progress}%`);
  }

  /**
   * エラーリカバリー
   */
  async handleError(error: Error, context: ChatSession): Promise<ChatResponse> {
    console.error(`\n❌ エラー: ${error.message}\n`);

    // エラーに基づいて代替案を提案
    const suggestions = this.generateSuggestions(error, context);

    return {
      message: `エラーが発生しました: ${error.message}`,
      suggestedActions: suggestions,
    };
  }

  private generateSuggestions(error: Error, context: ChatSession): string[] {
    const suggestions: string[] = [];

    if (error.message.includes('コードが生成されていません')) {
      suggestions.push('まずコード生成を実行してください: /luna コード生成');
    }

    if (error.message.includes('レビューが完了していません')) {
      suggestions.push('まずレビューを実行してください: /luna レビュー');
    }

    if (error.message.includes('テストが通過していません')) {
      suggestions.push('まずテストを実行してください: /luna テスト');
    }

    return suggestions;
  }
}
```

### 3. MCP Server実装

```typescript
// src/mcp/luna-server.ts

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { ChatAgent } from '../agents/chat-agent.js';

const server = new Server(
  {
    name: 'luna',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// ツール定義
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'luna_review',
        description: 'コードレビューを実行します',
        inputSchema: {
          type: 'object',
          properties: {
            issueNumber: {
              type: 'number',
              description: 'GitHub Issue番号',
            },
          },
        },
      },
      {
        name: 'luna_test',
        description: 'テストを実行します',
        inputSchema: {
          type: 'object',
          properties: {
            issueNumber: {
              type: 'number',
              description: 'GitHub Issue番号',
            },
          },
        },
      },
      {
        name: 'luna_deploy',
        description: 'デプロイを実行します',
        inputSchema: {
          type: 'object',
          properties: {
            issueNumber: {
              type: 'number',
              description: 'GitHub Issue番号',
            },
            environment: {
              type: 'string',
              enum: ['development', 'staging', 'production'],
              description: 'デプロイ先環境',
            },
          },
        },
      },
      {
        name: 'luna_monitor',
        description: 'システム監視とメトリクス確認を実行します',
        inputSchema: {
          type: 'object',
          properties: {
            issueNumber: {
              type: 'number',
              description: 'GitHub Issue番号',
            },
          },
        },
      },
      {
        name: 'luna_chat',
        description: 'Lunaと自然言語で対話します',
        inputSchema: {
          type: 'object',
          properties: {
            message: {
              type: 'string',
              description: 'ユーザーのメッセージ',
            },
          },
          required: ['message'],
        },
      },
    ],
  };
});

// ツール実行
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  const chatAgent = new ChatAgent({
    githubToken: process.env.GITHUB_TOKEN || '',
    repository: process.env.GITHUB_REPOSITORY || '',
    verbose: true,
    dryRun: false,
  });

  try {
    let response: ChatResponse;

    if (name === 'luna_chat') {
      // 自然言語メッセージを直接処理
      response = await chatAgent.chat(args.message, 'mcp-session');
    } else {
      // ツール名から自然言語メッセージを生成
      const messageMap: Record<string, string> = {
        luna_review: 'コードレビューを実行してください',
        luna_test: 'テストを実行してください',
        luna_deploy: `${args.environment || 'staging'}環境にデプロイしてください`,
        luna_monitor: 'システム監視を実行してください',
      };

      const message = messageMap[name] || name;
      response = await chatAgent.chat(message, 'mcp-session');
    }

    return {
      content: [
        {
          type: 'text',
          text: response.message,
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `エラー: ${(error as Error).message}`,
        },
      ],
      isError: true,
    };
  }
});

// サーバー起動
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Luna MCP Server running on stdio');
}

main().catch((error) => {
  console.error('Server error:', error);
  process.exit(1);
});
```

### 4. MCP設定ファイル

```json
// mcp-config.json
{
  "mcpServers": {
    "luna": {
      "command": "node",
      "args": ["dist/mcp/luna-server.js"],
      "env": {
        "GITHUB_TOKEN": "${GITHUB_TOKEN}",
        "GITHUB_REPOSITORY": "${GITHUB_REPOSITORY}",
        "ANTHROPIC_API_KEY": "${ANTHROPIC_API_KEY}"
      }
    }
  }
}
```

## ✅ Acceptance Criteria

- [ ] AIIntentParser 実装完了
- [ ] Claude APIによるインテント分類が動作する
- [ ] ConversationManager 実装完了
- [ ] 破壊的操作前の確認ダイアログが表示される
- [ ] 進捗報告が表示される
- [ ] エラー時に適切なガイダンスが表示される
- [ ] MCP Server 実装完了
- [ ] Claude DesktopからLunaが呼び出せる
- [ ] MCP経由で全てのエージェント機能が使える
- [ ] TypeScript ビルドが成功する
- [ ] テストコード作成
- [ ] ドキュメント更新

## 🔗 関連Issue

- Issue #6: 対話型Luna Phase 1（前提条件）
- Issue #8: 対話型Luna Phase 3（並列実行、永続化、Web UI）

## 📚 参考資料

- `CONVERSATIONAL_LUNA_DESIGN.md` - 詳細設計ドキュメント
- Model Context Protocol: https://modelcontextprotocol.io/

## 優先度

**P2 - Medium**: Phase 1の完了後に実装。より高度な対話体験を実現。

---

**推定工数**: 2-3週間
**Phase**: Conversational Luna Phase 2
