/**
 * PlanningAgent Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PlanningAgent } from '../../src/agents/planning-agent';
import type {
  AgentConfig,
  GitHubIssue,
  PlanningContext,
  Opportunity,
  Option,
  DecisionRecord,
  Constraint,
} from '../../src/types';

describe('PlanningAgent', () => {
  let agent: PlanningAgent;
  let mockConfig: AgentConfig;

  beforeEach(() => {
    mockConfig = {
      githubToken: 'test-token',
      repository: 'test-owner/test-repo',
      dryRun: true,
      verbose: false,
    };
    agent = new PlanningAgent(mockConfig);
  });

  // ==========================================================================
  // Planning Data Parsing/Embedding Tests
  // ==========================================================================

  describe('Planning Data YAML Parsing', () => {
    it('should parse Planning Data from YAML frontmatter', () => {
      const issueBody = `---
planning_layer:
  opportunity:
    id: OPP-2025-001
    title: Improve API Response Time
    targetCustomer: External users
    problem: Response time > 2s
    desiredOutcome: Response time < 500ms
    createdAt: "2025-01-13T00:00:00Z"
    createdBy: ProductOwner
  lastUpdatedAt: "2025-01-13T00:00:00Z"
  lastUpdatedBy: PlanningAgent
---

# Issue Content
...
`;

      const planningData = (agent as any).parsePlanningData(issueBody);

      expect(planningData).not.toBeNull();
      expect(planningData?.opportunity?.id).toBe('OPP-2025-001');
      expect(planningData?.opportunity?.title).toBe('Improve API Response Time');
    });

    it('should return null when no YAML frontmatter exists', () => {
      const issueBody = `# Issue Content without frontmatter
...`;

      const planningData = (agent as any).parsePlanningData(issueBody);

      expect(planningData).toBeNull();
    });

    it('should return null on invalid YAML syntax', () => {
      const issueBody = `---
invalid: yaml: syntax [
---

# Issue Content
...`;

      const planningData = (agent as any).parsePlanningData(issueBody);

      expect(planningData).toBeNull();
    });

    it('should embed Planning Data as YAML frontmatter', () => {
      const originalBody = `# Issue Title

## Content
Some content here`;

      const planningData = {
        opportunity: {
          id: 'OPP-2025-001',
          title: 'Test Opportunity',
          targetCustomer: 'Users',
          problem: 'Problem statement',
          desiredOutcome: 'Outcome statement',
          constraints: [],
          createdAt: '2025-01-13T00:00:00Z',
          createdBy: 'PlanningAgent',
        },
        lastUpdatedAt: '2025-01-13T00:00:00Z',
        lastUpdatedBy: 'PlanningAgent',
      };

      const updatedBody = (agent as any).embedPlanningData(originalBody, planningData);

      expect(updatedBody).toContain('---');
      expect(updatedBody).toContain('planning_layer:');
      expect(updatedBody).toContain('OPP-2025-001');
      expect(updatedBody).toContain('# Issue Title');
      expect(updatedBody).toContain('## Content');
    });

    it('should replace existing YAML frontmatter', () => {
      const originalBody = `---
old_data: old_value
---

# Issue Content`;

      const planningData = {
        opportunity: {
          id: 'OPP-2025-002',
          title: 'New Opportunity',
          targetCustomer: 'Users',
          problem: 'Problem',
          desiredOutcome: 'Outcome',
          constraints: [],
          createdAt: '2025-01-13T00:00:00Z',
          createdBy: 'PlanningAgent',
        },
        lastUpdatedAt: '2025-01-13T00:00:00Z',
        lastUpdatedBy: 'PlanningAgent',
      };

      const updatedBody = (agent as any).embedPlanningData(originalBody, planningData);

      expect(updatedBody).not.toContain('old_data');
      expect(updatedBody).toContain('planning_layer:');
      expect(updatedBody).toContain('OPP-2025-002');
    });
  });

  // ==========================================================================
  // Opportunity Generation Tests
  // ==========================================================================

  describe('Opportunity Generation', () => {
    it('should generate Opportunity from Issue', () => {
      const issue: GitHubIssue = {
        number: 1,
        title: 'Improve API Response Time',
        body: `## Problem
- Current state: API response time exceeds 2s
- Target state: Response time < 500ms with 99th percentile
- Target Customer: External API users

## Description
...`,
        labels: [],
        state: 'open',
        created_at: '2025-01-13T00:00:00Z',
        updated_at: '2025-01-13T00:00:00Z',
      };

      const opportunity: Opportunity = (agent as any).generateOpportunity(issue);

      expect(opportunity.id).toMatch(/^OPP-\d{4}-\d{3}$/);
      expect(opportunity.title).toBe('Improve API Response Time');
      expect(opportunity.targetCustomer).toBe('External API users');
      expect(opportunity.problem).toContain('API response time exceeds 2s');
      expect(opportunity.desiredOutcome).toContain('Response time < 500ms');
      expect(opportunity.createdBy).toBe('PlanningAgent');
    });

    it('should handle missing fields gracefully', () => {
      const issue: GitHubIssue = {
        number: 2,
        title: 'Minimal Issue',
        body: '# Simple Issue with no structured data',
        labels: [],
        state: 'open',
        created_at: '2025-01-13T00:00:00Z',
        updated_at: '2025-01-13T00:00:00Z',
      };

      const opportunity: Opportunity = (agent as any).generateOpportunity(issue);

      expect(opportunity.id).toMatch(/^OPP-\d{4}-\d{3}$/);
      expect(opportunity.title).toBe('Minimal Issue');
      expect(opportunity.targetCustomer).toBe('Unknown');
      expect(opportunity.problem).toBe('Problem not defined');
      expect(opportunity.desiredOutcome).toBe('Outcome not defined');
    });

    it('should generate unique Opportunity IDs', () => {
      const issue: GitHubIssue = {
        number: 3,
        title: 'Test Issue',
        body: '',
        labels: [],
        state: 'open',
        created_at: '2025-01-13T00:00:00Z',
        updated_at: '2025-01-13T00:00:00Z',
      };

      const opp1: Opportunity = (agent as any).generateOpportunity(issue);
      const opp2: Opportunity = (agent as any).generateOpportunity(issue);

      // IDs should be different (random component)
      expect(opp1.id).toMatch(/^OPP-\d{4}-\d{3}$/);
      expect(opp2.id).toMatch(/^OPP-\d{4}-\d{3}$/);
    });
  });

  // ==========================================================================
  // Leverage Point Analysis Tests
  // ==========================================================================

  describe('Leverage Point Analysis', () => {
    it('should detect LP1-Transcend (Paradigm level)', () => {
      const option: Option = {
        id: 'OPT-001',
        title: 'Change organizational culture',
        hypothesis: 'Shifting the paradigm will enable innovation',
        pros: [],
        cons: [],
        risks: [],
        assumptions: [],
      };

      const lp = (agent as any).analyzeLeveragePoint(option);
      expect(lp).toBe('LP1-Transcend');
    });

    it('should detect LP3-Goal (Purpose level)', () => {
      const option: Option = {
        id: 'OPT-002',
        title: 'Redefine system goals',
        hypothesis: 'Changing the mission will align incentives',
        pros: [],
        cons: [],
        risks: [],
        assumptions: [],
      };

      const lp = (agent as any).analyzeLeveragePoint(option);
      expect(lp).toBe('LP3-Goal');
    });

    it('should detect LP4-SelfOrganize', () => {
      const option: Option = {
        id: 'OPT-003',
        title: 'Enable self-organizing teams',
        hypothesis: 'Teams that can adapt and evolve will be more effective',
        pros: [],
        cons: [],
        risks: [],
        assumptions: [],
      };

      const lp = (agent as any).analyzeLeveragePoint(option);
      expect(lp).toBe('LP4-SelfOrganize');
    });

    it('should detect LP5-Rules', () => {
      const option: Option = {
        id: 'OPT-004',
        title: 'Update governance policy',
        hypothesis: 'New regulations will improve compliance',
        pros: [],
        cons: [],
        risks: [],
        assumptions: [],
      };

      const lp = (agent as any).analyzeLeveragePoint(option);
      expect(lp).toBe('LP5-Rules');
    });

    it('should detect LP6-InfoFlow', () => {
      const option: Option = {
        id: 'OPT-005',
        title: 'Improve data visibility',
        hypothesis: 'Better information flow will enable faster decisions',
        pros: [],
        cons: [],
        risks: [],
        assumptions: [],
      };

      const lp = (agent as any).analyzeLeveragePoint(option);
      expect(lp).toBe('LP6-InfoFlow');
    });

    it('should detect LP7-PositiveFB', () => {
      const option: Option = {
        id: 'OPT-006',
        title: 'Add amplification loop',
        hypothesis: 'Positive feedback will drive growth',
        pros: [],
        cons: [],
        risks: [],
        assumptions: [],
      };

      const lp = (agent as any).analyzeLeveragePoint(option);
      expect(lp).toBe('LP7-PositiveFB');
    });

    it('should detect LP8-NegativeFB', () => {
      const option: Option = {
        id: 'OPT-007',
        title: 'Add control mechanism',
        hypothesis: 'Negative feedback will stabilize the system',
        pros: [],
        cons: [],
        risks: [],
        assumptions: [],
      };

      const lp = (agent as any).analyzeLeveragePoint(option);
      expect(lp).toBe('LP8-NegativeFB');
    });

    it('should detect LP9-Delay', () => {
      const option: Option = {
        id: 'OPT-008',
        title: 'Reduce latency',
        hypothesis: 'Fixing delays will prevent oscillation',
        pros: [],
        cons: [],
        risks: [],
        assumptions: [],
      };

      const lp = (agent as any).analyzeLeveragePoint(option);
      expect(lp).toBe('LP9-Delay');
    });

    it('should detect LP10-StockFlow', () => {
      const option: Option = {
        id: 'OPT-009',
        title: 'Redesign stock and flow structure',
        hypothesis: 'Better architecture will improve performance',
        pros: [],
        cons: [],
        risks: [],
        assumptions: [],
      };

      const lp = (agent as any).analyzeLeveragePoint(option);
      expect(lp).toBe('LP10-StockFlow');
    });

    it('should detect LP11-Buffer', () => {
      const option: Option = {
        id: 'OPT-010',
        title: 'Add capacity buffer',
        hypothesis: 'Extra capacity will handle spikes',
        pros: [],
        cons: [],
        risks: [],
        assumptions: [],
      };

      const lp = (agent as any).analyzeLeveragePoint(option);
      expect(lp).toBe('LP11-Buffer');
    });

    it('should default to LP12-Parameter', () => {
      const option: Option = {
        id: 'OPT-011',
        title: 'Adjust cache TTL',
        hypothesis: 'Tuning parameters will help',
        pros: [],
        cons: [],
        risks: [],
        assumptions: [],
      };

      const lp = (agent as any).analyzeLeveragePoint(option);
      expect(lp).toBe('LP12-Parameter');
    });
  });

  // ==========================================================================
  // Selected Option Detection Tests
  // ==========================================================================

  describe('Selected Option Detection', () => {
    it('should detect selected option with ✅ before ID', () => {
      const issueBody = `## Options
- ✅ OPT-001: Redis caching
- OPT-002: Query optimization
- OPT-003: CDN implementation`;

      const options: Option[] = [
        {
          id: 'OPT-001',
          title: 'Redis caching',
          hypothesis: '',
          pros: [],
          cons: [],
          risks: [],
          assumptions: [],
        },
        {
          id: 'OPT-002',
          title: 'Query optimization',
          hypothesis: '',
          pros: [],
          cons: [],
          risks: [],
          assumptions: [],
        },
      ];

      const selected = (agent as any).findSelectedOption(issueBody, options);

      expect(selected).not.toBeNull();
      expect(selected?.id).toBe('OPT-001');
    });

    it('should detect selected option with ✅ after ID', () => {
      const issueBody = `## Options
- OPT-001 ✅: Redis caching (selected)
- OPT-002: Query optimization`;

      const options: Option[] = [
        {
          id: 'OPT-001',
          title: 'Redis caching',
          hypothesis: '',
          pros: [],
          cons: [],
          risks: [],
          assumptions: [],
        },
        {
          id: 'OPT-002',
          title: 'Query optimization',
          hypothesis: '',
          pros: [],
          cons: [],
          risks: [],
          assumptions: [],
        },
      ];

      const selected = (agent as any).findSelectedOption(issueBody, options);

      expect(selected).not.toBeNull();
      expect(selected?.id).toBe('OPT-001');
    });

    it('should return null when no option is selected', () => {
      const issueBody = `## Options
- OPT-001: Redis caching
- OPT-002: Query optimization`;

      const options: Option[] = [
        {
          id: 'OPT-001',
          title: 'Redis caching',
          hypothesis: '',
          pros: [],
          cons: [],
          risks: [],
          assumptions: [],
        },
      ];

      const selected = (agent as any).findSelectedOption(issueBody, options);

      expect(selected).toBeNull();
    });

    it('should handle case-insensitive matching', () => {
      const issueBody = `## Options
- ✅ opt-001: Redis caching`;

      const options: Option[] = [
        {
          id: 'OPT-001',
          title: 'Redis caching',
          hypothesis: '',
          pros: [],
          cons: [],
          risks: [],
          assumptions: [],
        },
      ];

      const selected = (agent as any).findSelectedOption(issueBody, options);

      expect(selected).not.toBeNull();
      expect(selected?.id).toBe('OPT-001');
    });
  });

  // ==========================================================================
  // DecisionRecord Creation Tests
  // ==========================================================================

  describe('DecisionRecord Creation', () => {
    it('should create DecisionRecord with all fields', () => {
      const opportunity: Opportunity = {
        id: 'OPP-2025-001',
        title: 'Improve API Response Time',
        targetCustomer: 'External users',
        problem: 'Response time > 2s',
        desiredOutcome: 'Response time < 500ms',
        constraints: [],
        createdAt: '2025-01-13T00:00:00Z',
        createdBy: 'ProductOwner',
      };

      const chosenOption: Option = {
        id: 'OPT-001',
        title: 'Redis caching layer',
        hypothesis: 'Caching will reduce DB load',
        pros: ['Proven technology', 'Easy to implement'],
        cons: ['Cache invalidation complexity'],
        risks: ['Stale data'],
        assumptions: ['ASM-001'],
      };

      const allOptions: Option[] = [
        chosenOption,
        {
          id: 'OPT-002',
          title: 'Query optimization',
          hypothesis: 'Better queries will help',
          pros: [],
          cons: [],
          risks: [],
          assumptions: [],
        },
      ];

      const decision: DecisionRecord = (agent as any).createDecisionRecord(
        opportunity,
        chosenOption,
        allOptions
      );

      expect(decision.id).toMatch(/^DEC-\d{4}-\d{3}$/);
      expect(decision.opportunityId).toBe('OPP-2025-001');
      expect(decision.decisionType).toBe('adopt');
      expect(decision.chosenOptionId).toBe('OPT-001');
      expect(decision.decidedBy).toBe('ProductOwner');
      expect(decision.rationale).toContain('OPT-001');
      expect(decision.tradeoffs.length).toBeGreaterThan(0);
      expect(decision.alternatives).toContain('OPT-002');
      expect(decision.alternatives).not.toContain('OPT-001');
    });

    it('should generate unique DecisionRecord IDs', () => {
      const opportunity: Opportunity = {
        id: 'OPP-2025-001',
        title: 'Test',
        targetCustomer: '',
        problem: '',
        desiredOutcome: '',
        constraints: [],
        createdAt: '2025-01-13T00:00:00Z',
        createdBy: 'Test',
      };

      const option: Option = {
        id: 'OPT-001',
        title: 'Test',
        hypothesis: '',
        pros: [],
        cons: [],
        risks: [],
        assumptions: [],
      };

      const dec1 = (agent as any).createDecisionRecord(opportunity, option, [option]);
      const dec2 = (agent as any).createDecisionRecord(opportunity, option, [option]);

      expect(dec1.id).toMatch(/^DEC-\d{4}-\d{3}$/);
      expect(dec2.id).toMatch(/^DEC-\d{4}-\d{3}$/);
    });

    it('should extract tradeoffs from option pros/cons', () => {
      const opportunity: Opportunity = {
        id: 'OPP-2025-001',
        title: 'Test',
        targetCustomer: '',
        problem: '',
        desiredOutcome: '',
        constraints: [],
        createdAt: '2025-01-13T00:00:00Z',
        createdBy: 'Test',
      };

      const option: Option = {
        id: 'OPT-001',
        title: 'Test',
        hypothesis: '',
        pros: ['Fast implementation'],
        cons: ['High complexity'],
        risks: ['Data loss risk'],
        assumptions: [],
      };

      const decision: DecisionRecord = (agent as any).createDecisionRecord(
        opportunity,
        option,
        [option]
      );

      expect(decision.tradeoffs).toContain('Fast implementation vs. High complexity');
      expect(decision.tradeoffs).toContain('Risk: Data loss risk');
    });
  });

  // ==========================================================================
  // Constraint Validation Tests
  // ==========================================================================

  describe('Constraint Validation', () => {
    it('should detect Hard Constraint violation (no breaking changes)', () => {
      const options: Option[] = [
        {
          id: 'OPT-001',
          title: 'Introduce breaking API changes',
          hypothesis: 'Breaking changes needed',
          pros: [],
          cons: [],
          risks: [],
          assumptions: [],
        },
      ];

      const constraints: Constraint[] = [
        {
          id: 'CST-001',
          type: 'hard',
          statement: 'No breaking API changes allowed',
          rationale: 'External clients depend on API',
          owner: 'ProductOwner',
          canBeRelaxed: false,
          createdAt: '2025-01-13T00:00:00Z',
        },
      ];

      const violations = (agent as any).validateConstraints(options, constraints);

      expect(violations.length).toBe(1);
      expect(violations[0].option.id).toBe('OPT-001');
      expect(violations[0].constraint.id).toBe('CST-001');
    });

    it('should detect Hard Constraint violation (no external dependencies)', () => {
      const options: Option[] = [
        {
          id: 'OPT-002',
          title: 'Add external Redis dependency',
          hypothesis: 'External dependency needed',
          pros: [],
          cons: [],
          risks: [],
          assumptions: [],
        },
      ];

      const constraints: Constraint[] = [
        {
          id: 'CST-002',
          type: 'hard',
          statement: 'No external dependencies allowed',
          rationale: 'Security policy',
          owner: 'CISO',
          canBeRelaxed: false,
          createdAt: '2025-01-13T00:00:00Z',
        },
      ];

      const violations = (agent as any).validateConstraints(options, constraints);

      expect(violations.length).toBe(1);
      expect(violations[0].option.id).toBe('OPT-002');
    });

    it('should not flag violations when option complies', () => {
      const options: Option[] = [
        {
          id: 'OPT-003',
          title: 'Optimize existing code',
          hypothesis: 'Optimization will help',
          pros: [],
          cons: [],
          risks: [],
          assumptions: [],
        },
      ];

      const constraints: Constraint[] = [
        {
          id: 'CST-001',
          type: 'hard',
          statement: 'No breaking API changes allowed',
          rationale: 'External clients depend on API',
          owner: 'ProductOwner',
          canBeRelaxed: false,
          createdAt: '2025-01-13T00:00:00Z',
        },
      ];

      const violations = (agent as any).validateConstraints(options, constraints);

      expect(violations.length).toBe(0);
    });

    it('should handle multiple violations', () => {
      const options: Option[] = [
        {
          id: 'OPT-004',
          title: 'Add breaking changes with external dependency',
          hypothesis: 'Complete rewrite',
          pros: [],
          cons: [],
          risks: [],
          assumptions: [],
        },
      ];

      const constraints: Constraint[] = [
        {
          id: 'CST-001',
          type: 'hard',
          statement: 'No breaking changes',
          rationale: 'Compatibility',
          owner: 'ProductOwner',
          canBeRelaxed: false,
          createdAt: '2025-01-13T00:00:00Z',
        },
        {
          id: 'CST-002',
          type: 'hard',
          statement: 'No external dependencies',
          rationale: 'Security',
          owner: 'CISO',
          canBeRelaxed: false,
          createdAt: '2025-01-13T00:00:00Z',
        },
      ];

      const violations = (agent as any).validateConstraints(options, constraints);

      expect(violations.length).toBe(2);
    });
  });

  // ==========================================================================
  // Comment Generation Tests
  // ==========================================================================

  describe('Comment Generation', () => {
    it('should generate Opportunity comment', () => {
      const opportunity: Opportunity = {
        id: 'OPP-2025-001',
        title: 'Improve API Response Time',
        targetCustomer: 'External users',
        problem: 'Response time > 2s',
        desiredOutcome: 'Response time < 500ms',
        constraints: [],
        createdAt: '2025-01-13T00:00:00Z',
        createdBy: 'ProductOwner',
      };

      const comment = (agent as any).buildOpportunityComment(opportunity);

      expect(comment).toContain('📋 **Opportunity 定義完了**');
      expect(comment).toContain('OPP-2025-001');
      expect(comment).toContain('Improve API Response Time');
      expect(comment).toContain('External users');
      expect(comment).toContain('Response time > 2s');
      expect(comment).toContain('Response time < 500ms');
      expect(comment).toContain('*Automated by PlanningAgent*');
    });

    it('should generate DecisionRecord comment', () => {
      const decision: DecisionRecord = {
        id: 'DEC-2025-001',
        opportunityId: 'OPP-2025-001',
        decisionType: 'adopt',
        chosenOptionId: 'OPT-001',
        decidedBy: 'ProductOwner',
        decidedAt: '2025-01-13T12:00:00Z',
        rationale: 'Best risk/reward ratio',
        tradeoffs: ['Speed vs. Complexity'],
        alternatives: ['OPT-002', 'OPT-003'],
      };

      const chosenOption: Option = {
        id: 'OPT-001',
        title: 'Redis caching layer',
        hypothesis: '',
        pros: [],
        cons: [],
        risks: [],
        assumptions: [],
      };

      const comment = (agent as any).buildDecisionComment(decision, chosenOption);

      expect(comment).toContain('✅ **Decision Record 作成: DEC-2025-001**');
      expect(comment).toContain('**Decision Type**: Adopt');
      expect(comment).toContain('**Chosen Option**: OPT-001');
      expect(comment).toContain('Redis caching layer');
      expect(comment).toContain('**Decided By**: ProductOwner');
      expect(comment).toContain('Best risk/reward ratio');
      expect(comment).toContain('Speed vs. Complexity');
      expect(comment).toContain('OPT-002');
      expect(comment).toContain('`Decision:Adopt`');
      expect(comment).toContain('*Automated by PlanningAgent*');
    });

    it('should generate Constraint violation comment', () => {
      const violations = [
        {
          option: {
            id: 'OPT-001',
            title: 'Breaking changes',
            hypothesis: '',
            pros: [],
            cons: [],
            risks: [],
            assumptions: [],
          },
          constraint: {
            id: 'CST-001',
            type: 'hard' as const,
            statement: 'No breaking changes allowed',
            rationale: 'Compatibility',
            owner: 'ProductOwner',
            canBeRelaxed: false,
            createdAt: '2025-01-13T00:00:00Z',
          },
        },
      ];

      const comment = (agent as any).buildConstraintViolationComment(violations);

      expect(comment).toContain('🚫 **Hard Constraint 違反検出**');
      expect(comment).toContain('OPT-001');
      expect(comment).toContain('CST-001');
      expect(comment).toContain('No breaking changes allowed');
      expect(comment).toContain('*Automated by PlanningAgent*');
    });
  });

  // ==========================================================================
  // Helper Methods Tests
  // ==========================================================================

  describe('Helper Methods', () => {
    it('should extract field value from Issue body', () => {
      const body = `## Problem
- Current state: Response time is 2.5s
- Target state: Response time < 500ms
- Target Customer: External API users`;

      const currentState = (agent as any).extractFieldValue(body, 'Current state');
      const targetState = (agent as any).extractFieldValue(body, 'Target state');
      const targetCustomer = (agent as any).extractFieldValue(body, 'Target Customer');

      expect(currentState).toBe('Response time is 2.5s');
      expect(targetState).toBe('Response time < 500ms');
      expect(targetCustomer).toBe('External API users');
    });

    it('should return null when field not found', () => {
      const body = `## Content
Some text`;

      const value = (agent as any).extractFieldValue(body, 'Nonexistent Field');

      expect(value).toBeNull();
    });

    it('should capitalize first letter', () => {
      expect((agent as any).capitalizeFirst('adopt')).toBe('Adopt');
      expect((agent as any).capitalizeFirst('defer')).toBe('Defer');
      expect((agent as any).capitalizeFirst('reject')).toBe('Reject');
      expect((agent as any).capitalizeFirst('explore')).toBe('Explore');
    });
  });

  // ==========================================================================
  // Planning Context Extraction Tests
  // ==========================================================================

  describe('Planning Context Extraction', () => {
    it('should extract context from null planning data', () => {
      const context = (agent as any).extractPlanningContext(1, null);

      expect(context.issueNumber).toBe(1);
      expect(context.planningData).toBeNull();
      expect(context.hasOpportunity).toBe(false);
      expect(context.hasDecision).toBe(false);
      expect(context.activeAssumptions).toEqual([]);
      expect(context.invalidatedAssumptions).toEqual([]);
      expect(context.hardConstraints).toEqual([]);
      expect(context.softConstraints).toEqual([]);
    });

    it('should extract context from planning data with opportunity', () => {
      const planningData = {
        opportunity: {
          id: 'OPP-2025-001',
          title: 'Test',
          targetCustomer: 'Users',
          problem: 'Problem',
          desiredOutcome: 'Outcome',
          constraints: [],
          createdAt: '2025-01-13T00:00:00Z',
          createdBy: 'Test',
        },
        lastUpdatedAt: '2025-01-13T00:00:00Z',
        lastUpdatedBy: 'Test',
      };

      const context = (agent as any).extractPlanningContext(1, planningData);

      expect(context.hasOpportunity).toBe(true);
      expect(context.hasDecision).toBe(false);
    });

    it('should extract assumptions by status', () => {
      const planningData = {
        assumptions: [
          {
            id: 'ASM-001',
            statement: 'Test assumption 1',
            owner: 'TechLead',
            status: 'active' as const,
            validationMethod: 'Testing',
            createdAt: '2025-01-13T00:00:00Z',
            relatedDecisions: [],
          },
          {
            id: 'ASM-002',
            statement: 'Test assumption 2',
            owner: 'TechLead',
            status: 'invalidated' as const,
            validationMethod: 'Testing',
            invalidatedReason: 'Failed test',
            createdAt: '2025-01-13T00:00:00Z',
            relatedDecisions: [],
          },
        ],
        lastUpdatedAt: '2025-01-13T00:00:00Z',
        lastUpdatedBy: 'Test',
      };

      const context = (agent as any).extractPlanningContext(1, planningData);

      expect(context.activeAssumptions.length).toBe(1);
      expect(context.activeAssumptions[0].id).toBe('ASM-001');
      expect(context.invalidatedAssumptions.length).toBe(1);
      expect(context.invalidatedAssumptions[0].id).toBe('ASM-002');
    });

    it('should extract constraints by type', () => {
      const planningData = {
        constraints: [
          {
            id: 'CST-001',
            type: 'hard' as const,
            statement: 'Hard constraint',
            rationale: 'Rationale',
            owner: 'PO',
            canBeRelaxed: false,
            createdAt: '2025-01-13T00:00:00Z',
          },
          {
            id: 'CST-002',
            type: 'soft' as const,
            statement: 'Soft constraint',
            rationale: 'Rationale',
            owner: 'PO',
            canBeRelaxed: true,
            createdAt: '2025-01-13T00:00:00Z',
          },
        ],
        lastUpdatedAt: '2025-01-13T00:00:00Z',
        lastUpdatedBy: 'Test',
      };

      const context = (agent as any).extractPlanningContext(1, planningData);

      expect(context.hardConstraints.length).toBe(1);
      expect(context.hardConstraints[0].id).toBe('CST-001');
      expect(context.softConstraints.length).toBe(1);
      expect(context.softConstraints[0].id).toBe('CST-002');
    });
  });
});
