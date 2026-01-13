/**
 * CodeGenAgent Tests
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CodeGenAgent } from '../../src/agents/codegen-agent';
import type {
  AgentConfig,
  GitHubIssue,
  CodeGenContext,
  GeneratedCode,
} from '../../src/types';

describe('CodeGenAgent', () => {
  let agent: CodeGenAgent;
  let mockConfig: AgentConfig;

  beforeEach(() => {
    mockConfig = {
      githubToken: 'test-token',
      repository: 'test-owner/test-repo',
      verbose: false,
    };

    agent = new CodeGenAgent(mockConfig);

    // Mock Octokit
    const mockOctokit = {
      issues: {
        get: vi.fn().mockResolvedValue({ data: createMockIssue() }),
      },
    };
    (agent as any).octokit = mockOctokit;
  });

  // =============================================================================
  // Issue Analysis Tests
  // =============================================================================

  describe('Issue Analysis', () => {
    it('should detect feature type from title', () => {
      const issue: GitHubIssue = createMockIssue({
        title: 'Add new user authentication',
        labels: [],
      });

      const analysis = (agent as any).analyzeIssue(issue);
      expect(analysis.type).toBe('feature');
    });

    it('should detect bug type from labels', () => {
      const issue: GitHubIssue = createMockIssue({
        title: 'Something is broken',
        labels: [{ name: 'bug', color: 'red' }],
      });

      const analysis = (agent as any).analyzeIssue(issue);
      expect(analysis.type).toBe('bug');
    });

    it('should detect refactor type from title', () => {
      const issue: GitHubIssue = createMockIssue({
        title: 'Refactor authentication module',
        labels: [],
      });

      const analysis = (agent as any).analyzeIssue(issue);
      expect(analysis.type).toBe('refactor');
    });

    it('should detect test type from labels', () => {
      const issue: GitHubIssue = createMockIssue({
        title: 'Add tests for auth',
        labels: [{ name: 'test', color: 'green' }],
      });

      const analysis = (agent as any).analyzeIssue(issue);
      expect(analysis.type).toBe('test');
    });

    it('should detect docs type from labels', () => {
      const issue: GitHubIssue = createMockIssue({
        title: 'Update documentation',
        labels: [{ name: 'docs', color: 'blue' }],
      });

      const analysis = (agent as any).analyzeIssue(issue);
      expect(analysis.type).toBe('docs');
    });
  });

  describe('Complexity Detection', () => {
    it('should detect small complexity from labels', () => {
      const issue: GitHubIssue = createMockIssue({
        labels: [{ name: 'small', color: 'green' }],
      });

      const analysis = (agent as any).analyzeIssue(issue);
      expect(analysis.complexity).toBe('small');
    });

    it('should detect large complexity from labels', () => {
      const issue: GitHubIssue = createMockIssue({
        labels: [{ name: 'large', color: 'red' }],
      });

      const analysis = (agent as any).analyzeIssue(issue);
      expect(analysis.complexity).toBe('large');
    });

    it('should default to medium complexity', () => {
      const issue: GitHubIssue = createMockIssue({ labels: [] });

      const analysis = (agent as any).analyzeIssue(issue);
      expect(analysis.complexity).toBe('medium');
    });
  });

  describe('Language Detection', () => {
    it('should detect TypeScript from labels', () => {
      const issue: GitHubIssue = createMockIssue({
        labels: [{ name: 'typescript', color: 'blue' }],
      });

      const analysis = (agent as any).analyzeIssue(issue);
      expect(analysis.language).toBe('typescript');
    });

    it('should detect JavaScript from body', () => {
      const issue: GitHubIssue = createMockIssue({
        body: 'Implement this feature in JavaScript',
      });

      const analysis = (agent as any).analyzeIssue(issue);
      expect(analysis.language).toBe('javascript');
    });

    it('should detect Python from labels', () => {
      const issue: GitHubIssue = createMockIssue({
        labels: [{ name: 'python', color: 'yellow' }],
      });

      const analysis = (agent as any).analyzeIssue(issue);
      expect(analysis.language).toBe('python');
    });

    it('should default to TypeScript', () => {
      const issue: GitHubIssue = createMockIssue({ body: '' });

      const analysis = (agent as any).analyzeIssue(issue);
      expect(analysis.language).toBe('typescript');
    });
  });

  describe('Framework Detection', () => {
    it('should detect React from labels', () => {
      const issue: GitHubIssue = createMockIssue({
        labels: [{ name: 'react', color: 'blue' }],
      });

      const analysis = (agent as any).analyzeIssue(issue);
      expect(analysis.framework).toBe('react');
    });

    it('should detect Vue from body', () => {
      const issue: GitHubIssue = createMockIssue({
        body: 'Create Vue component',
      });

      const analysis = (agent as any).analyzeIssue(issue);
      expect(analysis.framework).toBe('vue');
    });

    it('should detect Express from body', () => {
      const issue: GitHubIssue = createMockIssue({
        body: 'Add Express middleware',
      });

      const analysis = (agent as any).analyzeIssue(issue);
      expect(analysis.framework).toBe('express');
    });

    it('should return undefined if no framework detected', () => {
      const issue: GitHubIssue = createMockIssue({ body: 'Generic task' });

      const analysis = (agent as any).analyzeIssue(issue);
      expect(analysis.framework).toBeUndefined();
    });
  });

  describe('Test Requirements Detection', () => {
    it('should require tests for features', () => {
      const issue: GitHubIssue = createMockIssue({
        labels: [{ name: 'feature', color: 'green' }],
      });

      const analysis = (agent as any).analyzeIssue(issue);
      expect(analysis.requiresTests).toBe(true);
    });

    it('should require tests for bugs', () => {
      const issue: GitHubIssue = createMockIssue({
        labels: [{ name: 'bug', color: 'red' }],
      });

      const analysis = (agent as any).analyzeIssue(issue);
      expect(analysis.requiresTests).toBe(true);
    });

    it('should not require tests for docs', () => {
      const issue: GitHubIssue = createMockIssue({
        labels: [{ name: 'docs', color: 'blue' }],
      });

      const analysis = (agent as any).analyzeIssue(issue);
      expect(analysis.requiresTests).toBe(false);
    });

    it('should not require tests for test tasks', () => {
      const issue: GitHubIssue = createMockIssue({
        labels: [{ name: 'test', color: 'green' }],
      });

      const analysis = (agent as any).analyzeIssue(issue);
      expect(analysis.requiresTests).toBe(false);
    });
  });

  // =============================================================================
  // Code Generation Tests
  // =============================================================================

  describe('Code Generation', () => {
    it('should generate main file', () => {
      const issue: GitHubIssue = createMockIssue({
        title: 'Add user authentication',
      });

      const analysis = {
        type: 'feature' as const,
        complexity: 'medium' as const,
        language: 'typescript',
        requiresTests: true,
      };

      const mainFile = (agent as any).generateMainFile(issue, analysis);

      expect(mainFile.filename).toContain('add-user-authentication');
      expect(mainFile.filename).toContain('.ts');
      expect(mainFile.content).toContain('class');
      expect(mainFile.content).toContain('export');
      expect(mainFile.language).toBe('typescript');
    });

    it('should generate test file when tests required', () => {
      const issue: GitHubIssue = createMockIssue({
        title: 'Add feature',
      });

      const analysis = {
        type: 'feature' as const,
        complexity: 'small' as const,
        language: 'typescript',
        requiresTests: true,
      };

      const mainFile: GeneratedCode = {
        filename: 'feature.ts',
        content: 'export class Feature {}',
        language: 'typescript',
        size: 23,
      };

      const testFile = (agent as any).generateTestFile(issue, analysis, mainFile);

      expect(testFile.filename).toContain('.test.ts');
      expect(testFile.content).toContain('describe');
      expect(testFile.content).toContain('it(');
      expect(testFile.content).toContain('expect');
    });

    it('should generate JavaScript files when language is JavaScript', () => {
      const issue: GitHubIssue = createMockIssue({
        title: 'Add feature',
      });

      const analysis = {
        type: 'feature' as const,
        complexity: 'small' as const,
        language: 'javascript',
        requiresTests: false,
      };

      const mainFile = (agent as any).generateMainFile(issue, analysis);

      expect(mainFile.filename).toContain('.js');
      expect(mainFile.language).toBe('javascript');
    });
  });

  describe('Filename Generation', () => {
    it('should convert title to kebab-case', () => {
      const filename = (agent as any).generateFilename('Add User Auth', 'ts');
      expect(filename).toBe('add-user-auth.ts');
    });

    it('should remove special characters', () => {
      const filename = (agent as any).generateFilename('Add: User@Auth!', 'ts');
      expect(filename).toBe('add-userauth.ts');
    });

    it('should truncate long filenames', () => {
      const longTitle = 'A'.repeat(100);
      const filename = (agent as any).generateFilename(longTitle, 'ts');
      expect(filename.length).toBeLessThanOrEqual(53); // 50 + .ts
    });
  });

  describe('Class Name Generation', () => {
    it('should convert title to PascalCase', () => {
      const className = (agent as any).toClassName('add user auth');
      expect(className).toBe('AddUserAuth');
    });

    it('should remove special characters', () => {
      const className = (agent as any).toClassName('add-user@auth!');
      expect(className).toBe('Adduserauth');
    });

    it('should handle single word', () => {
      const className = (agent as any).toClassName('authentication');
      expect(className).toBe('Authentication');
    });
  });

  // =============================================================================
  // Quality Metrics Tests
  // =============================================================================

  describe('Quality Metrics Calculation', () => {
    it('should calculate basic metrics', () => {
      const generatedCode: GeneratedCode[] = [
        {
          filename: 'feature.ts',
          content: 'export class Feature {\n  // implementation\n}',
          language: 'typescript',
          size: 45,
        },
      ];

      const metrics = (agent as any).calculateMetrics(generatedCode);

      expect(metrics.fileCount).toBe(1);
      expect(metrics.linesOfCode).toBeGreaterThan(0);
      expect(metrics.overallScore).toBeGreaterThan(0);
      expect(metrics.overallScore).toBeLessThanOrEqual(100);
    });

    it('should boost score when tests are included', () => {
      const withoutTests: GeneratedCode[] = [
        {
          filename: 'feature.ts',
          content: 'export class Feature {}',
          language: 'typescript',
          size: 23,
        },
      ];

      const withTests: GeneratedCode[] = [
        ...withoutTests,
        {
          filename: 'feature.test.ts',
          content: 'describe("Feature", () => {})',
          language: 'typescript',
          size: 29,
        },
      ];

      const metricsWithoutTests = (agent as any).calculateMetrics(withoutTests);
      const metricsWithTests = (agent as any).calculateMetrics(withTests);

      expect(metricsWithTests.overallScore).toBeGreaterThan(
        metricsWithoutTests.overallScore
      );
      expect(metricsWithTests.hasTests).toBe(true);
      expect(metricsWithoutTests.hasTests).toBe(false);
    });

    it('should boost score when documentation is included', () => {
      const withoutDocs: GeneratedCode[] = [
        {
          filename: 'feature.ts',
          content: 'export class Feature {}',
          language: 'typescript',
          size: 23,
        },
      ];

      const withDocs: GeneratedCode[] = [
        {
          filename: 'feature.ts',
          content: '/**\n * Feature class\n */\nexport class Feature {}',
          language: 'typescript',
          size: 44,
        },
      ];

      const metricsWithoutDocs = (agent as any).calculateMetrics(withoutDocs);
      const metricsWithDocs = (agent as any).calculateMetrics(withDocs);

      expect(metricsWithDocs.overallScore).toBeGreaterThan(
        metricsWithoutDocs.overallScore
      );
      expect(metricsWithDocs.hasDocumentation).toBe(true);
    });

    it('should calculate complexity based on control flow', () => {
      const simpleCode: GeneratedCode[] = [
        {
          filename: 'simple.ts',
          content: 'export const x = 1;',
          language: 'typescript',
          size: 19,
        },
      ];

      const complexCode: GeneratedCode[] = [
        {
          filename: 'complex.ts',
          content: `
            if (a) { if (b) { if (c) { } } }
            for (let i = 0; i < 10; i++) { }
            while (x) { }
            switch (y) { case 1: break; }
          `,
          language: 'typescript',
          size: 150,
        },
      ];

      const simpleMetrics = (agent as any).calculateMetrics(simpleCode);
      const complexMetrics = (agent as any).calculateMetrics(complexCode);

      expect(complexMetrics.complexity).toBeGreaterThan(simpleMetrics.complexity);
    });

    it('should determine maintainability level', () => {
      const highScore: GeneratedCode[] = [
        {
          filename: 'high.ts',
          content:
            '/**\n * Documentation\n */\nexport class Feature {}\n// comment',
          language: 'typescript',
          size: 60,
        },
        {
          filename: 'high.test.ts',
          content: 'describe("test", () => {})',
          language: 'typescript',
          size: 26,
        },
      ];

      const metrics = (agent as any).calculateMetrics(highScore);
      expect(metrics.maintainability).toBe('high');
    });
  });

  describe('Complexity Calculation', () => {
    it('should count if statements', () => {
      const code: GeneratedCode[] = [
        {
          filename: 'test.ts',
          content: 'if (a) {} if (b) {} if (c) {}',
          language: 'typescript',
          size: 29,
        },
      ];

      const complexity = (agent as any).calculateComplexity(code);
      expect(complexity).toBeGreaterThanOrEqual(3);
    });

    it('should count for loops', () => {
      const code: GeneratedCode[] = [
        {
          filename: 'test.ts',
          content: 'for (let i = 0; i < 10; i++) {}',
          language: 'typescript',
          size: 31,
        },
      ];

      const complexity = (agent as any).calculateComplexity(code);
      expect(complexity).toBeGreaterThanOrEqual(1);
    });

    it('should count switch statements with higher weight', () => {
      const code: GeneratedCode[] = [
        {
          filename: 'test.ts',
          content: 'switch (x) { case 1: break; }',
          language: 'typescript',
          size: 29,
        },
      ];

      const complexity = (agent as any).calculateComplexity(code);
      expect(complexity).toBeGreaterThanOrEqual(2);
    });
  });

  // =============================================================================
  // Language Detection Tests
  // =============================================================================

  describe('Language Detection from Filename', () => {
    it('should detect TypeScript from .ts extension', () => {
      const lang = (agent as any).detectLanguageFromFilename('feature.ts');
      expect(lang).toBe('typescript');
    });

    it('should detect TypeScript from .tsx extension', () => {
      const lang = (agent as any).detectLanguageFromFilename('component.tsx');
      expect(lang).toBe('typescript');
    });

    it('should detect JavaScript from .js extension', () => {
      const lang = (agent as any).detectLanguageFromFilename('feature.js');
      expect(lang).toBe('javascript');
    });

    it('should detect JavaScript from .jsx extension', () => {
      const lang = (agent as any).detectLanguageFromFilename('component.jsx');
      expect(lang).toBe('javascript');
    });

    it('should detect Python from .py extension', () => {
      const lang = (agent as any).detectLanguageFromFilename('script.py');
      expect(lang).toBe('python');
    });

    it('should detect Rust from .rs extension', () => {
      const lang = (agent as any).detectLanguageFromFilename('main.rs');
      expect(lang).toBe('rust');
    });

    it('should detect Go from .go extension', () => {
      const lang = (agent as any).detectLanguageFromFilename('main.go');
      expect(lang).toBe('go');
    });

    it('should default to text for unknown extensions', () => {
      const lang = (agent as any).detectLanguageFromFilename('README.md');
      expect(lang).toBe('text');
    });
  });

  // =============================================================================
  // Integration Tests
  // =============================================================================

  describe('Full Execution', () => {
    it('should execute successfully without Anthropic API', async () => {
      const result = await agent.execute(1);

      expect(result.status).toBe('success');
      expect(result.data).toBeDefined();
      expect(result.data?.generatedCode).toBeDefined();
      expect(result.data?.metrics).toBeDefined();
      expect(result.metrics.durationMs).toBeGreaterThan(0);
    });

    it('should include timestamp in result', async () => {
      const result = await agent.execute(1);

      expect(result.metrics.timestamp).toBeDefined();
      expect(new Date(result.metrics.timestamp).getTime()).toBeGreaterThan(0);
    });

    it('should generate both main and test files', async () => {
      const result = await agent.execute(1);

      expect(result.data?.generatedCode.length).toBeGreaterThanOrEqual(2);

      const hasMainFile = result.data?.generatedCode.some(
        (f) => !f.filename.includes('.test.')
      );
      const hasTestFile = result.data?.generatedCode.some((f) =>
        f.filename.includes('.test.')
      );

      expect(hasMainFile).toBe(true);
      expect(hasTestFile).toBe(true);
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
