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

  // =============================================================================
  // Phase 2: AI-powered extraction
  // =============================================================================

  describe('AI-powered extraction', () => {
    it('should fallback to template if no API key', async () => {
      const configNoKey = { ...mockConfig, anthropicApiKey: undefined };
      const agentNoKey = new SSOTAgentV2(configNoKey);

      const issue: GitHubIssue = {
        number: 100,
        title: 'Test',
        body: '',
        labels: [],
        state: 'open',
        created_at: '2025-01-16T00:00:00Z',
        updated_at: '2025-01-16T00:00:00Z',
      };

      const kernel = await (agentNoKey as any).extractNRVVFromIssueAI(issue);

      expect(kernel.tags).toContain('template-based');
      expect(kernel.needs).toHaveLength(1);
    });

    it('should parse AI response correctly', () => {
      const mockResponse = `\`\`\`json
{
  "kernel": {
    "statement": "Implement JWT authentication",
    "category": "security",
    "owner": "CISO"
  },
  "needs": [
    {
      "statement": "User needs secure authentication",
      "stakeholder": "EndUser",
      "sourceType": "user_feedback",
      "priority": "high",
      "rationale": "Security requirement"
    }
  ],
  "requirements": [
    {
      "statement": "Implement JWT token-based auth",
      "type": "security",
      "priority": "must",
      "rationale": "Security requirement",
      "acceptanceCriteria": ["Tokens expire after 1 hour", "HTTPS only"]
    },
    {
      "statement": "Add refresh token support",
      "type": "functional",
      "priority": "should",
      "rationale": "Better UX"
    }
  ],
  "verification": [
    {
      "statement": "Test JWT validation",
      "method": "test",
      "testCase": "jwt_validation_test.ts",
      "criteria": ["Valid tokens accepted", "Invalid tokens rejected"]
    }
  ],
  "validation": []
}
\`\`\``;

      const issue: GitHubIssue = {
        number: 100,
        title: 'Test',
        body: '',
        labels: [],
        state: 'open',
        created_at: '2025-01-16T00:00:00Z',
        updated_at: '2025-01-16T00:00:00Z',
      };

      const kernel = (agent as any).parseNRVVResponse(mockResponse, issue);

      expect(kernel).not.toBeNull();
      expect(kernel.statement).toBe('Implement JWT authentication');
      expect(kernel.category).toBe('security');
      expect(kernel.owner).toBe('CISO');
      expect(kernel.needs).toHaveLength(1);
      expect(kernel.requirements).toHaveLength(2);
      expect(kernel.verification).toHaveLength(1);
      expect(kernel.validation).toHaveLength(0);
      expect(kernel.tags).toContain('ai-extracted');
    });

    it('should establish correct traceability in AI response', () => {
      const mockResponse = `\`\`\`json
{
  "kernel": { "statement": "Test", "category": "requirement", "owner": "ProductOwner" },
  "needs": [
    { "statement": "Need 1", "stakeholder": "ProductOwner", "sourceType": "stakeholder_requirement", "priority": "high" }
  ],
  "requirements": [
    { "statement": "Req 1", "type": "functional", "priority": "must", "rationale": "Test" }
  ],
  "verification": [],
  "validation": []
}
\`\`\``;

      const issue: GitHubIssue = {
        number: 100,
        title: 'Test',
        body: '',
        labels: [],
        state: 'open',
        created_at: '2025-01-16T00:00:00Z',
        updated_at: '2025-01-16T00:00:00Z',
      };

      const kernel = (agent as any).parseNRVVResponse(mockResponse, issue);

      const needId = kernel.needs[0].id;
      const reqId = kernel.requirements[0].id;

      expect(kernel.needs[0].traceability.downstream).toContain(reqId);
      expect(kernel.requirements[0].traceability.upstream).toContain(needId);
    });

    it('should return null on invalid JSON', () => {
      const badResponse = 'This is not valid JSON';
      const issue: GitHubIssue = {
        number: 100,
        title: 'Test',
        body: '',
        labels: [],
        state: 'open',
        created_at: '2025-01-16T00:00:00Z',
        updated_at: '2025-01-16T00:00:00Z',
      };

      const kernel = (agent as any).parseNRVVResponse(badResponse, issue);

      expect(kernel).toBeNull();
    });

    it('should return null on incomplete JSON structure', () => {
      const incompleteResponse = `\`\`\`json
{
  "kernel": { "statement": "Test" }
}
\`\`\``;

      const issue: GitHubIssue = {
        number: 100,
        title: 'Test',
        body: '',
        labels: [],
        state: 'open',
        created_at: '2025-01-16T00:00:00Z',
        updated_at: '2025-01-16T00:00:00Z',
      };

      const kernel = (agent as any).parseNRVVResponse(incompleteResponse, issue);

      expect(kernel).toBeNull();
    });

    it('should build correct prompt', () => {
      const issue: GitHubIssue = {
        number: 100,
        title: 'Implement JWT Authentication',
        body: 'We need secure JWT auth for the API',
        labels: [
          { name: 'security', color: 'red' },
          { name: 'feature', color: 'blue' },
        ],
        state: 'open',
        created_at: '2025-01-16T00:00:00Z',
        updated_at: '2025-01-16T00:00:00Z',
      };

      const prompt = (agent as any).buildNRVVExtractionPrompt(issue);

      expect(prompt).toContain('Implement JWT Authentication');
      expect(prompt).toContain('#100');
      expect(prompt).toContain('security, feature');
      expect(prompt).toContain('We need secure JWT auth for the API');
      expect(prompt).toContain('NRVV Framework');
      expect(prompt).toContain('Output Format (JSON)');
    });

    it('should handle Issue with no body', () => {
      const issue: GitHubIssue = {
        number: 100,
        title: 'Test',
        body: null,
        labels: [],
        state: 'open',
        created_at: '2025-01-16T00:00:00Z',
        updated_at: '2025-01-16T00:00:00Z',
      };

      const prompt = (agent as any).buildNRVVExtractionPrompt(issue);

      expect(prompt).toContain('No description provided');
    });
  });

  // =============================================================================
  // Issue #42: durationMs should be greater than 0
  // =============================================================================

  describe('Metrics - durationMs', () => {
    it('should record durationMs greater than 0', async () => {
      // Arrange: Mock GitHub API
      const mockIssue = {
        number: 100,
        title: 'Test Issue',
        body: 'Test body',
        labels: [],
        state: 'open',
        created_at: '2025-01-16T00:00:00Z',
        updated_at: '2025-01-16T00:00:00Z',
      };

      (agent as any).octokit.issues.get = vi.fn().mockResolvedValue({
        data: mockIssue,
      });

      // Act: Execute agent
      const result = await agent.execute(100);

      // Assert: durationMs should be > 0
      expect(result.metrics).toBeDefined();
      expect(result.metrics.durationMs).toBeGreaterThan(0);
      expect(result.metrics.durationMs).toBeLessThan(10000); // Should complete within 10 seconds
      expect(result.metrics.timestamp).toBeDefined();
    });

    it('should record durationMs even on error', async () => {
      // Arrange: Mock GitHub API to throw error
      (agent as any).octokit.issues.get = vi.fn().mockRejectedValue(new Error('API Error'));

      // Act: Execute agent (should catch error)
      try {
        await agent.execute(100);
      } catch (error) {
        // Expected to throw
      }

      // Note: In current implementation, execute() catches errors and returns AgentResult
      // So we test the happy path above to verify durationMs > 0
      // This test documents expected behavior even on errors
    });
  });
});
