/**
 * Continuous Improvement Types (Issue #52)
 */

export type ImprovementPriority = 'P0' | 'P1' | 'P2';

export interface ImprovementEvidence {
  issueNumber: number;
  failedTasks: number;
  totalTasks: number;
  overallStatus: 'success' | 'partial_success' | 'failure';
  qualityScore?: number;
  alertCount?: number;
}

export interface ImprovementSuggestion {
  id: string;
  title: string;
  description: string;
  priority: ImprovementPriority;
  category: 'quality' | 'reliability' | 'process' | 'security';
  recommendedAction: string;
  labels: string[];
  evidence: ImprovementEvidence;
}

export interface CreatedImprovementIssue {
  number: number;
  url?: string;
  title: string;
}

export interface ContinuousImprovementResult {
  status: 'success' | 'partial_success' | 'error';
  suggestions: ImprovementSuggestion[];
  createdIssues: CreatedImprovementIssue[];
  warnings: string[];
  metrics: {
    generatedSuggestions: number;
    createdIssues: number;
    timestamp: string;
  };
}

