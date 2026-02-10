/**
 * Kernel Reevaluation Types
 *
 * Issue #51: Kernel再評価トリガー管理
 * Kernelの前提条件無効化、品質劣化、ヘルス問題を検出し、
 * 必要に応じてGitHub Issueを自動作成する
 *
 * NOTE: 既存の src/types/reevaluation.ts (DecisionRecord再評価) とは別実装
 *       既存実装との統合は Phase 2 で実施予定
 */

/**
 * Kernel Reevaluation Trigger Type - 再評価トリガー種別
 */
export type KernelReevaluationTriggerType =
  // AssumptionTrackerAgent triggers
  | 'assumption_invalidated' // 前提条件が無効化された
  | 'assumption_overdue' // 前提条件の検証期限切れ

  // MonitoringAgent triggers
  | 'quality_degradation' // 品質メトリクスが閾値を下回った（段階的劣化）
  | 'quality_regression' // 品質メトリクスが急激に低下した
  | 'health_incident'; // システムヘルスインシデント発生

/**
 * Kernel Reevaluation Severity - 重大度
 */
export type KernelReevaluationSeverity = 'critical' | 'high' | 'medium' | 'low';

/**
 * Kernel Reevaluation Status - 再評価ステータス
 */
export type KernelReevaluationStatus = 'pending' | 'in_progress' | 'resolved' | 'dismissed';

/**
 * Kernel Reevaluation Input - サービス入力
 */
export interface KernelReevaluationInput {
  /** トリガー種別 */
  triggerType: KernelReevaluationTriggerType;

  /** 対象Kernel ID */
  kernel_id: string;

  /** 既存Issue ID（既にIssueがある場合） */
  existing_issue_id?: number;

  /** トリガー発生元（Agent名） */
  triggeredBy: string;

  /** トリガー詳細情報（種別ごとに異なる） */
  trigger_details:
    | AssumptionTriggerDetails
    | QualityTriggerDetails
    | HealthTriggerDetails;

  /** 重大度 */
  severity: KernelReevaluationSeverity;

  /** 手動フォローアップ必要フラグ（trueの場合は必ずIssue作成） */
  manual_followup_required?: boolean;

  /** 追加メタデータ */
  metadata?: Record<string, unknown>;
}

/**
 * Assumption Trigger Details - 前提条件トリガー詳細
 */
export interface AssumptionTriggerDetails {
  assumption_id: string;
  assumption_statement: string;
  invalidation_reason?: string;
  validation_due_date?: string;
  days_overdue?: number;
}

/**
 * Quality Trigger Details - 品質トリガー詳細
 */
export interface QualityTriggerDetails {
  metric_name: string;
  metric_value: number;
  threshold: number;
  previous_value?: number;
  degradation_rate?: number; // 劣化率 (例: -15.3% → -0.153)
}

/**
 * Health Trigger Details - ヘルストリガー詳細
 */
export interface HealthTriggerDetails {
  incident_type: string;
  incident_description: string;
  affected_components: string[];
  error_count?: number;
  downtime_minutes?: number;
}

/**
 * Kernel Reevaluation Record - 永続化レコード
 */
export interface KernelReevaluationRecord {
  /** 再評価ID */
  reevaluation_id: string; // REV-{timestamp}-{random}

  /** 対象Kernel ID */
  kernel_id: string;

  /** 作成されたGitHub Issue番号（条件付き作成時のみ） */
  issue_id?: number;

  /** トリガー種別 */
  trigger_type: KernelReevaluationTriggerType;

  /** トリガー発生日時 */
  triggered_at: string; // ISO 8601

  /** トリガー発生元 */
  triggered_by: string;

  /** 重大度 */
  severity: KernelReevaluationSeverity;

  /** 重複排除キー */
  dedupeKey: string;

  /** ステータス */
  status: KernelReevaluationStatus;

  /** トリガー詳細情報 */
  trigger_details:
    | AssumptionTriggerDetails
    | QualityTriggerDetails
    | HealthTriggerDetails;

  /** 解決方法（resolved/dismissed時のみ） */
  resolution?: string;

  /** 解決日時 */
  resolved_at?: string;

  /** 解決者 */
  resolved_by?: string;

  /** 追加メタデータ */
  metadata?: Record<string, unknown>;

  /** ChangeRequest候補（完了時に生成） */
  cr_candidate?: {
    proposed_change: string;
    rationale: string;
    impact: 'breaking' | 'major' | 'minor' | 'patch';
  };
}

/**
 * Kernel Reevaluation Service Result - サービス実行結果
 */
export interface KernelReevaluationServiceResult {
  /** 成功フラグ */
  success: boolean;

  /** 再評価ID */
  reevaluation_id: string;

  /** 作成されたIssue番号（作成された場合のみ） */
  issue_id?: number;

  /** 重複判定（重複の場合true） */
  deduplicated: boolean;

  /** 既存の重複レコードID（重複の場合） */
  existing_reevaluation_id?: string;

  /** エラーメッセージ（失敗時） */
  error?: string;

  /** KernelRuntime operation ID (u.start_reevaluation) */
  operation_id?: string;
}

/**
 * Generate Dedupe Key
 * 重複排除キーを生成（タイムスタンプは含めない - 別途24時間チェックで判定）
 *
 * @param kernel_id - Kernel ID
 * @param trigger_type - トリガー種別
 * @param entity_id - エンティティID（assumption_id, metric_name, incident_type等）
 * @returns 重複排除キー
 */
export function generateDedupeKey(
  kernel_id: string,
  trigger_type: KernelReevaluationTriggerType,
  entity_id: string
): string {
  // Issue #51 (Medium fix): タイムスタンプを含めず、サービス側で24時間チェック
  return `${kernel_id}:${trigger_type}:${entity_id}`;
}

/**
 * Kernel Reevaluation Persistence - 永続化データ構造
 */
export interface KernelReevaluationPersistence {
  meta: {
    version: string;
    last_updated: string;
    description: string;
  };
  reevaluations: KernelReevaluationRecord[];
}
