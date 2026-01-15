/**
 * Issue Type Definitions
 * GitHub Issue 管理のための型定義
 */

// =============================================================================
// Issue Types
// =============================================================================

export type IssueState = 'open' | 'closed';

export type IssuePriority =
  | 'P0-Critical'
  | 'P1-High'
  | 'P2-Medium'
  | 'P3-Low';

export type IssueType =
  | 'bug'
  | 'feature'
  | 'refactor'
  | 'docs'
  | 'test'
  | 'chore'
  | 'security';

export type IssuePhase =
  | 'planning'
  | 'design'
  | 'implementation'
  | 'testing'
  | 'deployment';

export type IssueComplexity =
  | 'small'
  | 'medium'
  | 'large'
  | 'xlarge';

export type IssueEffort =
  | '1h'
  | '4h'
  | '1d'
  | '3d'
  | '1w'
  | '2w';

export interface IssueLabel {
  name: string;
  description?: string;
  color?: string;
}

export interface IssueMilestone {
  title: string;
  number: number;
  dueOn?: string;
}

export interface IssueAssignee {
  login: string;
  id: number;
}

export interface IssueComment {
  id: number;
  body: string;
  user: string;
  createdAt: string;
  updatedAt: string;
}

// =============================================================================
// Issue Definition
// =============================================================================

export interface Issue {
  number: number;
  title: string;
  body?: string;
  state: IssueState;
  labels: IssueLabel[];
  assignees: IssueAssignee[];
  milestone?: IssueMilestone;
  createdAt: string;
  updatedAt: string;
  closedAt?: string;
  url: string;
  htmlUrl: string;
}

// =============================================================================
// Issue Analysis Result
// =============================================================================

export interface IssueAnalysisResult {
  issueNumber: number;
  priority?: IssuePriority;
  type?: IssueType;
  phase?: IssuePhase;
  complexity?: IssueComplexity;
  effort?: IssueEffort;
  dependencies: number[];          // 依存するIssue番号
  blockedBy: number[];             // ブロックしているIssue番号
  relatedIssues: number[];         // 関連Issue番号
  suggestedLabels: IssueLabel[];
  summary: string;
  recommendations: string[];
}

// =============================================================================
// Issue Agent Input/Output
// =============================================================================

export interface CreateIssueInput {
  title: string;
  body?: string;
  labels?: string[];
  assignees?: string[];
  milestone?: number;
}

export interface UpdateIssueInput {
  issueNumber: number;
  title?: string;
  body?: string;
  labels?: string[];
  assignees?: string[];
  milestone?: number;
  state?: IssueState;
}

export interface CloseIssueInput {
  issueNumber: number;
  closeComment?: string;
}

export interface AnalyzeIssueInput {
  issueNumber: number;
  extractDependencies?: boolean;
  suggestLabels?: boolean;
}

export interface SearchIssuesInput {
  state?: IssueState;
  labels?: string[];
  assignee?: string;
  milestone?: string;
  since?: string;
  limit?: number;
}

export interface IssueStatistics {
  totalIssues: number;
  openIssues: number;
  closedIssues: number;
  byPriority: Record<IssuePriority, number>;
  byType: Record<IssueType, number>;
  byPhase: Record<IssuePhase, number>;
  averageTimeToClose: number;      // 平均クローズ時間（時間）
  lastUpdated: string;
}

// =============================================================================
// Label Management
// =============================================================================

export interface LabelRule {
  pattern: RegExp;                 // タイトル・本文のパターン
  label: string;                   // 付与するラベル
  priority: number;                // 優先度（高い方が優先）
}

export const DEFAULT_LABEL_RULES: LabelRule[] = [
  // Priority
  { pattern: /\[P0\]|critical|urgent|緊急/i, label: 'priority:P0-Critical', priority: 100 },
  { pattern: /\[P1\]|high|重要/i, label: 'priority:P1-High', priority: 90 },
  { pattern: /\[P2\]|medium|中程度/i, label: 'priority:P2-Medium', priority: 80 },
  { pattern: /\[P3\]|low|低/i, label: 'priority:P3-Low', priority: 70 },

  // Type
  { pattern: /bug|バグ|不具合|エラー|修正/i, label: 'type:bug', priority: 50 },
  { pattern: /feature|機能|追加|新規/i, label: 'type:feature', priority: 50 },
  { pattern: /refactor|リファクタ|改善/i, label: 'type:refactor', priority: 50 },
  { pattern: /doc|ドキュメント|document/i, label: 'type:docs', priority: 50 },
  { pattern: /test|テスト/i, label: 'type:test', priority: 50 },
  { pattern: /security|セキュリティ|脆弱性/i, label: 'type:security', priority: 50 },

  // Phase
  { pattern: /planning|計画|設計/i, label: 'phase:planning', priority: 40 },
  { pattern: /design|デザイン|UI/i, label: 'phase:design', priority: 40 },
  { pattern: /implement|実装|開発/i, label: 'phase:implementation', priority: 40 },
  { pattern: /test|テスト/i, label: 'phase:testing', priority: 40 },
  { pattern: /deploy|デプロイ|リリース/i, label: 'phase:deployment', priority: 40 },

  // Complexity
  { pattern: /xlarge|特大|very large/i, label: 'complexity:xlarge', priority: 30 },
  { pattern: /large|大きい/i, label: 'complexity:large', priority: 30 },
  { pattern: /medium|中程度/i, label: 'complexity:medium', priority: 30 },
  { pattern: /small|小さい|簡単/i, label: 'complexity:small', priority: 30 },
];
