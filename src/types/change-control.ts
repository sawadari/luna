/**
 * Change Control Types - ChangeRequest Flow
 *
 * 全ての変更はChangeRequestを経由して正規化される。
 * これによりトレーサビリティを確保し、Rollbackを可能にする。
 */

/**
 * 変更トリガーの種類
 */
export type TriggerType =
  | 'regulation_change'              // 法規制変更
  | 'safety_or_quality_incident'     // 安全・品質インシデント
  | 'market_or_customer_shift'       // 市場・顧客の変化
  | 'key_assumption_invalidated'     // 重要な前提条件の無効化
  | 'cost_or_schedule_disruption'    // コスト・スケジュールの混乱
  | 'supplier_or_boundary_change'    // サプライヤ・境界の変更
  | 'ai_generated_contamination'     // AI生成物の混入
  | 'manual';                        // 手動変更

/**
 * 操作の種類（有限操作セット）
 */
export type OperationType =
  | 'u.split'                // 1要素を複数に分割
  | 'u.merge'                // 複数要素を統合
  | 'u.retype'               // 型の変更
  | 'u.rewire'               // 関係の付け替え
  | 'u.alias'                // 同義・別名の登録
  | 'u.normalize_id'         // ID体系への正規化
  | 'u.link_evidence'        // 根拠への参照リンク付与
  | 'u.quarantine_evidence'  // Evidenceを隔離
  | 'u.set_state'            // 成熟度状態遷移
  | 'u.create_baseline'      // ベースライン作成
  | 'u.deprecate'            // 非推奨化
  | 'u.raise_exception'      // 例外の起票
  | 'u.close_exception'      // 例外の終結
  | 'u.record_decision';     // DecisionRecordをKernelへ登録/更新

/**
 * ゲートの種類
 */
export type GateType =
  | 'gate.review'                  // レビュー
  | 'gate.po_approval'             // プロダクトオーナー承認
  | 'gate.evidence_verification'   // 証跡検証
  | 'gate.compliance_check'        // コンプライアンスチェック
  | 'gate.security_review';        // セキュリティレビュー

/**
 * ゲート結果
 */
export type GateOutcome = 'approved' | 'rejected' | 'conditional' | 'pending';

/**
 * Decision更新ルール
 */
export type DecisionUpdateRule =
  | 'must_update_decision'   // Decision更新必須
  | 'may_update_decision'    // Decision更新任意
  | 'no_decision_update';    // Decision更新不要

/**
 * ChangeRequest - 変更要求
 *
 * 全ての変更はChangeRequestとして記録される。
 * これにより変更のトレーサビリティとRollbackが可能になる。
 */
export interface ChangeRequest {
  /** CR ID (例: CR-2026-001) */
  cr_id: string;

  /** 誰が起票したか */
  raised_by: string;

  /** 起票日時 */
  raised_at: string;

  /** トリガーの種類 */
  trigger_type: TriggerType;

  /** 影響範囲（Kernel ID、Need ID、Requirement IDなど） */
  affected_scope: string[];

  /** 提案される操作のリスト */
  proposed_operations: OperationType[];

  /** Phase A3: 操作詳細（KernelOperationのpayload相当） */
  operation_details?: Array<{
    operation_type: OperationType;
    kernel_id: string;
    payload: Record<string, any>;
  }>;

  /** 必要なレビュー */
  required_reviews: GateType[];

  /** ゲート結果 */
  gate_outcome: GateOutcome;

  /** 状態遷移（例: "draft -> under_review"） */
  state_transitions?: string[];

  /** Decision更新ルール */
  decision_update_rule: DecisionUpdateRule;

  /** 証跡パックへの参照 */
  evidence_pack_refs: string[];

  /** Rollbackプランへの参照 */
  rollback_plan_ref?: string;

  /** 備考 */
  notes?: string;

  /** 実行済みフラグ */
  executed?: boolean;

  /** 実行日時 */
  executed_at?: string;

  /** Phase A3: 実行結果（op_id群） */
  execution_results?: Array<{
    operation_type: OperationType;
    op_id: string;
    success: boolean;
    error?: string;
  }>;

  /** Phase A3: Rollback用の補償操作 */
  compensating_operations?: Array<{
    original_op_id: string;
    compensating_op_id: string;
    operation_type: OperationType;
  }>;
}

/**
 * DisturbanceToCRRule - 外乱からCRへの変換ルール
 */
export interface DisturbanceToCRRule {
  trigger_type: TriggerType;
  default_proposed_operations: OperationType[];
  required_reviews: GateType[];
  decision_update_rule: DecisionUpdateRule;
}

/**
 * ChangeRequestRegistry - CRレジストリ
 */
export interface ChangeRequestRegistry {
  changeRequests: ChangeRequest[];
  version: string;
  lastUpdated: string;
}
