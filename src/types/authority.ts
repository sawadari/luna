/**
 * Authority Types - Role-Based State Transition Control
 *
 * 識学理論（Shikigaku Theory）準拠の責任・権限モデル
 */

/**
 * Role - 組織内のロール
 */
export type Role =
  | 'product_owner' // 価値裁定、Decision承認、例外承認、Baseline化
  | 'engineering_lead' // 技術評価、実装判断、アーキテクチャ決定
  | 'ssot_reviewer' // 整合性検証、状態遷移承認、トレーサビリティ確認
  | 'compliance_owner' // 法規評価、安全性評価、監査対応
  | 'security_owner' // セキュリティ評価、脆弱性対応
  | 'author'; // コンテンツ作成者

/**
 * Maturity Level (再掲)
 */
export type MaturityLevel = 'draft' | 'under_review' | 'agreed' | 'frozen' | 'deprecated';

/**
 * User Role - ユーザーとロールのマッピング
 */
export interface UserRole {
  /** ユーザーID */
  userId: string;

  /** 割り当てられたロールリスト */
  roles: Role[];

  /** 割り当て日時 */
  assignedAt: string;

  /** 割り当て者 */
  assignedBy: string;

  /** 備考 */
  notes?: string;
}

/**
 * State Transition Rule - 状態遷移ルール
 */
export interface StateTransitionRule {
  /** 遷移元の状態（'*' は全ての状態を表す） */
  from: MaturityLevel | '*';

  /** 遷移先の状態 */
  to: MaturityLevel;

  /** 許可されたロールリスト */
  allowedRoles: Role[];

  /** ルールの説明 */
  description: string;
}

/**
 * Transition History - 状態遷移履歴
 */
export interface TransitionHistory {
  /** 遷移元の状態 */
  from: MaturityLevel;

  /** 遷移先の状態 */
  to: MaturityLevel;

  /** 変更日時 */
  changedAt: string;

  /** 変更者（ユーザーID） */
  changedBy: string;

  /** 変更者のロール */
  changedByRole: Role;

  /** 変更理由（オプション） */
  reason?: string;
}

/**
 * Transition Request - 状態遷移リクエスト
 */
export interface TransitionRequest {
  /** 対象のリソースID（Kernel ID など） */
  resourceId: string;

  /** 遷移元の状態 */
  from: MaturityLevel;

  /** 遷移先の状態 */
  to: MaturityLevel;

  /** リクエスト者（ユーザーID） */
  requestedBy: string;

  /** リクエスト者のロール */
  requestedByRole: Role;

  /** 変更理由（オプション） */
  reason?: string;
}

/**
 * Transition Result - 状態遷移結果
 */
export interface TransitionResult {
  /** 成功フラグ */
  success: boolean;

  /** 許可されたか */
  allowed: boolean;

  /** エラーメッセージ（失敗時） */
  error?: string;

  /** 遷移履歴（成功時） */
  history?: TransitionHistory;
}

/**
 * Role Assignment Registry - ロール割り当てレジストリ
 */
export interface RoleAssignmentRegistry {
  /** ユーザーロール一覧 */
  userRoles: UserRole[];

  /** バージョン */
  version: string;

  /** 最終更新日時 */
  lastUpdated: string;
}

/**
 * Responsibility - 責任
 */
export interface Responsibility {
  /** ロール */
  role: Role;

  /** 責任リスト */
  responsibilities: string[];

  /** 説明 */
  description: string;
}
