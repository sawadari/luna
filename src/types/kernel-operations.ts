/**
 * Kernel Operations Types
 *
 * Phase A1: Kernel Runtime一本化のための操作型定義
 * すべてのKernel変更は u.* 操作として標準化される
 */

import { MaturityLevel, Verification, Validation } from './nrvv';
import { Role } from './authority';

/**
 * Operation Type - 操作種別
 */
export type OperationType =
  | 'u.create_kernel'
  | 'u.record_decision'
  | 'u.link_evidence'
  | 'u.record_verification'
  | 'u.record_validation'
  | 'u.set_state'
  | 'u.raise_exception'
  | 'u.close_exception';

/**
 * Base Operation - 基本操作インターフェース
 */
export interface BaseOperation {
  /** 操作種別 */
  op: OperationType;

  /** 操作ID（自動生成） */
  op_id?: string;

  /** 実行者（ユーザーID） */
  actor: string;

  /** 実行者のロール */
  actor_role?: Role;

  /** 関連するIssue番号（必須） */
  issue: string;

  /** タイムスタンプ（自動生成） */
  timestamp?: string;
}

/**
 * Create Kernel Operation
 * 新しいKernelを作成する操作
 */
export interface CreateKernelOperation extends BaseOperation {
  op: 'u.create_kernel';
  payload: {
    kernel_id: string;
    statement: string;
    category: string;
    owner: string;
    maturity?: MaturityLevel;
    sourceIssue?: string;
    needs?: Array<{
      id: string;
      statement: string;
      stakeholder: string;
      sourceType: string;
      priority: string;
      rationale: string;
      traceability?: {
        upstream: string[];
        downstream: string[];
      };
    }>;
    requirements?: Array<{
      id: string;
      statement: string;
      type: string;
      priority: string;
      rationale?: string;
      acceptanceCriteria?: string[];
      traceability?: {
        upstream: string[];
        downstream: string[];
      };
    }>;
    verification?: Array<{
      id: string;
      statement: string;
      method: string;
      testCase?: string;
      criteria?: string[];
      traceability?: {
        upstream: string[];
        downstream: string[];
      };
      status?: string;
      verifiedAt?: string | null;
      verifiedBy?: string | null;
    }>;
    validation?: Array<{
      id: string;
      statement: string;
      method: string;
      criteria?: string[];
      traceability?: {
        upstream: string[];
        downstream: string[];
      };
      status?: string;
      validatedAt?: string | null;
      validatedBy?: string | null;
    }>;
    tags?: string[];
    relatedArtifacts?: Array<{
      type: string;
      path: string;
    }>;
  };
}

/**
 * Record Decision Operation
 * Decisionを記録する操作
 */
export interface RecordDecisionOperation extends BaseOperation {
  op: 'u.record_decision';
  payload: {
    kernel_id: string;
    decision_id: string;
    decision_type: string;
    decided_by: string;
    rationale: string;
    falsification_conditions?: string[];
    assurance_level?: 'AL0' | 'AL1' | 'AL2' | 'AL3';
  };
}

/**
 * Link Evidence Operation
 * Evidenceをリンクする操作
 */
export interface LinkEvidenceOperation extends BaseOperation {
  op: 'u.link_evidence';
  payload: {
    kernel_id: string;
    evidence_type: 'test_result' | 'observation' | 'document' | 'artifact';
    evidence_id: string;
    evidence_source: string;
    verification_status?: 'passed' | 'failed' | 'pending';
  };
}

/**
 * Record Verification Operation
 * Verificationを記録する操作（Issue #48）
 */
export interface RecordVerificationOperation extends BaseOperation {
  op: 'u.record_verification';
  payload: {
    kernel_id: string;
    verification: Verification;
  };
}

/**
 * Record Validation Operation
 * Validationを記録する操作（Issue #48）
 */
export interface RecordValidationOperation extends BaseOperation {
  op: 'u.record_validation';
  payload: {
    kernel_id: string;
    validation: Validation;
  };
}

/**
 * Set State Operation
 * Kernel状態を遷移させる操作（Authority + Gate統合）
 */
export interface SetStateOperation extends BaseOperation {
  op: 'u.set_state';
  payload: {
    kernel_id: string;
    from: MaturityLevel;
    to: MaturityLevel;
    reason?: string;
    gate_checks?: {
      nrvv_complete: boolean;
      evidence_sufficient: boolean;
      no_blocking_exceptions: boolean;
    };
  };
}

/**
 * Raise Exception Operation
 * 例外（ブロッカー）を発生させる操作
 */
export interface RaiseExceptionOperation extends BaseOperation {
  op: 'u.raise_exception';
  payload: {
    kernel_id: string;
    exception_type: 'blocker' | 'risk' | 'warning';
    severity: 'critical' | 'high' | 'medium' | 'low';
    description: string;
    resolution_strategy?: string;
  };
}

/**
 * Close Exception Operation
 * 例外をクローズする操作
 */
export interface CloseExceptionOperation extends BaseOperation {
  op: 'u.close_exception';
  payload: {
    kernel_id: string;
    exception_id: string;
    resolution: string;
    resolved_by: string;
  };
}

/**
 * Union type for all operations
 */
export type KernelOperation =
  | CreateKernelOperation
  | RecordDecisionOperation
  | LinkEvidenceOperation
  | RecordVerificationOperation
  | RecordValidationOperation
  | SetStateOperation
  | RaiseExceptionOperation
  | CloseExceptionOperation;

/**
 * Operation Result - 操作実行結果
 */
export interface OperationResult {
  /** 成功フラグ */
  success: boolean;

  /** 操作ID */
  op_id: string;

  /** 実行タイムスタンプ */
  timestamp: string;

  /** エラーメッセージ（失敗時） */
  error?: string;

  /** 詳細情報 */
  details?: Record<string, unknown>;
}

/**
 * Gate Check Result - Gate判定結果
 */
export interface GateCheckResult {
  /** Gate通過可否 */
  allowed: boolean;

  /** チェック項目と結果 */
  checks: {
    [key: string]: {
      passed: boolean;
      message?: string;
    };
  };

  /** 総合メッセージ */
  message?: string;
}
