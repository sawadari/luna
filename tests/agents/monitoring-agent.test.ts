/**
 * MonitoringAgent Tests
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MonitoringAgent } from '../../src/agents/monitoring-agent';
import type {
  AgentConfig,
  GitHubIssue,
  MonitoringContext,
  DeploymentContext,
  Metric,
  Alert,
  HealthStatus,
} from '../../src/types';

describe('MonitoringAgent', () => {
  let agent: MonitoringAgent;
  let mockConfig: AgentConfig;
  let mockDeploymentContext: DeploymentContext;

  beforeEach(() => {
    mockConfig = {
      githubToken: 'test-token',
      repository: 'test-owner/test-repo',
      verbose: false,
    };

    agent = new MonitoringAgent(mockConfig);

    mockDeploymentContext = createMockDeploymentContext();

    // Mock Octokit
    const mockOctokit = {
      issues: {
        get: vi.fn().mockResolvedValue({ data: createMockIssue() }),
      },
    };
    (agent as any).octokit = mockOctokit;
  });

  // =============================================================================
  // Metric Recording Tests
  // =============================================================================

  describe('Metric Recording', () => {
    it('should record a counter metric', () => {
      const metric: Metric = {
        name: 'test_counter',
        type: 'counter',
        value: 5,
        timestamp: '2024-01-01T00:00:00Z',
      };

      agent.recordMetric(metric);

      expect((agent as any).metrics).toContain(metric);
    });

    it('should record a gauge metric', () => {
      const metric: Metric = {
        name: 'test_gauge',
        type: 'gauge',
        value: 85.5,
        timestamp: '2024-01-01T00:00:00Z',
      };

      agent.recordMetric(metric);

      expect((agent as any).metrics).toContain(metric);
    });

    it('should record a histogram metric', () => {
      const metric: Metric = {
        name: 'response_time',
        type: 'histogram',
        value: 250,
        timestamp: '2024-01-01T00:00:00Z',
      };

      agent.recordMetric(metric);

      expect((agent as any).metrics).toContain(metric);
    });

    it('should record metric with labels', () => {
      const metric: Metric = {
        name: 'http_requests',
        type: 'counter',
        value: 100,
        timestamp: '2024-01-01T00:00:00Z',
        labels: {
          method: 'GET',
          status: '200',
        },
      };

      agent.recordMetric(metric);

      const recorded = (agent as any).metrics.find((m: Metric) => m.name === 'http_requests');
      expect(recorded).toBeDefined();
      expect(recorded.labels).toEqual({ method: 'GET', status: '200' });
    });

    it('should record multiple metrics', () => {
      agent.recordMetric({
        name: 'metric1',
        type: 'counter',
        value: 1,
        timestamp: '2024-01-01T00:00:00Z',
      });

      agent.recordMetric({
        name: 'metric2',
        type: 'gauge',
        value: 2,
        timestamp: '2024-01-01T00:00:00Z',
      });

      expect((agent as any).metrics.length).toBe(2);
    });
  });

  // =============================================================================
  // Alert ID Generation Tests
  // =============================================================================

  describe('Alert ID Generation', () => {
    it('should generate unique alert IDs', () => {
      const id1 = (agent as any).generateAlertId();
      const id2 = (agent as any).generateAlertId();

      expect(id1).not.toBe(id2);
    });

    it('should generate IDs with correct format', () => {
      const id = (agent as any).generateAlertId();

      expect(id).toMatch(/^alert-\d+-[a-z0-9]+$/);
    });

    it('should start with "alert-"', () => {
      const id = (agent as any).generateAlertId();

      expect(id).toMatch(/^alert-/);
    });
  });

  // =============================================================================
  // Severity Determination Tests
  // =============================================================================

  describe('Severity Determination', () => {
    it('should determine critical severity for security checks', () => {
      const severity = (agent as any).determineSeverity('security:auth');

      expect(severity).toBe('critical');
    });

    it('should determine error severity for deployment checks', () => {
      const severity = (agent as any).determineSeverity('deployment');

      expect(severity).toBe('error');
    });

    it('should determine warning severity for quality checks', () => {
      const severity = (agent as any).determineSeverity('quality');

      expect(severity).toBe('warning');
    });

    it('should default to info severity', () => {
      const severity = (agent as any).determineSeverity('unknown');

      expect(severity).toBe('info');
    });

    it('should handle empty check name', () => {
      const severity = (agent as any).determineSeverity('');

      expect(severity).toBe('info');
    });
  });

  // =============================================================================
  // Health Emoji Tests
  // =============================================================================

  describe('Health Emoji', () => {
    it('should return correct emoji for healthy status', () => {
      const emoji = (agent as any).getHealthEmoji('healthy');

      expect(emoji).toBe('✅');
    });

    it('should return correct emoji for degraded status', () => {
      const emoji = (agent as any).getHealthEmoji('degraded');

      expect(emoji).toBe('⚠️');
    });

    it('should return correct emoji for unhealthy status', () => {
      const emoji = (agent as any).getHealthEmoji('unhealthy');

      expect(emoji).toBe('❌');
    });

    it('should return question mark for unknown status', () => {
      const emoji = (agent as any).getHealthEmoji('unknown');

      expect(emoji).toBe('❓');
    });
  });

  // =============================================================================
  // Alert Emoji Tests
  // =============================================================================

  describe('Alert Emoji', () => {
    it('should return correct emoji for info alert', () => {
      const emoji = (agent as any).getAlertEmoji('info');

      expect(emoji).toBe('ℹ️');
    });

    it('should return correct emoji for warning alert', () => {
      const emoji = (agent as any).getAlertEmoji('warning');

      expect(emoji).toBe('⚠️');
    });

    it('should return correct emoji for error alert', () => {
      const emoji = (agent as any).getAlertEmoji('error');

      expect(emoji).toBe('❌');
    });

    it('should return correct emoji for critical alert', () => {
      const emoji = (agent as any).getAlertEmoji('critical');

      expect(emoji).toBe('🚨');
    });
  });

  // =============================================================================
  // Health Check Tests
  // =============================================================================

  describe('Health Checks', () => {
    it('should check deployment health - pass', () => {
      const context = createMockDeploymentContext({
        deploymentResults: [
          {
            environment: 'staging',
            status: 'deployed',
            version: 'v2024.01.01-120000',
            deployedAt: '2024-01-01T12:00:00Z',
            duration: 5000,
          },
        ],
        overallSuccess: true,
      });

      const check = (agent as any).checkDeploymentHealth(context);

      expect(check.name).toBe('deployment');
      expect(check.status).toBe('pass');
      expect(check.message).toContain('successful');
    });

    it('should check deployment health - fail', () => {
      const context = createMockDeploymentContext({
        deploymentResults: [
          {
            environment: 'staging',
            status: 'failed',
            version: 'v2024.01.01-120000',
            deployedAt: '2024-01-01T12:00:00Z',
            duration: 3000,
            error: 'Connection timeout',
          },
        ],
        overallSuccess: false,
      });

      const check = (agent as any).checkDeploymentHealth(context);

      expect(check.name).toBe('deployment');
      expect(check.status).toBe('fail');
      expect(check.message).toContain('failed');
    });

    it('should check test health - pass', () => {
      const testContext = {
        overallPassed: true,
      };

      const check = (agent as any).checkTestHealth(testContext);

      expect(check.name).toBe('tests');
      expect(check.status).toBe('pass');
    });

    it('should check test health - fail', () => {
      const testContext = {
        overallPassed: false,
      };

      const check = (agent as any).checkTestHealth(testContext);

      expect(check.name).toBe('tests');
      expect(check.status).toBe('fail');
    });

    it('should check quality health - pass', () => {
      const reviewContext = {
        passed: true,
        overallScore: 85,
      };

      const check = (agent as any).checkQualityHealth(reviewContext);

      expect(check.name).toBe('quality');
      expect(check.status).toBe('pass');
      expect(check.message).toContain('85/100');
    });

    it('should check quality health - fail', () => {
      const reviewContext = {
        passed: false,
        overallScore: 65,
      };

      const check = (agent as any).checkQualityHealth(reviewContext);

      expect(check.name).toBe('quality');
      expect(check.status).toBe('fail');
      expect(check.message).toContain('below threshold');
    });

    it('should check coverage health - pass', () => {
      const testContext = {
        coverageMet: true,
      };

      const check = (agent as any).checkCoverageHealth(testContext);

      expect(check.name).toBe('coverage');
      expect(check.status).toBe('pass');
      expect(check.message).toContain('≥80%');
    });

    it('should check coverage health - fail', () => {
      const testContext = {
        coverageMet: false,
        coverage: {
          statements: { percentage: 75.5 },
        },
      };

      const check = (agent as any).checkCoverageHealth(testContext);

      expect(check.name).toBe('coverage');
      expect(check.status).toBe('fail');
      expect(check.message).toContain('below target');
    });
  });

  // =============================================================================
  // Summary Generation Tests
  // =============================================================================

  describe('Summary Generation', () => {
    it('should generate summary for healthy system', () => {
      const context = createMockMonitoringContext({
        healthStatus: {
          status: 'healthy',
          checks: [
            { name: 'deployment', status: 'pass', message: 'OK', duration: 10 },
            { name: 'tests', status: 'pass', message: 'OK', duration: 20 },
          ],
          uptime: 1000,
          timestamp: '2024-01-01T00:00:00Z',
        },
        isHealthy: true,
      });

      const summary = agent.getSummary(context);

      expect(summary).toContain('## Monitoring Summary');
      expect(summary).toContain('✅ HEALTHY');
      expect(summary).toContain('✅ deployment');
      expect(summary).toContain('✅ tests');
    });

    it('should generate summary for degraded system', () => {
      const context = createMockMonitoringContext({
        healthStatus: {
          status: 'degraded',
          checks: [
            { name: 'deployment', status: 'pass', message: 'OK', duration: 10 },
            { name: 'tests', status: 'fail', message: 'Failed', duration: 20 },
          ],
          uptime: 1000,
          timestamp: '2024-01-01T00:00:00Z',
        },
        isHealthy: false,
      });

      const summary = agent.getSummary(context);

      expect(summary).toContain('⚠️ DEGRADED');
      expect(summary).toContain('❌ tests');
    });

    it('should include metrics in summary', () => {
      const context = createMockMonitoringContext({
        metrics: [
          {
            name: 'test_pass_rate',
            type: 'gauge',
            value: 95.5,
            timestamp: '2024-01-01T00:00:00Z',
          },
          {
            name: 'code_coverage_percentage',
            type: 'gauge',
            value: 85.0,
            timestamp: '2024-01-01T00:00:00Z',
          },
        ],
      });

      const summary = agent.getSummary(context);

      expect(summary).toContain('test_pass_rate: 95.50');
      expect(summary).toContain('code_coverage_percentage: 85.00%');
    });

    it('should include alerts in summary', () => {
      const context = createMockMonitoringContext({
        alerts: [
          {
            id: 'alert-1',
            severity: 'warning',
            message: 'Test coverage below 80%',
            timestamp: '2024-01-01T00:00:00Z',
            resolved: false,
          },
          {
            id: 'alert-2',
            severity: 'critical',
            message: 'Security issue detected',
            timestamp: '2024-01-01T00:00:00Z',
            resolved: false,
          },
        ],
      });

      const summary = agent.getSummary(context);

      expect(summary).toContain('### Alerts');
      expect(summary).toContain('⚠️ [WARNING] Test coverage below 80%');
      expect(summary).toContain('🚨 [CRITICAL] Security issue detected');
    });

    it('should not show alerts section if no alerts', () => {
      const context = createMockMonitoringContext({
        alerts: [],
      });

      const summary = agent.getSummary(context);

      expect(summary).not.toContain('### Alerts');
    });

    it('should format percentage metrics correctly', () => {
      const context = createMockMonitoringContext({
        metrics: [
          {
            name: 'cpu_usage_percentage',
            type: 'gauge',
            value: 45.67,
            timestamp: '2024-01-01T00:00:00Z',
          },
        ],
      });

      const summary = agent.getSummary(context);

      expect(summary).toContain('cpu_usage_percentage: 45.67%');
    });

    it('should not add percentage sign to non-percentage metrics', () => {
      const context = createMockMonitoringContext({
        metrics: [
          {
            name: 'request_count',
            type: 'counter',
            value: 1000,
            timestamp: '2024-01-01T00:00:00Z',
          },
        ],
      });

      const summary = agent.getSummary(context);

      expect(summary).toContain('request_count: 1000.00');
      expect(summary).not.toContain('1000.00%');
    });
  });

  // =============================================================================
  // Integration Tests
  // =============================================================================

  describe('Integration Tests', () => {
    it('should have execute method', () => {
      expect(agent.execute).toBeDefined();
      expect(typeof agent.execute).toBe('function');
    });

    it('should have recordMetric method', () => {
      expect(agent.recordMetric).toBeDefined();
      expect(typeof agent.recordMetric).toBe('function');
    });

    it('should have getSummary method', () => {
      expect(agent.getSummary).toBeDefined();
      expect(typeof agent.getSummary).toBe('function');
    });
  });
});

// =============================================================================
// Helper Functions
// =============================================================================

function createMockIssue(overrides?: Partial<GitHubIssue>): GitHubIssue {
  return {
    number: 1,
    title: 'Sample Issue',
    body: 'Sample body',
    labels: [],
    state: 'open',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    ...overrides,
  } as GitHubIssue;
}

function createMockDeploymentContext(
  overrides?: Partial<DeploymentContext>
): DeploymentContext {
  return {
    issue: createMockIssue(),
    codeGenContext: {} as any,
    reviewContext: {
      passed: true,
      overallScore: 85,
      securityIssues: [],
    } as any,
    testContext: {
      overallPassed: true,
      coverageMet: true,
      coverage: {
        statements: { percentage: 85 },
      },
    } as any,
    deploymentResults: [],
    overallSuccess: true,
    timestamp: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

function createMockMonitoringContext(
  overrides?: Partial<MonitoringContext>
): MonitoringContext {
  return {
    issue: createMockIssue(),
    deploymentContext: createMockDeploymentContext(),
    metrics: [],
    alerts: [],
    healthStatus: {
      status: 'healthy',
      checks: [],
      uptime: 1000,
      timestamp: '2024-01-01T00:00:00Z',
    },
    isHealthy: true,
    timestamp: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}
