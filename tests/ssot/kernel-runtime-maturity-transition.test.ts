import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import * as fs from 'fs/promises';
import { KernelRuntime } from '../../src/ssot/kernel-runtime';
import { ensureRulesConfigLoaded } from '../../src/services/rules-config-service';

describe('KernelRuntime maturity transition propose->commit', () => {
  const TEST_LEDGER_PATH = path.join(__dirname, '../../data/ssot/test-mtr-ledger.ndjson');
  const TEST_REGISTRY_PATH = path.join(__dirname, '../../data/ssot/test-mtr-kernels.yaml');
  const TEST_MTR_PATH = path.join(__dirname, '../../data/ssot/test-mtr-requests.yaml');

  let runtime: KernelRuntime;

  beforeEach(async () => {
    await ensureRulesConfigLoaded();
    for (const file of [TEST_LEDGER_PATH, TEST_REGISTRY_PATH, TEST_MTR_PATH]) {
      try {
        await fs.unlink(file);
      } catch {}
    }
    runtime = new KernelRuntime({
      ledgerPath: TEST_LEDGER_PATH,
      registryPath: TEST_REGISTRY_PATH,
      enableLedger: true,
      soloMode: false,
      defaultActor: 'TestRunner',
      verbose: false,
      enableAL0Gate: false,
    });
  });

  afterEach(async () => {
    for (const file of [TEST_LEDGER_PATH, TEST_REGISTRY_PATH, TEST_MTR_PATH]) {
      try {
        await fs.unlink(file);
      } catch {}
    }
  });

  it('should block direct u.set_state in propose_only mode', async () => {
    await runtime.apply({
      op: 'u.create_kernel',
      actor: 'Author',
      issue: '#1',
      payload: {
        kernel_id: 'KRN-MTR-001',
        statement: 'mtr test',
        category: 'architecture',
        owner: 'Author',
        maturity: 'under_review',
      },
    });

    const result = await runtime.apply({
      op: 'u.set_state',
      actor: 'product_owner',
      actor_role: 'product_owner',
      issue: '#1',
      payload: {
        kernel_id: 'KRN-MTR-001',
        from: 'under_review',
        to: 'agreed',
      },
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('propose_only');
  });

  it('should commit transition via request/commit operations', async () => {
    await runtime.apply({
      op: 'u.create_kernel',
      actor: 'Author',
      issue: '#2',
      payload: {
        kernel_id: 'KRN-MTR-002',
        statement: 'mtr test commit',
        category: 'architecture',
        owner: 'Author',
        maturity: 'under_review',
      },
    });

    const request = await runtime.apply({
      op: 'u.request_maturity_transition',
      actor: 'SSOTAgent',
      issue: '#2',
      payload: {
        kernel_id: 'KRN-MTR-002',
        from: 'under_review',
        to: 'agreed',
        required_approvers: ['product_owner'],
      },
    });

    expect(request.success).toBe(true);
    const requestId = request.details?.request_id as string;

    const commit = await runtime.apply({
      op: 'u.commit_maturity_transition',
      actor: 'product_owner',
      issue: '#2',
      payload: {
        request_id: requestId,
        approver: 'product_owner',
      },
    });

    expect(commit.success).toBe(true);
    expect(commit.details?.committed).toBe(true);
  });
});

