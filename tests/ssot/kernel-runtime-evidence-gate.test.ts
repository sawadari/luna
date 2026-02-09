/**
 * Issue #49: Evidence Governance Gate Tests
 *
 * Tests for AI-generated content verification enforcement during Kernel state transitions
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { KernelRuntime } from '../../src/ssot/kernel-runtime';
import { ensureRulesConfigLoaded } from '../../src/services/rules-config-service';
import * as fs from 'fs/promises';
import * as path from 'path';
import { SetStateOperation } from '../../src/types/kernel-operations';

describe('Issue #49: Evidence Governance Gate', () => {
  let runtime: KernelRuntime;
  const testRegistryPath = path.join(__dirname, 'test-registry-evidence-gate.yaml');
  const testLedgerPath = path.join(__dirname, 'test-ledger-evidence-gate.ndjson');

  beforeEach(async () => {
    await ensureRulesConfigLoaded();

    // Initialize KernelRuntime with test paths
    runtime = new KernelRuntime({
      registryPath: testRegistryPath,
      ledgerPath: testLedgerPath,
      enableLedger: false, // Disable ledger for testing
      soloMode: true, // Skip authority checks
      enableAL0Gate: false, // Disable AL0 gate to focus on Evidence Governance testing
      enforceIssueRequired: false, // Disable issue requirement for testing
      enforceBootstrapProtection: false, // Disable bootstrap protection for testing
      dryRun: false,
      verbose: false,
    });

    // Create test registry file
    await fs.writeFile(
      testRegistryPath,
      `meta:
  registry_version: "1.0"
  last_updated: "${new Date().toISOString()}"
  last_updated_by: "Test"
  schema_version: "nrvv-1.0"
  description: "Test Kernel Registry for Evidence Governance"

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

  describe('AI-generated content with verification', () => {
    it('should allow state transition for verified AI-generated evidence', async () => {
      // Create kernel with verified AI-generated evidence
      const createResult = await runtime.apply({
        op: 'u.create_kernel',
        actor: 'test_actor',
        issue: 'TEST-001',
        payload: {
          kernel_id: 'KRN-EVI-001',
          statement: 'Test kernel with verified AI evidence',
          category: 'requirement',
          owner: 'test_owner',
          maturity: 'draft',
        },
      });
      expect(createResult.success).toBe(true);

      // Link verified AI-generated evidence
      const evidenceResult = await runtime.apply({
        op: 'u.link_evidence',
        actor: 'test_actor',
        issue: 'TEST-001',
        payload: {
          kernel_id: 'KRN-EVI-001',
          evidence_type: 'artifact',
          evidence_id: 'EVI-AI-001',
          evidence_source: 'src/generated/code.ts',
          source_origin: 'ai', // AI-generated
          verification_status: 'verified', // ✅ Verified
        },
      });
      expect(evidenceResult.success).toBe(true);

      // Attempt state transition: draft -> under_review
      const setStateResult = await runtime.apply({
        op: 'u.set_state',
        actor: 'test_actor',
        issue: 'TEST-001',
        payload: {
          kernel_id: 'KRN-EVI-001',
          from: 'draft',
          to: 'under_review',
          reason: 'Ready for review',
        },
      });

      // Should succeed because AI evidence is verified
      expect(setStateResult.success).toBe(true);
      expect(setStateResult.details?.to).toBe('under_review');
    });

    it('should block state transition for unverified AI-generated evidence', async () => {
      // Create kernel with unverified AI-generated evidence
      const createResult = await runtime.apply({
        op: 'u.create_kernel',
        actor: 'test_actor',
        issue: 'TEST-002',
        payload: {
          kernel_id: 'KRN-EVI-002',
          statement: 'Test kernel with unverified AI evidence',
          category: 'requirement',
          owner: 'test_owner',
          maturity: 'draft',
        },
      });
      expect(createResult.success).toBe(true);

      // Link unverified AI-generated evidence (source_origin: 'ai', verification_status: 'pending')
      const evidenceResult = await runtime.apply({
        op: 'u.link_evidence',
        actor: 'test_actor',
        issue: 'TEST-002',
        payload: {
          kernel_id: 'KRN-EVI-002',
          evidence_type: 'artifact',
          evidence_id: 'EVI-AI-002',
          evidence_source: 'src/generated/code.ts',
          source_origin: 'ai', // AI-generated
          verification_status: 'pending', // ❌ Not verified
        },
      });
      expect(evidenceResult.success).toBe(true);

      // Attempt state transition: draft -> under_review
      const setStateResult = await runtime.apply({
        op: 'u.set_state',
        actor: 'test_actor',
        issue: 'TEST-002',
        payload: {
          kernel_id: 'KRN-EVI-002',
          from: 'draft',
          to: 'under_review',
          reason: 'Ready for review',
        },
      });

      // Should fail because AI evidence is not verified
      expect(setStateResult.success).toBe(false);
      expect(setStateResult.error).toContain('Evidence Governance');
      expect(setStateResult.error).toContain('Unverified AI-generated content');
      expect(setStateResult.details?.gate_checks?.evidence_governance).toBeDefined();
      expect(setStateResult.details?.gate_checks?.evidence_governance.passed).toBe(false);
    });

    it('should include rejection reason in OperationResult', async () => {
      // Create kernel
      await runtime.apply({
        op: 'u.create_kernel',
        actor: 'test_actor',
        issue: 'TEST-003',
        payload: {
          kernel_id: 'KRN-EVI-003',
          statement: 'Test kernel for rejection reason',
          category: 'requirement',
          owner: 'test_owner',
          maturity: 'draft',
        },
      });

      // Link unverified AI evidence
      await runtime.apply({
        op: 'u.link_evidence',
        actor: 'test_actor',
        issue: 'TEST-003',
        payload: {
          kernel_id: 'KRN-EVI-003',
          evidence_type: 'artifact',
          evidence_id: 'EVI-AI-003',
          evidence_source: 'src/generated/code.ts',
          source_origin: 'ai', // AI-generated
          verification_status: 'pending',
        },
      });

      // Attempt state transition
      const setStateResult = await runtime.apply({
        op: 'u.set_state',
        actor: 'test_actor',
        issue: 'TEST-003',
        payload: {
          kernel_id: 'KRN-EVI-003',
          from: 'draft',
          to: 'under_review',
          reason: 'Ready for review',
        },
      });

      // Verify rejection reason includes evidence ID
      expect(setStateResult.success).toBe(false);
      expect(setStateResult.details?.gate_checks?.evidence_governance.message).toContain('EVI-AI-003');
    });
  });

  describe('Human-generated content', () => {
    it('should allow state transition for human-generated evidence without verification', async () => {
      // Create kernel
      const createResult = await runtime.apply({
        op: 'u.create_kernel',
        actor: 'test_actor',
        issue: 'TEST-004',
        payload: {
          kernel_id: 'KRN-EVI-004',
          statement: 'Test kernel with human evidence',
          category: 'requirement',
          owner: 'test_owner',
          maturity: 'draft',
        },
      });
      expect(createResult.success).toBe(true);

      // Link human-generated evidence (source_origin: 'human', no verification_status needed)
      const evidenceResult = await runtime.apply({
        op: 'u.link_evidence',
        actor: 'test_actor',
        issue: 'TEST-004',
        payload: {
          kernel_id: 'KRN-EVI-004',
          evidence_type: 'artifact',
          evidence_id: 'EVI-HUMAN-001',
          evidence_source: 'src/manual/code.ts',
          source_origin: 'human', // Human-generated
          verification_status: 'pending', // Even pending is OK for human content
        },
      });
      expect(evidenceResult.success).toBe(true);

      // Attempt state transition: draft -> under_review
      const setStateResult = await runtime.apply({
        op: 'u.set_state',
        actor: 'test_actor',
        issue: 'TEST-004',
        payload: {
          kernel_id: 'KRN-EVI-004',
          from: 'draft',
          to: 'under_review',
          reason: 'Ready for review',
        },
      });

      // Should succeed because human evidence doesn't require verification
      expect(setStateResult.success).toBe(true);
      expect(setStateResult.details?.to).toBe('under_review');
    });
  });

  describe('Kernel without evidence', () => {
    it('should allow state transition for kernel without any evidence', async () => {
      // Create kernel without evidence
      const createResult = await runtime.apply({
        op: 'u.create_kernel',
        actor: 'test_actor',
        issue: 'TEST-005',
        payload: {
          kernel_id: 'KRN-EVI-005',
          statement: 'Test kernel without evidence',
          category: 'requirement',
          owner: 'test_owner',
          maturity: 'draft',
        },
      });
      expect(createResult.success).toBe(true);

      // Attempt state transition without linking any evidence
      const setStateResult = await runtime.apply({
        op: 'u.set_state',
        actor: 'test_actor',
        issue: 'TEST-005',
        payload: {
          kernel_id: 'KRN-EVI-005',
          from: 'draft',
          to: 'under_review',
          reason: 'Ready for review',
        },
      });

      // Should succeed because there's no AI evidence to verify
      expect(setStateResult.success).toBe(true);
      expect(setStateResult.details?.to).toBe('under_review');
      expect(setStateResult.details?.gate_checks?.evidence_governance.passed).toBe(true);
    });
  });

  describe('Multiple evidence sources', () => {
    it('should block if any AI evidence is unverified', async () => {
      // Create kernel
      await runtime.apply({
        op: 'u.create_kernel',
        actor: 'test_actor',
        issue: 'TEST-006',
        payload: {
          kernel_id: 'KRN-EVI-006',
          statement: 'Test kernel with mixed evidence',
          category: 'requirement',
          owner: 'test_owner',
          maturity: 'draft',
        },
      });

      // Link verified AI evidence
      await runtime.apply({
        op: 'u.link_evidence',
        actor: 'test_actor',
        issue: 'TEST-006',
        payload: {
          kernel_id: 'KRN-EVI-006',
          evidence_type: 'artifact',
          evidence_id: 'EVI-AI-VERIFIED',
          evidence_source: 'src/verified.ts',
          source_origin: 'ai', // AI-generated
          verification_status: 'verified', // ✅ Verified
        },
      });

      // Link unverified AI evidence
      await runtime.apply({
        op: 'u.link_evidence',
        actor: 'test_actor',
        issue: 'TEST-006',
        payload: {
          kernel_id: 'KRN-EVI-006',
          evidence_type: 'artifact',
          evidence_id: 'EVI-AI-UNVERIFIED',
          evidence_source: 'src/unverified.ts',
          source_origin: 'ai', // AI-generated
          verification_status: 'pending', // ❌ Not verified
        },
      });

      // Attempt state transition
      const setStateResult = await runtime.apply({
        op: 'u.set_state',
        actor: 'test_actor',
        issue: 'TEST-006',
        payload: {
          kernel_id: 'KRN-EVI-006',
          from: 'draft',
          to: 'under_review',
          reason: 'Ready for review',
        },
      });

      // Should fail because one AI evidence is unverified
      expect(setStateResult.success).toBe(false);
      expect(setStateResult.error).toContain('Evidence Governance');
      expect(setStateResult.details?.gate_checks?.evidence_governance.message).toContain('EVI-AI-UNVERIFIED');
    });
  });

  describe('Allowed/Blocked sources configuration', () => {
    it('should respect allowed_unverified_sources (human is allowed)', async () => {
      // Create kernel
      await runtime.apply({
        op: 'u.create_kernel',
        actor: 'test_actor',
        issue: 'TEST-007',
        payload: {
          kernel_id: 'KRN-EVI-007',
          statement: 'Test kernel for allowed sources',
          category: 'requirement',
          owner: 'test_owner',
          maturity: 'draft',
        },
      });

      // Link human evidence (unverified, but should be allowed per config)
      await runtime.apply({
        op: 'u.link_evidence',
        actor: 'test_actor',
        issue: 'TEST-007',
        payload: {
          kernel_id: 'KRN-EVI-007',
          evidence_type: 'artifact',
          evidence_id: 'EVI-HUMAN-UNVERIFIED',
          evidence_source: 'src/human.ts',
          source_origin: 'human', // Human-generated
          verification_status: 'pending', // Not verified
        },
      });

      // Attempt state transition
      const setStateResult = await runtime.apply({
        op: 'u.set_state',
        actor: 'test_actor',
        issue: 'TEST-007',
        payload: {
          kernel_id: 'KRN-EVI-007',
          from: 'draft',
          to: 'under_review',
          reason: 'Ready for review',
        },
      });

      // Should succeed because 'human' is in allowed_unverified_sources
      expect(setStateResult.success).toBe(true);
      expect(setStateResult.details?.gate_checks?.evidence_governance.passed).toBe(true);
    });

    it('should block sources in blocked_unverified_sources (hybrid)', async () => {
      // Create kernel
      await runtime.apply({
        op: 'u.create_kernel',
        actor: 'test_actor',
        issue: 'TEST-008',
        payload: {
          kernel_id: 'KRN-EVI-008',
          statement: 'Test kernel for blocked sources',
          category: 'requirement',
          owner: 'test_owner',
          maturity: 'draft',
        },
      });

      // Link hybrid evidence (unverified, should be blocked per config)
      await runtime.apply({
        op: 'u.link_evidence',
        actor: 'test_actor',
        issue: 'TEST-008',
        payload: {
          kernel_id: 'KRN-EVI-008',
          evidence_type: 'artifact',
          evidence_id: 'EVI-HYBRID-UNVERIFIED',
          evidence_source: 'src/hybrid.ts',
          source_origin: 'hybrid', // Hybrid-generated
          verification_status: 'pending', // Not verified
        },
      });

      // Attempt state transition
      const setStateResult = await runtime.apply({
        op: 'u.set_state',
        actor: 'test_actor',
        issue: 'TEST-008',
        payload: {
          kernel_id: 'KRN-EVI-008',
          from: 'draft',
          to: 'under_review',
          reason: 'Ready for review',
        },
      });

      // Should fail because 'hybrid' is in blocked_unverified_sources
      expect(setStateResult.success).toBe(false);
      expect(setStateResult.error).toContain('Evidence Governance');
      expect(setStateResult.details?.gate_checks?.evidence_governance.message).toContain('EVI-HYBRID-UNVERIFIED');
    });

    it('should block unknown source_origin when unverified (strict whitelist)', async () => {
      // Create kernel
      await runtime.apply({
        op: 'u.create_kernel',
        actor: 'test_actor',
        issue: 'TEST-009',
        payload: {
          kernel_id: 'KRN-EVI-009',
          statement: 'Test kernel for unknown sources',
          category: 'requirement',
          owner: 'test_owner',
          maturity: 'draft',
        },
      });

      // Link evidence with unknown source_origin (not in allowed or blocked lists)
      await runtime.apply({
        op: 'u.link_evidence',
        actor: 'test_actor',
        issue: 'TEST-009',
        payload: {
          kernel_id: 'KRN-EVI-009',
          evidence_type: 'artifact',
          evidence_id: 'EVI-UNKNOWN-UNVERIFIED',
          evidence_source: 'src/unknown.ts',
          source_origin: 'unknown' as any, // Unknown source_origin
          verification_status: 'pending', // Not verified
        },
      });

      // Attempt state transition
      const setStateResult = await runtime.apply({
        op: 'u.set_state',
        actor: 'test_actor',
        issue: 'TEST-009',
        payload: {
          kernel_id: 'KRN-EVI-009',
          from: 'draft',
          to: 'under_review',
          reason: 'Ready for review',
        },
      });

      // Should fail because unknown sources require verification (strict whitelist mode)
      expect(setStateResult.success).toBe(false);
      expect(setStateResult.error).toContain('Evidence Governance');
      expect(setStateResult.details?.gate_checks?.evidence_governance.message).toContain('EVI-UNKNOWN-UNVERIFIED');
      expect(setStateResult.details?.gate_checks?.evidence_governance.message).toContain('non-allowed sources');
    });

    it('should allow unknown source_origin when verified', async () => {
      // Create kernel
      await runtime.apply({
        op: 'u.create_kernel',
        actor: 'test_actor',
        issue: 'TEST-010',
        payload: {
          kernel_id: 'KRN-EVI-010',
          statement: 'Test kernel for verified unknown sources',
          category: 'requirement',
          owner: 'test_owner',
          maturity: 'draft',
        },
      });

      // Link evidence with unknown source_origin but verified
      await runtime.apply({
        op: 'u.link_evidence',
        actor: 'test_actor',
        issue: 'TEST-010',
        payload: {
          kernel_id: 'KRN-EVI-010',
          evidence_type: 'artifact',
          evidence_id: 'EVI-UNKNOWN-VERIFIED',
          evidence_source: 'src/unknown-verified.ts',
          source_origin: 'unknown' as any, // Unknown source_origin
          verification_status: 'verified', // But verified
        },
      });

      // Attempt state transition
      const setStateResult = await runtime.apply({
        op: 'u.set_state',
        actor: 'test_actor',
        issue: 'TEST-010',
        payload: {
          kernel_id: 'KRN-EVI-010',
          from: 'draft',
          to: 'under_review',
          reason: 'Ready for review',
        },
      });

      // Should succeed because verification status is 'verified'
      expect(setStateResult.success).toBe(true);
      expect(setStateResult.details?.to).toBe('under_review');
    });
  });
});
