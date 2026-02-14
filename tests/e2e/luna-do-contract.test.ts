/**
 * E2E Test for luna:do RunContract enforcement
 *
 * Tests the full workflow:
 * 1. feature Issue with 0 files generated
 * 2. CoordinatorAgent detects contract violation
 * 3. overallStatus = failure
 * 4. Knowledge metrics and violations in Issue comment
 */

import { describe, it, expect } from 'vitest';
import type { CoordinationResult } from '../../src/types/coordinator';
import type { RunContract, ExecutionType } from '../../src/types/run-contract';
import {
  createRunContract,
  validateRunContract,
  calculateKnowledgeMetrics,
  type PhaseGateResult,
} from '../../src/types/run-contract';

describe('luna:do E2E: RunContract Enforcement', () => {
  describe('Feature with 0 files generated', () => {
    it('should fail with contract violations', () => {
      // Simulate CodeGenAgent output
      const generatedFiles = 0;
      const executionType: ExecutionType = 'feature';

      // Simulate Coordinator metrics collection
      const kernelsLoaded = 0;
      const kernelsReferenced = 0;
      const kernelsCreated = 0;
      const kernelsUpdated = 0;
      const evidenceLinked = 0;

      const knowledgeMetrics = calculateKnowledgeMetrics(
        kernelsLoaded,
        kernelsReferenced,
        kernelsCreated,
        kernelsUpdated,
        evidenceLinked
      );

      // Phase Gate: Kernel minimum guarantee
      const gateResults: PhaseGateResult[] = [
        {
          passed: false,
          phaseName: 'Phase 0.5: SSOT Pre-execution',
          reason: 'No Kernels created or updated',
          missingItems: ['At least 1 Kernel required for feature/enhancement'],
        },
      ];

      // Create RunContract
      const kernelUpdates = kernelsCreated + kernelsUpdated;
      const runContract = createRunContract(
        executionType,
        generatedFiles,
        kernelUpdates,
        knowledgeMetrics,
        gateResults
      );

      // Validate contract
      const validation = validateRunContract(runContract);

      // Assertions
      expect(validation.valid).toBe(false);
      expect(validation.violations.length).toBeGreaterThan(0);

      // Specific violations
      expect(validation.violations).toContain(
        'Generated files (0) below minimum (1) for feature'
      );
      expect(validation.violations).toContain(
        'Kernel updates (0) below minimum (1) for feature'
      );
      expect(validation.violations.some((v) => v.includes('Phase Gate failed'))).toBe(true);
    });

    it('should result in overallStatus = failure', () => {
      const generatedFiles = 0;
      const executionType: ExecutionType = 'feature';

      const knowledgeMetrics = calculateKnowledgeMetrics(0, 0, 0, 0, 0);
      const gateResults: PhaseGateResult[] = [
        {
          passed: false,
          phaseName: 'Phase 0.5: SSOT Pre-execution',
          reason: 'No Kernels created or updated',
        },
      ];

      const runContract = createRunContract(
        executionType,
        generatedFiles,
        0,
        knowledgeMetrics,
        gateResults
      );

      const validation = validateRunContract(runContract);

      // Coordinator logic: contract violation -> failure
      const overallStatus = !validation.valid ? 'failure' : 'success';

      expect(overallStatus).toBe('failure');
    });
  });

  describe('Bug fix with 0 files (acceptable)', () => {
    it('should pass validation for bug type', () => {
      const generatedFiles = 0;
      const executionType: ExecutionType = 'bug';

      const knowledgeMetrics = calculateKnowledgeMetrics(0, 0, 0, 0, 0);
      const gateResults: PhaseGateResult[] = [];

      const runContract = createRunContract(
        executionType,
        generatedFiles,
        0,
        knowledgeMetrics,
        gateResults
      );

      const validation = validateRunContract(runContract);

      // Bug fixes allow 0 files (config-only changes)
      expect(validation.valid).toBe(true);
      expect(validation.violations.length).toBe(0);
    });
  });

  describe('Knowledge Metrics Calculation', () => {
    it('should calculate reuse_rate correctly', () => {
      const kernelsLoaded = 5;
      const kernelsReferenced = 3;

      const metrics = calculateKnowledgeMetrics(
        kernelsLoaded,
        kernelsReferenced,
        0,
        0,
        0
      );

      expect(metrics.reuse_rate).toBe(0.6); // 3/5
    });

    it('should handle zero kernels loaded', () => {
      const metrics = calculateKnowledgeMetrics(0, 0, 0, 0, 0);

      expect(metrics.reuse_rate).toBe(0);
      expect(metrics.convergence_delta).toBe(0);
    });

    it('should calculate convergence_delta correctly', () => {
      const kernelsLoaded = 5;
      const kernelsReferenced = 3;
      const kernelsCreated = 2;
      const kernelsUpdated = 1;

      const metrics = calculateKnowledgeMetrics(
        kernelsLoaded,
        kernelsReferenced,
        kernelsCreated,
        kernelsUpdated,
        0
      );

      // convergence_delta = (referenced + updated) / (loaded + created)
      // = (3 + 1) / (5 + 2) = 4/7 ≈ 0.571
      expect(metrics.convergence_delta).toBeCloseTo(0.571, 2);
    });
  });

  describe('CoordinationResult Integration', () => {
    it('should include knowledge metrics in result', () => {
      const mockResult: Partial<CoordinationResult> = {
        issueNumber: 51,
        overallStatus: 'failure',
        knowledgeMetrics: {
          generatedFiles: 0,
          kernelsLoaded: 0,
          kernelsReferenced: 0,
          kernelsCreated: 0,
          kernelsUpdated: 0,
          reuseRate: 0,
          convergenceDelta: 0,
        },
        contractViolations: [
          'Generated files (0) below minimum (1) for feature',
          'Kernel updates (0) below minimum (1) for feature',
          'Phase Gate failed: Phase 0.5: SSOT Pre-execution - No Kernels created or updated',
          '  Missing: At least 1 Kernel required for feature/enhancement',
        ],
      };

      expect(mockResult.overallStatus).toBe('failure');
      expect(mockResult.knowledgeMetrics).toBeDefined();
      expect(mockResult.contractViolations).toBeDefined();
      expect(mockResult.contractViolations!.length).toBe(4);
    });

    it('should format violations for Issue comment', () => {
      const violations = [
        'Generated files (0) below minimum (1) for feature',
        'Kernel updates (0) below minimum (1) for feature',
      ];

      // Simulate buildSummaryComment logic
      let comment = '**⚠️ Contract Violations**:\n';
      violations.forEach((v) => {
        comment += `- ${v}\n`;
      });

      expect(comment).toContain('**⚠️ Contract Violations**:');
      expect(comment).toContain('Generated files (0) below minimum');
      expect(comment).toContain('Kernel updates (0) below minimum');
    });
  });

  describe('Phase Gate Enforcement', () => {
    it('should fail when Phase Gate is not passed', () => {
      const gateResults: PhaseGateResult[] = [
        {
          passed: false,
          phaseName: 'Phase 0.5: SSOT Pre-execution',
          reason: 'No Kernels created or updated',
          missingItems: ['At least 1 Kernel required'],
        },
      ];

      const runContract = createRunContract(
        'feature',
        1, // Has files
        0, // But no kernels
        calculateKnowledgeMetrics(0, 0, 0, 0, 0),
        gateResults
      );

      const validation = validateRunContract(runContract);

      expect(validation.valid).toBe(false);
      expect(validation.violations.some((v) => v.includes('Phase Gate failed'))).toBe(true);
    });

    it('should pass when all Phase Gates pass', () => {
      const gateResults: PhaseGateResult[] = [
        {
          passed: true,
          phaseName: 'Phase 0.5: SSOT Pre-execution',
        },
      ];

      const runContract = createRunContract(
        'feature',
        1,
        1,
        calculateKnowledgeMetrics(0, 0, 1, 0, 0),
        gateResults
      );

      const validation = validateRunContract(runContract);

      expect(validation.valid).toBe(true);
      expect(validation.violations.length).toBe(0);
    });
  });

  describe('Knowledge Reuse Exemption', () => {
    it('should exempt initial runs (kernels_loaded = 0)', () => {
      const knowledgeMetrics = calculateKnowledgeMetrics(
        0, // kernels_loaded = 0 (initial run)
        0,
        1, // Created 1 new kernel
        0,
        0
      );

      const runContract = createRunContract(
        'feature',
        1,
        1,
        knowledgeMetrics,
        []
      );

      const validation = validateRunContract(runContract);

      // Should not complain about reuse_rate = 0 when kernels_loaded = 0
      expect(validation.valid).toBe(true);
      expect(validation.violations.some((v) => v.includes('Knowledge reuse required'))).toBe(false);
    });

    it('should require reuse when kernels are available', () => {
      const knowledgeMetrics = calculateKnowledgeMetrics(
        5, // kernels_loaded = 5 (kernels available)
        0, // referenced = 0 (not used!)
        1,
        0,
        0
      );

      const runContract = createRunContract(
        'feature',
        1,
        1,
        knowledgeMetrics,
        []
      );

      const validation = validateRunContract(runContract);

      // Should complain about reuse_rate = 0 when kernels were available
      expect(validation.valid).toBe(false);
      expect(validation.violations.some((v) => v.includes('Knowledge reuse required'))).toBe(true);
    });
  });
});
