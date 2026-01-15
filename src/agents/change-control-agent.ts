/**
 * ChangeControlAgent - Change Request Flow Management
 */

import { Octokit } from '@octokit/rest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { AgentConfig, AgentResult } from '../types';
import { ChangeRequest, ChangeRequestRegistry, TriggerType, DisturbanceToCRRule } from '../types/change-control';

export interface CreateChangeRequestInput {
  raised_by: string;
  trigger_type: TriggerType;
  affected_scope: string[];
  notes?: string;
}

export class ChangeControlAgent {
  private octokit: Octokit;
  private config: AgentConfig;
  private registryPath: string;

  constructor(config: AgentConfig) {
    this.config = config;
    this.octokit = new Octokit({ auth: config.githubToken });
    this.registryPath = path.join(process.cwd(), 'change-requests.yaml');
  }

  private log(message: string): void {
    if (this.config.verbose) {
      console.log(`[${new Date().toISOString()}] [ChangeControlAgent] ${message}`);
    }
  }

  async createChangeRequest(input: CreateChangeRequestInput): Promise<AgentResult<ChangeRequest>> {
    const startTime = Date.now();
    try {
      const registry = await this.loadRegistry();
      const crId = `CR-${new Date().getFullYear()}-${String(registry.changeRequests.length + 1).padStart(3, '0')}`;
      const rule = this.getRule(input.trigger_type);
      const cr: ChangeRequest = {
        cr_id: crId,
        raised_by: input.raised_by,
        raised_at: new Date().toISOString(),
        trigger_type: input.trigger_type,
        affected_scope: input.affected_scope,
        proposed_operations: rule.default_proposed_operations,
        required_reviews: rule.required_reviews,
        gate_outcome: 'pending',
        decision_update_rule: rule.decision_update_rule,
        evidence_pack_refs: [],
        notes: input.notes,
        executed: false,
      };
      registry.changeRequests.push(cr);
      registry.lastUpdated = new Date().toISOString();
      if (!this.config.dryRun) await this.saveRegistry(registry);
      return { status: 'success', data: cr, metrics: { durationMs: Date.now() - startTime, timestamp: new Date().toISOString() } };
    } catch (error) {
      return { status: 'error', error: (error as Error).message, metrics: { durationMs: Date.now() - startTime, timestamp: new Date().toISOString() } };
    }
  }

  async approveChangeRequest(crId: string, approver: string): Promise<AgentResult<ChangeRequest>> {
    const startTime = Date.now();
    try {
      const registry = await this.loadRegistry();
      const cr = registry.changeRequests.find(c => c.cr_id === crId);
      if (!cr) throw new Error('CR not found');
      cr.gate_outcome = 'approved';
      registry.lastUpdated = new Date().toISOString();
      if (!this.config.dryRun) await this.saveRegistry(registry);
      return { status: 'success', data: cr, metrics: { durationMs: Date.now() - startTime, timestamp: new Date().toISOString() } };
    } catch (error) {
      return { status: 'error', error: (error as Error).message, metrics: { durationMs: Date.now() - startTime, timestamp: new Date().toISOString() } };
    }
  }

  async executeChangeRequest(crId: string): Promise<AgentResult<ChangeRequest>> {
    const startTime = Date.now();
    try {
      const registry = await this.loadRegistry();
      const cr = registry.changeRequests.find(c => c.cr_id === crId);
      if (!cr || cr.gate_outcome !== 'approved' || cr.executed) throw new Error('Cannot execute');
      cr.executed = true;
      cr.executed_at = new Date().toISOString();
      registry.lastUpdated = new Date().toISOString();
      if (!this.config.dryRun) await this.saveRegistry(registry);
      return { status: 'success', data: cr, metrics: { durationMs: Date.now() - startTime, timestamp: new Date().toISOString() } };
    } catch (error) {
      return { status: 'error', error: (error as Error).message, metrics: { durationMs: Date.now() - startTime, timestamp: new Date().toISOString() } };
    }
  }

  async listChangeRequests(): Promise<AgentResult<ChangeRequest[]>> {
    const startTime = Date.now();
    try {
      const registry = await this.loadRegistry();
      return { status: 'success', data: registry.changeRequests, metrics: { durationMs: Date.now() - startTime, timestamp: new Date().toISOString() } };
    } catch (error) {
      return { status: 'error', error: (error as Error).message, data: [], metrics: { durationMs: Date.now() - startTime, timestamp: new Date().toISOString() } };
    }
  }

  async rollbackChangeRequest(crId: string): Promise<AgentResult<ChangeRequest>> {
    const startTime = Date.now();
    try {
      const registry = await this.loadRegistry();
      const cr = registry.changeRequests.find(c => c.cr_id === crId);
      if (!cr || !cr.executed) throw new Error('Cannot rollback');
      cr.executed = false;
      cr.executed_at = undefined;
      cr.gate_outcome = 'pending';
      registry.lastUpdated = new Date().toISOString();
      if (!this.config.dryRun) await this.saveRegistry(registry);
      return { status: 'success', data: cr, metrics: { durationMs: Date.now() - startTime, timestamp: new Date().toISOString() } };
    } catch (error) {
      return { status: 'error', error: (error as Error).message, metrics: { durationMs: Date.now() - startTime, timestamp: new Date().toISOString() } };
    }
  }

  private getRule(t: TriggerType): DisturbanceToCRRule {
    const rules: Record<TriggerType, DisturbanceToCRRule> = {
      regulation_change: { trigger_type: 'regulation_change', default_proposed_operations: ['u.retype', 'u.record_decision'], required_reviews: ['gate.compliance_check', 'gate.po_approval'], decision_update_rule: 'must_update_decision' },
      safety_or_quality_incident: { trigger_type: 'safety_or_quality_incident', default_proposed_operations: ['u.quarantine_evidence', 'u.raise_exception'], required_reviews: ['gate.review', 'gate.security_review', 'gate.po_approval'], decision_update_rule: 'must_update_decision' },
      market_or_customer_shift: { trigger_type: 'market_or_customer_shift', default_proposed_operations: ['u.retype', 'u.record_decision'], required_reviews: ['gate.po_approval'], decision_update_rule: 'may_update_decision' },
      key_assumption_invalidated: { trigger_type: 'key_assumption_invalidated', default_proposed_operations: ['u.record_decision', 'u.raise_exception'], required_reviews: ['gate.review', 'gate.po_approval'], decision_update_rule: 'must_update_decision' },
      cost_or_schedule_disruption: { trigger_type: 'cost_or_schedule_disruption', default_proposed_operations: ['u.rewire', 'u.raise_exception'], required_reviews: ['gate.po_approval'], decision_update_rule: 'may_update_decision' },
      supplier_or_boundary_change: { trigger_type: 'supplier_or_boundary_change', default_proposed_operations: ['u.rewire', 'u.record_decision'], required_reviews: ['gate.review', 'gate.po_approval'], decision_update_rule: 'must_update_decision' },
      ai_generated_contamination: { trigger_type: 'ai_generated_contamination', default_proposed_operations: ['u.quarantine_evidence', 'u.link_evidence'], required_reviews: ['gate.evidence_verification', 'gate.review', 'gate.po_approval'], decision_update_rule: 'must_update_decision' },
      manual: { trigger_type: 'manual', default_proposed_operations: [], required_reviews: ['gate.review'], decision_update_rule: 'no_decision_update' },
    };
    return rules[t];
  }

  private async loadRegistry(): Promise<ChangeRequestRegistry> {
    try {
      const content = await fs.readFile(this.registryPath, 'utf-8');
      return yaml.load(content) as ChangeRequestRegistry;
    } catch {
      return { changeRequests: [], version: '1.0.0', lastUpdated: new Date().toISOString() };
    }
  }

  private async saveRegistry(registry: ChangeRequestRegistry): Promise<void> {
    await fs.writeFile(this.registryPath, yaml.dump(registry, { indent: 2, lineWidth: -1, noRefs: true }), 'utf-8');
  }
}
