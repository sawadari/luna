/**
 * DEST Theory Type Definitions
 */

// =============================================================================
// Assurance Level (AL)
// =============================================================================

export type AL = 'AL0' | 'AL1' | 'AL2';

export type ALLabel =
  | 'AL:AL0-NotAssured'
  | 'AL:AL1-Qualified'
  | 'AL:AL2-Assured';

// =============================================================================
// AL0 Reasons (R01-R11)
// =============================================================================

export type AL0Reason =
  | 'R01-BadPositiveFeedback'
  | 'R02-DelayIgnored'
  | 'R03-NegativeFBWeakened'
  | 'R04-RepetitiveIntervention'
  | 'R05-ObservationFailure'
  | 'R06-WrongObservable'
  | 'R07-ParameterOnlyFix'
  | 'R08-DelayMismatch'
  | 'R09-GoalStructureConflict'
  | 'R10-ParadigmBlindness'
  | 'R11-SafetyViolation';

export type AL0ReasonLabel = `AL0:${AL0Reason}`;

// =============================================================================
// Protocol (P0-P4)
// =============================================================================

export type Protocol =
  | 'P0-StopAmplification'
  | 'P1-FixObservation'
  | 'P2-AlignDelay'
  | 'P3-RaiseLeverage'
  | 'P4-Escalate';

export type ProtocolLabel = `Protocol:${Protocol}`;

// =============================================================================
// Safety Check (C1-C4)
// =============================================================================

export type SafetyCheck =
  | 'C1-PositiveFB'
  | 'C2-DelayOscillation'
  | 'C3-NegativeFB'
  | 'C4-LowLeverage';

export type SafetyCheckLabel = `SafetyCheck:${SafetyCheck}`;

// =============================================================================
// Leverage Point (LP1-LP12)
// =============================================================================

export type LeveragePoint =
  | 'LP1-Transcend'
  | 'LP2-Paradigm'
  | 'LP3-Goal'
  | 'LP4-SelfOrganize'
  | 'LP5-Rules'
  | 'LP6-InfoFlow'
  | 'LP7-PositiveFB'
  | 'LP8-NegativeFB'
  | 'LP9-Delay'
  | 'LP10-StockFlow'
  | 'LP11-Buffer'
  | 'LP12-Parameter';

export type LeveragePointLabel = `LP:${LeveragePoint}`;

// =============================================================================
// Issue/PR Types
// =============================================================================

export interface GitHubLabel {
  name: string;
  color: string;
  description?: string;
}

export interface GitHubIssue {
  number: number;
  title: string;
  body: string | null;
  labels: GitHubLabel[];
  state: 'open' | 'closed';
  created_at: string;
  updated_at: string;
}

export interface GitHubPullRequest extends GitHubIssue {
  merged: boolean;
  draft: boolean;
}

// =============================================================================
// Outcome/Safety Assessment
// =============================================================================

export type ProgressStatus = 'improving' | 'stable' | 'degrading' | 'unknown';
export type FeedbackStatus = 'stable' | 'oscillating' | 'amplifying' | 'unknown';

export interface OutcomeAssessment {
  currentState: string;
  targetState: string;
  progress: ProgressStatus;
  outcomeOk: boolean;
}

export interface SafetyAssessment {
  feedbackLoops: FeedbackStatus;
  safetyConstraints: string[];
  violations: string[];
  safetyOk: boolean;
}

// =============================================================================
// DEST Judgment Result
// =============================================================================

export interface DESTJudgmentResult {
  judgmentId: string;
  issueNumber: number;
  judgedAt: string;
  judgedBy: 'DESTAgent';

  // Core judgment
  al: AL;
  outcomeOk: boolean;
  safetyOk: boolean;

  // AL0 analysis
  al0Reasons: AL0Reason[];
  protocol: Protocol | null;

  // Additional context
  safetyChecks: SafetyCheck[];
  leveragePoints: LeveragePoint[];

  // Explanation
  rationale: string;
  nextActions: string[];
  escalation: string | null;

  // Labels to apply
  labels: string[];
}

// =============================================================================
// Agent Base Types
// =============================================================================

export interface AgentConfig {
  githubToken: string;
  anthropicApiKey?: string;
  repository: string; // "owner/repo"
  dryRun?: boolean;
  verbose?: boolean;
}

export interface AgentResult<T = any> {
  status: 'success' | 'error' | 'blocked';
  data?: T;
  error?: Error;
  metrics: {
    durationMs: number;
    timestamp: string;
  };
}

export interface Task {
  issue: GitHubIssue;
  type?: string;
  priority?: string;
}

// =============================================================================
// Detection Pattern Types
// =============================================================================

export interface AL0ReasonPattern {
  reason: AL0Reason;
  keywords: string[];
  patterns: RegExp[];
  priority: 'critical' | 'high' | 'medium' | 'low';
}

export interface ProtocolMapping {
  reasons: AL0Reason[];
  protocol: Protocol;
  escalationLevel: 'guardian' | 'techlead' | 'ciso' | 'none';
}

// =============================================================================
// CrePS (Creative Problem Solving) Types
// =============================================================================

// CrePS Box (B1-B6)
export type CrePSBox =
  | 'B1-RealProblem'
  | 'B2-DefinedProblem'
  | 'B3-SolutionIdeas'
  | 'B4-DevelopedSolution'
  | 'B5-ImplementedSolution'
  | 'B6-AcceptedSolution';

export type CrePSBoxLabel = `Box:${CrePSBox}`;

// CrePS Gate (G1-G6)
export type CrePSGate =
  | 'G1-Understanding'
  | 'G2-ProblemDef'
  | 'G3-IdeaSelection'
  | 'G4-Development'
  | 'G5-Implementation'
  | 'G6-Acceptance';

export type CrePSGateLabel = `Gate:${CrePSGate}`;

// Gate Judgment Result
export type GateJudgmentResult = 'pass' | 'fail' | 'conditional';

export interface GateJudgment {
  result: GateJudgmentResult;
  gate: CrePSGate;
  reason: string;
  nextBox?: CrePSBox;
  requiredActions?: string[];
  improvements?: string[];
  requiresApproval?: 'TechLead' | 'Guardian';
  timestamp: string;
}

// Box Transition
export interface BoxTransition {
  fromBox: CrePSBox | null;
  toBox: CrePSBox;
  gate: CrePSGate;
  gateJudgment: GateJudgment;
  transitionedAt: string;
  transitionedBy: 'BoxNavigatorAgent';
}

// Box State
export interface BoxState {
  currentBox: CrePSBox;
  enteredAt: string;
  dwellTimeHours: number;
  warningThresholdHours: number;
  escalationThresholdHours: number;
  isOverWarning: boolean;
  isOverEscalation: boolean;
}

// Box-State Mapping
export type MiyabiState =
  | 'pending'
  | 'analyzing'
  | 'implementing'
  | 'reviewing'
  | 'testing'
  | 'deploying'
  | 'blocked'
  | 'done';

export interface BoxStateMapping {
  state: MiyabiState;
  box: CrePSBox;
  description: string;
}

// Box Navigation Result
export interface BoxNavigationResult {
  issueNumber: number;
  previousBox: CrePSBox | null;
  currentBox: CrePSBox;
  boxState: BoxState;
  gateJudgment?: GateJudgment;
  transitionOccurred: boolean;
  alertIssued: boolean;
  comments: string[];
}

// Gate Checker Function Type
export type GateChecker = (issue: GitHubIssue) => Promise<GateJudgment>;

// SMART Criteria Score
export interface SMARTScore {
  specific: boolean;
  measurable: boolean;
  achievable: boolean;
  relevant: boolean;
  timeBound: boolean;
  totalScore: number; // 0-5
}

// =============================================================================
// Planning Layer Types (Phase 3)
// =============================================================================

// Decision Types
export type DecisionType = 'adopt' | 'defer' | 'reject' | 'explore';
export type DecisionLabel = `Decision:${Capitalize<DecisionType>}`;

// Constraint Types
export type ConstraintType = 'hard' | 'soft';
export type ConstraintLabel = `Constraint:${Capitalize<ConstraintType>}`;

// Assumption Status
export type AssumptionStatus = 'active' | 'invalidated';
export type AssumptionLabel = `Assumption:${Capitalize<AssumptionStatus>}`;

// Opportunity Definition
export interface Opportunity {
  id: string; // OPP-YYYY-NNN
  title: string;
  targetCustomer: string;
  problem: string;
  desiredOutcome: string;
  constraints: Constraint[];
  createdAt: string;
  createdBy: string;
}

// Option/Alternative
export interface Option {
  id: string; // OPT-NNN
  title: string;
  hypothesis: string;
  pros: string[];
  cons: string[];
  risks: string[];
  leveragePointId?: LeveragePoint; // LP1-LP12
  estimatedEffort?: string;
  estimatedImpact?: string;
  assumptions: string[]; // References to Assumption IDs
}

// Decision Record
export interface DecisionRecord {
  id: string; // DEC-YYYY-NNN
  opportunityId: string;
  decisionType: DecisionType;
  chosenOptionId?: string; // For "adopt" decisions
  decidedBy: string; // Product Owner, TechLead, etc.
  decidedAt: string;
  rationale: string;
  tradeoffs: string[];
  alternatives: string[]; // Option IDs that were rejected
  reviewDate?: string; // For "defer" decisions
}

// Assumption
export interface Assumption {
  id: string; // ASM-NNN
  statement: string;
  owner: string;
  status: AssumptionStatus;
  validationMethod: string;
  validationDate?: string;
  invalidatedReason?: string;
  relatedDecisions: string[]; // DecisionRecord IDs
  createdAt: string;
}

// Constraint
export interface Constraint {
  id: string; // CST-NNN
  type: ConstraintType;
  statement: string;
  rationale: string;
  owner: string;
  canBeRelaxed: boolean;
  relaxationConditions?: string;
  createdAt: string;
}

// Planning Data (embedded in Issue body as YAML frontmatter)
export interface PlanningData {
  opportunity?: Opportunity;
  options?: Option[];
  decisionRecord?: DecisionRecord;
  assumptions?: Assumption[];
  constraints?: Constraint[];
  lastUpdatedAt: string;
  lastUpdatedBy: string;
}

// Planning Context (extracted from Issue)
export interface PlanningContext {
  issueNumber: number;
  planningData: PlanningData | null;
  hasOpportunity: boolean;
  hasDecision: boolean;
  activeAssumptions: Assumption[];
  invalidatedAssumptions: Assumption[];
  hardConstraints: Constraint[];
  softConstraints: Constraint[];
}

// =============================================================================
// SSOT Layer Types (Phase 4)
// =============================================================================

// Maturity Types
export type MaturityLevel = 'draft' | 'under_review' | 'agreed' | 'frozen' | 'deprecated';
export type MaturityLabel = `Maturity:${Capitalize<MaturityLevel>}`;

// Evidence Types
export type EvidenceStatus = 'verified' | 'unverified' | 'quarantined';
export type EvidenceLabel = `Evidence:${Capitalize<EvidenceStatus>}`;

// Exception Types
export type ExceptionStatus = 'active' | 'expired';
export type ExceptionLabel = `Exception:${Capitalize<ExceptionStatus>}`;

// Kernel (Single Source of Truth)
export interface Kernel {
  id: string; // KRN-NNN
  statement: string; // The truth that must converge
  category: 'requirement' | 'architecture' | 'interface' | 'constraint' | 'quality';
  owner: string;
  maturity: MaturityLevel;
  createdAt: string;
  lastUpdatedAt: string;
  approvedBy?: string; // For 'agreed' maturity
  frozenAt?: string; // For 'frozen' maturity
  deprecatedReason?: string; // For 'deprecated' maturity
}

// Kernel Violation (Φ - Divergence Detection)
export interface KernelViolation {
  id: string; // VIO-NNN
  kernelId: string;
  violationType: 'contradiction' | 'inconsistency' | 'outdated' | 'unauthorized_change';
  detectedIn: string; // File path, Issue number, PR number
  description: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  detectedAt: string;
  resolvedAt?: string;
  resolution?: string;
}

// Evidence (Content Provenance & Validation)
export interface Evidence {
  id: string; // EVI-NNN
  contentHash: string; // SHA-256 of content
  source: 'human' | 'ai' | 'hybrid';
  status: EvidenceStatus;
  validatedBy?: string; // Human validator
  validatedAt?: string;
  quarantinedReason?: string; // For 'quarantined' status
  metadata: {
    author?: string;
    generatedBy?: string; // AI model name
    prompt?: string; // AI prompt if applicable
    reviewedBy?: string[];
  };
  createdAt: string;
}

// Exception (Temporary Kernel Deviation with Timeout)
export interface Exception {
  id: string; // EXC-NNN
  kernelId: string;
  reason: string;
  requestedBy: string;
  approvedBy: string;
  status: ExceptionStatus;
  approvedAt: string;
  expiresAt: string; // Timeout deadline
  extendedAt?: string; // If timeout was extended
  expiredAt?: string; // When it expired
  convergencePlan: string; // How to converge back to Kernel
  relatedIssues: string[]; // Issue numbers
}

// Change Request (Kernel Modification Request)
export interface ChangeRequest {
  id: string; // CHG-NNN
  kernelId: string;
  changeType: 'update' | 'deprecate' | 'freeze' | 'unfreeze';
  proposedChange: string;
  rationale: string;
  requestedBy: string;
  requestedAt: string;
  approvedBy?: string;
  approvedAt?: string;
  rejectedBy?: string;
  rejectedAt?: string;
  rejectionReason?: string;
  impact: 'breaking' | 'major' | 'minor' | 'patch';
  affectedComponents: string[];
}

// Change Approval (Formal Approval Record)
export interface ChangeApproval {
  id: string; // APR-NNN
  changeRequestId: string;
  approver: string; // Guardian, CISO, TechLead, etc.
  decision: 'approved' | 'rejected' | 'conditional';
  conditions?: string[]; // For 'conditional' approval
  comments: string;
  approvedAt: string;
}

// SSOT Data (embedded in Issue body as YAML frontmatter)
export interface SSOTData {
  kernels?: Kernel[];
  violations?: KernelViolation[];
  evidences?: Evidence[];
  exceptions?: Exception[];
  changeRequests?: ChangeRequest[];
  changeApprovals?: ChangeApproval[];
  lastUpdatedAt: string;
  lastUpdatedBy: string;
}

// SSOT Context (extracted from Issue)
export interface SSOTContext {
  issueNumber: number;
  ssotData: SSOTData | null;
  activeKernels: Kernel[];
  frozenKernels: Kernel[];
  deprecatedKernels: Kernel[];
  unresolvedViolations: KernelViolation[];
  quarantinedContent: Evidence[];
  activeExceptions: Exception[];
  expiredExceptions: Exception[];
  pendingChangeRequests: ChangeRequest[];
}

// =============================================================================
// Code Generation Types (Phase 4)
// =============================================================================

export interface GeneratedCode {
  filename: string;
  content: string;
  language: string;
  size: number;
}

export interface CodeQualityMetrics {
  overallScore: number; // 0-100
  linesOfCode: number;
  fileCount: number;
  hasTests: boolean;
  hasDocumentation: boolean;
  complexity: number;
  maintainability: 'high' | 'medium' | 'low';
}

export interface CodeGenContext {
  issue: GitHubIssue;
  analysis: {
    type: 'feature' | 'bug' | 'refactor' | 'test' | 'docs';
    complexity: 'small' | 'medium' | 'large' | 'xlarge';
    language: string;
    framework?: string;
    requiresTests: boolean;
  };
  generatedCode: GeneratedCode[];
  metrics: CodeQualityMetrics;
  timestamp: string;
}

export interface CodeReview {
  file: string;
  issues: ReviewIssue[];
  score: number; // 0-100
}

export interface ReviewIssue {
  line: number;
  severity: 'error' | 'warning' | 'info';
  category: 'security' | 'quality' | 'style' | 'performance';
  message: string;
  suggestion?: string;
}

export interface ReviewContext {
  issue: GitHubIssue;
  codeGenContext: CodeGenContext;
  reviews: CodeReview[];
  overallScore: number; // 0-100
  passed: boolean; // true if overallScore >= 80
  securityIssues: ReviewIssue[];
  qualityIssues: ReviewIssue[];
  timestamp: string;
}

// =============================================================================
// Testing Types (Phase 5)
// =============================================================================

export interface TestResult {
  file: string;
  passed: number;
  failed: number;
  skipped: number;
  duration: number;
  failures: TestFailure[];
}

export interface TestFailure {
  testName: string;
  message: string;
  stack?: string;
}

export interface CoverageReport {
  statements: CoverageMetric;
  branches: CoverageMetric;
  functions: CoverageMetric;
  lines: CoverageMetric;
}

export interface CoverageMetric {
  total: number;
  covered: number;
  percentage: number;
}

export interface TestContext {
  issue: GitHubIssue;
  codeGenContext: CodeGenContext;
  reviewContext: ReviewContext;
  testResults: TestResult[];
  coverage: CoverageReport;
  overallPassed: boolean;
  coverageMet: boolean; // true if >= 80%
  timestamp: string;
}

// =============================================================================
// Deployment Types (Phase 6)
// =============================================================================

export type DeploymentEnvironment = 'development' | 'staging' | 'production';

export type DeploymentStatus = 'pending' | 'deploying' | 'deployed' | 'failed' | 'rolled_back';

export interface DeploymentConfig {
  environment: DeploymentEnvironment;
  autoRollback: boolean;
  healthCheckUrl?: string;
  healthCheckTimeout?: number;
  deployTimeout?: number;
}

export interface DeploymentResult {
  environment: DeploymentEnvironment;
  status: DeploymentStatus;
  version: string;
  deployedAt: string;
  duration: number;
  url?: string;
  error?: string;
}

export interface HealthCheckResult {
  healthy: boolean;
  statusCode?: number;
  responseTime: number;
  error?: string;
}

export interface DeploymentContext {
  issue: GitHubIssue;
  codeGenContext: CodeGenContext;
  reviewContext: ReviewContext;
  testContext: TestContext;
  deploymentResults: DeploymentResult[];
  overallSuccess: boolean;
  timestamp: string;
}

// =============================================================================
// Monitoring Types (Phase 6)
// =============================================================================

export type MetricType = 'counter' | 'gauge' | 'histogram' | 'summary';

export interface Metric {
  name: string;
  type: MetricType;
  value: number;
  timestamp: string;
  labels?: Record<string, string>;
}

export interface Alert {
  id: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  message: string;
  metric?: string;
  threshold?: number;
  currentValue?: number;
  timestamp: string;
  resolved: boolean;
}

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  checks: HealthCheck[];
  uptime: number;
  timestamp: string;
}

export interface HealthCheck {
  name: string;
  status: 'pass' | 'fail';
  message?: string;
  duration: number;
}

export interface MonitoringContext {
  issue: GitHubIssue;
  deploymentContext: DeploymentContext;
  metrics: Metric[];
  alerts: Alert[];
  healthStatus: HealthStatus;
  isHealthy: boolean;
  timestamp: string;
}
