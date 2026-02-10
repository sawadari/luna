import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ContinuousImprovementService } from '../../src/services/continuous-improvement-service';
import type { CoordinationResult, TaskDAG, ExecutionPlan } from '../../src/types/coordinator';
import type { MonitoringContext } from '../../src/types';

function createBaseResult(): CoordinationResult {
  const dag: TaskDAG = {
    nodes: new Map(),
    edges: [],
    entryNodes: [],
    exitNodes: [],
  };

  const executionPlan: ExecutionPlan = {
    stages: [],
    totalEstimatedDuration: 10,
    criticalPath: [],
    criticalPathDuration: 10,
    parallelizationFactor: 1,
  };

  return {
    issueNumber: 52,
    dag,
    executionPlan,
    executedTasks: [],
    failedTasks: [],
    overallStatus: 'success',
    metrics: {
      totalTasks: 10,
      completedTasks: 10,
      failedTasks: 0,
      actualDuration: 10,
      estimatedDuration: 10,
      efficiencyRatio: 1,
    },
  };
}

function createMonitoringContext(qualityScore: number, alertCount: number): MonitoringContext {
  return {
    issue: {
      number: 52,
      title: 'test',
      body: 'test',
      labels: [],
      state: 'open',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    deploymentContext: {
      issue: {
        number: 52,
        title: 'test',
        body: 'test',
        labels: [],
        state: 'open',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      codeGenContext: {
        issue: {
          number: 52,
          title: 'test',
          body: 'test',
          labels: [],
          state: 'open',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        analysis: {
          type: 'feature',
          complexity: 'small',
          language: 'typescript',
          requiresTests: true,
        },
        generatedCode: [],
        metrics: {
          overallScore: qualityScore,
          linesOfCode: 1,
          fileCount: 1,
          hasTests: true,
          hasDocumentation: false,
          complexity: 1,
          maintainability: 'medium',
        },
        timestamp: new Date().toISOString(),
      },
      reviewContext: {
        issue: {
          number: 52,
          title: 'test',
          body: 'test',
          labels: [],
          state: 'open',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        codeGenContext: {} as any,
        reviews: [],
        overallScore: qualityScore,
        passed: qualityScore >= 80,
        securityIssues: [],
        qualityIssues: [],
        timestamp: new Date().toISOString(),
      },
      testContext: {
        issue: {
          number: 52,
          title: 'test',
          body: 'test',
          labels: [],
          state: 'open',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        codeGenContext: {} as any,
        reviewContext: {} as any,
        testResults: [],
        coverage: {
          statements: { total: 1, covered: 1, percentage: 100 },
          branches: { total: 1, covered: 1, percentage: 100 },
          functions: { total: 1, covered: 1, percentage: 100 },
          lines: { total: 1, covered: 1, percentage: 100 },
        },
        overallPassed: true,
        coverageMet: true,
        timestamp: new Date().toISOString(),
      },
      deploymentResults: [],
      overallSuccess: true,
      timestamp: new Date().toISOString(),
    },
    metrics: [{ name: 'quality_score', type: 'gauge', value: qualityScore, timestamp: new Date().toISOString() }],
    alerts: Array.from({ length: alertCount }).map((_, i) => ({
      id: `ALT-${i + 1}`,
      severity: 'warning' as const,
      message: `alert-${i + 1}`,
      timestamp: new Date().toISOString(),
      resolved: false,
    })),
    healthStatus: {
      status: alertCount > 0 ? 'degraded' : 'healthy',
      checks: [],
      uptime: 100,
      timestamp: new Date().toISOString(),
    },
    isHealthy: alertCount === 0,
    timestamp: new Date().toISOString(),
  };
}

describe('ContinuousImprovementService', () => {
  let dryRunService: ContinuousImprovementService;
  let prodService: ContinuousImprovementService;

  beforeEach(() => {
    dryRunService = new ContinuousImprovementService({
      githubToken: 'test-token',
      repository: 'owner/repo',
      dryRun: true,
      verbose: false,
    });

    prodService = new ContinuousImprovementService({
      githubToken: 'test-token',
      repository: 'owner/repo',
      dryRun: false,
      verbose: false,
    });
  });

  it('should generate suggestions in dry-run without creating issues', async () => {
    const createSpy = vi.spyOn((dryRunService as any).octokit.issues, 'create');
    const result = await dryRunService.execute({
      issueNumber: 52,
      coordinationResult: createBaseResult(),
      monitoringContext: createMonitoringContext(70, 0),
    });

    expect(result.status).toBe('success');
    expect(result.suggestions.length).toBeGreaterThan(0);
    expect(result.createdIssues.length).toBe(0);
    expect(createSpy).not.toHaveBeenCalled();
  });

  it('should create improvement issues in production mode', async () => {
    const createSpy = vi
      .spyOn((prodService as any).octokit.issues, 'create')
      .mockResolvedValue({
        data: { number: 9001, html_url: 'https://example.com/9001', title: '[Phase 9] test' },
      } as any);

    const degraded = createBaseResult();
    degraded.overallStatus = 'partial_success';
    degraded.metrics.failedTasks = 4;

    const result = await prodService.execute({
      issueNumber: 52,
      coordinationResult: degraded,
      monitoringContext: createMonitoringContext(65, 3),
    });

    expect(result.suggestions.length).toBeGreaterThan(0);
    expect(result.createdIssues.length).toBe(result.suggestions.length);
    expect(createSpy).toHaveBeenCalled();
  });
});

