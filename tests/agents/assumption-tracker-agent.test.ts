/**
 * AssumptionTrackerAgent Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AssumptionTrackerAgent } from '../../src/agents/assumption-tracker-agent';
import type { AgentConfig, Assumption, DecisionRecord } from '../../src/types';

describe('AssumptionTrackerAgent', () => {
  let agent: AssumptionTrackerAgent;
  let mockConfig: AgentConfig;

  beforeEach(() => {
    mockConfig = {
      githubToken: 'test-token',
      repository: 'test-owner/test-repo',
      dryRun: true,
      verbose: false,
    };
    agent = new AssumptionTrackerAgent(mockConfig);
  });

  // ==========================================================================
  // Assumption Detection Tests
  // ==========================================================================

  describe('Assumption Detection', () => {
    it('should detect "assuming that" pattern (English)', () => {
      const issueBody = `## Solution
We are assuming that 80% of requests will hit the cache.
This should work because Redis is fast.`;

      const assumptions = (agent as any).detectAssumptions(issueBody);

      expect(assumptions.length).toBeGreaterThan(0);
      expect(assumptions).toContain('80% of requests will hit the cache');
    });

    it('should detect "仮定として" pattern (Japanese)', () => {
      const issueBody = `## 解決策
仮定としてRedisは10k req/sを処理できる。`;

      const assumptions = (agent as any).detectAssumptions(issueBody);

      expect(assumptions.length).toBeGreaterThan(0);
      expect(assumptions.some((a: string) => a.includes('Redis'))).toBe(true);
    });

    it('should detect "we believe" pattern', () => {
      const issueBody = `## Analysis
We believe this approach will reduce latency by 50%.`;

      const assumptions = (agent as any).detectAssumptions(issueBody);

      expect(assumptions.length).toBeGreaterThan(0);
      expect(assumptions).toContain('this approach will reduce latency by 50%');
    });

    it('should detect "expected to be" pattern', () => {
      const issueBody = `## Hypothesis
Performance is expected to be significantly better.`;

      const assumptions = (agent as any).detectAssumptions(issueBody);

      expect(assumptions.length).toBeGreaterThan(0);
      expect(assumptions).toContain('significantly better');
    });

    it('should detect "should work because" pattern', () => {
      const issueBody = `## Solution
This should work because Redis has sub-millisecond latency.`;

      const assumptions = (agent as any).detectAssumptions(issueBody);

      expect(assumptions.length).toBeGreaterThan(0);
      expect(assumptions).toContain('Redis has sub-millisecond latency');
    });

    it('should detect multiple assumptions', () => {
      const issueBody = `## Options
- OPT-001: Redis caching
  - Assuming that 80% of requests access same 20% of data
  - We believe Redis will handle 10k req/s
  - Cache invalidation can be handled by TTL`;

      const assumptions = (agent as any).detectAssumptions(issueBody);

      expect(assumptions.length).toBeGreaterThanOrEqual(2);
    });

    it('should filter out short statements (<10 chars)', () => {
      const issueBody = `Assuming that ok. We believe in success.`;

      const assumptions = (agent as any).detectAssumptions(issueBody);

      // "ok" should be filtered out (too short)
      expect(assumptions.every((a: string) => a.length > 10)).toBe(true);
    });

    it('should deduplicate identical assumptions', () => {
      const issueBody = `Assuming that Redis is fast.
Assuming that Redis is fast.`;

      const assumptions = (agent as any).detectAssumptions(issueBody);

      // Should only appear once
      expect(assumptions.filter((a: string) => a === 'Redis is fast').length).toBe(1);
    });
  });

  // ==========================================================================
  // Assumption Creation Tests
  // ==========================================================================

  describe('Assumption Creation', () => {
    it('should create Assumption objects from statements', () => {
      const statements = ['80% of requests hit cache', 'Redis handles 10k req/s'];
      const existingAssumptions: Assumption[] = [];

      const newAssumptions = (agent as any).createAssumptions(statements, existingAssumptions);

      expect(newAssumptions.length).toBe(2);
      expect(newAssumptions[0].id).toMatch(/^ASM-\d{3}$/);
      expect(newAssumptions[0].statement).toBe('80% of requests hit cache');
      expect(newAssumptions[0].status).toBe('active');
      expect(newAssumptions[0].owner).toBe('TechLead');
      expect(newAssumptions[0].validationMethod).toBeDefined();
      expect(newAssumptions[0].validationDate).toBeDefined();
    });

    it('should skip duplicate assumptions', () => {
      const statements = ['80% of requests hit cache'];
      const existingAssumptions: Assumption[] = [
        {
          id: 'ASM-001',
          statement: '80% of requests hit cache',
          owner: 'TechLead',
          status: 'active',
          validationMethod: 'Testing',
          createdAt: '2025-01-13T00:00:00Z',
          relatedDecisions: [],
        },
      ];

      const newAssumptions = (agent as any).createAssumptions(statements, existingAssumptions);

      // Should not create duplicate
      expect(newAssumptions.length).toBe(0);
    });

    it('should handle case-insensitive duplicate detection', () => {
      const statements = ['REDIS IS FAST'];
      const existingAssumptions: Assumption[] = [
        {
          id: 'ASM-001',
          statement: 'redis is fast',
          owner: 'TechLead',
          status: 'active',
          validationMethod: 'Testing',
          createdAt: '2025-01-13T00:00:00Z',
          relatedDecisions: [],
        },
      ];

      const newAssumptions = (agent as any).createAssumptions(statements, existingAssumptions);

      expect(newAssumptions.length).toBe(0);
    });

    it('should generate sequential Assumption IDs', () => {
      const statements = ['Assumption 1', 'Assumption 2'];
      const existingAssumptions: Assumption[] = [
        {
          id: 'ASM-005',
          statement: 'Existing',
          owner: 'TechLead',
          status: 'active',
          validationMethod: 'Testing',
          createdAt: '2025-01-13T00:00:00Z',
          relatedDecisions: [],
        },
      ];

      const newAssumptions = (agent as any).createAssumptions(statements, existingAssumptions);

      expect(newAssumptions[0].id).toBe('ASM-006');
      expect(newAssumptions[1].id).toBe('ASM-007');
    });

    it('should start from ASM-001 when no existing assumptions', () => {
      const id = (agent as any).generateAssumptionId([]);

      expect(id).toBe('ASM-001');
    });

    it('should pad Assumption IDs with zeros', () => {
      const existingAssumptions: Assumption[] = [
        {
          id: 'ASM-009',
          statement: 'Test',
          owner: 'TechLead',
          status: 'active',
          validationMethod: 'Testing',
          createdAt: '2025-01-13T00:00:00Z',
          relatedDecisions: [],
        },
      ];

      const id = (agent as any).generateAssumptionId(existingAssumptions);

      expect(id).toBe('ASM-010');
    });
  });

  // ==========================================================================
  // Validation Method Suggestion Tests
  // ==========================================================================

  describe('Validation Method Suggestion', () => {
    it('should suggest benchmarking for performance assumptions', () => {
      const statement = 'Response time will be under 100ms';

      const method = (agent as any).suggestValidationMethod(statement);

      expect(method).toBe('Benchmark or load testing');
    });

    it('should suggest log analysis for user behavior assumptions', () => {
      const statement = '80% of users access the same features';

      const method = (agent as any).suggestValidationMethod(statement);

      expect(method).toBe('Access log analysis or A/B testing');
    });

    it('should suggest capacity planning for scale assumptions', () => {
      const statement = 'System capacity can handle 1 million requests per day';

      const method = (agent as any).suggestValidationMethod(statement);

      expect(method).toBe('Capacity planning and simulation');
    });

    it('should suggest POC for integration assumptions', () => {
      const statement = 'Third-party API will respond within SLA';

      const method = (agent as any).suggestValidationMethod(statement);

      expect(method).toBe('Spike/POC with actual integration');
    });

    it('should suggest data analysis for database assumptions', () => {
      const statement = 'Query will return results in < 10ms';

      const method = (agent as any).suggestValidationMethod(statement);

      expect(method).toBe('Data analysis and profiling');
    });

    it('should default to expert review for unclear assumptions', () => {
      const statement = 'This will work';

      const method = (agent as any).suggestValidationMethod(statement);

      expect(method).toBe('Review with domain expert');
    });
  });

  // ==========================================================================
  // Validation Deadline Calculation Tests
  // ==========================================================================

  describe('Validation Deadline Calculation', () => {
    it('should calculate 3-day deadline for critical priority', () => {
      const deadline = (agent as any).calculateValidationDeadline('critical');
      const deadlineDate = new Date(deadline);
      const now = new Date();

      const diffDays = Math.floor(
        (deadlineDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );

      expect(diffDays).toBe(3);
    });

    it('should calculate 7-day deadline for high priority', () => {
      const deadline = (agent as any).calculateValidationDeadline('high');
      const deadlineDate = new Date(deadline);
      const now = new Date();

      const diffDays = Math.floor(
        (deadlineDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );

      expect(diffDays).toBe(7);
    });

    it('should calculate 14-day deadline for normal priority', () => {
      const deadline = (agent as any).calculateValidationDeadline('normal');
      const deadlineDate = new Date(deadline);
      const now = new Date();

      const diffDays = Math.floor(
        (deadlineDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );

      expect(diffDays).toBe(14);
    });
  });

  // ==========================================================================
  // Validation Overdue Check Tests
  // ==========================================================================

  describe('Validation Overdue Check', () => {
    it('should detect overdue assumption', () => {
      const assumption: Assumption = {
        id: 'ASM-001',
        statement: 'Test assumption',
        owner: 'TechLead',
        status: 'active',
        validationMethod: 'Testing',
        validationDate: '2025-01-01T00:00:00Z', // Past date
        createdAt: '2025-01-01T00:00:00Z',
        relatedDecisions: [],
      };

      const isOverdue = (agent as any).isValidationOverdue(assumption);

      expect(isOverdue).toBe(true);
    });

    it('should not flag future validation date as overdue', () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 7);

      const assumption: Assumption = {
        id: 'ASM-002',
        statement: 'Test assumption',
        owner: 'TechLead',
        status: 'active',
        validationMethod: 'Testing',
        validationDate: futureDate.toISOString(),
        createdAt: '2025-01-13T00:00:00Z',
        relatedDecisions: [],
      };

      const isOverdue = (agent as any).isValidationOverdue(assumption);

      expect(isOverdue).toBe(false);
    });

    it('should return false when no validation date', () => {
      const assumption: Assumption = {
        id: 'ASM-003',
        statement: 'Test assumption',
        owner: 'TechLead',
        status: 'active',
        validationMethod: 'Testing',
        createdAt: '2025-01-13T00:00:00Z',
        relatedDecisions: [],
      };

      const isOverdue = (agent as any).isValidationOverdue(assumption);

      expect(isOverdue).toBe(false);
    });
  });

  // ==========================================================================
  // Comment Generation Tests
  // ==========================================================================

  describe('Comment Generation', () => {
    it('should generate detection comment', () => {
      const assumptions: Assumption[] = [
        {
          id: 'ASM-001',
          statement: '80% of requests access same 20% of data',
          owner: 'TechLead',
          status: 'active',
          validationMethod: 'Access log analysis',
          validationDate: '2025-01-20T00:00:00Z',
          createdAt: '2025-01-13T00:00:00Z',
          relatedDecisions: [],
        },
        {
          id: 'ASM-002',
          statement: 'Redis will handle 10k req/s',
          owner: 'TechLead',
          status: 'active',
          validationMethod: 'Load testing',
          validationDate: '2025-01-20T00:00:00Z',
          createdAt: '2025-01-13T00:00:00Z',
          relatedDecisions: [],
        },
      ];

      const comment = (agent as any).buildDetectionComment(assumptions);

      expect(comment).toContain('📝 **Assumption 検出: 2件**');
      expect(comment).toContain('ASM-001');
      expect(comment).toContain('80% of requests access same 20% of data');
      expect(comment).toContain('@TechLead');
      expect(comment).toContain('Access log analysis');
      expect(comment).toContain('ASM-002');
      expect(comment).toContain('Redis will handle 10k req/s');
      expect(comment).toContain('`Assumption:Active`');
      expect(comment).toContain('*Automated by AssumptionTrackerAgent*');
    });

    it('should generate overdue comment', () => {
      const overdueAssumptions: Assumption[] = [
        {
          id: 'ASM-003',
          statement: 'Cache hit rate > 70%',
          owner: 'TechLead',
          status: 'active',
          validationMethod: 'Access log analysis',
          validationDate: '2025-01-01T00:00:00Z', // Past date
          createdAt: '2025-01-01T00:00:00Z',
          relatedDecisions: [],
        },
      ];

      const comment = (agent as any).buildOverdueComment(overdueAssumptions);

      expect(comment).toContain('⚠️ **Assumption 検証期限切れ: 1件**');
      expect(comment).toContain('ASM-003');
      expect(comment).toContain('Cache hit rate > 70%');
      expect(comment).toContain('days overdue');
      expect(comment).toContain('@TechLead');
      expect(comment).toContain('*Automated by AssumptionTrackerAgent*');
    });

    it('should generate invalidation comment', () => {
      const invalidatedAssumptions: Assumption[] = [
        {
          id: 'ASM-004',
          statement: '80% cache hit rate',
          owner: 'TechLead',
          status: 'invalidated',
          validationMethod: 'Access log analysis',
          validationDate: '2025-01-10T00:00:00Z',
          invalidatedReason: 'Analysis showed only 50% hit rate',
          createdAt: '2025-01-01T00:00:00Z',
          relatedDecisions: ['DEC-2025-001'],
        },
      ];

      const affectedDecisions: DecisionRecord[] = [
        {
          id: 'DEC-2025-001',
          opportunityId: 'OPP-2025-001',
          decisionType: 'adopt',
          chosenOptionId: 'OPT-001',
          decidedBy: 'ProductOwner',
          decidedAt: '2025-01-10T00:00:00Z',
          rationale: 'Best option',
          tradeoffs: [],
          alternatives: [],
        },
      ];

      const comment = (agent as any).buildInvalidationComment(
        invalidatedAssumptions,
        affectedDecisions
      );

      expect(comment).toContain('🚨 **Assumption 無効化: 1件**');
      expect(comment).toContain('ASM-004');
      expect(comment).toContain('80% cache hit rate');
      expect(comment).toContain('Analysis showed only 50% hit rate');
      expect(comment).toContain('DEC-2025-001');
      expect(comment).toContain('High');
      expect(comment).toContain('`Assumption:Invalidated`');
      expect(comment).toContain('*Automated by AssumptionTrackerAgent*');
    });

    it('should generate invalidation comment without affected decisions', () => {
      const invalidatedAssumptions: Assumption[] = [
        {
          id: 'ASM-005',
          statement: 'Test assumption',
          owner: 'TechLead',
          status: 'invalidated',
          validationMethod: 'Testing',
          invalidatedReason: 'Test failed',
          createdAt: '2025-01-01T00:00:00Z',
          relatedDecisions: [],
        },
      ];

      const comment = (agent as any).buildInvalidationComment(invalidatedAssumptions, []);

      expect(comment).toContain('🚨 **Assumption 無効化: 1件**');
      expect(comment).toContain('ASM-005');
      expect(comment).not.toContain('**Impact Analysis**');
    });

    it('should generate escalation comment', () => {
      const criticalAssumptions: Assumption[] = [
        {
          id: 'ASM-006',
          statement: 'Critical assumption',
          owner: 'TechLead',
          status: 'invalidated',
          validationMethod: 'Testing',
          invalidatedReason: 'Failed validation',
          createdAt: '2025-01-01T00:00:00Z',
          relatedDecisions: ['DEC-2025-001'],
        },
      ];

      const affectedDecisions: DecisionRecord[] = [
        {
          id: 'DEC-2025-001',
          opportunityId: 'OPP-2025-001',
          decisionType: 'adopt',
          chosenOptionId: 'OPT-001',
          decidedBy: 'ProductOwner',
          decidedAt: '2025-01-10T00:00:00Z',
          rationale: 'Best option',
          tradeoffs: [],
          alternatives: [],
        },
      ];

      const comment = (agent as any).buildEscalationComment(
        criticalAssumptions,
        affectedDecisions
      );

      expect(comment).toContain('🚨 **Critical Assumption Invalidation');
      expect(comment).toContain('Product Owner Escalation**');
      expect(comment).toContain('ASM-006');
      expect(comment).toContain('DEC-2025-001');
      expect(comment).toContain('OPT-001');
      expect(comment).toContain('@ProductOwner');
      expect(comment).toContain('*Automated by AssumptionTrackerAgent*');
    });
  });

  // ==========================================================================
  // Planning Data Integration Tests
  // ==========================================================================

  describe('Planning Data Integration', () => {
    it('should parse Planning Data from YAML frontmatter', () => {
      const issueBody = `---
planning_layer:
  assumptions:
    - id: ASM-001
      statement: Test assumption
      owner: TechLead
      status: active
      validationMethod: Testing
      createdAt: "2025-01-13T00:00:00Z"
      relatedDecisions: []
  lastUpdatedAt: "2025-01-13T00:00:00Z"
  lastUpdatedBy: AssumptionTrackerAgent
---

# Issue Content`;

      const planningData = (agent as any).parsePlanningData(issueBody);

      expect(planningData).not.toBeNull();
      expect(planningData?.assumptions?.length).toBe(1);
      expect(planningData?.assumptions?.[0].id).toBe('ASM-001');
    });

    it('should return null when no YAML frontmatter', () => {
      const issueBody = `# Issue without frontmatter`;

      const planningData = (agent as any).parsePlanningData(issueBody);

      expect(planningData).toBeNull();
    });
  });

  // ==========================================================================
  // Edge Cases Tests
  // ==========================================================================

  describe('Edge Cases', () => {
    it('should handle empty issue body', () => {
      const assumptions = (agent as any).detectAssumptions('');

      expect(assumptions).toEqual([]);
    });

    it('should handle issue body with no assumptions', () => {
      const issueBody = `# Issue Title
## Description
This is a regular issue without any assumption patterns.`;

      const assumptions = (agent as any).detectAssumptions(issueBody);

      expect(assumptions).toEqual([]);
    });

    it('should handle malformed assumption patterns', () => {
      const issueBody = `assuming
we believe
expected to be`;

      const assumptions = (agent as any).detectAssumptions(issueBody);

      // Should not detect incomplete patterns
      expect(assumptions.length).toBe(0);
    });

    it('should trim whitespace from detected assumptions', () => {
      const issueBody = `Assuming that   this has extra spaces   .`;

      const assumptions = (agent as any).detectAssumptions(issueBody);

      expect(assumptions[0]).toBe('this has extra spaces');
    });

    it('should handle multi-line assumptions', () => {
      const issueBody = `Assuming that this is a very long assumption
that spans multiple lines.`;

      const assumptions = (agent as any).detectAssumptions(issueBody);

      // Should only capture first line (stops at newline)
      expect(assumptions.length).toBeGreaterThan(0);
      expect(assumptions[0]).not.toContain('\n');
    });
  });

  // ==========================================================================
  // Issue #51: Kernel Reevaluation Integration Tests
  // ==========================================================================

  describe('Kernel Reevaluation Integration', () => {
    // Test 1: Verify assumption_invalidated trigger calls startReevaluation
    it('should call startReevaluation with assumption_invalidated trigger', async () => {
      const mockReevaluationService = {
        startReevaluation: vi.fn().mockResolvedValue({
          success: true,
          reevaluation_id: 'REV-TEST-INVALIDATED',
          issue_id: 200,
          deduplicated: false,
        }),
      };

      const mockKernelRegistry = {
        getAllKernels: vi.fn().mockResolvedValue([
          {
            id: 'KRN-TEST-001',
            statement: 'Test Kernel',
            category: 'requirement',
            owner: 'TestUser',
            maturity: 'agreed',
            decision: {
              decision_id: 'DEC-TEST-001',
              decision_type: 'adopt',
              decided_by: 'ProductOwner',
              rationale: 'Test rationale',
            },
            createdAt: new Date().toISOString(),
            lastUpdatedAt: new Date().toISOString(),
            needs: [],
            requirements: [],
            verification: [],
            validation: [],
            history: [],
          },
        ]),
      };

      const agentWithReevaluation = new AssumptionTrackerAgent(
        mockConfig,
        mockReevaluationService as any,
        mockKernelRegistry as any
      );

      const mockOctokit = {
        issues: {
          get: vi.fn().mockResolvedValue({
            data: {
              number: 100,
              title: 'Test Issue - Invalidated',
              body: `---
planning_layer:
  assumptions:
    - id: ASM-INVALIDATED-001
      statement: Assumption that was invalidated
      owner: TestUser
      status: invalidated
      invalidatedReason: Evidence showed otherwise
      validationMethod: User survey
      relatedDecisions:
        - DEC-TEST-001
      createdAt: "2026-02-10T00:00:00Z"
  decisionRecord:
    id: DEC-TEST-001
    opportunityId: OPP-001
    decisionType: adopt
    chosenOptionId: OPT-A
    decidedBy: ProductOwner
    decidedAt: "2026-02-10T00:00:00Z"
    rationale: Test rationale
    tradeoffs: []
    alternatives: []
    falsificationConditions: []
    linkedEvaluationIds: []
    remainingRisks: []
    impactScope: []
    linkedEvidence: []
---
Test issue body`,
              labels: [],
              state: 'open',
              created_at: '2026-02-10T00:00:00Z',
              updated_at: '2026-02-10T00:00:00Z',
            },
          }),
          createComment: vi.fn(),
          addLabels: vi.fn(),
        },
      };

      (agentWithReevaluation as any).octokit = mockOctokit;

      const result = await agentWithReevaluation.execute(100);

      // Verify the trigger was called
      expect(result.status).toBe('success');
      expect(mockReevaluationService.startReevaluation).toHaveBeenCalled();
      expect(mockReevaluationService.startReevaluation).toHaveBeenCalledWith(
        expect.objectContaining({
          triggerType: 'assumption_invalidated',
          kernel_id: 'KRN-TEST-001',
          triggeredBy: 'AssumptionTrackerAgent',
        })
      );
    });

    // Test 2: Verify assumption_overdue trigger calls startReevaluation
    it('should call startReevaluation with assumption_overdue trigger', async () => {
      const mockReevaluationService = {
        startReevaluation: vi.fn().mockResolvedValue({
          success: true,
          reevaluation_id: 'REV-TEST-OVERDUE',
          deduplicated: false,
        }),
      };

      const mockKernelRegistry = {
        getAllKernels: vi.fn().mockResolvedValue([
          {
            id: 'KRN-TEST-002',
            statement: 'Test Kernel 2',
            category: 'requirement',
            owner: 'TestUser',
            maturity: 'agreed',
            decision: {
              decision_id: 'DEC-TEST-002',
              decision_type: 'adopt',
              decided_by: 'ProductOwner',
              rationale: 'Test rationale',
            },
            createdAt: new Date().toISOString(),
            lastUpdatedAt: new Date().toISOString(),
            needs: [],
            requirements: [],
            verification: [],
            validation: [],
            history: [],
          },
        ]),
      };

      const agentWithReevaluation = new AssumptionTrackerAgent(
        mockConfig,
        mockReevaluationService as any,
        mockKernelRegistry as any
      );

      // Create overdue assumption (30 days ago)
      const overdueDate = new Date();
      overdueDate.setDate(overdueDate.getDate() - 30);

      const mockOctokit = {
        issues: {
          get: vi.fn().mockResolvedValue({
            data: {
              number: 101,
              title: 'Test Issue - Overdue',
              body: `---
planning_layer:
  assumptions:
    - id: ASM-OVERDUE-001
      statement: Overdue assumption needing validation
      owner: TestUser
      status: active
      validationMethod: User survey
      validationDate: "${overdueDate.toISOString()}"
      relatedDecisions:
        - DEC-TEST-002
      createdAt: "2026-01-10T00:00:00Z"
---
Test issue body`,
              labels: [],
              state: 'open',
              created_at: '2026-02-10T00:00:00Z',
              updated_at: '2026-02-10T00:00:00Z',
            },
          }),
          createComment: vi.fn(),
          addLabels: vi.fn(),
        },
      };

      (agentWithReevaluation as any).octokit = mockOctokit;

      const result = await agentWithReevaluation.execute(101);

      // Verify the trigger was called
      expect(result.status).toBe('success');
      expect(mockReevaluationService.startReevaluation).toHaveBeenCalled();
      expect(mockReevaluationService.startReevaluation).toHaveBeenCalledWith(
        expect.objectContaining({
          triggerType: 'assumption_overdue',
          kernel_id: 'KRN-TEST-002',
          triggeredBy: 'AssumptionTrackerAgent',
        })
      );
    });

    it('should trigger reevaluation for invalidated assumptions', async () => {
      const mockReevaluationService = {
        startReevaluation: vi.fn().mockResolvedValue({
          success: true,
          reevaluation_id: 'REV-TEST-001',
          issue_id: 200,
          deduplicated: false,
        }),
      };

      const mockKernelRegistry = {
        getAllKernels: vi.fn().mockResolvedValue([
          {
            id: 'KRN-TEST-001',
            statement: 'Test Kernel',
            category: 'requirement',
            owner: 'TestUser',
            maturity: 'agreed',
            decision: {
              decision_id: 'DEC-TEST-001',
              decision_type: 'adopt',
              decided_by: 'ProductOwner',
              rationale: 'Test rationale',
            },
            createdAt: new Date().toISOString(),
            lastUpdatedAt: new Date().toISOString(),
            needs: [],
            requirements: [],
            verification: [],
            validation: [],
            history: [],
          },
        ]),
      };

      const agentWithReevaluation = new AssumptionTrackerAgent(
        mockConfig,
        mockReevaluationService as any,
        mockKernelRegistry as any
      );

      const mockOctokit = {
        issues: {
          get: vi.fn().mockResolvedValue({
            data: {
              number: 100,
              title: 'Test Issue',
              body: `---
planning_layer:
  assumptions:
    - id: ASM-TEST-001
      statement: Test assumption
      owner: TestUser
      status: invalidated
      invalidatedReason: User feedback changed
      validationMethod: User survey
      relatedDecisions:
        - DEC-TEST-001
      createdAt: "2026-02-10T00:00:00Z"
  decisionRecord:
    id: DEC-TEST-001
    opportunityId: OPP-001
    decisionType: adopt
    chosenOptionId: OPT-A
    decidedBy: ProductOwner
    decidedAt: "2026-02-10T00:00:00Z"
    rationale: Test rationale
    tradeoffs: []
    alternatives: []
    falsificationConditions: []
    linkedEvaluationIds: []
    remainingRisks: []
    impactScope: []
    linkedEvidence: []
---
Test issue body`,
              labels: [],
              state: 'open',
              created_at: '2026-02-10T00:00:00Z',
              updated_at: '2026-02-10T00:00:00Z',
            },
          }),
          createComment: vi.fn(),
          addLabels: vi.fn(),
        },
      };

      (agentWithReevaluation as any).octokit = mockOctokit;

      const result = await agentWithReevaluation.execute(100);

      expect(result.status).toBe('success');
      expect(result.data?.invalidatedAssumptions.length).toBeGreaterThan(0);
      expect(result.data?.reevaluationTriggered).toBeGreaterThan(0);
      expect(result.data?.reevaluationIds).toContain('REV-TEST-001');

      // Verify startReevaluation was called with correct params
      expect(mockReevaluationService.startReevaluation).toHaveBeenCalledWith(
        expect.objectContaining({
          triggerType: 'assumption_invalidated',
          kernel_id: 'KRN-TEST-001',
          triggeredBy: 'AssumptionTrackerAgent',
          trigger_details: expect.objectContaining({
            assumption_id: 'ASM-TEST-001',
            assumption_statement: 'Test assumption',
            invalidation_reason: 'User feedback changed',
          }),
        })
      );
    });

    it('should trigger reevaluation for overdue assumptions', async () => {
      const mockReevaluationService = {
        startReevaluation: vi.fn().mockResolvedValue({
          success: true,
          reevaluation_id: 'REV-TEST-002',
          deduplicated: false,
        }),
      };

      const mockKernelRegistry = {
        getAllKernels: vi.fn().mockResolvedValue([
          {
            id: 'KRN-TEST-002',
            statement: 'Test Kernel 2',
            category: 'requirement',
            owner: 'TestUser',
            maturity: 'agreed',
            decision: {
              decision_id: 'DEC-TEST-002',
              decision_type: 'adopt',
              decided_by: 'ProductOwner',
              rationale: 'Test rationale',
            },
            createdAt: new Date().toISOString(),
            lastUpdatedAt: new Date().toISOString(),
            needs: [],
            requirements: [],
            verification: [],
            validation: [],
            history: [],
          },
        ]),
      };

      const agentWithReevaluation = new AssumptionTrackerAgent(
        mockConfig,
        mockReevaluationService as any,
        mockKernelRegistry as any
      );

      // Create overdue assumption (30 days ago)
      const overdueDate = new Date();
      overdueDate.setDate(overdueDate.getDate() - 30);

      const mockOctokit = {
        issues: {
          get: vi.fn().mockResolvedValue({
            data: {
              number: 101,
              title: 'Test Issue 2',
              body: `---
planning_layer:
  assumptions:
    - id: ASM-TEST-002
      statement: Test overdue assumption
      owner: TestUser
      status: active
      validationMethod: User survey
      validationDate: "${overdueDate.toISOString()}"
      relatedDecisions:
        - DEC-TEST-002
      createdAt: "2026-01-10T00:00:00Z"
---
Test issue body`,
              labels: [],
              state: 'open',
              created_at: '2026-02-10T00:00:00Z',
              updated_at: '2026-02-10T00:00:00Z',
            },
          }),
          createComment: vi.fn(),
          addLabels: vi.fn(),
        },
      };

      (agentWithReevaluation as any).octokit = mockOctokit;

      const result = await agentWithReevaluation.execute(101);

      expect(result.status).toBe('success');
      expect(result.data?.overdueAssumptions.length).toBeGreaterThan(0);
      expect(result.data?.reevaluationTriggered).toBeGreaterThan(0);

      // Verify startReevaluation was called for overdue
      expect(mockReevaluationService.startReevaluation).toHaveBeenCalledWith(
        expect.objectContaining({
          triggerType: 'assumption_overdue',
          kernel_id: 'KRN-TEST-002',
          triggeredBy: 'AssumptionTrackerAgent',
          trigger_details: expect.objectContaining({
            assumption_id: 'ASM-TEST-002',
            assumption_statement: 'Test overdue assumption',
            days_overdue: expect.any(Number),
          }),
        })
      );
    });

    it('should skip reevaluation when service not configured', async () => {
      // Agent without reevaluation service
      const agentWithoutReevaluation = new AssumptionTrackerAgent(mockConfig);

      const mockOctokit = {
        issues: {
          get: vi.fn().mockResolvedValue({
            data: {
              number: 102,
              title: 'Test Issue 3',
              body: `---
planning_layer:
  assumptions:
    - id: ASM-TEST-003
      statement: Test assumption
      owner: TestUser
      status: invalidated
      invalidatedReason: Test
      validationMethod: Test
      relatedDecisions:
        - DEC-TEST-003
      createdAt: "2026-02-10T00:00:00Z"
---
Test issue body`,
              labels: [],
              state: 'open',
              created_at: '2026-02-10T00:00:00Z',
              updated_at: '2026-02-10T00:00:00Z',
            },
          }),
          createComment: vi.fn(),
          addLabels: vi.fn(),
        },
      };

      (agentWithoutReevaluation as any).octokit = mockOctokit;

      const result = await agentWithoutReevaluation.execute(102);

      // Should succeed but not trigger reevaluation
      expect(result.status).toBe('success');
      expect(result.data?.reevaluationTriggered).toBe(0);
      expect(result.data?.reevaluationIds.length).toBe(0);
    });
  });
});
