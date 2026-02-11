import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import * as fs from 'fs/promises';
import { MaturityTransitionService } from '../../src/services/maturity-transition-service';

describe('MaturityTransitionService', () => {
  const TEST_FILE = path.join(__dirname, '../../data/ssot/test-maturity-transition-requests.yaml');
  let service: MaturityTransitionService;

  beforeEach(async () => {
    try {
      await fs.unlink(TEST_FILE);
    } catch {}
    service = new MaturityTransitionService(TEST_FILE);
  });

  afterEach(async () => {
    try {
      await fs.unlink(TEST_FILE);
    } catch {}
  });

  it('should create request and keep pending before all approvals', async () => {
    const request = await service.createRequest({
      kernel_id: 'KRN-TEST-001',
      from: 'under_review',
      to: 'agreed',
      requested_by: 'SSOTAgent',
      required_approvers: ['product_owner', 'ssot_reviewer'],
    });

    expect(request.status).toBe('pending');
    const approved = await service.approveRequest(request.request_id, 'product_owner');
    expect(approved?.status).toBe('pending');
  });

  it('should mark approved when all required approvers are satisfied', async () => {
    const request = await service.createRequest({
      kernel_id: 'KRN-TEST-002',
      from: 'agreed',
      to: 'frozen',
      requested_by: 'DeploymentAgent',
      required_approvers: ['product_owner', 'ssot_reviewer'],
    });

    await service.approveRequest(request.request_id, 'product_owner');
    const approved = await service.approveRequest(request.request_id, 'ssot_reviewer');
    expect(approved?.status).toBe('approved');
  });
});

