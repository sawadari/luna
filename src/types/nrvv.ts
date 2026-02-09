/**
 * NRVV (Needs-Requirements-Verification-Validation) Type Definitions
 * ISO/IEC/IEEE 15288 準拠
 */

import { TransitionHistory } from './authority';

// =============================================================================
// Traceability Types
// =============================================================================

export interface Traceability {
  upstream: string[];   // 上位要素への参照
  downstream: string[]; // 下位要素への参照
}

// =============================================================================
// N: Needs（ニーズ）
// =============================================================================

export type StakeholderRole =
  | 'ProductOwner'
  | 'TechLead'
  | 'CISO'
  | 'Customer'
  | 'EndUser'
  | 'Regulator';

export type NeedSourceType =
  | 'stakeholder_requirement'
  | 'business_requirement'
  | 'regulatory_requirement'
  | 'market_analysis'
  | 'user_feedback';

export type NeedPriority =
  | 'critical'
  | 'high'
  | 'medium'
  | 'low';

export interface Need {
  id: string;
  statement: string;
  stakeholder: StakeholderRole;
  sourceType: NeedSourceType;
  priority: NeedPriority;
  traceability: Traceability;
  rationale?: string;
  constraints?: string[];
}

// =============================================================================
// R: Requirements（要求）
// =============================================================================

export type RequirementType =
  | 'functional'
  | 'non-functional'
  | 'performance'
  | 'security'
  | 'usability'
  | 'reliability'
  | 'maintainability';

export type RequirementPriority =
  | 'must'      // 必須
  | 'should'    // 推奨
  | 'could'     // 可能であれば
  | 'wont';     // 今回は対象外

export interface Requirement {
  id: string;
  statement: string;
  type: RequirementType;
  priority: RequirementPriority;
  rationale: string;
  traceability: Traceability;
  constraints?: string[];
  acceptanceCriteria?: string[];
}

// =============================================================================
// V: Verification（検証）
// =============================================================================

export type VerificationMethod =
  | 'test'              // テスト
  | 'analysis'          // 分析
  | 'inspection'        // インスペクション
  | 'demonstration';    // デモンストレーション

export type VerificationStatus =
  | 'not_started'
  | 'in_progress'
  | 'passed'
  | 'failed'
  | 'blocked';

export interface VerificationCriteria {
  description: string;
  expectedResult?: string;
  measurableMetric?: string;
}

export interface VerificationEvidence {
  type: 'test_result' | 'analysis_report' | 'inspection_log' | 'tool_output';
  path: string;
  hash?: string;      // ファイルのハッシュ値（改ざん防止）
  createdAt?: string;
}

export interface Verification {
  id: string;
  statement: string;
  method: VerificationMethod;
  testCase?: string;
  criteria: string[] | VerificationCriteria[];
  traceability: Traceability;
  status: VerificationStatus;
  verifiedAt?: string;
  verifiedBy?: string;
  evidence?: VerificationEvidence[];
  notes?: string;
}

// =============================================================================
// V: Validation（妥当性確認）
// =============================================================================

export type ValidationMethod =
  | 'acceptance_test'       // 受け入れテスト
  | 'user_trial'            // ユーザートライアル
  | 'field_test'            // フィールドテスト
  | 'audit'                 // 監査
  | 'stakeholder_review';   // 利害関係者レビュー

export type ValidationStatus =
  | 'not_started'
  | 'in_progress'
  | 'passed'
  | 'failed'
  | 'blocked';

export interface ValidationCriteria {
  description: string;
  successIndicator?: string;
}

export interface ValidationEvidence {
  type: 'user_feedback' | 'audit_report' | 'field_data' | 'acceptance_certificate';
  path: string;
  hash?: string;
  createdAt?: string;
}

export interface Validation {
  id: string;
  statement: string;
  method: ValidationMethod;
  criteria: string[] | ValidationCriteria[];
  traceability: Traceability;
  status: ValidationStatus;
  validatedAt?: string;
  validatedBy?: string;
  evidence?: ValidationEvidence[];
  notes?: string;
}

// =============================================================================
// Kernel with NRVV
// =============================================================================

export type KernelCategory =
  | 'architecture'
  | 'requirement'
  | 'constraint'
  | 'interface'
  | 'quality'
  | 'security';

export type MaturityLevel =
  | 'draft'
  | 'under_review'
  | 'agreed'
  | 'frozen'
  | 'deprecated';

export interface KernelHistory {
  timestamp: string;
  action: string;
  by: string;
  maturity?: MaturityLevel;
  notes?: string;
  // Phase A1: Kernel Runtime統合
  op?: string; // u.*操作種別
  actor?: string; // 実行者（byと同じだが、Runtimeでは標準化）
  issue?: string; // 関連Issue
  summary?: string; // 操作サマリー
}

export interface RelatedArtifact {
  type: 'code' | 'test' | 'documentation' | 'model' | 'data';
  path: string;
  description: string;
}

export interface KernelWithNRVV {
  id: string;

  // Basic Metadata
  statement: string;
  category: KernelCategory;
  owner: string;
  maturity: MaturityLevel;

  // Timestamps
  createdAt: string;
  lastUpdatedAt: string;
  approvedAt?: string;
  approvedBy?: string;
  frozenAt?: string;
  deprecatedAt?: string;

  // Source Traceability
  sourceIssue?: string;
  sourceDecisionRecord?: string;
  sourcePR?: string;

  // ✨ NEW: DEST Judgment Integration (Phase 0)
  linked_dest_judgment?: string; // DEST Judgment ID
  assurance_level?: string; // AL0/AL1/AL2

  // NRVV Traceability
  needs: Need[];
  requirements: Requirement[];
  verification: Verification[];
  validation: Validation[];

  // History
  history: KernelHistory[];

  // ✨ NEW: Maturity State Transition History (Phase 1)
  maturityHistory?: TransitionHistory[];

  // Related Artifacts
  relatedArtifacts?: RelatedArtifact[];

  // Tags & Labels
  tags?: string[];
  labels?: string[];

  // Phase A1: Kernel Runtime統合
  decision?: {
    decision_id: string;
    decision_type: string;
    decided_by: string;
    rationale: string;
    falsification_conditions?: string[];
    linked_issue?: string;
    assurance_level?: 'AL0' | 'AL1' | 'AL2' | 'AL3';
  };
  evidence?: Array<{
    id: string;
    type: 'test_result' | 'observation' | 'document' | 'artifact';
    source: string;
    source_type: string;
    source_origin?: 'human' | 'ai' | 'hybrid'; // Issue #49: Evidence Governance
    collected_at: string;
    verification_status?: 'passed' | 'failed' | 'pending' | 'verified'; // Issue #49: Added 'verified'
  }>;
  exceptions?: Array<{
    id: string;
    type: 'blocker' | 'risk' | 'warning';
    severity: 'critical' | 'high' | 'medium' | 'low';
    description: string;
    raised_at: string;
    raised_by: string;
    status: 'open' | 'closed';
    resolution?: string;
    resolved_at?: string;
    resolved_by?: string;
  }>;
}

// =============================================================================
// Kernel Registry
// =============================================================================

export interface KernelRegistryMeta {
  registry_version: string;
  last_updated: string;
  last_updated_by: string;
  schema_version: string;
  description: string;
}

export interface KernelIndices {
  by_maturity: Record<MaturityLevel, string[]>;
  by_category: Record<KernelCategory, string[]>;
  by_owner: Record<string, string[]>;
  by_tag: Record<string, string[]>;
}

export interface KernelStatistics {
  total_kernels: number;
  by_maturity: Record<MaturityLevel, number>;
  convergence_rate: number;
  last_computed: string;
}

export interface KernelRegistry {
  meta: KernelRegistryMeta;
  kernels: Record<string, KernelWithNRVV>;
  indices: KernelIndices;
  statistics: KernelStatistics;
}

// =============================================================================
// NRVV Validation Results
// =============================================================================

export interface NRVVValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  traceabilityComplete: boolean;
  missingLinks: Array<{
    from: string;
    to: string;
    type: 'need-to-requirement' | 'requirement-to-verification' | 'requirement-to-validation';
  }>;
}

// =============================================================================
// Traceability Matrix
// =============================================================================

export interface TraceabilityMatrixEntry {
  needId: string;
  requirementIds: string[];
  verificationIds: string[];
  validationIds: string[];
  complete: boolean;
}

export type TraceabilityMatrix = TraceabilityMatrixEntry[];
