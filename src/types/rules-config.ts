/**
 * Rules Configuration Types
 *
 * 人間-AI責任分界ルール設定の型定義
 */

// Meta情報
export interface RulesConfigMeta {
  version: string;
  last_updated: string;
  last_updated_by: string;
  description: string;
}

// AL (Appropriateness Level) 閾値
export interface ALThreshold {
  block_below: 'AL0' | 'AL1' | 'AL2' | 'AL3' | 'AL4';
  require_approval: 'AL0' | 'AL1' | 'AL2' | 'AL3' | 'AL4';
  auto_proceed: 'AL0' | 'AL1' | 'AL2' | 'AL3' | 'AL4';
}

// DEST分析設定
export interface DESTAnalysis {
  destination: boolean;
  effectiveness: boolean;
  safety: boolean;
  traceability: boolean;
}

// Phase 0: DEST Judgment
export interface DESTJudgmentRules {
  enabled: boolean;
  rationale: string;
  al_threshold: ALThreshold;
  dest_analysis: DESTAnalysis;
}

// CREPS Gates設定
export interface CREPSGates {
  enabled: boolean;
  threshold: number;
  completeness: boolean;
  relevance: boolean;
  evidence: boolean;
  prioritization: boolean;
  synergy: boolean;
}

// DecisionRecord設定
export interface DecisionRecordRules {
  auto_generate: boolean;
  require_human_approval: boolean;
}

// Phase 1: Planning Layer
export interface PlanningLayerRules {
  enabled: boolean;
  rationale: string;
  creps_gates: CREPSGates;
  decision_record: DecisionRecordRules;
}

// AI抽出設定
export interface AIExtractionRules {
  enabled: boolean;
  fallback_to_template: boolean;
  rationale: string;
}

// 自動補完設定
export interface AutoCompletionRules {
  enabled: boolean;
  rationale: string;
}

// Convergence監視設定
export interface ConvergenceMonitoringRules {
  enabled: boolean;
  threshold: number;
  weekly_check: boolean;
  rationale: string;
}

// Maturity遷移設定
export interface MaturityTransitionRules {
  auto_promote: boolean;
  require_approval: string[];
  rationale: string;
}

// Phase 2: Kernel Generation
export interface KernelGenerationRules {
  enabled: boolean;
  rationale: string;
  ai_extraction: AIExtractionRules;
  auto_completion: AutoCompletionRules;
  convergence_monitoring: ConvergenceMonitoringRules;
  maturity_transition: MaturityTransitionRules;
}

// Critical Path分析設定
export interface CriticalPathAnalysis {
  enabled: boolean;
  algorithm: string;
}

// 並列実行設定
export interface ParallelExecutionRules {
  enabled: boolean;
  max_parallel_tasks: number;
}

// Phase 3: Task Decomposition
export interface TaskDecompositionRules {
  enabled: boolean;
  rationale: string;
  critical_path_analysis: CriticalPathAnalysis;
  parallel_execution: ParallelExecutionRules;
}

// Phase 4-5: Code Generation
export interface CodeGenerationRules {
  enabled: boolean;
  rationale: string;
  ai_model: string;
  quality_threshold: number;
  generate_tests: boolean;
  test_coverage_target: number;
}

// Code Review設定
export interface ReviewRequiredRules {
  enabled: boolean;
  rationale: string;
  static_analysis: boolean;
  security_scan: boolean;
  min_quality_score: number;
}

// Phase 6-7: Verification & Validation
export interface AutoVerificationRules {
  enabled: boolean;
  rationale: string;
  auto_run_tests: boolean;
  auto_add_to_kernel: boolean;
}

// アラート設定
export interface AlertToHuman {
  enabled: boolean;
  severity_threshold: 'info' | 'warning' | 'error' | 'critical';
}

// Phase 8: Monitoring
export interface ContinuousMonitoringRules {
  enabled: boolean;
  rationale: string;
  collect_metrics: boolean;
  health_check_interval: number;
  alert_to_human: AlertToHuman;
}

// Phase 9: Self-Improvement
export interface SelfImprovementRules {
  enabled: boolean;
  rationale: string;
  auto_update_kernel: boolean;
  require_human_approval: boolean;
  accumulate_knowledge: boolean;
}

// 人間-AI責任分界
export interface HumanAIBoundary {
  dest_judgment: DESTJudgmentRules;
  planning_layer: PlanningLayerRules;
  kernel_generation: KernelGenerationRules;
  task_decomposition: TaskDecompositionRules;
  code_generation: CodeGenerationRules;
  review_required: ReviewRequiredRules;
  auto_verification: AutoVerificationRules;
  continuous_monitoring: ContinuousMonitoringRules;
  self_improvement: SelfImprovementRules;
}

// 自動実行制限
export interface AutoExecutionLimits {
  max_files_generated: number;
  max_lines_per_file: number;
  max_deployment_environments: number;
}

// セキュリティポリシー
export interface SecurityPolicy {
  scan_dependencies: boolean;
  check_vulnerabilities: boolean;
  require_security_review: boolean;
}

// 組織ルール
export interface OrganizationRules {
  max_issue_complexity: 'small' | 'medium' | 'large' | 'xlarge';
  require_approval_for: string[];
  auto_execution_limits: AutoExecutionLimits;
  security_policy: SecurityPolicy;
}

// 個人設定
export interface IndividualPreferences {
  verbose_logging: boolean;
  dry_run_default: boolean;
  notification_level: 'all' | 'important' | 'critical';
  language: 'ja' | 'en';
}

// 変更履歴エントリ
export interface ChangeHistoryEntry {
  timestamp: string;
  changed_by: string;
  rule: string;
  old_value: any;
  new_value: any;
  rationale: string;
}

// ルール設定全体
export interface RulesConfig {
  meta: RulesConfigMeta;
  human_ai_boundary: HumanAIBoundary;
  organization_rules: OrganizationRules;
  individual_preferences: IndividualPreferences;
  change_history: ChangeHistoryEntry[];
}

// バリデーション結果
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

// ルール取得オプション
export interface RuleGetOptions {
  fallbackToEnv?: boolean;  // 環境変数へのフォールバック
  useDefault?: boolean;      // デフォルト値の使用
}
