/**
 * PRAgent - GitHub Pull Request レビュー・管理エージェント
 */

import { Octokit } from '@octokit/rest';
import { AgentConfig, AgentResult } from '../types/index';
import {
  PullRequest,
  PRReviewResult,
  PRStatistics,
  PRQualityMetrics,
  CreatePRInput,
  SearchPRsInput,
  ReviewPRInput,
  MergePRInput,
  PRReviewIssue,
  PRReviewDecision,
} from '../types/pr';

export interface PRAgentConfig extends AgentConfig {
  repository: string;
}

export class PRAgent {
  private config: PRAgentConfig;
  private octokit: Octokit;
  private owner: string;
  private repo: string;

  constructor(config: PRAgentConfig) {
    this.config = config;
    this.octokit = new Octokit({
      auth: config.githubToken || process.env.GITHUB_TOKEN,
    });

    const [owner, repo] = config.repository.split('/');
    if (!owner || !repo) {
      throw new Error('Invalid repository format. Expected: "owner/repo"');
    }
    this.owner = owner;
    this.repo = repo;
  }

  private log(message: string): void {
    if (this.config.verbose) {
      console.log(`[${new Date().toISOString()}] [PRAgent] ${message}`);
    }
  }

  // ==========================================================================
  // PR CRUD Operations
  // ==========================================================================

  async createPR(input: CreatePRInput): Promise<AgentResult<PullRequest>> {
    const startTime = Date.now();
    this.log(`Creating PR: ${input.title}`);

    try {
      if (this.config.dryRun) {
        this.log('[DRY RUN] Would create PR');
        return {
          status: 'success',
          data: {
            number: 999,
            title: input.title,
            body: input.body,
            state: 'open',
            draft: input.draft || false,
            labels: [],
            assignees: [],
            reviewers: [],
            headBranch: input.head,
            baseBranch: input.base,
            headSha: 'abc123',
            mergeable: true,
            mergeableState: 'mergeable',
            merged: false,
            additions: 0,
            deletions: 0,
            changedFiles: 0,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            url: 'https://api.github.com/repos/example/repo/pulls/999',
            htmlUrl: 'https://github.com/example/repo/pull/999',
          } as PullRequest,
          metrics: { durationMs: Date.now() - startTime, timestamp: new Date().toISOString() },
        };
      }

      const response = await this.octokit.pulls.create({
        owner: this.owner,
        repo: this.repo,
        title: input.title,
        body: input.body,
        head: input.head,
        base: input.base,
        draft: input.draft,
      });

      // ラベル・アサイニー・レビュワーを設定
      if (input.labels && input.labels.length > 0) {
        await this.octokit.issues.addLabels({
          owner: this.owner,
          repo: this.repo,
          issue_number: response.data.number,
          labels: input.labels,
        });
      }

      if (input.assignees && input.assignees.length > 0) {
        await this.octokit.issues.addAssignees({
          owner: this.owner,
          repo: this.repo,
          issue_number: response.data.number,
          assignees: input.assignees,
        });
      }

      if (input.reviewers && input.reviewers.length > 0) {
        await this.octokit.pulls.requestReviewers({
          owner: this.owner,
          repo: this.repo,
          pull_number: response.data.number,
          reviewers: input.reviewers,
        });
      }

      const pr = this.mapGitHubPRToPR(response.data);
      this.log(`PR created: #${pr.number}`);

      return {
        status: 'success',
        data: pr,
        metrics: { durationMs: Date.now() - startTime, timestamp: new Date().toISOString() },
      };
    } catch (error) {
      this.log(`Failed to create PR: ${error}`);
      return {
        status: 'error',
        error: error as Error,
        metrics: { durationMs: Date.now() - startTime, timestamp: new Date().toISOString() },
      };
    }
  }

  async getPR(prNumber: number): Promise<AgentResult<PullRequest>> {
    const startTime = Date.now();
    this.log(`Getting PR #${prNumber}`);

    try {
      const response = await this.octokit.pulls.get({
        owner: this.owner,
        repo: this.repo,
        pull_number: prNumber,
      });

      const pr = this.mapGitHubPRToPR(response.data);
      this.log(`PR retrieved: #${pr.number}`);

      return {
        status: 'success',
        data: pr,
        metrics: { durationMs: Date.now() - startTime, timestamp: new Date().toISOString() },
      };
    } catch (error) {
      this.log(`Failed to get PR: ${error}`);
      return {
        status: 'error',
        error: error as Error,
        metrics: { durationMs: Date.now() - startTime, timestamp: new Date().toISOString() },
      };
    }
  }

  async searchPRs(input: SearchPRsInput): Promise<AgentResult<PullRequest[]>> {
    const startTime = Date.now();
    this.log('Searching PRs');

    try {
      const response = await this.octokit.pulls.list({
        owner: this.owner,
        repo: this.repo,
        state: input.state || 'open',
        base: input.base,
        head: input.head,
        sort: input.sort || 'created',
        per_page: input.limit || 100,
      });

      const prs = response.data.map((pr) => this.mapGitHubPRToPR(pr));
      this.log(`Found ${prs.length} PRs`);

      return {
        status: 'success',
        data: prs,
        metrics: { durationMs: Date.now() - startTime, timestamp: new Date().toISOString() },
      };
    } catch (error) {
      this.log(`Failed to search PRs: ${error}`);
      return {
        status: 'error',
        error: error as Error,
        metrics: { durationMs: Date.now() - startTime, timestamp: new Date().toISOString() },
      };
    }
  }

  // ==========================================================================
  // PR Review
  // ==========================================================================

  async reviewPR(input: ReviewPRInput): Promise<AgentResult<PRReviewResult>> {
    const startTime = Date.now();
    this.log(`Reviewing PR #${input.prNumber}`);

    try {
      if (this.config.dryRun) {
        this.log('[DRY RUN] Would review PR');
        return {
          status: 'success',
          data: {
            prNumber: input.prNumber,
            decision: 'APPROVED',
            qualityScore: 85,
            issues: [],
            recommendations: [],
            autoMergeable: true,
            estimatedReviewTime: 15,
          } as PRReviewResult,
          metrics: { durationMs: Date.now() - startTime, timestamp: new Date().toISOString() },
        };
      }

      // PRを取得
      const prResult = await this.getPR(input.prNumber);
      if (prResult.status !== 'success' || !prResult.data) {
        return {
          status: 'error',
          error: new Error('Failed to get PR'),
          metrics: { durationMs: Date.now() - startTime, timestamp: new Date().toISOString() },
        };
      }

      const pr = prResult.data;

      // 品質メトリクスを計算（将来の拡張用）
      await this.calculateQualityMetrics(input.prNumber);

      // レビュー判定
      const issues: PRReviewIssue[] = [];
      const recommendations: string[] = [];

      // サイズチェック
      if (pr.changedFiles > 20) {
        issues.push({
          severity: 'medium',
          category: 'quality',
          message: `Large PR: ${pr.changedFiles} files changed. Consider splitting into smaller PRs.`,
        });
        recommendations.push('Split into smaller PRs for easier review');
      }

      if (pr.additions + pr.deletions > 1000) {
        issues.push({
          severity: 'medium',
          category: 'quality',
          message: `Large changeset: ${pr.additions + pr.deletions} lines changed.`,
        });
      }

      // マージ可能性チェック
      if (!pr.mergeable) {
        issues.push({
          severity: 'high',
          category: 'quality',
          message: 'PR has merge conflicts. Resolve conflicts before merging.',
        });
        recommendations.push('Resolve merge conflicts');
      }

      // 品質スコア計算
      let qualityScore = 100;
      for (const issue of issues) {
        if (issue.severity === 'critical') qualityScore -= 30;
        else if (issue.severity === 'high') qualityScore -= 20;
        else if (issue.severity === 'medium') qualityScore -= 10;
        else if (issue.severity === 'low') qualityScore -= 5;
      }
      qualityScore = Math.max(0, qualityScore);

      // 判定
      let decision: PRReviewDecision = 'APPROVED';
      const autoMergeable = issues.filter((i) => i.severity === 'critical' || i.severity === 'high').length === 0 && qualityScore >= 70;

      if (qualityScore < 50) {
        decision = 'CHANGES_REQUESTED';
      } else if (qualityScore < 70) {
        decision = 'REVIEW_REQUIRED';
      }

      // レビューを投稿（オプション）
      if (input.event && input.body) {
        await this.octokit.pulls.createReview({
          owner: this.owner,
          repo: this.repo,
          pull_number: input.prNumber,
          event: input.event,
          body: input.body,
          comments: input.comments,
        });
      }

      const reviewResult: PRReviewResult = {
        prNumber: input.prNumber,
        decision,
        qualityScore,
        issues,
        recommendations,
        autoMergeable,
        estimatedReviewTime: Math.ceil((pr.additions + pr.deletions) / 100) + 5,
      };

      this.log(`PR reviewed: #${input.prNumber}, score: ${qualityScore}`);

      return {
        status: 'success',
        data: reviewResult,
        metrics: { durationMs: Date.now() - startTime, timestamp: new Date().toISOString() },
      };
    } catch (error) {
      this.log(`Failed to review PR: ${error}`);
      return {
        status: 'error',
        error: error as Error,
        metrics: { durationMs: Date.now() - startTime, timestamp: new Date().toISOString() },
      };
    }
  }

  async mergePR(input: MergePRInput): Promise<AgentResult<PullRequest>> {
    const startTime = Date.now();
    this.log(`Merging PR #${input.prNumber}`);

    try {
      if (this.config.dryRun) {
        this.log('[DRY RUN] Would merge PR');
        return await this.getPR(input.prNumber);
      }

      await this.octokit.pulls.merge({
        owner: this.owner,
        repo: this.repo,
        pull_number: input.prNumber,
        merge_method: input.mergeMethod || 'merge',
        commit_title: input.commitTitle,
        commit_message: input.commitMessage,
      });

      this.log(`PR merged: #${input.prNumber}`);

      return await this.getPR(input.prNumber);
    } catch (error) {
      this.log(`Failed to merge PR: ${error}`);
      return {
        status: 'error',
        error: error as Error,
        metrics: { durationMs: Date.now() - startTime, timestamp: new Date().toISOString() },
      };
    }
  }

  // ==========================================================================
  // PR Statistics
  // ==========================================================================

  async getPRStatistics(): Promise<AgentResult<PRStatistics>> {
    const startTime = Date.now();
    this.log('Getting PR statistics');

    try {
      const allPRsResult = await this.searchPRs({ limit: 1000 });
      if (allPRsResult.status !== 'success' || !allPRsResult.data) {
        return {
          status: 'error',
          error: new Error('Failed to get PRs'),
          metrics: { durationMs: Date.now() - startTime, timestamp: new Date().toISOString() },
        };
      }

      const allPRs = allPRsResult.data;
      const openPRs = allPRs.filter((p) => p.state === 'open');
      const closedPRs = allPRs.filter((p) => p.state === 'closed');
      const mergedPRs = allPRs.filter((p) => p.merged);

      // 平均マージ時間
      let totalMergeTime = 0;
      let mergedCount = 0;
      for (const pr of mergedPRs) {
        if (pr.mergedAt) {
          const created = new Date(pr.createdAt);
          const merged = new Date(pr.mergedAt);
          const diff = merged.getTime() - created.getTime();
          totalMergeTime += diff;
          mergedCount++;
        }
      }
      const averageTimeToMerge = mergedCount > 0 ? totalMergeTime / mergedCount / (1000 * 60 * 60) : 0;

      // マージ率
      const mergeRate = closedPRs.length > 0 ? (mergedPRs.length / closedPRs.length) * 100 : 0;

      const stats: PRStatistics = {
        totalPRs: allPRs.length,
        openPRs: openPRs.length,
        closedPRs: closedPRs.length,
        mergedPRs: mergedPRs.length,
        averageTimeToMerge,
        averageReviewTime: averageTimeToMerge * 0.7, // 推定
        mergeRate,
        lastUpdated: new Date().toISOString(),
      };

      this.log('PR statistics retrieved');

      return {
        status: 'success',
        data: stats,
        metrics: { durationMs: Date.now() - startTime, timestamp: new Date().toISOString() },
      };
    } catch (error) {
      this.log(`Failed to get PR statistics: ${error}`);
      return {
        status: 'error',
        error: error as Error,
        metrics: { durationMs: Date.now() - startTime, timestamp: new Date().toISOString() },
      };
    }
  }

  // ==========================================================================
  // Helper Methods
  // ==========================================================================

  private async calculateQualityMetrics(prNumber: number): Promise<PRQualityMetrics> {
    // 簡易実装：実際のチェック結果を取得
    try {
      const checks = await this.octokit.checks.listForRef({
        owner: this.owner,
        repo: this.repo,
        ref: `pull/${prNumber}/head`,
      });

      const passedChecks = checks.data.check_runs.filter((c) => c.conclusion === 'success').length;
      const failedChecks = checks.data.check_runs.filter((c) => c.conclusion === 'failure').length;
      const totalChecks = checks.data.check_runs.length;

      return {
        prNumber,
        additions: 0,
        deletions: 0,
        changedFiles: 0,
        complexity: 'medium',
        reviewCount: 0,
        approvalCount: 0,
        changesRequestedCount: 0,
        commentCount: 0,
        checksStatus: failedChecks > 0 ? 'failing' : passedChecks > 0 ? 'passing' : 'pending',
        passedChecks,
        failedChecks,
        totalChecks,
        overallScore: 75,
        codeQualityScore: 80,
        testCoverageScore: 70,
        documentationScore: 75,
      };
    } catch {
      return {
        prNumber,
        additions: 0,
        deletions: 0,
        changedFiles: 0,
        complexity: 'medium',
        reviewCount: 0,
        approvalCount: 0,
        changesRequestedCount: 0,
        commentCount: 0,
        checksStatus: 'pending',
        passedChecks: 0,
        failedChecks: 0,
        totalChecks: 0,
        overallScore: 70,
        codeQualityScore: 70,
        testCoverageScore: 70,
        documentationScore: 70,
      };
    }
  }

  private mapGitHubPRToPR(githubPR: any): PullRequest {
    return {
      number: githubPR.number,
      title: githubPR.title,
      body: githubPR.body,
      state: githubPR.state,
      draft: githubPR.draft,
      labels: githubPR.labels?.map((l: any) => ({
        name: l.name,
        description: l.description,
        color: l.color,
      })) || [],
      assignees: githubPR.assignees?.map((a: any) => ({
        login: a.login,
        id: a.id,
      })) || [],
      reviewers: githubPR.requested_reviewers?.map((r: any) => ({
        login: r.login,
        id: r.id,
      })) || [],
      headBranch: githubPR.head.ref,
      baseBranch: githubPR.base.ref,
      headSha: githubPR.head.sha,
      mergeable: githubPR.mergeable ?? true,
      mergeableState: githubPR.mergeable_state || 'unknown',
      merged: githubPR.merged || false,
      mergedAt: githubPR.merged_at,
      mergedBy: githubPR.merged_by?.login,
      additions: githubPR.additions || 0,
      deletions: githubPR.deletions || 0,
      changedFiles: githubPR.changed_files || 0,
      createdAt: githubPR.created_at,
      updatedAt: githubPR.updated_at,
      closedAt: githubPR.closed_at,
      url: githubPR.url,
      htmlUrl: githubPR.html_url,
    };
  }
}
