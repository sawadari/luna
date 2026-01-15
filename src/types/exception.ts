/**
 * Exception Types - Exception Registry
 *
 * 例外（Exception）は ExceptionRegistry で一元管理される。
 * 期限・監視シグナル・緩和策が記録され、期限切れが検出可能。
 */

/**
 * 例外の種類
 */
export type ExceptionType =
  | 'E_quality_over_speed'         // 品質 > 速度
  | 'E_differentiation_over_cost'  // 差別化 > コスト
  | 'E_new_value_axis'             // 新しい価値軸
  | 'E_boundary_exception'         // 境界例外
  | 'E_regulation_override'        // 規制オーバーライド
  | 'E_technical_debt';            // 技術的負債

/**
 * 例外のステータス
 */
export type ExceptionStatus = 'open' | 'mitigated' | 'closed' | 'expired';

/**
 * 例外提案（ExceptionProposal）
 *
 * 例外を提案する際に使用。承認後、ExceptionRecordに昇格。
 */
export interface ExceptionProposal {
  /** Proposal ID (例: PROP-001) */
  proposal_id: string;

  /** 例外の種類 */
  type: ExceptionType;

  /** 理由 */
  rationale: string;

  /** 提案者 */
  requested_by: string;

  /** 提案日時 */
  requested_at: string;

  /** 紐づくDecision ID */
  linked_decision_id?: string;

  /** 期限条件（例: "2026-Q2終了時"） */
  requested_expiry_condition: string;

  /** 緩和策 */
  proposed_mitigation_plan: string;

  /** 監視シグナル（例: "sig.quality_score"） */
  monitoring_signal?: string;
}

/**
 * 例外記録（ExceptionRecord）
 *
 * 承認済みの例外。期限・監視シグナル・緩和策が記録される。
 */
export interface ExceptionRecord {
  /** Exception ID (例: EXC-QUA-1736856000000) */
  exception_id: string;

  /** 例外の種類 */
  type: ExceptionType;

  /** 承認者 */
  approved_by: string;

  /** 承認日時 */
  approved_at: string;

  /** 期限条件 */
  expiry_condition: string;

  /** 監視シグナル */
  monitoring_signal?: string;

  /** 緩和策 */
  mitigation_plan: string;

  /** ステータス */
  status: ExceptionStatus;

  /** 紐づくDecision ID */
  linked_decision_id?: string;

  /** 紐づくChangeRequest ID */
  linked_cr_id?: string;

  /** 備考 */
  notes?: string;

  /** 状態遷移履歴 */
  statusHistory: Array<{
    status: ExceptionStatus;
    changedAt: string;
    changedBy: string;
    reason: string;
  }>;
}

/**
 * 例外レジストリ（ExceptionRegistry）
 */
export interface ExceptionRegistry {
  /** 例外提案リスト */
  proposals: ExceptionProposal[];

  /** 例外記録リスト */
  exceptions: ExceptionRecord[];

  /** バージョン */
  version: string;

  /** 最終更新日時 */
  lastUpdated: string;
}

/**
 * 例外統計（ExceptionStats）
 */
export interface ExceptionStats {
  /** 全例外数 */
  totalExceptions: number;

  /** ステータス別集計 */
  byStatus: Record<ExceptionStatus, number>;

  /** 種類別集計 */
  byType: Record<ExceptionType, number>;

  /** 期限切れ例外数 */
  expiredCount: number;

  /** 期限切れ例外IDリスト */
  expiredExceptionIds: string[];
}
