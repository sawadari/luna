/**
 * RunMetricsService
 *
 * 実行ごとの知識メトリクスを集計・永続化するサービス
 */

import fs from 'fs/promises';
import path from 'path';
import type {
  KnowledgeMetrics,
  ExecutionType,
} from '../types/run-contract.js';
import {
  calculateKnowledgeMetrics,
  createRunContract,
} from '../types/run-contract.js';
import type { PhaseGateResult } from '../types/run-contract.js';

/**
 * 実行メトリクスレコード（永続化用）
 */
export interface RunMetricsRecord {
  /**
   * タイムスタンプ（ISO 8601形式）
   */
  timestamp: string;

  /**
   * Issue番号
   */
  issue_number: number;

  /**
   * 実行タイプ
   */
  execution_type: ExecutionType;

  /**
   * 実行ステータス
   */
  status: 'success' | 'failure' | 'partial';

  /**
   * 生成ファイル数
   */
  generated_files: number;

  /**
   * Kernel更新数
   */
  kernel_updates: number;

  /**
   * 知識メトリクス
   */
  knowledge_metrics: KnowledgeMetrics;

  /**
   * 契約違反理由
   */
  violation_reasons: string[];

  /**
   * 実行時間（秒）
   */
  duration_seconds: number;

  /**
   * Phase Gate結果
   */
  gate_results: PhaseGateResult[];
}

/**
 * RunMetricsService
 */
export class RunMetricsService {
  private metricsFilePath: string;

  constructor(metricsFilePath?: string) {
    this.metricsFilePath =
      metricsFilePath ||
      path.join(process.cwd(), 'data', 'ssot', 'run-metrics.ndjson');
  }

  /**
   * メトリクスファイルのディレクトリを作成
   */
  private async ensureMetricsDirectory(): Promise<void> {
    const dir = path.dirname(this.metricsFilePath);
    await fs.mkdir(dir, { recursive: true });
  }

  /**
   * 実行メトリクスを記録
   */
  async recordMetrics(
    issueNumber: number,
    executionType: ExecutionType,
    status: 'success' | 'failure' | 'partial',
    generatedFiles: number,
    kernelsLoaded: number,
    kernelsReferenced: number,
    kernelsCreated: number,
    kernelsUpdated: number,
    evidenceLinked: number,
    durationSeconds: number,
    gateResults: PhaseGateResult[]
  ): Promise<RunMetricsRecord> {
    const knowledgeMetrics = calculateKnowledgeMetrics(
      kernelsLoaded,
      kernelsReferenced,
      kernelsCreated,
      kernelsUpdated,
      evidenceLinked
    );

    const kernelUpdates = kernelsCreated + kernelsUpdated;

    const contract = createRunContract(
      executionType,
      generatedFiles,
      kernelUpdates,
      knowledgeMetrics,
      gateResults
    );

    const record: RunMetricsRecord = {
      timestamp: new Date().toISOString(),
      issue_number: issueNumber,
      execution_type: executionType,
      status,
      generated_files: generatedFiles,
      kernel_updates: kernelUpdates,
      knowledge_metrics: knowledgeMetrics,
      violation_reasons: contract.violation_reasons,
      duration_seconds: durationSeconds,
      gate_results: gateResults,
    };

    await this.ensureMetricsDirectory();
    await fs.appendFile(
      this.metricsFilePath,
      JSON.stringify(record) + '\n',
      'utf-8'
    );

    return record;
  }

  /**
   * 最新N件のメトリクスを取得
   */
  async getRecentMetrics(limit: number = 10): Promise<RunMetricsRecord[]> {
    try {
      const content = await fs.readFile(this.metricsFilePath, 'utf-8');
      const lines = content
        .trim()
        .split('\n')
        .filter((line) => line.length > 0);
      const records = lines
        .slice(-limit)
        .map((line) => JSON.parse(line) as RunMetricsRecord);
      return records.reverse(); // 最新が先頭
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return []; // ファイルがまだ存在しない
      }
      throw error;
    }
  }

  /**
   * 特定Issueのメトリクスを取得
   */
  async getMetricsByIssue(
    issueNumber: number
  ): Promise<RunMetricsRecord | null> {
    try {
      const content = await fs.readFile(this.metricsFilePath, 'utf-8');
      const lines = content
        .trim()
        .split('\n')
        .filter((line) => line.length > 0);

      // 最新のレコードを逆順で検索
      for (let i = lines.length - 1; i >= 0; i--) {
        const record = JSON.parse(lines[i]) as RunMetricsRecord;
        if (record.issue_number === issueNumber) {
          return record;
        }
      }
      return null;
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  /**
   * 統計情報を取得
   */
  async getStatistics(): Promise<{
    total_runs: number;
    success_rate: number;
    avg_generated_files: number;
    avg_kernel_updates: number;
    avg_reuse_rate: number;
    avg_convergence_delta: number;
  }> {
    const records = await this.getRecentMetrics(100); // 最新100件で統計

    if (records.length === 0) {
      return {
        total_runs: 0,
        success_rate: 0,
        avg_generated_files: 0,
        avg_kernel_updates: 0,
        avg_reuse_rate: 0,
        avg_convergence_delta: 0,
      };
    }

    const successCount = records.filter((r) => r.status === 'success').length;
    const totalGeneratedFiles = records.reduce(
      (sum, r) => sum + r.generated_files,
      0
    );
    const totalKernelUpdates = records.reduce(
      (sum, r) => sum + r.kernel_updates,
      0
    );
    const totalReuseRate = records.reduce(
      (sum, r) => sum + r.knowledge_metrics.reuse_rate,
      0
    );
    const totalConvergenceDelta = records.reduce(
      (sum, r) => sum + r.knowledge_metrics.convergence_delta,
      0
    );

    return {
      total_runs: records.length,
      success_rate: successCount / records.length,
      avg_generated_files: totalGeneratedFiles / records.length,
      avg_kernel_updates: totalKernelUpdates / records.length,
      avg_reuse_rate: totalReuseRate / records.length,
      avg_convergence_delta: totalConvergenceDelta / records.length,
    };
  }

  /**
   * メトリクスをMarkdown形式でフォーマット
   */
  formatMetricsMarkdown(record: RunMetricsRecord): string {
    const lines: string[] = [];

    lines.push('## 📊 Knowledge Metrics');
    lines.push('');
    lines.push('### Execution Summary');
    lines.push(`- **Status**: ${record.status}`);
    lines.push(`- **Type**: ${record.execution_type}`);
    lines.push(`- **Duration**: ${record.duration_seconds.toFixed(2)}s`);
    lines.push(`- **Generated Files**: ${record.generated_files}`);
    lines.push(`- **Kernel Updates**: ${record.kernel_updates}`);
    lines.push('');

    lines.push('### Knowledge Activity');
    const km = record.knowledge_metrics;
    lines.push(`- **Kernels Loaded**: ${km.kernels_loaded}`);
    lines.push(`- **Kernels Referenced**: ${km.kernels_referenced}`);
    lines.push(`- **Kernels Created**: ${km.kernels_created}`);
    lines.push(`- **Kernels Updated**: ${km.kernels_updated}`);
    lines.push(`- **Evidence Linked**: ${km.evidence_linked}`);
    lines.push(
      `- **Reuse Rate**: ${(km.reuse_rate * 100).toFixed(1)}%`
    );
    lines.push(
      `- **Convergence Delta**: ${(km.convergence_delta * 100).toFixed(1)}%`
    );
    lines.push('');

    if (record.violation_reasons.length > 0) {
      lines.push('### ⚠️ Contract Violations');
      record.violation_reasons.forEach((reason) => {
        lines.push(`- ${reason}`);
      });
      lines.push('');
    }

    if (record.gate_results.length > 0) {
      const failedGates = record.gate_results.filter((g) => !g.passed);
      if (failedGates.length > 0) {
        lines.push('### 🚧 Phase Gate Failures');
        failedGates.forEach((gate) => {
          lines.push(`- **${gate.phaseName}**: ${gate.reason}`);
          if (gate.missingItems && gate.missingItems.length > 0) {
            lines.push(`  - Missing: ${gate.missingItems.join(', ')}`);
          }
        });
        lines.push('');
      }
    }

    return lines.join('\n');
  }
}

/**
 * デフォルトのRunMetricsServiceインスタンス
 */
export const defaultRunMetricsService = new RunMetricsService();
