/**
 * Coordinator Agent Type Definitions
 */
import type { ContinuousImprovementResult } from './continuous-improvement';

// =============================================================================
// Task Graph Types
// =============================================================================

export interface TaskNode {
  id: string; // TASK-NNN
  name: string;
  description: string;
  agent: 'ssot' | 'codegen' | 'review' | 'test' | 'deployment' | 'monitoring';
  estimatedDuration: number; // minutes
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'blocked';
  dependencies: string[]; // Task IDs that must complete first
  startedAt?: string;
  completedAt?: string;
  result?: any;
  error?: Error;
}

export interface TaskEdge {
  from: string; // Task ID
  to: string; // Task ID
  type: 'dependency' | 'data_flow';
}

export interface TaskDAG {
  nodes: Map<string, TaskNode>;
  edges: TaskEdge[];
  entryNodes: string[]; // Tasks with no dependencies
  exitNodes: string[]; // Tasks with no dependents
}

// =============================================================================
// Execution Plan Types
// =============================================================================

export interface ExecutionStage {
  stage: number;
  tasks: string[]; // Task IDs that can run in parallel
  estimatedDuration: number; // Max duration of tasks in this stage
}

export interface ExecutionPlan {
  stages: ExecutionStage[];
  totalEstimatedDuration: number;
  criticalPath: string[]; // Task IDs on critical path
  criticalPathDuration: number;
  parallelizationFactor: number; // speedup from parallelization
}

// =============================================================================
// Coordination Types
// =============================================================================

export interface CoordinationResult {
  issueNumber: number;
  dag: TaskDAG;
  executionPlan: ExecutionPlan;
  executedTasks: TaskNode[];
  failedTasks: TaskNode[];
  overallStatus: 'success' | 'partial_success' | 'failure';
  continuousImprovement?: ContinuousImprovementResult;
  metrics: {
    totalTasks: number;
    completedTasks: number;
    failedTasks: number;
    actualDuration: number;
    estimatedDuration: number;
    efficiencyRatio: number; // actual / estimated
  };
}

// =============================================================================
// Critical Path Analysis
// =============================================================================

export interface CriticalPathNode {
  taskId: string;
  earliestStart: number;
  earliestFinish: number;
  latestStart: number;
  latestFinish: number;
  slack: number; // latestStart - earliestStart
  isCritical: boolean;
}

export interface CriticalPathAnalysis {
  criticalPath: string[];
  criticalPathDuration: number;
  nodeAnalysis: Map<string, CriticalPathNode>;
}
