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
import { getRulesConfig, RulesConfigService } from '../services/rules-config-service';

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
  private kernelRegistry: KernelRegistryService;
  private rulesConfig: RulesConfigService;

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
    this.kernelRegistry = new KernelRegistryService();
    this.rulesConfig = getRulesConfig();
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

      // Load rules configuration
      if (!this.rulesConfig.isLoaded()) {
        await this.rulesConfig.load();
      }

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

      const result: CoordinationResult = {
        issueNumber: githubIssue.number,
        dag,
        executionPlan,
        executedTasks,
        failedTasks,
        overallStatus:
          failedTasks.length === 0
            ? 'success'
            : executedTasks.length > 0
            ? 'partial_success'
            : 'failure',
        metrics: {
          totalTasks: dag.nodes.size,
          completedTasks: executedTasks.length,
          failedTasks: failedTasks.length,
          actualDuration,
          estimatedDuration: executionPlan.totalEstimatedDuration,
          efficiencyRatio: actualDuration / executionPlan.totalEstimatedDuration,
        },
      };

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
    }

    // Create task nodes
    for (const [index, taskDef] of taskDefinitions.entries()) {
      const taskId = `TASK-${String(index + 1).padStart(3, '0')}`;
      nodes.set(taskId, {
        id: taskId,
        name: taskDef.name,
        description: taskDef.description,
        agent: taskDef.agent,
        estimatedDuration: taskDef.duration,
        status: 'pending',
        dependencies: taskDef.dependencies || [],
      });

      // Create edges for dependencies
      if (taskDef.dependencies) {
        for (const depId of taskDef.dependencies) {
          edges.push({
            from: depId,
            to: taskId,
            type: 'dependency',
          });
        }
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
      {
        name: 'SSOT & Kernel Management',
        description: 'Extract decisions and manage NRVV traceability',
        agent: 'ssot' as const,
        duration: 10 * durationMultiplier,
        dependencies: [],
      },
      {
        name: 'Code Generation',
        description: 'Generate code based on requirements',
        agent: 'codegen' as const,
        duration: 30 * durationMultiplier,
        dependencies: ['TASK-001'],
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
          // Pass DEST Judgment and PlanningData to SSOT
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
}
