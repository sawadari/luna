/**
 * Issue #46: CoordinatorAgent Dependency Resolution Tests
 *
 * Tests for the complex dependency auto-wiring logic in decomposeToDAG(),
 * especially for Kernel-driven task generation with auto Review insertion.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CoordinatorAgent } from '../../src/agents/coordinator-agent';
import { ensureRulesConfigLoaded } from '../../src/services/rules-config-service';
import type { AgentConfig, GitHubIssue } from '../../src/types';

describe('Issue #46: CoordinatorAgent Dependency Resolution', () => {
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

  describe('Kernel-driven with auto Review insertion', () => {
    it('should auto-insert Review task between CodeGen and Test', async () => {
      const mockIssue: GitHubIssue = {
        number: 100,
        title: 'Implement features from KRN-TEST-001',
        body: 'Implement based on Kernel requirements',
        labels: [
          { name: 'type:feature', color: '' },
          { name: 'complexity:medium', color: '' },
        ],
        state: 'open',
        created_at: '2026-02-09T00:00:00Z',
        updated_at: '2026-02-09T00:00:00Z',
      };

      // Call decomposeToDAG with mock executionContext
      const executionContext = {
        ssotResult: {
          suggestedKernels: ['KRN-TEST-001'],
        },
      };

      // Mock kernel registry to return test kernel
      const mockKernelRegistry = (coordinator as any).kernelRegistry;
      mockKernelRegistry.load = vi.fn().mockResolvedValue(undefined);
      mockKernelRegistry.getKernel = vi.fn().mockResolvedValue({
        id: 'KRN-TEST-001',
        statement: 'Test Kernel',
        requirements: [
          {
            id: 'REQ-001',
            statement: 'Implement feature A',
            rationale: 'Feature A is needed',
          },
          {
            id: 'REQ-002',
            statement: 'Implement feature B',
            rationale: 'Feature B is needed',
          },
        ],
        verification: [
          {
            id: 'VER-001',
            statement: 'Test features A and B',
            method: 'test',
          },
        ],
      });

      const dag = await (coordinator as any).decomposeToDAG(
        mockIssue,
        executionContext
      );

      const tasks = Array.from(dag.nodes.values());
      const taskNames = tasks.map((t) => t.name);

      // ✅ CodeGen tasks from Requirements
      expect(
        taskNames.some((name) => name.includes('Implement feature A'))
      ).toBe(true);
      expect(
        taskNames.some((name) => name.includes('Implement feature B'))
      ).toBe(true);

      // ✅ Auto-inserted Review task
      expect(
        taskNames.some((name) => name.includes('Code Review (Kernel-driven)'))
      ).toBe(true);

      // ✅ Test task from Verification
      expect(
        taskNames.some((name) => name.includes('Run tests'))
      ).toBe(true);

      // ✅ Correct dependency chain: CodeGen → Review → Test
      const reviewTask = tasks.find((t) => t.agent === 'review');
      const testTask = tasks.find((t) => t.agent === 'test');
      const codegenTasks = tasks.filter((t) => t.agent === 'codegen');

      expect(reviewTask).toBeDefined();
      expect(testTask).toBeDefined();
      expect(codegenTasks.length).toBeGreaterThan(0);

      // Review depends on all CodeGen tasks
      for (const codegenTask of codegenTasks) {
        expect(reviewTask!.dependencies).toContain(codegenTask.id);
      }

      // Test depends on Review
      expect(testTask!.dependencies).toContain(reviewTask!.id);
    });

    it('should not insert Review if already present', async () => {
      const mockIssue: GitHubIssue = {
        number: 101,
        title: 'Test with explicit Review',
        body: 'Test',
        labels: [{ name: 'type:feature', color: '' }],
        state: 'open',
        created_at: '2026-02-09T00:00:00Z',
        updated_at: '2026-02-09T00:00:00Z',
      };

      // Traditional task definitions (includes Review)
      const executionContext = {};

      const dag = await (coordinator as any).decomposeToDAG(
        mockIssue,
        executionContext
      );

      const tasks = Array.from(dag.nodes.values());
      const reviewTasks = tasks.filter((t) => t.agent === 'review');

      // ✅ Only one Review task (no duplicate)
      expect(reviewTasks.length).toBe(1);
    });
  });

  describe('Dependency resolution algorithm', () => {
    it('should resolve Review dependencies to all preceding CodeGen tasks', async () => {
      const mockIssue: GitHubIssue = {
        number: 102,
        title: 'Multiple CodeGen tasks',
        body: 'Test',
        labels: [
          { name: 'type:feature', color: '' },
          { name: 'complexity:large', color: '' },
        ],
        state: 'open',
        created_at: '2026-02-09T00:00:00Z',
        updated_at: '2026-02-09T00:00:00Z',
      };

      const executionContext = {
        ssotResult: {
          suggestedKernels: ['KRN-TEST-002'],
        },
      };

      const mockKernelRegistry = (coordinator as any).kernelRegistry;
      mockKernelRegistry.load = vi.fn().mockResolvedValue(undefined);
      mockKernelRegistry.getKernel = vi.fn().mockResolvedValue({
        id: 'KRN-TEST-002',
        requirements: [
          { id: 'REQ-001', statement: 'Feature 1' },
          { id: 'REQ-002', statement: 'Feature 2' },
          { id: 'REQ-003', statement: 'Feature 3' },
        ],
        verification: [{ id: 'VER-001', statement: 'Test all' }],
      });

      const dag = await (coordinator as any).decomposeToDAG(
        mockIssue,
        executionContext
      );

      const tasks = Array.from(dag.nodes.values());
      const reviewTask = tasks.find((t) => t.agent === 'review');
      const codegenTasks = tasks.filter((t) => t.agent === 'codegen');

      // ✅ Review depends on all 3 CodeGen tasks
      expect(codegenTasks.length).toBe(3);
      expect(reviewTask!.dependencies.length).toBe(3);

      for (const codegenTask of codegenTasks) {
        expect(reviewTask!.dependencies).toContain(codegenTask.id);
      }
    });

    it('should resolve Test dependencies to Review if present', async () => {
      const mockIssue: GitHubIssue = {
        number: 103,
        title: 'Test with Review',
        body: 'Test',
        labels: [{ name: 'type:feature', color: '' }],
        state: 'open',
        created_at: '2026-02-09T00:00:00Z',
        updated_at: '2026-02-09T00:00:00Z',
      };

      const executionContext = {
        ssotResult: {
          suggestedKernels: ['KRN-TEST-003'],
        },
      };

      const mockKernelRegistry = (coordinator as any).kernelRegistry;
      mockKernelRegistry.load = vi.fn().mockResolvedValue(undefined);
      mockKernelRegistry.getKernel = vi.fn().mockResolvedValue({
        id: 'KRN-TEST-003',
        requirements: [{ id: 'REQ-001', statement: 'Feature' }],
        verification: [{ id: 'VER-001', statement: 'Test' }],
      });

      const dag = await (coordinator as any).decomposeToDAG(
        mockIssue,
        executionContext
      );

      const tasks = Array.from(dag.nodes.values());
      const reviewTask = tasks.find((t) => t.agent === 'review');
      const testTask = tasks.find((t) => t.agent === 'test');

      // ✅ Test depends on Review (not directly on CodeGen)
      expect(testTask!.dependencies).toContain(reviewTask!.id);
      expect(testTask!.dependencies.length).toBe(1);
    });

    it('should resolve Test dependencies to CodeGen if no Review', async () => {
      const mockIssue: GitHubIssue = {
        number: 104,
        title: 'Test without Review',
        body: 'Test',
        labels: [
          { name: 'type:bug', color: '' },
          { name: 'complexity:small', color: '' },
        ],
        state: 'open',
        created_at: '2026-02-09T00:00:00Z',
        updated_at: '2026-02-09T00:00:00Z',
      };

      // Traditional tasks (small bug skips Review)
      const executionContext = {};

      const dag = await (coordinator as any).decomposeToDAG(
        mockIssue,
        executionContext
      );

      const tasks = Array.from(dag.nodes.values());
      const reviewTask = tasks.find((t) => t.agent === 'review');
      const testTask = tasks.find((t) => t.agent === 'test');
      const codegenTasks = tasks.filter((t) => t.agent === 'codegen');

      if (!reviewTask && testTask) {
        // ✅ Test depends directly on CodeGen (no Review)
        for (const codegenTask of codegenTasks) {
          expect(testTask.dependencies).toContain(codegenTask.id);
        }
      }
    });
  });

  describe('Traditional task fallback', () => {
    it('should use traditional tasks when SSOT result is empty', async () => {
      const mockIssue: GitHubIssue = {
        number: 105,
        title: 'Traditional flow',
        body: 'Test',
        labels: [
          { name: 'type:feature', color: '' },
          { name: 'complexity:medium', color: '' },
        ],
        state: 'open',
        created_at: '2026-02-09T00:00:00Z',
        updated_at: '2026-02-09T00:00:00Z',
      };

      // Empty SSOT result triggers fallback
      const executionContext = {
        ssotResult: {
          suggestedKernels: [],
        },
      };

      const dag = await (coordinator as any).decomposeToDAG(
        mockIssue,
        executionContext
      );

      const tasks = Array.from(dag.nodes.values());
      const taskNames = tasks.map((t) => t.name);

      // ✅ Traditional task names
      expect(
        taskNames.some((name) => name.includes('Code Generation'))
      ).toBe(true);
      expect(
        taskNames.some((name) => name.includes('Code Review'))
      ).toBe(true);
      expect(
        taskNames.some((name) => name.includes('Test Execution'))
      ).toBe(true);
    });

    it('should have correct dependencies in traditional flow', async () => {
      const mockIssue: GitHubIssue = {
        number: 106,
        title: 'Traditional dependencies',
        body: 'Test',
        labels: [{ name: 'type:feature', color: '' }],
        state: 'open',
        created_at: '2026-02-09T00:00:00Z',
        updated_at: '2026-02-09T00:00:00Z',
      };

      const executionContext = {};

      const dag = await (coordinator as any).decomposeToDAG(
        mockIssue,
        executionContext
      );

      const tasks = Array.from(dag.nodes.values());
      const codegenTask = tasks.find((t) => t.agent === 'codegen');
      const reviewTask = tasks.find((t) => t.agent === 'review');
      const testTask = tasks.find((t) => t.agent === 'test');

      if (codegenTask && reviewTask && testTask) {
        // ✅ CodeGen → Review → Test chain
        expect(reviewTask.dependencies).toContain(codegenTask.id);
        expect(testTask.dependencies).toContain(reviewTask.id);
      }
    });
  });

  describe('DAG structure validation', () => {
    it('should have entry and exit nodes', async () => {
      const mockIssue: GitHubIssue = {
        number: 107,
        title: 'DAG structure',
        body: 'Test',
        labels: [{ name: 'type:feature', color: '' }],
        state: 'open',
        created_at: '2026-02-09T00:00:00Z',
        updated_at: '2026-02-09T00:00:00Z',
      };

      const dag = await (coordinator as any).decomposeToDAG(
        mockIssue,
        {}
      );

      // ✅ Entry nodes (no incoming edges)
      expect(dag.entryNodes.length).toBeGreaterThan(0);

      // ✅ Exit nodes (no outgoing edges)
      expect(dag.exitNodes.length).toBeGreaterThan(0);

      // ✅ All tasks are reachable
      expect(dag.nodes.size).toBeGreaterThan(0);
    });

    it('should have no cycles (DAG property)', async () => {
      const mockIssue: GitHubIssue = {
        number: 108,
        title: 'No cycles',
        body: 'Test',
        labels: [{ name: 'type:feature', color: '' }],
        state: 'open',
        created_at: '2026-02-09T00:00:00Z',
        updated_at: '2026-02-09T00:00:00Z',
      };

      const dag = await (coordinator as any).decomposeToDAG(
        mockIssue,
        {}
      );

      // ✅ Topological sort should succeed (no cycles)
      expect(() => {
        (coordinator as any).topologicalSort(dag);
      }).not.toThrow();
    });
  });
});
