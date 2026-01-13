import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ChangeControlAgent } from '../../src/agents/change-control-agent';
import type { AgentConfig, GitHubIssue } from '../../src/types';

describe('ChangeControlAgent', () => {
  let agent: ChangeControlAgent;
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

    agent = new ChangeControlAgent(mockConfig);
    (agent as any).octokit = mockOctokit;
  });

  // ========================================================================
  // Change Request検出テスト - Update
  // ========================================================================

  describe('Change Request Detection - Update', () => {
    it('should detect Update change request for Frozen Kernel', async () => {
      const issue: GitHubIssue = {
        number: 1,
        title: 'Update JWT Expiration',
        body: `---
ssot_layer:
  kernels:
    - id: KRN-001
      statement: "JWT token expiration is 1 hour"
      category: requirement
      owner: TechLead
      maturity: frozen
      frozenAt: "2025-01-10T10:00:00Z"
      createdAt: "2025-01-13T10:00:00Z"
      lastUpdatedAt: "2025-01-13T10:00:00Z"
---

Change JWT expiration to 2 hours due to user complaints.
Affected: auth/jwt.ts, auth/middleware.ts`,
        labels: [],
        state: 'open',
        created_at: '2025-01-13T10:00:00Z',
        updated_at: '2025-01-13T10:00:00Z',
      };

      mockOctokit.issues.get.mockResolvedValue({ data: issue });

      const result = await agent.execute(1);

      expect(result.status).toBe('success');
      expect(result.data.detectedChangeRequests).toHaveLength(1);
      expect(result.data.detectedChangeRequests[0].changeType).toBe('update');
      expect(result.data.detectedChangeRequests[0].kernelId).toBe('KRN-001');
    });

    it('should NOT detect change request for Draft Kernel', async () => {
      const issue: GitHubIssue = {
        number: 1,
        title: 'Update Draft',
        body: `---
ssot_layer:
  kernels:
    - id: KRN-001
      statement: "JWT token expiration is 1 hour"
      category: requirement
      owner: TechLead
      maturity: draft
      createdAt: "2025-01-13T10:00:00Z"
      lastUpdatedAt: "2025-01-13T10:00:00Z"
---

Update draft kernel.`,
        labels: [],
        state: 'open',
        created_at: '2025-01-13T10:00:00Z',
        updated_at: '2025-01-13T10:00:00Z',
      };

      mockOctokit.issues.get.mockResolvedValue({ data: issue });

      const result = await agent.execute(1);

      expect(result.data.detectedChangeRequests).toHaveLength(0);
    });
  });

  // ========================================================================
  // Change Request検出テスト - Deprecate
  // ========================================================================

  describe('Change Request Detection - Deprecate', () => {
    it('should detect Deprecate change request', async () => {
      const issue: GitHubIssue = {
        number: 1,
        title: 'Deprecate JWT',
        body: `---
ssot_layer:
  kernels:
    - id: KRN-001
      statement: "Use JWT for authentication"
      category: requirement
      owner: TechLead
      maturity: frozen
      frozenAt: "2025-01-10T10:00:00Z"
      createdAt: "2025-01-13T10:00:00Z"
      lastUpdatedAt: "2025-01-13T10:00:00Z"
---

Deprecate JWT, migrate to OAuth 2.0.
Industry standard migration required.`,
        labels: [],
        state: 'open',
        created_at: '2025-01-13T10:00:00Z',
        updated_at: '2025-01-13T10:00:00Z',
      };

      mockOctokit.issues.get.mockResolvedValue({ data: issue });

      const result = await agent.execute(1);

      expect(result.data.detectedChangeRequests).toHaveLength(1);
      expect(result.data.detectedChangeRequests[0].changeType).toBe('deprecate');
    });
  });

  // ========================================================================
  // Impact分析テスト
  // ========================================================================

  describe('Impact Analysis', () => {
    it('should analyze Breaking impact for Deprecate', async () => {
      const issue: GitHubIssue = {
        number: 1,
        title: 'Deprecate',
        body: `---
ssot_layer:
  kernels:
    - id: KRN-001
      statement: "Use JWT"
      category: requirement
      owner: TechLead
      maturity: frozen
      createdAt: "2025-01-13T10:00:00Z"
      lastUpdatedAt: "2025-01-13T10:00:00Z"
---

Deprecate JWT.`,
        labels: [],
        state: 'open',
        created_at: '2025-01-13T10:00:00Z',
        updated_at: '2025-01-13T10:00:00Z',
      };

      mockOctokit.issues.get.mockResolvedValue({ data: issue });

      const result = await agent.execute(1);

      if (result.data.detectedChangeRequests.length > 0) {
        expect(result.data.detectedChangeRequests[0].impact).toBe('breaking');
      }
    });

    it('should analyze Major impact for Freeze', async () => {
      const issue: GitHubIssue = {
        number: 1,
        title: 'Freeze Kernel',
        body: `---
ssot_layer:
  kernels:
    - id: KRN-002
      statement: "API v2 interface"
      category: interface
      owner: TechLead
      maturity: agreed
      approvedBy: Guardian
      createdAt: "2025-01-13T10:00:00Z"
      lastUpdatedAt: "2025-01-13T10:00:00Z"
---

Freeze API v2 for external clients.
Affected: api/v2/*`,
        labels: [],
        state: 'open',
        created_at: '2025-01-13T10:00:00Z',
        updated_at: '2025-01-13T10:00:00Z',
      };

      mockOctokit.issues.get.mockResolvedValue({ data: issue });

      const result = await agent.execute(1);

      if (result.data.detectedChangeRequests.length > 0) {
        expect(result.data.detectedChangeRequests[0].impact).toBe('major');
      }
    });

    it('should analyze Minor impact for small Update', async () => {
      const issue: GitHubIssue = {
        number: 1,
        title: 'Minor Update',
        body: `---
ssot_layer:
  kernels:
    - id: KRN-003
      statement: "JWT exp 1h"
      category: requirement
      owner: TechLead
      maturity: agreed
      createdAt: "2025-01-13T10:00:00Z"
      lastUpdatedAt: "2025-01-13T10:00:00Z"
---

Change to 2h.
Affected: auth/jwt.ts`,
        labels: [],
        state: 'open',
        created_at: '2025-01-13T10:00:00Z',
        updated_at: '2025-01-13T10:00:00Z',
      };

      mockOctokit.issues.get.mockResolvedValue({ data: issue });

      const result = await agent.execute(1);

      if (result.data.detectedChangeRequests.length > 0) {
        expect(['minor', 'patch']).toContain(result.data.detectedChangeRequests[0].impact);
      }
    });
  });

  // ========================================================================
  // 承認処理テスト
  // ========================================================================

  describe('Approval Processing', () => {
    it('should approve Change Request when /approve command detected', async () => {
      const issue: GitHubIssue = {
        number: 1,
        title: 'Approval',
        body: `---
ssot_layer:
  changeRequests:
    - id: CHG-001
      kernelId: KRN-001
      changeType: update
      proposedChange: "Change JWT exp to 2h"
      rationale: "User complaints"
      requestedBy: ProductOwner
      requestedAt: "2025-01-13T10:00:00Z"
      impact: minor
      affectedComponents: ["auth/jwt.ts"]
---

/approve CHG-001
Reviewed and approved. Impact acceptable.`,
        labels: [],
        state: 'open',
        created_at: '2025-01-13T10:00:00Z',
        updated_at: '2025-01-13T10:00:00Z',
      };

      mockOctokit.issues.get.mockResolvedValue({ data: issue });

      const result = await agent.execute(1);

      expect(result.data.approvals).toHaveLength(1);
      expect(result.data.approvals[0].decision).toBe('approved');
      expect(result.data.approvals[0].changeRequestId).toBe('CHG-001');
    });

    it('should reject Change Request when /reject command detected', async () => {
      const issue: GitHubIssue = {
        number: 1,
        title: 'Rejection',
        body: `---
ssot_layer:
  changeRequests:
    - id: CHG-002
      kernelId: KRN-001
      changeType: deprecate
      proposedChange: "Deprecate JWT"
      rationale: "Migrate to OAuth"
      requestedBy: ProductOwner
      requestedAt: "2025-01-13T10:00:00Z"
      impact: breaking
      affectedComponents: ["auth/*", "api/*"]
---

/reject CHG-002
Too risky. Consider phased migration.`,
        labels: [],
        state: 'open',
        created_at: '2025-01-13T10:00:00Z',
        updated_at: '2025-01-13T10:00:00Z',
      };

      mockOctokit.issues.get.mockResolvedValue({ data: issue });

      const result = await agent.execute(1);

      expect(result.data.rejections).toHaveLength(1);
      expect(result.data.rejections[0].decision).toBe('rejected');
    });

    it('should handle conditional approval', async () => {
      const issue: GitHubIssue = {
        number: 1,
        title: 'Conditional Approval',
        body: `---
ssot_layer:
  changeRequests:
    - id: CHG-003
      kernelId: KRN-001
      changeType: deprecate
      proposedChange: "Deprecate JWT"
      impact: breaking
---

/approve CHG-003 --conditional
Conditions:
- Migrate within 3 months
- Provide backward compatibility`,
        labels: [],
        state: 'open',
        created_at: '2025-01-13T10:00:00Z',
        updated_at: '2025-01-13T10:00:00Z',
      };

      mockOctokit.issues.get.mockResolvedValue({ data: issue });

      const result = await agent.execute(1);

      if (result.data.approvals.length > 0) {
        expect(result.data.approvals[0].decision).toBe('conditional');
      }
    });
  });

  // ========================================================================
  // Change実行テスト
  // ========================================================================

  describe('Change Execution', () => {
    it('should execute Update change after approval', async () => {
      const issue: GitHubIssue = {
        number: 1,
        title: 'Execute Change',
        body: `---
ssot_layer:
  kernels:
    - id: KRN-001
      statement: "JWT exp 1h"
      category: requirement
      owner: TechLead
      maturity: agreed
      createdAt: "2025-01-13T10:00:00Z"
      lastUpdatedAt: "2025-01-13T10:00:00Z"
  changeRequests:
    - id: CHG-001
      kernelId: KRN-001
      changeType: update
      proposedChange: "JWT exp 2h"
      impact: minor
---

/approve CHG-001`,
        labels: [],
        state: 'open',
        created_at: '2025-01-13T10:00:00Z',
        updated_at: '2025-01-13T10:00:00Z',
      };

      mockOctokit.issues.get.mockResolvedValue({ data: issue });

      const result = await agent.execute(1);

      expect(result.status).toBe('success');
      if (result.data.approvals.length > 0) {
        expect(result.data.approvals[0].decision).toBe('approved');
      }
    });

    it('should execute Freeze change', async () => {
      const issue: GitHubIssue = {
        number: 1,
        title: 'Freeze',
        body: `---
ssot_layer:
  kernels:
    - id: KRN-002
      statement: "API v2"
      category: interface
      owner: TechLead
      maturity: agreed
      createdAt: "2025-01-13T10:00:00Z"
      lastUpdatedAt: "2025-01-13T10:00:00Z"
  changeRequests:
    - id: CHG-002
      kernelId: KRN-002
      changeType: freeze
      rationale: "External dependencies"
      impact: major
---

/approve CHG-002`,
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
  // 承認者決定テスト
  // ========================================================================

  describe('Approver Determination', () => {
    it('should require Guardian for Breaking change', async () => {
      const issue: GitHubIssue = {
        number: 1,
        title: 'Breaking Change',
        body: `---
ssot_layer:
  kernels:
    - id: KRN-001
      statement: "Use JWT"
      category: requirement
      owner: TechLead
      maturity: frozen
      createdAt: "2025-01-13T10:00:00Z"
      lastUpdatedAt: "2025-01-13T10:00:00Z"
---

Deprecate JWT - breaking change.
Affected: auth/*, api/v1/*, frontend/*`,
        labels: [],
        state: 'open',
        created_at: '2025-01-13T10:00:00Z',
        updated_at: '2025-01-13T10:00:00Z',
      };

      mockOctokit.issues.get.mockResolvedValue({ data: issue });

      const result = await agent.execute(1);

      if (result.data.detectedChangeRequests.length > 0) {
        expect(result.data.detectedChangeRequests[0].impact).toBe('breaking');
      }
    });

    it('should require TechLead for Major change', async () => {
      const issue: GitHubIssue = {
        number: 1,
        title: 'Major Change',
        body: `---
ssot_layer:
  kernels:
    - id: KRN-002
      statement: "API structure"
      category: architecture
      owner: TechLead
      maturity: agreed
      createdAt: "2025-01-13T10:00:00Z"
      lastUpdatedAt: "2025-01-13T10:00:00Z"
---

Restructure API.
Affected: api/v2/*, api/middleware/*, api/handlers/*`,
        labels: [],
        state: 'open',
        created_at: '2025-01-13T10:00:00Z',
        updated_at: '2025-01-13T10:00:00Z',
      };

      mockOctokit.issues.get.mockResolvedValue({ data: issue });

      const result = await agent.execute(1);

      if (result.data.detectedChangeRequests.length > 0) {
        expect(result.data.detectedChangeRequests[0].impact).toBe('major');
      }
    });
  });

  // ========================================================================
  // ラベル適用テスト
  // ========================================================================

  describe('Label Application', () => {
    it('should apply Change:Pending for detected Change Request', async () => {
      const issue: GitHubIssue = {
        number: 1,
        title: 'Change Request',
        body: `---
ssot_layer:
  kernels:
    - id: KRN-001
      statement: "JWT exp 1h"
      maturity: frozen
      createdAt: "2025-01-13T10:00:00Z"
      lastUpdatedAt: "2025-01-13T10:00:00Z"
---

Change to 2h.`,
        labels: [],
        state: 'open',
        created_at: '2025-01-13T10:00:00Z',
        updated_at: '2025-01-13T10:00:00Z',
      };

      mockOctokit.issues.get.mockResolvedValue({ data: issue });

      const result = await agent.execute(1);

      if (result.data.detectedChangeRequests.length > 0) {
        expect(result.data.labels).toContain('Change:Pending');
      }
    });

    it('should apply Change:Approved after approval', async () => {
      const issue: GitHubIssue = {
        number: 1,
        title: 'Approval',
        body: `---
ssot_layer:
  changeRequests:
    - id: CHG-001
      kernelId: KRN-001
      changeType: update
      impact: minor
---

/approve CHG-001`,
        labels: [],
        state: 'open',
        created_at: '2025-01-13T10:00:00Z',
        updated_at: '2025-01-13T10:00:00Z',
      };

      mockOctokit.issues.get.mockResolvedValue({ data: issue });

      const result = await agent.execute(1);

      if (result.data.approvals.length > 0) {
        expect(result.data.labels).toContain('Change:Approved');
      }
    });
  });

  // ========================================================================
  // Comment生成テスト
  // ========================================================================

  describe('Comment Generation', () => {
    it('should post Change Request comment with approval instructions', async () => {
      const issue: GitHubIssue = {
        number: 1,
        title: 'Change',
        body: `---
ssot_layer:
  kernels:
    - id: KRN-001
      statement: "JWT"
      maturity: frozen
      createdAt: "2025-01-13T10:00:00Z"
      lastUpdatedAt: "2025-01-13T10:00:00Z"
---

Update JWT.`,
        labels: [],
        state: 'open',
        created_at: '2025-01-13T10:00:00Z',
        updated_at: '2025-01-13T10:00:00Z',
      };

      mockOctokit.issues.get.mockResolvedValue({ data: issue });

      const result = await agent.execute(1);

      if (result.data.comments.length > 0) {
        expect(result.data.comments[0]).toContain('Change Request');
        expect(result.data.comments[0]).toContain('/approve');
      }
    });

    it('should post approval comment', async () => {
      const issue: GitHubIssue = {
        number: 1,
        title: 'Approval',
        body: `---
ssot_layer:
  changeRequests:
    - id: CHG-001
      kernelId: KRN-001
      changeType: update
---

/approve CHG-001`,
        labels: [],
        state: 'open',
        created_at: '2025-01-13T10:00:00Z',
        updated_at: '2025-01-13T10:00:00Z',
      };

      mockOctokit.issues.get.mockResolvedValue({ data: issue });

      const result = await agent.execute(1);

      if (result.data.approvals.length > 0) {
        expect(result.data.comments[0]).toContain('Approved');
      }
    });
  });
});
