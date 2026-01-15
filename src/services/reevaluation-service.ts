/**
 * ReevaluationService - Decision Reevaluation Engine
 *
 * Phase 1: 基礎実装（falsification_conditions の評価）
 * Phase 2: 完全実装（Signal統合、自動トリガー、GitHub連携）
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { DecisionRecord, FalsificationCondition } from '../types';
import {
  ReevaluationTrigger,
  ReevaluationResult,
  ReevaluationRecord,
} from '../types/reevaluation';

/**
 * Reevaluation Config
 */
export interface ReevaluationConfig {
  verbose?: boolean;
  dryRun?: boolean;
}

/**
 * Decision Registry (decisions.yaml に保存)
 */
interface DecisionRegistry {
  decisions: DecisionRecord[];
  reevaluationRecords: ReevaluationRecord[];
  version: string;
  lastUpdated: string;
}

/**
 * ReevaluationService
 *
 * DecisionRecord の falsificationConditions を評価し、再評価トリガーを生成
 */
export class ReevaluationService {
  private config: ReevaluationConfig;
  private registryPath: string;

  constructor(config: ReevaluationConfig = {}) {
    this.config = config;
    this.registryPath = path.join(process.cwd(), 'decisions.yaml');
  }

  private log(message: string): void {
    if (this.config.verbose) {
      console.log(`[${new Date().toISOString()}] [ReevaluationService] ${message}`);
    }
  }

  /**
   * DecisionRecord の falsificationConditions を評価
   *
   * Phase 1: 手動での値入力による評価（プレースホルダー実装）
   * Phase 2: Signal統合による自動評価
   *
   * @param decisionId - DecisionRecord ID
   * @param signalValues - 監視シグナルの現在値（Phase 1: 手動入力、Phase 2: 自動取得）
   * @returns ReevaluationResult
   */
  async checkFalsificationConditions(
    decisionId: string,
    signalValues: Record<string, number> = {}
  ): Promise<ReevaluationResult> {
    this.log(`Checking falsification conditions for Decision: ${decisionId}`);

    const registry = await this.loadRegistry();
    const decision = registry.decisions.find((d) => d.id === decisionId);

    if (!decision) {
      throw new Error(`Decision ${decisionId} not found`);
    }

    const triggers: ReevaluationTrigger[] = [];

    // Falsification Conditions を評価
    for (const fc of decision.falsificationConditions || []) {
      const triggered = this.evaluateFalsificationCondition(fc, signalValues);

      if (triggered) {
        const trigger: ReevaluationTrigger = {
          id: this.generateTriggerId(),
          type: 'signal_threshold',
          decisionId: decision.id,
          source: fc.signalRef || 'manual',
          detectedAt: new Date().toISOString(),
          message: `Falsification condition met: ${fc.condition}`,
          falsificationConditionId: fc.id,
          actualValue: signalValues[fc.signalRef || ''],
          threshold: fc.threshold,
        };

        triggers.push(trigger);
        this.log(`Trigger detected: ${trigger.message}`);
      }
    }

    return {
      decisionId: decision.id,
      needsReevaluation: triggers.length > 0,
      triggers,
      evaluatedAt: new Date().toISOString(),
    };
  }

  /**
   * Falsification Condition を評価
   *
   * Phase 1: signalValues から値を取得して閾値チェック
   * Phase 2: MonitoringAgent から Signal を自動取得
   *
   * @param fc - FalsificationCondition
   * @param signalValues - 監視シグナルの現在値
   * @returns トリガーされたか
   */
  private evaluateFalsificationCondition(
    fc: FalsificationCondition,
    signalValues: Record<string, number>
  ): boolean {
    if (!fc.signalRef || !fc.threshold) {
      // Signal参照がない場合はスキップ（Phase 2 で実装予定）
      return false;
    }

    const actualValue = signalValues[fc.signalRef];
    if (actualValue === undefined) {
      // Signal値がない場合はスキップ
      return false;
    }

    // 閾値比較
    const comparison = fc.thresholdComparison || 'lt'; // デフォルト: less than
    switch (comparison) {
      case 'gt':
        return actualValue > fc.threshold;
      case 'lt':
        return actualValue < fc.threshold;
      case 'gte':
        return actualValue >= fc.threshold;
      case 'lte':
        return actualValue <= fc.threshold;
      case 'eq':
        return actualValue === fc.threshold;
      case 'neq':
        return actualValue !== fc.threshold;
      default:
        return false;
    }
  }

  /**
   * 再評価プロセスを開始
   *
   * @param decisionId - DecisionRecord ID
   * @param trigger - ReevaluationTrigger
   * @param startedBy - 開始者
   * @returns ReevaluationRecord
   */
  async startReevaluation(
    decisionId: string,
    trigger: ReevaluationTrigger,
    startedBy: string
  ): Promise<ReevaluationRecord> {
    this.log(`Starting reevaluation for Decision: ${decisionId}`);

    const reevaluationRecord: ReevaluationRecord = {
      id: this.generateReevaluationId(),
      decisionId,
      trigger,
      status: 'pending',
      startedAt: new Date().toISOString(),
      startedBy,
    };

    const registry = await this.loadRegistry();
    registry.reevaluationRecords.push(reevaluationRecord);
    registry.lastUpdated = new Date().toISOString();

    if (!this.config.dryRun) {
      await this.saveRegistry(registry);
    }

    this.log(`Reevaluation started: ${reevaluationRecord.id}`);
    return reevaluationRecord;
  }

  /**
   * 再評価プロセスを完了
   *
   * @param reevaluationId - ReevaluationRecord ID
   * @param conclusion - 結論
   * @param newDecisionId - 新しい DecisionRecord ID（更新の場合）
   * @returns ReevaluationRecord
   */
  async completeReevaluation(
    reevaluationId: string,
    conclusion: string,
    newDecisionId?: string
  ): Promise<ReevaluationRecord> {
    this.log(`Completing reevaluation: ${reevaluationId}`);

    const registry = await this.loadRegistry();
    const reevaluation = registry.reevaluationRecords.find((r) => r.id === reevaluationId);

    if (!reevaluation) {
      throw new Error(`Reevaluation ${reevaluationId} not found`);
    }

    reevaluation.status = newDecisionId ? 'decision_updated' : 'completed';
    reevaluation.completedAt = new Date().toISOString();
    reevaluation.conclusion = conclusion;
    reevaluation.newDecisionId = newDecisionId;
    registry.lastUpdated = new Date().toISOString();

    if (!this.config.dryRun) {
      await this.saveRegistry(registry);
    }

    this.log(`Reevaluation completed: ${reevaluation.id} - ${reevaluation.status}`);
    return reevaluation;
  }

  /**
   * Decision を Registry に登録
   *
   * @param decision - DecisionRecord
   */
  async registerDecision(decision: DecisionRecord): Promise<void> {
    this.log(`Registering decision: ${decision.id}`);

    const registry = await this.loadRegistry();
    registry.decisions.push(decision);
    registry.lastUpdated = new Date().toISOString();

    if (!this.config.dryRun) {
      await this.saveRegistry(registry);
    }

    this.log(`Decision registered: ${decision.id}`);
  }

  /**
   * 全 Decision の統計を取得
   */
  async getDecisionStats(): Promise<{
    totalDecisions: number;
    byType: Record<string, number>;
    withFalsificationConditions: number;
    reevaluations: number;
  }> {
    const registry = await this.loadRegistry();

    const stats = {
      totalDecisions: registry.decisions.length,
      byType: { adopt: 0, defer: 0, reject: 0, explore: 0 },
      withFalsificationConditions: 0,
      reevaluations: registry.reevaluationRecords.length,
    };

    for (const decision of registry.decisions) {
      stats.byType[decision.decisionType]++;
      if (decision.falsificationConditions && decision.falsificationConditions.length > 0) {
        stats.withFalsificationConditions++;
      }
    }

    return stats;
  }

  // ========================================================================
  // Helper Methods
  // ========================================================================

  /**
   * Trigger ID 生成
   */
  private generateTriggerId(): string {
    const random = Math.floor(Math.random() * 1000)
      .toString()
      .padStart(3, '0');
    return `TRG-${random}`;
  }

  /**
   * Reevaluation ID 生成
   */
  private generateReevaluationId(): string {
    const year = new Date().getFullYear();
    const random = Math.floor(Math.random() * 1000)
      .toString()
      .padStart(3, '0');
    return `REV-${year}-${random}`;
  }

  /**
   * Registry をロード
   */
  private async loadRegistry(): Promise<DecisionRegistry> {
    try {
      const content = await fs.readFile(this.registryPath, 'utf-8');
      return yaml.load(content) as DecisionRegistry;
    } catch {
      return {
        decisions: [],
        reevaluationRecords: [],
        version: '1.0.0',
        lastUpdated: new Date().toISOString(),
      };
    }
  }

  /**
   * Registry を保存
   */
  private async saveRegistry(registry: DecisionRegistry): Promise<void> {
    await fs.writeFile(
      this.registryPath,
      yaml.dump(registry, { indent: 2, lineWidth: -1, noRefs: true }),
      'utf-8'
    );
  }
}
