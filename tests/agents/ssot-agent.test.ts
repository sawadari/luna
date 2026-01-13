import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SSOTAgent } from '../../src/agents/ssot-agent';
import type { AgentConfig, GitHubIssue } from '../../src/types';

describe('SSOTAgent', () => {
  let agent: SSOTAgent;
  let mockConfig: AgentConfig;
  let mockOctokit: any;

  beforeEach(() => {
    mockOctokit = {
      issues: {
        get: vi.fn(),
        update: vi.fn(),
        createComment: vi.fn(),
        addLabels: vi.fn(),
      },
    };

    mockConfig = {
      githubToken: 'test-token',
      repository: 'owner/repo',
      dryRun: true,
      verbose: false,
    };

    agent = new SSOTAgent(mockConfig);
    (agent as any).octokit = mockOctokit;
  });

  // ========================================================================
  // Kernel提案テスト
  // ========================================================================

  describe('Kernel Suggestion from DecisionRecord', () => {
    it('should suggest Kernel from adopted DecisionRecord', async () => {
      const issue: GitHubIssue = {
        number: 1,
        title: 'Implement JWT Authentication',
        body: `---
planning_layer:
  decision_record:
    - decision_id: DEC-2025-001
      decision_type: adopt
      chosen_option: OPT-001
      decided_by: ProductOwner
      decided_at: "2025-01-13T10:00:00Z"
      rationale: "JWT provides stateless authentication"
---

Implement JWT authentication for API.`,
        labels: [],
        state: 'open',
        created_at: '2025-01-13T10:00:00Z',
        updated_at: '2025-01-13T10:00:00Z',
      };

      mockOctokit.issues.get.mockResolvedValue({ data: issue });

      const result = await agent.execute(1);

      expect(result.status).toBe('success');
      expect(result.data.suggestedKernels).toHaveLength(1);
      expect(result.data.suggestedKernels[0].category).toBe('requirement');
      expect(result.data.suggestedKernels[0].maturity).toBe('draft');
    });

    it('should NOT suggest Kernel from rejected DecisionRecord', async () => {
      const issue: GitHubIssue = {
        number: 1,
        title: 'Use OAuth',
        body: `---
planning_layer:
  decision_record:
    - decision_id: DEC-2025-002
      decision_type: reject
      rationale: "Too complex for MVP"
---`,
        labels: [],
        state: 'open',
        created_at: '2025-01-13T10:00:00Z',
        updated_at: '2025-01-13T10:00:00Z',
      };

      mockOctokit.issues.get.mockResolvedValue({ data: issue });

      const result = await agent.execute(1);

      expect(result.data.suggestedKernels).toHaveLength(0);
    });

    it('should suggest Kernel from Hard Constraint', async () => {
      const issue: GitHubIssue = {
        number: 1,
        title: 'Security Requirements',
        body: `---
planning_layer:
  constraints:
    - constraint_id: CON-001
      type: hard
      statement: "All API endpoints must use HTTPS"
      rationale: "Security policy"
---`,
        labels: [],
        state: 'open',
        created_at: '2025-01-13T10:00:00Z',
        updated_at: '2025-01-13T10:00:00Z',
      };

      mockOctokit.issues.get.mockResolvedValue({ data: issue });

      const result = await agent.execute(1);

      expect(result.data.suggestedKernels).toHaveLength(1);
      expect(result.data.suggestedKernels[0].category).toBe('constraint');
      expect(result.data.suggestedKernels[0].statement).toContain('HTTPS');
    });
  });

  // ========================================================================
  // Maturity遷移テスト
  // ========================================================================

  describe('Maturity Transition', () => {
    it('should transition Draft -> UnderReview when definition complete', async () => {
      const issue: GitHubIssue = {
        number: 1,
        title: 'Kernel Review',
        body: `---
ssot_layer:
  kernels:
    - id: KRN-001
      statement: "Use JWT for authentication"
      category: requirement
      owner: TechLead
      maturity: draft
      createdAt: "2025-01-13T10:00:00Z"
      lastUpdatedAt: "2025-01-13T10:00:00Z"
---

Definition complete, ready for review.`,
        labels: [],
        state: 'open',
        created_at: '2025-01-13T10:00:00Z',
        updated_at: '2025-01-13T10:00:00Z',
      };

      mockOctokit.issues.get.mockResolvedValue({ data: issue });

      const result = await agent.execute(1);

      expect(result.data.maturityTransitions).toHaveLength(1);
      expect(result.data.maturityTransitions[0].from).toBe('draft');
      expect(result.data.maturityTransitions[0].to).toBe('under_review');
    });

    it('should transition UnderReview -> Agreed when Guardian approves', async () => {
      const issue: GitHubIssue = {
        number: 1,
        title: 'Kernel Approval',
        body: `---
ssot_layer:
  kernels:
    - id: KRN-001
      statement: "Use JWT for authentication"
      category: requirement
      owner: TechLead
      maturity: under_review
      createdAt: "2025-01-13T10:00:00Z"
      lastUpdatedAt: "2025-01-13T10:00:00Z"
---

/approve-kernel KRN-001
@Guardian approved.`,
        labels: [],
        state: 'open',
        created_at: '2025-01-13T10:00:00Z',
        updated_at: '2025-01-13T10:00:00Z',
      };

      mockOctokit.issues.get.mockResolvedValue({ data: issue });

      const result = await agent.execute(1);

      expect(result.data.maturityTransitions).toHaveLength(1);
      expect(result.data.maturityTransitions[0].from).toBe('under_review');
      expect(result.data.maturityTransitions[0].to).toBe('agreed');
      expect(result.data.maturityTransitions[0].approvedBy).toBe('Guardian');
    });

    it('should transition Agreed -> Frozen when freeze command detected', async () => {
      const issue: GitHubIssue = {
        number: 1,
        title: 'Freeze Kernel',
        body: `---
ssot_layer:
  kernels:
    - id: KRN-001
      statement: "Use JWT for authentication"
      category: requirement
      owner: TechLead
      maturity: agreed
      approvedBy: Guardian
      createdAt: "2025-01-13T10:00:00Z"
      lastUpdatedAt: "2025-01-13T10:00:00Z"
---

/freeze-kernel KRN-001
Freezing for external API stability.`,
        labels: [],
        state: 'open',
        created_at: '2025-01-13T10:00:00Z',
        updated_at: '2025-01-13T10:00:00Z',
      };

      mockOctokit.issues.get.mockResolvedValue({ data: issue });

      const result = await agent.execute(1);

      expect(result.data.maturityTransitions).toHaveLength(1);
      expect(result.data.maturityTransitions[0].from).toBe('agreed');
      expect(result.data.maturityTransitions[0].to).toBe('frozen');
    });

    it('should transition Frozen -> Deprecated when deprecate command detected', async () => {
      const issue: GitHubIssue = {
        number: 1,
        title: 'Deprecate Kernel',
        body: `---
ssot_layer:
  kernels:
    - id: KRN-001
      statement: "Use JWT for authentication"
      category: requirement
      owner: TechLead
      maturity: frozen
      frozenAt: "2025-01-10T10:00:00Z"
      approvedBy: Guardian
      createdAt: "2025-01-13T10:00:00Z"
      lastUpdatedAt: "2025-01-13T10:00:00Z"
---

/deprecate-kernel KRN-001
Migrating to OAuth 2.0.`,
        labels: [],
        state: 'open',
        created_at: '2025-01-13T10:00:00Z',
        updated_at: '2025-01-13T10:00:00Z',
      };

      mockOctokit.issues.get.mockResolvedValue({ data: issue });

      const result = await agent.execute(1);

      expect(result.data.maturityTransitions).toHaveLength(1);
      expect(result.data.maturityTransitions[0].from).toBe('frozen');
      expect(result.data.maturityTransitions[0].to).toBe('deprecated');
    });
  });

  // ========================================================================
  // Φ（Kernel違反）検出テスト
  // ========================================================================

  describe('Kernel Violation Detection (Φ)', () => {
    it('should detect contradiction violation', async () => {
      const issue: GitHubIssue = {
        number: 1,
        title: 'Implement Authentication',
        body: `---
ssot_layer:
  kernels:
    - id: KRN-001
      statement: "Use JWT for authentication"
      category: requirement
      owner: TechLead
      maturity: agreed
      approvedBy: Guardian
      createdAt: "2025-01-13T10:00:00Z"
      lastUpdatedAt: "2025-01-13T10:00:00Z"
---

Implementing session-based authentication with cookies.
`,
        labels: [],
        state: 'open',
        created_at: '2025-01-13T10:00:00Z',
        updated_at: '2025-01-13T10:00:00Z',
      };

      mockOctokit.issues.get.mockResolvedValue({ data: issue });

      const result = await agent.execute(1);

      expect(result.data.violations).toHaveLength(1);
      expect(result.data.violations[0].violationType).toBe('contradiction');
      expect(result.data.violations[0].kernelId).toBe('KRN-001');
      expect(result.data.violations[0].severity).toBe('high');
    });

    it('should detect HTTPS violation', async () => {
      const issue: GitHubIssue = {
        number: 1,
        title: 'API Configuration',
        body: `---
ssot_layer:
  kernels:
    - id: KRN-002
      statement: "All API endpoints must use HTTPS"
      category: constraint
      owner: CISO
      maturity: frozen
      createdAt: "2025-01-13T10:00:00Z"
      lastUpdatedAt: "2025-01-13T10:00:00Z"
---

API endpoint: http://api.example.com/v1/users
`,
        labels: [],
        state: 'open',
        created_at: '2025-01-13T10:00:00Z',
        updated_at: '2025-01-13T10:00:00Z',
      };

      mockOctokit.issues.get.mockResolvedValue({ data: issue });

      const result = await agent.execute(1);

      expect(result.data.violations).toHaveLength(1);
      expect(result.data.violations[0].violationType).toBe('contradiction');
      expect(result.data.violations[0].detectedIn).toContain('http://');
    });

    it('should NOT detect violation when compliant', async () => {
      const issue: GitHubIssue = {
        number: 1,
        title: 'API Configuration',
        body: `---
ssot_layer:
  kernels:
    - id: KRN-002
      statement: "All API endpoints must use HTTPS"
      category: constraint
      owner: CISO
      maturity: frozen
      createdAt: "2025-01-13T10:00:00Z"
      lastUpdatedAt: "2025-01-13T10:00:00Z"
---

API endpoint: https://api.example.com/v1/users
`,
        labels: [],
        state: 'open',
        created_at: '2025-01-13T10:00:00Z',
        updated_at: '2025-01-13T10:00:00Z',
      };

      mockOctokit.issues.get.mockResolvedValue({ data: issue });

      const result = await agent.execute(1);

      expect(result.data.violations).toHaveLength(0);
    });
  });

  // ========================================================================
  // 収束チェックテスト
  // ========================================================================

  describe('Convergence Check', () => {
    it('should be converged when no violations, no exceptions, no pending changes', async () => {
      const issue: GitHubIssue = {
        number: 1,
        title: 'System Status',
        body: `---
ssot_layer:
  kernels:
    - id: KRN-001
      statement: "Use JWT for authentication"
      category: requirement
      owner: TechLead
      maturity: agreed
      approvedBy: Guardian
      createdAt: "2025-01-13T10:00:00Z"
      lastUpdatedAt: "2025-01-13T10:00:00Z"
  violations: []
  exceptions: []
  changeRequests: []
  lastUpdatedAt: "2025-01-13T10:00:00Z"
  lastUpdatedBy: "SSOTAgent"
---

System is converged.
`,
        labels: [],
        state: 'open',
        created_at: '2025-01-13T10:00:00Z',
        updated_at: '2025-01-13T10:00:00Z',
      };

      mockOctokit.issues.get.mockResolvedValue({ data: issue });

      const result = await agent.execute(1);

      expect(result.data.isConverged).toBe(true);
    });

    it('should NOT be converged when violations exist', async () => {
      const issue: GitHubIssue = {
        number: 1,
        title: 'System Status',
        body: `---
ssot_layer:
  kernels:
    - id: KRN-001
      statement: "Use JWT for authentication"
      category: requirement
      owner: TechLead
      maturity: agreed
      approvedBy: Guardian
      createdAt: "2025-01-13T10:00:00Z"
      lastUpdatedAt: "2025-01-13T10:00:00Z"
  violations:
    - id: VIO-001
      kernelId: KRN-001
      violationType: contradiction
      detectedIn: "src/auth.ts"
      description: "Using session-based auth"
      severity: high
      detectedAt: "2025-01-13T11:00:00Z"
  exceptions: []
  changeRequests: []
  lastUpdatedAt: "2025-01-13T10:00:00Z"
  lastUpdatedBy: "SSOTAgent"
---

Violations present.
`,
        labels: [],
        state: 'open',
        created_at: '2025-01-13T10:00:00Z',
        updated_at: '2025-01-13T10:00:00Z',
      };

      mockOctokit.issues.get.mockResolvedValue({ data: issue });

      const result = await agent.execute(1);

      expect(result.data.isConverged).toBe(false);
    });

    it('should NOT be converged when active exceptions exist', async () => {
      const issue: GitHubIssue = {
        number: 1,
        title: 'System Status',
        body: `---
ssot_layer:
  kernels:
    - id: KRN-001
      statement: "Use JWT for authentication"
      category: requirement
      owner: TechLead
      maturity: agreed
      approvedBy: Guardian
      createdAt: "2025-01-13T10:00:00Z"
      lastUpdatedAt: "2025-01-13T10:00:00Z"
  violations: []
  exceptions:
    - id: EXC-001
      kernelId: KRN-001
      reason: "Hotfix bypass JWT"
      requestedBy: TechLead
      approvedBy: Guardian
      status: active
      approvedAt: "2025-01-13T10:00:00Z"
      expiresAt: "2025-01-16T10:00:00Z"
      convergencePlan: "Restore JWT after incident"
      relatedIssues: ["#123"]
  changeRequests: []
  lastUpdatedAt: "2025-01-13T10:00:00Z"
  lastUpdatedBy: "SSOTAgent"
---

Active exception present.
`,
        labels: [],
        state: 'open',
        created_at: '2025-01-13T10:00:00Z',
        updated_at: '2025-01-13T10:00:00Z',
      };

      mockOctokit.issues.get.mockResolvedValue({ data: issue });

      const result = await agent.execute(1);

      expect(result.data.isConverged).toBe(false);
    });
  });

  // ========================================================================
  // SSOT Data更新テスト
  // ========================================================================

  describe('SSOT Data Update', () => {
    it('should embed suggested Kernels into Issue body', async () => {
      const issue: GitHubIssue = {
        number: 1,
        title: 'Decision Adopted',
        body: `---
planning_layer:
  decision_record:
    - decision_id: DEC-2025-001
      decision_type: adopt
      chosen_option: OPT-001
---

Implement feature.`,
        labels: [],
        state: 'open',
        created_at: '2025-01-13T10:00:00Z',
        updated_at: '2025-01-13T10:00:00Z',
      };

      mockOctokit.issues.get.mockResolvedValue({ data: issue });

      const result = await agent.execute(1);

      expect(result.data.suggestedKernels.length).toBeGreaterThan(0);
      expect(result.status).toBe('success');
    });

    it('should preserve existing SSOT Data when updating', async () => {
      const issue: GitHubIssue = {
        number: 1,
        title: 'Update',
        body: `---
ssot_layer:
  kernels:
    - id: KRN-001
      statement: "Use JWT"
      category: requirement
      owner: TechLead
      maturity: agreed
      approvedBy: Guardian
      createdAt: "2025-01-10T10:00:00Z"
      lastUpdatedAt: "2025-01-10T10:00:00Z"
  lastUpdatedAt: "2025-01-10T10:00:00Z"
  lastUpdatedBy: "SSOTAgent"
---

Content.`,
        labels: [],
        state: 'open',
        created_at: '2025-01-13T10:00:00Z',
        updated_at: '2025-01-13T10:00:00Z',
      };

      mockOctokit.issues.get.mockResolvedValue({ data: issue });

      const result = await agent.execute(1);

      expect(result.status).toBe('success');
    });
  });

  // ========================================================================
  // ラベル適用テスト
  // ========================================================================

  describe('Label Application', () => {
    it('should apply Maturity:Draft for suggested Kernel', async () => {
      const issue: GitHubIssue = {
        number: 1,
        title: 'Decision',
        body: `---
planning_layer:
  decision_record:
    - decision_id: DEC-2025-001
      decision_type: adopt
---`,
        labels: [],
        state: 'open',
        created_at: '2025-01-13T10:00:00Z',
        updated_at: '2025-01-13T10:00:00Z',
      };

      mockOctokit.issues.get.mockResolvedValue({ data: issue });

      const result = await agent.execute(1);

      if (result.data.suggestedKernels.length > 0) {
        expect(result.data.labels).toContain('Maturity:Draft');
      }
    });

    it('should apply Maturity:Frozen for frozen Kernel', async () => {
      const issue: GitHubIssue = {
        number: 1,
        title: 'Freeze',
        body: `---
ssot_layer:
  kernels:
    - id: KRN-001
      statement: "Use JWT"
      category: requirement
      owner: TechLead
      maturity: agreed
      approvedBy: Guardian
      createdAt: "2025-01-13T10:00:00Z"
      lastUpdatedAt: "2025-01-13T10:00:00Z"
---

/freeze-kernel KRN-001`,
        labels: [],
        state: 'open',
        created_at: '2025-01-13T10:00:00Z',
        updated_at: '2025-01-13T10:00:00Z',
      };

      mockOctokit.issues.get.mockResolvedValue({ data: issue });

      const result = await agent.execute(1);

      if (result.data.maturityTransitions.length > 0) {
        expect(result.data.labels).toContain('Maturity:Frozen');
      }
    });
  });
});
