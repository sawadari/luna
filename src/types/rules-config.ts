/**
 * Rules Configuration Types
 *
 * 人間-AI責任分界ルール設定の型定義
 * ⚠️ IMPORTANT: この型定義は rules-config.yaml の構造と100%一致する必要があります
 */

// =============================================================================
// Meta Information
// =============================================================================

export interface RulesConfigMeta {
  version: string;
  last_updated: string;
  last_updated_by: string;
  description: string;
  author?: string;  // Optional: YAML has author field
}

// =============================================================================
// Human-AI Responsibility Boundary Rules
// =============================================================================

// AL (Appropriateness Level) 閾値
export interface ALThreshold {
  block_below: string;        // "AL0"
  require_approval: string;   // "AL1"
  auto_proceed: string;       // "AL2"
}

// Phase 0: DEST Judgment
export interface DESTJudgmentRules {
  enabled: boolean;
  rationale: string;
  al_threshold: ALThreshold;
  auto_label: boolean;  // AL判定結果を自動的にIssueラベルに反映
}

// CrePS Gates設定
export interface CREPSGates {
  enabled: boolean;
  threshold: number;      // 70点以下は人間レビュー必要
  auto_advance: boolean;  // Gate通過時も人間確認を要求
}

// Assumption Tracking設定
export interface AssumptionTrackingRules {
  enabled: boolean;
  rationale: string;
}

// Phase 1: Planning Layer
export interface PlanningLayerRules {
  enabled: boolean;
  rationale: string;
  creps_gates: CREPSGates;
  assumption_tracking: AssumptionTrackingRules;
}

// AI抽出設定
export interface AIExtractionRules {
  enabled: boolean;
  model: string;                     // "claude-sonnet-4.5"
  fallback_to_template: boolean;
  confidence_threshold: number;      // 信頼度70%以上でのみ自動生成
}

// Convergence監視設定
export interface ConvergenceMonitoringRules {
  enabled: boolean;
  threshold: number;         // 収束率70%以下でアラート
  check_interval: string;    // "weekly"
}

// Enhancement Service設定
export interface EnhancementServiceRules {
  enabled: boolean;
  rationale: string;
}

// Phase 2: Kernel Generation
export interface KernelGenerationRules {
  enabled: boolean;
  auto_extract_nrvv: boolean;
  rationale: string;
  ai_extraction: AIExtractionRules;
  convergence_monitoring: ConvergenceMonitoringRules;
  enhancement_service: EnhancementServiceRules;
}

// Phase 3-5: Code Generation
export interface CodeGenerationRules {
  enabled: boolean;
  rationale: string;
  quality_threshold: number;       // 80点以上で合格
  generate_tests: boolean;
  test_coverage_target: number;    // カバレッジ80%を目標
  ai_model: string;                // "claude-sonnet-4.5"
}

// Code Review設定
export interface ReviewRequiredRules {
  enabled: boolean;
  rationale: string;
  min_quality_score: number;
  require_human_approval: boolean;
  automated_checks: string[];  // ["lint", "type_check", "security_scan"]
}

// Phase 6-7: Verification & Validation
export interface AutoVerificationRules {
  enabled: boolean;
  rationale: string;
  run_on_commit: boolean;
  fail_on_coverage_drop: boolean;
  coverage_threshold: number;
  auto_add_to_kernel: boolean;  // テスト成功時に Verification を Kernel に自動記録
}

export interface AutoValidationRules {
  enabled: boolean;
  rationale: string;
  require_human_sign_off: boolean;
}

// Phase 8: Monitoring & Deployment
export interface ContinuousMonitoringRules {
  enabled: boolean;
  alert_to_human: boolean;
  rationale: string;
  alert_channels: string[];  // ["github_issue", "log"]
}

export interface EnvironmentDeploymentConfig {
  enabled: boolean;
  require_approval: boolean;
}

export interface AutoDeploymentRules {
  enabled: boolean;
  rationale: string;
  environments: {
    dev: EnvironmentDeploymentConfig;
    staging: EnvironmentDeploymentConfig;
    production: EnvironmentDeploymentConfig;
  };
}

// 人間-AI責任分界
export interface HumanAIBoundary {
  dest_judgment: DESTJudgmentRules;
  planning_layer: PlanningLayerRules;
  kernel_generation: KernelGenerationRules;
  code_generation: CodeGenerationRules;
  review_required: ReviewRequiredRules;
  auto_verification: AutoVerificationRules;
  auto_validation: AutoValidationRules;
  continuous_monitoring: ContinuousMonitoringRules;
  auto_deployment: AutoDeploymentRules;
}

// =============================================================================
// Organization-specific Rules
// =============================================================================

export interface BranchStrategyConfig {
  main_branch: string;
  require_pull_request: boolean;
  require_reviews: number;
  require_ci_pass: boolean;
}

export interface OrganizationRules {
  max_issue_complexity: string;     // "small" | "medium" | "large" | "xlarge"
  require_approval_for: string[];
  forbidden_operations: string[];
  branch_strategy: BranchStrategyConfig;
}

// =============================================================================
// Individual-specific Preferences
// =============================================================================

export interface IndividualPreferences {
  verbose_logging: boolean;
  dry_run_default: boolean;
  notification_level: string;       // "all" | "important" | "critical"
  ai_assistance_level: string;      // "minimal" | "balanced" | "maximal"
  auto_comment_on_pr: boolean;
  auto_comment_on_issue: boolean;
}

// =============================================================================
// Core Architecture Rules
// =============================================================================

export interface KernelRuntimeConfig {
  default_registry_path: string;
  default_ledger_path: string;
  solo_mode_default: boolean;
  enable_ledger_default: boolean;
}

export interface IssueEnforcementConfig {
  enforce_issue_required: boolean;
  rationale: string;
}

export interface BootstrapProtectionConfig {
  enforce_bootstrap_protection: boolean;
  rationale: string;
}

export interface AL0GateConfig {
  enabled: boolean;
  rationale: string;
}

export interface CoreArchitecture {
  kernel_runtime: KernelRuntimeConfig;
  issue_enforcement: IssueEnforcementConfig;
  bootstrap_protection: BootstrapProtectionConfig;
  al0_gate: AL0GateConfig;
}

// =============================================================================
// Change History
// =============================================================================

export interface ChangeHistoryEntry {
  timestamp: string;
  changed_by: string;
  rule: string;
  old_value: any;
  new_value: any;
  rationale: string;
}

// =============================================================================
// Root Configuration
// =============================================================================

export interface RulesConfig {
  meta: RulesConfigMeta;
  human_ai_boundary: HumanAIBoundary;
  organization_rules: OrganizationRules;
  individual_preferences: IndividualPreferences;
  core_architecture: CoreArchitecture;
  change_history: ChangeHistoryEntry[];
}

// =============================================================================
// Validation Result
// =============================================================================

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ValidationError {
  path: string;
  message: string;
  value: any;
}

export interface ValidationWarning {
  path: string;
  message: string;
  suggestion: string;
}

// =============================================================================
// Rule Get Options
// =============================================================================

export interface RuleGetOptions {
  fallbackToEnv?: boolean;  // 環境変数へのフォールバック
  useDefault?: boolean;      // デフォルト値の使用
}
