import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ExceptionRegistryAgent } from '../../src/agents/exception-registry-agent';
import type { AgentConfig, GitHubIssue } from '../../src/types';

describe('ExceptionRegistryAgent', () => {
  let agent: ExceptionRegistryAgent;
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

    agent = new ExceptionRegistryAgent(mockConfig);
    (agent as any).octokit = mockOctokit;
  });

  // ========================================================================
  // Exception申請検出テスト
  // ========================================================================

  describe('Exception Request Detection', () => {
    it('should detect /request-exception command', async () => {
      const issue: GitHubIssue = {
        number: 1,
        title: 'Hotfix Request',
        body: `/request-exception KRN-001
Reason: Production incident - need to bypass JWT validation temporarily
Duration: 3 days
Convergence Plan: Restore JWT validation after incident resolution
Related Issues: #123, #124`,
        labels: [],
        state: 'open',
        created_at: '2025-01-13T10:00:00Z',
        updated_at: '2025-01-13T10:00:00Z',
      };

      mockOctokit.issues.get.mockResolvedValue({ data: issue });

      const result = await agent.execute(1);

      expect(result.status).toBe('success');
      expect(result.data.createdExceptions).toHaveLength(1);
      expect(result.data.createdExceptions[0].kernelId).toBe('KRN-001');
      expect(result.data.createdExceptions[0].reason).toContain('Production incident');
      expect(result.data.createdExceptions[0].status).toBe('active');
    });

    it('should parse duration correctly', async () => {
      const issue: GitHubIssue = {
        number: 1,
        title: 'Exception Request',
        body: `/request-exception KRN-002
Reason: POC experiment
Duration: 7 days
Convergence Plan: Complete POC evaluation
Related Issues: #200`,
        labels: [],
        state: 'open',
        created_at: '2025-01-13T10:00:00Z',
        updated_at: '2025-01-13T10:00:00Z',
      };

      mockOctokit.issues.get.mockResolvedValue({ data: issue });

      const result = await agent.execute(1);

      expect(result.data.createdExceptions).toHaveLength(1);

      const expiresAt = new Date(result.data.createdExceptions[0].expiresAt);
      const approvedAt = new Date(result.data.createdExceptions[0].approvedAt);
      const diffDays = Math.round((expiresAt.getTime() - approvedAt.getTime()) / (24 * 60 * 60 * 1000));

      expect(diffDays).toBe(7);
    });

    it('should extract related issues', async () => {
      const issue: GitHubIssue = {
        number: 1,
        title: 'Exception',
        body: `/request-exception KRN-001
Reason: Hotfix
Duration: 3 days
Convergence Plan: Fix and restore
Related Issues: #100, #101, #102`,
        labels: [],
        state: 'open',
        created_at: '2025-01-13T10:00:00Z',
        updated_at: '2025-01-13T10:00:00Z',
      };

      mockOctokit.issues.get.mockResolvedValue({ data: issue });

      const result = await agent.execute(1);

      expect(result.data.createdExceptions[0].relatedIssues).toEqual(['#100', '#101', '#102']);
    });
  });

  // ========================================================================
  // Exception作成テスト
  // ========================================================================

  describe('Exception Creation', () => {
    it('should generate unique Exception ID', async () => {
      const issue: GitHubIssue = {
        number: 1,
        title: 'Exception',
        body: `/request-exception KRN-001
Reason: Test
Duration: 3 days
Convergence Plan: Plan`,
        labels: [],
        state: 'open',
        created_at: '2025-01-13T10:00:00Z',
        updated_at: '2025-01-13T10:00:00Z',
      };

      mockOctokit.issues.get.mockResolvedValue({ data: issue });

      const result = await agent.execute(1);

      expect(result.data.createdExceptions[0].id).toMatch(/^EXC-\d{3}$/);
    });

    it('should set status to active', async () => {
      const issue: GitHubIssue = {
        number: 1,
        title: 'Exception',
        body: `/request-exception KRN-001
Reason: Test
Duration: 3 days
Convergence Plan: Plan`,
        labels: [],
        state: 'open',
        created_at: '2025-01-13T10:00:00Z',
        updated_at: '2025-01-13T10:00:00Z',
      };

      mockOctokit.issues.get.mockResolvedValue({ data: issue });

      const result = await agent.execute(1);

      expect(result.data.createdExceptions[0].status).toBe('active');
    });

    it('should apply Exception:Active label', async () => {
      const issue: GitHubIssue = {
        number: 1,
        title: 'Exception',
        body: `/request-exception KRN-001
Reason: Test
Duration: 3 days
Convergence Plan: Plan`,
        labels: [],
        state: 'open',
        created_at: '2025-01-13T10:00:00Z',
        updated_at: '2025-01-13T10:00:00Z',
      };

      mockOctokit.issues.get.mockResolvedValue({ data: issue });

      const result = await agent.execute(1);

      expect(result.data.labels).toContain('Exception:Active');
    });
  });

  // ========================================================================
  // 期限切れ検出テスト
  // ========================================================================

  describe('Exception Expiration Detection', () => {
    it('should detect expired exception', async () => {
      const pastDate = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(); // 5 days ago

      const issue: GitHubIssue = {
        number: 1,
        title: 'Expired Exception',
        body: `---
ssot_layer:
  exceptions:
    - id: EXC-001
      kernelId: KRN-001
      reason: "Hotfix"
      requestedBy: TechLead
      approvedBy: Guardian
      status: active
      approvedAt: "${pastDate}"
      expiresAt: "${new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString()}"
      convergencePlan: "Restore after fix"
      relatedIssues: ["#123"]
  lastUpdatedAt: "${pastDate}"
  lastUpdatedBy: "ExceptionRegistryAgent"
---

Checking expiration.`,
        labels: [],
        state: 'open',
        created_at: '2025-01-13T10:00:00Z',
        updated_at: '2025-01-13T10:00:00Z',
      };

      mockOctokit.issues.get.mockResolvedValue({ data: issue });

      const result = await agent.execute(1);

      expect(result.data.expiredExceptions).toHaveLength(1);
      expect(result.data.expiredExceptions[0].status).toBe('expired');
      expect(result.data.expiredExceptions[0].expiredAt).toBeDefined();
    });

    it('should NOT detect non-expired exception', async () => {
      const futureDate = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(); // 5 days future

      const issue: GitHubIssue = {
        number: 1,
        title: 'Active Exception',
        body: `---
ssot_layer:
  exceptions:
    - id: EXC-001
      kernelId: KRN-001
      reason: "Hotfix"
      status: active
      approvedAt: "${new Date().toISOString()}"
      expiresAt: "${futureDate}"
      convergencePlan: "Plan"
      relatedIssues: ["#123"]
---`,
        labels: [],
        state: 'open',
        created_at: '2025-01-13T10:00:00Z',
        updated_at: '2025-01-13T10:00:00Z',
      };

      mockOctokit.issues.get.mockResolvedValue({ data: issue });

      const result = await agent.execute(1);

      expect(result.data.expiredExceptions).toHaveLength(0);
    });

    it('should apply Exception:Expired label', async () => {
      const pastDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();

      const issue: GitHubIssue = {
        number: 1,
        title: 'Expired',
        body: `---
ssot_layer:
  exceptions:
    - id: EXC-001
      kernelId: KRN-001
      reason: "Hotfix"
      status: active
      approvedAt: "${pastDate}"
      expiresAt: "${pastDate}"
      convergencePlan: "Plan"
      relatedIssues: []
---`,
        labels: [],
        state: 'open',
        created_at: '2025-01-13T10:00:00Z',
        updated_at: '2025-01-13T10:00:00Z',
      };

      mockOctokit.issues.get.mockResolvedValue({ data: issue });

      const result = await agent.execute(1);

      expect(result.data.labels).toContain('Exception:Expired');
    });
  });

  // ========================================================================
  // Exception延長テスト
  // ========================================================================

  describe('Exception Extension', () => {
    it('should extend exception when /extend-exception command detected', async () => {
      const issue: GitHubIssue = {
        number: 1,
        title: 'Extension Request',
        body: `---
ssot_layer:
  exceptions:
    - id: EXC-001
      kernelId: KRN-001
      reason: "Hotfix"
      status: active
      approvedAt: "2025-01-13T10:00:00Z"
      expiresAt: "2025-01-16T10:00:00Z"
      convergencePlan: "Plan"
      relatedIssues: []
---

/extend-exception EXC-001
Reason: Incident resolution delayed, need 2 more days
New Expiry: 2025-01-18T10:00:00Z`,
        labels: [],
        state: 'open',
        created_at: '2025-01-13T10:00:00Z',
        updated_at: '2025-01-13T10:00:00Z',
      };

      mockOctokit.issues.get.mockResolvedValue({ data: issue });

      const result = await agent.execute(1);

      expect(result.data.extendedExceptions).toHaveLength(1);
      expect(result.data.extendedExceptions[0].expiresAt).toBe('2025-01-18T10:00:00Z');
      expect(result.data.extendedExceptions[0].extendedAt).toBeDefined();
    });

    it('should record extension reason', async () => {
      const issue: GitHubIssue = {
        number: 1,
        title: 'Extension',
        body: `---
ssot_layer:
  exceptions:
    - id: EXC-001
      kernelId: KRN-001
      status: active
      approvedAt: "2025-01-13T10:00:00Z"
      expiresAt: "2025-01-16T10:00:00Z"
      convergencePlan: "Plan"
      relatedIssues: []
---

/extend-exception EXC-001
Reason: Complex incident investigation
New Expiry: 2025-01-19T10:00:00Z`,
        labels: [],
        state: 'open',
        created_at: '2025-01-13T10:00:00Z',
        updated_at: '2025-01-13T10:00:00Z',
      };

      mockOctokit.issues.get.mockResolvedValue({ data: issue });

      const result = await agent.execute(1);

      expect(result.data.extendedExceptions[0].extendedReason).toContain('Complex incident');
    });

    it('should NOT extend non-active exception', async () => {
      const issue: GitHubIssue = {
        number: 1,
        title: 'Extension Failed',
        body: `---
ssot_layer:
  exceptions:
    - id: EXC-001
      kernelId: KRN-001
      status: expired
      expiresAt: "2025-01-10T10:00:00Z"
      convergencePlan: "Plan"
      relatedIssues: []
---

/extend-exception EXC-001
Reason: Try to extend expired
New Expiry: 2025-01-20T10:00:00Z`,
        labels: [],
        state: 'open',
        created_at: '2025-01-13T10:00:00Z',
        updated_at: '2025-01-13T10:00:00Z',
      };

      mockOctokit.issues.get.mockResolvedValue({ data: issue });

      const result = await agent.execute(1);

      expect(result.data.extendedExceptions).toHaveLength(0);
    });
  });

  // ========================================================================
  // Timeout計算テスト
  // ========================================================================

  describe('Timeout Calculation', () => {
    it('should calculate 3 days for hotfix', async () => {
      const issue: GitHubIssue = {
        number: 1,
        title: 'Hotfix',
        body: `/request-exception KRN-001
Reason: Emergency hotfix for production incident
Duration: 3 days
Convergence Plan: Fix and restore`,
        labels: [],
        state: 'open',
        created_at: '2025-01-13T10:00:00Z',
        updated_at: '2025-01-13T10:00:00Z',
      };

      mockOctokit.issues.get.mockResolvedValue({ data: issue });

      const result = await agent.execute(1);

      const expiresAt = new Date(result.data.createdExceptions[0].expiresAt);
      const approvedAt = new Date(result.data.createdExceptions[0].approvedAt);
      const diffDays = Math.round((expiresAt.getTime() - approvedAt.getTime()) / (24 * 60 * 60 * 1000));

      expect(diffDays).toBe(3);
    });

    it('should calculate 7 days for POC', async () => {
      const issue: GitHubIssue = {
        number: 1,
        title: 'POC',
        body: `/request-exception KRN-002
Reason: POC experiment for new feature
Duration: 7 days
Convergence Plan: Evaluate POC results`,
        labels: [],
        state: 'open',
        created_at: '2025-01-13T10:00:00Z',
        updated_at: '2025-01-13T10:00:00Z',
      };

      mockOctokit.issues.get.mockResolvedValue({ data: issue });

      const result = await agent.execute(1);

      const expiresAt = new Date(result.data.createdExceptions[0].expiresAt);
      const approvedAt = new Date(result.data.createdExceptions[0].approvedAt);
      const diffDays = Math.round((expiresAt.getTime() - approvedAt.getTime()) / (24 * 60 * 60 * 1000));

      expect(diffDays).toBe(7);
    });
  });

  // ========================================================================
  // 収束進捗チェックテスト
  // ========================================================================

  describe('Convergence Progress Check', () => {
    it('should check convergence progress', async () => {
      const issue: GitHubIssue = {
        number: 1,
        title: 'Progress Check',
        body: `---
ssot_layer:
  exceptions:
    - id: EXC-001
      kernelId: KRN-001
      reason: "Hotfix"
      status: active
      approvedAt: "2025-01-13T10:00:00Z"
      expiresAt: "${new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString()}"
      convergencePlan: "Plan"
      relatedIssues: ["#100", "#101"]
---`,
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
  // SSOT Data更新テスト
  // ========================================================================

  describe('SSOT Data Update', () => {
    it('should add created exception to SSOT Data', async () => {
      const issue: GitHubIssue = {
        number: 1,
        title: 'Add Exception',
        body: `/request-exception KRN-001
Reason: Test
Duration: 3 days
Convergence Plan: Plan`,
        labels: [],
        state: 'open',
        created_at: '2025-01-13T10:00:00Z',
        updated_at: '2025-01-13T10:00:00Z',
      };

      mockOctokit.issues.get.mockResolvedValue({ data: issue });

      const result = await agent.execute(1);

      expect(result.data.createdExceptions.length).toBeGreaterThan(0);
    });

    it('should update exception status to expired', async () => {
      const pastDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();

      const issue: GitHubIssue = {
        number: 1,
        title: 'Update Status',
        body: `---
ssot_layer:
  exceptions:
    - id: EXC-001
      kernelId: KRN-001
      status: active
      approvedAt: "${pastDate}"
      expiresAt: "${pastDate}"
      convergencePlan: "Plan"
      relatedIssues: []
---`,
        labels: [],
        state: 'open',
        created_at: '2025-01-13T10:00:00Z',
        updated_at: '2025-01-13T10:00:00Z',
      };

      mockOctokit.issues.get.mockResolvedValue({ data: issue });

      const result = await agent.execute(1);

      expect(result.data.expiredExceptions[0].status).toBe('expired');
    });
  });

  // ========================================================================
  // Comment生成テスト
  // ========================================================================

  describe('Comment Generation', () => {
    it('should generate exception request comment', async () => {
      const issue: GitHubIssue = {
        number: 1,
        title: 'Request',
        body: `/request-exception KRN-001
Reason: Hotfix
Duration: 3 days
Convergence Plan: Plan`,
        labels: [],
        state: 'open',
        created_at: '2025-01-13T10:00:00Z',
        updated_at: '2025-01-13T10:00:00Z',
      };

      mockOctokit.issues.get.mockResolvedValue({ data: issue });

      const result = await agent.execute(1);

      expect(result.data.comments).toHaveLength(1);
      expect(result.data.comments[0]).toContain('Exception Request');
      expect(result.data.comments[0]).toContain('/approve-exception');
    });

    it('should generate expiration alert comment', async () => {
      const pastDate = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString();

      const issue: GitHubIssue = {
        number: 1,
        title: 'Expired',
        body: `---
ssot_layer:
  exceptions:
    - id: EXC-001
      kernelId: KRN-001
      reason: "Hotfix"
      status: active
      approvedAt: "${pastDate}"
      expiresAt: "${pastDate}"
      convergencePlan: "Plan"
      relatedIssues: ["#123"]
---`,
        labels: [],
        state: 'open',
        created_at: '2025-01-13T10:00:00Z',
        updated_at: '2025-01-13T10:00:00Z',
      };

      mockOctokit.issues.get.mockResolvedValue({ data: issue });

      const result = await agent.execute(1);

      expect(result.data.comments).toHaveLength(1);
      expect(result.data.comments[0]).toContain('Exception Expired');
      expect(result.data.comments[0]).toContain('Escalation');
    });

    it('should generate extension comment', async () => {
      const issue: GitHubIssue = {
        number: 1,
        title: 'Extension',
        body: `---
ssot_layer:
  exceptions:
    - id: EXC-001
      kernelId: KRN-001
      status: active
      approvedAt: "2025-01-13T10:00:00Z"
      expiresAt: "2025-01-16T10:00:00Z"
      convergencePlan: "Plan"
      relatedIssues: []
---

/extend-exception EXC-001
Reason: Need more time
New Expiry: 2025-01-18T10:00:00Z`,
        labels: [],
        state: 'open',
        created_at: '2025-01-13T10:00:00Z',
        updated_at: '2025-01-13T10:00:00Z',
      };

      mockOctokit.issues.get.mockResolvedValue({ data: issue });

      const result = await agent.execute(1);

      expect(result.data.comments).toHaveLength(1);
      expect(result.data.comments[0]).toContain('Exception Extended');
    });
  });

  // ========================================================================
  // エスカレーションテスト
  // ========================================================================

  describe('Escalation', () => {
    it('should escalate expired exception', async () => {
      const pastDate = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString();

      const issue: GitHubIssue = {
        number: 1,
        title: 'Escalate',
        body: `---
ssot_layer:
  exceptions:
    - id: EXC-001
      kernelId: KRN-001
      status: active
      approvedAt: "${pastDate}"
      expiresAt: "${pastDate}"
      convergencePlan: "Plan"
      relatedIssues: []
---`,
        labels: [],
        state: 'open',
        created_at: '2025-01-13T10:00:00Z',
        updated_at: '2025-01-13T10:00:00Z',
      };

      mockOctokit.issues.get.mockResolvedValue({ data: issue });

      const result = await agent.execute(1);

      expect(result.data.comments[0]).toContain('@Guardian');
      expect(result.data.comments[0]).toContain('@ProductOwner');
    });
  });
});
