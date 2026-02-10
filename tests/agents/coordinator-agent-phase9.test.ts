import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CoordinatorAgent } from '../../src/agents/coordinator-agent';
import { ensureRulesConfigLoaded } from '../../src/services/rules-config-service';
import type { AgentConfig, GitHubIssue } from '../../src/types';
import type { CoordinationResult } from '../../src/types/coordinator';

function createIssue(): GitHubIssue {
  return {
    number: 52,
    title: 'Issue #52 test',
    body: 'test',
    labels: [{ name: 'type:feature', color: 'blue' }],
    state: 'open',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

function mockCoordinationResult(): Omit<CoordinationResult, 'continuousImprovement'> {
  return {
    issueNumber: 52,
    dag: {
      nodes: new Map(),
      edges: [],
      entryNodes: [],
      exitNodes: [],
    },
    executionPlan: {
      stages: [],
      totalEstimatedDuration: 10,
      criticalPath: [],
      criticalPathDuration: 10,
      parallelizationFactor: 1,
    },
    executedTasks: [],
    failedTasks: [],
    overallStatus: 'success',
    metrics: {
      totalTasks: 1,
      completedTasks: 1,
      failedTasks: 0,
      actualDuration: 1,
      estimatedDuration: 1,
      efficiencyRatio: 1,
    },
  };
}

describe('CoordinatorAgent Phase 9 integration (Issue #52)', () => {
  beforeEach(async () => {
    await ensureRulesConfigLoaded();
  });

  it('should execute Phase 9 in dry-run mode', async () => {
    const config: AgentConfig = {
      githubToken: 'test-token',
      repository: 'owner/repo',
      dryRun: true,
      verbose: false,
    };
    const agent = new CoordinatorAgent(config);

    (agent as any).destAgent.execute = vi.fn().mockResolvedValue({
      status: 'success',
      data: { al: 'AL2', rationale: 'ok' },
    });
    (agent as any).planningAgent.execute = vi.fn().mockResolvedValue({
      status: 'success',
      data: { planningData: null },
    });
    (agent as any).decomposeToDAG = vi.fn().mockResolvedValue(mockCoordinationResult().dag);
    (agent as any).analyzeCriticalPath = vi.fn().mockReturnValue({
      criticalPath: [],
      criticalPathDuration: 10,
      nodeAnalysis: new Map(),
    });
    (agent as any).generateExecutionPlan = vi.fn().mockReturnValue(mockCoordinationResult().executionPlan);
    (agent as any).executeTasks = vi.fn().mockResolvedValue({
      executedTasks: [],
      failedTasks: [],
    });
    (agent as any).continuousImprovementService.execute = vi.fn().mockResolvedValue({
      status: 'success',
      suggestions: [{ id: 'IMP-1' }],
      createdIssues: [],
      warnings: [],
      metrics: {
        generatedSuggestions: 1,
        createdIssues: 0,
        timestamp: new Date().toISOString(),
      },
    });

    const result = await agent.executeWithIssue(createIssue());

    expect(result.status).toBe('success');
    expect((agent as any).continuousImprovementService.execute).toHaveBeenCalledTimes(1);
    expect(result.data?.continuousImprovement?.metrics.generatedSuggestions).toBe(1);
    expect(result.data?.continuousImprovement?.metrics.createdIssues).toBe(0);
  });

  it('should execute Phase 9 in production mode and keep result', async () => {
    const config: AgentConfig = {
      githubToken: 'test-token',
      repository: 'owner/repo',
      dryRun: false,
      verbose: false,
    };
    const agent = new CoordinatorAgent(config);

    (agent as any).destAgent.execute = vi.fn().mockResolvedValue({
      status: 'success',
      data: { al: 'AL2', rationale: 'ok' },
    });
    (agent as any).planningAgent.execute = vi.fn().mockResolvedValue({
      status: 'success',
      data: { planningData: null },
    });
    (agent as any).ssotAgent.execute = vi.fn().mockResolvedValue({
      status: 'success',
      data: { suggestedKernels: [] },
    });
    (agent as any).decomposeToDAG = vi.fn().mockResolvedValue(mockCoordinationResult().dag);
    (agent as any).analyzeCriticalPath = vi.fn().mockReturnValue({
      criticalPath: [],
      criticalPathDuration: 10,
      nodeAnalysis: new Map(),
    });
    (agent as any).generateExecutionPlan = vi.fn().mockReturnValue(mockCoordinationResult().executionPlan);
    (agent as any).executeTasks = vi.fn().mockResolvedValue({
      executedTasks: [],
      failedTasks: [],
    });
    (agent as any).continuousImprovementService.execute = vi.fn().mockResolvedValue({
      status: 'success',
      suggestions: [{ id: 'IMP-1' }],
      createdIssues: [{ number: 9001, title: 'created' }],
      warnings: [],
      metrics: {
        generatedSuggestions: 1,
        createdIssues: 1,
        timestamp: new Date().toISOString(),
      },
    });
    (agent as any).postSummaryComment = vi.fn().mockResolvedValue(undefined);

    const result = await agent.executeWithIssue(createIssue());

    expect(result.status).toBe('success');
    expect((agent as any).continuousImprovementService.execute).toHaveBeenCalledTimes(1);
    expect(result.data?.continuousImprovement?.metrics.createdIssues).toBe(1);
    expect((agent as any).postSummaryComment).toHaveBeenCalledTimes(1);
  });
});

