import { describe, it, expect } from 'vitest';
import { ALJudge } from '../../src/agents/al-judge';

describe('ALJudge', () => {
  describe('AL judgment logic', () => {
    it('should return AL0 when safety_ok is false', () => {
      const al = ALJudge.judge(true, false);
      expect(al).toBe('AL0');
    });

    it('should return AL2 when both outcome_ok and safety_ok are true', () => {
      const al = ALJudge.judge(true, true);
      expect(al).toBe('AL2');
    });

    it('should return AL1 when trace is unknown even if outcome/safety are ok', () => {
      const al = ALJudge.judge('ok', 'ok', 'unknown');
      expect(al).toBe('AL1');
    });

    it('should return AL1 when outcome_ok is false but safety_ok is true', () => {
      const al = ALJudge.judge(false, true);
      expect(al).toBe('AL1');
    });

    it('should return AL0 when both are false (safety priority)', () => {
      const al = ALJudge.judge(false, false);
      expect(al).toBe('AL0');
    });
  });

  describe('parseOutcomeAssessment', () => {
    it('should parse improving progress as outcome_ok=true', () => {
      const issueBody = `
## Outcome Assessment
- Current state: API response time is 2.5s
- Target state: API response time < 500ms
- Progress: improving
      `;

      const outcome = ALJudge.parseOutcomeAssessment(issueBody);

      expect(outcome.progress).toBe('improving');
      expect(outcome.outcomeState).toBe('ok');
      expect(outcome.outcomeOk).toBe(true);
    });

    it('should parse degrading progress as outcome_ok=false', () => {
      const issueBody = `
## Outcome Assessment
- Current state: System stable
- Target state: System optimized
- Progress: degrading
      `;

      const outcome = ALJudge.parseOutcomeAssessment(issueBody);

      expect(outcome.progress).toBe('degrading');
      expect(outcome.outcomeState).toBe('ng');
      expect(outcome.outcomeOk).toBe(false);
    });

    it('should parse stable progress as outcome_ok=true', () => {
      const issueBody = `
## Outcome Assessment
- Current state: System running
- Target state: System running well
- Progress: stable
      `;

      const outcome = ALJudge.parseOutcomeAssessment(issueBody);

      expect(outcome.progress).toBe('stable');
      expect(outcome.outcomeState).toBe('ok');
      expect(outcome.outcomeOk).toBe(true);
    });
  });

  describe('parseSafetyAssessment', () => {
    it('should parse stable feedback as safety_ok=true when no violations', () => {
      const issueBody = `
## Safety Assessment
- Feedback loops: stable
- Safety constraints: Performance SLA, Uptime 99.9%
- Violations: none
      `;

      const safety = ALJudge.parseSafetyAssessment(issueBody);

      expect(safety.feedbackLoops).toBe('stable');
      expect(safety.violations).toEqual([]);
      expect(safety.safetyState).toBe('ok');
      expect(safety.safetyOk).toBe(true);
    });

    it('should parse amplifying feedback as safety_ok=false', () => {
      const issueBody = `
## Safety Assessment
- Feedback loops: amplifying
- Safety constraints: System stability
- Violations: none
      `;

      const safety = ALJudge.parseSafetyAssessment(issueBody);

      expect(safety.feedbackLoops).toBe('amplifying');
      expect(safety.safetyState).toBe('ng');
      expect(safety.safetyOk).toBe(false);
    });

    it('should parse violations as safety_ok=false', () => {
      const issueBody = `
## Safety Assessment
- Feedback loops: stable
- Safety constraints: Performance SLA, Security
- Violations: SLA breached, Security vulnerability detected
      `;

      const safety = ALJudge.parseSafetyAssessment(issueBody);

      expect(safety.violations.length).toBeGreaterThan(0);
      expect(safety.safetyState).toBe('ng');
      expect(safety.safetyOk).toBe(false);
    });

    it('should parse oscillating feedback as safety_ok=false', () => {
      const issueBody = `
## Safety Assessment
- Feedback loops: oscillating
- Safety constraints: Stability
- Violations: none
      `;

      const safety = ALJudge.parseSafetyAssessment(issueBody);

      expect(safety.feedbackLoops).toBe('oscillating');
      expect(safety.safetyState).toBe('ng');
      expect(safety.safetyOk).toBe(false);
    });
  });

  describe('parseTraceabilityAssessment', () => {
    it('should parse complete evidence and present falsification as trace ok', () => {
      const issueBody = `
## Traceability Assessment
- Evidence completeness: complete
- Falsification link: present
      `;
      const trace = ALJudge.parseTraceabilityAssessment(issueBody);
      expect(trace.traceState).toBe('ok');
    });

    it('should parse partial evidence as trace unknown', () => {
      const issueBody = `
## Traceability Assessment
- Evidence completeness: partial
- Falsification link: absent
      `;
      const trace = ALJudge.parseTraceabilityAssessment(issueBody);
      expect(trace.traceState).toBe('unknown');
    });
  });

  describe('judgeFromIssue', () => {
    it('should return AL2 for improving + stable feedback + complete traceability', () => {
      const issueBody = `
# Improve API Response Time

## Outcome Assessment
- Current state: 2.0s
- Target state: <500ms
- Progress: improving

## Safety Assessment
- Feedback loops: stable
- Safety constraints: SLA 99.9%
- Violations: none

## Traceability Assessment
- Evidence completeness: complete
- Falsification link: present
      `;

      const { al, outcome, safety, trace } = ALJudge.judgeFromIssue(issueBody);

      expect(al).toBe('AL2');
      expect(outcome.outcomeOk).toBe(true);
      expect(safety.safetyOk).toBe(true);
      expect(trace.traceState).toBe('ok');
    });

    it('should return AL0 for degrading + amplifying feedback', () => {
      const issueBody = `
# System Instability

## Outcome Assessment
- Current state: Performance degrading
- Target state: Stable performance
- Progress: degrading

## Safety Assessment
- Feedback loops: amplifying
- Safety constraints: Performance SLA
- Violations: SLA breached
      `;

      const { al, outcome, safety, trace } = ALJudge.judgeFromIssue(issueBody);

      expect(al).toBe('AL0');
      expect(outcome.outcomeOk).toBe(false);
      expect(safety.safetyOk).toBe(false);
      expect(trace.traceState).toBe('unknown');
    });
  });

  describe('hasRequiredFields', () => {
    it('should return true when both sections are present', () => {
      const issueBody = `
## Outcome Assessment
- Current state: ...

## Safety Assessment
- Feedback loops: ...
      `;

      expect(ALJudge.hasRequiredFields(issueBody)).toBe(true);
    });

    it('should return false when Outcome Assessment is missing', () => {
      const issueBody = `
## Safety Assessment
- Feedback loops: ...
      `;

      expect(ALJudge.hasRequiredFields(issueBody)).toBe(false);
    });

    it('should return false when Safety Assessment is missing', () => {
      const issueBody = `
## Outcome Assessment
- Current state: ...
      `;

      expect(ALJudge.hasRequiredFields(issueBody)).toBe(false);
    });
  });
});
