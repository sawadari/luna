/**
 * TestAgent Tests
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TestAgent } from '../../src/agents/test-agent';
import { ensureRulesConfigLoaded } from '../../src/services/rules-config-service';
import type {
  AgentConfig,
  GitHubIssue,
  TestContext,
  CodeGenContext,
  ReviewContext,
  TestResult,
  CoverageReport,
} from '../../src/types';

describe('TestAgent', () => {
  let agent: TestAgent;
  let mockConfig: AgentConfig;
  let mockCodeGenContext: CodeGenContext;
  let mockReviewContext: ReviewContext;

  beforeEach(async () => {
    // Issue #48: Ensure rules configuration is loaded before creating agents
    await ensureRulesConfigLoaded();

    mockConfig = {
      githubToken: 'test-token',
      repository: 'test-owner/test-repo',
      verbose: false,
    };

    agent = new TestAgent(mockConfig);

    mockCodeGenContext = createMockCodeGenContext();
    mockReviewContext = createMockReviewContext();

    // Mock Octokit
    const mockOctokit = {
      issues: {
        get: vi.fn().mockResolvedValue({ data: createMockIssue() }),
      },
    };
    (agent as any).octokit = mockOctokit;
  });

  // =============================================================================
  // Test Output Parsing Tests
  // =============================================================================

  describe('Test Output Parsing', () => {
    it('should parse simple test output with passed tests', () => {
      const output = `
        Test Files  2 passed (2)
             Tests  92 passed (92)
      `;

      const result = (agent as any).parseSimpleTestOutput(output);
      expect(result.passed).toBe(92);
      expect(result.failed).toBe(0);
      expect(result.skipped).toBe(0);
    });

    it('should parse simple test output with failed tests', () => {
      const output = `
        Test Files  1 failed | 1 passed (2)
             Tests  2 failed | 90 passed (92)
      `;

      const result = (agent as any).parseSimpleTestOutput(output);
      expect(result.passed).toBe(90);
      expect(result.failed).toBe(2);
    });

    it('should parse simple test output with skipped tests', () => {
      const output = `
        Test Files  2 passed (2)
             Tests  5 skipped | 87 passed (92)
      `;

      const result = (agent as any).parseSimpleTestOutput(output);
      expect(result.passed).toBe(87);
      expect(result.skipped).toBe(5);
    });

    it('should handle output with no test results', () => {
      const output = 'No tests found';

      const result = (agent as any).parseSimpleTestOutput(output);
      expect(result.passed).toBe(0);
      expect(result.failed).toBe(0);
      expect(result.skipped).toBe(0);
    });

    it('should parse mixed test results', () => {
      const output = `
        Test Files  1 failed | 1 passed (2)
             Tests  3 failed | 5 skipped | 84 passed (92)
      `;

      const result = (agent as any).parseSimpleTestOutput(output);
      expect(result.passed).toBe(84);
      expect(result.failed).toBe(3);
      expect(result.skipped).toBe(5);
    });
  });

  // =============================================================================
  // Coverage Parsing Tests
  // =============================================================================

  describe('Coverage Parsing', () => {
    it('should parse coverage output with high coverage', () => {
      const output = `
        % Coverage report from v8
        -------------------|---------|----------|---------|---------|
        File               | % Stmts | % Branch | % Funcs | % Lines |
        -------------------|---------|----------|---------|---------|
        All files          |   85.32 |    90.19 |   88.88 |   85.32 |
      `;

      const coverage = (agent as any).parseCoverageOutput(output);
      expect(coverage.statements.percentage).toBe(85.32);
      expect(coverage.branches.percentage).toBe(90.19);
      expect(coverage.functions.percentage).toBe(88.88);
      expect(coverage.lines.percentage).toBe(85.32);
    });

    it('should parse coverage output with low coverage', () => {
      const output = `
        All files          |   45.5 |    55.2 |   60.3 |   45.5 |
      `;

      const coverage = (agent as any).parseCoverageOutput(output);
      expect(coverage.statements.percentage).toBe(45.5);
      expect(coverage.branches.percentage).toBe(55.2);
      expect(coverage.functions.percentage).toBe(60.3);
      expect(coverage.lines.percentage).toBe(45.5);
    });

    it('should handle output with no coverage data', () => {
      const output = 'No coverage data found';

      const coverage = (agent as any).parseCoverageOutput(output);
      expect(coverage.statements.percentage).toBe(0);
      expect(coverage.branches.percentage).toBe(0);
      expect(coverage.functions.percentage).toBe(0);
      expect(coverage.lines.percentage).toBe(0);
    });

    it('should parse 100% coverage', () => {
      const output = `
        All files          |     100 |      100 |     100 |     100 |
      `;

      const coverage = (agent as any).parseCoverageOutput(output);
      expect(coverage.statements.percentage).toBe(100);
      expect(coverage.branches.percentage).toBe(100);
      expect(coverage.functions.percentage).toBe(100);
      expect(coverage.lines.percentage).toBe(100);
    });

    it('should parse decimal coverage percentages', () => {
      const output = `
        All files          |   82.45 |    91.67 |   85.12 |   82.45 |
      `;

      const coverage = (agent as any).parseCoverageOutput(output);
      expect(coverage.statements.percentage).toBeCloseTo(82.45, 2);
      expect(coverage.branches.percentage).toBeCloseTo(91.67, 2);
      expect(coverage.functions.percentage).toBeCloseTo(85.12, 2);
    });
  });

  // =============================================================================
  // Coverage Metric Creation Tests
  // =============================================================================

  describe('Coverage Metric Creation', () => {
    it('should create coverage metric from percentage', () => {
      const metric = (agent as any).createCoverageMetric(85.5);

      expect(metric.total).toBe(100);
      expect(metric.covered).toBe(86); // rounded from 85.5
      expect(metric.percentage).toBe(85.5);
    });

    it('should handle 0% coverage', () => {
      const metric = (agent as any).createCoverageMetric(0);

      expect(metric.total).toBe(100);
      expect(metric.covered).toBe(0);
      expect(metric.percentage).toBe(0);
    });

    it('should handle 100% coverage', () => {
      const metric = (agent as any).createCoverageMetric(100);

      expect(metric.total).toBe(100);
      expect(metric.covered).toBe(100);
      expect(metric.percentage).toBe(100);
    });

    it('should round covered value correctly', () => {
      const metric1 = (agent as any).createCoverageMetric(82.4);
      expect(metric1.covered).toBe(82);

      const metric2 = (agent as any).createCoverageMetric(82.6);
      expect(metric2.covered).toBe(83);
    });
  });

  // =============================================================================
  // Empty Coverage Tests
  // =============================================================================

  describe('Empty Coverage Creation', () => {
    it('should create empty coverage report', () => {
      const coverage = (agent as any).createEmptyCoverage();

      expect(coverage.statements.percentage).toBe(0);
      expect(coverage.branches.percentage).toBe(0);
      expect(coverage.functions.percentage).toBe(0);
      expect(coverage.lines.percentage).toBe(0);

      expect(coverage.statements.total).toBe(0);
      expect(coverage.statements.covered).toBe(0);
    });
  });

  // =============================================================================
  // Test Pass/Fail Checking Tests
  // =============================================================================

  describe('Test Pass/Fail Checking', () => {
    it('should return true when all tests pass', () => {
      const testResults: TestResult[] = [
        {
          file: 'test1.ts',
          passed: 10,
          failed: 0,
          skipped: 0,
          duration: 100,
          failures: [],
        },
        {
          file: 'test2.ts',
          passed: 20,
          failed: 0,
          skipped: 0,
          duration: 200,
          failures: [],
        },
      ];

      const passed = (agent as any).checkTestsPassed(testResults);
      expect(passed).toBe(true);
    });

    it('should return false when any test fails', () => {
      const testResults: TestResult[] = [
        {
          file: 'test1.ts',
          passed: 10,
          failed: 0,
          skipped: 0,
          duration: 100,
          failures: [],
        },
        {
          file: 'test2.ts',
          passed: 19,
          failed: 1,
          skipped: 0,
          duration: 200,
          failures: [{ testName: 'should work', message: 'Failed' }],
        },
      ];

      const passed = (agent as any).checkTestsPassed(testResults);
      expect(passed).toBe(false);
    });

    it('should return true for empty test results', () => {
      const testResults: TestResult[] = [];

      const passed = (agent as any).checkTestsPassed(testResults);
      expect(passed).toBe(true);
    });

    it('should ignore skipped tests', () => {
      const testResults: TestResult[] = [
        {
          file: 'test1.ts',
          passed: 10,
          failed: 0,
          skipped: 5,
          duration: 100,
          failures: [],
        },
      ];

      const passed = (agent as any).checkTestsPassed(testResults);
      expect(passed).toBe(true);
    });
  });

  // =============================================================================
  // Coverage Met Checking Tests
  // =============================================================================

  describe('Coverage Met Checking', () => {
    it('should return true when all coverage >= 80%', () => {
      const coverage: CoverageReport = {
        statements: { total: 100, covered: 85, percentage: 85 },
        branches: { total: 100, covered: 90, percentage: 90 },
        functions: { total: 100, covered: 88, percentage: 88 },
        lines: { total: 100, covered: 85, percentage: 85 },
      };

      const met = (agent as any).checkCoverageMet(coverage);
      expect(met).toBe(true);
    });

    it('should return false when statements < 80%', () => {
      const coverage: CoverageReport = {
        statements: { total: 100, covered: 75, percentage: 75 },
        branches: { total: 100, covered: 90, percentage: 90 },
        functions: { total: 100, covered: 88, percentage: 88 },
        lines: { total: 100, covered: 85, percentage: 85 },
      };

      const met = (agent as any).checkCoverageMet(coverage);
      expect(met).toBe(false);
    });

    it('should return false when branches < 80%', () => {
      const coverage: CoverageReport = {
        statements: { total: 100, covered: 85, percentage: 85 },
        branches: { total: 100, covered: 70, percentage: 70 },
        functions: { total: 100, covered: 88, percentage: 88 },
        lines: { total: 100, covered: 85, percentage: 85 },
      };

      const met = (agent as any).checkCoverageMet(coverage);
      expect(met).toBe(false);
    });

    it('should return false when functions < 80%', () => {
      const coverage: CoverageReport = {
        statements: { total: 100, covered: 85, percentage: 85 },
        branches: { total: 100, covered: 90, percentage: 90 },
        functions: { total: 100, covered: 75, percentage: 75 },
        lines: { total: 100, covered: 85, percentage: 85 },
      };

      const met = (agent as any).checkCoverageMet(coverage);
      expect(met).toBe(false);
    });

    it('should return false when lines < 80%', () => {
      const coverage: CoverageReport = {
        statements: { total: 100, covered: 85, percentage: 85 },
        branches: { total: 100, covered: 90, percentage: 90 },
        functions: { total: 100, covered: 88, percentage: 88 },
        lines: { total: 100, covered: 70, percentage: 70 },
      };

      const met = (agent as any).checkCoverageMet(coverage);
      expect(met).toBe(false);
    });

    it('should accept exactly 80% coverage', () => {
      const coverage: CoverageReport = {
        statements: { total: 100, covered: 80, percentage: 80 },
        branches: { total: 100, covered: 80, percentage: 80 },
        functions: { total: 100, covered: 80, percentage: 80 },
        lines: { total: 100, covered: 80, percentage: 80 },
      };

      const met = (agent as any).checkCoverageMet(coverage);
      expect(met).toBe(true);
    });

    it('should accept 100% coverage', () => {
      const coverage: CoverageReport = {
        statements: { total: 100, covered: 100, percentage: 100 },
        branches: { total: 100, covered: 100, percentage: 100 },
        functions: { total: 100, covered: 100, percentage: 100 },
        lines: { total: 100, covered: 100, percentage: 100 },
      };

      const met = (agent as any).checkCoverageMet(coverage);
      expect(met).toBe(true);
    });
  });

  // =============================================================================
  // Summary Generation Tests
  // =============================================================================

  describe('Summary Generation', () => {
    it('should generate summary for passing tests', () => {
      const context = createMockTestContext({
        testResults: [
          {
            file: 'test.ts',
            passed: 10,
            failed: 0,
            skipped: 0,
            duration: 100,
            failures: [],
          },
        ],
        overallPassed: true,
        coverageMet: true,
      });

      const summary = agent.getSummary(context);

      expect(summary).toContain('Passed: 10');
      expect(summary).toContain('Failed: 0');
      expect(summary).toContain('✅ PASSED');
      expect(summary).toContain('✅ MET (≥80%)');
    });

    it('should generate summary for failing tests', () => {
      const context = createMockTestContext({
        testResults: [
          {
            file: 'test.ts',
            passed: 8,
            failed: 2,
            skipped: 0,
            duration: 100,
            failures: [
              { testName: 'test 1', message: 'assertion failed' },
              { testName: 'test 2', message: 'timeout' },
            ],
          },
        ],
        overallPassed: false,
        coverageMet: false,
      });

      const summary = agent.getSummary(context);

      expect(summary).toContain('Passed: 8');
      expect(summary).toContain('Failed: 2');
      expect(summary).toContain('❌ FAILED');
      expect(summary).toContain('❌ NOT MET (<80%)');
      expect(summary).toContain('## Failed Tests');
      expect(summary).toContain('test 1');
      expect(summary).toContain('assertion failed');
    });

    it('should include skipped tests in summary', () => {
      const context = createMockTestContext({
        testResults: [
          {
            file: 'test.ts',
            passed: 8,
            failed: 0,
            skipped: 2,
            duration: 100,
            failures: [],
          },
        ],
      });

      const summary = agent.getSummary(context);

      expect(summary).toContain('Skipped: 2');
    });

    it('should show coverage percentages', () => {
      const context = createMockTestContext({
        coverage: {
          statements: { total: 100, covered: 85, percentage: 85.32 },
          branches: { total: 100, covered: 90, percentage: 90.45 },
          functions: { total: 100, covered: 88, percentage: 88.67 },
          lines: { total: 100, covered: 85, percentage: 85.32 },
        },
      });

      const summary = agent.getSummary(context);

      expect(summary).toContain('Statements: 85.32%');
      expect(summary).toContain('Branches: 90.45%');
      expect(summary).toContain('Functions: 88.67%');
      expect(summary).toContain('Lines: 85.32%');
    });

    it('should list all failed tests with file names', () => {
      const context = createMockTestContext({
        testResults: [
          {
            file: 'test1.ts',
            passed: 5,
            failed: 1,
            skipped: 0,
            duration: 100,
            failures: [{ testName: 'should work', message: 'Expected true, got false' }],
          },
          {
            file: 'test2.ts',
            passed: 8,
            failed: 1,
            skipped: 0,
            duration: 150,
            failures: [{ testName: 'should validate', message: 'Validation error' }],
          },
        ],
        overallPassed: false,
      });

      const summary = agent.getSummary(context);

      expect(summary).toContain('test1.ts: should work');
      expect(summary).toContain('Expected true, got false');
      expect(summary).toContain('test2.ts: should validate');
      expect(summary).toContain('Validation error');
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

function createMockCodeGenContext(
  overrides?: Partial<CodeGenContext>
): CodeGenContext {
  return {
    issue: createMockIssue(),
    analysis: {
      type: 'feature',
      complexity: 'medium',
      language: 'typescript',
      requiresTests: true,
    },
    generatedCode: [
      {
        filename: 'feature.ts',
        content: 'export class Feature {}',
        language: 'typescript',
        size: 23,
      },
    ],
    metrics: {
      overallScore: 80,
      linesOfCode: 1,
      fileCount: 1,
      hasTests: false,
      hasDocumentation: false,
      complexity: 1,
      maintainability: 'medium',
    },
    timestamp: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

function createMockReviewContext(
  overrides?: Partial<ReviewContext>
): ReviewContext {
  return {
    issue: createMockIssue(),
    codeGenContext: createMockCodeGenContext(),
    reviews: [],
    overallScore: 85,
    passed: true,
    securityIssues: [],
    qualityIssues: [],
    timestamp: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

function createMockTestContext(overrides?: Partial<TestContext>): TestContext {
  return {
    issue: createMockIssue(),
    codeGenContext: createMockCodeGenContext(),
    reviewContext: createMockReviewContext(),
    testResults: [
      {
        file: 'test.ts',
        passed: 10,
        failed: 0,
        skipped: 0,
        duration: 100,
        failures: [],
      },
    ],
    coverage: {
      statements: { total: 100, covered: 85, percentage: 85 },
      branches: { total: 100, covered: 90, percentage: 90 },
      functions: { total: 100, covered: 88, percentage: 88 },
      lines: { total: 100, covered: 85, percentage: 85 },
    },
    overallPassed: true,
    coverageMet: true,
    timestamp: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}
