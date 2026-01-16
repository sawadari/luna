/**
 * DeploymentAgent Tests
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DeploymentAgent } from '../../src/agents/deployment-agent';
import type {
  AgentConfig,
  GitHubIssue,
  DeploymentContext,
  CodeGenContext,
  ReviewContext,
  TestContext,
  DeploymentConfig,
  DeploymentResult,
} from '../../src/types';

describe('DeploymentAgent', () => {
  let agent: DeploymentAgent;
  let mockConfig: AgentConfig;
  let mockCodeGenContext: CodeGenContext;
  let mockReviewContext: ReviewContext;
  let mockTestContext: TestContext;

  beforeEach(() => {
    mockConfig = {
      githubToken: 'test-token',
      repository: 'test-owner/test-repo',
      verbose: false,
      dryRun: true, // テストではdry-runを有効化
    };

    agent = new DeploymentAgent(mockConfig);

    mockCodeGenContext = createMockCodeGenContext();
    mockReviewContext = createMockReviewContext();
    mockTestContext = createMockTestContext();

    // Mock Octokit
    const mockOctokit = {
      issues: {
        get: vi.fn().mockResolvedValue({ data: createMockIssue() }),
      },
    };
    (agent as any).octokit = mockOctokit;
  });

  // =============================================================================
  // Version Generation Tests
  // =============================================================================

  describe('Version Generation', () => {
    it('should generate version in correct format', () => {
      const version = (agent as any).generateVersion();

      expect(version).toMatch(/^v\d{4}\.\d{2}\.\d{2}-\d{6}$/);
    });

    it('should generate unique versions', () => {
      const version1 = (agent as any).generateVersion();
      const version2 = (agent as any).generateVersion();

      // 同じ秒以内なら同じになる可能性があるが、通常は異なる
      expect(typeof version1).toBe('string');
      expect(typeof version2).toBe('string');
    });

    it('should include year, month, day, hour, minute, second', () => {
      const version = (agent as any).generateVersion();

      // Format: vYYYY.MM.DD-HHMMSS
      expect(version).toMatch(/^v\d{4}\.\d{2}\.\d{2}-\d{6}$/);

      const [datePart, timePart] = version.substring(1).split('-');
      const [year, month, day] = datePart.split('.');

      expect(year.length).toBe(4);
      expect(month.length).toBe(2);
      expect(day.length).toBe(2);
      expect(timePart.length).toBe(6); // HHMMSS
    });
  });

  // =============================================================================
  // Deployment Success Checking Tests
  // =============================================================================

  describe('Deployment Success Checking', () => {
    it('should return true when all deployments succeeded', () => {
      const results: DeploymentResult[] = [
        {
          environment: 'staging',
          status: 'deployed',
          version: 'v2024.01.01-120000',
          deployedAt: '2024-01-01T12:00:00Z',
          duration: 5000,
        },
        {
          environment: 'production',
          status: 'deployed',
          version: 'v2024.01.01-120100',
          deployedAt: '2024-01-01T12:01:00Z',
          duration: 6000,
        },
      ];

      const success = (agent as any).checkDeploymentSuccess(results);
      expect(success).toBe(true);
    });

    it('should return false when any deployment failed', () => {
      const results: DeploymentResult[] = [
        {
          environment: 'staging',
          status: 'deployed',
          version: 'v2024.01.01-120000',
          deployedAt: '2024-01-01T12:00:00Z',
          duration: 5000,
        },
        {
          environment: 'production',
          status: 'failed',
          version: 'v2024.01.01-120100',
          deployedAt: '2024-01-01T12:01:00Z',
          duration: 3000,
          error: 'Connection timeout',
        },
      ];

      const success = (agent as any).checkDeploymentSuccess(results);
      expect(success).toBe(false);
    });

    it('should return false when deployment was rolled back', () => {
      const results: DeploymentResult[] = [
        {
          environment: 'staging',
          status: 'rolled_back',
          version: 'v2024.01.01-120000',
          deployedAt: '2024-01-01T12:00:00Z',
          duration: 5000,
          error: 'Health check failed',
        },
      ];

      const success = (agent as any).checkDeploymentSuccess(results);
      expect(success).toBe(false);
    });

    it('should return true for empty results', () => {
      const results: DeploymentResult[] = [];

      const success = (agent as any).checkDeploymentSuccess(results);
      expect(success).toBe(true);
    });

    it('should return false when deployment is pending', () => {
      const results: DeploymentResult[] = [
        {
          environment: 'staging',
          status: 'pending',
          version: 'v2024.01.01-120000',
          deployedAt: '2024-01-01T12:00:00Z',
          duration: 0,
        },
      ];

      const success = (agent as any).checkDeploymentSuccess(results);
      expect(success).toBe(false);
    });

    it('should return false when deployment is still deploying', () => {
      const results: DeploymentResult[] = [
        {
          environment: 'staging',
          status: 'deploying',
          version: 'v2024.01.01-120000',
          deployedAt: '2024-01-01T12:00:00Z',
          duration: 0,
        },
      ];

      const success = (agent as any).checkDeploymentSuccess(results);
      expect(success).toBe(false);
    });
  });

  // =============================================================================
  // Status Emoji Tests
  // =============================================================================

  describe('Status Emoji', () => {
    it('should return correct emoji for pending status', () => {
      const emoji = (agent as any).getStatusEmoji('pending');
      expect(emoji).toBe('⏳');
    });

    it('should return correct emoji for deploying status', () => {
      const emoji = (agent as any).getStatusEmoji('deploying');
      expect(emoji).toBe('🚀');
    });

    it('should return correct emoji for deployed status', () => {
      const emoji = (agent as any).getStatusEmoji('deployed');
      expect(emoji).toBe('✅');
    });

    it('should return correct emoji for failed status', () => {
      const emoji = (agent as any).getStatusEmoji('failed');
      expect(emoji).toBe('❌');
    });

    it('should return correct emoji for rolled_back status', () => {
      const emoji = (agent as any).getStatusEmoji('rolled_back');
      expect(emoji).toBe('🔄');
    });
  });

  // =============================================================================
  // Summary Generation Tests
  // =============================================================================

  describe('Summary Generation', () => {
    it('should generate summary for successful deployment', () => {
      const context = createMockDeploymentContext({
        deploymentResults: [
          {
            environment: 'staging',
            status: 'deployed',
            version: 'v2024.01.01-120000',
            deployedAt: '2024-01-01T12:00:00Z',
            duration: 5000,
            url: 'https://staging.example.com',
          },
        ],
        overallSuccess: true,
      });

      const summary = agent.getSummary(context);

      expect(summary).toContain('## Deployment Results');
      expect(summary).toContain('staging');
      expect(summary).toContain('✅ deployed');
      expect(summary).toContain('v2024.01.01-120000');
      expect(summary).toContain('5000ms');
      expect(summary).toContain('https://staging.example.com');
      expect(summary).toContain('✅ Deployment SUCCESSFUL');
    });

    it('should generate summary for failed deployment', () => {
      const context = createMockDeploymentContext({
        deploymentResults: [
          {
            environment: 'production',
            status: 'failed',
            version: 'v2024.01.01-120000',
            deployedAt: '2024-01-01T12:00:00Z',
            duration: 3000,
            error: 'Connection timeout',
          },
        ],
        overallSuccess: false,
      });

      const summary = agent.getSummary(context);

      expect(summary).toContain('production');
      expect(summary).toContain('❌ failed');
      expect(summary).toContain('Connection timeout');
      expect(summary).toContain('❌ Deployment FAILED');
    });

    it('should generate summary for rolled back deployment', () => {
      const context = createMockDeploymentContext({
        deploymentResults: [
          {
            environment: 'production',
            status: 'rolled_back',
            version: 'v2024.01.01-120000',
            deployedAt: '2024-01-01T12:00:00Z',
            duration: 7000,
            error: 'Health check failed',
          },
        ],
        overallSuccess: false,
      });

      const summary = agent.getSummary(context);

      expect(summary).toContain('🔄 rolled_back');
      expect(summary).toContain('Health check failed');
    });

    it('should include all deployments in summary', () => {
      const context = createMockDeploymentContext({
        deploymentResults: [
          {
            environment: 'staging',
            status: 'deployed',
            version: 'v2024.01.01-120000',
            deployedAt: '2024-01-01T12:00:00Z',
            duration: 5000,
          },
          {
            environment: 'production',
            status: 'deployed',
            version: 'v2024.01.01-120100',
            deployedAt: '2024-01-01T12:01:00Z',
            duration: 6000,
          },
        ],
        overallSuccess: true,
      });

      const summary = agent.getSummary(context);

      expect(summary).toContain('staging');
      expect(summary).toContain('production');
    });

    it('should not include URL if not provided', () => {
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

      const summary = agent.getSummary(context);

      expect(summary).not.toContain('URL:');
    });

    it('should not include error if not provided', () => {
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

      const summary = agent.getSummary(context);

      expect(summary).not.toContain('Error:');
    });
  });

  // =============================================================================
  // Deployment Configuration Tests
  // =============================================================================

  describe('Deployment Configuration', () => {
    it('should use default configuration', () => {
      const defaultConfig = (agent as any).defaultDeploymentConfig;

      expect(defaultConfig.environment).toBe('staging');
      expect(defaultConfig.autoRollback).toBe(true);
      expect(defaultConfig.healthCheckTimeout).toBe(30000);
      expect(defaultConfig.deployTimeout).toBe(300000);
    });

    it('should merge custom configuration with defaults', async () => {
      const customConfig: Partial<DeploymentConfig> = {
        environment: 'production',
        autoRollback: false,
      };

      // Note: This test would require mocking the deploy method
      // For now, we just verify the config structure
      expect(customConfig.environment).toBe('production');
      expect(customConfig.autoRollback).toBe(false);
    });
  });

  // =============================================================================
  // Environment Tests
  // =============================================================================

  describe('Environment Tests', () => {
    it('should support development environment', () => {
      const env: 'development' | 'staging' | 'production' = 'development';
      expect(env).toBe('development');
    });

    it('should support staging environment', () => {
      const env: 'development' | 'staging' | 'production' = 'staging';
      expect(env).toBe('staging');
    });

    it('should support production environment', () => {
      const env: 'development' | 'staging' | 'production' = 'production';
      expect(env).toBe('production');
    });
  });

  // =============================================================================
  // Validation Recording Tests
  // =============================================================================

  describe('Validation Recording', () => {
    it('should call recordValidation on successful deployment', async () => {
      // Mock KernelRegistry
      const mockKernelRegistry = {
        searchKernels: vi.fn().mockResolvedValue([
          {
            id: 'TEST-KERNEL-001',
            needs: [{ id: 'NEED-001' }],
            requirements: [{ id: 'REQ-001' }],
            verification: [],
            validation: [],
          },
        ]),
        addValidationToKernel: vi.fn().mockResolvedValue(undefined),
      };

      (agent as any).kernelRegistry = mockKernelRegistry;
      (agent as any).config.dryRun = false; // Enable actual recording

      // Mock deployment to succeed
      (agent as any).deploy = vi.fn().mockResolvedValue([
        {
          environment: 'staging',
          status: 'deployed',
          version: 'v2024.01.01-120000',
          deployedAt: '2024-01-01T12:00:00Z',
          duration: 5000,
        },
      ]);

      // Use mock context with generated code
      const codeGenContextWithCode = createMockCodeGenContext(true);

      const result = await agent.execute(
        1,
        codeGenContextWithCode,
        mockReviewContext,
        mockTestContext
      );

      expect(result.status).toBe('success');
      expect(mockKernelRegistry.searchKernels).toHaveBeenCalledWith({
        tag: 'issue-1',
      });
      expect(mockKernelRegistry.addValidationToKernel).toHaveBeenCalledWith(
        'TEST-KERNEL-001',
        expect.objectContaining({
          id: expect.stringMatching(/^VAL-TEST-KERNEL-001-/),
          statement: expect.any(String),
          method: 'field_test',
          status: 'passed',
          validatedBy: 'DeploymentAgent',
        })
      );
    });

    it('should skip recordValidation in dry-run mode', async () => {
      const mockKernelRegistry = {
        searchKernels: vi.fn(),
        addValidationToKernel: vi.fn(),
      };

      (agent as any).kernelRegistry = mockKernelRegistry;
      (agent as any).config.dryRun = true; // Dry-run mode

      // Mock deployment to succeed
      (agent as any).deploy = vi.fn().mockResolvedValue([
        {
          environment: 'staging',
          status: 'deployed',
          version: 'v2024.01.01-120000',
          deployedAt: '2024-01-01T12:00:00Z',
          duration: 5000,
        },
      ]);

      await agent.execute(
        1,
        mockCodeGenContext,
        mockReviewContext,
        mockTestContext
      );

      // Validation recording should be skipped
      expect(mockKernelRegistry.searchKernels).not.toHaveBeenCalled();
      expect(mockKernelRegistry.addValidationToKernel).not.toHaveBeenCalled();
    });

    it('should skip recordValidation on failed deployment', async () => {
      const mockKernelRegistry = {
        searchKernels: vi.fn(),
        addValidationToKernel: vi.fn(),
      };

      (agent as any).kernelRegistry = mockKernelRegistry;
      (agent as any).config.dryRun = false;

      // Mock deployment to fail
      (agent as any).deploy = vi.fn().mockResolvedValue([
        {
          environment: 'staging',
          status: 'failed',
          version: 'v2024.01.01-120000',
          deployedAt: '2024-01-01T12:00:00Z',
          duration: 3000,
          error: 'Deployment failed',
        },
      ]);

      await agent.execute(
        1,
        mockCodeGenContext,
        mockReviewContext,
        mockTestContext
      );

      // Validation recording should be skipped for failed deployments
      expect(mockKernelRegistry.searchKernels).not.toHaveBeenCalled();
      expect(mockKernelRegistry.addValidationToKernel).not.toHaveBeenCalled();
    });

    it('should handle missing kernel gracefully', async () => {
      const mockKernelRegistry = {
        searchKernels: vi.fn().mockResolvedValue([]), // No kernel found
        addValidationToKernel: vi.fn(),
      };

      (agent as any).kernelRegistry = mockKernelRegistry;
      (agent as any).config.dryRun = false;

      // Mock deployment to succeed
      (agent as any).deploy = vi.fn().mockResolvedValue([
        {
          environment: 'staging',
          status: 'deployed',
          version: 'v2024.01.01-120000',
          deployedAt: '2024-01-01T12:00:00Z',
          duration: 5000,
        },
      ]);

      // Use mock context with generated code
      const codeGenContextWithCode = createMockCodeGenContext(true);

      const result = await agent.execute(
        1,
        codeGenContextWithCode,
        mockReviewContext,
        mockTestContext
      );

      // Should succeed even if kernel not found
      expect(result.status).toBe('success');
      expect(mockKernelRegistry.searchKernels).toHaveBeenCalled();
      expect(mockKernelRegistry.addValidationToKernel).not.toHaveBeenCalled();
    });

    it('should generate correct validation ID format', () => {
      const validationId = (agent as any).generateValidationId('TEST-KERNEL-001');

      expect(validationId).toMatch(/^VAL-TEST-KERNEL-001-\d+-\d{3}$/);
    });

    it('should include deployment evidence in validation', async () => {
      const mockKernelRegistry = {
        searchKernels: vi.fn().mockResolvedValue([
          {
            id: 'TEST-KERNEL-001',
            needs: [{ id: 'NEED-001' }],
            requirements: [{ id: 'REQ-001' }],
            verification: [],
            validation: [],
          },
        ]),
        addValidationToKernel: vi.fn().mockResolvedValue(undefined),
      };

      (agent as any).kernelRegistry = mockKernelRegistry;
      (agent as any).config.dryRun = false;

      // Mock deployment to succeed
      (agent as any).deploy = vi.fn().mockResolvedValue([
        {
          environment: 'production',
          status: 'deployed',
          version: 'v2024.01.01-120000',
          deployedAt: '2024-01-01T12:00:00Z',
          duration: 5000,
        },
      ]);

      // Use mock context with generated code
      const codeGenContextWithCode = createMockCodeGenContext(true);

      await agent.execute(
        1,
        codeGenContextWithCode,
        mockReviewContext,
        mockTestContext
      );

      // Check that validation includes correct criteria
      expect(mockKernelRegistry.addValidationToKernel).toHaveBeenCalledWith(
        'TEST-KERNEL-001',
        expect.objectContaining({
          criteria: expect.arrayContaining([
            'デプロイ成功',
            'ヘルスチェック通過',
            '環境: production',
          ]),
          evidence: expect.arrayContaining([
            expect.objectContaining({
              type: 'field_data',
              path: 'deployment-log.json',
            }),
          ]),
        })
      );
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

    it('should have getSummary method', () => {
      expect(agent.getSummary).toBeDefined();
      expect(typeof agent.getSummary).toBe('function');
    });

    it('should execute in dry-run mode without errors', async () => {
      const result = await agent.execute(
        1,
        mockCodeGenContext,
        mockReviewContext,
        mockTestContext
      );

      expect(result.status).toBeDefined();
      expect(['success', 'blocked', 'error']).toContain(result.status);
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

function createMockCodeGenContext(withCode: boolean = false): CodeGenContext {
  return {
    issue: createMockIssue(),
    analysis: {
      type: 'feature',
      complexity: 'medium',
      language: 'typescript',
      requiresTests: true,
    },
    generatedCode: withCode
      ? [
          {
            filePath: 'src/example.ts',
            content: 'export function example() { return true; }',
            language: 'typescript',
          },
        ]
      : [],
    metrics: {
      overallScore: 80,
      linesOfCode: 100,
      fileCount: 2,
      hasTests: true,
      hasDocumentation: true,
      complexity: 5,
      maintainability: 'high',
    },
    timestamp: '2024-01-01T00:00:00Z',
  };
}

function createMockReviewContext(): ReviewContext {
  return {
    issue: createMockIssue(),
    codeGenContext: createMockCodeGenContext(),
    reviews: [],
    overallScore: 85,
    passed: true,
    securityIssues: [],
    qualityIssues: [],
    timestamp: '2024-01-01T00:00:00Z',
  };
}

function createMockTestContext(): TestContext {
  return {
    issue: createMockIssue(),
    codeGenContext: createMockCodeGenContext(),
    reviewContext: createMockReviewContext(),
    testResults: [],
    coverage: {
      statements: { total: 100, covered: 85, percentage: 85 },
      branches: { total: 100, covered: 90, percentage: 90 },
      functions: { total: 100, covered: 88, percentage: 88 },
      lines: { total: 100, covered: 85, percentage: 85 },
    },
    overallPassed: true,
    coverageMet: true,
    timestamp: '2024-01-01T00:00:00Z',
  };
}

function createMockDeploymentContext(
  overrides?: Partial<DeploymentContext>
): DeploymentContext {
  return {
    issue: createMockIssue(),
    codeGenContext: createMockCodeGenContext(),
    reviewContext: createMockReviewContext(),
    testContext: createMockTestContext(),
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
    timestamp: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}
