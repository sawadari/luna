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

    it('should return true when dest block is present', () => {
      const issueBody = `
## Summary
AI-generated Issue

\`\`\`dest
outcome_state: ok
safety_state: ok
trace_state: unknown
feedback_loops: present
violations: []
\`\`\`
      `;

      expect(ALJudge.hasRequiredFields(issueBody)).toBe(true);
    });
  });

  describe('dest block parsing (L1 parser)', () => {
    it('should parse dest block with confidence=1.0', () => {
      const issueBody = `
## Summary
AI-generated Issue with dest block

\`\`\`dest
outcome_state: ok
safety_state: ok
trace_state: unknown
feedback_loops: present
violations: []
notes: "Test note"
\`\`\`
      `;

      const result = ALJudge.parseDestBlock(issueBody);

      expect(result.confidence).toBe(1.0);
      expect(result.method).toBe('dest_block');
      expect(result.data).toBeDefined();
      expect(result.data?.outcome_state).toBe('ok');
      expect(result.data?.safety_state).toBe('ok');
      expect(result.data?.trace_state).toBe('unknown');
      expect(result.data?.feedback_loops).toBe('present');
      expect(result.data?.violations).toEqual([]);
      expect(result.data?.notes).toBe('Test note');
    });

    it('should parse dest block with violations', () => {
      const issueBody = `
\`\`\`dest
outcome_state: ok
safety_state: violated
trace_state: ok
feedback_loops: present
violations:
  - Breaking change
  - Missing tests
notes: "Has violations"
\`\`\`
      `;

      const result = ALJudge.parseDestBlock(issueBody);

      expect(result.data?.safety_state).toBe('violated');
      expect(result.data?.violations).toEqual(['Breaking change', 'Missing tests']);
    });

    it('should return confidence=0 when dest block is missing', () => {
      const issueBody = `
## Outcome Assessment
- Current state: ...
      `;

      const result = ALJudge.parseDestBlock(issueBody);

      expect(result.confidence).toBe(0);
      expect(result.method).toBe('failed');
      expect(result.data).toBeNull();
    });

    it('should parse all outcome_state values', () => {
      const testCases = [
        { value: 'ok', expected: 'ok' },
        { value: 'regressing', expected: 'regressing' },
        { value: 'unknown', expected: 'unknown' },
      ];

      for (const { value, expected } of testCases) {
        const issueBody = `
\`\`\`dest
outcome_state: ${value}
safety_state: ok
trace_state: unknown
feedback_loops: present
violations: []
\`\`\`
        `;

        const result = ALJudge.parseDestBlock(issueBody);
        expect(result.data?.outcome_state).toBe(expected);
      }
    });

    it('should parse all safety_state values', () => {
      const testCases = [
        { value: 'ok', expected: 'ok' },
        { value: 'violated', expected: 'violated' },
        { value: 'unknown', expected: 'unknown' },
      ];

      for (const { value, expected } of testCases) {
        const issueBody = `
\`\`\`dest
outcome_state: ok
safety_state: ${value}
trace_state: unknown
feedback_loops: present
violations: []
\`\`\`
        `;

        const result = ALJudge.parseDestBlock(issueBody);
        expect(result.data?.safety_state).toBe(expected);
      }
    });

    it('should parse all feedback_loops values', () => {
      const testCases = [
        { value: 'present', expected: 'present' },
        { value: 'absent', expected: 'absent' },
        { value: 'harmful', expected: 'harmful' },
      ];

      for (const { value, expected } of testCases) {
        const issueBody = `
\`\`\`dest
outcome_state: ok
safety_state: ok
trace_state: unknown
feedback_loops: ${value}
violations: []
\`\`\`
        `;

        const result = ALJudge.parseDestBlock(issueBody);
        expect(result.data?.feedback_loops).toBe(expected);
      }
    });
  });

  describe('judgeFromIssue with dest block (integration)', () => {
    it('should prioritize dest block over traditional format', () => {
      const issueBody = `
## Summary
AI-generated Issue

## Outcome Assessment
**Current State**: Wrong data (should be ignored)
**Target State**: Wrong data
**Progress**: degrading

## Safety Assessment
**Feedback Loops**: harmful
**Violations**: Critical error

\`\`\`dest
outcome_state: ok
safety_state: ok
trace_state: unknown
feedback_loops: present
violations: []
notes: "Current: Good state. Target: Better state"
\`\`\`
      `;

      const { al, outcome, safety, trace } = ALJudge.judgeFromIssue(issueBody);

      // Should use dest block values, not traditional format
      expect(outcome.outcomeState).toBe('ok');
      expect(outcome.outcomeOk).toBe(true);
      expect(safety.safetyState).toBe('ok');
      expect(safety.safetyOk).toBe(true);
      expect(trace.traceState).toBe('unknown');
      expect(al).toBe('AL1'); // outcome=ok, safety=ok, trace=unknown → AL1
    });

    it('should correctly judge AL2 from dest block', () => {
      const issueBody = `
\`\`\`dest
outcome_state: ok
safety_state: ok
trace_state: ok
feedback_loops: present
violations: []
\`\`\`
      `;

      const { al, outcome, safety, trace } = ALJudge.judgeFromIssue(issueBody);

      expect(outcome.outcomeState).toBe('ok');
      expect(safety.safetyState).toBe('ok');
      expect(trace.traceState).toBe('ok');
      expect(al).toBe('AL2');
    });

    it('should correctly judge AL1 from dest block', () => {
      const issueBody = `
\`\`\`dest
outcome_state: ok
safety_state: ok
trace_state: unknown
feedback_loops: present
violations: []
\`\`\`
      `;

      const { al, outcome, safety, trace } = ALJudge.judgeFromIssue(issueBody);

      expect(outcome.outcomeState).toBe('ok');
      expect(safety.safetyState).toBe('ok');
      expect(trace.traceState).toBe('unknown');
      expect(al).toBe('AL1');
    });

    it('should correctly judge AL0 from dest block with safety violation', () => {
      const issueBody = `
\`\`\`dest
outcome_state: ok
safety_state: violated
trace_state: ok
feedback_loops: present
violations:
  - Security breach
\`\`\`
      `;

      const { al, outcome, safety, trace } = ALJudge.judgeFromIssue(issueBody);

      expect(outcome.outcomeState).toBe('ok');
      expect(safety.safetyState).toBe('ng'); // violated is mapped to 'ng'
      expect(safety.safetyOk).toBe(false);
      expect(safety.violations).toEqual(['Security breach']);
      expect(al).toBe('AL0');
    });

    it('should correctly judge AL0 from dest block with unknown safety', () => {
      const issueBody = `
\`\`\`dest
outcome_state: ok
safety_state: unknown
trace_state: ok
feedback_loops: absent
violations: []
\`\`\`
      `;

      const { al, outcome, safety, trace } = ALJudge.judgeFromIssue(issueBody);

      expect(safety.safetyState).toBe('unknown');
      expect(al).toBe('AL0');
    });

    it('should fallback to traditional parsing when dest block is absent', () => {
      const issueBody = `
## Outcome Assessment
Current state: Traditional format
Target state: Better state
Progress: improving

## Safety Assessment
Feedback loops: stable
Violations: None
      `;

      const { al, outcome, safety } = ALJudge.judgeFromIssue(issueBody);

      expect(outcome.progress).toBe('improving');
      expect(outcome.outcomeOk).toBe(true);
      expect(safety.feedbackLoops).toBe('stable');
      expect(safety.safetyOk).toBe(true);
      expect(al).toBe('AL1'); // trace=unknown by default
    });

    it('should handle real AI-generated Issue format (Issue #50 style)', () => {
      const issueBody = `
## Summary
テストIssue

## Goal
機能を実装する

## Context
ユーザーからの要望

## Constraints
- 後方互換性を維持
- 既存パターンに従う

## Acceptance Criteria
- [ ] 機能が実装される
- [ ] テストが通る
- [ ] ドキュメントが更新される

---

## 🎯 DEST Judgment

### Outcome Assessment
**Current State**: 機能が存在しない
**Target State**: 機能が完全に実装され、テストされている
**Progress**: better

### Safety Assessment
**Feedback Loops**: present

**Safety Constraints**:
- 本番データを変更しない
- すべてのテスト環境は本番から隔離される

**Violations**: None

---

### Machine-Readable DEST Data

\`\`\`dest
outcome_state: ok
safety_state: ok
trace_state: unknown
feedback_loops: present
violations: []
notes: "Current: 機能が存在しない. Target: 機能が完全に実装され、テストされている"
\`\`\`

---
*Generated by Luna Intent-to-Issue*
      `;

      const { al, outcome, safety, trace } = ALJudge.judgeFromIssue(issueBody);

      // Should parse dest block successfully
      expect(outcome.outcomeState).toBe('ok');
      expect(safety.safetyState).toBe('ok');
      expect(trace.traceState).toBe('unknown');
      expect(al).toBe('AL1');

      // Verify it used dest block (not traditional format)
      expect(outcome.progress).toBe('improving'); // Mapped from outcome_state=ok
      expect(safety.feedbackLoops).toBe('stable'); // Mapped from feedback_loops=present
    });
  });
});
