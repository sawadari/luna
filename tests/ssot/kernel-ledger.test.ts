/**
 * Kernel Ledger Tests
 *
 * Tests for Event Sourcing Ledger Replay functionality (Issue #43)
 * Ensures complete state reconstruction from u.* operations
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { KernelLedger } from '../../src/ssot/kernel-ledger';
import { KernelRegistryService } from '../../src/ssot/kernel-registry';
import { KernelRuntime } from '../../src/ssot/kernel-runtime';
import {
  CreateKernelOperation,
  SetStateOperation,
  LinkEvidenceOperation,
  RecordDecisionOperation,
} from '../../src/types/kernel-operations';
import * as fs from 'fs/promises';
import * as path from 'path';

describe('KernelLedger', () => {
  const TEST_LEDGER_PATH = path.join(__dirname, '../../data/ssot/test-ledger-replay.ndjson');
  const TEST_REGISTRY_PATH = path.join(__dirname, '../../data/ssot/test-kernels-replay.yaml');

  let ledger: KernelLedger;
  let registry: KernelRegistryService;
  let runtime: KernelRuntime;

  beforeEach(async () => {
    // Clean up previous test files
    try {
      await fs.unlink(TEST_LEDGER_PATH);
    } catch (e) {
      // Ignore if file doesn't exist
    }
    try {
      await fs.unlink(TEST_REGISTRY_PATH);
    } catch (e) {
      // Ignore if file doesn't exist
    }

    // Initialize services
    ledger = new KernelLedger({ ledgerPath: TEST_LEDGER_PATH });
    registry = new KernelRegistryService(TEST_REGISTRY_PATH);
    runtime = new KernelRuntime({
      ledgerPath: TEST_LEDGER_PATH,
      registryPath: TEST_REGISTRY_PATH,
      enableLedger: true,
      soloMode: true,
      defaultActor: 'TestRunner',
      verbose: false,
      enableAL0Gate: false, // Disable AL0 Gate for testing
    });
  });

  afterEach(async () => {
    // Clean up test files
    try {
      await fs.unlink(TEST_LEDGER_PATH);
    } catch (e) {
      // Ignore
    }
    try {
      await fs.unlink(TEST_REGISTRY_PATH);
    } catch (e) {
      // Ignore
    }
  });

  describe('u.create_kernel Replay', () => {
    it('should replay u.create_kernel with full NRVV structure', async () => {
      // Arrange: Create a Kernel via KernelRuntime
      const createOp: CreateKernelOperation = {
        op: 'u.create_kernel',
        actor: 'TestRunner',
        issue: '#100',
        payload: {
          kernel_id: 'KRN-TEST-001',
          statement: 'Test kernel for replay verification',
          category: 'security',
          owner: 'TestOwner',
          maturity: 'draft',
          sourceIssue: '#100',
          needs: [
            {
              id: 'NEED-001',
              statement: 'Need statement',
              stakeholder: 'ProductOwner',
              sourceType: 'business_requirement',
              priority: 'high',
              rationale: 'Test rationale',
              traceability: { upstream: [], downstream: ['REQ-001'] },
            },
          ],
          requirements: [
            {
              id: 'REQ-001',
              statement: 'Requirement statement',
              type: 'functional',
              priority: 'must',
              rationale: 'Test requirement',
              traceability: { upstream: ['NEED-001'], downstream: ['VER-001'] },
            },
          ],
          verification: [
            {
              id: 'VER-001',
              statement: 'Verification statement',
              method: 'test',
              criteria: ['Test passes'],
              traceability: { upstream: ['REQ-001'], downstream: [] },
            },
          ],
          validation: [
            {
              id: 'VAL-001',
              statement: 'Validation statement',
              method: 'review',
              criteria: ['Review approved'],
              traceability: { upstream: ['VER-001'], downstream: [] },
            },
          ],
          tags: ['test', 'replay'],
          relatedArtifacts: [
            {
              type: 'code',
              path: 'test.ts',
              description: 'Test artifact',
            },
          ],
        },
      };

      const result = await runtime.apply(createOp);
      expect(result.success).toBe(true);

      // Act: Replay from Ledger
      const replayedKernels = await ledger.replay();

      // Assert: Verify full structure is replayed
      expect(replayedKernels).toHaveProperty('KRN-TEST-001');
      const kernel = replayedKernels['KRN-TEST-001'];

      expect(kernel.id).toBe('KRN-TEST-001');
      expect(kernel.statement).toBe('Test kernel for replay verification');
      expect(kernel.category).toBe('security');
      expect(kernel.owner).toBe('TestOwner');
      expect(kernel.maturity).toBe('draft');
      expect(kernel.sourceIssue).toBe('#100');

      // Verify NRVV structure
      expect(kernel.needs).toHaveLength(1);
      expect(kernel.needs![0].id).toBe('NEED-001');
      expect(kernel.needs![0].statement).toBe('Need statement');

      expect(kernel.requirements).toHaveLength(1);
      expect(kernel.requirements![0].id).toBe('REQ-001');
      expect(kernel.requirements![0].statement).toBe('Requirement statement');

      expect(kernel.verification).toHaveLength(1);
      expect(kernel.verification![0].id).toBe('VER-001');
      expect(kernel.verification![0].statement).toBe('Verification statement');

      expect(kernel.validation).toHaveLength(1);
      expect(kernel.validation![0].id).toBe('VAL-001');
      expect(kernel.validation![0].statement).toBe('Validation statement');

      expect(kernel.tags).toEqual(['test', 'replay']);
      expect(kernel.relatedArtifacts).toHaveLength(1);
      expect(kernel.relatedArtifacts![0].path).toBe('test.ts');
    });

    it('should replay empty NRVV arrays when not provided', async () => {
      // Arrange: Create minimal Kernel
      const createOp: CreateKernelOperation = {
        op: 'u.create_kernel',
        actor: 'TestRunner',
        issue: '#101',
        payload: {
          kernel_id: 'KRN-TEST-002',
          statement: 'Minimal kernel',
          category: 'requirement',
          owner: 'TestOwner',
        },
      };

      await runtime.apply(createOp);

      // Act: Replay
      const replayedKernels = await ledger.replay();

      // Assert: Empty arrays are initialized
      const kernel = replayedKernels['KRN-TEST-002'];
      expect(kernel.needs).toEqual([]);
      expect(kernel.requirements).toEqual([]);
      expect(kernel.verification).toEqual([]);
      expect(kernel.validation).toEqual([]);
      expect(kernel.tags).toEqual([]);
      expect(kernel.relatedArtifacts).toEqual([]);
    });
  });

  describe('u.set_state Replay', () => {
    it('should replay u.set_state with approvedAt/approvedBy metadata', async () => {
      // Arrange: Create Kernel
      const createOp: CreateKernelOperation = {
        op: 'u.create_kernel',
        actor: 'TestRunner',
        issue: '#102',
        payload: {
          kernel_id: 'KRN-TEST-003',
          statement: 'Kernel for state transition test',
          category: 'requirement',
          owner: 'TestOwner',
          maturity: 'draft',
        },
      };
      await runtime.apply(createOp);

      // Act: Transition to 'agreed'
      const setStateOp: SetStateOperation = {
        op: 'u.set_state',
        actor: 'Approver',
        issue: '#102',
        payload: {
          kernel_id: 'KRN-TEST-003',
          from: 'draft',
          to: 'agreed',
          reason: 'Test approval',
        },
      };
      await runtime.apply(setStateOp);

      // Replay from Ledger
      const replayedKernels = await ledger.replay();

      // Assert: approvedAt and approvedBy are set
      const kernel = replayedKernels['KRN-TEST-003'];
      expect(kernel.maturity).toBe('agreed');
      expect(kernel.approvedAt).toBeDefined();
      expect(kernel.approvedBy).toBe('Approver');
      expect(kernel.lastUpdatedAt).toBeDefined();
    });

    it('should replay u.set_state with frozenAt metadata', async () => {
      // Arrange: Create Kernel
      const createOp: CreateKernelOperation = {
        op: 'u.create_kernel',
        actor: 'TestRunner',
        issue: '#103',
        payload: {
          kernel_id: 'KRN-TEST-004',
          statement: 'Kernel for frozen test',
          category: 'requirement',
          owner: 'TestOwner',
          maturity: 'agreed',
        },
      };
      await runtime.apply(createOp);

      // Act: Transition to 'frozen'
      const setStateOp: SetStateOperation = {
        op: 'u.set_state',
        actor: 'Freezer',
        issue: '#103',
        payload: {
          kernel_id: 'KRN-TEST-004',
          from: 'agreed',
          to: 'frozen',
          reason: 'Test freeze',
        },
      };
      await runtime.apply(setStateOp);

      // Replay from Ledger
      const replayedKernels = await ledger.replay();

      // Assert: frozenAt is set
      const kernel = replayedKernels['KRN-TEST-004'];
      expect(kernel.maturity).toBe('frozen');
      expect(kernel.frozenAt).toBeDefined();
    });
  });

  describe('u.link_evidence Replay', () => {
    it('should replay u.link_evidence and add artifact to relatedArtifacts', async () => {
      // Arrange: Create Kernel
      const createOp: CreateKernelOperation = {
        op: 'u.create_kernel',
        actor: 'TestRunner',
        issue: '#104',
        payload: {
          kernel_id: 'KRN-TEST-005',
          statement: 'Kernel for evidence test',
          category: 'requirement',
          owner: 'TestOwner',
        },
      };
      await runtime.apply(createOp);

      // Act: Link artifact evidence
      const linkEvidenceOp: LinkEvidenceOperation = {
        op: 'u.link_evidence',
        actor: 'CodeGenAgent',
        issue: '#104',
        payload: {
          kernel_id: 'KRN-TEST-005',
          evidence_type: 'artifact',
          evidence_id: 'CODE-104-test-ts',
          evidence_source: 'src/test.ts',
          verification_status: 'pending',
        },
      };
      await runtime.apply(linkEvidenceOp);

      // Replay from Ledger
      const replayedKernels = await ledger.replay();

      // Assert: Evidence is added to both evidence[] and relatedArtifacts[]
      const kernel = replayedKernels['KRN-TEST-005'];
      expect(kernel.evidence).toHaveLength(1);
      expect(kernel.evidence![0].id).toBe('CODE-104-test-ts');
      expect(kernel.evidence![0].type).toBe('artifact');
      expect(kernel.evidence![0].source).toBe('src/test.ts');

      expect(kernel.relatedArtifacts).toHaveLength(1);
      expect(kernel.relatedArtifacts![0].type).toBe('code');
      expect(kernel.relatedArtifacts![0].path).toBe('src/test.ts');
      expect(kernel.relatedArtifacts![0].description).toContain('CODE-104-test-ts');

      expect(kernel.lastUpdatedAt).toBeDefined();
    });

    it('should replay u.link_evidence without adding non-artifact to relatedArtifacts', async () => {
      // Arrange: Create Kernel
      const createOp: CreateKernelOperation = {
        op: 'u.create_kernel',
        actor: 'TestRunner',
        issue: '#105',
        payload: {
          kernel_id: 'KRN-TEST-006',
          statement: 'Kernel for non-artifact evidence test',
          category: 'requirement',
          owner: 'TestOwner',
        },
      };
      await runtime.apply(createOp);

      // Act: Link test_result evidence (not artifact)
      const linkEvidenceOp: LinkEvidenceOperation = {
        op: 'u.link_evidence',
        actor: 'TestAgent',
        issue: '#105',
        payload: {
          kernel_id: 'KRN-TEST-006',
          evidence_type: 'test_result',
          evidence_id: 'TEST-105',
          evidence_source: 'test-report.json',
          verification_status: 'passed',
        },
      };
      await runtime.apply(linkEvidenceOp);

      // Replay from Ledger
      const replayedKernels = await ledger.replay();

      // Assert: Evidence is added only to evidence[], not relatedArtifacts[]
      const kernel = replayedKernels['KRN-TEST-006'];
      expect(kernel.evidence).toHaveLength(1);
      expect(kernel.evidence![0].type).toBe('test_result');

      expect(kernel.relatedArtifacts).toHaveLength(0);
    });
  });

  describe('u.record_decision Replay', () => {
    it('should replay u.record_decision correctly', async () => {
      // Arrange: Create Kernel
      const createOp: CreateKernelOperation = {
        op: 'u.create_kernel',
        actor: 'TestRunner',
        issue: '#106',
        payload: {
          kernel_id: 'KRN-TEST-007',
          statement: 'Kernel for decision test',
          category: 'requirement',
          owner: 'TestOwner',
        },
      };
      await runtime.apply(createOp);

      // Act: Record decision
      const recordDecisionOp: RecordDecisionOperation = {
        op: 'u.record_decision',
        actor: 'Decider',
        issue: '#106',
        payload: {
          kernel_id: 'KRN-TEST-007',
          decision_id: 'DEC-001',
          decision_type: 'adopt',
          decided_by: 'Decider',
          rationale: 'Test decision rationale',
          falsification_conditions: ['Condition 1', 'Condition 2'],
          assurance_level: 'AL1',
        },
      };
      await runtime.apply(recordDecisionOp);

      // Replay from Ledger
      const replayedKernels = await ledger.replay();

      // Assert: Decision is recorded
      const kernel = replayedKernels['KRN-TEST-007'];
      expect(kernel.decision).toBeDefined();
      expect(kernel.decision!.decision_id).toBe('DEC-001');
      expect(kernel.decision!.decision_type).toBe('adopt');
      expect(kernel.decision!.decided_by).toBe('Decider');
      expect(kernel.decision!.rationale).toBe('Test decision rationale');
      expect(kernel.decision!.falsification_conditions).toEqual(['Condition 1', 'Condition 2']);
      expect(kernel.decision!.assurance_level).toBe('AL1');
    });
  });

  describe('Multiple Operations Replay', () => {
    it('should replay multiple operations in correct order', async () => {
      // Arrange: Create Kernel
      const createOp: CreateKernelOperation = {
        op: 'u.create_kernel',
        actor: 'TestRunner',
        issue: '#107',
        payload: {
          kernel_id: 'KRN-TEST-008',
          statement: 'Kernel for multi-op test',
          category: 'requirement',
          owner: 'TestOwner',
          maturity: 'draft',
        },
      };
      await runtime.apply(createOp);

      // Act 1: Record decision
      const recordDecisionOp: RecordDecisionOperation = {
        op: 'u.record_decision',
        actor: 'Decider',
        issue: '#107',
        payload: {
          kernel_id: 'KRN-TEST-008',
          decision_id: 'DEC-002',
          decision_type: 'adopt',
          decided_by: 'Decider',
          rationale: 'Multi-op test',
        },
      };
      await runtime.apply(recordDecisionOp);

      // Act 2: Link evidence
      const linkEvidenceOp: LinkEvidenceOperation = {
        op: 'u.link_evidence',
        actor: 'CodeGenAgent',
        issue: '#107',
        payload: {
          kernel_id: 'KRN-TEST-008',
          evidence_type: 'artifact',
          evidence_id: 'CODE-107',
          evidence_source: 'src/multi-op.ts',
        },
      };
      await runtime.apply(linkEvidenceOp);

      // Act 3: Transition state
      const setStateOp: SetStateOperation = {
        op: 'u.set_state',
        actor: 'Approver',
        issue: '#107',
        payload: {
          kernel_id: 'KRN-TEST-008',
          from: 'draft',
          to: 'agreed',
        },
      };
      await runtime.apply(setStateOp);

      // Replay from Ledger
      const replayedKernels = await ledger.replay();

      // Assert: All operations are replayed correctly
      const kernel = replayedKernels['KRN-TEST-008'];
      expect(kernel.id).toBe('KRN-TEST-008');
      expect(kernel.statement).toBe('Kernel for multi-op test');
      expect(kernel.maturity).toBe('agreed');
      expect(kernel.approvedAt).toBeDefined();
      expect(kernel.approvedBy).toBe('Approver');
      expect(kernel.decision).toBeDefined();
      expect(kernel.decision!.decision_id).toBe('DEC-002');
      expect(kernel.evidence).toHaveLength(1);
      expect(kernel.evidence![0].id).toBe('CODE-107');
      expect(kernel.relatedArtifacts).toHaveLength(1);
      expect(kernel.relatedArtifacts![0].path).toBe('src/multi-op.ts');
    });
  });

  describe('Replay Consistency with KernelRegistry', () => {
    it('should produce identical state between Replay and KernelRegistry', async () => {
      // Arrange: Create Kernel via Runtime (writes to both Ledger and Registry)
      const createOp: CreateKernelOperation = {
        op: 'u.create_kernel',
        actor: 'TestRunner',
        issue: '#108',
        payload: {
          kernel_id: 'KRN-TEST-009',
          statement: 'Consistency test kernel',
          category: 'security',
          owner: 'TestOwner',
          maturity: 'draft',
          needs: [
            {
              id: 'NEED-009',
              statement: 'Need for consistency',
              stakeholder: 'ProductOwner',
              sourceType: 'business_requirement',
              priority: 'high',
              rationale: 'Test',
              traceability: { upstream: [], downstream: [] },
            },
          ],
          tags: ['consistency', 'test'],
        },
      };
      await runtime.apply(createOp);

      // Act: Transition state
      const setStateOp: SetStateOperation = {
        op: 'u.set_state',
        actor: 'Approver',
        issue: '#108',
        payload: {
          kernel_id: 'KRN-TEST-009',
          from: 'draft',
          to: 'agreed',
        },
      };
      await runtime.apply(setStateOp);

      // Get state from KernelRegistry
      const registryKernel = await registry.getKernel('KRN-TEST-009');

      // Replay from Ledger
      const replayedKernels = await ledger.replay();
      const replayedKernel = replayedKernels['KRN-TEST-009'];

      // Assert: Key fields match
      expect(replayedKernel.id).toBe(registryKernel!.id);
      expect(replayedKernel.statement).toBe(registryKernel!.statement);
      expect(replayedKernel.category).toBe(registryKernel!.category);
      expect(replayedKernel.owner).toBe(registryKernel!.owner);
      expect(replayedKernel.maturity).toBe(registryKernel!.maturity);
      expect(replayedKernel.approvedBy).toBe(registryKernel!.approvedBy);
      expect(replayedKernel.needs?.length).toBe(registryKernel!.needs?.length);
      expect(replayedKernel.tags).toEqual(registryKernel!.tags);
    });
  });
});
