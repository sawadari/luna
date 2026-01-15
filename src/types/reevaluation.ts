/**
 * Reevaluation Types - Decision Reevaluation & Falsification
 *
 * Phase 1: 基礎実装（falsification_conditions の評価）
 * Phase 2: 完全実装（Signal統合、自動トリガー）
 */

/**
 * Reevaluation Trigger Type
 */
export type ReevaluationTriggerType =
  | 'signal_threshold' // 監視シグナルが閾値を超えた
  | 'assumption_invalidated' // 前提条件が無効化された
  | 'manual' // 手動での再評価要求
  | 'timeout'; // タイムアウト（defer decisionsの reviewDate 到達）

/**
 * Reevaluation Trigger
 *
 * DecisionRecord の再評価が必要になった理由を記録
 */
export interface ReevaluationTrigger {
  /** トリガーID */
  id: string; // TRG-001, TRG-002, ...

  /** トリガータイプ */
  type: ReevaluationTriggerType;

  /** 対象 DecisionRecord ID */
  decisionId: string;

  /** トリガー元（Signal ID / Assumption ID / User ID） */
  source: string;

  /** 検出日時 */
  detectedAt: string;

  /** 詳細メッセージ */
  message: string;

  /** 関連する FalsificationCondition ID（該当する場合） */
  falsificationConditionId?: string;

  /** 実際の値（閾値チェックの場合） */
  actualValue?: number;

  /** 閾値（閾値チェックの場合） */
  threshold?: number;
}

/**
 * Reevaluation Status
 */
export type ReevaluationStatus =
  | 'pending' // 再評価待ち
  | 'in_progress' // 再評価中
  | 'completed' // 再評価完了
  | 'decision_updated' // Decision更新済み
  | 'dismissed'; // 再評価不要と判断

/**
 * Reevaluation Record
 *
 * 再評価プロセスの記録
 */
export interface ReevaluationRecord {
  /** Reevaluation ID */
  id: string; // REV-YYYY-NNN

  /** 対象 DecisionRecord ID */
  decisionId: string;

  /** トリガー */
  trigger: ReevaluationTrigger;

  /** ステータス */
  status: ReevaluationStatus;

  /** 開始日時 */
  startedAt: string;

  /** 開始者 */
  startedBy: string;

  /** 完了日時 */
  completedAt?: string;

  /** 新しい DecisionRecord ID（Decision更新の場合） */
  newDecisionId?: string;

  /** 結論 */
  conclusion?: string;

  /** 次のアクション */
  nextActions?: string[];
}

/**
 * Reevaluation Result
 *
 * checkFalsificationConditions() の戻り値
 */
export interface ReevaluationResult {
  /** 対象 DecisionRecord ID */
  decisionId: string;

  /** 再評価が必要か */
  needsReevaluation: boolean;

  /** 検出されたトリガーリスト */
  triggers: ReevaluationTrigger[];

  /** 評価日時 */
  evaluatedAt: string;
}
