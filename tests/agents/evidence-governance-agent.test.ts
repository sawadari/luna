import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EvidenceGovernanceAgent } from '../../src/agents/evidence-governance-agent';
import type { AgentConfig, GitHubIssue } from '../../src/types';

describe('EvidenceGovernanceAgent', () => {
  let agent: EvidenceGovernanceAgent;
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

    agent = new EvidenceGovernanceAgent(mockConfig);
    (agent as any).octokit = mockOctokit;
  });

  // ========================================================================
  // AI生成コンテンツ検出テスト
  // ========================================================================

  describe('AI Content Detection', () => {
    it('should detect Claude Code generated content', async () => {
      const issue: GitHubIssue = {
        number: 1,
        title: 'Feature Implementation',
        body: `Implemented new authentication feature.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>`,
        labels: [],
        state: 'open',
        created_at: '2025-01-13T10:00:00Z',
        updated_at: '2025-01-13T10:00:00Z',
      };

      mockOctokit.issues.get.mockResolvedValue({ data: issue });

      const result = await agent.execute(1);

      expect(result.status).toBe('success');
      expect(result.data.detectedAIContent).toHaveLength(1);
      expect(result.data.detectedAIContent[0].source).toBe('ai');
      expect(result.data.detectedAIContent[0].status).toBe('quarantined');
      expect(result.data.detectedAIContent[0].metadata.generatedBy).toContain('Claude');
    });

    it('should detect Co-Authored-By Claude', async () => {
      const issue: GitHubIssue = {
        number: 1,
        title: 'Code Review',
        body: `Code changes reviewed.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>`,
        labels: [],
        state: 'open',
        created_at: '2025-01-13T10:00:00Z',
        updated_at: '2025-01-13T10:00:00Z',
      };

      mockOctokit.issues.get.mockResolvedValue({ data: issue });

      const result = await agent.execute(1);

      expect(result.data.detectedAIContent).toHaveLength(1);
      expect(result.data.detectedAIContent[0].metadata.generatedBy).toContain('Claude Opus 4.5');
    });

    it('should detect AI-generated marker', async () => {
      const issue: GitHubIssue = {
        number: 1,
        title: 'Documentation',
        body: `# API Documentation

This documentation is AI-generated for initial draft.`,
        labels: [],
        state: 'open',
        created_at: '2025-01-13T10:00:00Z',
        updated_at: '2025-01-13T10:00:00Z',
      };

      mockOctokit.issues.get.mockResolvedValue({ data: issue });

      const result = await agent.execute(1);

      expect(result.data.detectedAIContent).toHaveLength(1);
      expect(result.data.detectedAIContent[0].status).toBe('quarantined');
    });

    it('should NOT detect human-written content', async () => {
      const issue: GitHubIssue = {
        number: 1,
        title: 'Manual Implementation',
        body: `Implemented by hand, no AI involved.

Author: John Doe
Date: 2025-01-13`,
        labels: [],
        state: 'open',
        created_at: '2025-01-13T10:00:00Z',
        updated_at: '2025-01-13T10:00:00Z',
      };

      mockOctokit.issues.get.mockResolvedValue({ data: issue });

      const result = await agent.execute(1);

      expect(result.data.detectedAIContent).toHaveLength(0);
    });
  });

  // ========================================================================
  // Content Hash計算テスト
  // ========================================================================

  describe('Content Hash Calculation', () => {
    it('should generate SHA-256 hash for content', async () => {
      const issue: GitHubIssue = {
        number: 1,
        title: 'Test',
        body: `Test content

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>`,
        labels: [],
        state: 'open',
        created_at: '2025-01-13T10:00:00Z',
        updated_at: '2025-01-13T10:00:00Z',
      };

      mockOctokit.issues.get.mockResolvedValue({ data: issue });

      const result = await agent.execute(1);

      expect(result.data.detectedAIContent).toHaveLength(1);
      expect(result.data.detectedAIContent[0].contentHash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should generate consistent hash for same content', async () => {
      const content = 'Consistent test content\n\nCo-Authored-By: Claude Sonnet 4.5';

      const issue1: GitHubIssue = {
        number: 1,
        title: 'Test 1',
        body: content,
        labels: [],
        state: 'open',
        created_at: '2025-01-13T10:00:00Z',
        updated_at: '2025-01-13T10:00:00Z',
      };

      mockOctokit.issues.get.mockResolvedValue({ data: issue1 });

      const result1 = await agent.execute(1);

      const issue2: GitHubIssue = {
        number: 2,
        title: 'Test 2',
        body: content,
        labels: [],
        state: 'open',
        created_at: '2025-01-13T10:00:00Z',
        updated_at: '2025-01-13T10:00:00Z',
      };

      mockOctokit.issues.get.mockResolvedValue({ data: issue2 });

      const result2 = await agent.execute(2);

      expect(result1.data.detectedAIContent[0].contentHash).toBe(
        result2.data.detectedAIContent[0].contentHash
      );
    });
  });

  // ========================================================================
  // 検証コマンド処理テスト
  // ========================================================================

  describe('Evidence Validation', () => {
    it('should validate Evidence when /verify-evidence command detected', async () => {
      const issue: GitHubIssue = {
        number: 1,
        title: 'Validation',
        body: `---
ssot_layer:
  evidences:
    - id: EVI-001
      contentHash: "abc123..."
      source: ai
      status: quarantined
      quarantinedReason: "AI-generated content requires human validation"
      metadata:
        generatedBy: "Claude Sonnet 4.5"
        reviewedBy: []
      createdAt: "2025-01-13T10:00:00Z"
  lastUpdatedAt: "2025-01-13T10:00:00Z"
  lastUpdatedBy: "EvidenceGovernanceAgent"
---

/verify-evidence EVI-001
Reviewed and approved by TechLead.`,
        labels: [],
        state: 'open',
        created_at: '2025-01-13T10:00:00Z',
        updated_at: '2025-01-13T10:00:00Z',
      };

      mockOctokit.issues.get.mockResolvedValue({ data: issue });

      const result = await agent.execute(1);

      expect(result.data.validatedEvidence).toHaveLength(1);
      expect(result.data.validatedEvidence[0].status).toBe('verified');
      expect(result.data.validatedEvidence[0].validatedBy).toBe('TechLead');
      expect(result.data.validatedEvidence[0].quarantinedReason).toBeUndefined();
    });

    it('should apply Evidence:Verified label after validation', async () => {
      const issue: GitHubIssue = {
        number: 1,
        title: 'Validation',
        body: `---
ssot_layer:
  evidences:
    - id: EVI-001
      contentHash: "abc123..."
      source: ai
      status: quarantined
      createdAt: "2025-01-13T10:00:00Z"
---

/verify-evidence EVI-001`,
        labels: [],
        state: 'open',
        created_at: '2025-01-13T10:00:00Z',
        updated_at: '2025-01-13T10:00:00Z',
      };

      mockOctokit.issues.get.mockResolvedValue({ data: issue });

      const result = await agent.execute(1);

      expect(result.data.labels).toContain('Evidence:Verified');
    });

    it('should NOT validate Evidence that is not quarantined', async () => {
      const issue: GitHubIssue = {
        number: 1,
        title: 'Already Verified',
        body: `---
ssot_layer:
  evidences:
    - id: EVI-001
      contentHash: "abc123..."
      source: ai
      status: verified
      validatedBy: TechLead
      createdAt: "2025-01-13T10:00:00Z"
---

/verify-evidence EVI-001`,
        labels: [],
        state: 'open',
        created_at: '2025-01-13T10:00:00Z',
        updated_at: '2025-01-13T10:00:00Z',
      };

      mockOctokit.issues.get.mockResolvedValue({ data: issue });

      const result = await agent.execute(1);

      expect(result.data.validatedEvidence).toHaveLength(0);
    });
  });

  // ========================================================================
  // Quarantine処理テスト
  // ========================================================================

  describe('Quarantine Management', () => {
    it('should quarantine AI-generated content', async () => {
      const issue: GitHubIssue = {
        number: 1,
        title: 'AI Content',
        body: `AI-generated implementation.

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>`,
        labels: [],
        state: 'open',
        created_at: '2025-01-13T10:00:00Z',
        updated_at: '2025-01-13T10:00:00Z',
      };

      mockOctokit.issues.get.mockResolvedValue({ data: issue });

      const result = await agent.execute(1);

      expect(result.data.quarantinedContent).toHaveLength(1);
      expect(result.data.quarantinedContent[0].status).toBe('quarantined');
      expect(result.data.quarantinedContent[0].quarantinedReason).toContain('human validation');
    });

    it('should apply Evidence:Quarantined label', async () => {
      const issue: GitHubIssue = {
        number: 1,
        title: 'Quarantine',
        body: `Test

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>`,
        labels: [],
        state: 'open',
        created_at: '2025-01-13T10:00:00Z',
        updated_at: '2025-01-13T10:00:00Z',
      };

      mockOctokit.issues.get.mockResolvedValue({ data: issue });

      const result = await agent.execute(1);

      expect(result.data.labels).toContain('Evidence:Quarantined');
    });

    it('should post quarantine comment', async () => {
      const issue: GitHubIssue = {
        number: 1,
        title: 'Quarantine Comment',
        body: `Test

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>`,
        labels: [],
        state: 'open',
        created_at: '2025-01-13T10:00:00Z',
        updated_at: '2025-01-13T10:00:00Z',
      };

      mockOctokit.issues.get.mockResolvedValue({ data: issue });

      const result = await agent.execute(1);

      expect(result.data.comments).toHaveLength(1);
      expect(result.data.comments[0]).toContain('Quarantined');
      expect(result.data.comments[0]).toContain('/verify-evidence');
    });
  });

  // ========================================================================
  // AIモデル抽出テスト
  // ========================================================================

  describe('AI Model Extraction', () => {
    it('should extract Claude Sonnet 4.5', async () => {
      const issue: GitHubIssue = {
        number: 1,
        title: 'Model Detection',
        body: `Implementation

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>`,
        labels: [],
        state: 'open',
        created_at: '2025-01-13T10:00:00Z',
        updated_at: '2025-01-13T10:00:00Z',
      };

      mockOctokit.issues.get.mockResolvedValue({ data: issue });

      const result = await agent.execute(1);

      expect(result.data.detectedAIContent[0].metadata.generatedBy).toBe('Claude Sonnet 4.5');
    });

    it('should extract Claude Opus 4.5', async () => {
      const issue: GitHubIssue = {
        number: 1,
        title: 'Model Detection',
        body: `Implementation

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>`,
        labels: [],
        state: 'open',
        created_at: '2025-01-13T10:00:00Z',
        updated_at: '2025-01-13T10:00:00Z',
      };

      mockOctokit.issues.get.mockResolvedValue({ data: issue });

      const result = await agent.execute(1);

      expect(result.data.detectedAIContent[0].metadata.generatedBy).toBe('Claude Opus 4.5');
    });

    it('should default to "Unknown AI" when model not specified', async () => {
      const issue: GitHubIssue = {
        number: 1,
        title: 'Unknown Model',
        body: `AI-generated content without model info.`,
        labels: [],
        state: 'open',
        created_at: '2025-01-13T10:00:00Z',
        updated_at: '2025-01-13T10:00:00Z',
      };

      mockOctokit.issues.get.mockResolvedValue({ data: issue });

      const result = await agent.execute(1);

      expect(result.data.detectedAIContent[0].metadata.generatedBy).toBe('Unknown AI');
    });
  });

  // ========================================================================
  // SSOT Data更新テスト
  // ========================================================================

  describe('SSOT Data Update', () => {
    it('should add Evidence to SSOT Data', async () => {
      const issue: GitHubIssue = {
        number: 1,
        title: 'Add Evidence',
        body: `Test

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>`,
        labels: [],
        state: 'open',
        created_at: '2025-01-13T10:00:00Z',
        updated_at: '2025-01-13T10:00:00Z',
      };

      mockOctokit.issues.get.mockResolvedValue({ data: issue });

      const result = await agent.execute(1);

      expect(result.data.detectedAIContent.length).toBeGreaterThan(0);
      expect(result.status).toBe('success');
    });

    it('should update existing Evidence status', async () => {
      const issue: GitHubIssue = {
        number: 1,
        title: 'Update Evidence',
        body: `---
ssot_layer:
  evidences:
    - id: EVI-001
      contentHash: "abc123"
      source: ai
      status: quarantined
      createdAt: "2025-01-13T10:00:00Z"
---

/verify-evidence EVI-001`,
        labels: [],
        state: 'open',
        created_at: '2025-01-13T10:00:00Z',
        updated_at: '2025-01-13T10:00:00Z',
      };

      mockOctokit.issues.get.mockResolvedValue({ data: issue });

      const result = await agent.execute(1);

      expect(result.data.validatedEvidence).toHaveLength(1);
      expect(result.data.validatedEvidence[0].status).toBe('verified');
    });
  });

  // ========================================================================
  // Validation Comment生成テスト
  // ========================================================================

  describe('Validation Comment Generation', () => {
    it('should generate validation comment with validator name', async () => {
      const issue: GitHubIssue = {
        number: 1,
        title: 'Validation',
        body: `---
ssot_layer:
  evidences:
    - id: EVI-001
      contentHash: "abc123"
      source: ai
      status: quarantined
      createdAt: "2025-01-13T10:00:00Z"
---

/verify-evidence EVI-001`,
        labels: [],
        state: 'open',
        created_at: '2025-01-13T10:00:00Z',
        updated_at: '2025-01-13T10:00:00Z',
      };

      mockOctokit.issues.get.mockResolvedValue({ data: issue });

      const result = await agent.execute(1);

      expect(result.data.comments).toHaveLength(1);
      expect(result.data.comments[0]).toContain('Verified');
      expect(result.data.comments[0]).toContain('TechLead');
    });
  });
});
