/**
 * ExceptionRegistryAgent - Exception Management
 */

import { Octokit } from '@octokit/rest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { AgentConfig, AgentResult } from '../types';
import {
  ExceptionProposal,
  ExceptionRecord,
  ExceptionRegistry,
  ExceptionType,
  ExceptionStatus,
  ExceptionStats,
} from '../types/exception';

export interface ProposeExceptionInput {
  type: ExceptionType;
  rationale: string;
  requested_by: string;
  linked_decision_id?: string;
  requested_expiry_condition: string;
  proposed_mitigation_plan: string;
  monitoring_signal?: string;
}

export class ExceptionRegistryAgent {
  private octokit: Octokit;
  private config: AgentConfig;
  private registryPath: string;

  constructor(config: AgentConfig) {
    this.config = config;
    this.octokit = new Octokit({ auth: config.githubToken });
    this.registryPath = path.join(process.cwd(), 'exceptions.yaml');
  }

  private log(message: string): void {
    if (this.config.verbose) {
      console.log(`[${new Date().toISOString()}] [ExceptionRegistryAgent] ${message}`);
    }
  }

  async proposeException(input: ProposeExceptionInput): Promise<AgentResult<ExceptionProposal>> {
    const startTime = Date.now();
    this.log(`Proposing exception: ${input.type}`);
    try {
      const registry = await this.loadRegistry();
      const proposalId = `PROP-${String(registry.proposals.length + 1).padStart(3, '0')}`;
      const proposal: ExceptionProposal = {
        proposal_id: proposalId,
        type: input.type,
        rationale: input.rationale,
        requested_by: input.requested_by,
        requested_at: new Date().toISOString(),
        linked_decision_id: input.linked_decision_id,
        requested_expiry_condition: input.requested_expiry_condition,
        proposed_mitigation_plan: input.proposed_mitigation_plan,
        monitoring_signal: input.monitoring_signal,
      };
      registry.proposals.push(proposal);
      registry.lastUpdated = new Date().toISOString();
      if (!this.config.dryRun) await this.saveRegistry(registry);
      this.log(`Proposal ${proposalId} created`);
      return { status: 'success', data: proposal, metrics: { durationMs: Date.now() - startTime, timestamp: new Date().toISOString() } };
    } catch (error) {
      return { status: 'error', error: (error as Error).message, metrics: { durationMs: Date.now() - startTime, timestamp: new Date().toISOString() } };
    }
  }

  async approveException(proposalId: string, approver: string, linkedCrId?: string): Promise<AgentResult<ExceptionRecord>> {
    const startTime = Date.now();
    try {
      const registry = await this.loadRegistry();
      const proposal = registry.proposals.find(p => p.proposal_id === proposalId);
      if (!proposal) throw new Error('Proposal not found');
      const exceptionId = `EXC-${this.getTypeAbbrev(proposal.type)}-${Date.now()}`;
      const exception: ExceptionRecord = {
        exception_id: exceptionId,
        type: proposal.type,
        approved_by: approver,
        approved_at: new Date().toISOString(),
        expiry_condition: proposal.requested_expiry_condition,
        monitoring_signal: proposal.monitoring_signal,
        mitigation_plan: proposal.proposed_mitigation_plan,
        status: 'open',
        linked_decision_id: proposal.linked_decision_id,
        linked_cr_id: linkedCrId,
        statusHistory: [{
          status: 'open',
          changedAt: new Date().toISOString(),
          changedBy: approver,
          reason: 'Approved from proposal',
        }],
      };
      registry.exceptions.push(exception);
      registry.proposals = registry.proposals.filter(p => p.proposal_id !== proposalId);
      registry.lastUpdated = new Date().toISOString();
      if (!this.config.dryRun) await this.saveRegistry(registry);
      this.log(`Exception ${exceptionId} approved`);
      return { status: 'success', data: exception, metrics: { durationMs: Date.now() - startTime, timestamp: new Date().toISOString() } };
    } catch (error) {
      return { status: 'error', error: (error as Error).message, metrics: { durationMs: Date.now() - startTime, timestamp: new Date().toISOString() } };
    }
  }

  async updateExceptionStatus(exceptionId: string, newStatus: ExceptionStatus, changedBy: string, reason: string): Promise<AgentResult<ExceptionRecord>> {
    const startTime = Date.now();
    try {
      const registry = await this.loadRegistry();
      const exception = registry.exceptions.find(e => e.exception_id === exceptionId);
      if (!exception) throw new Error('Exception not found');
      exception.status = newStatus;
      exception.statusHistory.push({
        status: newStatus,
        changedAt: new Date().toISOString(),
        changedBy,
        reason,
      });
      registry.lastUpdated = new Date().toISOString();
      if (!this.config.dryRun) await this.saveRegistry(registry);
      return { status: 'success', data: exception, metrics: { durationMs: Date.now() - startTime, timestamp: new Date().toISOString() } };
    } catch (error) {
      return { status: 'error', error: (error as Error).message, metrics: { durationMs: Date.now() - startTime, timestamp: new Date().toISOString() } };
    }
  }

  async detectExpiredExceptions(): Promise<AgentResult<ExceptionRecord[]>> {
    const startTime = Date.now();
    try {
      const registry = await this.loadRegistry();
      const expired: ExceptionRecord[] = [];
      const now = new Date();
      for (const exception of registry.exceptions) {
        if (exception.status !== 'open') continue;
        if (this.isExpired(exception.expiry_condition, now)) {
          expired.push(exception);
        }
      }
      this.log(`Found ${expired.length} expired exceptions`);
      return { status: 'success', data: expired, metrics: { durationMs: Date.now() - startTime, timestamp: new Date().toISOString() } };
    } catch (error) {
      return { status: 'error', error: (error as Error).message, data: [], metrics: { durationMs: Date.now() - startTime, timestamp: new Date().toISOString() } };
    }
  }

  async evaluateExceptionsBySignal(): Promise<AgentResult<Array<{ exception: ExceptionRecord; shouldReview: boolean }>>> {
    const startTime = Date.now();
    try {
      const registry = await this.loadRegistry();
      const results: Array<{ exception: ExceptionRecord; shouldReview: boolean }> = [];
      for (const exception of registry.exceptions) {
        if (exception.status !== 'open' || !exception.monitoring_signal) continue;
        const shouldReview = await this.evaluateSignal(exception.monitoring_signal);
        results.push({ exception, shouldReview });
      }
      return { status: 'success', data: results, metrics: { durationMs: Date.now() - startTime, timestamp: new Date().toISOString() } };
    } catch (error) {
      return { status: 'error', error: (error as Error).message, data: [], metrics: { durationMs: Date.now() - startTime, timestamp: new Date().toISOString() } };
    }
  }

  async getExceptionStats(): Promise<AgentResult<ExceptionStats>> {
    const startTime = Date.now();
    try {
      const registry = await this.loadRegistry();
      const stats: ExceptionStats = {
        totalExceptions: registry.exceptions.length,
        byStatus: { open: 0, mitigated: 0, closed: 0, expired: 0 },
        byType: {
          E_quality_over_speed: 0,
          E_differentiation_over_cost: 0,
          E_new_value_axis: 0,
          E_boundary_exception: 0,
          E_regulation_override: 0,
          E_technical_debt: 0,
        },
        expiredCount: 0,
        expiredExceptionIds: [],
      };
      for (const exception of registry.exceptions) {
        stats.byStatus[exception.status]++;
        stats.byType[exception.type]++;
        if (exception.status === 'expired') {
          stats.expiredCount++;
          stats.expiredExceptionIds.push(exception.exception_id);
        }
      }
      return { status: 'success', data: stats, metrics: { durationMs: Date.now() - startTime, timestamp: new Date().toISOString() } };
    } catch (error) {
      return { status: 'error', error: (error as Error).message, metrics: { durationMs: Date.now() - startTime, timestamp: new Date().toISOString() } };
    }
  }

  private getTypeAbbrev(type: ExceptionType): string {
    const abbrevs: Record<ExceptionType, string> = {
      E_quality_over_speed: 'QUA',
      E_differentiation_over_cost: 'DIF',
      E_new_value_axis: 'VAL',
      E_boundary_exception: 'BND',
      E_regulation_override: 'REG',
      E_technical_debt: 'TEC',
    };
    return abbrevs[type];
  }

  private isExpired(expiryCondition: string, now: Date): boolean {
    const patterns = [
      { regex: /(\d{4})-Q([1-4])/, getValue: (m: RegExpMatchArray) => {
        const year = parseInt(m[1]);
        const quarter = parseInt(m[2]);
        const month = quarter * 3;
        return new Date(year, month, 0);
      }},
      { regex: /(\d{4})-(\d{2})-(\d{2})/, getValue: (m: RegExpMatchArray) => {
        return new Date(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3]));
      }},
    ];
    for (const pattern of patterns) {
      const match = expiryCondition.match(pattern.regex);
      if (match) {
        const expiryDate = pattern.getValue(match);
        return now > expiryDate;
      }
    }
    return false;
  }

  private async evaluateSignal(signal: string): Promise<boolean> {
    // Placeholder: 実際にはメトリクスを評価
    return Math.random() > 0.5;
  }

  private async loadRegistry(): Promise<ExceptionRegistry> {
    try {
      const content = await fs.readFile(this.registryPath, 'utf-8');
      return yaml.load(content) as ExceptionRegistry;
    } catch {
      return { proposals: [], exceptions: [], version: '1.0.0', lastUpdated: new Date().toISOString() };
    }
  }

  private async saveRegistry(registry: ExceptionRegistry): Promise<void> {
    await fs.writeFile(this.registryPath, yaml.dump(registry, { indent: 2, lineWidth: -1, noRefs: true }), 'utf-8');
  }
}
