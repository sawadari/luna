/**
 * AL Judge - Assurance Level Judgment Logic
 *
 * Evaluates outcome_ok and safety_ok to determine AL (AL0/AL1/AL2)
 */

import type {
  AL,
  OutcomeAssessment,
  SafetyAssessment,
  TraceabilityAssessment,
  AssessmentState,
  ProgressStatus,
  FeedbackStatus,
} from '../types/index.js';
import type {
  IssueDestContract,
  IssueDestParseResult,
} from '../types/issue-dest-contract';

export class ALJudge {
  /**
   * Main AL judgment logic
   *
   * Rules:
   * - AL0: NOT safety_ok (highest priority)
   * - AL2: outcome_ok AND safety_ok
   * - AL1: otherwise (conditional assurance)
   */
  static judge(
    outcome: boolean | AssessmentState,
    safety: boolean | AssessmentState,
    trace: boolean | AssessmentState = 'ok'
  ): AL {
    const outcomeState = this.normalizeState(outcome);
    const safetyState = this.normalizeState(safety);
    const traceState = this.normalizeState(trace);

    // Safety is the first gate (unknown is treated as not assured)
    if (safetyState !== 'ok') {
      return 'AL0';
    }

    // All three gates satisfied
    if (outcomeState === 'ok' && safetyState === 'ok' && traceState === 'ok') {
      return 'AL2';
    }

    // Safety ok but outcome/trace is unknown or ng -> conditional
    return 'AL1';
  }

  /**
   * Parse Issue body for Outcome Assessment
   */
  static parseOutcomeAssessment(issueBody: string): OutcomeAssessment {
    const currentStateMatch = issueBody.match(/Current state:\s*(.+)/i);
    const targetStateMatch = issueBody.match(/Target state:\s*(.+)/i);
    const progressMatch = issueBody.match(/Progress:\s*(improving|stable|degrading|unknown|better|worse)/i);

    const currentState = currentStateMatch?.[1]?.trim() || 'unknown';
    const targetState = targetStateMatch?.[1]?.trim() || 'unknown';
    let progress = (progressMatch?.[1]?.toLowerCase() || 'unknown') as ProgressStatus;

    // Map "better" -> "improving", "worse" -> "degrading"
    if (progress === 'better' as any) progress = 'improving';
    if (progress === 'worse' as any) progress = 'degrading';

    // Check for explicit outcome_ok declaration
    const explicitOutcomeOkMatch = issueBody.match(/✅.*outcome_ok:\s*true/i) ||
                                   issueBody.match(/outcome_ok:\s*true/i);
    const explicitOutcomeNgMatch = issueBody.match(/❌.*outcome_ok:\s*false/i) ||
                                   issueBody.match(/outcome_ok:\s*false/i);

    let outcomeOk: boolean;
    if (explicitOutcomeOkMatch) {
      // Explicit OK declaration
      outcomeOk = true;
    } else if (explicitOutcomeNgMatch) {
      // Explicit NG declaration
      outcomeOk = false;
    } else {
      // Fallback: Determine from progress
      outcomeOk = this.evaluateOutcomeOk(progress);
    }

    return {
      currentState,
      targetState,
      progress,
      outcomeState: outcomeOk ? 'ok' : progress === 'unknown' ? 'unknown' : 'ng',
      outcomeOk,
    };
  }

  /**
   * Parse Issue body for Safety Assessment
   */
  static parseSafetyAssessment(issueBody: string): SafetyAssessment {
    const feedbackMatch = issueBody.match(/Feedback loops:\s*(stable|oscillating|amplifying|unknown|present|absent)/i);
    const constraintsMatch = issueBody.match(/Safety constraints:\s*(.+)/i);
    const violationsMatch = issueBody.match(/Violations:\s*(.+)/i);

    let feedbackLoops = (feedbackMatch?.[1]?.toLowerCase() || 'unknown') as FeedbackStatus;

    // Map "present" -> "stable", "absent" -> "unknown"
    if (feedbackLoops === 'present' as any) feedbackLoops = 'stable';
    if (feedbackLoops === 'absent' as any) feedbackLoops = 'unknown';

    // Parse safety constraints (comma or newline separated)
    const constraintsText = constraintsMatch?.[1]?.trim() || '';
    const safetyConstraints = constraintsText
      ? constraintsText.split(/[,\n]/).map(c => c.trim()).filter(Boolean)
      : [];

    // Parse violations
    const violationsText = violationsMatch?.[1]?.trim() || '';
    const violations = violationsText.toLowerCase() === 'none' || violationsText === ''
      ? []
      : violationsText.split(/[,\n]/).map(v => v.trim()).filter(Boolean);

    // Check for explicit safety_ok declaration
    const explicitSafetyOkMatch = issueBody.match(/✅.*safety_ok:\s*true/i) ||
                                  issueBody.match(/safety_ok:\s*true/i);
    const explicitSafetyNgMatch = issueBody.match(/❌.*safety_ok:\s*false/i) ||
                                  issueBody.match(/safety_ok:\s*false/i);

    let safetyOk: boolean;
    if (explicitSafetyOkMatch) {
      // Explicit OK declaration
      safetyOk = true;
    } else if (explicitSafetyNgMatch) {
      // Explicit NG declaration
      safetyOk = false;
    } else {
      // Fallback: Determine from feedback and violations
      safetyOk = this.evaluateSafetyOk(feedbackLoops, violations);
    }

    const safetyState: AssessmentState =
      safetyOk ? 'ok' : feedbackLoops === 'unknown' && violations.length === 0 ? 'unknown' : 'ng';

    return {
      feedbackLoops,
      safetyConstraints,
      violations,
      safetyState,
      safetyOk,
    };
  }

  /**
   * Parse Issue body for Traceability Assessment
   */
  static parseTraceabilityAssessment(issueBody: string): TraceabilityAssessment {
    const evidenceMatch = issueBody.match(/Evidence completeness:\s*(complete|partial|missing)/i);
    const falsificationMatch = issueBody.match(/Falsification link:\s*(present|absent)/i);

    const explicitTraceOkMatch =
      issueBody.match(/✅.*trace(_state|ability)?\s*:\s*ok/i) ||
      issueBody.match(/trace(_state|ability)?\s*:\s*ok/i);
    const explicitTraceNgMatch =
      issueBody.match(/❌.*trace(_state|ability)?\s*:\s*(ng|false)/i) ||
      issueBody.match(/trace(_state|ability)?\s*:\s*(ng|false)/i);

    const evidenceCompleteness = (evidenceMatch?.[1]?.toLowerCase() || 'partial') as
      | 'complete'
      | 'partial'
      | 'missing';
    const falsificationLink = (falsificationMatch?.[1]?.toLowerCase() || 'absent') as
      | 'present'
      | 'absent';

    let traceState: AssessmentState;
    if (explicitTraceOkMatch) {
      traceState = 'ok';
    } else if (explicitTraceNgMatch) {
      traceState = 'ng';
    } else if (evidenceCompleteness === 'complete' && falsificationLink === 'present') {
      traceState = 'ok';
    } else if (evidenceCompleteness === 'missing') {
      traceState = 'ng';
    } else {
      traceState = 'unknown';
    }

    return {
      evidenceCompleteness,
      falsificationLink,
      traceState,
    };
  }

  /**
   * Evaluate outcome_ok from progress status
   */
  private static evaluateOutcomeOk(progress: ProgressStatus): boolean {
    switch (progress) {
      case 'improving':
      case 'stable':
        return true;
      case 'degrading':
      case 'unknown':
      default:
        return false;
    }
  }

  /**
   * Evaluate safety_ok from feedback status and violations
   */
  private static evaluateSafetyOk(
    feedbackLoops: FeedbackStatus,
    violations: string[]
  ): boolean {
    // Any violations → safety NG
    if (violations.length > 0) {
      return false;
    }

    // Amplifying or oscillating feedback → safety NG
    if (feedbackLoops === 'amplifying' || feedbackLoops === 'oscillating') {
      return false;
    }

    // Stable feedback, no violations → safety OK
    if (feedbackLoops === 'stable') {
      return true;
    }

    // Unknown → assume not safe (conservative)
    return false;
  }

  /**
   * Parse dest block from Issue body (L1: highest priority)
   */
  static parseDestBlock(issueBody: string): IssueDestParseResult {
    // Extract dest fenced code block
    const destBlockMatch = issueBody.match(/```dest\n([\s\S]*?)\n```/);

    if (!destBlockMatch) {
      return {
        data: null,
        confidence: 0,
        method: 'failed',
        error: 'No dest block found',
      };
    }

    try {
      const destContent = destBlockMatch[1];
      const contract: IssueDestContract = {
        outcome_state: 'unknown',
        safety_state: 'unknown',
        trace_state: 'unknown',
        feedback_loops: 'absent',
        violations: [],
      };

      // Parse YAML-like structure
      const lines = destContent.split('\n');
      let inViolations = false;

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        if (trimmed.startsWith('outcome_state:')) {
          const value = trimmed.split(':')[1]?.trim();
          if (value === 'ok' || value === 'regressing' || value === 'unknown') {
            contract.outcome_state = value;
          }
        } else if (trimmed.startsWith('safety_state:')) {
          const value = trimmed.split(':')[1]?.trim();
          if (value === 'ok' || value === 'violated' || value === 'unknown') {
            contract.safety_state = value;
          }
        } else if (trimmed.startsWith('trace_state:')) {
          const value = trimmed.split(':')[1]?.trim();
          if (value === 'ok' || value === 'partial' || value === 'absent' || value === 'unknown') {
            contract.trace_state = value;
          }
        } else if (trimmed.startsWith('feedback_loops:')) {
          const value = trimmed.split(':')[1]?.trim();
          if (value === 'present' || value === 'absent' || value === 'harmful') {
            contract.feedback_loops = value;
          }
        } else if (trimmed.startsWith('violations:')) {
          inViolations = true;
          const value = trimmed.split(':')[1]?.trim();
          if (value === '[]') {
            contract.violations = [];
            inViolations = false;
          }
        } else if (inViolations && trimmed.startsWith('- ')) {
          contract.violations.push(trimmed.substring(2).trim());
        } else if (trimmed.startsWith('notes:')) {
          const value = trimmed.split(':')[1]?.trim();
          contract.notes = value?.replace(/^["']|["']$/g, ''); // Remove quotes
        }
      }

      return {
        data: contract,
        confidence: 1.0, // Highest confidence - strict format
        method: 'dest_block',
      };
    } catch (error: any) {
      return {
        data: null,
        confidence: 0,
        method: 'failed',
        error: `Failed to parse dest block: ${error.message}`,
      };
    }
  }

  /**
   * Convert IssueDestContract to DEST assessment format
   */
  static convertDestContractToAssessment(contract: IssueDestContract): {
    outcome: OutcomeAssessment;
    safety: SafetyAssessment;
    trace: TraceabilityAssessment;
  } {
    // Map outcome_state
    const outcomeOk = contract.outcome_state === 'ok';
    const outcomeState = contract.outcome_state;

    // Map safety_state
    const safetyOk = contract.safety_state === 'ok';
    const safetyState = contract.safety_state;

    // Map trace_state
    const traceState = contract.trace_state;

    // Map feedback_loops to FeedbackStatus
    let feedbackLoops: FeedbackStatus = 'unknown';
    if (contract.feedback_loops === 'present') {
      feedbackLoops = 'stable';
    } else if (contract.feedback_loops === 'absent') {
      feedbackLoops = 'unknown';
    } else if (contract.feedback_loops === 'harmful') {
      feedbackLoops = 'amplifying';
    }

    // Determine progress from outcome_state
    let progress: ProgressStatus = 'unknown';
    if (contract.outcome_state === 'ok') {
      progress = 'improving';
    } else if (contract.outcome_state === 'regressing') {
      progress = 'degrading';
    }

    // Map dest block states to AssessmentState
    const mappedOutcomeState: AssessmentState =
      outcomeState === 'ok' ? 'ok' :
      outcomeState === 'regressing' ? 'ng' :
      'unknown';

    const mappedSafetyState: AssessmentState =
      safetyState === 'ok' ? 'ok' :
      safetyState === 'violated' ? 'ng' :
      'unknown';

    const mappedTraceState: AssessmentState =
      traceState === 'ok' ? 'ok' :
      traceState === 'partial' ? 'unknown' :
      traceState === 'absent' ? 'ng' :
      'unknown';

    const outcome: OutcomeAssessment = {
      currentState: contract.notes?.split('.')[0] || 'Generated from dest block',
      targetState: contract.notes?.split('.')[1] || 'Generated from dest block',
      progress,
      outcomeState: mappedOutcomeState,
      outcomeOk,
    };

    const safety: SafetyAssessment = {
      feedbackLoops,
      safetyConstraints: [],
      violations: contract.violations,
      safetyState: mappedSafetyState,
      safetyOk,
    };

    const trace: TraceabilityAssessment = {
      evidenceCompleteness: traceState === 'ok' ? 'complete' : traceState === 'partial' ? 'partial' : 'missing',
      falsificationLink: traceState === 'ok' ? 'present' : 'absent',
      traceState: mappedTraceState,
    };

    return { outcome, safety, trace };
  }

  /**
   * Full judgment from Issue body (with dest block priority)
   */
  static judgeFromIssue(issueBody: string): {
    al: AL;
    outcome: OutcomeAssessment;
    safety: SafetyAssessment;
    trace: TraceabilityAssessment;
  } {
    // L1: Try dest block first (highest priority, highest confidence)
    const destResult = this.parseDestBlock(issueBody);
    if (destResult.data && destResult.confidence >= 0.7) {
      const assessments = this.convertDestContractToAssessment(destResult.data);
      const al = this.judge(
        assessments.outcome.outcomeState,
        assessments.safety.safetyState,
        assessments.trace.traceState
      );
      return { al, ...assessments };
    }

    // L2/L3: Fallback to GitHub Form / heuristic parsing
    const outcome = this.parseOutcomeAssessment(issueBody);
    const safety = this.parseSafetyAssessment(issueBody);
    const trace = this.parseTraceabilityAssessment(issueBody);
    const al = this.judge(outcome.outcomeState, safety.safetyState, trace.traceState);

    return { al, outcome, safety, trace };
  }

  /**
   * Check if Issue body contains required DEST fields
   */
  static hasRequiredFields(issueBody: string): boolean {
    // Check for dest block (highest priority)
    const hasDestBlock = /```dest\n[\s\S]*?\n```/.test(issueBody);
    if (hasDestBlock) {
      return true;
    }

    // Check for traditional GitHub Form fields
    const hasOutcome = /## Outcome Assessment/i.test(issueBody);
    const hasSafety = /## Safety Assessment/i.test(issueBody);
    return hasOutcome && hasSafety;
  }

  private static normalizeState(value: boolean | AssessmentState): AssessmentState {
    if (value === true) return 'ok';
    if (value === false) return 'ng';
    return value;
  }
}
