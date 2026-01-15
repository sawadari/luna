/**
 * IssueAgent - GitHub Issue 分析・管理エージェント
 */

import { Octokit } from '@octokit/rest';
import { AgentConfig, AgentResult } from '../types/index';
import {
  Issue,
  IssueAnalysisResult,
  IssueStatistics,
  CreateIssueInput,
  SearchIssuesInput,
  IssueLabel,
  IssuePriority,
  IssueType,
  IssuePhase,
} from '../types/issue';

export interface IssueAgentConfig extends AgentConfig {
  repository: string;
}

export class IssueAgent {
  private config: IssueAgentConfig;
  private octokit: Octokit;
  private owner: string;
  private repo: string;

  constructor(config: IssueAgentConfig) {
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
      console.log(`[${new Date().toISOString()}] [IssueAgent] ${message}`);
    }
  }

  async createIssue(input: CreateIssueInput): Promise<AgentResult<Issue>> {
    const startTime = Date.now();
    this.log(`Creating issue: ${input.title}`);

    try {
      if (this.config.dryRun) {
        this.log('[DRY RUN] Would create issue');
        return {
          status: 'success',
          data: {
            number: 999,
            title: input.title,
            body: input.body,
            state: 'open',
            labels: [],
            assignees: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            url: 'https://api.github.com/repos/example/repo/issues/999',
            htmlUrl: 'https://github.com/example/repo/issues/999',
          } as Issue,
          metrics: { durationMs: Date.now() - startTime, timestamp: new Date().toISOString() },
        };
      }

      const response = await this.octokit.issues.create({
        owner: this.owner,
        repo: this.repo,
        title: input.title,
        body: input.body,
        labels: input.labels,
        assignees: input.assignees,
        milestone: input.milestone,
      });

      const issue = this.mapGitHubIssueToIssue(response.data);
      this.log(`Issue created: #${issue.number}`);

      return {
        status: 'success',
        data: issue,
        metrics: { durationMs: Date.now() - startTime, timestamp: new Date().toISOString() },
      };
    } catch (error) {
      this.log(`Failed to create issue: ${error}`);
      return {
        status: 'error',
        error: error as Error,
        metrics: { durationMs: Date.now() - startTime, timestamp: new Date().toISOString() },
      };
    }
  }

  async getIssue(issueNumber: number): Promise<AgentResult<Issue>> {
    const startTime = Date.now();
    this.log(`Getting issue #${issueNumber}`);

    try {
      const response = await this.octokit.issues.get({
        owner: this.owner,
        repo: this.repo,
        issue_number: issueNumber,
      });

      const issue = this.mapGitHubIssueToIssue(response.data);
      this.log(`Issue retrieved: #${issue.number}`);

      return {
        status: 'success',
        data: issue,
        metrics: { durationMs: Date.now() - startTime, timestamp: new Date().toISOString() },
      };
    } catch (error) {
      this.log(`Failed to get issue: ${error}`);
      return {
        status: 'error',
        error: error as Error,
        metrics: { durationMs: Date.now() - startTime, timestamp: new Date().toISOString() },
      };
    }
  }

  async searchIssues(input: SearchIssuesInput): Promise<AgentResult<Issue[]>> {
    const startTime = Date.now();
    this.log('Searching issues');

    try {
      const response = await this.octokit.issues.listForRepo({
        owner: this.owner,
        repo: this.repo,
        state: input.state || 'open',
        labels: input.labels?.join(','),
        assignee: input.assignee,
        milestone: input.milestone,
        since: input.since,
        per_page: input.limit || 100,
      });

      const issues = response.data.map((issue) => this.mapGitHubIssueToIssue(issue));
      this.log(`Found ${issues.length} issues`);

      return {
        status: 'success',
        data: issues,
        metrics: { durationMs: Date.now() - startTime, timestamp: new Date().toISOString() },
      };
    } catch (error) {
      this.log(`Failed to search issues: ${error}`);
      return {
        status: 'error',
        error: error as Error,
        metrics: { durationMs: Date.now() - startTime, timestamp: new Date().toISOString() },
      };
    }
  }

  async getIssueStatistics(): Promise<AgentResult<IssueStatistics>> {
    const startTime = Date.now();
    this.log('Getting issue statistics');

    try {
      const allIssuesResult = await this.searchIssues({ limit: 1000 });
      if (allIssuesResult.status !== 'success' || !allIssuesResult.data) {
        return {
          status: 'error',
          error: new Error('Failed to get issues'),
          metrics: { durationMs: Date.now() - startTime, timestamp: new Date().toISOString() },
        };
      }

      const allIssues = allIssuesResult.data;
      const openIssues = allIssues.filter((i) => i.state === 'open');
      const closedIssues = allIssues.filter((i) => i.state === 'closed');

      const byPriority: Record<IssuePriority, number> = {
        'P0-Critical': 0,
        'P1-High': 0,
        'P2-Medium': 0,
        'P3-Low': 0,
      };

      const byType: Record<IssueType, number> = {
        bug: 0,
        feature: 0,
        refactor: 0,
        docs: 0,
        test: 0,
        chore: 0,
        security: 0,
      };

      const byPhase: Record<IssuePhase, number> = {
        planning: 0,
        design: 0,
        implementation: 0,
        testing: 0,
        deployment: 0,
      };

      for (const issue of allIssues) {
        const priority = this.extractPriorityFromLabels(issue.labels);
        if (priority) byPriority[priority]++;

        const type = this.extractTypeFromLabels(issue.labels);
        if (type) byType[type]++;

        const phase = this.extractPhaseFromLabels(issue.labels);
        if (phase) byPhase[phase]++;
      }

      let totalCloseTime = 0;
      let closedCount = 0;
      for (const issue of closedIssues) {
        if (issue.closedAt) {
          const created = new Date(issue.createdAt);
          const closed = new Date(issue.closedAt);
          const diff = closed.getTime() - created.getTime();
          totalCloseTime += diff;
          closedCount++;
        }
      }
      const averageTimeToClose = closedCount > 0 ? totalCloseTime / closedCount / (1000 * 60 * 60) : 0;

      const stats: IssueStatistics = {
        totalIssues: allIssues.length,
        openIssues: openIssues.length,
        closedIssues: closedIssues.length,
        byPriority,
        byType,
        byPhase,
        averageTimeToClose,
        lastUpdated: new Date().toISOString(),
      };

      this.log('Issue statistics retrieved');

      return {
        status: 'success',
        data: stats,
        metrics: { durationMs: Date.now() - startTime, timestamp: new Date().toISOString() },
      };
    } catch (error) {
      this.log(`Failed to get issue statistics: ${error}`);
      return {
        status: 'error',
        error: error as Error,
        metrics: { durationMs: Date.now() - startTime, timestamp: new Date().toISOString() },
      };
    }
  }

  async analyzeIssue(input: { issueNumber: number }): Promise<AgentResult<IssueAnalysisResult>> {
    const startTime = Date.now();
    this.log(`Analyzing issue #${input.issueNumber}`);

    try {
      const issueResult = await this.getIssue(input.issueNumber);
      if (issueResult.status !== 'success' || !issueResult.data) {
        return {
          status: 'error',
          error: new Error('Failed to get issue'),
          metrics: { durationMs: Date.now() - startTime, timestamp: new Date().toISOString() },
        };
      }

      const issue = issueResult.data;
      const priority = this.extractPriorityFromLabels(issue.labels);
      const type = this.extractTypeFromLabels(issue.labels);
      const phase = this.extractPhaseFromLabels(issue.labels);

      const analysisResult: IssueAnalysisResult = {
        issueNumber: input.issueNumber,
        priority,
        type,
        phase,
        complexity: undefined,
        effort: undefined,
        dependencies: [],
        blockedBy: [],
        relatedIssues: [],
        suggestedLabels: [],
        summary: `Issue #${input.issueNumber}: ${issue.title}`,
        recommendations: [],
      };

      this.log(`Issue analyzed: #${input.issueNumber}`);

      return {
        status: 'success',
        data: analysisResult,
        metrics: { durationMs: Date.now() - startTime, timestamp: new Date().toISOString() },
      };
    } catch (error) {
      this.log(`Failed to analyze issue: ${error}`);
      return {
        status: 'error',
        error: error as Error,
        metrics: { durationMs: Date.now() - startTime, timestamp: new Date().toISOString() },
      };
    }
  }

  private mapGitHubIssueToIssue(githubIssue: any): Issue {
    return {
      number: githubIssue.number,
      title: githubIssue.title,
      body: githubIssue.body,
      state: githubIssue.state,
      labels: githubIssue.labels.map((l: any) => ({
        name: l.name,
        description: l.description,
        color: l.color,
      })),
      assignees: githubIssue.assignees.map((a: any) => ({
        login: a.login,
        id: a.id,
      })),
      milestone: githubIssue.milestone
        ? {
            title: githubIssue.milestone.title,
            number: githubIssue.milestone.number,
            dueOn: githubIssue.milestone.due_on,
          }
        : undefined,
      createdAt: githubIssue.created_at,
      updatedAt: githubIssue.updated_at,
      closedAt: githubIssue.closed_at,
      url: githubIssue.url,
      htmlUrl: githubIssue.html_url,
    };
  }

  private extractPriorityFromLabels(labels: IssueLabel[]): IssuePriority | undefined {
    for (const label of labels) {
      if (label.name.includes('P0-Critical')) return 'P0-Critical';
      if (label.name.includes('P1-High')) return 'P1-High';
      if (label.name.includes('P2-Medium')) return 'P2-Medium';
      if (label.name.includes('P3-Low')) return 'P3-Low';
    }
    return undefined;
  }

  private extractTypeFromLabels(labels: IssueLabel[]): IssueType | undefined {
    for (const label of labels) {
      if (label.name.includes('type:bug')) return 'bug';
      if (label.name.includes('type:feature')) return 'feature';
      if (label.name.includes('type:refactor')) return 'refactor';
      if (label.name.includes('type:docs')) return 'docs';
      if (label.name.includes('type:test')) return 'test';
      if (label.name.includes('type:chore')) return 'chore';
      if (label.name.includes('type:security')) return 'security';
    }
    return undefined;
  }

  private extractPhaseFromLabels(labels: IssueLabel[]): IssuePhase | undefined {
    for (const label of labels) {
      if (label.name.includes('phase:planning')) return 'planning';
      if (label.name.includes('phase:design')) return 'design';
      if (label.name.includes('phase:implementation')) return 'implementation';
      if (label.name.includes('phase:testing')) return 'testing';
      if (label.name.includes('phase:deployment')) return 'deployment';
    }
    return undefined;
  }
}
