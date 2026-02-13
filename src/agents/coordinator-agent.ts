/**
 * CoordinatorAgent - Task Orchestration & Parallel Execution Control
 *
 * Features:
 * - DAG-based task decomposition
 * - Critical Path analysis
 * - Parallel execution planning
 * - Agent coordination
 */

import { Octokit } from '@octokit/rest';
import {
  AgentConfig,
  AgentResult,
  GitHubIssue,
  CodeGenContext,
  ReviewContext,
  TestContext,
  DeploymentContext,
  MonitoringContext,
} from '../types';
import {
  TaskNode,
  TaskDAG,
  TaskEdge,
  ExecutionPlan,
  ExecutionStage,
  CoordinationResult,
  CriticalPathAnalysis,
  CriticalPathNode,
} from '../types/coordinator';
import { DESTAgent } from './dest-agent';
import { PlanningAgent } from './planning-agent';
import { SSOTAgentV2 } from './ssot-agent-v2';
import { CodeGenAgent } from './codegen-agent';
import { ReviewAgent } from './review-agent';
import { TestAgent } from './test-agent';
import { DeploymentAgent } from './deployment-agent';
import { MonitoringAgent } from './monitoring-agent';
import { KernelRegistryService } from '../ssot/kernel-registry';
import type { KernelWithNRVV } from '../types/nrvv';
import { getRulesConfig, ensureRulesConfigLoaded, RulesConfigService } from '../services/rules-config-service';
import {
  ContinuousImprovementService,
  type ContinuousImprovementInput,
} from '../services/continuous-improvement-service';
import {
  type ExecutionType,
  type PhaseGateResult,
  createRunContract,
  validateRunContract,
  calculateKnowledgeMetrics,
} from '../types/run-contract';
import { RunMetricsService } from '../services/run-metrics-service';

export class CoordinatorAgent {
  private octokit: Octokit;
  private config: AgentConfig;
  private destAgent: DESTAgent;
  private planningAgent: PlanningAgent;
  private ssotAgent: SSOTAgentV2;
  private codegenAgent: CodeGenAgent;
  private reviewAgent: ReviewAgent;
  private testAgent: TestAgent;
  private deploymentAgent: DeploymentAgent;
  private monitoringAgent: MonitoringAgent;
  private continuousImprovementService: ContinuousImprovementService;
  private kernelRegistry: KernelRegistryService;
  private rulesConfig: RulesConfigService;
  private metricsService: RunMetricsService;

  constructor(config: AgentConfig) {
    this.config = config;
    this.octokit = new Octokit({ auth: config.githubToken });
    this.destAgent = new DESTAgent(config);
    this.planningAgent = new PlanningAgent(config);
    this.ssotAgent = new SSOTAgentV2(config);
    this.codegenAgent = new CodeGenAgent(config);
    this.reviewAgent = new ReviewAgent(config);
    this.testAgent = new TestAgent(config);
    this.deploymentAgent = new DeploymentAgent(config);
    this.monitoringAgent = new MonitoringAgent(config);
    this.continuousImprovementService = new ContinuousImprovementService({
      githubToken: config.githubToken,
      repository: config.repository,
      dryRun: config.dryRun,
      verbose: config.verbose,
    });
    this.kernelRegistry = new KernelRegistryService();
    this.rulesConfig = getRulesConfig();
    this.metricsService = new RunMetricsService();
  }

  private log(message: string): void {
    if (this.config.verbose) {
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] [CoordinatorAgent] ${message}`);
    }
  }

  /**
   * Main execution (from Issue number)
   */
  async execute(issueNumber: number): Promise<AgentResult<CoordinationResult>> {
    const startTime = Date.now();
    this.log(`Starting coordination for issue #${issueNumber}`);

    try {
      const [owner, repo] = this.config.repository.split('/');

      // 1. Fetch Issue
      const { data: issue } = await this.octokit.issues.get({
        owner,
        repo,
        issue_number: issueNumber,
      });

      const githubIssue: GitHubIssue = {
        number: issue.number,
        title: issue.title,
        body: issue.body || '',
        labels: issue.labels.map((l) =>
          typeof l === 'string'
            ? { name: l, color: '' }
            : { name: l.name!, color: l.color! }
        ),
        state: issue.state as 'open' | 'closed',
        created_at: issue.created_at,
        updated_at: issue.updated_at,
      };

      return await this.executeWithIssue(githubIssue);
    } catch (error) {
      const endTime = Date.now();
      this.log(`Coordination failed: ${error}`);

      return {
        status: 'error',
        error: error as Error,
        metrics: {
          durationMs: endTime - startTime,
          timestamp: new Date().toISOString(),
        },
      };
    }
  }

  /**
   * Main execution (from Issue object)
   */
  async executeWithIssue(
    githubIssue: GitHubIssue
  ): Promise<AgentResult<CoordinationResult>> {
    const startTime = Date.now();
    this.log(`Starting coordination for issue #${githubIssue.number}`);

    try {
      const [owner, repo] = this.config.repository.split('/');

      // Ensure rules configuration is loaded
      await ensureRulesConfigLoaded();

      // ExecutionContext to pass data between agents
      const executionContext: any = {};

      // Phase 0: DEST Judgment (from rules-config.yaml with fallback to config)
      const destEnabled = this.rulesConfig.get<boolean>(
        'human_ai_boundary.dest_judgment.enabled',
        { fallbackToEnv: true }
      ) ?? this.config.enableDestJudgment !== false;

      if (destEnabled) {
        this.log('Phase 0: DEST Judgment');
        const destResult = await this.destAgent.execute(githubIssue.number);

        if (destResult.status === 'success' && destResult.data) {
          executionContext.destJudgment = destResult.data;
          this.log(`  AL: ${destResult.data.al}`);

          // Block if AL0
          if (destResult.data.al === 'AL0') {
            this.log('  ❌ AL0 detected - Issue blocked from implementation');
            return {
              status: 'error',
              error: new Error(`AL0 detected: ${destResult.data.rationale}. Issue blocked from implementation.`),
              metrics: {
                durationMs: Date.now() - startTime,
                timestamp: new Date().toISOString(),
              },
            };
          }

          // Issue #47: Check approval requirement (from rules-config.yaml)
          const requireApprovalLevel = this.rulesConfig.get<string>(
            'human_ai_boundary.dest_judgment.al_threshold.require_approval'
          ) || 'AL1'; // Default to AL1 if not configured

          if (destResult.data.al === requireApprovalLevel) {
            this.log(`  ⚠️  ${requireApprovalLevel} detected - Human approval required`);

            const isApproved = await this.checkApprovalRequired(githubIssue.number);

            if (!isApproved) {
              this.log(`  ❌ ${requireApprovalLevel} approval not found - Issue blocked until approved`);
              return {
                status: 'error',
                error: new Error(
                  `${requireApprovalLevel} approval required: ${destResult.data.rationale}. ` +
                  `Please add 'approved' label or '/approve' comment to proceed.`
                ),
                metrics: {
                  durationMs: Date.now() - startTime,
                  timestamp: new Date().toISOString(),
                },
              };
            }

            this.log(`  ✅ ${requireApprovalLevel} approval confirmed - Proceeding with implementation`);
          }
        }
      }

      // Phase 1: Planning Layer (from rules-config.yaml with fallback to config)
      const planningEnabled = this.rulesConfig.get<boolean>(
        'human_ai_boundary.planning_layer.enabled',
        { fallbackToEnv: true }
      ) ?? this.config.enablePlanningLayer !== false;

      if (planningEnabled) {
        this.log('Phase 1: Planning Layer');
        const planningResult = await this.planningAgent.execute(
          githubIssue.number,
          executionContext.destJudgment // Pass DEST judgment result
        );

        if (planningResult.status === 'success' && planningResult.data) {
          executionContext.planningData = planningResult.data.planningData;
          this.log(`  Planning Data: ${executionContext.planningData ? 'extracted' : 'none'}`);
        }
      }

      // Phase 0.5: SSOT Pre-execution for Kernel loading (from rules-config.yaml)
      const kernelGenerationEnabled = this.rulesConfig.get<boolean>(
        'human_ai_boundary.kernel_generation.enabled',
        { fallbackToEnv: true }
      ) ?? true;

      if (!this.config.dryRun && kernelGenerationEnabled) {
        this.log('Phase 0.5: SSOT Pre-execution for Kernel loading');

        try {
          const ssotPreResult = await this.ssotAgent.execute(
            githubIssue.number,
            {
              destJudgment: executionContext.destJudgment,
              planningData: executionContext.planningData,
            }
          );

          if (ssotPreResult.status === 'success' && ssotPreResult.data) {
            executionContext.ssotResult = ssotPreResult.data;
            this.log(`  Pre-loaded ${ssotPreResult.data.suggestedKernels.length} kernels`);
          } else {
            this.log(`  ⚠️  SSOT pre-execution failed, will use traditional task definitions`);
          }
        } catch (error) {
          this.log(`  ⚠️  SSOT pre-execution error: ${(error as Error).message}`);
          // Continue with traditional task definitions
        }
      }

      // 2. Analyze Issue & Decompose into Tasks
      const dag = await this.decomposeToDAG(githubIssue, executionContext);
      this.log(`Task decomposition complete: ${dag.nodes.size} tasks`);

      // 3. Critical Path Analysis
      const criticalPathAnalysis = this.analyzeCriticalPath(dag);
      this.log(
        `Critical path: ${criticalPathAnalysis.criticalPath.length} tasks, ` +
          `duration: ${criticalPathAnalysis.criticalPathDuration}min`
      );

      // 4. Generate Execution Plan
      const executionPlan = this.generateExecutionPlan(dag, criticalPathAnalysis);
      this.log(
        `Execution plan: ${executionPlan.stages.length} stages, ` +
          `parallelization factor: ${executionPlan.parallelizationFactor.toFixed(2)}x`
      );

      // 5. Execute Tasks (dry-run or actual)
      const { executedTasks, failedTasks } = await this.executeTasks(
        dag,
        executionPlan,
        githubIssue,
        executionContext
      );

      const endTime = Date.now();
      const actualDuration = (endTime - startTime) / 1000 / 60; // minutes

      // P0: RunContract-driven status judgment
      const executionType = this.inferExecutionType(githubIssue);
      const generatedFiles = executionContext.codeGenContext?.generatedCode?.length || 0;
      const kernelsLoaded = executionContext.ssotResult?.preLoadedKernels?.length || 0;
      const kernelsReferenced = executionContext.codeGenContext?.analysis?.relatedKernels?.length || 0;
      const kernelsCreated = executionContext.ssotResult?.suggestedKernels?.length || 0;
      const kernelsUpdated = 0; // TODO: Track Kernel updates properly
      const evidenceLinked = 0; // TODO: Track evidence linking
      const knowledgeMetrics = calculateKnowledgeMetrics(
        kernelsLoaded,
        kernelsReferenced,
        kernelsCreated,
        kernelsUpdated,
        evidenceLinked
      );

      // Phase Gate results (collect from execution)
      const gateResults: PhaseGateResult[] = [];

      // Phase Gate: Kernel minimum guarantee for feature/enhancement
      if (executionType === 'feature' || executionType === 'enhancement') {
        const kernelTotal = kernelsCreated + kernelsUpdated;
        if (kernelTotal === 0) {
          gateResults.push({
            passed: false,
            phaseName: 'Phase 0.5: SSOT Pre-execution',
            reason: 'No Kernels created or updated',
            missingItems: ['At least 1 Kernel required for feature/enhancement'],
          });
        } else {
          gateResults.push({
            passed: true,
            phaseName: 'Phase 0.5: SSOT Pre-execution',
          });
        }
      }

      // Create RunContract
      const kernelUpdates = kernelsCreated + kernelsUpdated;
      const runContract = createRunContract(
        executionType,
        generatedFiles,
        kernelUpdates,
        knowledgeMetrics,
        gateResults
      );

      const contractValidation = validateRunContract(runContract);

      // Determine overallStatus based on RunContract validation
      let overallStatus: 'success' | 'partial_success' | 'failure';
      if (!contractValidation.valid) {
        // P0: Contract violations ALWAYS result in failure (no partial)
        overallStatus = 'failure';
        this.log(`⚠️  RunContract validation failed: ${contractValidation.violations.length} violations`);
        contractValidation.violations.forEach((v) => this.log(`   - ${v}`));
      } else if (failedTasks.length === 0) {
        overallStatus = 'success';
      } else if (executedTasks.length > 0) {
        overallStatus = 'partial_success';
      } else {
        overallStatus = 'failure';
      }

      const result: CoordinationResult = {
        issueNumber: githubIssue.number,
        dag,
        executionPlan,
        executedTasks,
        failedTasks,
        overallStatus,
        metrics: {
          totalTasks: dag.nodes.size,
          completedTasks: executedTasks.length,
          failedTasks: failedTasks.length,
          actualDuration,
          estimatedDuration: executionPlan.totalEstimatedDuration,
          efficiencyRatio: actualDuration / executionPlan.totalEstimatedDuration,
        },
        knowledgeMetrics: {
          generatedFiles,
          kernelsLoaded,
          kernelsReferenced,
          kernelsCreated,
          kernelsUpdated,
          reuseRate: knowledgeMetrics.reuse_rate,
          convergenceDelta: knowledgeMetrics.convergence_delta,
        },
        contractViolations: contractValidation.valid ? undefined : contractValidation.violations,
      };

      // P1: Record metrics to run-metrics.ndjson (if not dry-run)
      if (!this.config.dryRun) {
        try {
          await this.metricsService.recordMetrics(
            githubIssue.number,
            executionType,
            overallStatus === 'success' ? 'success' : overallStatus === 'partial_success' ? 'partial' : 'failure',
            generatedFiles,
            kernelsLoaded,
            kernelsReferenced,
            kernelsCreated,
            kernelsUpdated,
            evidenceLinked,
            actualDuration * 60, // convert to seconds
            gateResults
          );
          this.log('📊 Metrics recorded to run-metrics.ndjson');
        } catch (error) {
          this.log(`⚠️  Failed to record metrics: ${(error as Error).message}`);
        }
      }

      // Phase 9: Continuous Improvement
      this.log('Phase 9: Continuous Improvement');
      try {
        const phase9Input: ContinuousImprovementInput = {
          issueNumber: githubIssue.number,
          coordinationResult: result,
          monitoringContext: executionContext.monitoringContext,
        };
        const phase9Result = await this.continuousImprovementService.execute(phase9Input);
        result.continuousImprovement = phase9Result;
        this.log(
          `  Improvement suggestions: ${phase9Result.metrics.generatedSuggestions}, ` +
            `created issues: ${phase9Result.metrics.createdIssues}`
        );
      } catch (error) {
        const warning = `Phase 9 failed: ${(error as Error).message}`;
        this.log(`  ⚠️  ${warning}`);
        result.continuousImprovement = {
          status: 'error',
          suggestions: [],
          createdIssues: [],
          warnings: [warning],
          metrics: {
            generatedSuggestions: 0,
            createdIssues: 0,
            timestamp: new Date().toISOString(),
          },
        };
      }

      // 6. Post summary comment
      if (!this.config.dryRun) {
        await this.postSummaryComment(owner, repo, githubIssue.number, result);
      }

      this.log(`Coordination complete: ${result.overallStatus}`);

      return {
        status: 'success',
        data: result,
        metrics: {
          durationMs: endTime - startTime,
          timestamp: new Date().toISOString(),
        },
      };
    } catch (error) {
      const endTime = Date.now();
      this.log(`Coordination failed: ${error}`);

      return {
        status: 'error',
        error: error as Error,
        metrics: {
          durationMs: endTime - startTime,
          timestamp: new Date().toISOString(),
        },
      };
    }
  }

  // ========================================================================
  // Task Decomposition
  // ========================================================================

  /**
   * Decompose Issue into DAG of tasks
   */
  private async decomposeToDAG(issue: GitHubIssue, executionContext: any = {}): Promise<TaskDAG> {
    const nodes = new Map<string, TaskNode>();
    const edges: TaskEdge[] = [];

    // Extract complexity from labels
    const complexityLabel = issue.labels.find((l) =>
      l.name.startsWith('complexity:')
    );
    const complexity = complexityLabel
      ? (complexityLabel.name.split(':')[1] as 'small' | 'medium' | 'large' | 'xlarge')
      : 'medium';

    // Extract type from labels
    const typeLabel = issue.labels.find((l) => l.name.startsWith('type:'));
    const type = typeLabel ? typeLabel.name.split(':')[1] : 'feature';

    // ========================================================================
    // Kernel-driven task generation (NEW)
    // ========================================================================
    let taskDefinitions: Array<{
      name: string;
      description: string;
      agent: TaskNode['agent'];
      duration: number;
      dependencies?: string[];
    }> = [];

    try {
      // 1. Load Kernel Registry
      await this.kernelRegistry.load();

      // 2. Get related Kernels from SSOT Agent
      const suggestedKernels = executionContext.ssotResult?.suggestedKernels || [];
      this.log(`  Found ${suggestedKernels.length} suggested Kernels from SSOT`);

      if (suggestedKernels.length > 0) {
        const relatedKernels: KernelWithNRVV[] = [];
        for (const kernelId of suggestedKernels) {
          const kernel = await this.kernelRegistry.getKernel(kernelId);
          if (kernel) {
            relatedKernels.push(kernel);
            this.log(`  Loaded Kernel: ${kernel.id} (${kernel.requirements.length} requirements)`);
          }
        }

        // 3. Generate tasks from Kernel Requirements
        for (const kernel of relatedKernels) {
          for (const req of kernel.requirements || []) {
            taskDefinitions.push({
              name: `Implement: ${req.statement}`,
              description: req.rationale || req.statement,
              agent: 'codegen',
              duration: this.estimateDurationFromRequirement(req),
              dependencies: [],
            });
          }

          // 4. Generate test tasks from Verification patterns
          if (kernel.verification && kernel.verification.length > 0) {
            taskDefinitions.push({
              name: `Run tests (based on ${kernel.id} Verification patterns)`,
              description: `Execute tests based on ${kernel.verification.length} verification patterns`,
              agent: 'test',
              duration: 20,
              dependencies: [], // Will be set later
            });
          }
        }

        this.log(`  Generated ${taskDefinitions.length} tasks from Kernels`);
      }
    } catch (error) {
      this.log(`  ⚠️  Kernel loading failed: ${(error as Error).message}`);
      // Fallback to traditional task definitions
    }

      // Fallback: Use traditional task definitions if no Kernel tasks generated
      if (taskDefinitions.length === 0) {
        this.log(`  Using traditional task definitions (no Kernel tasks)`);
        taskDefinitions = this.getTaskDefinitions(type, complexity);
      } else {
        // Kernel-driven generation can produce codegen/test tasks without review.
        // Add a review task so TestAgent receives required reviewContext.
        const hasCodegen = taskDefinitions.some((t) => t.agent === 'codegen');
        const hasTest = taskDefinitions.some((t) => t.agent === 'test');
        const hasReview = taskDefinitions.some((t) => t.agent === 'review');
        if (hasCodegen && hasTest && !hasReview) {
          // Find the index of the first test task
          const firstTestIndex = taskDefinitions.findIndex((t) => t.agent === 'test');

          // Insert review task before the first test task
          taskDefinitions.splice(firstTestIndex, 0, {
            name: 'Code Review (Kernel-driven)',
            description: 'Review generated code before test execution',
            agent: 'review',
            duration: 15,
            dependencies: [], // Resolved automatically below
          });
          this.log('  Added auto review task for kernel-driven test flow');
        }
      }

      // Create task nodes (first pass: assign IDs)
      for (const [index, taskDef] of taskDefinitions.entries()) {
        const taskId = `TASK-${String(index + 1).padStart(3, '0')}`;
        nodes.set(taskId, {
          id: taskId,
          name: taskDef.name,
          description: taskDef.description,
          agent: taskDef.agent,
          estimatedDuration: taskDef.duration,
          status: 'pending',
          dependencies: [],
        });
      }

      // Resolve dependencies (second pass)
      // Issue #46: Document dependency resolution algorithm for maintainability
      /**
       * Dependency Resolution Algorithm:
       *
       * 1. If task has explicit dependencies → use them as-is
       * 2. If Review task has no dependencies → auto-wire to all preceding CodeGen tasks
       * 3. If Test task has no dependencies:
       *    a. If Review exists → depend on Review
       *    b. If no Review → depend on all preceding CodeGen tasks
       *
       * This ensures correct execution order: CodeGen → Review → Test
       * even when Kernel-driven task generation omits dependency information.
       */
      for (const [index, taskDef] of taskDefinitions.entries()) {
        const taskId = `TASK-${String(index + 1).padStart(3, '0')}`;
        const node = nodes.get(taskId)!;
        let dependencies = taskDef.dependencies || [];

        // Auto-wire review/test dependencies for kernel-driven tasks that omit deps.
        if (dependencies.length === 0 && taskDef.agent === 'review') {
          // Review depends on all preceding CodeGen tasks
          dependencies = taskDefinitions
            .slice(0, index)
            .map((t, i) => ({ task: t, id: `TASK-${String(i + 1).padStart(3, '0')}` }))
            .filter((x) => x.task.agent === 'codegen')
            .map((x) => x.id);
        }

        if (dependencies.length === 0 && taskDef.agent === 'test') {
          // Check if Review exists in preceding tasks
          const reviewDeps = taskDefinitions
            .slice(0, index)
            .map((t, i) => ({ task: t, id: `TASK-${String(i + 1).padStart(3, '0')}` }))
            .filter((x) => x.task.agent === 'review')
            .map((x) => x.id);

          if (reviewDeps.length > 0) {
            // Test depends on Review (preferred path)
            dependencies = reviewDeps;
          } else {
            // Fallback: Test depends on all preceding CodeGen tasks
            dependencies = taskDefinitions
              .slice(0, index)
              .map((t, i) => ({ task: t, id: `TASK-${String(i + 1).padStart(3, '0')}` }))
              .filter((x) => x.task.agent === 'codegen')
              .map((x) => x.id);
          }
        }

        node.dependencies = dependencies;
        for (const depId of dependencies) {
          edges.push({
            from: depId,
            to: taskId,
            type: 'dependency',
          });
        }
      }

    // Identify entry and exit nodes
    const allDependencies = new Set(edges.map((e) => e.from));
    const allDependents = new Set(edges.map((e) => e.to));

    const entryNodes = Array.from(nodes.keys()).filter(
      (id) => !allDependents.has(id)
    );
    const exitNodes = Array.from(nodes.keys()).filter(
      (id) => !allDependencies.has(id)
    );

    return {
      nodes,
      edges,
      entryNodes,
      exitNodes,
    };
  }

  /**
   * Get task definitions based on type and complexity
   */
  private getTaskDefinitions(
    type: string,
    complexity: 'small' | 'medium' | 'large' | 'xlarge'
  ): Array<{
    name: string;
    description: string;
    agent: TaskNode['agent'];
    duration: number;
    dependencies?: string[];
  }> {
    // Duration multipliers based on complexity
    const durationMultiplier = {
      small: 1,
      medium: 2,
      large: 4,
      xlarge: 8,
    }[complexity];

    // Base task definitions
    const baseTasks = [
      // SSot task: Only include in dry-run mode
      // (In normal execution, SSOT is handled in Phase 0.5)
      ...(this.config.dryRun ? [{
        name: 'SSOT & Kernel Management',
        description: 'Extract decisions and manage NRVV traceability',
        agent: 'ssot' as const,
        duration: 10 * durationMultiplier,
        dependencies: [],
      }] : []),
      {
        name: 'Code Generation',
        description: 'Generate code based on requirements',
        agent: 'codegen' as const,
        duration: 30 * durationMultiplier,
        dependencies: this.config.dryRun ? ['TASK-001'] : [],
      },
      {
        name: 'Code Review',
        description: 'Review generated code for quality and security',
        agent: 'review' as const,
        duration: 15 * durationMultiplier,
        dependencies: ['TASK-002'],
      },
      {
        name: 'Test Execution',
        description: 'Run tests and generate coverage report',
        agent: 'test' as const,
        duration: 20 * durationMultiplier,
        dependencies: ['TASK-003'],
      },
      {
        name: 'Deployment',
        description: 'Deploy to target environment',
        agent: 'deployment' as const,
        duration: 10 * durationMultiplier,
        dependencies: ['TASK-004'],
      },
      {
        name: 'Monitoring',
        description: 'Monitor deployment health',
        agent: 'monitoring' as const,
        duration: 5 * durationMultiplier,
        dependencies: ['TASK-005'],
      },
    ];

    // Adjust based on type
    let filteredTasks = baseTasks;

    if (type === 'bug' || type === 'hotfix') {
      // For bugs, skip code review if small
      if (complexity === 'small') {
        filteredTasks = baseTasks.filter((t) => t.name !== 'Code Review');
      }
    }

    if (type === 'docs') {
      // For docs, skip testing and deployment
      filteredTasks = baseTasks.filter(
        (t) => !['Test Execution', 'Deployment', 'Monitoring'].includes(t.name)
      );
    }

    // Rebuild dependencies based on filtered tasks
    return filteredTasks.map((task, index) => {
      // If this task originally had dependencies, find the previous task in filtered list
      const originalDeps = task.dependencies || [];
      const newDependencies: string[] = [];

      if (originalDeps.length > 0 && index > 0) {
        // Depend on previous task in sequence
        newDependencies.push(`TASK-${String(index).padStart(3, '0')}`);
      }

      return {
        ...task,
        dependencies: newDependencies,
      };
    });
  }

  /**
   * Estimate duration from Requirement complexity
   */
  private estimateDurationFromRequirement(req: any): number {
    const constraintCount = (req.constraints || []).length;
    const baseTime = 30; // minutes

    // More constraints = more complex implementation
    if (constraintCount > 5) return baseTime * 2;
    if (constraintCount > 2) return baseTime * 1.5;
    return baseTime;
  }

  // ========================================================================
  // Critical Path Analysis
  // ========================================================================

  /**
   * Analyze critical path using PERT/CPM algorithm
   */
  private analyzeCriticalPath(dag: TaskDAG): CriticalPathAnalysis {
    const nodeAnalysis = new Map<string, CriticalPathNode>();

    // Forward pass: Calculate earliest start/finish
    const sortedNodes = this.topologicalSort(dag);

    for (const taskId of sortedNodes) {
      const task = dag.nodes.get(taskId)!;
      const dependencies = dag.edges
        .filter((e) => e.to === taskId)
        .map((e) => e.from);

      const earliestStart =
        dependencies.length === 0
          ? 0
          : Math.max(
              ...dependencies.map(
                (depId) => nodeAnalysis.get(depId)!.earliestFinish
              )
            );

      const earliestFinish = earliestStart + task.estimatedDuration;

      nodeAnalysis.set(taskId, {
        taskId,
        earliestStart,
        earliestFinish,
        latestStart: 0, // Will be calculated in backward pass
        latestFinish: 0, // Will be calculated in backward pass
        slack: 0, // Will be calculated after backward pass
        isCritical: false, // Will be determined after slack calculation
      });
    }

    // Backward pass: Calculate latest start/finish
    const projectDuration = Math.max(
      ...Array.from(nodeAnalysis.values()).map((n) => n.earliestFinish)
    );

    for (let i = sortedNodes.length - 1; i >= 0; i--) {
      const taskId = sortedNodes[i];
      const task = dag.nodes.get(taskId)!;
      const dependents = dag.edges
        .filter((e) => e.from === taskId)
        .map((e) => e.to);

      const node = nodeAnalysis.get(taskId)!;

      const latestFinish =
        dependents.length === 0
          ? projectDuration
          : Math.min(
              ...dependents.map((depId) => nodeAnalysis.get(depId)!.latestStart)
            );

      const latestStart = latestFinish - task.estimatedDuration;

      node.latestStart = latestStart;
      node.latestFinish = latestFinish;
      node.slack = latestStart - node.earliestStart;
      node.isCritical = node.slack === 0;
    }

    // Extract critical path
    const criticalPath = sortedNodes.filter(
      (taskId) => nodeAnalysis.get(taskId)!.isCritical
    );

    return {
      criticalPath,
      criticalPathDuration: projectDuration,
      nodeAnalysis,
    };
  }

  /**
   * Topological sort of DAG
   */
  private topologicalSort(dag: TaskDAG): string[] {
    const sorted: string[] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();

    const visit = (taskId: string) => {
      if (visited.has(taskId)) return;
      if (visiting.has(taskId)) {
        throw new Error(`Cycle detected in DAG at task ${taskId}`);
      }

      visiting.add(taskId);

      const dependencies = dag.edges
        .filter((e) => e.to === taskId)
        .map((e) => e.from);

      for (const depId of dependencies) {
        visit(depId);
      }

      visiting.delete(taskId);
      visited.add(taskId);
      sorted.push(taskId);
    };

    for (const taskId of dag.nodes.keys()) {
      visit(taskId);
    }

    return sorted;
  }

  // ========================================================================
  // Execution Plan Generation
  // ========================================================================

  /**
   * Generate parallel execution plan
   */
  private generateExecutionPlan(
    dag: TaskDAG,
    criticalPathAnalysis: CriticalPathAnalysis
  ): ExecutionPlan {
    const stages: ExecutionStage[] = [];
    const scheduled = new Set<string>();

    let stage = 0;

    while (scheduled.size < dag.nodes.size) {
      // Find tasks that can run in this stage
      const availableTasks = Array.from(dag.nodes.keys()).filter((taskId) => {
        if (scheduled.has(taskId)) return false;

        // Check if all dependencies are scheduled
        const dependencies = dag.edges
          .filter((e) => e.to === taskId)
          .map((e) => e.from);

        return dependencies.every((depId) => scheduled.has(depId));
      });

      if (availableTasks.length === 0) {
        throw new Error('Cannot schedule remaining tasks - possible cycle');
      }

      // Calculate stage duration (max of parallel tasks)
      const stageDuration = Math.max(
        ...availableTasks.map(
          (taskId) => dag.nodes.get(taskId)!.estimatedDuration
        )
      );

      stages.push({
        stage: stage++,
        tasks: availableTasks,
        estimatedDuration: stageDuration,
      });

      // Mark tasks as scheduled
      for (const taskId of availableTasks) {
        scheduled.add(taskId);
      }
    }

    const totalEstimatedDuration = stages.reduce(
      (sum, stage) => sum + stage.estimatedDuration,
      0
    );

    const serialDuration = Array.from(dag.nodes.values()).reduce(
      (sum, task) => sum + task.estimatedDuration,
      0
    );

    const parallelizationFactor = serialDuration / totalEstimatedDuration;

    return {
      stages,
      totalEstimatedDuration,
      criticalPath: criticalPathAnalysis.criticalPath,
      criticalPathDuration: criticalPathAnalysis.criticalPathDuration,
      parallelizationFactor,
    };
  }

  // ========================================================================
  // Task Execution
  // ========================================================================

  /**
   * Execute tasks according to plan
   */
  private async executeTasks(
    dag: TaskDAG,
    plan: ExecutionPlan,
    issue: GitHubIssue,
    executionContext: any = {}
  ): Promise<{ executedTasks: TaskNode[]; failedTasks: TaskNode[] }> {
    const executedTasks: TaskNode[] = [];
    const failedTasks: TaskNode[] = [];

    // Ensure execution context has all required properties
    // (planningData and destJudgment are added by executeWithIssue)

    this.log(`Executing ${plan.stages.length} stages`);

    for (const stage of plan.stages) {
      this.log(
        `Stage ${stage.stage}: ${stage.tasks.length} tasks in parallel`
      );

      // Execute all tasks in this stage in parallel
      const stagePromises = stage.tasks.map((taskId) =>
        this.executeTask(dag.nodes.get(taskId)!, issue, executionContext)
      );

      const stageResults = await Promise.allSettled(stagePromises);

      for (let i = 0; i < stage.tasks.length; i++) {
        const taskId = stage.tasks[i];
        const task = dag.nodes.get(taskId)!;
        const result = stageResults[i];

        if (result.status === 'fulfilled') {
          task.status = 'completed';
          task.completedAt = new Date().toISOString();
          task.result = result.value;
          executedTasks.push(task);
          this.log(`Task ${taskId} completed successfully`);
        } else {
          task.status = 'failed';
          task.error = result.reason;
          failedTasks.push(task);
          this.log(`Task ${taskId} failed: ${result.reason.message}`);
        }
      }

      // Stop if critical path task failed
      const criticalTaskFailed = stage.tasks.some(
        (taskId) =>
          plan.criticalPath.includes(taskId) &&
          failedTasks.some((t) => t.id === taskId)
      );

      if (criticalTaskFailed) {
        this.log(
          'Critical path task failed, stopping execution'
        );
        break;
      }
    }

    return { executedTasks, failedTasks };
  }

  /**
   * Execute a single task
   */
  private async executeTask(
    task: TaskNode,
    issue: GitHubIssue,
    executionContext: {
      ssotResult?: any;
      codeGenContext?: CodeGenContext;
      reviewContext?: ReviewContext;
      testContext?: TestContext;
      deploymentContext?: DeploymentContext;
      monitoringContext?: MonitoringContext;
    }
  ): Promise<any> {
    task.status = 'in_progress';
    task.startedAt = new Date().toISOString();

    this.log(`Executing task ${task.id}: ${task.name}`);

    // In dry-run mode, simulate execution
    if (this.config.dryRun) {
      await this.simulateTask(task);
      return null;
    }

    // Execute actual agent based on task agent type
    try {
      switch (task.agent) {
        case 'ssot': {
          // Check if already executed in Phase 0.5
          if (executionContext.ssotResult) {
            this.log('SSOT already executed in Phase 0.5, reusing result');
            return executionContext.ssotResult;
          }

          // Otherwise, execute normally (e.g., in dry-run mode)
          const result = await this.ssotAgent.execute(
            issue.number,
            {
              destJudgment: (executionContext as any).destJudgment,
              planningData: (executionContext as any).planningData,
            }
          );
          if (result.status === 'success' && result.data) {
            executionContext.ssotResult = result.data;
            this.log(`SSOT: ${result.data.suggestedKernels.length} kernels managed`);
            return result.data;
          }
          throw new Error('SSOT failed: ' + (result.error?.message || 'Unknown error'));
        }

        case 'codegen': {
          const result = await this.codegenAgent.execute(issue.number);
          if (result.status === 'success' && result.data) {
            executionContext.codeGenContext = result.data;
            return result.data;
          }
          throw new Error('CodeGen failed: ' + (result.error?.message || 'Unknown error'));
        }

        case 'review': {
          if (!executionContext.codeGenContext) {
            throw new Error('Review requires CodeGen context');
          }
          const result = await this.reviewAgent.execute(
            issue.number,
            executionContext.codeGenContext
          );
          if (result.status === 'success' && result.data) {
            executionContext.reviewContext = result.data;
            return result.data;
          }
          throw new Error('Review failed: ' + (result.error?.message || 'Unknown error'));
        }

        case 'test': {
          if (!executionContext.codeGenContext || !executionContext.reviewContext) {
            throw new Error('Test requires CodeGen and Review context');
          }
          const result = await this.testAgent.execute(
            issue.number,
            executionContext.codeGenContext,
            executionContext.reviewContext
          );
          if (result.status === 'success' && result.data) {
            executionContext.testContext = result.data;
            return result.data;
          }
          throw new Error('Test failed: ' + (result.error?.message || 'Unknown error'));
        }

        case 'deployment': {
          if (!executionContext.codeGenContext || !executionContext.reviewContext || !executionContext.testContext) {
            throw new Error('Deployment requires CodeGen, Review, and Test context');
          }
          const result = await this.deploymentAgent.execute(
            issue.number,
            executionContext.codeGenContext,
            executionContext.reviewContext,
            executionContext.testContext
          );
          if (result.status === 'success' && result.data) {
            executionContext.deploymentContext = result.data;
            return result.data;
          }
          throw new Error('Deployment failed: ' + (result.error?.message || 'Unknown error'));
        }

        case 'monitoring': {
          if (!executionContext.deploymentContext) {
            throw new Error('Monitoring requires Deployment context');
          }
          const result = await this.monitoringAgent.execute(
            issue.number,
            executionContext.deploymentContext
          );
          if (result.status === 'success' && result.data) {
            executionContext.monitoringContext = result.data;
            return result.data;
          }
          throw new Error('Monitoring failed: ' + (result.error?.message || 'Unknown error'));
        }

        default:
          throw new Error(`Unknown agent type: ${task.agent}`);
      }
    } catch (error) {
      this.log(`Task ${task.id} execution failed: ${error}`);
      throw error;
    }
  }

  /**
   * Simulate task execution (for testing)
   */
  private async simulateTask(task: TaskNode): Promise<void> {
    // Simulate work with random duration (50-150% of estimate)
    const simulatedDuration =
      task.estimatedDuration * (0.5 + Math.random());

    await new Promise((resolve) =>
      setTimeout(resolve, simulatedDuration * 100)
    ); // Scale down for testing

    // Simulate occasional failures (10% chance)
    if (Math.random() < 0.1) {
      throw new Error(`Simulated failure for task ${task.id}`);
    }
  }

  // ========================================================================
  // Comment Generation
  // ========================================================================

  /**
   * Post summary comment to Issue
   */
  private async postSummaryComment(
    owner: string,
    repo: string,
    issueNumber: number,
    result: CoordinationResult
  ): Promise<void> {
    const comment = this.buildSummaryComment(result);

    await this.octokit.issues.createComment({
      owner,
      repo,
      issue_number: issueNumber,
      body: comment,
    });

    this.log('Summary comment posted');
  }

  /**
   * Build summary comment
   */
  private buildSummaryComment(result: CoordinationResult): string {
    const statusEmoji =
      result.overallStatus === 'success'
        ? '✅'
        : result.overallStatus === 'partial_success'
        ? '⚠️'
        : '❌';

    let comment = `${statusEmoji} **Coordination Summary**\n\n`;

    comment += `**Overall Status**: ${result.overallStatus}\n\n`;

    comment += `**Execution Metrics**:\n`;
    comment += `- Total Tasks: ${result.metrics.totalTasks}\n`;
    comment += `- Completed: ${result.metrics.completedTasks}\n`;
    comment += `- Failed: ${result.metrics.failedTasks}\n`;
    comment += `- Estimated Duration: ${result.metrics.estimatedDuration.toFixed(1)}min\n`;
    comment += `- Actual Duration: ${result.metrics.actualDuration.toFixed(1)}min\n`;
    comment += `- Efficiency: ${(result.metrics.efficiencyRatio * 100).toFixed(0)}%\n\n`;

    comment += `**Execution Plan**:\n`;
    comment += `- Stages: ${result.executionPlan.stages.length}\n`;
    comment += `- Critical Path: ${result.executionPlan.criticalPath.length} tasks\n`;
    comment += `- Critical Path Duration: ${result.executionPlan.criticalPathDuration.toFixed(1)}min\n`;
    comment += `- Parallelization Factor: ${result.executionPlan.parallelizationFactor.toFixed(2)}x\n\n`;

    // P1: Knowledge Metrics
    if (result.knowledgeMetrics) {
      comment += `**📊 Knowledge Metrics**:\n`;
      comment += `- Generated Files: ${result.knowledgeMetrics.generatedFiles}\n`;
      comment += `- Kernels Loaded: ${result.knowledgeMetrics.kernelsLoaded}\n`;
      comment += `- Kernels Referenced: ${result.knowledgeMetrics.kernelsReferenced}\n`;
      comment += `- Kernels Created: ${result.knowledgeMetrics.kernelsCreated}\n`;
      comment += `- Kernels Updated: ${result.knowledgeMetrics.kernelsUpdated}\n`;
      comment += `- Knowledge Reuse Rate: ${(result.knowledgeMetrics.reuseRate * 100).toFixed(1)}%\n`;
      comment += `- Convergence Delta: ${(result.knowledgeMetrics.convergenceDelta * 100).toFixed(1)}%\n\n`;
    }

    // P0: Contract Violations
    if (result.contractViolations && result.contractViolations.length > 0) {
      comment += `**⚠️ Contract Violations**:\n`;
      for (const violation of result.contractViolations) {
        comment += `- ${violation}\n`;
      }
      comment += `\n`;
    }

    if (result.continuousImprovement) {
      comment += `**Phase 9 (Continuous Improvement)**:\n`;
      comment += `- Status: ${result.continuousImprovement.status}\n`;
      comment += `- Suggestions: ${result.continuousImprovement.metrics.generatedSuggestions}\n`;
      comment += `- Created Issues: ${result.continuousImprovement.metrics.createdIssues}\n`;
      if (result.continuousImprovement.warnings.length > 0) {
        comment += `- Warnings:\n`;
        for (const warning of result.continuousImprovement.warnings) {
          comment += `  - ${warning}\n`;
        }
      }
      comment += `\n`;
    }

    if (result.failedTasks.length > 0) {
      comment += `**Failed Tasks**:\n`;
      for (const task of result.failedTasks) {
        comment += `- ${task.id}: ${task.name}\n`;
        if (task.error) {
          comment += `  Error: ${task.error.message}\n`;
        }
      }
      comment += `\n`;
    }

    comment += `---\n*Automated by CoordinatorAgent*`;

    return comment;
  }

  /**
   * Check if approval-required issue has been approved
   * Issue #47: Human approval gate for approval-required issues
   * Reads approval labels and commands from rules-config.yaml
   */
  private async checkApprovalRequired(issueNumber: number): Promise<boolean> {
    const [owner, repo] = this.config.repository.split('/');

    try {
      // Get approval detection config from rules-config.yaml
      const approvalLabels = this.rulesConfig.get<string[]>(
        'human_ai_boundary.dest_judgment.approval_detection.labels'
      ) || ['approved']; // Fallback to minimal default

      const approvalCommands = this.rulesConfig.get<string[]>(
        'human_ai_boundary.dest_judgment.approval_detection.commands'
      ) || ['/approve']; // Fallback to minimal default

      // 1. Check issue labels for approval
      const { data: issue } = await this.octokit.issues.get({
        owner,
        repo,
        issue_number: issueNumber,
      });

      const labels = issue.labels.map((label) =>
        typeof label === 'string' ? label : label.name || ''
      );

      // Check for approval labels (case-insensitive)
      const hasApprovalLabel = labels.some((label) =>
        approvalLabels.some((approvalLabel) =>
          label.toLowerCase().includes(approvalLabel.toLowerCase())
        )
      );

      if (hasApprovalLabel) {
        this.log(`  Found approval label: ${labels.find((l) => approvalLabels.some((a) => l.toLowerCase().includes(a.toLowerCase())))}`);
        return true;
      }

      // 2. Check issue comments for approval commands
      const { data: comments } = await this.octokit.issues.listComments({
        owner,
        repo,
        issue_number: issueNumber,
      });

      // Check for approval commands in comments (case-insensitive)
      const hasApprovalComment = comments.some((comment) => {
        const commentBody = comment.body?.toLowerCase() || '';
        return approvalCommands.some((cmd) =>
          commentBody.includes(cmd.toLowerCase())
        );
      });

      if (hasApprovalComment) {
        const foundCommand = approvalCommands.find((cmd) =>
          comments.some((c) => c.body?.toLowerCase().includes(cmd.toLowerCase()))
        );
        this.log(`  Found approval command: ${foundCommand}`);
        return true;
      }

      // No approval found
      return false;
    } catch (error) {
      this.log(`  ⚠️  Failed to check approval: ${(error as Error).message}`);
      // Fail-safe: Block if we can't verify approval
      return false;
    }
  }

  /**
   * Infer ExecutionType from GitHub Issue labels
   */
  private inferExecutionType(issue: GitHubIssue): ExecutionType {
    const labels = issue.labels.map((l: any) => l.name.toLowerCase());
    const title = issue.title.toLowerCase();

    // Check labels first
    if (labels.some((l) => l.includes('bug') || l.includes('fix'))) {
      return 'bug';
    }
    if (labels.some((l) => l.includes('enhancement'))) {
      return 'enhancement';
    }
    if (labels.some((l) => l.includes('refactor'))) {
      return 'refactor';
    }
    if (labels.some((l) => l.includes('test'))) {
      return 'test';
    }
    if (labels.some((l) => l.includes('docs') || l.includes('documentation'))) {
      return 'docs';
    }
    if (labels.some((l) => l.includes('chore'))) {
      return 'chore';
    }

    // Check title for hints
    if (title.includes('fix') || title.includes('bug')) {
      return 'bug';
    }
    if (title.includes('refactor')) {
      return 'refactor';
    }
    if (title.includes('test')) {
      return 'test';
    }
    if (title.includes('doc')) {
      return 'docs';
    }

    // Default: feature (most strict requirements)
    return 'feature';
  }
}
