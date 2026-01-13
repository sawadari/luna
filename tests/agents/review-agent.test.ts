/**
 * ReviewAgent Tests
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ReviewAgent } from '../../src/agents/review-agent';
import type {
  AgentConfig,
  GitHubIssue,
  CodeGenContext,
  ReviewContext,
  CodeReview,
  ReviewIssue,
  GeneratedCode,
} from '../../src/types';

describe('ReviewAgent', () => {
  let agent: ReviewAgent;
  let mockConfig: AgentConfig;
  let mockCodeGenContext: CodeGenContext;

  beforeEach(() => {
    mockConfig = {
      githubToken: 'test-token',
      repository: 'test-owner/test-repo',
      verbose: false,
    };

    agent = new ReviewAgent(mockConfig);

    mockCodeGenContext = createMockCodeGenContext();

    // Mock Octokit
    const mockOctokit = {
      issues: {
        get: vi.fn().mockResolvedValue({ data: createMockIssue() }),
      },
    };
    (agent as any).octokit = mockOctokit;
  });

  // =============================================================================
  // Security Check Tests
  // =============================================================================

  describe('Security Checks', () => {
    it('should detect SQL injection vulnerabilities', () => {
      const code = `
        db.exec('SELECT * FROM users WHERE id = ' + userId);
      `;

      const issues = (agent as any).checkSecurity(code);
      const sqlInjection = issues.find((i: ReviewIssue) =>
        i.message.includes('SQL injection')
      );

      expect(sqlInjection).toBeDefined();
      expect(sqlInjection.severity).toBe('error');
      expect(sqlInjection.category).toBe('security');
    });

    it('should detect command injection vulnerabilities', () => {
      const code = `
        const { exec } = require('child_process');
        exec(userInput);
      `;

      const issues = (agent as any).checkSecurity(code);
      const cmdInjection = issues.find((i: ReviewIssue) =>
        i.message.includes('command injection')
      );

      expect(cmdInjection).toBeDefined();
      expect(cmdInjection.severity).toBe('error');
    });

    it('should detect XSS vulnerabilities', () => {
      const code = `
        element.innerHTML = userInput;
      `;

      const issues = (agent as any).checkSecurity(code);
      const xss = issues.find((i: ReviewIssue) => i.message.includes('XSS'));

      expect(xss).toBeDefined();
      expect(xss.severity).toBe('warning');
      expect(xss.category).toBe('security');
    });

    it('should detect hardcoded passwords', () => {
      const code = `
        const password = "admin123";
        connect(password);
      `;

      const issues = (agent as any).checkSecurity(code);
      const hardcoded = issues.find((i: ReviewIssue) =>
        i.message.includes('Hardcoded credentials')
      );

      expect(hardcoded).toBeDefined();
      expect(hardcoded.severity).toBe('error');
    });

    it('should detect hardcoded API keys', () => {
      const code = `
        const api_key = "sk-1234567890";
      `;

      const issues = (agent as any).checkSecurity(code);
      const apiKey = issues.find((i: ReviewIssue) =>
        i.message.includes('Hardcoded credentials')
      );

      expect(apiKey).toBeDefined();
    });

    it('should detect eval() usage', () => {
      const code = `
        eval(userInput);
      `;

      const issues = (agent as any).checkSecurity(code);
      const evalIssue = issues.find((i: ReviewIssue) => i.message.includes('eval'));

      expect(evalIssue).toBeDefined();
      expect(evalIssue.severity).toBe('error');
    });

    it('should not flag safe code', () => {
      const code = `
        const db = require('db');
        const users = await db.query('SELECT * FROM users WHERE id = ?', [userId]);
      `;

      const issues = (agent as any).checkSecurity(code);
      expect(issues.length).toBe(0);
    });
  });

  // =============================================================================
  // Quality Check Tests
  // =============================================================================

  describe('Quality Checks', () => {
    it('should detect TODO comments', () => {
      const code = `
        function test() {
          // TODO: Implement this
        }
      `;

      const issues = (agent as any).checkQuality(code);
      const todo = issues.find((i: ReviewIssue) =>
        i.message.includes('Incomplete implementation')
      );

      expect(todo).toBeDefined();
      expect(todo.severity).toBe('info');
      expect(todo.category).toBe('quality');
    });

    it('should detect FIXME comments', () => {
      const code = `
        function test() {
          // FIXME: This is broken
        }
      `;

      const issues = (agent as any).checkQuality(code);
      const fixme = issues.find((i: ReviewIssue) =>
        i.message.includes('Incomplete implementation')
      );

      expect(fixme).toBeDefined();
    });

    it('should detect high cyclomatic complexity', () => {
      const code = `
        function complex() {
          if (a) { if (b) { if (c) { if (d) { if (e) { if (f) { } } } } } }
          for (let i = 0; i < 10; i++) { }
          while (x) { }
          switch (y) { case 1: case 2: case 3: }
        }
      `;

      const complexity = (agent as any).analyzeComplexity(code);
      expect(complexity).toBeGreaterThan(10);
    });

    it('should detect console.log in code', () => {
      const code = `
        function debug() {
          console.log('debug info');
        }
      `;

      const issues = (agent as any).checkQuality(code);
      const consoleLog = issues.find((i: ReviewIssue) =>
        i.message.includes('console.log')
      );

      expect(consoleLog).toBeDefined();
      expect(consoleLog.severity).toBe('info');
    });

    it('should warn when no error handling detected', () => {
      const code = `
        function riskyOperation() {
          return database.query();
        }
      `;

      const issues = (agent as any).checkQuality(code);
      const noErrorHandling = issues.find((i: ReviewIssue) =>
        i.message.includes('No error handling')
      );

      expect(noErrorHandling).toBeDefined();
      expect(noErrorHandling.severity).toBe('warning');
    });

    it('should not warn when error handling is present', () => {
      const code = `
        async function safeOperation() {
          try {
            return await database.query();
          } catch (error) {
            console.error(error);
          }
        }
      `;

      const issues = (agent as any).checkQuality(code);
      const noErrorHandling = issues.find((i: ReviewIssue) =>
        i.message.includes('No error handling')
      );

      expect(noErrorHandling).toBeUndefined();
    });
  });

  // =============================================================================
  // Style Check Tests
  // =============================================================================

  describe('Style Checks', () => {
    it('should detect lines that are too long', () => {
      const longLine = 'const x = ' + 'a'.repeat(150) + ';';
      const code = `${longLine}`;

      const issues = (agent as any).checkStyle(code);
      const longLineIssue = issues.find((i: ReviewIssue) =>
        i.message.includes('Line too long')
      );

      expect(longLineIssue).toBeDefined();
      expect(longLineIssue.severity).toBe('info');
      expect(longLineIssue.category).toBe('style');
    });

    it('should detect var keyword usage', () => {
      const code = `
        var x = 10;
      `;

      const issues = (agent as any).checkStyle(code);
      const varUsage = issues.find((i: ReviewIssue) =>
        i.message.includes('var')
      );

      expect(varUsage).toBeDefined();
      expect(varUsage.severity).toBe('warning');
    });

    it('should detect loose equality (==) usage', () => {
      const code = `
        if (x == y) { }
      `;

      const issues = (agent as any).checkStyle(code);
      const looseEquality = issues.find((i: ReviewIssue) =>
        i.message.includes('loose equality')
      );

      expect(looseEquality).toBeDefined();
      expect(looseEquality.severity).toBe('info');
    });

    it('should not flag strict equality (===)', () => {
      const code = `
        if (x === y) { }
      `;

      const issues = (agent as any).checkStyle(code);
      const equalityIssue = issues.find((i: ReviewIssue) =>
        i.message.includes('equality')
      );

      expect(equalityIssue).toBeUndefined();
    });

    it('should not flag != as loose equality', () => {
      const code = `
        if (x != y) { }
      `;

      const issues = (agent as any).checkStyle(code);
      // Should still detect != as loose inequality
      const looseInequality = issues.find((i: ReviewIssue) =>
        i.message.includes('equality')
      );

      expect(looseInequality).toBeUndefined(); // Pattern only checks ==
    });
  });

  // =============================================================================
  // Performance Check Tests
  // =============================================================================

  describe('Performance Checks', () => {
    it('should detect DOM manipulation in loops', () => {
      const code = `
        for (let i = 0; i < items.length; i++) { element.appendChild(item); }
      `;

      const issues = (agent as any).checkPerformance(code);
      const domManipulation = issues.find((i: ReviewIssue) =>
        i.message.includes('DOM manipulation')
      );

      expect(domManipulation).toBeDefined();
      expect(domManipulation.severity).toBe('warning');
      expect(domManipulation.category).toBe('performance');
    });

    it('should detect synchronous file operations', () => {
      const code = `
        const content = fs.readFileSync('file.txt');
      `;

      const issues = (agent as any).checkPerformance(code);
      const syncFile = issues.find((i: ReviewIssue) =>
        i.message.includes('Synchronous file')
      );

      expect(syncFile).toBeDefined();
      expect(syncFile.severity).toBe('warning');
    });

    it('should detect writeFileSync', () => {
      const code = `
        fs.writeFileSync('file.txt', data);
      `;

      const issues = (agent as any).checkPerformance(code);
      const syncFile = issues.find((i: ReviewIssue) =>
        i.message.includes('Synchronous file')
      );

      expect(syncFile).toBeDefined();
    });
  });

  // =============================================================================
  // Complexity Analysis Tests
  // =============================================================================

  describe('Complexity Analysis', () => {
    it('should calculate cyclomatic complexity', () => {
      const code = `
        if (a) { }
        if (b) { }
        for (let i = 0; i < 10; i++) { }
        while (x) { }
        switch (y) { case 1: case 2: }
      `;

      const complexity = (agent as any).analyzeComplexity(code);
      expect(complexity).toBeGreaterThan(5);
    });

    it('should count logical operators', () => {
      const code = `
        if (a && b && c || d) { }
      `;

      const complexity = (agent as any).analyzeComplexity(code);
      expect(complexity).toBeGreaterThan(1);
    });

    it('should count catch blocks', () => {
      const code = `
        try { } catch (e) { }
        try { } catch (e) { }
      `;

      const complexity = (agent as any).analyzeComplexity(code);
      expect(complexity).toBeGreaterThan(1);
    });

    it('should handle code without control flow', () => {
      const code = `
        const x = 10;
        const y = 20;
      `;

      const complexity = (agent as any).analyzeComplexity(code);
      expect(complexity).toBe(1);
    });
  });

  describe('Function Length Analysis', () => {
    it('should detect long functions', () => {
      const longFunction = `
        function longFunction() {
          ${'\n  const x = 1;'.repeat(60)}
        }
      `;

      const lengths = (agent as any).analyzeFunctionLengths(longFunction);
      expect(lengths.length).toBeGreaterThan(0);
      expect(lengths[0].length).toBeGreaterThan(50);
    });

    it('should detect arrow functions', () => {
      const code = `
        const fn = () => {
          const x = 1;
          const y = 2;
          return x + y;
        };
      `;

      const lengths = (agent as any).analyzeFunctionLengths(code);
      expect(lengths.length).toBeGreaterThan(0);
    });

    it('should handle nested functions', () => {
      const code = `
        function outer() {
          function inner() {
            const x = 1;
          }
        }
      `;

      const lengths = (agent as any).analyzeFunctionLengths(code);
      expect(lengths.length).toBeGreaterThanOrEqual(1);
    });
  });

  // =============================================================================
  // File Score Calculation Tests
  // =============================================================================

  describe('File Score Calculation', () => {
    it('should start with 100 points', () => {
      const issues: ReviewIssue[] = [];
      const score = (agent as any).calculateFileScore(issues);
      expect(score).toBe(100);
    });

    it('should deduct 10 points for errors', () => {
      const issues: ReviewIssue[] = [
        {
          line: 1,
          severity: 'error',
          category: 'security',
          message: 'Test error',
        },
      ];

      const score = (agent as any).calculateFileScore(issues);
      expect(score).toBe(90);
    });

    it('should deduct 5 points for warnings', () => {
      const issues: ReviewIssue[] = [
        {
          line: 1,
          severity: 'warning',
          category: 'quality',
          message: 'Test warning',
        },
      ];

      const score = (agent as any).calculateFileScore(issues);
      expect(score).toBe(95);
    });

    it('should deduct 1 point for info', () => {
      const issues: ReviewIssue[] = [
        {
          line: 1,
          severity: 'info',
          category: 'style',
          message: 'Test info',
        },
      ];

      const score = (agent as any).calculateFileScore(issues);
      expect(score).toBe(99);
    });

    it('should not go below 0', () => {
      const issues: ReviewIssue[] = Array(20).fill({
        line: 1,
        severity: 'error',
        category: 'security',
        message: 'Test error',
      });

      const score = (agent as any).calculateFileScore(issues);
      expect(score).toBe(0);
    });

    it('should handle mixed severity levels', () => {
      const issues: ReviewIssue[] = [
        { line: 1, severity: 'error', category: 'security', message: 'Error' },
        { line: 2, severity: 'warning', category: 'quality', message: 'Warning' },
        { line: 3, severity: 'info', category: 'style', message: 'Info' },
      ];

      const score = (agent as any).calculateFileScore(issues);
      expect(score).toBe(84); // 100 - 10 - 5 - 1
    });
  });

  // =============================================================================
  // Issue Extraction Tests
  // =============================================================================

  describe('Issue Extraction', () => {
    it('should extract security issues', () => {
      const reviews: CodeReview[] = [
        {
          file: 'test.ts',
          issues: [
            {
              line: 1,
              severity: 'error',
              category: 'security',
              message: 'Security issue',
            },
            {
              line: 2,
              severity: 'warning',
              category: 'quality',
              message: 'Quality issue',
            },
          ],
          score: 85,
        },
      ];

      const securityIssues = (agent as any).extractSecurityIssues(reviews);
      expect(securityIssues.length).toBe(1);
      expect(securityIssues[0].category).toBe('security');
    });

    it('should extract quality issues', () => {
      const reviews: CodeReview[] = [
        {
          file: 'test.ts',
          issues: [
            {
              line: 1,
              severity: 'error',
              category: 'security',
              message: 'Security issue',
            },
            {
              line: 2,
              severity: 'warning',
              category: 'quality',
              message: 'Quality issue',
            },
          ],
          score: 85,
        },
      ];

      const qualityIssues = (agent as any).extractQualityIssues(reviews);
      expect(qualityIssues.length).toBe(1);
      expect(qualityIssues[0].category).toBe('quality');
    });
  });

  // =============================================================================
  // Overall Score Calculation Tests
  // =============================================================================

  describe('Overall Score Calculation', () => {
    it('should return 0 for empty reviews', () => {
      const score = (agent as any).calculateOverallScore([]);
      expect(score).toBe(0);
    });

    it('should calculate average score', () => {
      const reviews: CodeReview[] = [
        { file: 'test1.ts', issues: [], score: 100 },
        { file: 'test2.ts', issues: [], score: 80 },
        { file: 'test3.ts', issues: [], score: 90 },
      ];

      const score = (agent as any).calculateOverallScore(reviews);
      expect(score).toBe(90);
    });

    it('should round to nearest integer', () => {
      const reviews: CodeReview[] = [
        { file: 'test1.ts', issues: [], score: 85 },
        { file: 'test2.ts', issues: [], score: 84 },
      ];

      const score = (agent as any).calculateOverallScore(reviews);
      expect(Number.isInteger(score)).toBe(true);
    });
  });

  // =============================================================================
  // Integration Tests
  // =============================================================================

  describe('Full Execution', () => {
    it('should execute successfully', async () => {
      const result = await agent.execute(1, mockCodeGenContext);

      expect(result.status).toBeDefined();
      expect(result.data).toBeDefined();
      expect(result.metrics.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('should pass when score >= 80', async () => {
      const cleanCode = createMockCodeGenContext({
        generatedCode: [
          {
            filename: 'clean.ts',
            content: 'export const x = 1;',
            language: 'typescript',
            size: 19,
          },
        ],
      });

      const result = await agent.execute(1, cleanCode);

      expect(result.data?.passed).toBe(true);
      expect(result.data?.overallScore).toBeGreaterThanOrEqual(80);
      expect(result.status).toBe('success');
    });

    it('should be blocked when score < 80', async () => {
      const problematicCode = createMockCodeGenContext({
        generatedCode: [
          {
            filename: 'bad.ts',
            content: `
              const password = "hardcoded";
              eval(userInput);
              db.exec("SELECT * FROM users WHERE id = " + userId);
              element.innerHTML = userInput;
            `,
            language: 'typescript',
            size: 150,
          },
        ],
      });

      const result = await agent.execute(1, problematicCode);

      expect(result.data?.passed).toBe(false);
      expect(result.data?.overallScore).toBeLessThan(80);
      expect(result.status).toBe('blocked');
    });

    it('should identify security issues', async () => {
      const insecureCode = createMockCodeGenContext({
        generatedCode: [
          {
            filename: 'insecure.ts',
            content: 'const api_key = "sk-123"; eval(userInput);',
            language: 'typescript',
            size: 42,
          },
        ],
      });

      const result = await agent.execute(1, insecureCode);

      expect(result.data?.securityIssues.length).toBeGreaterThan(0);
    });

    it('should include timestamp in result', async () => {
      const result = await agent.execute(1, mockCodeGenContext);

      expect(result.data?.timestamp).toBeDefined();
      expect(new Date(result.data!.timestamp).getTime()).toBeGreaterThan(0);
    });
  });
});

// =============================================================================
// Helper Functions
// =============================================================================

function createMockIssue(overrides?: Partial<GitHubIssue>): GitHubIssue {
  return {
    number: 1,
    title: 'Test Issue',
    body: 'Test body',
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
