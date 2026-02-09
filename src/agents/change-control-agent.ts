/**
 * ChangeControlAgent - Change Request Flow Management
 * Phase A3: KernelRuntime統合
 */

import { Octokit } from '@octokit/rest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { AgentConfig, AgentResult } from '../types';
import { ChangeRequest, ChangeRequestRegistry, TriggerType, DisturbanceToCRRule } from '../types/change-control';
import { KernelRuntime } from '../ssot/kernel-runtime.js';
import { KernelOperation } from '../types/kernel-operations.js';
import { getRulesConfig } from '../services/rules-config-service.js';

export interface CreateChangeRequestInput {
  raised_by: string;
  trigger_type: TriggerType;
  affected_scope: string[];
  notes?: string;
  // Phase A3: 操作詳細
  operation_details?: Array<{
    operation_type: any;
    kernel_id: string;
    payload: Record<string, any>;
  }>;
}

export class ChangeControlAgent {
  private octokit: Octokit;
  private config: AgentConfig;
  private registryPath: string;
  private runtime: KernelRuntime | null;

  constructor(config: AgentConfig) {
    this.config = config;
    this.octokit = new Octokit({ auth: config.githubToken });
    this.registryPath = path.join(process.cwd(), 'change-requests.yaml');

    // Phase A3: KernelRuntime統合（rules-config.yaml から設定取得）
    const rulesConfig = getRulesConfig();

    // Issue #44: Enforce rules loading before instantiation
    if (!rulesConfig.isLoaded()) {
      throw new Error(
        '[ChangeControlAgent] Rules config not loaded! ' +
        'Call ensureRulesConfigLoaded() before creating ChangeControlAgent.'
      );
    }

    // Get values from rules-config.yaml (single source of truth)
    // Fallback to rules-config.yaml defaults if not loaded
    const registryPath = config.kernelRegistryPath ||
                         rulesConfig.get<string>('core_architecture.kernel_runtime.default_registry_path') ||
                         path.join(process.cwd(), 'data/ssot/kernels-luna-base.yaml');

    const ledgerPath = config.kernelLedgerPath ||
                       rulesConfig.get<string>('core_architecture.kernel_runtime.default_ledger_path') ||
                       path.join(process.cwd(), 'data/ssot/ledger.ndjson');

    const soloModeDefault = rulesConfig.isLoaded() ?
                            rulesConfig.get<boolean>('core_architecture.kernel_runtime.solo_mode_default') ?? false :
                            false;

    const enableLedgerDefault = rulesConfig.isLoaded() ?
                                rulesConfig.get<boolean>('core_architecture.kernel_runtime.enable_ledger_default') ?? true :
                                true;

    this.runtime = new KernelRuntime({
      registryPath,
      ledgerPath,
      enableLedger: enableLedgerDefault,
      soloMode: config.kernelSoloMode ?? soloModeDefault,
      dryRun: config.dryRun,
      verbose: config.verbose,
    });
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
        // Phase A3: operation_detailsを設定
        operation_details: input.operation_details,
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

  /**
   * Phase A3: executeChangeRequest - CRを実行してKernel操作を実行
   */
  async executeChangeRequest(crId: string, actor?: string): Promise<AgentResult<ChangeRequest>> {
    const startTime = Date.now();
    try {
      const registry = await this.loadRegistry();
      const cr = registry.changeRequests.find(c => c.cr_id === crId);

      if (!cr) throw new Error(`CR not found: ${crId}`);
      if (cr.gate_outcome !== 'approved') throw new Error('CR not approved');
      if (cr.executed) throw new Error('CR already executed');

      this.log(`Executing CR: ${crId}`);

      // Phase A3: operation_detailsが存在する場合、KernelRuntimeで実行
      const executionResults: Array<{
        operation_type: any;
        op_id: string;
        success: boolean;
        error?: string;
      }> = [];

      if (cr.operation_details && cr.operation_details.length > 0 && this.runtime) {
        this.log(`Executing ${cr.operation_details.length} operations via KernelRuntime`);

        for (const detail of cr.operation_details) {
          try {
            // OperationTypeをKernelOperationに変換
            const operation = this.convertToKernelOperation(
              detail.operation_type,
              detail.kernel_id,
              detail.payload,
              actor || cr.raised_by,
              crId
            );

            if (operation) {
              const result = await this.runtime.apply(operation);
              executionResults.push({
                operation_type: detail.operation_type,
                op_id: result.op_id,
                success: result.success,
                error: result.error,
              });

              this.log(`  Operation ${detail.operation_type}: ${result.success ? 'SUCCESS' : 'FAILED'} (${result.op_id})`);
            } else {
              this.log(`  Operation ${detail.operation_type}: SKIPPED (not supported)`);
              executionResults.push({
                operation_type: detail.operation_type,
                op_id: 'SKIPPED',
                success: false,
                error: 'Operation type not supported',
              });
            }
          } catch (error) {
            this.log(`  Operation ${detail.operation_type}: ERROR - ${(error as Error).message}`);
            executionResults.push({
              operation_type: detail.operation_type,
              op_id: 'ERROR',
              success: false,
              error: (error as Error).message,
            });
          }
        }
      }

      // 全操作が成功したかチェック（executed=true設定前に判定）
      const successCount = executionResults.filter(r => r.success).length;
      const totalCount = executionResults.length;
      const allSuccess = successCount === totalCount;

      this.log(`CR ${crId} executed: ${successCount}/${totalCount} succeeded`);

      // 実行結果を記録
      cr.execution_results = executionResults;
      registry.lastUpdated = new Date().toISOString();

      // 1つでも失敗があれば CR 全体を失敗扱い（executed=true にしない）
      if (!allSuccess) {
        // 失敗時は executed=false のまま、再実行可能にする
        if (!this.config.dryRun) await this.saveRegistry(registry);

        return {
          status: 'error',
          data: cr,
          error: {
            code: 'CR_EXECUTION_FAILED',
            message: `CR execution partially failed: ${successCount}/${totalCount} operations succeeded. CR remains executable for retry.`,
          },
          metrics: {
            durationMs: Date.now() - startTime,
            timestamp: new Date().toISOString()
          }
        };
      }

      // 全操作が成功した場合のみ executed=true を設定
      cr.executed = true;
      cr.executed_at = new Date().toISOString();

      if (!this.config.dryRun) await this.saveRegistry(registry);

      return {
        status: 'success',
        data: cr,
        metrics: {
          durationMs: Date.now() - startTime,
          timestamp: new Date().toISOString()
        }
      };
    } catch (error) {
      return {
        status: 'error',
        error: (error as Error).message,
        metrics: {
          durationMs: Date.now() - startTime,
          timestamp: new Date().toISOString()
        }
      };
    }
  }

  /**
   * Phase A3: OperationTypeをKernelOperationに変換
   */
  private convertToKernelOperation(
    operationType: any,
    kernelId: string,
    payload: Record<string, any>,
    actor: string,
    issue: string
  ): KernelOperation | null {
    // 共通フィールド
    const baseOp = {
      actor,
      issue,
    };

    switch (operationType) {
      case 'u.record_decision':
        return {
          ...baseOp,
          op: 'u.record_decision' as const,
          payload: {
            kernel_id: kernelId,
            decision_id: payload.decision_id,
            decision_type: payload.decision_type || 'architectural',
            decided_by: payload.decided_by || actor,
            rationale: payload.rationale,
            falsification_conditions: payload.falsification_conditions,
            assurance_level: payload.assurance_level || 'AL0',
          },
        };

      case 'u.link_evidence':
        return {
          ...baseOp,
          op: 'u.link_evidence' as const,
          payload: {
            kernel_id: kernelId,
            evidence_type: payload.evidence_type || 'document',
            evidence_id: payload.evidence_id,
            evidence_source: payload.evidence_source,
            source_origin: payload.source_origin, // Issue #49: Preserve source_origin
            verification_status: payload.verification_status,
          },
        };

      case 'u.set_state':
        return {
          ...baseOp,
          op: 'u.set_state' as const,
          actor_role: payload.actor_role || 'product_owner',
          payload: {
            kernel_id: kernelId,
            from: payload.from,
            to: payload.to,
            reason: payload.reason,
            gate_checks: payload.gate_checks,
          },
        };

      case 'u.raise_exception':
        return {
          ...baseOp,
          op: 'u.raise_exception' as const,
          payload: {
            kernel_id: kernelId,
            exception_type: payload.exception_type || 'risk',
            severity: payload.severity || 'medium',
            description: payload.description,
            resolution_strategy: payload.resolution_strategy,
          },
        };

      case 'u.close_exception':
        return {
          ...baseOp,
          op: 'u.close_exception' as const,
          payload: {
            kernel_id: kernelId,
            exception_id: payload.exception_id,
            resolution: payload.resolution,
            resolved_by: payload.resolved_by || actor,
          },
        };

      default:
        // サポートされていない操作タイプ
        return null;
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
