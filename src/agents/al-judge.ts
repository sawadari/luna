/**
 * AL Judge - Assurance Level Judgment Logic
 *
 * Evaluates outcome_ok and safety_ok to determine AL (AL0/AL1/AL2)
 */

import type {
  AL,
  OutcomeAssessment,
  SafetyAssessment,
  ProgressStatus,
  FeedbackStatus,
} from '../types/index.js';

export class ALJudge {
  /**
   * Main AL judgment logic
   *
   * Rules:
   * - AL0: NOT safety_ok (highest priority)
   * - AL2: outcome_ok AND safety_ok
   * - AL1: otherwise (conditional assurance)
   */
  static judge(outcomeOk: boolean, safetyOk: boolean): AL {
    // Safety is the first gate
    if (!safetyOk) {
      return 'AL0';
    }

    // Both outcome and safety OK
    if (outcomeOk && safetyOk) {
      return 'AL2';
    }

    // Outcome not OK, but safety OK → conditional
    return 'AL1';
  }

  /**
   * Parse Issue body for Outcome Assessment
   */
  static parseOutcomeAssessment(issueBody: string): OutcomeAssessment {
    const currentStateMatch = issueBody.match(/Current state:\s*(.+)/i);
    const targetStateMatch = issueBody.match(/Target state:\s*(.+)/i);
    const progressMatch = issueBody.match(/Progress:\s*(improving|stable|degrading|unknown)/i);

    const currentState = currentStateMatch?.[1]?.trim() || 'unknown';
    const targetState = targetStateMatch?.[1]?.trim() || 'unknown';
    const progress = (progressMatch?.[1]?.toLowerCase() || 'unknown') as ProgressStatus;

    // Determine outcome_ok based on progress
    const outcomeOk = this.evaluateOutcomeOk(progress);

    return {
      currentState,
      targetState,
      progress,
      outcomeOk,
    };
  }

  /**
   * Parse Issue body for Safety Assessment
   */
  static parseSafetyAssessment(issueBody: string): SafetyAssessment {
    const feedbackMatch = issueBody.match(/Feedback loops:\s*(stable|oscillating|amplifying|unknown)/i);
    const constraintsMatch = issueBody.match(/Safety constraints:\s*(.+)/i);
    const violationsMatch = issueBody.match(/Violations:\s*(.+)/i);

    const feedbackLoops = (feedbackMatch?.[1]?.toLowerCase() || 'unknown') as FeedbackStatus;

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

    // Determine safety_ok
    const safetyOk = this.evaluateSafetyOk(feedbackLoops, violations);

    return {
      feedbackLoops,
      safetyConstraints,
      violations,
      safetyOk,
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
   * Full judgment from Issue body
   */
  static judgeFromIssue(issueBody: string): {
    al: AL;
    outcome: OutcomeAssessment;
    safety: SafetyAssessment;
  } {
    const outcome = this.parseOutcomeAssessment(issueBody);
    const safety = this.parseSafetyAssessment(issueBody);
    const al = this.judge(outcome.outcomeOk, safety.safetyOk);

    return { al, outcome, safety };
  }

  /**
   * Check if Issue body contains required DEST fields
   */
  static hasRequiredFields(issueBody: string): boolean {
    const hasOutcome = /## Outcome Assessment/i.test(issueBody);
    const hasSafety = /## Safety Assessment/i.test(issueBody);
    return hasOutcome && hasSafety;
  }
}
