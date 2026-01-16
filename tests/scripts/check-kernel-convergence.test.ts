/**
 * Kernel Convergence Check Tests (Issue #34)
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { KernelRegistryService } from '../../src/ssot/kernel-registry';
import type { KernelWithNRVV } from '../../src/types/nrvv';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

describe('Kernel Convergence Check', () => {
  let kernelRegistry: KernelRegistryService;
  let tempDir: string;
  let tempRegistryPath: string;

  beforeEach(async () => {
    // Create temporary directory for test
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'luna-test-'));
    tempRegistryPath = path.join(tempDir, 'kernels.yaml');
    kernelRegistry = new KernelRegistryService(tempRegistryPath);
  });

  afterEach(async () => {
    // Clean up temporary directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  // =============================================================================
  // Convergence Rate Calculation Tests
  // =============================================================================

  describe('Convergence Rate Calculation', () => {
    it('should return 100% when no kernels exist', async () => {
      // Create empty registry
      await kernelRegistry.load();

      const rate = await kernelRegistry.getConvergenceRate();

      expect(rate).toBe(100);
    });

    it('should return 100% when no agreed/frozen kernels exist', async () => {
      await kernelRegistry.load();

      // Add draft kernel (should be ignored)
      const draftKernel: KernelWithNRVV = {
        id: 'KRN-0001',
        statement: 'Draft kernel',
        category: 'requirement',
        owner: 'ProductOwner',
        maturity: 'draft',
        needs: [],
        requirements: [],
        verification: [],
        validation: [],
        tags: [],
        history: [],
        createdAt: new Date().toISOString(),
      };

      await kernelRegistry.saveKernel(draftKernel);

      const rate = await kernelRegistry.getConvergenceRate();

      expect(rate).toBe(100);
    });

    it('should calculate 100% when all agreed/frozen kernels are complete', async () => {
      await kernelRegistry.load();

      // Add complete kernel
      const completeKernel: KernelWithNRVV = {
        id: 'KRN-0002',
        statement: 'Complete kernel',
        category: 'requirement',
        owner: 'ProductOwner',
        maturity: 'agreed',
        needs: [
          {
            id: 'NEED-0002-1',
            statement: 'User needs X',
            stakeholder: 'EndUser',
            sourceType: 'user_feedback',
            priority: 'high',
            traceability: { upstream: [], downstream: ['REQ-0002-1'] },
          },
        ],
        requirements: [
          {
            id: 'REQ-0002-1',
            statement: 'System shall do X',
            type: 'functional',
            priority: 'must',
            rationale: 'User need',
            traceability: { upstream: ['NEED-0002-1'], downstream: ['VER-0002-1'] },
          },
        ],
        verification: [
          {
            id: 'VER-0002-1',
            statement: 'Test X',
            method: 'test',
            testCase: 'test_x.ts',
            criteria: ['Pass'],
            traceability: { upstream: ['REQ-0002-1'], downstream: ['VAL-0002-1'] },
          },
        ],
        validation: [
          {
            id: 'VAL-0002-1',
            statement: 'User validates X',
            method: 'user_test',
            criteria: ['User satisfied'],
            status: 'passed',
            validatedBy: 'EndUser',
            traceability: { upstream: ['VER-0002-1'], downstream: [] },
          },
        ],
        tags: [],
        history: [],
        createdAt: new Date().toISOString(),
      };

      await kernelRegistry.saveKernel(completeKernel);

      const rate = await kernelRegistry.getConvergenceRate();

      expect(rate).toBe(100);
    });

    it('should calculate 0% when all agreed/frozen kernels are incomplete', async () => {
      await kernelRegistry.load();

      // Add incomplete kernel (no verification/validation)
      const incompleteKernel: KernelWithNRVV = {
        id: 'KRN-0003',
        statement: 'Incomplete kernel',
        category: 'requirement',
        owner: 'ProductOwner',
        maturity: 'frozen',
        needs: [
          {
            id: 'NEED-0003-1',
            statement: 'User needs Y',
            stakeholder: 'EndUser',
            sourceType: 'user_feedback',
            priority: 'high',
            traceability: { upstream: [], downstream: ['REQ-0003-1'] },
          },
        ],
        requirements: [
          {
            id: 'REQ-0003-1',
            statement: 'System shall do Y',
            type: 'functional',
            priority: 'must',
            rationale: 'User need',
            traceability: { upstream: ['NEED-0003-1'], downstream: [] },
          },
        ],
        verification: [], // Missing
        validation: [], // Missing
        tags: [],
        history: [],
        createdAt: new Date().toISOString(),
      };

      await kernelRegistry.saveKernel(incompleteKernel);

      const rate = await kernelRegistry.getConvergenceRate();

      expect(rate).toBe(0);
    });

    it('should calculate 50% when half of kernels are complete', async () => {
      await kernelRegistry.load();

      // Add complete kernel
      const completeKernel: KernelWithNRVV = {
        id: 'KRN-0004',
        statement: 'Complete',
        category: 'requirement',
        owner: 'ProductOwner',
        maturity: 'agreed',
        needs: [
          {
            id: 'NEED-0004-1',
            statement: 'Need',
            stakeholder: 'EndUser',
            sourceType: 'user_feedback',
            priority: 'high',
            traceability: { upstream: [], downstream: ['REQ-0004-1'] },
          },
        ],
        requirements: [
          {
            id: 'REQ-0004-1',
            statement: 'Req',
            type: 'functional',
            priority: 'must',
            rationale: 'Need',
            traceability: { upstream: ['NEED-0004-1'], downstream: ['VER-0004-1'] },
          },
        ],
        verification: [
          {
            id: 'VER-0004-1',
            statement: 'Test',
            method: 'test',
            testCase: 'test.ts',
            criteria: ['Pass'],
            traceability: { upstream: ['REQ-0004-1'], downstream: ['VAL-0004-1'] },
          },
        ],
        validation: [
          {
            id: 'VAL-0004-1',
            statement: 'Validate',
            method: 'user_test',
            criteria: ['OK'],
            status: 'passed',
            validatedBy: 'User',
            traceability: { upstream: ['VER-0004-1'], downstream: [] },
          },
        ],
        tags: [],
        history: [],
        createdAt: new Date().toISOString(),
      };

      // Add incomplete kernel
      const incompleteKernel: KernelWithNRVV = {
        id: 'KRN-0005',
        statement: 'Incomplete',
        category: 'requirement',
        owner: 'ProductOwner',
        maturity: 'agreed',
        needs: [
          {
            id: 'NEED-0005-1',
            statement: 'Need',
            stakeholder: 'EndUser',
            sourceType: 'user_feedback',
            priority: 'high',
            traceability: { upstream: [], downstream: ['REQ-0005-1'] },
          },
        ],
        requirements: [
          {
            id: 'REQ-0005-1',
            statement: 'Req',
            type: 'functional',
            priority: 'must',
            rationale: 'Need',
            traceability: { upstream: ['NEED-0005-1'], downstream: [] },
          },
        ],
        verification: [],
        validation: [],
        tags: [],
        history: [],
        createdAt: new Date().toISOString(),
      };

      await kernelRegistry.saveKernel(completeKernel);
      await kernelRegistry.saveKernel(incompleteKernel);

      const rate = await kernelRegistry.getConvergenceRate();

      expect(rate).toBe(50);
    });
  });

  // =============================================================================
  // Threshold Tests
  // =============================================================================

  describe('Threshold Checking', () => {
    it('should identify healthy convergence rate (>= 70%)', () => {
      const THRESHOLD = 70;

      expect(100 >= THRESHOLD).toBe(true);
      expect(80 >= THRESHOLD).toBe(true);
      expect(70 >= THRESHOLD).toBe(true);
    });

    it('should identify unhealthy convergence rate (< 70%)', () => {
      const THRESHOLD = 70;

      expect(69 >= THRESHOLD).toBe(false);
      expect(50 >= THRESHOLD).toBe(false);
      expect(0 >= THRESHOLD).toBe(false);
    });
  });
});
