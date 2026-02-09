/**
 * Issue #47: CoordinatorAgent AL1 Approval Gate Tests
 *
 * Tests for AL1 (Approval Required) human approval enforcement
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CoordinatorAgent } from '../../src/agents/coordinator-agent';
import { ensureRulesConfigLoaded } from '../../src/services/rules-config-service';
import type { AgentConfig, GitHubIssue } from '../../src/types';

describe('Issue #47: CoordinatorAgent AL1 Approval Gate', () => {
  let coordinator: CoordinatorAgent;
  let mockConfig: AgentConfig;

  beforeEach(async () => {
    await ensureRulesConfigLoaded();

    mockConfig = {
      githubToken: 'test-token',
      repository: 'owner/repo',
      dryRun: true,
      verbose: false,
    };

    coordinator = new CoordinatorAgent(mockConfig);
  });

  describe('AL1 Approval Detection', () => {
    it('should detect approval via label', async () => {
      const mockIssue: GitHubIssue = {
        number: 100,
        title: 'AL1 Issue with approval label',
        body: 'Test',
        labels: [
          { name: 'approved', color: '' },
          { name: 'type:feature', color: '' },
        ],
        state: 'open',
        created_at: '2026-02-09T00:00:00Z',
        updated_at: '2026-02-09T00:00:00Z',
      };

      // Mock octokit
      const mockOctokit = {
        issues: {
          get: vi.fn().mockResolvedValue({ data: mockIssue }),
          listComments: vi.fn().mockResolvedValue({ data: [] }),
        },
      };
      (coordinator as any).octokit = mockOctokit;

      const isApproved = await (coordinator as any).checkAL1Approval(100);
      expect(isApproved).toBe(true);
    });

    it('should detect approval via /approve command', async () => {
      const mockIssue: GitHubIssue = {
        number: 101,
        title: 'AL1 Issue with approve command',
        body: 'Test',
        labels: [{ name: 'type:feature', color: '' }],
        state: 'open',
        created_at: '2026-02-09T00:00:00Z',
        updated_at: '2026-02-09T00:00:00Z',
      };

      const mockComments = [
        {
          id: 1,
          body: 'Looks good!',
          user: { login: 'reviewer1' },
        },
        {
          id: 2,
          body: '/approve - This meets the requirements',
          user: { login: 'reviewer2' },
        },
      ];

      // Mock octokit
      const mockOctokit = {
        issues: {
          get: vi.fn().mockResolvedValue({ data: mockIssue }),
          listComments: vi.fn().mockResolvedValue({ data: mockComments }),
        },
      };
      (coordinator as any).octokit = mockOctokit;

      const isApproved = await (coordinator as any).checkAL1Approval(101);
      expect(isApproved).toBe(true);
    });

    it('should detect AL1:approved label variant', async () => {
      const mockIssue: GitHubIssue = {
        number: 102,
        title: 'AL1 Issue with AL1:approved label',
        body: 'Test',
        labels: [
          { name: 'AL1:approved', color: '' },
          { name: 'type:feature', color: '' },
        ],
        state: 'open',
        created_at: '2026-02-09T00:00:00Z',
        updated_at: '2026-02-09T00:00:00Z',
      };

      // Mock octokit
      const mockOctokit = {
        issues: {
          get: vi.fn().mockResolvedValue({ data: mockIssue }),
          listComments: vi.fn().mockResolvedValue({ data: [] }),
        },
      };
      (coordinator as any).octokit = mockOctokit;

      const isApproved = await (coordinator as any).checkAL1Approval(102);
      expect(isApproved).toBe(true);
    });

    it('should detect approval:granted label variant', async () => {
      const mockIssue: GitHubIssue = {
        number: 103,
        title: 'AL1 Issue with approval:granted label',
        body: 'Test',
        labels: [
          { name: 'approval:granted', color: '' },
          { name: 'type:feature', color: '' },
        ],
        state: 'open',
        created_at: '2026-02-09T00:00:00Z',
        updated_at: '2026-02-09T00:00:00Z',
      };

      // Mock octokit
      const mockOctokit = {
        issues: {
          get: vi.fn().mockResolvedValue({ data: mockIssue }),
          listComments: vi.fn().mockResolvedValue({ data: [] }),
        },
      };
      (coordinator as any).octokit = mockOctokit;

      const isApproved = await (coordinator as any).checkAL1Approval(103);
      expect(isApproved).toBe(true);
    });

    it('should return false when no approval found', async () => {
      const mockIssue: GitHubIssue = {
        number: 104,
        title: 'AL1 Issue without approval',
        body: 'Test',
        labels: [{ name: 'type:feature', color: '' }],
        state: 'open',
        created_at: '2026-02-09T00:00:00Z',
        updated_at: '2026-02-09T00:00:00Z',
      };

      const mockComments = [
        {
          id: 1,
          body: 'This needs more work',
          user: { login: 'reviewer1' },
        },
      ];

      // Mock octokit
      const mockOctokit = {
        issues: {
          get: vi.fn().mockResolvedValue({ data: mockIssue }),
          listComments: vi.fn().mockResolvedValue({ data: mockComments }),
        },
      };
      (coordinator as any).octokit = mockOctokit;

      const isApproved = await (coordinator as any).checkAL1Approval(104);
      expect(isApproved).toBe(false);
    });

    it('should handle case-insensitive label matching', async () => {
      const mockIssue: GitHubIssue = {
        number: 105,
        title: 'AL1 Issue with APPROVED label (uppercase)',
        body: 'Test',
        labels: [
          { name: 'APPROVED', color: '' },
          { name: 'type:feature', color: '' },
        ],
        state: 'open',
        created_at: '2026-02-09T00:00:00Z',
        updated_at: '2026-02-09T00:00:00Z',
      };

      // Mock octokit
      const mockOctokit = {
        issues: {
          get: vi.fn().mockResolvedValue({ data: mockIssue }),
          listComments: vi.fn().mockResolvedValue({ data: [] }),
        },
      };
      (coordinator as any).octokit = mockOctokit;

      const isApproved = await (coordinator as any).checkAL1Approval(105);
      expect(isApproved).toBe(true);
    });
  });

  describe('AL1 Gate Enforcement', () => {
    it('should block AL1 issue without approval', async () => {
      // Note: Full integration test would require mocking all agents
      // This test validates the approval check logic
      const mockIssue: GitHubIssue = {
        number: 106,
        title: 'AL1 Issue - No approval',
        body: 'Test',
        labels: [{ name: 'type:feature', color: '' }],
        state: 'open',
        created_at: '2026-02-09T00:00:00Z',
        updated_at: '2026-02-09T00:00:00Z',
      };

      const mockOctokit = {
        issues: {
          get: vi.fn().mockResolvedValue({ data: mockIssue }),
          listComments: vi.fn().mockResolvedValue({ data: [] }),
        },
      };
      (coordinator as any).octokit = mockOctokit;

      const isApproved = await (coordinator as any).checkAL1Approval(106);
      expect(isApproved).toBe(false);
    });

    it('should allow AL1 issue with approval', async () => {
      const mockIssue: GitHubIssue = {
        number: 107,
        title: 'AL1 Issue - With approval',
        body: 'Test',
        labels: [
          { name: 'approved', color: '' },
          { name: 'type:feature', color: '' },
        ],
        state: 'open',
        created_at: '2026-02-09T00:00:00Z',
        updated_at: '2026-02-09T00:00:00Z',
      };

      const mockOctokit = {
        issues: {
          get: vi.fn().mockResolvedValue({ data: mockIssue }),
          listComments: vi.fn().mockResolvedValue({ data: [] }),
        },
      };
      (coordinator as any).octokit = mockOctokit;

      const isApproved = await (coordinator as any).checkAL1Approval(107);
      expect(isApproved).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should return false on API error (fail-safe)', async () => {
      // Mock octokit to throw error
      const mockOctokit = {
        issues: {
          get: vi.fn().mockRejectedValue(new Error('API Error')),
          listComments: vi.fn().mockResolvedValue({ data: [] }),
        },
      };
      (coordinator as any).octokit = mockOctokit;

      const isApproved = await (coordinator as any).checkAL1Approval(108);
      expect(isApproved).toBe(false);
    });
  });
});
