/**
 * Pull Request Type Definitions
 * GitHub Pull Request 管理のための型定義
 */

import { IssueLabel } from './issue';

// =============================================================================
// PR Types
// =============================================================================

export type PRState = 'open' | 'closed';

export type PRMergeableState = 'mergeable' | 'conflicting' | 'unknown';

export type PRReviewDecision = 'APPROVED' | 'CHANGES_REQUESTED' | 'REVIEW_REQUIRED' | 'COMMENTED';

export interface PRReviewer {
  login: string;
  id: number;
}

export interface PRReview {
  id: number;
  user: string;
  state: 'APPROVED' | 'CHANGES_REQUESTED' | 'COMMENTED' | 'DISMISSED';
  body: string;
  submittedAt: string;
}

export interface PRComment {
  id: number;
  body: string;
  user: string;
  createdAt: string;
  path?: string;
  line?: number;
}

export interface PRFile {
  filename: string;
  status: 'added' | 'modified' | 'removed' | 'renamed';
  additions: number;
  deletions: number;
  changes: number;
  patch?: string;
}

export interface PRCheck {
  name: string;
  status: 'queued' | 'in_progress' | 'completed';
  conclusion?: 'success' | 'failure' | 'neutral' | 'cancelled' | 'timed_out' | 'action_required';
  completedAt?: string;
}

// =============================================================================
// Pull Request Definition
// =============================================================================

export interface PullRequest {
  number: number;
  title: string;
  body?: string;
  state: PRState;
  draft: boolean;
  labels: IssueLabel[];
  assignees: PRReviewer[];
  reviewers: PRReviewer[];

  // Branch info
  headBranch: string;
  baseBranch: string;
  headSha: string;

  // Merge info
  mergeable: boolean;
  mergeableState: PRMergeableState;
  merged: boolean;
  mergedAt?: string;
  mergedBy?: string;

  // Changes
  additions: number;
  deletions: number;
  changedFiles: number;

  // Metadata
  createdAt: string;
  updatedAt: string;
  closedAt?: string;
  url: string;
  htmlUrl: string;
}

// =============================================================================
// PR Review Result
// =============================================================================

export interface PRReviewResult {
  prNumber: number;
  decision: PRReviewDecision;
  qualityScore: number;        // 0-100
  issues: PRReviewIssue[];
  recommendations: string[];
  autoMergeable: boolean;
  estimatedReviewTime: number; // 分
}

export interface PRReviewIssue {
  severity: 'critical' | 'high' | 'medium' | 'low';
  category: 'security' | 'quality' | 'style' | 'performance' | 'test';
  message: string;
  file?: string;
  line?: number;
}

// =============================================================================
// PR Statistics
// =============================================================================

export interface PRStatistics {
  totalPRs: number;
  openPRs: number;
  closedPRs: number;
  mergedPRs: number;
  averageTimeToMerge: number;      // 時間
  averageReviewTime: number;       // 時間
  mergeRate: number;               // %
  lastUpdated: string;
}

// =============================================================================
// PR Agent Input/Output
// =============================================================================

export interface CreatePRInput {
  title: string;
  body?: string;
  head: string;                    // ブランチ名
  base: string;                    // ベースブランチ（例: "main"）
  draft?: boolean;
  labels?: string[];
  assignees?: string[];
  reviewers?: string[];
}

export interface UpdatePRInput {
  prNumber: number;
  title?: string;
  body?: string;
  state?: PRState;
  labels?: string[];
  assignees?: string[];
}

export interface ReviewPRInput {
  prNumber: number;
  reviewer: string;
  event?: 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT';
  body?: string;
  comments?: Array<{
    path: string;
    line: number;
    body: string;
  }>;
}

export interface MergePRInput {
  prNumber: number;
  mergeMethod?: 'merge' | 'squash' | 'rebase';
  commitTitle?: string;
  commitMessage?: string;
}

export interface SearchPRsInput {
  state?: PRState;
  labels?: string[];
  assignee?: string;
  reviewer?: string;
  base?: string;
  head?: string;
  sort?: 'created' | 'updated' | 'popularity' | 'long-running';
  limit?: number;
}

// =============================================================================
// PR Quality Metrics
// =============================================================================

export interface PRQualityMetrics {
  prNumber: number;

  // Size metrics
  additions: number;
  deletions: number;
  changedFiles: number;
  complexity: 'small' | 'medium' | 'large' | 'xlarge';

  // Review metrics
  reviewCount: number;
  approvalCount: number;
  changesRequestedCount: number;
  commentCount: number;

  // CI/CD metrics
  checksStatus: 'passing' | 'failing' | 'pending';
  passedChecks: number;
  failedChecks: number;
  totalChecks: number;

  // Quality score
  overallScore: number;         // 0-100
  codeQualityScore: number;     // 0-100
  testCoverageScore: number;    // 0-100
  documentationScore: number;   // 0-100
}
