/**
 * ContinuousImprovementService (Issue #52)
 *
 * Generates improvement suggestions from coordination/monitoring outputs.
 * In production mode, optionally creates GitHub issues for suggestions.
 */

import { Octokit } from '@octokit/rest';
import type { CoordinationResult } from '../types/coordinator';
import type { MonitoringContext } from '../types';
import { ensureRulesConfigLoaded, getRulesConfig, RulesConfigService } from './rules-config-service';
import type {
  ContinuousImprovementResult,
  CreatedImprovementIssue,
  ImprovementSuggestion,
} from '../types/continuous-improvement';

export interface ContinuousImprovementServiceConfig {
  githubToken: string;
  repository: string;
  dryRun?: boolean;
  verbose?: boolean;
}

interface ContinuousImprovementThresholds {
  failureRateThreshold: number;
  qualityScoreThreshold: number;
  qualityCriticalThreshold: number;
  alertCountThreshold: number;
}

export interface ContinuousImprovementInput {
  issueNumber: number;
  coordinationResult: CoordinationResult;
  monitoringContext?: MonitoringContext;
}

export class ContinuousImprovementService {
  private readonly config: ContinuousImprovementServiceConfig;
  private readonly octokit: Octokit;
  private readonly rulesConfig: RulesConfigService;

  constructor(config: ContinuousImprovementServiceConfig) {
    this.config = config;
    this.octokit = new Octokit({ auth: config.githubToken });
    this.rulesConfig = getRulesConfig();
  }

  private log(message: string): void {
    if (this.config.verbose) {
      console.log(`[${new Date().toISOString()}] [ContinuousImprovementService] ${message}`);
    }
  }

  async execute(input: ContinuousImprovementInput): Promise<ContinuousImprovementResult> {
    try {
      await ensureRulesConfigLoaded();
      const suggestions = this.generateSuggestions(input);
      const createdIssues: CreatedImprovementIssue[] = [];
      const warnings: string[] = [];

      if (this.config.dryRun) {
        this.log(`Dry-run mode: generated ${suggestions.length} suggestion(s)`);
      } else {
        for (const suggestion of suggestions) {
          try {
            const created = await this.createImprovementIssue(input.issueNumber, suggestion);
            createdIssues.push(created);
          } catch (error) {
            const message = `Failed to create issue for suggestion ${suggestion.id}: ${(error as Error).message}`;
            this.log(message);
            warnings.push(message);
          }
        }
      }

      return {
        status: warnings.length > 0 ? 'partial_success' : 'success',
        suggestions,
        createdIssues,
        warnings,
        metrics: {
          generatedSuggestions: suggestions.length,
          createdIssues: createdIssues.length,
          timestamp: new Date().toISOString(),
        },
      };
    } catch (error) {
      return {
        status: 'error',
        suggestions: [],
        createdIssues: [],
        warnings: [(error as Error).message],
        metrics: {
          generatedSuggestions: 0,
          createdIssues: 0,
          timestamp: new Date().toISOString(),
        },
      };
    }
  }

  private generateSuggestions(input: ContinuousImprovementInput): ImprovementSuggestion[] {
    const suggestions: ImprovementSuggestion[] = [];
    const { coordinationResult, monitoringContext, issueNumber } = input;
    const thresholds = this.getThresholds();

    const failedTasks = coordinationResult.metrics.failedTasks;
    const totalTasks = Math.max(1, coordinationResult.metrics.totalTasks);
    const failureRate = failedTasks / totalTasks;
    const qualityScore = monitoringContext?.metrics.find((m) => m.name === 'quality_score')?.value;
    const alertCount = monitoringContext?.alerts.filter((a) => !a.resolved).length ?? 0;

    if (failureRate >= thresholds.failureRateThreshold || coordinationResult.overallStatus === 'failure') {
      suggestions.push({
        id: this.generateSuggestionId('reliability'),
        title: 'Improve task dependency reliability in Coordinator flow',
        description:
          'High task failure rate was detected. Strengthen dependency validation and preflight checks before task execution.',
        priority: 'P0',
        category: 'reliability',
        recommendedAction: 'Add preflight dependency validation and fail-fast checks for required execution contexts.',
        labels: ['improvement', 'phase9', 'priority:p0', 'area:coordinator'],
        evidence: {
          issueNumber,
          failedTasks,
          totalTasks,
          overallStatus: coordinationResult.overallStatus,
          qualityScore,
          alertCount,
        },
      });
    }

    if (qualityScore !== undefined && qualityScore < thresholds.qualityScoreThreshold) {
      suggestions.push({
        id: this.generateSuggestionId('quality'),
        title: 'Raise code quality gate consistency',
        description:
          'Quality score dropped below target threshold. Tune review rules and enforce quality remediation before merge.',
        priority: qualityScore < thresholds.qualityCriticalThreshold ? 'P0' : 'P1',
        category: 'quality',
        recommendedAction: 'Adjust review/test gate settings and add automated checks for quality regressions.',
        labels: ['improvement', 'phase9', 'area:quality'],
        evidence: {
          issueNumber,
          failedTasks,
          totalTasks,
          overallStatus: coordinationResult.overallStatus,
          qualityScore,
          alertCount,
        },
      });
    }

    if (alertCount >= thresholds.alertCountThreshold) {
      suggestions.push({
        id: this.generateSuggestionId('process'),
        title: 'Reduce monitoring alerts via operational hardening',
        description:
          'Multiple unresolved alerts were observed after deployment. Improve alert routing and response playbooks.',
        priority: 'P1',
        category: 'process',
        recommendedAction: 'Define runbooks for top alerts and add auto-remediation for recurring incidents.',
        labels: ['improvement', 'phase9', 'area:monitoring'],
        evidence: {
          issueNumber,
          failedTasks,
          totalTasks,
          overallStatus: coordinationResult.overallStatus,
          qualityScore,
          alertCount,
        },
      });
    }

    if (suggestions.length === 0) {
      suggestions.push({
        id: this.generateSuggestionId('process'),
        title: 'Maintain current execution quality baseline',
        description:
          'No critical degradation detected. Keep baseline by reviewing thresholds and ensuring weekly KPI checks are performed.',
        priority: 'P2',
        category: 'process',
        recommendedAction: 'Run weekly KPI review and refresh rules-config thresholds if needed.',
        labels: ['improvement', 'phase9', 'priority:p2'],
        evidence: {
          issueNumber,
          failedTasks,
          totalTasks,
          overallStatus: coordinationResult.overallStatus,
          qualityScore,
          alertCount,
        },
      });
    }

    return suggestions;
  }

  private async createImprovementIssue(
    sourceIssueNumber: number,
    suggestion: ImprovementSuggestion
  ): Promise<CreatedImprovementIssue> {
    const [owner, repo] = this.config.repository.split('/');
    const response = await this.octokit.issues.create({
      owner,
      repo,
      title: `[Phase 9] ${suggestion.title}`,
      body: this.buildIssueBody(sourceIssueNumber, suggestion),
      labels: suggestion.labels,
    });

    this.log(`Created improvement issue #${response.data.number}`);
    return {
      number: response.data.number,
      url: response.data.html_url,
      title: response.data.title,
    };
  }

  private buildIssueBody(sourceIssueNumber: number, suggestion: ImprovementSuggestion): string {
    const evidence = suggestion.evidence;
    return [
      `## Continuous Improvement Suggestion`,
      ``,
      `Source Issue: #${sourceIssueNumber}`,
      `Suggestion ID: ${suggestion.id}`,
      `Priority: ${suggestion.priority}`,
      `Category: ${suggestion.category}`,
      ``,
      `### Description`,
      suggestion.description,
      ``,
      `### Recommended Action`,
      suggestion.recommendedAction,
      ``,
      `### Evidence`,
      `- Overall Status: ${evidence.overallStatus}`,
      `- Failed Tasks: ${evidence.failedTasks}/${evidence.totalTasks}`,
      `- Quality Score: ${evidence.qualityScore ?? 'N/A'}`,
      `- Alert Count: ${evidence.alertCount ?? 0}`,
      ``,
      `---`,
      `*Generated by ContinuousImprovementService (Phase 9)*`,
    ].join('\n');
  }

  private generateSuggestionId(category: string): string {
    return `IMP-${category.toUpperCase()}-${Date.now()}-${Math.floor(Math.random() * 10000)
      .toString()
      .padStart(4, '0')}`;
  }

  private getThresholds(): ContinuousImprovementThresholds {
    return {
      failureRateThreshold:
        this.rulesConfig.get<number>('human_ai_boundary.continuous_improvement.thresholds.failure_rate') ?? 0.3,
      qualityScoreThreshold:
        this.rulesConfig.get<number>('human_ai_boundary.continuous_improvement.thresholds.quality_score') ?? 80,
      qualityCriticalThreshold:
        this.rulesConfig.get<number>('human_ai_boundary.continuous_improvement.thresholds.quality_critical') ?? 70,
      alertCountThreshold:
        this.rulesConfig.get<number>('human_ai_boundary.continuous_improvement.thresholds.alert_count') ?? 3,
    };
  }
}
