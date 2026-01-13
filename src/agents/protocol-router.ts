/**
 * Protocol Router
 *
 * Routes AL0 Reasons to appropriate Protocol (P0-P4)
 * Based on DEST Theory standard protocol mapping
 */

import type { AL0Reason, Protocol, ProtocolMapping } from '../types/index.js';

export class ProtocolRouter {
  /**
   * Protocol mappings from AL0 Reasons
   * Based on DEST Theory (dest.yaml) protocol_priority_order
   */
  private static readonly MAPPINGS: ProtocolMapping[] = [
    {
      reasons: ['R01-BadPositiveFeedback', 'R04-RepetitiveIntervention'],
      protocol: 'P0-StopAmplification',
      escalationLevel: 'guardian',
    },
    {
      reasons: ['R05-ObservationFailure', 'R06-WrongObservable'],
      protocol: 'P1-FixObservation',
      escalationLevel: 'techlead',
    },
    {
      reasons: ['R02-DelayIgnored', 'R08-DelayMismatch'],
      protocol: 'P2-AlignDelay',
      escalationLevel: 'techlead',
    },
    {
      reasons: ['R07-ParameterOnlyFix'],
      protocol: 'P3-RaiseLeverage',
      escalationLevel: 'techlead',
    },
    {
      reasons: ['R09-GoalStructureConflict', 'R10-ParadigmBlindness', 'R11-SafetyViolation'],
      protocol: 'P4-Escalate',
      escalationLevel: 'guardian',
    },
  ];

  /**
   * Route AL0 Reasons to appropriate Protocol
   *
   * Priority order (highest first):
   * 1. P0 (Stop Amplification) - Immediate halt
   * 2. P4 (Escalate) - Guardian intervention
   * 3. P1 (Fix Observation) - Information flow
   * 4. P2 (Align Delay) - Timing adjustment
   * 5. P3 (Raise Leverage) - Structural change
   */
  static route(al0Reasons: AL0Reason[]): Protocol | null {
    if (al0Reasons.length === 0) {
      return null;
    }

    // Check P0 first (highest priority - destructive amplification)
    if (this.shouldApplyProtocol('P0-StopAmplification', al0Reasons)) {
      return 'P0-StopAmplification';
    }

    // Check P4 next (escalation to paradigm/goal level)
    if (this.shouldApplyProtocol('P4-Escalate', al0Reasons)) {
      return 'P4-Escalate';
    }

    // Check P1 (fix observation)
    if (this.shouldApplyProtocol('P1-FixObservation', al0Reasons)) {
      return 'P1-FixObservation';
    }

    // Check P2 (align delay)
    if (this.shouldApplyProtocol('P2-AlignDelay', al0Reasons)) {
      return 'P2-AlignDelay';
    }

    // Check P3 (raise leverage)
    if (this.shouldApplyProtocol('P3-RaiseLeverage', al0Reasons)) {
      return 'P3-RaiseLeverage';
    }

    // Fallback to P1 if unknown reasons
    return 'P1-FixObservation';
  }

  /**
   * Route to multiple protocols (all applicable)
   * Some issues may require multiple protocols
   */
  static routeMultiple(al0Reasons: AL0Reason[]): Protocol[] {
    if (al0Reasons.length === 0) {
      return [];
    }

    const protocols: Protocol[] = [];

    for (const mapping of this.MAPPINGS) {
      if (this.hasAnyReason(al0Reasons, mapping.reasons)) {
        protocols.push(mapping.protocol);
      }
    }

    // Sort by priority (P0, P4, P1, P2, P3)
    return this.sortByPriority(protocols);
  }

  /**
   * Get escalation level for AL0 Reasons
   */
  static getEscalationLevel(al0Reasons: AL0Reason[]): 'guardian' | 'techlead' | 'ciso' | 'none' {
    // R11 (Safety Violation) → CISO
    if (al0Reasons.includes('R11-SafetyViolation')) {
      return 'ciso';
    }

    // P0 or P4 protocols → Guardian
    const protocol = this.route(al0Reasons);
    if (protocol === 'P0-StopAmplification' || protocol === 'P4-Escalate') {
      return 'guardian';
    }

    // Other protocols → TechLead
    if (protocol) {
      return 'techlead';
    }

    return 'none';
  }

  /**
   * Get next actions based on Protocol
   */
  static getNextActions(protocol: Protocol): string[] {
    const actionMap: Record<Protocol, string[]> = {
      'P0-StopAmplification': [
        '🛑 HALT: Freeze all current interventions immediately',
        '🔍 Identify the positive feedback loop causing amplification',
        '🏗️ Design damping mechanism (negative feedback)',
        '📊 Re-evaluate after structural change',
      ],
      'P1-FixObservation': [
        '🔍 Audit current observation/monitoring system',
        '📊 Identify missing or incorrect signals',
        '🏗️ Redesign observation to measure actual outcomes',
        '✅ Validate new observation system before proceeding',
      ],
      'P2-AlignDelay': [
        '⏱️ Measure actual delay in the system',
        '⏸️ Implement Wait/Freeze strategy to absorb delay',
        '🎯 Adjust intervention timing to match system delay',
        '📊 Monitor for oscillation reduction',
      ],
      'P3-RaiseLeverage': [
        '🏗️ Move from LP12 (parameters) to higher leverage points',
        '🎯 Consider LP6 (information flow) or LP5 (rules) changes',
        '📊 Design structural/systemic intervention',
        '✅ Validate that intervention addresses root cause',
      ],
      'P4-Escalate': [
        '🚨 Escalate to Guardian for goal/paradigm review',
        '🎯 Re-examine fundamental assumptions and goals',
        '🏗️ Consider paradigm shift (LP2) or goal redefinition (LP3)',
        '📊 Wait for strategic decision before proceeding',
      ],
    };

    return actionMap[protocol] || [];
  }

  /**
   * Check if protocol should be applied for given reasons
   */
  private static shouldApplyProtocol(protocol: Protocol, al0Reasons: AL0Reason[]): boolean {
    const mapping = this.MAPPINGS.find(m => m.protocol === protocol);
    if (!mapping) return false;

    return this.hasAnyReason(al0Reasons, mapping.reasons);
  }

  /**
   * Check if any of the target reasons are present
   */
  private static hasAnyReason(al0Reasons: AL0Reason[], targetReasons: AL0Reason[]): boolean {
    return al0Reasons.some(reason => targetReasons.includes(reason));
  }

  /**
   * Sort protocols by priority
   */
  private static sortByPriority(protocols: Protocol[]): Protocol[] {
    const priorityOrder: Protocol[] = [
      'P0-StopAmplification',
      'P4-Escalate',
      'P1-FixObservation',
      'P2-AlignDelay',
      'P3-RaiseLeverage',
    ];

    return protocols.sort((a, b) => {
      const aIndex = priorityOrder.indexOf(a);
      const bIndex = priorityOrder.indexOf(b);
      return aIndex - bIndex;
    });
  }

  /**
   * Get rationale for protocol selection
   */
  static getRationale(protocol: Protocol, al0Reasons: AL0Reason[]): string {
    const rationaleMap: Record<Protocol, string> = {
      'P0-StopAmplification': `Detected destructive amplification (${al0Reasons.join(', ')}). Immediate halt required to prevent further damage. System shows positive feedback loop strengthening or continuous intervention spam.`,
      'P1-FixObservation': `Observation system broken or measuring wrong signals (${al0Reasons.join(', ')}). Cannot make informed decisions without accurate feedback. Must repair information flow before proceeding.`,
      'P2-AlignDelay': `Intervention timing mismatched with system delay (${al0Reasons.join(', ')}). Overcorrection or oscillation detected. Must implement Wait/Freeze strategy to absorb delay and prevent oscillation.`,
      'P3-RaiseLeverage': `Parameter-only intervention detected (${al0Reasons.join(', ')}). LP12 (parameters) has lowest leverage. Must move to structural changes (LP6-10) to address root cause.`,
      'P4-Escalate': `Goal/paradigm-level intervention required (${al0Reasons.join(', ')}). Current approach fundamentally flawed. Guardian review needed for strategic redirection.`,
    };

    return rationaleMap[protocol] || `Protocol ${protocol} selected based on detected AL0 Reasons: ${al0Reasons.join(', ')}`;
  }

  /**
   * Get all available protocols
   */
  static getAllProtocols(): Protocol[] {
    return this.MAPPINGS.map(m => m.protocol);
  }

  /**
   * Get mapping info
   */
  static getMappingInfo(protocol: Protocol): ProtocolMapping | undefined {
    return this.MAPPINGS.find(m => m.protocol === protocol);
  }
}
