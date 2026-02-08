/**
 * Kernel Ledger - Phase A2実装
 *
 * イベントソーシング型の変更管理
 * すべてのKernel操作をappend-onlyログとして記録し、
 * 任意の時点の状態を再生可能にする
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import {
  KernelOperation,
  OperationResult,
} from '../types/kernel-operations.js';
import { KernelRegistry, KernelWithNRVV } from '../types/nrvv.js';
import * as yaml from 'yaml';

/**
 * Ledger Entry - ログエントリ
 */
export interface LedgerEntry {
  /** エントリID（自動生成） */
  entry_id: string;

  /** 操作内容 */
  operation: KernelOperation;

  /** 実行結果 */
  result: OperationResult;

  /** 記録タイムスタンプ */
  recorded_at: string;
}

/**
 * Ledger Format - ログフォーマット
 */
export type LedgerFormat = 'yaml' | 'ndjson';

/**
 * Kernel Ledger Configuration
 */
export interface KernelLedgerConfig {
  /** Ledgerファイルパス */
  ledgerPath?: string;

  /** フォーマット（default: ndjson） */
  format?: LedgerFormat;

  /** Verbose logging */
  verbose?: boolean;
}

/**
 * Kernel Ledger
 *
 * append-only操作ログによるイベントソーシング
 */
export class KernelLedger {
  private ledgerPath: string;
  private format: LedgerFormat;
  private verbose: boolean;

  constructor(config: KernelLedgerConfig = {}) {
    this.ledgerPath = config.ledgerPath || path.join(process.cwd(), 'data/ssot/kernel-ledger.ndjson');
    this.format = config.format || 'ndjson';
    this.verbose = config.verbose || false;
  }

  private log(message: string): void {
    if (this.verbose) {
      console.log(`[${new Date().toISOString()}] [KernelLedger] ${message}`);
    }
  }

  /**
   * Append entry to ledger
   *
   * 操作ログをLedgerに追記する（append-only）
   */
  async append(operation: KernelOperation, result: OperationResult): Promise<void> {
    const entry: LedgerEntry = {
      entry_id: `ENTRY-${Date.now()}-${Math.random().toString(36).substring(7)}`,
      operation,
      result,
      recorded_at: new Date().toISOString(),
    };

    this.log(`Appending entry: ${entry.entry_id} (${operation.op})`);

    if (this.format === 'ndjson') {
      await this.appendNDJSON(entry);
    } else {
      await this.appendYAML(entry);
    }
  }

  /**
   * Append entry as NDJSON
   */
  private async appendNDJSON(entry: LedgerEntry): Promise<void> {
    const line = JSON.stringify(entry) + '\n';

    // ファイルが存在しない場合は作成
    try {
      await fs.access(this.ledgerPath);
    } catch {
      await fs.mkdir(path.dirname(this.ledgerPath), { recursive: true });
      await fs.writeFile(this.ledgerPath, '', 'utf-8');
    }

    // 追記
    await fs.appendFile(this.ledgerPath, line, 'utf-8');
  }

  /**
   * Append entry as YAML
   */
  private async appendYAML(entry: LedgerEntry): Promise<void> {
    let entries: LedgerEntry[] = [];

    // 既存ファイルを読み込み
    try {
      const content = await fs.readFile(this.ledgerPath, 'utf-8');
      const parsed = yaml.parse(content);
      entries = parsed.entries || [];
    } catch {
      // ファイルが存在しない場合は新規作成
      await fs.mkdir(path.dirname(this.ledgerPath), { recursive: true });
    }

    // エントリを追加
    entries.push(entry);

    // 書き込み
    const content = yaml.stringify({ entries }, { indent: 2 });
    await fs.writeFile(this.ledgerPath, content, 'utf-8');
  }

  /**
   * Read all entries from ledger
   *
   * Ledgerからすべてのエントリを読み込む
   */
  async readAll(): Promise<LedgerEntry[]> {
    this.log('Reading all entries from ledger');

    try {
      if (this.format === 'ndjson') {
        return await this.readNDJSON();
      } else {
        return await this.readYAML();
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        this.log('Ledger file not found, returning empty array');
        return [];
      }
      throw error;
    }
  }

  /**
   * Read entries as NDJSON
   */
  private async readNDJSON(): Promise<LedgerEntry[]> {
    const content = await fs.readFile(this.ledgerPath, 'utf-8');
    const lines = content.trim().split('\n').filter(line => line.length > 0);
    return lines.map(line => JSON.parse(line) as LedgerEntry);
  }

  /**
   * Read entries as YAML
   */
  private async readYAML(): Promise<LedgerEntry[]> {
    const content = await fs.readFile(this.ledgerPath, 'utf-8');
    const parsed = yaml.parse(content);
    return parsed.entries || [];
  }

  /**
   * Read entries by kernel ID
   *
   * 特定のKernelに関連するエントリを取得
   */
  async readByKernel(kernelId: string): Promise<LedgerEntry[]> {
    this.log(`Reading entries for kernel: ${kernelId}`);

    const allEntries = await this.readAll();
    return allEntries.filter(entry => {
      const payload = entry.operation.payload as any;
      return payload.kernel_id === kernelId;
    });
  }

  /**
   * Read entries by issue
   *
   * 特定のIssueに関連するエントリを取得
   */
  async readByIssue(issue: string): Promise<LedgerEntry[]> {
    this.log(`Reading entries for issue: ${issue}`);

    const allEntries = await this.readAll();
    return allEntries.filter(entry => entry.operation.issue === issue);
  }

  /**
   * Read entries by time range
   *
   * 時間範囲でエントリをフィルタ
   */
  async readByTimeRange(startTime: string, endTime: string): Promise<LedgerEntry[]> {
    this.log(`Reading entries from ${startTime} to ${endTime}`);

    const allEntries = await this.readAll();
    return allEntries.filter(entry => {
      const recordedAt = new Date(entry.recorded_at).getTime();
      const start = new Date(startTime).getTime();
      const end = new Date(endTime).getTime();
      return recordedAt >= start && recordedAt <= end;
    });
  }

  /**
   * Replay ledger and reconstruct kernel state
   *
   * Ledgerを再生してKernel状態を再構成する
   */
  async replay(kernelId?: string): Promise<Record<string, KernelWithNRVV>> {
    this.log(`Replaying ledger${kernelId ? ` for kernel: ${kernelId}` : ' (all kernels)'}`);

    const entries = kernelId ? await this.readByKernel(kernelId) : await this.readAll();

    // Kernel状態を再構成
    const kernels: Record<string, KernelWithNRVV> = {};

    for (const entry of entries) {
      const { operation, result } = entry;

      if (!result.success) {
        // 失敗した操作はスキップ
        continue;
      }

      const payload = operation.payload as any;
      const kid = payload.kernel_id;

      // Kernelが存在しない場合は作成（簡易実装）
      if (!kernels[kid]) {
        kernels[kid] = this.createEmptyKernel(kid, operation.actor);
      }

      const kernel = kernels[kid];

      // 操作種別に応じて状態を更新
      switch (operation.op) {
        case 'u.record_decision':
          kernel.decision = {
            decision_id: payload.decision_id,
            decision_type: payload.decision_type,
            decided_by: payload.decided_by,
            rationale: payload.rationale,
            falsification_conditions: payload.falsification_conditions,
            linked_issue: operation.issue,
            assurance_level: payload.assurance_level,
          };
          break;

        case 'u.link_evidence':
          if (!kernel.evidence) {
            kernel.evidence = [];
          }
          kernel.evidence.push({
            id: payload.evidence_id,
            type: payload.evidence_type,
            source: payload.evidence_source,
            source_type: 'external',
            collected_at: result.timestamp,
            verification_status: payload.verification_status,
          });
          break;

        case 'u.set_state':
          kernel.maturity = payload.to;
          kernel.lastUpdatedAt = result.timestamp;
          break;

        case 'u.raise_exception':
          if (!kernel.exceptions) {
            kernel.exceptions = [];
          }
          // Replay時は元のexception_idを使用（決定論性を保つ）
          // フォールバックはentry_idから生成（Date.now()は使わない）
          const exception_id = (result.details as any)?.exception_id || `EX-${entry.entry_id}`;
          kernel.exceptions.push({
            id: exception_id as string,
            type: payload.exception_type,
            severity: payload.severity,
            description: payload.description,
            raised_at: result.timestamp,
            raised_by: operation.actor,
            status: 'open',
          });
          break;

        case 'u.close_exception':
          if (kernel.exceptions) {
            const exception = kernel.exceptions.find(ex => ex.id === payload.exception_id);
            if (exception) {
              exception.status = 'closed';
              exception.resolution = payload.resolution;
              exception.resolved_at = result.timestamp;
              exception.resolved_by = payload.resolved_by;
            }
          }
          break;
      }

      // Historyに記録
      kernel.history.push({
        action: operation.op.replace('u.', ''),
        by: operation.actor,
        timestamp: result.timestamp,
        op: operation.op,
        actor: operation.actor,
        issue: operation.issue,
        summary: result.details?.summary as string || `Operation: ${operation.op}`,
      });
    }

    this.log(`Replay complete: ${Object.keys(kernels).length} kernels reconstructed`);
    return kernels;
  }

  /**
   * Create empty kernel (for replay)
   */
  private createEmptyKernel(id: string, owner: string): KernelWithNRVV {
    return {
      id,
      statement: '',
      category: 'architecture',
      owner,
      maturity: 'draft',
      createdAt: new Date().toISOString(),
      lastUpdatedAt: new Date().toISOString(),
      needs: [],
      requirements: [],
      verification: [],
      validation: [],
      history: [],
    };
  }

  /**
   * Export ledger to Kernel Registry format
   *
   * Ledgerを再生してKernel Registryフォーマットにエクスポート
   */
  async exportToRegistry(): Promise<KernelRegistry> {
    this.log('Exporting ledger to kernel registry format');

    const kernels = await this.replay();

    const registry: KernelRegistry = {
      meta: {
        registry_version: '1.0.0',
        last_updated: new Date().toISOString(),
        last_updated_by: 'KernelLedger',
        schema_version: '1.0.0',
        description: 'Reconstructed from Kernel Ledger',
      },
      kernels,
      indices: {
        by_maturity: { draft: [], under_review: [], agreed: [], frozen: [], deprecated: [] },
        by_category: { architecture: [], requirement: [], constraint: [], interface: [], quality: [], security: [] },
        by_owner: {},
        by_tag: {},
      },
      statistics: {
        total_kernels: Object.keys(kernels).length,
        by_maturity: { draft: 0, under_review: 0, agreed: 0, frozen: 0, deprecated: 0 },
        convergence_rate: 0,
        last_computed: new Date().toISOString(),
      },
    };

    return registry;
  }
}
