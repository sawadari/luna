/**
 * SSOTAgentV2 Tests - NRVV Extraction (Issue #32)
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SSOTAgentV2 } from '../../src/agents/ssot-agent-v2';
import type { AgentConfig, GitHubIssue } from '../../src/types';

describe('SSOTAgentV2 - NRVV Extraction', () => {
  let agent: SSOTAgentV2;
  let mockConfig: AgentConfig;

  beforeEach(() => {
    mockConfig = {
      githubToken: 'test-token',
      repository: 'test-owner/test-repo',
      verbose: false,
      dryRun: true,
    };

    agent = new SSOTAgentV2(mockConfig);

    // Mock Octokit
    const mockOctokit = {
      issues: {
        get: vi.fn(),
        update: vi.fn(),
        createComment: vi.fn(),
        addLabels: vi.fn(),
      },
    };
    (agent as any).octokit = mockOctokit;
  });

  // =============================================================================
  // Phase 1: Template-based extraction
  // =============================================================================

  describe('Template-based extraction', () => {
    it('should extract basic NRVV from Issue', () => {
      const issue: GitHubIssue = {
        number: 100,
        title: 'Implement JWT Authentication',
        body: 'We need JWT auth for API security',
        labels: [{ name: 'security', color: 'red' }],
        state: 'open',
        created_at: '2025-01-16T00:00:00Z',
        updated_at: '2025-01-16T00:00:00Z',
      };

      const kernel = (agent as any).extractNRVVFromIssueTemplate(issue);

      expect(kernel.id).toMatch(/^KRN-\d{4}$/);
      expect(kernel.statement).toBe('Implement JWT Authentication');
      expect(kernel.category).toBe('security');
      expect(kernel.owner).toBe('CISO');
      expect(kernel.maturity).toBe('draft');
      expect(kernel.sourceIssue).toBe('#100');
      expect(kernel.needs).toHaveLength(1);
      expect(kernel.requirements).toHaveLength(1);
      expect(kernel.verification).toHaveLength(0);
      expect(kernel.validation).toHaveLength(0);
      expect(kernel.tags).toContain('template-based');
      expect(kernel.tags).toContain('auto-generated');
    });

    it('should generate correct NRVV IDs', () => {
      const issue: GitHubIssue = {
        number: 100,
        title: 'Test Issue',
        body: '',
        labels: [],
        state: 'open',
        created_at: '2025-01-16T00:00:00Z',
        updated_at: '2025-01-16T00:00:00Z',
      };

      const kernel = (agent as any).extractNRVVFromIssueTemplate(issue);

      const kernelId = kernel.id.replace('KRN-', '');
      expect(kernel.needs[0].id).toBe(`NEED-KRN-${kernelId}-1`);
      expect(kernel.requirements[0].id).toBe(`REQ-KRN-${kernelId}-1`);
    });

    it('should establish correct traceability links', () => {
      const issue: GitHubIssue = {
        number: 100,
        title: 'Test Issue',
        body: '',
        labels: [],
        state: 'open',
        created_at: '2025-01-16T00:00:00Z',
        updated_at: '2025-01-16T00:00:00Z',
      };

      const kernel = (agent as any).extractNRVVFromIssueTemplate(issue);

      const needId = kernel.needs[0].id;
      const reqId = kernel.requirements[0].id;

      // Need → Requirement
      expect(kernel.needs[0].traceability.upstream).toEqual([]);
      expect(kernel.needs[0].traceability.downstream).toEqual([reqId]);

      // Requirement → Need
      expect(kernel.requirements[0].traceability.upstream).toEqual([needId]);
      expect(kernel.requirements[0].traceability.downstream).toEqual([]);
    });

    it('should infer correct category from labels', () => {
      const testCases = [
        { labels: [{ name: 'security', color: '' }], expected: 'security' },
        { labels: [{ name: 'architecture', color: '' }], expected: 'architecture' },
        { labels: [{ name: 'quality', color: '' }], expected: 'quality' },
        { labels: [{ name: 'interface', color: '' }], expected: 'interface' },
        { labels: [{ name: 'constraint', color: '' }], expected: 'constraint' },
        { labels: [], expected: 'requirement' }, // default
      ];

      for (const { labels, expected } of testCases) {
        const issue = {
          title: 'Test',
          body: '',
          labels,
        } as GitHubIssue;

        const category = (agent as any).inferCategoryFromIssue(issue);
        expect(category).toBe(expected);
      }
    });

    it('should infer category from Issue body text', () => {
      const issue = {
        title: 'Test',
        body: 'This is a security issue with authentication',
        labels: [],
      } as GitHubIssue;

      const category = (agent as any).inferCategoryFromIssue(issue);
      expect(category).toBe('security');
    });

    it('should infer correct owner from labels', () => {
      const testCases = [
        { labels: [{ name: 'security', color: '' }], expected: 'CISO' },
        { labels: [{ name: 'architecture', color: '' }], expected: 'TechLead' },
        { labels: [], expected: 'ProductOwner' }, // default
      ];

      for (const { labels, expected } of testCases) {
        const issue = {
          title: 'Test',
          body: '',
          labels,
        } as GitHubIssue;

        const owner = (agent as any).inferOwnerFromIssue(issue);
        expect(owner).toBe(expected);
      }
    });

    it('should handle Issue with empty body', () => {
      const issue: GitHubIssue = {
        number: 100,
        title: 'Fix bug',
        body: null,
        labels: [],
        state: 'open',
        created_at: '2025-01-16T00:00:00Z',
        updated_at: '2025-01-16T00:00:00Z',
      };

      const kernel = (agent as any).extractNRVVFromIssueTemplate(issue);

      expect(kernel.needs).toHaveLength(1);
      expect(kernel.requirements).toHaveLength(1);
      expect(kernel.statement).toBe('Fix bug');
    });

    it('should handle Issue with only title', () => {
      const issue: GitHubIssue = {
        number: 1,
        title: 'Simple task',
        body: '',
        labels: [],
        state: 'open',
        created_at: '2025-01-16T00:00:00Z',
        updated_at: '2025-01-16T00:00:00Z',
      };

      const kernel = (agent as any).extractNRVVFromIssueTemplate(issue);

      expect(kernel.statement).toBe('Simple task');
      expect(kernel.needs[0].statement).toContain('Simple task');
      expect(kernel.requirements[0].statement).toBe('Simple task');
    });

    it('should set correct maturity and history', () => {
      const issue: GitHubIssue = {
        number: 100,
        title: 'Test',
        body: '',
        labels: [],
        state: 'open',
        created_at: '2025-01-16T00:00:00Z',
        updated_at: '2025-01-16T00:00:00Z',
      };

      const kernel = (agent as any).extractNRVVFromIssueTemplate(issue);

      expect(kernel.maturity).toBe('draft');
      expect(kernel.history).toHaveLength(1);
      expect(kernel.history[0].action).toBe('created');
      expect(kernel.history[0].by).toBe('SSOTAgentV2');
      expect(kernel.history[0].maturity).toBe('draft');
    });

    it('should set correct Need properties', () => {
      const issue: GitHubIssue = {
        number: 100,
        title: 'Test',
        body: '',
        labels: [],
        state: 'open',
        created_at: '2025-01-16T00:00:00Z',
        updated_at: '2025-01-16T00:00:00Z',
      };

      const kernel = (agent as any).extractNRVVFromIssueTemplate(issue);
      const need = kernel.needs[0];

      expect(need.stakeholder).toBe('ProductOwner');
      expect(need.sourceType).toBe('stakeholder_requirement');
      expect(need.priority).toBe('high');
    });

    it('should set correct Requirement properties', () => {
      const issue: GitHubIssue = {
        number: 100,
        title: 'Test',
        body: '',
        labels: [],
        state: 'open',
        created_at: '2025-01-16T00:00:00Z',
        updated_at: '2025-01-16T00:00:00Z',
      };

      const kernel = (agent as any).extractNRVVFromIssueTemplate(issue);
      const req = kernel.requirements[0];

      expect(req.type).toBe('functional');
      expect(req.priority).toBe('must');
      expect(req.rationale).toContain('Issue #100');
    });
  });
});
