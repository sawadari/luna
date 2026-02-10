/**
 * Issue #50: DecisionRecord第一級要素化テスト
 *
 * Tests for u.record_decision enforcement in SSOTAgentV2
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SSOTAgentV2 } from '../../src/agents/ssot-agent-v2';
import { ensureRulesConfigLoaded } from '../../src/services/rules-config-service';
import type { AgentConfig, GitHubIssue } from '../../src/types';
import * as fs from 'fs/promises';
import * as path from 'path';

describe('Issue #50: DecisionRecord第一級要素化', () => {
  let agent: SSOTAgentV2;
  let mockConfig: AgentConfig;
  const testRegistryPath = path.join(__dirname, 'test-registry-decision.yaml');
  const testLedgerPath = path.join(__dirname, 'test-ledger-decision.ndjson');

  beforeEach(async () => {
    await ensureRulesConfigLoaded();

    mockConfig = {
      githubToken: 'test-token',
      repository: 'owner/repo',
      dryRun: false, // Issue #50: Must be false to enable Ledger recording
      verbose: true, // Issue #50: Enable verbose logging for debugging
    };

    agent = new SSOTAgentV2(mockConfig, testRegistryPath, testLedgerPath);

    // Create test registry file
    await fs.writeFile(
      testRegistryPath,
      `meta:
  registry_version: "1.0"
  last_updated: "${new Date().toISOString()}"
  last_updated_by: "Test"
  schema_version: "nrvv-1.0"
  description: "Test Kernel Registry for DecisionRecord"

kernels: {}
`,
      'utf-8'
    );
  });

  afterEach(async () => {
    // Cleanup test files
    try {
      await fs.unlink(testRegistryPath);
    } catch {
      // Ignore if file doesn't exist
    }
    try {
      await fs.unlink(testLedgerPath);
    } catch {
      // Ignore if file doesn't exist
    }
  });

  describe('convertDecisionsToKernels', () => {
    it('should record decision after creating kernel', async () => {
      const mockIssue: GitHubIssue = {
        number: 100,
        title: 'Test Issue with DecisionRecord',
        body: `---
planning_layer:
  decision_record:
    id: DR-TEST-001
    decision_type: adopt
    decided_by: TechLead
    rationale: Test rationale
    decision_statement: Test decision
    chosen_option: Option A
    assurance_level: AL2
    falsification_conditions:
      - "Condition 1"
---

# Test Issue
`,
        labels: [{ name: 'type:feature', color: '' }],
        state: 'open',
        created_at: '2026-02-10T00:00:00Z',
        updated_at: '2026-02-10T00:00:00Z',
      };

      // Mock octokit
      const mockOctokit = {
        issues: {
          get: vi.fn().mockResolvedValue({ data: mockIssue }),
          update: vi.fn().mockResolvedValue({}),
          createComment: vi.fn().mockResolvedValue({}),
          addLabels: vi.fn().mockResolvedValue({}),
        },
      };
      (agent as any).octokit = mockOctokit;

      const result = await agent.execute(100);

      // Verify execution succeeded
      if (result.status === 'error') {
        console.error('Agent execution failed:', result.error?.message);
      }
      expect(result.status).toBe('success');
      expect(result.data).toBeDefined();
      expect(result.data!.suggestedKernels.length).toBeGreaterThan(0);

      // Read ledger to verify u.record_decision was executed
      const ledgerContent = await fs.readFile(testLedgerPath, 'utf-8');
      const ledgerLines = ledgerContent.trim().split('\n');

      // Parse ledger entries
      const entries = ledgerLines.map((line) => JSON.parse(line));

      // Find u.create_kernel and u.record_decision operations
      const createOps = entries.filter((e) => e.operation.op === 'u.create_kernel');
      const recordDecisionOps = entries.filter((e) => e.operation.op === 'u.record_decision');

      // Verify u.record_decision was executed for each kernel
      expect(createOps.length).toBeGreaterThan(0);
      expect(recordDecisionOps.length).toBe(createOps.length);

      // Verify decision was recorded with correct data
      const decisionOp = recordDecisionOps[0];
      expect(decisionOp.operation.payload.decision_id).toBe('DR-TEST-001');
      expect(decisionOp.operation.payload.decision_type).toBe('adopt');
      expect(decisionOp.operation.payload.decided_by).toBe('TechLead');
      expect(decisionOp.operation.payload.rationale).toContain('Test rationale');
      expect(decisionOp.operation.payload.assurance_level).toBe('AL2');
      expect(decisionOp.operation.payload.falsification_conditions).toEqual(['Condition 1']);
    });

    it('should handle multiple decision records', async () => {
      const mockIssue: GitHubIssue = {
        number: 101,
        title: 'Test Issue with Multiple DecisionRecords',
        body: `---
planning_layer:
  decision_records:
    - id: DR-TEST-002
      decision_type: adopt
      decided_by: TechLead
      rationale: Decision 1
      decision_statement: First decision
      chosen_option: Option A
    - id: DR-TEST-003
      decision_type: adopt
      decided_by: ProductOwner
      rationale: Decision 2
      decision_statement: Second decision
      chosen_option: Option B
---

# Test Issue
`,
        labels: [{ name: 'type:feature', color: '' }],
        state: 'open',
        created_at: '2026-02-10T00:00:00Z',
        updated_at: '2026-02-10T00:00:00Z',
      };

      // Mock octokit
      const mockOctokit = {
        issues: {
          get: vi.fn().mockResolvedValue({ data: mockIssue }),
          update: vi.fn().mockResolvedValue({}),
          createComment: vi.fn().mockResolvedValue({}),
          addLabels: vi.fn().mockResolvedValue({}),
        },
      };
      (agent as any).octokit = mockOctokit;

      const result = await agent.execute(101);

      // Verify execution succeeded
      if (result.status === 'error') {
        console.error('Agent execution failed:', result.error?.message);
      }
      expect(result.status).toBe('success');
      expect(result.data).toBeDefined();
      expect(result.data!.suggestedKernels.length).toBe(2);

      // Read ledger to verify u.record_decision was executed for both kernels
      const ledgerContent = await fs.readFile(testLedgerPath, 'utf-8');
      const ledgerLines = ledgerContent.trim().split('\n');
      const entries = ledgerLines.map((line) => JSON.parse(line));

      const createOps = entries.filter((e) => e.operation.op === 'u.create_kernel');
      const recordDecisionOps = entries.filter((e) => e.operation.op === 'u.record_decision');

      // Verify u.record_decision was executed for each kernel
      expect(createOps.length).toBe(2);
      expect(recordDecisionOps.length).toBe(2);

      // Verify decisions were recorded with correct IDs
      const decisionIds = recordDecisionOps.map((op) => op.operation.payload.decision_id);
      expect(decisionIds).toContain('DR-TEST-002');
      expect(decisionIds).toContain('DR-TEST-003');
    });

    it('should NOT include kernel if u.record_decision fails', async () => {
      const mockIssue: GitHubIssue = {
        number: 103,
        title: 'Test Issue with Invalid Decision',
        body: `---
planning_layer:
  decision_record:
    id: DR-TEST-INVALID
    decision_type: adopt
    decided_by: TechLead
    rationale: Test rationale
    decision_statement: Test decision
    chosen_option: Option A
---

# Test Issue
`,
        labels: [{ name: 'type:feature', color: '' }],
        state: 'open',
        created_at: '2026-02-10T00:00:00Z',
        updated_at: '2026-02-10T00:00:00Z',
      };

      // Mock octokit
      const mockOctokit = {
        issues: {
          get: vi.fn().mockResolvedValue({ data: mockIssue }),
          update: vi.fn().mockResolvedValue({}),
          createComment: vi.fn().mockResolvedValue({}),
          addLabels: vi.fn().mockResolvedValue({}),
        },
      };
      (agent as any).octokit = mockOctokit;

      // Issue #50 (High fix): Count kernels before execution to verify rollback
      await (agent as any).kernelRegistry.load();
      const kernelsBeforeCount = Object.keys((agent as any).kernelRegistry.registry.kernels).length;

      // Mock KernelRuntime to fail u.record_decision
      const originalApply = (agent as any).kernelRuntime.apply.bind((agent as any).kernelRuntime);
      vi.spyOn((agent as any).kernelRuntime, 'apply').mockImplementation(async (op: any) => {
        if (op.op === 'u.record_decision') {
          return {
            success: false,
            op_id: 'FAILED-OP',
            timestamp: new Date().toISOString(),
            error: 'Simulated u.record_decision failure',
          };
        }
        return originalApply(op);
      });

      const result = await agent.execute(103);

      // Verify execution succeeded but no kernels were added
      expect(result.status).toBe('success');
      expect(result.data).toBeDefined();
      expect(result.data!.suggestedKernels.length).toBe(0); // Issue #50 (High): Kernel NOT added when u.record_decision fails

      // Issue #50 (High fix): Verify orphan kernel was rolled back (deleted from registry)
      await (agent as any).kernelRegistry.load();
      const kernelsAfterCount = Object.keys((agent as any).kernelRegistry.registry.kernels).length;

      // Kernel count should not increase (rollback successful)
      expect(kernelsAfterCount).toBe(kernelsBeforeCount);
    });
  });

  describe('convertPlanningDataToKernel', () => {
    it('should record decision after creating kernel from planning data', async () => {
      const mockIssue: GitHubIssue = {
        number: 102,
        title: 'Test Issue with DEST Judgment',
        body: `---
dest_judgment:
  judgmentId: DEST-TEST-001
  al: AL2
planning_layer:
  decision_record:
    id: DR-TEST-004
    decision_type: adopt
    decided_by: Architect
    rationale: Architectural decision
    decision_statement: Use microservices
---

# Test Issue
`,
        labels: [{ name: 'type:feature', color: '' }],
        state: 'open',
        created_at: '2026-02-10T00:00:00Z',
        updated_at: '2026-02-10T00:00:00Z',
      };

      // Mock octokit
      const mockOctokit = {
        issues: {
          get: vi.fn().mockResolvedValue({ data: mockIssue }),
          update: vi.fn().mockResolvedValue({}),
          createComment: vi.fn().mockResolvedValue({}),
          addLabels: vi.fn().mockResolvedValue({}),
        },
      };
      (agent as any).octokit = mockOctokit;

      const result = await agent.execute(102);

      // Verify execution succeeded
      if (result.status === 'error') {
        console.error('Agent execution failed:', result.error?.message);
      }
      expect(result.status).toBe('success');
      expect(result.data).toBeDefined();

      // Read ledger to verify u.record_decision was executed
      const ledgerContent = await fs.readFile(testLedgerPath, 'utf-8');
      const ledgerLines = ledgerContent.trim().split('\n');
      const entries = ledgerLines.map((line) => JSON.parse(line));

      const recordDecisionOps = entries.filter((e) => e.operation.op === 'u.record_decision');

      // Verify u.record_decision was executed
      expect(recordDecisionOps.length).toBeGreaterThan(0);

      // Verify decision was recorded with DEST judgment AL
      const decisionOp = recordDecisionOps[0];
      expect(decisionOp.operation.payload.decision_id).toBe('DR-TEST-004');
      expect(decisionOp.operation.payload.assurance_level).toBe('AL2');
    });

    it('should NOT include kernel if u.record_decision fails (convertDecisionToKernel path)', async () => {
      const mockIssue: GitHubIssue = {
        number: 104,
        title: 'Test Issue with DEST Judgment and Invalid Decision',
        body: `---
dest_judgment:
  judgmentId: DEST-TEST-002
  al: AL2
planning_layer:
  decisionRecord:
    id: DR-TEST-INVALID-2
    decision_type: adopt
    decided_by: Architect
    rationale: Architectural decision
    decision_statement: Use microservices
---

# Test Issue
`,
        labels: [{ name: 'type:feature', color: '' }],
        state: 'open',
        created_at: '2026-02-10T00:00:00Z',
        updated_at: '2026-02-10T00:00:00Z',
      };

      // Mock octokit
      const mockOctokit = {
        issues: {
          get: vi.fn().mockResolvedValue({ data: mockIssue }),
          update: vi.fn().mockResolvedValue({}),
          createComment: vi.fn().mockResolvedValue({}),
          addLabels: vi.fn().mockResolvedValue({}),
        },
      };
      (agent as any).octokit = mockOctokit;

      // Issue #50 (High fix): Count kernels before execution to verify rollback
      await (agent as any).kernelRegistry.load();
      const kernelsBeforeCount = Object.keys((agent as any).kernelRegistry.registry.kernels).length;

      // Mock KernelRuntime to fail u.record_decision
      const originalApply = (agent as any).kernelRuntime.apply.bind((agent as any).kernelRuntime);
      vi.spyOn((agent as any).kernelRuntime, 'apply').mockImplementation(async (op: any) => {
        if (op.op === 'u.record_decision') {
          return {
            success: false,
            op_id: 'FAILED-OP',
            timestamp: new Date().toISOString(),
            error: 'Simulated u.record_decision failure',
          };
        }
        return originalApply(op);
      });

      const result = await agent.execute(104);

      // Verify execution succeeded but no kernels were added
      expect(result.status).toBe('success');
      expect(result.data).toBeDefined();
      expect(result.data!.suggestedKernels.length).toBe(0); // Issue #50 (High): Kernel NOT added when u.record_decision fails

      // Issue #50 (High fix): Verify orphan kernel was rolled back (deleted from registry)
      await (agent as any).kernelRegistry.load();
      const kernelsAfterCount = Object.keys((agent as any).kernelRegistry.registry.kernels).length;

      // Kernel count should not increase (rollback successful)
      expect(kernelsAfterCount).toBe(kernelsBeforeCount);
    });
  });
});
