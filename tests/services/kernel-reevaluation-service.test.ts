/**
 * KernelReevaluationService Tests
 *
 * Issue #51: Kernel再評価トリガー管理のテスト
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { KernelReevaluationService } from '../../src/services/kernel-reevaluation-service';
import {
  KernelReevaluationInput,
  generateDedupeKey,
} from '../../src/types/kernel-reevaluation';
import { ensureRulesConfigLoaded } from '../../src/services/rules-config-service';
import * as fs from 'fs/promises';
import * as path from 'path';

describe('KernelReevaluationService', () => {
  let service: KernelReevaluationService;
  const testReevaluationsPath = path.join(
    __dirname,
    'test-reevaluations.yaml'
  );
  const testRegistryPath = path.join(__dirname, 'test-registry.yaml');
  const testLedgerPath = path.join(__dirname, 'test-ledger.ndjson');

  beforeEach(async () => {
    // Issue #40: Load rules config before creating KernelRuntime
    await ensureRulesConfigLoaded();

    service = new KernelReevaluationService({
      githubToken: 'test-token',
      repository: 'owner/repo',
      reevaluationsPath: testReevaluationsPath,
      kernelRegistryPath: testRegistryPath,
      kernelLedgerPath: testLedgerPath,
      dryRun: false,
      verbose: true,
    });

    // Create test registry file
    await fs.writeFile(
      testRegistryPath,
      `meta:
  registry_version: "1.0"
  last_updated: "${new Date().toISOString()}"
  schema_version: "nrvv-1.0"
kernels:
  KRN-TEST-001:
    id: KRN-TEST-001
    statement: "Test Kernel"
    category: requirement
    owner: TestUser
    maturity: agreed
    createdAt: "${new Date().toISOString()}"
    lastUpdatedAt: "${new Date().toISOString()}"
    requirements: []
    verification: []
    validation: []
`,
      'utf-8'
    );
  });

  afterEach(async () => {
    // Cleanup test files
    try {
      await fs.unlink(testReevaluationsPath);
    } catch {
      // Ignore
    }
    try {
      await fs.unlink(testRegistryPath);
    } catch {
      // Ignore
    }
    try {
      await fs.unlink(testLedgerPath);
    } catch {
      // Ignore
    }
  });

  describe('generateDedupeKey', () => {
    it('should generate consistent dedupe key for same inputs', () => {
      const key1 = generateDedupeKey(
        'KRN-TEST-001',
        'assumption_invalidated',
        'ASM-001'
      );
      const key2 = generateDedupeKey(
        'KRN-TEST-001',
        'assumption_invalidated',
        'ASM-001'
      );

      expect(key1).toBe(key2);
      expect(key1).toContain('KRN-TEST-001:assumption_invalidated:ASM-001');
    });

    it('should generate same keys regardless of date (24-hour check is service-side)', () => {
      const key1 = generateDedupeKey(
        'KRN-TEST-001',
        'assumption_invalidated',
        'ASM-001'
      );

      // Issue #51 (Medium fix): Keys are now time-independent
      const key2 = generateDedupeKey(
        'KRN-TEST-001',
        'assumption_invalidated',
        'ASM-001'
      );

      expect(key1).toBe(key2);
      expect(key1).toBe('KRN-TEST-001:assumption_invalidated:ASM-001');
    });
  });

  describe('startReevaluation', () => {
    it('should create reevaluation with GitHub Issue (severity: high)', async () => {
      const input: KernelReevaluationInput = {
        triggerType: 'assumption_invalidated',
        kernel_id: 'KRN-TEST-001',
        triggeredBy: 'AssumptionTrackerAgent',
        trigger_details: {
          assumption_id: 'ASM-001',
          assumption_statement: 'Test assumption',
          invalidation_reason: 'Test invalidation',
        },
        severity: 'high',
      };

      // Mock GitHub API
      const mockOctokit = {
        issues: {
          create: vi.fn().mockResolvedValue({ data: { number: 100 } }),
        },
      };
      (service as any).octokit = mockOctokit;

      const result = await service.startReevaluation(input);

      expect(result.success).toBe(true);
      expect(result.reevaluation_id).toMatch(/^REV-/);
      expect(result.issue_id).toBe(100);
      expect(result.deduplicated).toBe(false);
      expect(mockOctokit.issues.create).toHaveBeenCalledOnce();

      // Verify GitHub Issue creation payload
      const createCall = mockOctokit.issues.create.mock.calls[0][0];
      expect(createCall.title).toContain('[Kernel再評価]');
      expect(createCall.title).toContain('前提条件無効化');
      expect(createCall.body).toContain('KRN-TEST-001');
      expect(createCall.labels).toContain('type:reevaluation');
      expect(createCall.labels).toContain('priority:P1-High');
    });

    it('should not create GitHub Issue for low severity', async () => {
      const input: KernelReevaluationInput = {
        triggerType: 'quality_degradation',
        kernel_id: 'KRN-TEST-001',
        triggeredBy: 'MonitoringAgent',
        trigger_details: {
          metric_name: 'test_coverage',
          metric_value: 75,
          threshold: 80,
          previous_value: 82,
          degradation_rate: -0.085,
        },
        severity: 'low',
      };

      // Mock GitHub API
      const mockOctokit = {
        issues: {
          create: vi.fn(),
        },
      };
      (service as any).octokit = mockOctokit;

      const result = await service.startReevaluation(input);

      expect(result.success).toBe(true);
      expect(result.reevaluation_id).toMatch(/^REV-/);
      expect(result.issue_id).toBeUndefined();
      expect(result.deduplicated).toBe(false);
      expect(mockOctokit.issues.create).not.toHaveBeenCalled();
    });

    it('should create GitHub Issue when manual_followup_required is true', async () => {
      const input: KernelReevaluationInput = {
        triggerType: 'health_incident',
        kernel_id: 'KRN-TEST-001',
        triggeredBy: 'MonitoringAgent',
        trigger_details: {
          incident_type: 'service_downtime',
          incident_description: 'API service is down',
          affected_components: ['api-server', 'database'],
          downtime_minutes: 15,
        },
        severity: 'medium',
        manual_followup_required: true,
      };

      // Mock GitHub API
      const mockOctokit = {
        issues: {
          create: vi.fn().mockResolvedValue({ data: { number: 101 } }),
        },
      };
      (service as any).octokit = mockOctokit;

      const result = await service.startReevaluation(input);

      expect(result.success).toBe(true);
      expect(result.issue_id).toBe(101);
      expect(mockOctokit.issues.create).toHaveBeenCalledOnce();
    });

    it('should detect and return duplicate reevaluation', async () => {
      const input: KernelReevaluationInput = {
        triggerType: 'assumption_overdue',
        kernel_id: 'KRN-TEST-001',
        triggeredBy: 'AssumptionTrackerAgent',
        trigger_details: {
          assumption_id: 'ASM-002',
          assumption_statement: 'Test assumption 2',
          validation_due_date: '2026-01-01',
          days_overdue: 30,
        },
        severity: 'high',
      };

      // Mock GitHub API
      const mockOctokit = {
        issues: {
          create: vi.fn().mockResolvedValue({ data: { number: 102 } }),
        },
      };
      (service as any).octokit = mockOctokit;

      // First call - creates new reevaluation
      const result1 = await service.startReevaluation(input);
      expect(result1.success).toBe(true);
      expect(result1.deduplicated).toBe(false);

      // Second call - detects duplicate
      const result2 = await service.startReevaluation(input);
      expect(result2.success).toBe(true);
      expect(result2.deduplicated).toBe(true);
      expect(result2.existing_reevaluation_id).toBe(result1.reevaluation_id);
      expect(result2.reevaluation_id).toBe(result1.reevaluation_id);

      // GitHub Issue should only be created once
      expect(mockOctokit.issues.create).toHaveBeenCalledTimes(1);
    });

    it('should detect duplicate within 24 hours across date boundary', async () => {
      const input: KernelReevaluationInput = {
        triggerType: 'quality_degradation',
        kernel_id: 'KRN-TEST-001',
        triggeredBy: 'MonitoringAgent',
        trigger_details: {
          metric_name: 'test_metric',
          metric_value: 70,
          threshold: 80,
        },
        severity: 'high', // Changed to 'high' so Issue is created
      };

      // Mock GitHub API
      const mockOctokit = {
        issues: {
          create: vi.fn().mockResolvedValue({ data: { number: 108 } }),
        },
      };
      (service as any).octokit = mockOctokit;

      // First call at 23:59
      vi.useFakeTimers();
      const dateAt2359 = new Date('2026-02-10T23:59:00Z');
      vi.setSystemTime(dateAt2359);

      const result1 = await service.startReevaluation(input);
      expect(result1.success).toBe(true);
      expect(result1.deduplicated).toBe(false);

      // Second call at 00:01 next day (2 minutes later, within 24 hours)
      const dateAt0001 = new Date('2026-02-11T00:01:00Z');
      vi.setSystemTime(dateAt0001);

      const result2 = await service.startReevaluation(input);
      expect(result2.success).toBe(true);
      expect(result2.deduplicated).toBe(true); // Should detect as duplicate
      expect(result2.existing_reevaluation_id).toBe(result1.reevaluation_id);

      vi.useRealTimers();

      // GitHub Issue should only be created once (for first call)
      expect(mockOctokit.issues.create).toHaveBeenCalledTimes(1);
    });

    it('should NOT detect duplicate after 24 hours', async () => {
      const input: KernelReevaluationInput = {
        triggerType: 'quality_degradation',
        kernel_id: 'KRN-TEST-001',
        triggeredBy: 'MonitoringAgent',
        trigger_details: {
          metric_name: 'test_metric_2',
          metric_value: 65,
          threshold: 80,
        },
        severity: 'critical', // Changed to 'critical' so Issue is created
      };

      // Mock GitHub API
      const mockOctokit = {
        issues: {
          create: vi.fn().mockResolvedValue({ data: { number: 109 } }),
        },
      };
      (service as any).octokit = mockOctokit;

      // First call
      vi.useFakeTimers();
      const firstTime = new Date('2026-02-10T12:00:00Z');
      vi.setSystemTime(firstTime);

      const result1 = await service.startReevaluation(input);
      expect(result1.success).toBe(true);
      expect(result1.deduplicated).toBe(false);

      // Second call 25 hours later (outside 24-hour window)
      const secondTime = new Date('2026-02-11T13:01:00Z');
      vi.setSystemTime(secondTime);

      const result2 = await service.startReevaluation(input);
      expect(result2.success).toBe(true);
      expect(result2.deduplicated).toBe(false); // Should NOT be duplicate

      vi.useRealTimers();

      // GitHub Issue should be created twice (once for each call)
      expect(mockOctokit.issues.create).toHaveBeenCalledTimes(2);
    });

    it('should handle GitHub API errors gracefully', async () => {
      const input: KernelReevaluationInput = {
        triggerType: 'assumption_invalidated',
        kernel_id: 'KRN-TEST-001',
        triggeredBy: 'AssumptionTrackerAgent',
        trigger_details: {
          assumption_id: 'ASM-003',
          assumption_statement: 'Test assumption 3',
        },
        severity: 'critical',
      };

      // Mock GitHub API to fail
      const mockOctokit = {
        issues: {
          create: vi
            .fn()
            .mockRejectedValue(new Error('GitHub API rate limit exceeded')),
        },
      };
      (service as any).octokit = mockOctokit;

      const result = await service.startReevaluation(input);

      expect(result.success).toBe(false);
      expect(result.error).toContain('GitHub API rate limit exceeded');
    });
  });

  describe('completeReevaluation', () => {
    it('should complete reevaluation with resolved status', async () => {
      // First, create a reevaluation
      const input: KernelReevaluationInput = {
        triggerType: 'quality_regression',
        kernel_id: 'KRN-TEST-001',
        triggeredBy: 'MonitoringAgent',
        trigger_details: {
          metric_name: 'performance_score',
          metric_value: 60,
          threshold: 80,
          previous_value: 85,
          degradation_rate: -0.294,
        },
        severity: 'high',
      };

      // Mock GitHub API
      const mockOctokit = {
        issues: {
          create: vi.fn().mockResolvedValue({ data: { number: 103 } }),
        },
      };
      (service as any).octokit = mockOctokit;

      const startResult = await service.startReevaluation(input);
      expect(startResult.success).toBe(true);

      // Complete the reevaluation
      const record = await service.completeReevaluation(
        startResult.reevaluation_id,
        'resolved',
        'Performance issue fixed by optimizing database queries',
        'TechLead'
      );

      expect(record.status).toBe('resolved');
      expect(record.resolution).toBe(
        'Performance issue fixed by optimizing database queries'
      );
      expect(record.resolved_by).toBe('TechLead');
      expect(record.resolved_at).toBeDefined();
    });

    it('should complete reevaluation with dismissed status', async () => {
      // First, create a reevaluation
      const input: KernelReevaluationInput = {
        triggerType: 'quality_degradation',
        kernel_id: 'KRN-TEST-001',
        triggeredBy: 'MonitoringAgent',
        trigger_details: {
          metric_name: 'code_quality',
          metric_value: 78,
          threshold: 80,
        },
        severity: 'low',
      };

      // Mock GitHub API
      const mockOctokit = {
        issues: {
          create: vi.fn(),
        },
      };
      (service as any).octokit = mockOctokit;

      const startResult = await service.startReevaluation(input);
      expect(startResult.success).toBe(true);

      // Dismiss the reevaluation
      const record = await service.completeReevaluation(
        startResult.reevaluation_id,
        'dismissed',
        'False positive: metric variance is within acceptable range',
        'ProductOwner'
      );

      expect(record.status).toBe('dismissed');
      expect(record.resolution).toContain('False positive');
      expect(record.resolved_by).toBe('ProductOwner');
    });

    it('should complete reevaluation with CR candidate', async () => {
      // First, create a reevaluation
      const input: KernelReevaluationInput = {
        triggerType: 'assumption_invalidated',
        kernel_id: 'KRN-TEST-001',
        triggeredBy: 'AssumptionTrackerAgent',
        trigger_details: {
          assumption_id: 'ASM-004',
          assumption_statement: 'Users prefer feature X',
          invalidation_reason: 'User feedback indicates preference for feature Y',
        },
        severity: 'high',
      };

      // Mock GitHub API
      const mockOctokit = {
        issues: {
          create: vi.fn().mockResolvedValue({ data: { number: 104 } }),
        },
      };
      (service as any).octokit = mockOctokit;

      const startResult = await service.startReevaluation(input);
      expect(startResult.success).toBe(true);

      // Complete with CR candidate
      const record = await service.completeReevaluation(
        startResult.reevaluation_id,
        'resolved',
        'Requirement needs to be updated based on user feedback',
        'ProductOwner',
        {
          proposed_change:
            'Update requirement to prioritize feature Y over feature X',
          rationale: 'User feedback and analytics show 80% preference for Y',
          impact: 'major',
        }
      );

      expect(record.status).toBe('resolved');
      expect(record.cr_candidate).toBeDefined();
      expect(record.cr_candidate?.proposed_change).toContain('feature Y');
      expect(record.cr_candidate?.impact).toBe('major');
    });

    it('should throw error for non-existent reevaluation', async () => {
      await expect(
        service.completeReevaluation(
          'REV-999999999-9999',
          'resolved',
          'Test resolution',
          'TestUser'
        )
      ).rejects.toThrow('Reevaluation REV-999999999-9999 not found');
    });
  });

  describe('getReevaluationById', () => {
    it('should return reevaluation by ID', async () => {
      const input: KernelReevaluationInput = {
        triggerType: 'health_incident',
        kernel_id: 'KRN-TEST-001',
        triggeredBy: 'MonitoringAgent',
        trigger_details: {
          incident_type: 'high_error_rate',
          incident_description: 'Error rate exceeds threshold',
          affected_components: ['api-server'],
          error_count: 150,
        },
        severity: 'high',
      };

      // Mock GitHub API
      const mockOctokit = {
        issues: {
          create: vi.fn().mockResolvedValue({ data: { number: 105 } }),
        },
      };
      (service as any).octokit = mockOctokit;

      const startResult = await service.startReevaluation(input);
      const record = await service.getReevaluationById(
        startResult.reevaluation_id
      );

      expect(record).toBeDefined();
      expect(record?.reevaluation_id).toBe(startResult.reevaluation_id);
      expect(record?.kernel_id).toBe('KRN-TEST-001');
    });

    it('should return undefined for non-existent ID', async () => {
      const record = await service.getReevaluationById('REV-999999999-9999');
      expect(record).toBeUndefined();
    });
  });

  describe('getReevaluationsByKernel', () => {
    it('should return all reevaluations for a kernel', async () => {
      // Create multiple reevaluations for the same kernel
      const inputs: KernelReevaluationInput[] = [
        {
          triggerType: 'assumption_invalidated',
          kernel_id: 'KRN-TEST-001',
          triggeredBy: 'AssumptionTrackerAgent',
          trigger_details: {
            assumption_id: 'ASM-005',
            assumption_statement: 'Assumption 5',
          },
          severity: 'low',
        },
        {
          triggerType: 'quality_degradation',
          kernel_id: 'KRN-TEST-001',
          triggeredBy: 'MonitoringAgent',
          trigger_details: {
            metric_name: 'metric_a',
            metric_value: 70,
            threshold: 80,
          },
          severity: 'medium',
        },
      ];

      // Mock GitHub API
      const mockOctokit = {
        issues: {
          create: vi.fn().mockResolvedValue({ data: { number: 106 } }),
        },
      };
      (service as any).octokit = mockOctokit;

      for (const input of inputs) {
        await service.startReevaluation(input);
      }

      const records = await service.getReevaluationsByKernel('KRN-TEST-001');

      expect(records.length).toBeGreaterThanOrEqual(2);
      expect(records.every((r) => r.kernel_id === 'KRN-TEST-001')).toBe(true);
    });
  });

  describe('getReevaluationsByStatus', () => {
    it('should return reevaluations filtered by status', async () => {
      // Create reevaluations with different statuses
      const input1: KernelReevaluationInput = {
        triggerType: 'assumption_overdue',
        kernel_id: 'KRN-TEST-001',
        triggeredBy: 'AssumptionTrackerAgent',
        trigger_details: {
          assumption_id: 'ASM-006',
          assumption_statement: 'Assumption 6',
          days_overdue: 10,
        },
        severity: 'low',
      };

      const input2: KernelReevaluationInput = {
        triggerType: 'quality_regression',
        kernel_id: 'KRN-TEST-001',
        triggeredBy: 'MonitoringAgent',
        trigger_details: {
          metric_name: 'metric_b',
          metric_value: 50,
          threshold: 80,
        },
        severity: 'high',
      };

      // Mock GitHub API
      const mockOctokit = {
        issues: {
          create: vi.fn().mockResolvedValue({ data: { number: 107 } }),
        },
      };
      (service as any).octokit = mockOctokit;

      const result1 = await service.startReevaluation(input1);
      const result2 = await service.startReevaluation(input2);

      // Complete one of them
      await service.completeReevaluation(
        result1.reevaluation_id,
        'resolved',
        'Test resolution',
        'TestUser'
      );

      const pendingRecords = await service.getReevaluationsByStatus('pending');
      const resolvedRecords = await service.getReevaluationsByStatus(
        'resolved'
      );

      expect(
        pendingRecords.some(
          (r) => r.reevaluation_id === result2.reevaluation_id
        )
      ).toBe(true);
      expect(
        resolvedRecords.some(
          (r) => r.reevaluation_id === result1.reevaluation_id
        )
      ).toBe(true);
    });
  });
});
