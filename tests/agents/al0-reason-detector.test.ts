import { describe, it, expect } from 'vitest';
import { AL0ReasonDetector } from '../../src/agents/al0-reason-detector';

describe('AL0ReasonDetector', () => {
  describe('detect R01 - Bad Positive Feedback', () => {
    it('should detect amplifying keyword', () => {
      const issueBody = 'System shows amplifying oscillations that are getting worse over time.';
      const reasons = AL0ReasonDetector.detect(issueBody);

      expect(reasons).toContain('R01-BadPositiveFeedback');
    });

    it('should detect runaway keyword', () => {
      const issueBody = 'Runaway process consuming all CPU resources.';
      const reasons = AL0ReasonDetector.detect(issueBody);

      expect(reasons).toContain('R01-BadPositiveFeedback');
    });
  });

  describe('detect R02 - Delay Ignored', () => {
    it('should detect oscillation keyword', () => {
      const issueBody = 'System is oscillating wildly due to overcorrection.';
      const reasons = AL0ReasonDetector.detect(issueBody);

      expect(reasons).toContain('R02-DelayIgnored');
    });

    it('should detect 振動 (Japanese)', () => {
      const issueBody = 'システムが振動しています。過剰修正が原因と思われます。';
      const reasons = AL0ReasonDetector.detect(issueBody);

      expect(reasons).toContain('R02-DelayIgnored');
    });
  });

  describe('detect R04 - Repetitive Intervention', () => {
    it('should detect continuous override', () => {
      const issueBody = 'Manual continuous override of auto-scaling settings every hour.';
      const reasons = AL0ReasonDetector.detect(issueBody);

      expect(reasons).toContain('R04-RepetitiveIntervention');
    });

    it('should detect 連打 (Japanese)', () => {
      const issueBody = 'パラメータ調整を連打している状態です。';
      const reasons = AL0ReasonDetector.detect(issueBody);

      expect(reasons).toContain('R04-RepetitiveIntervention');
    });
  });

  describe('detect R05 - Observation Failure', () => {
    it('should detect no feedback keyword', () => {
      const issueBody = 'We have no feedback from the monitoring system.';
      const reasons = AL0ReasonDetector.detect(issueBody);

      expect(reasons).toContain('R05-ObservationFailure');
    });

    it('should detect blind spot', () => {
      const issueBody = 'There is a blind spot in our monitoring coverage.';
      const reasons = AL0ReasonDetector.detect(issueBody);

      expect(reasons).toContain('R05-ObservationFailure');
    });
  });

  describe('detect R07 - Parameter Only Fix', () => {
    it('should detect parameter tuning only', () => {
      const issueBody = 'We are only doing parameter tuning without addressing the structure.';
      const reasons = AL0ReasonDetector.detect(issueBody);

      expect(reasons).toContain('R07-ParameterOnlyFix');
    });

    it('should detect 構造無視 (Japanese)', () => {
      const issueBody = 'パラメータ調整のみで、構造無視しています。';
      const reasons = AL0ReasonDetector.detect(issueBody);

      expect(reasons).toContain('R07-ParameterOnlyFix');
    });
  });

  describe('detect R11 - Safety Violation', () => {
    it('should detect safety violated', () => {
      const issueBody = 'Critical safety constraint has been violated.';
      const reasons = AL0ReasonDetector.detect(issueBody);

      expect(reasons).toContain('R11-SafetyViolation');
    });

    it('should detect SLA breach', () => {
      const issueBody = 'SLA breach detected - downtime exceeded 1 hour.';
      const reasons = AL0ReasonDetector.detect(issueBody);

      expect(reasons).toContain('R11-SafetyViolation');
    });
  });

  describe('detect multiple reasons', () => {
    it('should detect both R01 and R04', () => {
      const issueBody = `
System shows amplifying feedback loops.
Manual continuous override is being applied repeatedly.
      `;
      const reasons = AL0ReasonDetector.detect(issueBody);

      expect(reasons).toContain('R01-BadPositiveFeedback');
      expect(reasons).toContain('R04-RepetitiveIntervention');
      expect(reasons.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('detectWithConfidence', () => {
    it('should return reasons with confidence scores', () => {
      const issueBody = 'System shows amplifying oscillations with runaway growth.';
      const results = AL0ReasonDetector.detectWithConfidence(issueBody);

      expect(results.length).toBeGreaterThan(0);
      expect(results[0]).toHaveProperty('reason');
      expect(results[0]).toHaveProperty('confidence');
      expect(results[0]).toHaveProperty('matchedPatterns');
      expect(results[0].confidence).toBeGreaterThan(0);
      expect(results[0].confidence).toBeLessThanOrEqual(1);
    });

    it('should sort results by confidence descending', () => {
      const issueBody = 'Amplifying oscillation runaway explosive growth'; // R01 with multiple matches
      const results = AL0ReasonDetector.detectWithConfidence(issueBody);

      if (results.length > 1) {
        expect(results[0].confidence).toBeGreaterThanOrEqual(results[1].confidence);
      }
    });
  });

  describe('no detection', () => {
    it('should return empty array when no patterns match', () => {
      const issueBody = 'This is a normal feature request with no AL0 indicators.';
      const reasons = AL0ReasonDetector.detect(issueBody);

      expect(reasons).toEqual([]);
    });
  });
});
