/**
 * GateKeeperAgent - Gate Control Management
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { AgentConfig, AgentResult } from '../types';
import {
  GateId,
  GateStatus,
  GateResult,
  GateCheckResult,
  GateExemption,
  GateRegistry,
  GateStats,
} from '../types/gate';
import { getGateDefinition, getGateSequence } from '../config/gates';

export interface CheckGateInput {
  gateId: GateId;
  checkedBy: string;
  issueNumber?: number;
  context?: any;
}

export interface ExemptGateInput {
  gateId: GateId;
  reason: string;
  approvedBy: string;
  expiresAt?: string;
  linkedExceptionId?: string;
}

export class GateKeeperAgent {
  private config: AgentConfig;
  private registryPath: string;

  constructor(config: AgentConfig) {
    this.config = config;
    this.registryPath = path.join(process.cwd(), 'gates.yaml');
  }

  private log(message: string): void {
    if (this.config.verbose) {
      console.log(`[${new Date().toISOString()}] [GateKeeperAgent] ${message}`);
    }
  }

  async checkGate(input: CheckGateInput): Promise<AgentResult<GateResult>> {
    const startTime = Date.now();
    this.log(`Checking Gate: ${input.gateId}`);
    try {
      const gateDefinition = getGateDefinition(input.gateId);
      if (!gateDefinition) throw new Error(`Gate ${input.gateId} not found`);

      const checkResults: GateCheckResult[] = [];
      let allRequiredPassed = true;

      for (const check of gateDefinition.checks) {
        const passed = input.context ? await this.evaluateCheck(check.id, input.context) : true;
        checkResults.push({
          checkId: check.id,
          passed,
          message: passed ? `✅ ${check.description}` : `❌ ${check.description}`,
          checkedAt: new Date().toISOString(),
        });

        if (check.required && !passed) {
          allRequiredPassed = false;
        }
      }

      const status: GateStatus = allRequiredPassed ? 'passed' : 'failed';
      const gateResult: GateResult = {
        gateId: input.gateId,
        status,
        checkedAt: new Date().toISOString(),
        checkedBy: input.checkedBy,
        checkResults,
        issueNumber: input.issueNumber,
      };

      const registry = await this.loadRegistry();
      registry.gateResults.push(gateResult);
      registry.lastUpdated = new Date().toISOString();

      if (!this.config.dryRun) await this.saveRegistry(registry);
      this.log(`Gate ${input.gateId}: ${status}`);

      return { status: status === 'passed' ? 'success' : 'blocked', data: gateResult, metrics: { durationMs: Date.now() - startTime, timestamp: new Date().toISOString() } };
    } catch (error) {
      return { status: 'error', error: error as Error, metrics: { durationMs: Date.now() - startTime, timestamp: new Date().toISOString() } };
    }
  }

  async exemptGate(input: ExemptGateInput): Promise<AgentResult<GateResult>> {
    const startTime = Date.now();
    this.log(`Exempting Gate: ${input.gateId}`);
    try {
      const gateDefinition = getGateDefinition(input.gateId);
      if (!gateDefinition) throw new Error(`Gate ${input.gateId} not found`);

      const exemption: GateExemption = {
        reason: input.reason,
        approvedBy: input.approvedBy,
        approvedAt: new Date().toISOString(),
        expiresAt: input.expiresAt,
        linkedExceptionId: input.linkedExceptionId,
      };

      const gateResult: GateResult = {
        gateId: input.gateId,
        status: 'skipped',
        checkedAt: new Date().toISOString(),
        checkedBy: input.approvedBy,
        checkResults: [],
        exemption,
        notes: `Gate skipped with exemption: ${input.reason}`,
      };

      const registry = await this.loadRegistry();
      registry.gateResults.push(gateResult);
      registry.lastUpdated = new Date().toISOString();

      if (!this.config.dryRun) await this.saveRegistry(registry);
      this.log(`Gate ${input.gateId} exempted`);

      return { status: 'success', data: gateResult, metrics: { durationMs: Date.now() - startTime, timestamp: new Date().toISOString() } };
    } catch (error) {
      return { status: 'error', error: error as Error, metrics: { durationMs: Date.now() - startTime, timestamp: new Date().toISOString() } };
    }
  }

  async enforceGateSequence(targetGateId: GateId): Promise<AgentResult<{ canProceed: boolean; missingGates: string[] }>> {
    const startTime = Date.now();
    this.log(`Enforcing Gate sequence for: ${targetGateId}`);
    try {
      const registry = await this.loadRegistry();
      const sequence = getGateSequence();
      const targetIndex = sequence.indexOf(targetGateId);
      if (targetIndex === -1) throw new Error(`Invalid gate: ${targetGateId}`);

      const missingGates: string[] = [];
      for (let i = 0; i < targetIndex; i++) {
        const gateId = sequence[i];
        const result = registry.gateResults.find(r => r.gateId === gateId && (r.status === 'passed' || r.status === 'skipped'));
        if (!result) {
          missingGates.push(gateId);
        }
      }

      const canProceed = missingGates.length === 0;
      this.log(`Gate sequence check: ${canProceed ? 'OK' : `Missing ${missingGates.join(', ')}`}`);

      return { status: 'success', data: { canProceed, missingGates }, metrics: { durationMs: Date.now() - startTime, timestamp: new Date().toISOString() } };
    } catch (error) {
      return { status: 'error', error: error as Error, data: { canProceed: false, missingGates: [] }, metrics: { durationMs: Date.now() - startTime, timestamp: new Date().toISOString() } };
    }
  }

  async getGateStats(): Promise<AgentResult<GateStats>> {
    const startTime = Date.now();
    try {
      const registry = await this.loadRegistry();
      const stats: GateStats = {
        totalChecks: registry.gateResults.length,
        byStatus: { pending: 0, passed: 0, failed: 0, skipped: 0 },
        byGate: { G2: 0, G3: 0, G4: 0, G5: 0, G6: 0 },
        passRate: 0,
        skippedCount: 0,
        skippedGateIds: [],
      };

      for (const result of registry.gateResults) {
        stats.byStatus[result.status]++;
        stats.byGate[result.gateId]++;
        if (result.status === 'skipped') {
          stats.skippedCount++;
          stats.skippedGateIds.push(`${result.gateId}`);
        }
      }

      const passedAndSkipped = stats.byStatus.passed + stats.byStatus.skipped;
      stats.passRate = stats.totalChecks > 0 ? (passedAndSkipped / stats.totalChecks) * 100 : 0;

      return { status: 'success', data: stats, metrics: { durationMs: Date.now() - startTime, timestamp: new Date().toISOString() } };
    } catch (error) {
      return { status: 'error', error: error as Error, metrics: { durationMs: Date.now() - startTime, timestamp: new Date().toISOString() } };
    }
  }

  private async evaluateCheck(_checkId: string, _context: any): Promise<boolean> {
    // Placeholder: 実際にはcontextを評価してチェックを実行
    // 例: G4-1 なら context.ideas に lp_level_id があるかチェック
    return Math.random() > 0.3; // 70% 成功率
  }

  private async loadRegistry(): Promise<GateRegistry> {
    try {
      const content = await fs.readFile(this.registryPath, 'utf-8');
      return yaml.load(content) as GateRegistry;
    } catch {
      return { gateResults: [], version: '1.0.0', lastUpdated: new Date().toISOString() };
    }
  }

  private async saveRegistry(registry: GateRegistry): Promise<void> {
    await fs.writeFile(this.registryPath, yaml.dump(registry, { indent: 2, lineWidth: -1, noRefs: true }), 'utf-8');
  }
}
