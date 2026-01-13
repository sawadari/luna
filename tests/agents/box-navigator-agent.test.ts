import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BoxNavigatorAgent } from '../../src/agents/box-navigator-agent';
import type { GitHubIssue, CrePSBox } from '../../src/types';

describe('BoxNavigatorAgent', () => {
  let agent: BoxNavigatorAgent;
  let mockIssue: GitHubIssue;

  beforeEach(() => {
    agent = new BoxNavigatorAgent({
      githubToken: 'test-token',
      repository: 'test-owner/test-repo',
      dryRun: true,
      verbose: false,
    });

    mockIssue = {
      number: 1,
      title: 'Test Issue',
      body: '',
      labels: [],
      state: 'open',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  });

  describe('Box Detection', () => {
    it('should detect B1 when no Box label exists', () => {
      // @ts-ignore - accessing private method for testing
      const currentBox = agent['detectCurrentBox'](mockIssue);

      expect(currentBox).toBeNull();
    });

    it('should detect B2 from Box label', () => {
      mockIssue.labels = [{ name: 'Box:B2-DefinedProblem', color: '5319E7' }];

      // @ts-ignore
      const currentBox = agent['detectCurrentBox'](mockIssue);

      expect(currentBox).toBe('B2-DefinedProblem');
    });

    it('should detect latest Box when multiple Box labels exist', () => {
      mockIssue.labels = [
        { name: 'Box:B1-RealProblem', color: '1D76DB' },
        { name: 'Box:B3-SolutionIdeas', color: '0E8A16' },
      ];

      // @ts-ignore
      const currentBox = agent['detectCurrentBox'](mockIssue);

      expect(currentBox).toBe('B3-SolutionIdeas');
    });
  });

  describe('B1 → B2 Transition', () => {
    it('should detect transition condition when problem definition exists', () => {
      mockIssue.body = `
# Test Issue

## 問題定義
- Current state: 現在の状態です
- Target state: 目標の状態です
- Constraints: 制約があります
      `;

      // @ts-ignore
      const hasProblemDef = agent['hasProblemDefinitionSection'](mockIssue.body);

      expect(hasProblemDef).toBe(true);
    });

    it('should not detect transition when problem definition is missing', () => {
      mockIssue.body = '# Test Issue\n\nSome content without problem definition';

      // @ts-ignore
      const hasProblemDef = agent['hasProblemDefinitionSection'](mockIssue.body);

      expect(hasProblemDef).toBe(false);
    });
  });

  describe('B2 → B3 Transition', () => {
    it('should detect transition when DEST judgment exists', () => {
      mockIssue.labels = [{ name: 'AL:AL2-Assured', color: '0E8A16' }];

      // @ts-ignore
      const hasDEST = agent['hasDESTJudgment'](mockIssue);

      expect(hasDEST).toBe(true);
    });

    it('should not detect transition without DEST judgment', () => {
      mockIssue.labels = [];

      // @ts-ignore
      const hasDEST = agent['hasDESTJudgment'](mockIssue);

      expect(hasDEST).toBe(false);
    });
  });

  describe('B3 → B4 Transition', () => {
    it('should detect transition when implementation plan exists', () => {
      mockIssue.body = `
# Test Issue

## 実装計画
1. Step 1
2. Step 2
      `;

      // @ts-ignore
      const hasImplPlan = agent['hasImplementationPlan'](mockIssue.body);

      expect(hasImplPlan).toBe(true);
    });

    it('should detect transition with English section name', () => {
      mockIssue.body = `
# Test Issue

## Implementation Plan
1. Step 1
2. Step 2
      `;

      // @ts-ignore
      const hasImplPlan = agent['hasImplementationPlan'](mockIssue.body);

      expect(hasImplPlan).toBe(true);
    });
  });

  describe('AL2 Detection', () => {
    it('should detect AL2 label', () => {
      mockIssue.labels = [{ name: 'AL:AL2-Assured', color: '0E8A16' }];

      // @ts-ignore
      const hasAL2 = agent['hasAL2'](mockIssue);

      expect(hasAL2).toBe(true);
    });

    it('should not detect AL2 when AL1', () => {
      mockIssue.labels = [{ name: 'AL:AL1-Qualified', color: 'FFA500' }];

      // @ts-ignore
      const hasAL2 = agent['hasAL2'](mockIssue);

      expect(hasAL2).toBe(false);
    });
  });

  describe('Dwell Time Calculation', () => {
    it('should calculate dwell time correctly', () => {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

      // @ts-ignore
      const dwellTime = agent['calculateDwellTime'](oneHourAgo);

      expect(dwellTime).toBeGreaterThanOrEqual(1);
      expect(dwellTime).toBeLessThan(1.1);
    });

    it('should calculate zero dwell time for current time', () => {
      const now = new Date().toISOString();

      // @ts-ignore
      const dwellTime = agent['calculateDwellTime'](now);

      expect(dwellTime).toBeLessThan(0.1);
    });
  });

  describe('Box Threshold', () => {
    it('should have warning threshold for B1', () => {
      // @ts-ignore
      const thresholds = agent['BOX_THRESHOLDS']['B1-RealProblem'];

      expect(thresholds.warning).toBe(4);
      expect(thresholds.escalation).toBe(24);
    });

    it('should have longer thresholds for B4', () => {
      // @ts-ignore
      const thresholds = agent['BOX_THRESHOLDS']['B4-DevelopedSolution'];

      expect(thresholds.warning).toBe(120); // 5日
      expect(thresholds.escalation).toBe(168); // 1週間
    });
  });

  describe('Comment Generation', () => {
    it('should build transition comment', () => {
      const gateJudgment = {
        result: 'pass' as const,
        gate: 'G1-Understanding' as const,
        reason: 'Test reason',
        nextBox: 'B2-DefinedProblem' as const,
        timestamp: new Date().toISOString(),
      };

      // @ts-ignore
      const comment = agent['buildTransitionComment'](
        'B1-RealProblem',
        'B2-DefinedProblem',
        'G1-Understanding',
        gateJudgment
      );

      expect(comment).toContain('Box遷移');
      expect(comment).toContain('B1-RealProblem → B2-DefinedProblem');
      expect(comment).toContain('G1-Understanding 通過');
    });

    it('should build gate failure comment', () => {
      const gateJudgment = {
        result: 'fail' as const,
        gate: 'G2-ProblemDef' as const,
        reason: 'DEST judgment missing',
        requiredActions: ['Add DEST assessment', 'Run DESTAgent'],
        timestamp: new Date().toISOString(),
      };

      // @ts-ignore
      const comment = agent['buildGateFailureComment']('G2-ProblemDef', gateJudgment);

      expect(comment).toContain('❌');
      expect(comment).toContain('G2-ProblemDef 失敗');
      expect(comment).toContain('Add DEST assessment');
    });

    it('should build dwell alert comment', () => {
      const boxState = {
        currentBox: 'B1-RealProblem' as CrePSBox,
        enteredAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
        dwellTimeHours: 5,
        warningThresholdHours: 4,
        escalationThresholdHours: 24,
        isOverWarning: true,
        isOverEscalation: false,
      };

      // @ts-ignore
      const comment = agent['buildDwellAlertComment'](boxState);

      expect(comment).toContain('⚠️ WARNING');
      expect(comment).toContain('Box滞留アラート');
      expect(comment).toContain('5.0時間');
    });
  });
});
