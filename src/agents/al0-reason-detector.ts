/**
 * AL0 Reason Detector
 *
 * Detects AL0 Reasons (R01-R11) from Issue body using pattern matching
 */

import type { AL0Reason, AL0ReasonPattern } from '../types/index.js';

export class AL0ReasonDetector {
  /**
   * AL0 Reason detection patterns
   * Based on DEST Theory (dest.yaml)
   */
  private static readonly PATTERNS: AL0ReasonPattern[] = [
    {
      reason: 'R01-BadPositiveFeedback',
      keywords: ['amplifying', 'runaway', 'explosive growth', '正のフィードバック強化', '増幅', 'amplification'],
      patterns: [
        /amplif(y|ying|ication)/i,
        /runaway/i,
        /explosive\s+growth/i,
        /正の.*フィードバック.*強化/i,
        /破壊的.*増幅/i,
      ],
      priority: 'high',
    },
    {
      reason: 'R02-DelayIgnored',
      keywords: ['oscillation', 'overcorrection', '振動', '過剰修正', 'swinging', 'overshoot'],
      patterns: [
        /oscillat(e|ion|ing)/i,
        /overcorrect(ion)?/i,
        /振動/i,
        /過剰修正/i,
        /swing(ing)?/i,
        /overshoot/i,
      ],
      priority: 'high',
    },
    {
      reason: 'R03-NegativeFBWeakened',
      keywords: ['control disabled', 'feedback削除', '制御弱体化', 'stabilization lost', 'control removed'],
      patterns: [
        /control\s+(disabled|removed|削除)/i,
        /feedback\s+(disabled|removed|削除)/i,
        /制御.*弱体化/i,
        /stabilization\s+lost/i,
        /負の.*フィードバック.*削除/i,
      ],
      priority: 'high',
    },
    {
      reason: 'R04-RepetitiveIntervention',
      keywords: ['continuous override', '連打', '繰り返し介入', 'manual intervention repeated', 'spam'],
      patterns: [
        /continuous\s+override/i,
        /連打/i,
        /繰り返し.*介入/i,
        /manual\s+intervention\s+repeated/i,
        /intervention\s+spam/i,
      ],
      priority: 'high',
    },
    {
      reason: 'R05-ObservationFailure',
      keywords: ['no feedback', '観測断絶', 'blind spot', 'monitoring失敗', 'cannot observe'],
      patterns: [
        /no\s+feedback/i,
        /観測.*断絶/i,
        /blind\s+spot/i,
        /monitoring\s+(失敗|failure)/i,
        /cannot\s+observe/i,
        /observation\s+(broken|failed)/i,
      ],
      priority: 'critical',
    },
    {
      reason: 'R06-WrongObservable',
      keywords: ['wrong metric', '誤った指標', 'proxy失敗', 'measuring wrong thing', 'incorrect signal'],
      patterns: [
        /wrong\s+(metric|signal|indicator)/i,
        /誤った.*指標/i,
        /proxy.*失敗/i,
        /measuring\s+wrong/i,
        /incorrect\s+signal/i,
      ],
      priority: 'medium',
    },
    {
      reason: 'R07-ParameterOnlyFix',
      keywords: ['parameter tuning only', '構造無視', 'LP12のみ', 'only changing numbers', 'tweaking parameters'],
      patterns: [
        /parameter\s+(tuning|tweak(ing)?)\s+only/i,
        /only.*parameter\s+(tuning|tweak(ing)?)/i,
        /構造.*無視/i,
        /LP12.*のみ/i,
        /only\s+changing\s+(numbers|parameters)/i,
        /just\s+adjust(ing)?\s+parameters/i,
        /only\s+doing\s+parameter/i,
      ],
      priority: 'medium',
    },
    {
      reason: 'R08-DelayMismatch',
      keywords: ['timing mismatch', '遅れ不整合', 'delay not considered', 'response too fast/slow'],
      patterns: [
        /timing\s+mismatch/i,
        /遅れ.*不整合/i,
        /delay\s+(not\s+considered|ignored)/i,
        /response\s+too\s+(fast|slow)/i,
      ],
      priority: 'medium',
    },
    {
      reason: 'R09-GoalStructureConflict',
      keywords: ['goal conflict', '目標矛盾', 'contradictory objectives', 'incompatible goals'],
      patterns: [
        /goal\s+conflict/i,
        /目標.*矛盾/i,
        /contradictory\s+objectives/i,
        /incompatible\s+goals/i,
        /conflicting\s+requirements/i,
      ],
      priority: 'high',
    },
    {
      reason: 'R10-ParadigmBlindness',
      keywords: ['paradigm needed', 'パラダイム介入必要', 'fundamental assumption wrong', 'worldview問題'],
      patterns: [
        /paradigm.*need(ed)?/i,
        /パラダイム.*介入.*必要/i,
        /fundamental\s+assumption\s+wrong/i,
        /worldview.*問題/i,
        /mental\s+model\s+(wrong|broken)/i,
      ],
      priority: 'critical',
    },
    {
      reason: 'R11-SafetyViolation',
      keywords: ['safety violated', '制約違反', 'SLA breach', 'constraint broken', 'security violated'],
      patterns: [
        /safety\s+(violated|breach|constraint.*violated)/i,
        /safety.*violat/i,
        /制約.*違反/i,
        /SLA\s+breach/i,
        /constraint\s+(broken|violated)/i,
        /security\s+(violated|compromised)/i,
      ],
      priority: 'critical',
    },
  ];

  /**
   * Detect AL0 Reasons from Issue body
   * Returns array of detected reasons (can be multiple)
   */
  static detect(issueBody: string): AL0Reason[] {
    const detectedReasons: AL0Reason[] = [];

    for (const pattern of this.PATTERNS) {
      if (this.matchesPattern(issueBody, pattern)) {
        detectedReasons.push(pattern.reason);
      }
    }

    return detectedReasons;
  }

  /**
   * Detect with confidence scores
   */
  static detectWithConfidence(issueBody: string): Array<{
    reason: AL0Reason;
    confidence: number;
    matchedPatterns: string[];
  }> {
    const results: Array<{
      reason: AL0Reason;
      confidence: number;
      matchedPatterns: string[];
    }> = [];

    for (const pattern of this.PATTERNS) {
      const matchedPatterns = this.getMatchedPatterns(issueBody, pattern);
      if (matchedPatterns.length > 0) {
        const confidence = this.calculateConfidence(matchedPatterns.length, pattern.priority);
        results.push({
          reason: pattern.reason,
          confidence,
          matchedPatterns,
        });
      }
    }

    // Sort by confidence descending
    return results.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Check if Issue body matches a pattern
   */
  private static matchesPattern(text: string, pattern: AL0ReasonPattern): boolean {
    // Check keywords (case-insensitive)
    const lowerText = text.toLowerCase();
    const keywordMatch = pattern.keywords.some(keyword => lowerText.includes(keyword.toLowerCase()));

    // Check regex patterns
    const regexMatch = pattern.patterns.some(regex => regex.test(text));

    return keywordMatch || regexMatch;
  }

  /**
   * Get all matched patterns for an Issue
   */
  private static getMatchedPatterns(text: string, pattern: AL0ReasonPattern): string[] {
    const matched: string[] = [];
    const lowerText = text.toLowerCase();

    // Check keywords
    for (const keyword of pattern.keywords) {
      if (lowerText.includes(keyword.toLowerCase())) {
        matched.push(`keyword:${keyword}`);
      }
    }

    // Check regexes
    for (const regex of pattern.patterns) {
      const match = text.match(regex);
      if (match) {
        matched.push(`regex:${match[0]}`);
      }
    }

    return matched;
  }

  /**
   * Calculate confidence score based on matches and priority
   */
  private static calculateConfidence(matchCount: number, priority: string): number {
    // Base confidence from match count (each match adds 20%, max 80%)
    const baseConfidence = Math.min(matchCount * 0.2, 0.8);

    // Priority multiplier
    const priorityBonus = {
      critical: 0.2,
      high: 0.15,
      medium: 0.1,
      low: 0.05,
    }[priority] || 0.1;

    return Math.min(baseConfidence + priorityBonus, 1.0);
  }

  /**
   * Get pattern info for a specific reason
   */
  static getPatternInfo(reason: AL0Reason): AL0ReasonPattern | undefined {
    return this.PATTERNS.find(p => p.reason === reason);
  }

  /**
   * Get all supported reasons
   */
  static getAllReasons(): AL0Reason[] {
    return this.PATTERNS.map(p => p.reason);
  }
}
