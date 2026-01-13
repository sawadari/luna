# Workspaces

このディレクトリは、Lunaを使用した独自プロジェクトを作成するためのワークスペースです。

## 📦 新規プロジェクトの作成

```bash
# ワークスペースディレクトリに移動
cd workspaces

# 新規プロジェクトを作成
mkdir my-project
cd my-project

# package.json を初期化
npm init -y

# lunaを依存関係に追加
npm install luna --workspace=workspaces/my-project
```

## 📋 推奨プロジェクト構造

```
workspaces/
└── my-project/
    ├── src/
    │   └── index.ts
    ├── package.json
    ├── tsconfig.json
    └── README.md
```

## 🔧 package.json 例

```json
{
  "name": "@luna-workspace/my-project",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx src/index.ts",
    "build": "tsc"
  },
  "dependencies": {
    "luna": "*"
  },
  "devDependencies": {
    "@types/node": "^20.11.0",
    "tsx": "^4.7.0",
    "typescript": "^5.3.3"
  }
}
```

## 🌸 Lunaの機能を活用

Lunaのすべての機能をプロジェクトで使用できます：

- **DEST Theory**: AL0判定、Protocol適用
- **Planning Layer**: 意思決定管理、前提追跡
- **SSOT**: 真実の一元管理
- **Agents**: 自律型開発エージェント
  - CodeGenAgent: AI駆動コード生成
  - ReviewAgent: コード品質判定
  - TestAgent: 自動テスト実行
  - DeploymentAgent: 自動デプロイ
  - MonitoringAgent: システム監視

## 📚 参考資料

- [Examples](../examples/) - サンプルプロジェクト
- [Luna Documentation](../README.md)
- [CLAUDE.md](../CLAUDE.md) - Claude Codeとの連携
