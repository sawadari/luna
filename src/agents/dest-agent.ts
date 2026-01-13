#!/usr/bin/env node
/**
 * DESTAgent - Assurance Level Judgment Agent
 *
 * Evaluates Issues/PRs for AL (AL0/AL1/AL2) and detects AL0 Reasons
 */

import { Octokit } from '@octokit/rest';
import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { ALJudge } from './al-judge.js';
import { AL0ReasonDetector } from './al0-reason-detector.js';
import { ProtocolRouter } from './protocol-router.js';
import type {
  AgentConfig,
  AgentResult,
  DESTJudgmentResult,
  GitHubIssue,
  AL,
  AL0Reason,
  Protocol,
} from '../types/index.js';

export class DESTAgent {
  private octokit: Octokit;
  private config: AgentConfig;
  private owner: string;
  private repo: string;
  private startTime: number;

  constructor(config: AgentConfig) {
    this.config = config;
    this.octokit = new Octokit({ auth: config.githubToken });

    // Parse repository (owner/repo)
    const [owner, repo] = config.repository.split('/');
    if (!owner || !repo) {
      throw new Error(`Invalid repository format: ${config.repository}. Expected: owner/repo`);
    }
    this.owner = owner;
    this.repo = repo;
    this.startTime = Date.now();
  }

  /**
   * Execute DEST judgment on an Issue
   */
  async execute(issueNumber: number): Promise<AgentResult<DESTJudgmentResult>> {
    try {
      this.log('🔍 DEST judgment starting');
      this.log(`   Issue #${issueNumber}`);

      // 1. Fetch Issue
      const issue = await this.fetchIssue(issueNumber);
      this.log(`   Title: ${issue.title}`);

      // 2. Check if Issue has required DEST fields
      if (!issue.body || !ALJudge.hasRequiredFields(issue.body)) {
        this.log('   ⏭️ Skipping: No Outcome/Safety Assessment fields');
        return {
          status: 'success',
          data: undefined,
          metrics: {
            durationMs: Date.now() - this.startTime,
            timestamp: new Date().toISOString(),
          },
        };
      }

      // 3. Perform AL judgment
      const { al, outcome, safety } = ALJudge.judgeFromIssue(issue.body);
      this.log(`   Outcome: ${outcome.progress} (outcome_ok=${outcome.outcomeOk})`);
      this.log(`   Safety: ${safety.feedbackLoops}, violations=${safety.violations.length} (safety_ok=${safety.safetyOk})`);
      this.log(`   → AL: ${al}`);

      // 4. Detect AL0 Reasons (if AL0)
      let al0Reasons: AL0Reason[] = [];
      let protocol: Protocol | null = null;

      if (al === 'AL0') {
        this.log('   Detecting AL0 Reasons...');
        al0Reasons = AL0ReasonDetector.detect(issue.body);
        this.log(`   → Detected: ${al0Reasons.join(', ') || 'none'}`);

        // 5. Route Protocol
        if (al0Reasons.length > 0) {
          protocol = ProtocolRouter.route(al0Reasons);
          this.log(`   → Protocol: ${protocol}`);
        }
      }

      // 6. Build judgment result
      const judgmentResult: DESTJudgmentResult = {
        judgmentId: this.generateJudgmentId(),
        issueNumber,
        judgedAt: new Date().toISOString(),
        judgedBy: 'DESTAgent',
        al,
        outcomeOk: outcome.outcomeOk,
        safetyOk: safety.safetyOk,
        al0Reasons,
        protocol,
        safetyChecks: [], // TODO: Implement safety check detection
        leveragePoints: [], // TODO: Implement leverage point detection
        rationale: protocol ? ProtocolRouter.getRationale(protocol, al0Reasons) : this.buildRationale(al, outcome, safety),
        nextActions: protocol ? ProtocolRouter.getNextActions(protocol) : [],
        escalation: this.determineEscalation(al, al0Reasons, protocol),
        labels: this.buildLabels(al, al0Reasons, protocol),
      };

      // 7. Apply labels (if not dry run)
      if (!this.config.dryRun) {
        await this.applyLabels(issueNumber, judgmentResult.labels);
        this.log(`   Applied labels: ${judgmentResult.labels.join(', ')}`);
      } else {
        this.log(`   [DRY RUN] Would apply labels: ${judgmentResult.labels.join(', ')}`);
      }

      // 8. Post judgment comment (if not dry run)
      if (!this.config.dryRun) {
        await this.postJudgmentComment(issueNumber, judgmentResult);
        this.log(`   Posted judgment comment`);
      } else {
        this.log(`   [DRY RUN] Would post judgment comment`);
      }

      // 9. Save judgment result to file
      await this.saveJudgmentResult(judgmentResult);

      const durationMs = Date.now() - this.startTime;
      this.log(`✅ DEST judgment complete (${(durationMs / 1000).toFixed(1)}s)`);

      // 10. Escalate if needed
      if (judgmentResult.escalation) {
        this.log(`🚨 Escalation: ${judgmentResult.escalation}`);
      }

      return {
        status: 'success',
        data: judgmentResult,
        metrics: {
          durationMs,
          timestamp: new Date().toISOString(),
        },
      };
    } catch (error) {
      this.log(`❌ Error: ${(error as Error).message}`);
      return {
        status: 'error',
        error: error as Error,
        metrics: {
          durationMs: Date.now() - this.startTime,
          timestamp: new Date().toISOString(),
        },
      };
    }
  }

  /**
   * Fetch Issue from GitHub
   */
  private async fetchIssue(issueNumber: number): Promise<GitHubIssue> {
    const { data } = await this.octokit.issues.get({
      owner: this.owner,
      repo: this.repo,
      issue_number: issueNumber,
    });

    return data as any as GitHubIssue;
  }

  /**
   * Apply labels to Issue
   */
  private async applyLabels(issueNumber: number, labels: string[]): Promise<void> {
    if (labels.length === 0) return;

    await this.octokit.issues.addLabels({
      owner: this.owner,
      repo: this.repo,
      issue_number: issueNumber,
      labels,
    });
  }

  /**
   * Post judgment comment to Issue
   */
  private async postJudgmentComment(
    issueNumber: number,
    result: DESTJudgmentResult
  ): Promise<void> {
    const comment = this.buildJudgmentComment(result);

    await this.octokit.issues.createComment({
      owner: this.owner,
      repo: this.repo,
      issue_number: issueNumber,
      body: comment,
    });
  }

  /**
   * Build judgment comment markdown
   */
  private buildJudgmentComment(result: DESTJudgmentResult): string {
    const alEmoji = {
      AL0: '❌',
      AL1: '⚠️',
      AL2: '✅',
    }[result.al];

    let comment = `## 🔍 DEST Assurance Level Judgment\n\n`;
    comment += `**AL**: ${result.al} ${alEmoji}\n\n`;

    if (result.al === 'AL0' && result.al0Reasons.length > 0) {
      comment += `**AL0 Reason(s)**:\n`;
      for (const reason of result.al0Reasons) {
        comment += `- ${reason}\n`;
      }
      comment += `\n`;
    }

    if (result.protocol) {
      comment += `**Protocol**: ${result.protocol} 🛑\n\n`;
    }

    comment += `**Rationale**:\n${result.rationale}\n\n`;

    if (result.nextActions.length > 0) {
      comment += `**Next Actions**:\n`;
      for (const action of result.nextActions) {
        comment += `${action}\n`;
      }
      comment += `\n`;
    }

    if (result.escalation) {
      comment += `**Escalation**: ${result.escalation}\n\n`;
    }

    comment += `---\n`;
    comment += `🤖 DESTAgent | Judgment ID: ${result.judgmentId} | ${result.judgedAt}\n`;

    return comment;
  }

  /**
   * Build labels array
   */
  private buildLabels(al: AL, al0Reasons: AL0Reason[], protocol: Protocol | null): string[] {
    const labels: string[] = [];

    // AL label
    labels.push(`AL:${al}${al === 'AL0' ? '-NotAssured' : al === 'AL1' ? '-Qualified' : '-Assured'}`);

    // AL0 Reason labels
    for (const reason of al0Reasons) {
      labels.push(`AL0:${reason}`);
    }

    // Protocol label
    if (protocol) {
      labels.push(`Protocol:${protocol}`);
    }

    return labels;
  }

  /**
   * Build rationale text
   */
  private buildRationale(al: AL, outcome: any, safety: any): string {
    if (al === 'AL2') {
      return 'System is progressing toward target state with stable safety. Both outcome and safety criteria are met.';
    }

    if (al === 'AL1') {
      return `Conditional assurance: ${!outcome.outcomeOk ? 'Outcome not meeting target. ' : ''}${!safety.safetyOk ? 'Safety concerns detected. ' : ''}`;
    }

    // AL0
    const reasons: string[] = [];
    if (!safety.safetyOk) {
      if (safety.violations.length > 0) {
        reasons.push(`Safety violations detected: ${safety.violations.join(', ')}`);
      }
      if (safety.feedbackLoops === 'amplifying') {
        reasons.push('Amplifying feedback loops detected');
      } else if (safety.feedbackLoops === 'oscillating') {
        reasons.push('Oscillating feedback loops detected');
      }
    }

    return reasons.join('. ') || 'Safety criteria not met.';
  }

  /**
   * Determine escalation message
   */
  private determineEscalation(
    al: AL,
    al0Reasons: AL0Reason[],
    protocol: Protocol | null
  ): string | null {
    if (al !== 'AL0') return null;

    const escalationLevel = ProtocolRouter.getEscalationLevel(al0Reasons);

    if (escalationLevel === 'guardian') {
      return `Guardian escalation required. This issue is blocked from implementation until AL0 is resolved.`;
    }

    if (escalationLevel === 'ciso') {
      return `CISO escalation required (Safety Violation). Immediate security review needed.`;
    }

    if (escalationLevel === 'techlead') {
      return `TechLead review required for structural/systemic intervention.`;
    }

    return 'This issue is blocked from implementation until AL0 is resolved.';
  }

  /**
   * Generate unique judgment ID
   */
  private generateJudgmentId(): string {
    const date = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `J-${date}-${random}`;
  }

  /**
   * Save judgment result to file
   */
  private async saveJudgmentResult(result: DESTJudgmentResult): Promise<void> {
    const dir = path.join(process.cwd(), '.ai');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const filePath = path.join(dir, 'dest-judgment.json');
    fs.writeFileSync(filePath, JSON.stringify(result, null, 2));
  }

  /**
   * Log message
   */
  private log(message: string): void {
    if (this.config.verbose !== false) {
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] [DESTAgent] ${message}`);
    }
  }
}

// CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  const program = new Command();

  program
    .name('dest-agent')
    .description('DEST Assurance Level Judgment Agent')
    .requiredOption('--issue <number>', 'Issue number to judge')
    .option('--dry-run', 'Dry run mode (no labels or comments applied)', false)
    .option('--verbose', 'Verbose logging', true)
    .option('--quiet', 'Quiet mode (no logging)', false)
    .parse(process.argv);

  const options = program.opts();

  // Load config from environment
  const config: AgentConfig = {
    githubToken: process.env.GITHUB_TOKEN || '',
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    repository: process.env.REPOSITORY || process.env.GITHUB_REPOSITORY || '',
    dryRun: options.dryRun,
    verbose: options.quiet ? false : options.verbose,
  };

  if (!config.githubToken) {
    console.error('Error: GITHUB_TOKEN environment variable is required');
    process.exit(1);
  }

  if (!config.repository) {
    console.error('Error: REPOSITORY or GITHUB_REPOSITORY environment variable is required');
    process.exit(1);
  }

  const issueNumber = parseInt(options.issue, 10);
  if (isNaN(issueNumber)) {
    console.error('Error: --issue must be a number');
    process.exit(1);
  }

  // Execute
  const agent = new DESTAgent(config);
  agent.execute(issueNumber).then(result => {
    if (result.status === 'error') {
      console.error('Error:', result.error?.message);
      process.exit(1);
    }
    process.exit(0);
  }).catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}
