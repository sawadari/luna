import { describe, it, expect } from 'vitest';
import { ProtocolRouter } from '../../src/agents/protocol-router';
import type { AL0Reason } from '../../src/types';

describe('ProtocolRouter', () => {
  describe('route P0 - Stop Amplification', () => {
    it('should route R01 to P0', () => {
      const reasons: AL0Reason[] = ['R01-BadPositiveFeedback'];
      const protocol = ProtocolRouter.route(reasons);

      expect(protocol).toBe('P0-StopAmplification');
    });

    it('should route R04 to P0', () => {
      const reasons: AL0Reason[] = ['R04-RepetitiveIntervention'];
      const protocol = ProtocolRouter.route(reasons);

      expect(protocol).toBe('P0-StopAmplification');
    });

    it('should prioritize P0 over other protocols', () => {
      const reasons: AL0Reason[] = ['R01-BadPositiveFeedback', 'R05-ObservationFailure'];
      const protocol = ProtocolRouter.route(reasons);

      // P0 has highest priority
      expect(protocol).toBe('P0-StopAmplification');
    });
  });

  describe('route P1 - Fix Observation', () => {
    it('should route R05 to P1', () => {
      const reasons: AL0Reason[] = ['R05-ObservationFailure'];
      const protocol = ProtocolRouter.route(reasons);

      expect(protocol).toBe('P1-FixObservation');
    });

    it('should route R06 to P1', () => {
      const reasons: AL0Reason[] = ['R06-WrongObservable'];
      const protocol = ProtocolRouter.route(reasons);

      expect(protocol).toBe('P1-FixObservation');
    });
  });

  describe('route P2 - Align Delay', () => {
    it('should route R02 to P2', () => {
      const reasons: AL0Reason[] = ['R02-DelayIgnored'];
      const protocol = ProtocolRouter.route(reasons);

      expect(protocol).toBe('P2-AlignDelay');
    });

    it('should route R08 to P2', () => {
      const reasons: AL0Reason[] = ['R08-DelayMismatch'];
      const protocol = ProtocolRouter.route(reasons);

      expect(protocol).toBe('P2-AlignDelay');
    });
  });

  describe('route P3 - Raise Leverage', () => {
    it('should route R07 to P3', () => {
      const reasons: AL0Reason[] = ['R07-ParameterOnlyFix'];
      const protocol = ProtocolRouter.route(reasons);

      expect(protocol).toBe('P3-RaiseLeverage');
    });
  });

  describe('route P4 - Escalate', () => {
    it('should route R09 to P4', () => {
      const reasons: AL0Reason[] = ['R09-GoalStructureConflict'];
      const protocol = ProtocolRouter.route(reasons);

      expect(protocol).toBe('P4-Escalate');
    });

    it('should route R10 to P4', () => {
      const reasons: AL0Reason[] = ['R10-ParadigmBlindness'];
      const protocol = ProtocolRouter.route(reasons);

      expect(protocol).toBe('P4-Escalate');
    });

    it('should route R11 to P4', () => {
      const reasons: AL0Reason[] = ['R11-SafetyViolation'];
      const protocol = ProtocolRouter.route(reasons);

      expect(protocol).toBe('P4-Escalate');
    });
  });

  describe('protocol priority', () => {
    it('should prioritize P0 over P4', () => {
      const reasons: AL0Reason[] = ['R01-BadPositiveFeedback', 'R11-SafetyViolation'];
      const protocol = ProtocolRouter.route(reasons);

      expect(protocol).toBe('P0-StopAmplification');
    });

    it('should prioritize P4 over P1', () => {
      const reasons: AL0Reason[] = ['R10-ParadigmBlindness', 'R05-ObservationFailure'];
      const protocol = ProtocolRouter.route(reasons);

      expect(protocol).toBe('P4-Escalate');
    });
  });

  describe('routeMultiple', () => {
    it('should return all applicable protocols', () => {
      const reasons: AL0Reason[] = ['R02-DelayIgnored', 'R07-ParameterOnlyFix'];
      const protocols = ProtocolRouter.routeMultiple(reasons);

      expect(protocols).toContain('P2-AlignDelay');
      expect(protocols).toContain('P3-RaiseLeverage');
      expect(protocols.length).toBe(2);
    });

    it('should sort protocols by priority', () => {
      const reasons: AL0Reason[] = ['R07-ParameterOnlyFix', 'R01-BadPositiveFeedback'];
      const protocols = ProtocolRouter.routeMultiple(reasons);

      // P0 should come first
      expect(protocols[0]).toBe('P0-StopAmplification');
    });
  });

  describe('getEscalationLevel', () => {
    it('should return ciso for R11', () => {
      const reasons: AL0Reason[] = ['R11-SafetyViolation'];
      const level = ProtocolRouter.getEscalationLevel(reasons);

      expect(level).toBe('ciso');
    });

    it('should return guardian for P0 protocol', () => {
      const reasons: AL0Reason[] = ['R01-BadPositiveFeedback'];
      const level = ProtocolRouter.getEscalationLevel(reasons);

      expect(level).toBe('guardian');
    });

    it('should return guardian for P4 protocol', () => {
      const reasons: AL0Reason[] = ['R10-ParadigmBlindness'];
      const level = ProtocolRouter.getEscalationLevel(reasons);

      expect(level).toBe('guardian');
    });

    it('should return techlead for other protocols', () => {
      const reasons: AL0Reason[] = ['R05-ObservationFailure'];
      const level = ProtocolRouter.getEscalationLevel(reasons);

      expect(level).toBe('techlead');
    });
  });

  describe('getNextActions', () => {
    it('should return actions for P0', () => {
      const actions = ProtocolRouter.getNextActions('P0-StopAmplification');

      expect(actions.length).toBeGreaterThan(0);
      expect(actions[0]).toContain('HALT');
    });

    it('should return actions for P4', () => {
      const actions = ProtocolRouter.getNextActions('P4-Escalate');

      expect(actions.length).toBeGreaterThan(0);
      expect(actions.some(a => a.includes('Guardian'))).toBe(true);
    });
  });

  describe('getRationale', () => {
    it('should return rationale for protocol', () => {
      const reasons: AL0Reason[] = ['R01-BadPositiveFeedback'];
      const rationale = ProtocolRouter.getRationale('P0-StopAmplification', reasons);

      expect(rationale).toContain('amplification');
      expect(rationale).toContain('R01');
    });
  });

  describe('edge cases', () => {
    it('should return null for empty reasons', () => {
      const protocol = ProtocolRouter.route([]);

      expect(protocol).toBeNull();
    });

    it('should return empty array for routeMultiple with empty reasons', () => {
      const protocols = ProtocolRouter.routeMultiple([]);

      expect(protocols).toEqual([]);
    });
  });
});
