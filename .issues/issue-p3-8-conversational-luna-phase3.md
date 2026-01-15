# [P3] 対話型Luna高度機能 - 並列実行 + 永続化 + Web UI (Phase 3)

## 📋 概要

Phase 2までの機能の上に、将来的な拡張機能を追加します。複数エージェントの並列実行、会話履歴の永続化、マルチユーザー対応、Web UIなど、プロダクションレベルの機能を実装します。

**前提条件**: Phase 2（Issue #7）が完了していること

## 🎯 Phase 3で追加する機能

### 1. 複数エージェントの並列実行

複数のエージェントを同時に実行し、結果を統合します。

**例**:
```
User: "レビューとテストを同時に実行して"
Luna: "レビューとテストを並列実行します..."
Luna: "✅ レビュー完了 (5秒)"
Luna: "✅ テスト完了 (8秒)"
Luna: "統合結果: 品質スコア85点、カバレッジ85.5%、全テスト通過"
```

### 2. 会話履歴の永続化

会話履歴をデータベースに保存し、セッションをまたいで参照できるようにします。

**利点**:
- セッションが切れても会話を継続できる
- 過去の実行結果を参照できる
- チーム内で会話履歴を共有できる

### 3. マルチユーザー対応

複数ユーザーが同時にLunaを利用できるようにします。

**機能**:
- ユーザー認証
- ユーザーごとのセッション管理
- 権限管理（Issue #5 State Transition Authorityと連携）

### 4. Web UI実装

ブラウザベースのUIでLunaと対話できるようにします。

**機能**:
- チャットインターフェース
- 実行結果の可視化（グラフ、表）
- セッション履歴の閲覧
- リアルタイム進捗表示

## 🚀 実装内容

### 1. 並列実行マネージャー

```typescript
// src/services/parallel-execution-manager.ts

export class ParallelExecutionManager {
  private agentRouter: AgentRouter;

  /**
   * 複数のインテントを並列実行
   */
  async executeParallel(intents: Intent[], session: ChatSession): Promise<AgentResult<any>[]> {
    const promises = intents.map(intent =>
      this.agentRouter.route(intent, session)
    );

    // 並列実行
    const results = await Promise.allSettled(promises);

    // 結果を集約
    return results.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        return {
          status: 'error',
          error: result.reason,
          metrics: {
            durationMs: 0,
            timestamp: new Date().toISOString(),
          },
        };
      }
    });
  }

  /**
   * 結果を統合
   */
  async aggregateResults(results: AgentResult<any>[]): Promise<ChatResponse> {
    const messages: string[] = [];
    let allSuccess = true;

    for (const result of results) {
      if (result.status === 'success') {
        messages.push(this.formatSuccessMessage(result));
      } else {
        messages.push(this.formatErrorMessage(result));
        allSuccess = false;
      }
    }

    return {
      message: messages.join('\n\n'),
      data: results,
      suggestedActions: allSuccess ? ['次のステップに進む'] : ['エラーを修正する'],
    };
  }
}
```

### 2. 永続化レイヤー

```typescript
// src/services/session-store.ts

import * as fs from 'fs/promises';
import * as path from 'path';

export class SessionStore {
  private storePath = 'sessions';

  /**
   * セッションを保存
   */
  async saveSession(session: ChatSession): Promise<void> {
    const sessionFile = path.join(this.storePath, `${session.id}.json`);
    await fs.mkdir(this.storePath, { recursive: true });
    await fs.writeFile(sessionFile, JSON.stringify(session, null, 2), 'utf-8');
  }

  /**
   * セッションを読み込み
   */
  async loadSession(sessionId: string): Promise<ChatSession | null> {
    const sessionFile = path.join(this.storePath, `${sessionId}.json`);

    try {
      const content = await fs.readFile(sessionFile, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      return null;
    }
  }

  /**
   * 全セッションを取得
   */
  async listSessions(userId: string): Promise<ChatSession[]> {
    const files = await fs.readdir(this.storePath);
    const sessions: ChatSession[] = [];

    for (const file of files) {
      if (file.endsWith('.json')) {
        const session = await this.loadSession(file.replace('.json', ''));
        if (session && session.userId === userId) {
          sessions.push(session);
        }
      }
    }

    return sessions.sort((a, b) =>
      new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime()
    );
  }

  /**
   * セッションを削除
   */
  async deleteSession(sessionId: string): Promise<void> {
    const sessionFile = path.join(this.storePath, `${sessionId}.json`);
    await fs.unlink(sessionFile);
  }
}
```

### 3. マルチユーザー対応

```typescript
// src/services/user-manager.ts

export interface User {
  id: string;
  name: string;
  email: string;
  roles: Role[];  // Issue #5 State Transition Authorityと連携
  createdAt: string;
}

export class UserManager {
  private users: Map<string, User> = new Map();

  /**
   * ユーザー認証
   */
  async authenticate(token: string): Promise<User | null> {
    // TODO: 実際の認証ロジック（JWT、OAuth等）
    return null;
  }

  /**
   * ユーザー登録
   */
  async registerUser(user: User): Promise<void> {
    this.users.set(user.id, user);
  }

  /**
   * ユーザー取得
   */
  async getUser(userId: string): Promise<User | null> {
    return this.users.get(userId) || null;
  }

  /**
   * ユーザーのセッション一覧取得
   */
  async getUserSessions(userId: string): Promise<ChatSession[]> {
    const sessionStore = new SessionStore();
    return await sessionStore.listSessions(userId);
  }
}
```

### 4. Web UI実装

#### バックエンド（Express）

```typescript
// src/web/server.ts

import express from 'express';
import { WebSocketServer } from 'ws';
import { ChatAgent } from '../agents/chat-agent';

const app = express();
const port = 3000;

app.use(express.json());
app.use(express.static('public'));

const chatAgent = new ChatAgent({
  githubToken: process.env.GITHUB_TOKEN || '',
  repository: process.env.GITHUB_REPOSITORY || '',
  verbose: true,
  dryRun: false,
});

// REST API
app.post('/api/chat', async (req, res) => {
  const { message, sessionId } = req.body;

  try {
    const response = await chatAgent.chat(message, sessionId);
    res.json(response);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

app.get('/api/sessions/:userId', async (req, res) => {
  const { userId } = req.params;
  const userManager = new UserManager();
  const sessions = await userManager.getUserSessions(userId);
  res.json(sessions);
});

// WebSocket（リアルタイム進捗）
const wss = new WebSocketServer({ port: 3001 });

wss.on('connection', (ws) => {
  console.log('WebSocket client connected');

  ws.on('message', async (message) => {
    const data = JSON.parse(message.toString());

    if (data.type === 'chat') {
      // 進捗をリアルタイムで送信
      ws.send(JSON.stringify({ type: 'progress', message: '処理開始...' }));

      const response = await chatAgent.chat(data.message, data.sessionId);

      ws.send(JSON.stringify({ type: 'response', data: response }));
    }
  });
});

app.listen(port, () => {
  console.log(`Luna Web UI server running on http://localhost:${port}`);
});
```

#### フロントエンド（React）

```typescript
// public/src/App.tsx

import React, { useState, useEffect } from 'react';

function App() {
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'luna'; content: string }>>([]);
  const [input, setInput] = useState('');
  const [sessionId] = useState(() => `session-${Date.now()}`);
  const [ws, setWs] = useState<WebSocket | null>(null);

  useEffect(() => {
    const websocket = new WebSocket('ws://localhost:3001');

    websocket.onmessage = (event) => {
      const data = JSON.parse(event.data);

      if (data.type === 'progress') {
        // 進捗表示
        console.log('Progress:', data.message);
      } else if (data.type === 'response') {
        setMessages((prev) => [
          ...prev,
          { role: 'luna', content: data.data.message },
        ]);
      }
    };

    setWs(websocket);

    return () => {
      websocket.close();
    };
  }, []);

  const sendMessage = () => {
    if (!input.trim() || !ws) return;

    setMessages((prev) => [...prev, { role: 'user', content: input }]);

    ws.send(JSON.stringify({
      type: 'chat',
      message: input,
      sessionId,
    }));

    setInput('');
  };

  return (
    <div className="app">
      <div className="chat-container">
        <div className="messages">
          {messages.map((msg, index) => (
            <div key={index} className={`message ${msg.role}`}>
              <strong>{msg.role === 'user' ? 'You' : 'Luna'}:</strong> {msg.content}
            </div>
          ))}
        </div>

        <div className="input-container">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
            placeholder="Lunaに指示を入力..."
          />
          <button onClick={sendMessage}>送信</button>
        </div>
      </div>
    </div>
  );
}

export default App;
```

## ✅ Acceptance Criteria

- [ ] ParallelExecutionManager 実装完了
- [ ] 複数エージェントを並列実行できる
- [ ] SessionStore 実装完了
- [ ] 会話履歴がファイルシステムに永続化される
- [ ] セッションをまたいで会話を継続できる
- [ ] UserManager 実装完了
- [ ] マルチユーザー対応が動作する
- [ ] Web UI 実装完了
  - [ ] Express サーバー
  - [ ] WebSocket リアルタイム通信
  - [ ] React フロントエンド
- [ ] ブラウザからLunaと対話できる
- [ ] リアルタイム進捗表示が動作する
- [ ] TypeScript ビルドが成功する
- [ ] テストコード作成
- [ ] ドキュメント更新

## 🔗 関連Issue

- Issue #6: 対話型Luna Phase 1
- Issue #7: 対話型Luna Phase 2
- Issue #5: State Transition Authority（ロールベースの権限管理と連携）

## 📚 参考資料

- `CONVERSATIONAL_LUNA_DESIGN.md` - 詳細設計ドキュメント
- Express.js: https://expressjs.com/
- React: https://react.dev/
- WebSocket: https://developer.mozilla.org/en-US/docs/Web/API/WebSocket

## 優先度

**P3 - Low**: Phase 2の完了後に実装。将来的な拡張機能。

---

**推定工数**: 3-4週間
**Phase**: Conversational Luna Phase 3
