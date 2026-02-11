import * as fs from 'fs/promises';
import * as path from 'path';
import * as yaml from 'yaml';
import { MaturityLevel, MaturityTransitionRequest } from '../types/nrvv';

interface MaturityTransitionRegistry {
  version: string;
  last_updated: string;
  requests: MaturityTransitionRequest[];
}

export class MaturityTransitionService {
  private readonly filePath: string;

  constructor(filePath?: string) {
    this.filePath =
      filePath || path.join(process.cwd(), 'data/ssot/maturity-transition-requests.yaml');
  }

  async createRequest(input: {
    kernel_id: string;
    from: MaturityLevel;
    to: MaturityLevel;
    requested_by: string;
    required_approvers: string[];
    evidence_pack_refs?: string[];
  }): Promise<MaturityTransitionRequest> {
    const registry = await this.loadRegistry();
    const request: MaturityTransitionRequest = {
      request_id: `MTR-${Date.now()}-${Math.floor(Math.random() * 10000)
        .toString()
        .padStart(4, '0')}`,
      kernel_id: input.kernel_id,
      from: input.from,
      to: input.to,
      requested_by: input.requested_by,
      requested_at: new Date().toISOString(),
      required_approvers: input.required_approvers,
      evidence_pack_refs: input.evidence_pack_refs || [],
      status: 'pending',
      approvals: [],
    };

    registry.requests.push(request);
    registry.last_updated = new Date().toISOString();
    await this.saveRegistry(registry);
    return request;
  }

  async getRequest(requestId: string): Promise<MaturityTransitionRequest | null> {
    const registry = await this.loadRegistry();
    return registry.requests.find((r) => r.request_id === requestId) || null;
  }

  async approveRequest(
    requestId: string,
    approver: string,
    signatureRef?: string
  ): Promise<MaturityTransitionRequest | null> {
    const registry = await this.loadRegistry();
    const request = registry.requests.find((r) => r.request_id === requestId);
    if (!request) return null;

    if (!request.approvals.some((a) => a.approver === approver)) {
      request.approvals.push({
        approver,
        approvedAt: new Date().toISOString(),
        signatureRef,
      });
    }

    const approvedSet = new Set(request.approvals.map((a) => a.approver));
    request.status = request.required_approvers.every((r) => approvedSet.has(r))
      ? 'approved'
      : 'pending';

    registry.last_updated = new Date().toISOString();
    await this.saveRegistry(registry);
    return request;
  }

  async commitRequest(requestId: string, committedBy: string): Promise<MaturityTransitionRequest | null> {
    const registry = await this.loadRegistry();
    const request = registry.requests.find((r) => r.request_id === requestId);
    if (!request) return null;

    request.status = 'committed';
    request.committed_by = committedBy;
    request.committed_at = new Date().toISOString();
    registry.last_updated = new Date().toISOString();
    await this.saveRegistry(registry);
    return request;
  }

  private async loadRegistry(): Promise<MaturityTransitionRegistry> {
    try {
      const content = await fs.readFile(this.filePath, 'utf-8');
      return yaml.parse(content) as MaturityTransitionRegistry;
    } catch {
      return {
        version: '1.0',
        last_updated: new Date().toISOString(),
        requests: [],
      };
    }
  }

  private async saveRegistry(registry: MaturityTransitionRegistry): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.writeFile(this.filePath, yaml.stringify(registry), 'utf-8');
  }
}

