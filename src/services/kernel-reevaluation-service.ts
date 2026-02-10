/**
 * KernelReevaluationService
 *
 * Issue #51: Kernel再評価トリガー管理
 * Kernelの前提条件無効化、品質劣化、ヘルス問題を検出し、
 * 必要に応じてGitHub Issueを自動作成する
 *
 * NOTE: 既存の src/services/reevaluation-service.ts (DecisionRecord再評価) とは別実装
 *       既存実装との統合は Phase 2 で実施予定
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { Octokit } from '@octokit/rest';
import { KernelRuntime } from '../ssot/kernel-runtime';
import {
  KernelReevaluationInput,
  KernelReevaluationRecord,
  KernelReevaluationServiceResult,
  KernelReevaluationPersistence,
  KernelReevaluationStatus,
  generateDedupeKey,
  AssumptionTriggerDetails,
  QualityTriggerDetails,
  HealthTriggerDetails,
} from '../types/kernel-reevaluation';
import { StartReevaluationOperation, CompleteReevaluationOperation } from '../types/kernel-operations';

/**
 * Service Config
 */
export interface KernelReevaluationServiceConfig {
  /** GitHub Token */
  githubToken: string;

  /** Repository (owner/repo) */
  repository: string;

  /** Reevaluations YAML file path */
  reevaluationsPath?: string;

  /** Kernel Registry path */
  kernelRegistryPath?: string;

  /** Kernel Ledger path */
  kernelLedgerPath?: string;

  /** Dry-run mode */
  dryRun?: boolean;

  /** Verbose logging */
  verbose?: boolean;
}

/**
 * KernelReevaluationService
 *
 * Kernel再評価トリガー管理サービス
 */
export class KernelReevaluationService {
  private config: KernelReevaluationServiceConfig;
  private octokit: Octokit;
  private kernelRuntime: KernelRuntime;
  private reevaluationsPath: string;

  constructor(config: KernelReevaluationServiceConfig) {
    this.config = config;
    this.octokit = new Octokit({ auth: config.githubToken });
    this.reevaluationsPath =
      config.reevaluationsPath ||
      path.join(process.cwd(), 'data/ssot/reevaluations.yaml');

    // Initialize KernelRuntime
    this.kernelRuntime = new KernelRuntime({
      registryPath: config.kernelRegistryPath,
      ledgerPath: config.kernelLedgerPath,
      enableLedger: true,
      soloMode: false,
      defaultActor: 'KernelReevaluationService',
      dryRun: config.dryRun,
      verbose: config.verbose,
    });
  }

  private log(message: string): void {
    if (this.config.verbose) {
      console.log(`[${new Date().toISOString()}] [KernelReevaluationService] ${message}`);
    }
  }

  /**
   * Start Reevaluation - 再評価を開始
   *
   * @param input - 再評価入力
   * @returns サービス実行結果
   */
  async startReevaluation(
    input: KernelReevaluationInput
  ): Promise<KernelReevaluationServiceResult> {
    this.log(`Starting reevaluation for Kernel: ${input.kernel_id}`);

    try {
      // 1. Generate dedupe key
      const entity_id = this.extractEntityId(input);
      const dedupeKey = generateDedupeKey(
        input.kernel_id,
        input.triggerType,
        entity_id
      );

      // 2. Check for duplicates (within 24 hours)
      const persistence = await this.loadReevaluations();
      const now = Date.now();
      const twentyFourHoursMs = 24 * 60 * 60 * 1000;

      const existingRecord = persistence.reevaluations.find((r) => {
        if (r.dedupeKey !== dedupeKey) return false;
        if (r.status !== 'pending') return false;

        // Issue #51 (Medium fix): Check if within 24 hours
        const triggeredTime = new Date(r.triggered_at).getTime();
        const timeDiff = now - triggeredTime;
        return timeDiff < twentyFourHoursMs;
      });

      if (existingRecord) {
        this.log(
          `Duplicate reevaluation detected: ${existingRecord.reevaluation_id}`
        );
        return {
          success: true,
          reevaluation_id: existingRecord.reevaluation_id,
          issue_id: existingRecord.issue_id,
          deduplicated: true,
          existing_reevaluation_id: existingRecord.reevaluation_id,
        };
      }

      // 3. Generate reevaluation ID
      const reevaluation_id = this.generateReevaluationId();

      // 4. Conditional GitHub Issue creation
      // Issue #51 (Low fix): Extract severity for clarity
      const severity = input.severity;
      const shouldCreateIssue =
        severity === 'critical' ||
        severity === 'high' ||
        input.manual_followup_required === true;

      let issue_id: number | undefined;

      if (shouldCreateIssue && !this.config.dryRun) {
        issue_id = await this.createGitHubIssue(input, reevaluation_id);
        this.log(`Created GitHub Issue #${issue_id}`);
      } else {
        this.log(
          `Skipping GitHub Issue creation (severity: ${input.severity}, manual_followup: ${input.manual_followup_required})`
        );
      }

      // 5. Record to KernelRuntime (u.start_reevaluation)
      const operation: StartReevaluationOperation = {
        op: 'u.start_reevaluation',
        actor: input.triggeredBy,
        issue: input.existing_issue_id ? `#${input.existing_issue_id}` : `#${issue_id || 'N/A'}`,
        payload: {
          kernel_id: input.kernel_id,
          reevaluation_id,
          trigger_type: input.triggerType,
          severity: input.severity,
          trigger_details: input.trigger_details as unknown as Record<string, unknown>,
        },
      };

      const operationResult = await this.kernelRuntime.apply(operation);
      if (!operationResult.success) {
        throw new Error(
          `KernelRuntime operation failed: ${operationResult.error}`
        );
      }

      this.log(`KernelRuntime operation recorded: ${operationResult.op_id}`);

      // 6. Create reevaluation record
      const record: KernelReevaluationRecord = {
        reevaluation_id,
        kernel_id: input.kernel_id,
        issue_id,
        trigger_type: input.triggerType,
        triggered_at: new Date().toISOString(),
        triggered_by: input.triggeredBy,
        severity: input.severity,
        dedupeKey,
        status: 'pending',
        trigger_details: input.trigger_details,
        metadata: input.metadata,
      };

      // 7. Save to persistence
      persistence.reevaluations.push(record);
      persistence.meta.last_updated = new Date().toISOString();

      if (!this.config.dryRun) {
        await this.saveReevaluations(persistence);
        this.log(`Reevaluation record saved: ${reevaluation_id}`);
      }

      return {
        success: true,
        reevaluation_id,
        issue_id,
        deduplicated: false,
        operation_id: operationResult.op_id,
      };
    } catch (error) {
      this.log(`Error starting reevaluation: ${(error as Error).message}`);
      return {
        success: false,
        reevaluation_id: '',
        deduplicated: false,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Complete Reevaluation - 再評価を完了
   *
   * @param reevaluation_id - 再評価ID
   * @param status - 最終ステータス (resolved | dismissed)
   * @param resolution - 解決方法
   * @param resolved_by - 解決者
   * @param cr_candidate - ChangeRequest候補（オプション）
   * @returns 更新されたレコード
   */
  async completeReevaluation(
    reevaluation_id: string,
    status: 'resolved' | 'dismissed',
    resolution: string,
    resolved_by: string,
    cr_candidate?: {
      proposed_change: string;
      rationale: string;
      impact: 'breaking' | 'major' | 'minor' | 'patch';
    }
  ): Promise<KernelReevaluationRecord> {
    this.log(`Completing reevaluation: ${reevaluation_id}`);

    // 1. Load persistence
    const persistence = await this.loadReevaluations();
    const record = persistence.reevaluations.find(
      (r) => r.reevaluation_id === reevaluation_id
    );

    if (!record) {
      throw new Error(`Reevaluation ${reevaluation_id} not found`);
    }

    // 2. Update record
    record.status = status;
    record.resolution = resolution;
    record.resolved_at = new Date().toISOString();
    record.resolved_by = resolved_by;
    if (cr_candidate) {
      record.cr_candidate = cr_candidate;
    }

    // 3. Record to KernelRuntime (u.complete_reevaluation)
    const operation: CompleteReevaluationOperation = {
      op: 'u.complete_reevaluation',
      actor: resolved_by,
      issue: record.issue_id ? `#${record.issue_id}` : '#N/A',
      payload: {
        kernel_id: record.kernel_id,
        reevaluation_id,
        status,
        resolution,
        cr_candidate,
      },
    };

    const operationResult = await this.kernelRuntime.apply(operation);
    if (!operationResult.success) {
      throw new Error(
        `KernelRuntime operation failed: ${operationResult.error}`
      );
    }

    this.log(`KernelRuntime operation recorded: ${operationResult.op_id}`);

    // 4. Save to persistence
    persistence.meta.last_updated = new Date().toISOString();

    if (!this.config.dryRun) {
      await this.saveReevaluations(persistence);
      this.log(`Reevaluation record updated: ${reevaluation_id}`);
    }

    return record;
  }

  /**
   * Get Reevaluation by ID
   */
  async getReevaluationById(
    reevaluation_id: string
  ): Promise<KernelReevaluationRecord | undefined> {
    const persistence = await this.loadReevaluations();
    return persistence.reevaluations.find(
      (r) => r.reevaluation_id === reevaluation_id
    );
  }

  /**
   * Get Reevaluations by Kernel ID
   */
  async getReevaluationsByKernel(
    kernel_id: string
  ): Promise<KernelReevaluationRecord[]> {
    const persistence = await this.loadReevaluations();
    return persistence.reevaluations.filter((r) => r.kernel_id === kernel_id);
  }

  /**
   * Get Reevaluations by Status
   */
  async getReevaluationsByStatus(
    status: KernelReevaluationStatus
  ): Promise<KernelReevaluationRecord[]> {
    const persistence = await this.loadReevaluations();
    return persistence.reevaluations.filter((r) => r.status === status);
  }

  // ========================================================================
  // Helper Methods
  // ========================================================================

  /**
   * Extract Entity ID from trigger details
   */
  private extractEntityId(input: KernelReevaluationInput): string {
    const details = input.trigger_details;

    if ('assumption_id' in details) {
      return (details as AssumptionTriggerDetails).assumption_id;
    } else if ('metric_name' in details) {
      return (details as QualityTriggerDetails).metric_name;
    } else if ('incident_type' in details) {
      return (details as HealthTriggerDetails).incident_type;
    }

    return 'unknown';
  }

  /**
   * Generate Reevaluation ID
   */
  private generateReevaluationId(): string {
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 10000)
      .toString()
      .padStart(4, '0');
    return `REV-${timestamp}-${random}`;
  }

  /**
   * Create GitHub Issue
   */
  private async createGitHubIssue(
    input: KernelReevaluationInput,
    reevaluation_id: string
  ): Promise<number> {
    const [owner, repo] = this.config.repository.split('/');

    const title = this.generateIssueTitle(input);
    const body = this.generateIssueBody(input, reevaluation_id);
    const labels = this.generateIssueLabels(input);

    const response = await this.octokit.issues.create({
      owner,
      repo,
      title,
      body,
      labels,
    });

    return response.data.number;
  }

  /**
   * Generate Issue Title
   */
  private generateIssueTitle(input: KernelReevaluationInput): string {
    const triggerTypeLabels = {
      assumption_invalidated: '前提条件無効化',
      assumption_overdue: '前提条件期限切れ',
      quality_degradation: '品質劣化',
      quality_regression: '品質リグレッション',
      health_incident: 'ヘルスインシデント',
    };

    return `[Kernel再評価] ${triggerTypeLabels[input.triggerType]} - ${input.kernel_id}`;
  }

  /**
   * Generate Issue Body
   */
  private generateIssueBody(
    input: KernelReevaluationInput,
    reevaluation_id: string
  ): string {
    let detailsSection = '';

    if ('assumption_id' in input.trigger_details) {
      const details = input.trigger_details as AssumptionTriggerDetails;
      detailsSection = `
## 前提条件詳細
- **Assumption ID**: ${details.assumption_id}
- **前提条件**: ${details.assumption_statement}
- **無効化理由**: ${details.invalidation_reason || 'N/A'}
- **検証期限**: ${details.validation_due_date || 'N/A'}
- **期限超過日数**: ${details.days_overdue || 0}日
`;
    } else if ('metric_name' in input.trigger_details) {
      const details = input.trigger_details as QualityTriggerDetails;
      detailsSection = `
## 品質メトリクス詳細
- **メトリクス名**: ${details.metric_name}
- **現在値**: ${details.metric_value}
- **閾値**: ${details.threshold}
- **前回値**: ${details.previous_value || 'N/A'}
- **劣化率**: ${details.degradation_rate ? `${(details.degradation_rate * 100).toFixed(1)}%` : 'N/A'}
`;
    } else if ('incident_type' in input.trigger_details) {
      const details = input.trigger_details as HealthTriggerDetails;
      detailsSection = `
## ヘルスインシデント詳細
- **インシデント種別**: ${details.incident_type}
- **説明**: ${details.incident_description}
- **影響コンポーネント**: ${details.affected_components.join(', ')}
- **エラー回数**: ${details.error_count || 0}
- **ダウンタイム**: ${details.downtime_minutes || 0}分
`;
    }

    return `
# Kernel再評価要求

Kernelの再評価が必要になりました。

## 基本情報
- **Kernel ID**: ${input.kernel_id}
- **Reevaluation ID**: ${reevaluation_id}
- **トリガー種別**: ${input.triggerType}
- **重大度**: ${input.severity}
- **トリガー元**: ${input.triggeredBy}

${detailsSection}

## アクション
1. Kernelの現状を確認
2. Requirements/Verification/Validationの妥当性を検証
3. 必要に応じてChangeRequestを提案
4. 再評価を完了（resolved/dismissed）

---
*このIssueは KernelReevaluationService により自動生成されました*
`;
  }

  /**
   * Generate Issue Labels
   */
  private generateIssueLabels(input: KernelReevaluationInput): string[] {
    const labels: string[] = ['type:reevaluation'];

    // Severity label
    labels.push(`priority:${input.severity === 'critical' ? 'P0-Critical' : input.severity === 'high' ? 'P1-High' : input.severity === 'medium' ? 'P2-Medium' : 'P3-Low'}`);

    // Trigger type label
    if (
      input.triggerType === 'assumption_invalidated' ||
      input.triggerType === 'assumption_overdue'
    ) {
      labels.push('category:assumption');
    } else if (
      input.triggerType === 'quality_degradation' ||
      input.triggerType === 'quality_regression'
    ) {
      labels.push('category:quality');
    } else if (input.triggerType === 'health_incident') {
      labels.push('category:health');
    }

    return labels;
  }

  /**
   * Load Reevaluations from YAML
   */
  private async loadReevaluations(): Promise<KernelReevaluationPersistence> {
    try {
      const content = await fs.readFile(this.reevaluationsPath, 'utf-8');
      return yaml.load(content) as KernelReevaluationPersistence;
    } catch (error) {
      // File doesn't exist, return empty persistence
      return {
        meta: {
          version: '1.0.0',
          last_updated: new Date().toISOString(),
          description: 'Kernel Reevaluation Records',
        },
        reevaluations: [],
      };
    }
  }

  /**
   * Save Reevaluations to YAML
   */
  private async saveReevaluations(
    persistence: KernelReevaluationPersistence
  ): Promise<void> {
    // Ensure directory exists
    const dir = path.dirname(this.reevaluationsPath);
    await fs.mkdir(dir, { recursive: true });

    await fs.writeFile(
      this.reevaluationsPath,
      yaml.dump(persistence, { indent: 2, lineWidth: -1, noRefs: true }),
      'utf-8'
    );
  }
}
