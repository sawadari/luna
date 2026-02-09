/**
 * Kernel Runtime - Phase A1+A2実装
 *
 * すべてのKernel変更の単一エントリーポイント
 * Authority + Gate判定を統合し、u.*操作を強制
 * Phase A2: Ledger統合によるイベントソーシング
 */

import { KernelRegistryService } from './kernel-registry.js';
import { KernelLedger } from './kernel-ledger.js';
import { AuthorityService } from '../services/authority-service.js';
import { KernelWithNRVV } from '../types/nrvv.js';
import {
  KernelOperation,
  OperationResult,
  GateCheckResult,
  CreateKernelOperation,
  SetStateOperation,
  RecordDecisionOperation,
  LinkEvidenceOperation,
  RecordVerificationOperation,
  RecordValidationOperation,
  RaiseExceptionOperation,
  CloseExceptionOperation,
} from '../types/kernel-operations.js';
import { v4 as uuidv4 } from 'uuid';
import { getRulesConfig } from '../services/rules-config-service.js';

/**
 * Kernel Runtime Configuration
 */
export interface KernelRuntimeConfig {
  /** KernelRegistryのパス */
  registryPath?: string;

  /** Ledgerのパス（Phase A2） */
  ledgerPath?: string;

  /** Ledgerを有効化（Phase A2） */
  enableLedger?: boolean;

  /** Solo mode: 単一運用者モード（権限チェックをスキップ） */
  soloMode?: boolean;

  /** Solo mode時の既定actor */
  defaultActor?: string;

  /** Dry-run: 実際の変更を行わない */
  dryRun?: boolean;

  /** Verbose logging */
  verbose?: boolean;

  /** Phase C1: Bootstrap Kernel保護を強制 */
  enforceBootstrapProtection?: boolean;

  /** Phase C1: Issue必須を強制 */
  enforceIssueRequired?: boolean;

  /** AL0 Gate: AL0 (Not Assured) 状態でのKernel遷移をブロック */
  enableAL0Gate?: boolean;
}

/**
 * Kernel Runtime
 *
 * すべてのKernel操作のエントリーポイント
 */
export class KernelRuntime {
  private registry: KernelRegistryService;
  private authority: AuthorityService;
  private ledger: KernelLedger | null;
  private config: KernelRuntimeConfig;

  constructor(config: KernelRuntimeConfig = {}) {
    // Get default values from rules-config.yaml
    const rulesConfig = getRulesConfig();

    // Issue #44: Enforce rules loading before instantiation
    if (!rulesConfig.isLoaded()) {
      throw new Error(
        '[KernelRuntime] Rules config not loaded! ' +
        'Call ensureRulesConfigLoaded() before creating KernelRuntime.'
      );
    }

    const soloModeDefault = rulesConfig.isLoaded() ?
                            rulesConfig.get<boolean>('core_architecture.kernel_runtime.solo_mode_default') ?? false :
                            false; // YAMLのデフォルト: false（権限チェック有効）

    const enableLedgerDefault = rulesConfig.isLoaded() ?
                                rulesConfig.get<boolean>('core_architecture.kernel_runtime.enable_ledger_default') ?? true :
                                true; // YAMLのデフォルト: true

    const enforceBootstrapProtection = rulesConfig.isLoaded() ?
                                       rulesConfig.get<boolean>('core_architecture.bootstrap_protection.enforce_bootstrap_protection') ?? true :
                                       true;

    const enforceIssueRequired = rulesConfig.isLoaded() ?
                                 rulesConfig.get<boolean>('core_architecture.issue_enforcement.enforce_issue_required') ?? true :
                                 true;

    const enableAL0Gate = rulesConfig.isLoaded() ?
                          rulesConfig.get<boolean>('core_architecture.al0_gate.enabled') ?? true :
                          true; // YAMLのデフォルト: true（AL0チェック有効）

    this.config = {
      soloMode: config.soloMode ?? soloModeDefault,
      defaultActor: config.defaultActor ?? 'product_owner',
      dryRun: config.dryRun ?? false,
      verbose: config.verbose ?? false,
      enableLedger: config.enableLedger ?? enableLedgerDefault,
      enforceBootstrapProtection: config.enforceBootstrapProtection ?? enforceBootstrapProtection,
      enforceIssueRequired: config.enforceIssueRequired ?? enforceIssueRequired,
      enableAL0Gate: config.enableAL0Gate ?? enableAL0Gate,
      ...config,
    };

    this.registry = new KernelRegistryService(config.registryPath);
    this.authority = new AuthorityService({
      verbose: this.config.verbose,
      dryRun: this.config.dryRun,
    });

    // Phase A2: Ledger初期化
    if (this.config.enableLedger) {
      this.ledger = new KernelLedger({
        ledgerPath: config.ledgerPath,
        verbose: this.config.verbose,
      });
    } else {
      this.ledger = null;
    }
  }

  private log(message: string): void {
    if (this.config.verbose) {
      console.log(`[${new Date().toISOString()}] [KernelRuntime] ${message}`);
    }
  }

  /**
   * Apply operation - u.*操作を実行
   *
   * すべてのKernel変更はこのメソッドを経由する
   */
  async apply(operation: KernelOperation): Promise<OperationResult> {
    // 操作IDとタイムスタンプを自動生成
    const op_id = operation.op_id || this.generateOperationId();
    const timestamp = new Date().toISOString();

    this.log(`Applying operation: ${operation.op} (${op_id})`);

    try {
      // Phase C1: Issue必須チェック
      if (this.config.enforceIssueRequired && !operation.issue) {
        return {
          success: false,
          op_id,
          timestamp,
          error: 'Phase C1: Issue is required for all Kernel operations (enforceIssueRequired=true)',
        };
      }

      // Phase C1: Bootstrap Kernel保護チェック
      if (this.config.enforceBootstrapProtection) {
        const payload = (operation as any).payload;
        if (payload && payload.kernel_id && payload.kernel_id.startsWith('BOOTSTRAP-')) {
          return {
            success: false,
            op_id,
            timestamp,
            error: `Phase C1: Bootstrap Kernel ${payload.kernel_id} is immutable and cannot be modified`,
          };
        }
      }

      // Solo mode以外では権限チェックを行う
      if (!this.config.soloMode && operation.op === 'u.set_state') {
        const authResult = await this.checkAuthority(operation as SetStateOperation);
        if (!authResult.allowed) {
          return {
            success: false,
            op_id,
            timestamp,
            error: `Authority check failed: ${authResult.message}`,
          };
        }
      }

      // 操作種別に応じて実行
      let result: OperationResult;
      switch (operation.op) {
        case 'u.create_kernel':
          result = await this.executeCreateKernel(operation as CreateKernelOperation);
          break;
        case 'u.record_decision':
          result = await this.executeRecordDecision(operation as RecordDecisionOperation);
          break;
        case 'u.link_evidence':
          result = await this.executeLinkEvidence(operation as LinkEvidenceOperation);
          break;
        case 'u.record_verification':
          result = await this.executeRecordVerification(operation as RecordVerificationOperation);
          break;
        case 'u.record_validation':
          result = await this.executeRecordValidation(operation as RecordValidationOperation);
          break;
        case 'u.set_state':
          result = await this.executeSetState(operation as SetStateOperation);
          break;
        case 'u.raise_exception':
          result = await this.executeRaiseException(operation as RaiseExceptionOperation);
          break;
        case 'u.close_exception':
          result = await this.executeCloseException(operation as CloseExceptionOperation);
          break;
        default:
          return {
            success: false,
            op_id,
            timestamp,
            error: `Unknown operation type: ${(operation as KernelOperation).op}`,
          };
      }

      // 操作IDとタイムスタンプを設定
      result.op_id = op_id;
      result.timestamp = timestamp;

      // Phase A2: Ledgerに記録
      if (this.ledger && !this.config.dryRun) {
        await this.ledger.append(operation, result);
        this.log(`Ledger entry recorded: ${op_id}`);
      }

      this.log(`Operation completed: ${operation.op} (${op_id}) - ${result.success ? 'SUCCESS' : 'FAILED'}`);
      return result;
    } catch (error) {
      this.log(`Operation failed: ${operation.op} (${op_id}) - ${(error as Error).message}`);
      return {
        success: false,
        op_id,
        timestamp,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Check authority - 権限チェック（u.set_state専用）
   */
  private async checkAuthority(operation: SetStateOperation): Promise<GateCheckResult> {
    const { from, to } = operation.payload;
    const actor = operation.actor;

    this.log(`Checking authority for state transition: ${from} -> ${to} (actor: ${actor})`);

    // AuthorityServiceで権限チェック
    const allowed = await this.authority.canTransition(from, to, actor);

    if (!allowed) {
      return {
        allowed: false,
        checks: {
          authority: {
            passed: false,
            message: `Actor ${actor} does not have permission to transition ${from} -> ${to}`,
          },
        },
        message: 'Authority check failed',
      };
    }

    return {
      allowed: true,
      checks: {
        authority: {
          passed: true,
          message: `Actor ${actor} has permission`,
        },
      },
    };
  }

  /**
   * Check gate - Gate判定（u.set_state専用）
   */
  private async checkGate(operation: SetStateOperation): Promise<GateCheckResult> {
    const { kernel_id, to, gate_checks } = operation.payload;

    this.log(`Checking gate conditions for kernel: ${kernel_id} -> ${to}`);

    const kernel = await this.registry.getKernel(kernel_id);
    if (!kernel) {
      return {
        allowed: false,
        checks: {
          kernel_exists: {
            passed: false,
            message: `Kernel ${kernel_id} not found`,
          },
        },
        message: 'Kernel not found',
      };
    }

    // Gate条件チェック
    const checks: Record<string, { passed: boolean; message?: string }> = {};

    // AL0時は遷移をブロック（安全性制約） - rules-config.yaml で制御可能
    if (this.config.enableAL0Gate) {
      const currentAL = kernel.decision?.assurance_level || 'AL0';
      checks.al_check = {
        passed: currentAL !== 'AL0',
        message: currentAL === 'AL0'
          ? `Kernel has AL0 (Not Assured) - state transition blocked for safety`
          : `Kernel has ${currentAL} - state transition allowed`,
      };

      // AL0の場合は即座に拒否
      if (currentAL === 'AL0') {
        return {
          allowed: false,
          checks,
          message: 'AL0 (Not Assured) blocks state transition for safety',
        };
      }
    } else {
      // AL0 Gate無効: AL0でも遷移を許可（開発・テスト用）
      const currentAL = kernel.decision?.assurance_level || 'AL0';
      checks.al_check = {
        passed: true,
        message: `AL0 Gate disabled - ${currentAL} allowed (development mode)`,
      };
    }

    // Issue #49: Evidence Governance - AI生成物の未検証昇格を防止
    const rulesConfig = getRulesConfig();
    const enforceAIVerification = rulesConfig.isLoaded()
      ? rulesConfig.get<boolean>('core_architecture.evidence_governance.enforce_ai_verification') ?? true
      : true; // Default: enforce

    if (enforceAIVerification) {
      const blockedSources = rulesConfig.isLoaded()
        ? rulesConfig.get<string[]>('core_architecture.evidence_governance.blocked_unverified_sources') ?? ['ai', 'hybrid']
        : ['ai', 'hybrid'];

      const evidences = (kernel as any).evidence || [];
      const unverifiedAIContent = evidences.filter((ev: any) => {
        const isBlockedSource = blockedSources.includes(ev.source_origin || 'human');
        const isUnverified = ev.verification_status !== 'verified';
        return isBlockedSource && isUnverified;
      });

      checks.evidence_governance = {
        passed: unverifiedAIContent.length === 0,
        message: unverifiedAIContent.length === 0
          ? `All AI-generated content is verified (${evidences.length} evidence(s) checked)`
          : `Found ${unverifiedAIContent.length} unverified AI-generated evidence(s) - state transition blocked for quality assurance. ` +
            `Evidence IDs: ${unverifiedAIContent.map((ev: any) => ev.id).join(', ')}`,
      };

      // AI生成物が未検証の場合は即座に拒否
      if (unverifiedAIContent.length > 0) {
        return {
          allowed: false,
          checks,
          message: `Evidence Governance: Unverified AI-generated content blocks state transition (Issue #49)`,
        };
      }
    } else {
      // Evidence Governance無効: 未検証でも遷移を許可（開発・テスト用）
      checks.evidence_governance = {
        passed: true,
        message: `Evidence Governance disabled - unverified AI content allowed (development mode)`,
      };
    }

    if (gate_checks) {
      checks.nrvv_complete = {
        passed: gate_checks.nrvv_complete,
        message: gate_checks.nrvv_complete ? 'NRVV is complete' : 'NRVV is incomplete',
      };

      checks.evidence_sufficient = {
        passed: gate_checks.evidence_sufficient,
        message: gate_checks.evidence_sufficient
          ? 'Evidence is sufficient'
          : 'Evidence is insufficient',
      };

      checks.no_blocking_exceptions = {
        passed: gate_checks.no_blocking_exceptions,
        message: gate_checks.no_blocking_exceptions
          ? 'No blocking exceptions'
          : 'Blocking exceptions exist',
      };
    }

    const allPassed = Object.values(checks).every((check) => check.passed);

    return {
      allowed: allPassed,
      checks,
      message: allPassed ? 'All gate checks passed' : 'Some gate checks failed',
    };
  }

  /**
   * Execute: u.create_kernel
   */
  private async executeCreateKernel(
    operation: CreateKernelOperation
  ): Promise<OperationResult> {
    const { kernel_id, statement, category, owner } = operation.payload;

    this.log(`Creating kernel: ${kernel_id}`);

    // Check if kernel already exists
    const existingKernel = await this.registry.getKernel(kernel_id);
    if (existingKernel) {
      return {
        success: false,
        op_id: '',
        timestamp: '',
        error: `Kernel ${kernel_id} already exists`,
      };
    }

    // Create new kernel
    const newKernel: KernelWithNRVV = {
      id: kernel_id,
      statement,
      category: category as any,
      owner,
      maturity: operation.payload.maturity || 'draft',
      createdAt: new Date().toISOString(),
      lastUpdatedAt: new Date().toISOString(),
      sourceIssue: operation.payload.sourceIssue || operation.issue,
      needs: (operation.payload.needs || []) as any,
      requirements: (operation.payload.requirements || []) as any,
      verification: (operation.payload.verification || []) as any,
      validation: (operation.payload.validation || []) as any,
      tags: operation.payload.tags || [],
      relatedArtifacts: (operation.payload.relatedArtifacts || []) as any,
      history: [
        {
          action: 'create_kernel',
          by: operation.actor,
          timestamp: new Date().toISOString(),
          op: 'u.create_kernel',
          actor: operation.actor,
          issue: operation.issue,
          summary: `Kernel ${kernel_id} created`,
        },
      ],
    };

    if (!this.config.dryRun) {
      await this.registry.saveKernel(newKernel);
    }

    return {
      success: true,
      op_id: '',
      timestamp: '',
      details: {
        kernel_id,
        statement,
      },
    };
  }

  /**
   * Execute: u.record_decision
   */
  private async executeRecordDecision(
    operation: RecordDecisionOperation
  ): Promise<OperationResult> {
    const { kernel_id, decision_id, decision_type, decided_by, rationale } = operation.payload;

    this.log(`Recording decision: ${decision_id} for kernel: ${kernel_id}`);

    const kernel = await this.registry.getKernel(kernel_id);
    if (!kernel) {
      return {
        success: false,
        op_id: '',
        timestamp: '',
        error: `Kernel ${kernel_id} not found`,
      };
    }

    // Decisionを記録（更新可能 - 再決定をサポート）
    kernel.decision = {
      decision_id,
      decision_type,
      decided_by,
      rationale,
      falsification_conditions: operation.payload.falsification_conditions || [],
      linked_issue: operation.issue,
      assurance_level: operation.payload.assurance_level || 'AL0',
    };

    // Historyに記録
    if (!kernel.history) {
      kernel.history = [];
    }
    kernel.history.push({
      action: 'record_decision',
      by: operation.actor,
      timestamp: new Date().toISOString(),
      op: 'u.record_decision',
      actor: operation.actor,
      issue: operation.issue,
      summary: `Decision ${decision_id} recorded`,
    });

    if (!this.config.dryRun) {
      await this.registry.saveKernel(kernel);
    }

    return {
      success: true,
      op_id: '',
      timestamp: '',
      details: {
        kernel_id,
        decision_id,
      },
    };
  }

  /**
   * Execute: u.link_evidence
   */
  private async executeLinkEvidence(operation: LinkEvidenceOperation): Promise<OperationResult> {
    const { kernel_id, evidence_type, evidence_id, evidence_source } = operation.payload;

    this.log(`Linking evidence: ${evidence_id} to kernel: ${kernel_id}`);

    const kernel = await this.registry.getKernel(kernel_id);
    if (!kernel) {
      return {
        success: false,
        op_id: '',
        timestamp: '',
        error: `Kernel ${kernel_id} not found`,
      };
    }

    // Evidenceを追加（Phase A1では簡易実装）
    if (!kernel.evidence) {
      kernel.evidence = [];
    }
    kernel.evidence.push({
      id: evidence_id,
      type: evidence_type,
      source: evidence_source,
      source_type: 'external', // Phase A1では固定値
      source_origin: operation.payload.source_origin || 'human', // Issue #49: Default to 'human'
      collected_at: new Date().toISOString(),
      verification_status: operation.payload.verification_status || 'pending',
    } as any);

    // If evidence_type is 'artifact', also add to relatedArtifacts (Issue #43)
    if (evidence_type === 'artifact') {
      if (!kernel.relatedArtifacts) {
        kernel.relatedArtifacts = [];
      }
      kernel.relatedArtifacts.push({
        type: 'code',
        path: evidence_source,
        description: `Generated artifact: ${evidence_id}`,
      });
    }

    // Update lastUpdatedAt
    kernel.lastUpdatedAt = new Date().toISOString();

    // Historyに記録
    if (!kernel.history) {
      kernel.history = [];
    }
    kernel.history.push({
      action: 'link_evidence',
      by: operation.actor,
      timestamp: new Date().toISOString(),
      op: 'u.link_evidence',
      actor: operation.actor,
      issue: operation.issue,
      summary: `Evidence ${evidence_id} linked`,
    });

    if (!this.config.dryRun) {
      await this.registry.saveKernel(kernel);
    }

    return {
      success: true,
      op_id: '',
      timestamp: '',
      details: {
        kernel_id,
        evidence_id,
      },
    };
  }

  /**
   * Execute: u.record_verification (Issue #48)
   */
  private async executeRecordVerification(operation: RecordVerificationOperation): Promise<OperationResult> {
    const { kernel_id, verification } = operation.payload;

    this.log(`Recording verification: ${verification.id} to kernel: ${kernel_id}`);

    const kernel = await this.registry.getKernel(kernel_id);
    if (!kernel) {
      return {
        success: false,
        op_id: '',
        timestamp: '',
        error: `Kernel ${kernel_id} not found`,
      };
    }

    // Verificationを追加
    if (!kernel.verification) {
      kernel.verification = [];
    }
    kernel.verification.push(verification);

    // Update traceability: link verification to requirements
    for (const upstreamId of verification.traceability?.upstream || []) {
      const req = kernel.requirements.find((r) => r.id === upstreamId);
      if (req) {
        if (!req.traceability.downstream) {
          req.traceability.downstream = [];
        }
        if (!req.traceability.downstream.includes(verification.id)) {
          req.traceability.downstream.push(verification.id);
        }
      }
    }

    // Update lastUpdatedAt
    kernel.lastUpdatedAt = new Date().toISOString();

    // Historyに記録
    if (!kernel.history) {
      kernel.history = [];
    }
    kernel.history.push({
      action: 'record_verification',
      by: operation.actor,
      timestamp: new Date().toISOString(),
      op: 'u.record_verification',
      actor: operation.actor,
      issue: operation.issue,
      summary: `Verification ${verification.id} recorded (${verification.status})`,
    });

    if (!this.config.dryRun) {
      await this.registry.saveKernel(kernel);
    }

    return {
      success: true,
      op_id: '',
      timestamp: '',
      details: {
        kernel_id,
        verification_id: verification.id,
        status: verification.status,
      },
    };
  }

  /**
   * Execute: u.record_validation (Issue #48)
   */
  private async executeRecordValidation(operation: RecordValidationOperation): Promise<OperationResult> {
    const { kernel_id, validation } = operation.payload;

    this.log(`Recording validation: ${validation.id} to kernel: ${kernel_id}`);

    const kernel = await this.registry.getKernel(kernel_id);
    if (!kernel) {
      return {
        success: false,
        op_id: '',
        timestamp: '',
        error: `Kernel ${kernel_id} not found`,
      };
    }

    // Validationを追加
    if (!kernel.validation) {
      kernel.validation = [];
    }
    kernel.validation.push(validation);

    // Update traceability: link validation to requirements and needs
    for (const upstreamId of validation.traceability?.upstream || []) {
      // Link to requirement
      const req = kernel.requirements.find((r) => r.id === upstreamId);
      if (req) {
        if (!req.traceability.downstream) {
          req.traceability.downstream = [];
        }
        if (!req.traceability.downstream.includes(validation.id)) {
          req.traceability.downstream.push(validation.id);
        }
      }

      // Link to need
      const need = kernel.needs.find((n) => n.id === upstreamId);
      if (need) {
        if (!need.traceability.downstream) {
          need.traceability.downstream = [];
        }
        if (!need.traceability.downstream.includes(validation.id)) {
          need.traceability.downstream.push(validation.id);
        }
      }
    }

    // Update lastUpdatedAt
    kernel.lastUpdatedAt = new Date().toISOString();

    // Historyに記録
    if (!kernel.history) {
      kernel.history = [];
    }
    kernel.history.push({
      action: 'record_validation',
      by: operation.actor,
      timestamp: new Date().toISOString(),
      op: 'u.record_validation',
      actor: operation.actor,
      issue: operation.issue,
      summary: `Validation ${validation.id} recorded (${validation.status})`,
    });

    if (!this.config.dryRun) {
      await this.registry.saveKernel(kernel);
    }

    return {
      success: true,
      op_id: '',
      timestamp: '',
      details: {
        kernel_id,
        validation_id: validation.id,
        status: validation.status,
      },
    };
  }

  /**
   * Execute: u.set_state
   */
  private async executeSetState(operation: SetStateOperation): Promise<OperationResult> {
    const { kernel_id, from, to, reason } = operation.payload;

    this.log(`Setting state: ${from} -> ${to} for kernel: ${kernel_id}`);

    // Gate判定
    const gateResult = await this.checkGate(operation);
    if (!gateResult.allowed) {
      return {
        success: false,
        op_id: '',
        timestamp: '',
        error: `Gate check failed: ${gateResult.message}`,
        details: {
          gate_checks: gateResult.checks,
        },
      };
    }

    const kernel = await this.registry.getKernel(kernel_id);
    if (!kernel) {
      return {
        success: false,
        op_id: '',
        timestamp: '',
        error: `Kernel ${kernel_id} not found`,
      };
    }

    // 状態遷移を実行
    kernel.maturity = to;
    kernel.lastUpdatedAt = new Date().toISOString();

    // Set additional metadata based on target maturity
    if (to === 'agreed') {
      kernel.approvedAt = new Date().toISOString();
      kernel.approvedBy = operation.actor;
    }

    if (to === 'frozen') {
      kernel.frozenAt = new Date().toISOString();
    }

    // Historyに記録
    if (!kernel.history) {
      kernel.history = [];
    }
    kernel.history.push({
      action: 'set_state',
      by: operation.actor,
      timestamp: new Date().toISOString(),
      maturity: to,
      op: 'u.set_state',
      actor: operation.actor,
      issue: operation.issue,
      summary: `State transitioned: ${from} -> ${to}${reason ? ` (${reason})` : ''}`,
    });

    if (!this.config.dryRun) {
      await this.registry.saveKernel(kernel);
    }

    return {
      success: true,
      op_id: '',
      timestamp: '',
      details: {
        kernel_id,
        from,
        to,
        gate_checks: gateResult.checks, // Issue #49: Include gate checks in success result
      },
    };
  }

  /**
   * Execute: u.raise_exception
   */
  private async executeRaiseException(
    operation: RaiseExceptionOperation
  ): Promise<OperationResult> {
    const { kernel_id, exception_type, severity, description } = operation.payload;

    this.log(`Raising exception for kernel: ${kernel_id} (${severity})`);

    const kernel = await this.registry.getKernel(kernel_id);
    if (!kernel) {
      return {
        success: false,
        op_id: '',
        timestamp: '',
        error: `Kernel ${kernel_id} not found`,
      };
    }

    // 例外を追加（Phase A1では簡易実装）
    if (!kernel.exceptions) {
      (kernel as any).exceptions = [];
    }
    const exception_id = `EX-${Date.now()}`;
    (kernel as any).exceptions.push({
      id: exception_id,
      type: exception_type,
      severity,
      description,
      raised_at: new Date().toISOString(),
      raised_by: operation.actor,
      status: 'open',
    });

    // Historyに記録
    if (!kernel.history) {
      kernel.history = [];
    }
    kernel.history.push({
      action: 'raise_exception',
      by: operation.actor,
      timestamp: new Date().toISOString(),
      op: 'u.raise_exception',
      actor: operation.actor,
      issue: operation.issue,
      summary: `Exception raised: ${exception_type} (${severity})`,
    });

    if (!this.config.dryRun) {
      await this.registry.saveKernel(kernel);
    }

    return {
      success: true,
      op_id: '',
      timestamp: '',
      details: {
        kernel_id,
        exception_id,
      },
    };
  }

  /**
   * Execute: u.close_exception
   */
  private async executeCloseException(
    operation: CloseExceptionOperation
  ): Promise<OperationResult> {
    const { kernel_id, exception_id, resolution, resolved_by } = operation.payload;

    this.log(`Closing exception: ${exception_id} for kernel: ${kernel_id}`);

    const kernel = await this.registry.getKernel(kernel_id);
    if (!kernel) {
      return {
        success: false,
        op_id: '',
        timestamp: '',
        error: `Kernel ${kernel_id} not found`,
      };
    }

    // 例外をクローズ（Phase A1では簡易実装）
    const exceptions = (kernel as any).exceptions || [];
    const exception = exceptions.find((ex: any) => ex.id === exception_id);
    if (!exception) {
      return {
        success: false,
        op_id: '',
        timestamp: '',
        error: `Exception ${exception_id} not found`,
      };
    }

    exception.status = 'closed';
    exception.resolution = resolution;
    exception.resolved_at = new Date().toISOString();
    exception.resolved_by = resolved_by;

    // Historyに記録
    if (!kernel.history) {
      kernel.history = [];
    }
    kernel.history.push({
      action: 'close_exception',
      by: operation.actor,
      timestamp: new Date().toISOString(),
      op: 'u.close_exception',
      actor: operation.actor,
      issue: operation.issue,
      summary: `Exception closed: ${exception_id}`,
    });

    if (!this.config.dryRun) {
      await this.registry.saveKernel(kernel);
    }

    return {
      success: true,
      op_id: '',
      timestamp: '',
      details: {
        kernel_id,
        exception_id,
      },
    };
  }

  /**
   * Generate operation ID
   */
  private generateOperationId(): string {
    return `OP-${Date.now()}-${uuidv4().substring(0, 8)}`;
  }
}
