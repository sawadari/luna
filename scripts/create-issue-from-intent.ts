#!/usr/bin/env tsx
/**
 * Create GitHub Issue from Natural Language Intent
 *
 * Purpose: Convert user intent (natural language) into a structured GitHub Issue,
 *          optionally execute CoordinatorAgent immediately.
 *
 * Usage:
 *   # Issue creation + Coordinator execution
 *   npm run luna:do -- "Add user authentication"
 *
 *   # Issue creation only (no execution)
 *   npm run luna:plan -- "Implement dark mode"
 *
 *   # Existing issue execution
 *   npm run luna:run -- --issue 100
 *
 *   # Dry-run mode (preview only, no Issue creation)
 *   npm run luna:plan -- "Add caching" --dry-run
 */

import '../src/config/env.js'; // Initialize dotenv
import Anthropic from '@anthropic-ai/sdk';
import { Octokit } from '@octokit/rest';
import { spawn } from 'child_process';
import type {
  IssueDestContract,
  OutcomeState,
  SafetyState,
  FeedbackLoops,
} from '../src/types/issue-dest-contract';
import { formatDestBlock } from '../src/types/issue-dest-contract';

interface ScriptOptions {
  intent: string;
  execute: boolean; // luna:do=true, luna:plan=false
  dryRun: boolean; // --dry-run flag
  verbose: boolean;
}

interface GeneratedIssue {
  title: string;
  summary: string;
  goal: string;
  context: string;
  constraints: string[];
  acceptanceCriteria: string[];
  destInput: {
    outcomeAssessment: {
      currentState: string;
      targetState: string;
      progress: 'better' | 'same' | 'worse';
    };
    safetyAssessment: {
      feedbackLoops: 'present' | 'absent' | 'harmful';
      safetyConstraints: string[];
      violations: string[];
    };
  };
  labels: string[];
}

// =============================================================================
// Main Entry Point
// =============================================================================

async function main() {
  console.log('='.repeat(80));
  console.log('🎯 Luna Intent-to-Issue Generator');
  console.log('='.repeat(80));
  console.log();

  // Parse arguments
  const options = parseArgs();

  if (!options.intent) {
    console.error('❌ Error: Intent is required');
    printHelp();
    process.exit(1);
  }

  // Check environment variables
  const githubToken = process.env.GITHUB_TOKEN;
  const repository = process.env.GITHUB_REPOSITORY;
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY;

  if (!githubToken) {
    console.error('❌ Error: GITHUB_TOKEN environment variable not set');
    console.log('   Please set your GitHub Personal Access Token:');
    console.log('   export GITHUB_TOKEN="ghp_your_token_here"');
    process.exit(1);
  }

  if (!repository) {
    console.error('❌ Error: GITHUB_REPOSITORY environment variable not set');
    console.log('   Please set your repository in format: owner/repo');
    console.log('   export GITHUB_REPOSITORY="owner/repo"');
    process.exit(1);
  }

  if (!anthropicApiKey) {
    console.error('❌ Error: ANTHROPIC_API_KEY environment variable not set');
    console.log('   This tool requires Claude API to generate Issue content');
    console.log('   Please set your Anthropic API key:');
    console.log('   export ANTHROPIC_API_KEY="sk-ant-xxx"');
    process.exit(1);
  }

  // Display configuration
  console.log('⚙️  Configuration:');
  console.log(`   Repository: ${repository}`);
  console.log(`   Intent: "${options.intent}"`);
  console.log(`   Mode: ${options.execute ? 'CREATE + EXECUTE' : 'CREATE ONLY'}`);
  console.log(`   Dry-run: ${options.dryRun ? 'YES (preview only)' : 'NO'}`);
  console.log(`   Verbose: ${options.verbose}`);
  console.log();

  try {
    // Generate Issue content with AI
    console.log('🤖 Generating Issue content with Claude AI...');
    const generated = await generateIssueFromIntent(options.intent, anthropicApiKey, options.verbose);

    if (options.verbose) {
      console.log('✅ Issue content generated successfully');
      console.log();
    }

    // Dry-run mode: preview only
    if (options.dryRun) {
      displayIssuePreview(generated);
      console.log();
      console.log('💡 This was a dry-run. No Issue was created.');
      console.log('   Run without --dry-run to create the Issue for real.');
      return;
    }

    // Create GitHub Issue
    console.log('📝 Creating GitHub Issue...');
    const issueNumber = await createGitHubIssue(generated, githubToken, repository, options.verbose);
    console.log(`✅ Issue created: #${issueNumber}`);
    console.log(`🔗 URL: https://github.com/${repository}/issues/${issueNumber}`);
    console.log();

    // Execute Coordinator if requested
    if (options.execute) {
      console.log('🚀 Executing CoordinatorAgent...');
      console.log('-'.repeat(80));
      console.log();

      try {
        await executeCoordinator(issueNumber, options.dryRun);
        console.log();
        console.log('✅ Coordinator execution completed');
      } catch (error: any) {
        console.error('❌ Coordinator execution failed');
        console.log();

        // Post failure comment to Issue
        await postCoordinatorFailureComment(issueNumber, error.message, githubToken, repository);
        console.log(`⚠️  Failure comment posted to Issue #${issueNumber}`);
        console.log();
        console.log('💡 You can retry with:');
        console.log(`   npm run luna:run -- --issue ${issueNumber}`);

        process.exit(1);
      }
    } else {
      console.log('💡 Issue created successfully. To execute with Coordinator, run:');
      console.log(`   npm run luna:run -- --issue ${issueNumber}`);
    }

    console.log();
    console.log('='.repeat(80));
    console.log('✅ Done!');
    console.log('='.repeat(80));

  } catch (error: any) {
    console.log();
    console.log('='.repeat(80));
    console.log('❌ Error Occurred');
    console.log('='.repeat(80));
    console.log();
    console.log(`Error: ${error.message}`);
    console.log();

    if (error.message.includes('AI generation failed')) {
      console.log('💡 Troubleshooting:');
      console.log('   - Check ANTHROPIC_API_KEY is valid');
      console.log('   - Verify network connectivity');
      console.log('   - Try again with simpler intent');
      console.log('   - Check Anthropic API status: https://status.anthropic.com/');
    } else if (error.message.includes('GitHub Issue creation failed')) {
      console.log('💡 Troubleshooting:');
      console.log('   - Check GITHUB_TOKEN permissions (needs repo access)');
      console.log('   - Verify repository name is correct');
      console.log('   - Check GitHub status: https://www.githubstatus.com/');
    }

    if (options.verbose && error.stack) {
      console.log();
      console.log('Stack trace:');
      console.log(error.stack);
    }

    process.exit(1);
  }
}

// =============================================================================
// Command Line Parsing
// =============================================================================

function parseArgs(): ScriptOptions {
  const args = process.argv.slice(2);
  const options: ScriptOptions = {
    intent: '',
    execute: false,
    dryRun: false,
    verbose: true,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '--execute':
        options.execute = true;
        break;
      case '--no-execute':
        options.execute = false;
        break;
      case '--dry-run':
      case '-d':
        options.dryRun = true;
        break;
      case '--verbose':
      case '-v':
        options.verbose = true;
        break;
      case '--quiet':
      case '-q':
        options.verbose = false;
        break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
        break;
      default:
        // Treat as intent if no flag prefix
        if (!arg.startsWith('-')) {
          options.intent = arg;
        } else {
          console.error(`Unknown option: ${arg}`);
          printHelp();
          process.exit(1);
        }
    }
  }

  return options;
}

function printHelp() {
  console.log(`
Usage: npm run <command> -- "<intent>" [options]

Commands:
  luna:do      Create Issue and execute Coordinator immediately
  luna:plan    Create Issue only (no execution)
  luna:run     Execute existing Issue with Coordinator

Arguments:
  <intent>     Natural language description of what you want to accomplish

Options:
  --dry-run, -d    Preview Issue without creating (shows generated content)
  --verbose, -v    Enable verbose logging (default)
  --quiet, -q      Disable verbose logging
  --help, -h       Show this help message

Environment Variables (required):
  GITHUB_TOKEN          GitHub Personal Access Token
  GITHUB_REPOSITORY     Repository in format: owner/repo
  ANTHROPIC_API_KEY     Anthropic API Key (for Claude AI)

Examples:
  # Create Issue + Execute Coordinator
  npm run luna:do -- "Add user authentication with JWT"

  # Create Issue only (preview before execution)
  npm run luna:plan -- "Implement dark mode"

  # Dry-run (preview without creating Issue)
  npm run luna:plan -- "Add caching layer" --dry-run

  # Execute existing Issue
  npm run luna:run -- --issue 100
  `);
}

// =============================================================================
// AI Issue Generation
// =============================================================================

async function generateIssueFromIntent(
  intent: string,
  apiKey: string,
  verbose: boolean
): Promise<GeneratedIssue> {
  const anthropic = new Anthropic({ apiKey });

  const prompt = buildIssueGenerationPrompt(intent);

  if (verbose) {
    console.log('   Calling Claude API...');
  }

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    const content = response.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected response type from Claude API');
    }

    if (verbose) {
      console.log('   Parsing response...');
    }

    return parseAIResponse(content.text);
  } catch (error: any) {
    throw new Error(`AI generation failed: ${error.message}`);
  }
}

function buildIssueGenerationPrompt(intent: string): string {
  return `# GitHub Issue Generation Task

## User Intent
${intent}

## Your Task
Generate a complete GitHub Issue for Luna (a software development platform with DEST judgment framework).

Luna requires structured Issue content for automated processing. Generate comprehensive Issue details based on the user's intent.

## Required Output Format (JSON)

You MUST respond with ONLY a valid JSON object (no markdown, no extra text):

\`\`\`json
{
  "title": "Brief, actionable title (max 80 chars)",
  "summary": "2-3 sentence summary of what this accomplishes",
  "goal": "Clear statement of the objective",
  "context": "Background information and motivation (why is this needed?)",
  "constraints": [
    "Technical constraint 1",
    "Business constraint 2"
  ],
  "acceptanceCriteria": [
    "Measurable criterion 1",
    "Measurable criterion 2"
  ],
  "destInput": {
    "outcomeAssessment": {
      "currentState": "Current situation description",
      "targetState": "Desired outcome description",
      "progress": "better"
    },
    "safetyAssessment": {
      "feedbackLoops": "present",
      "safetyConstraints": [
        "Safety requirement 1",
        "Safety requirement 2"
      ],
      "violations": []
    }
  },
  "labels": [
    "✨ type:feature",
    "📊 complexity:medium",
    "📥 priority:P2-Medium"
  ]
}
\`\`\`

## Field Guidelines

- **title**: Should be clear and actionable (e.g., "Add JWT authentication", "Implement dark mode toggle")
- **summary**: High-level overview in 2-3 sentences
- **goal**: What we're trying to achieve (the "why")
- **context**: Background, motivation, problem this solves
- **constraints**: Technical limitations, dependencies, requirements
- **acceptanceCriteria**: Measurable success conditions (use checkable format)
- **destInput.outcomeAssessment.progress**: Choose "better" (improvement), "same" (refactor), or "worse" (deprecation)
- **destInput.safetyAssessment.feedbackLoops**: Choose "present" (observable), "absent" (no feedback), or "harmful" (negative impact)
- **labels**: Use these exact formats:
  - Type: "✨ type:feature", "🐛 type:bug", "🔧 type:enhancement"
  - Complexity: "📊 complexity:simple", "📊 complexity:medium", "📊 complexity:complex"
  - Priority: "📥 priority:P0-Critical", "📥 priority:P1-High", "📥 priority:P2-Medium", "📥 priority:P3-Low"

**IMPORTANT**: Return ONLY the JSON object. No markdown code blocks, no explanations, just the JSON.`;
}

function parseAIResponse(responseText: string): GeneratedIssue {
  try {
    // Try to extract JSON from markdown code blocks if present
    const jsonMatch =
      responseText.match(/```json\n([\s\S]*?)\n```/) ||
      responseText.match(/```\n([\s\S]*?)\n```/);

    const jsonText = jsonMatch ? jsonMatch[1] : responseText;

    const parsed = JSON.parse(jsonText);

    // Validate required fields
    if (!parsed.title || !parsed.summary || !parsed.goal) {
      throw new Error('Missing required fields (title, summary, or goal)');
    }

    if (!parsed.destInput || !parsed.destInput.outcomeAssessment || !parsed.destInput.safetyAssessment) {
      throw new Error('Missing DEST input fields');
    }

    // Ensure arrays exist
    parsed.constraints = parsed.constraints || [];
    parsed.acceptanceCriteria = parsed.acceptanceCriteria || [];
    parsed.destInput.safetyAssessment.safetyConstraints =
      parsed.destInput.safetyAssessment.safetyConstraints || [];
    parsed.destInput.safetyAssessment.violations =
      parsed.destInput.safetyAssessment.violations || [];
    parsed.labels = parsed.labels || ['✨ type:feature', '📊 complexity:medium', '📥 priority:P2-Medium'];

    return parsed as GeneratedIssue;
  } catch (error: any) {
    throw new Error(`Failed to parse AI response: ${error.message}\n\nResponse text:\n${responseText.substring(0, 500)}...`);
  }
}

// =============================================================================
// Issue Formatting
// =============================================================================

function formatIssueBody(generated: GeneratedIssue): string {
  const constraintsSection = generated.constraints.length > 0
    ? `## Constraints\n${generated.constraints.map(c => `- ${c}`).join('\n')}\n\n`
    : '';

  const safetyConstraintsSection = generated.destInput.safetyAssessment.safetyConstraints.length > 0
    ? `**Safety Constraints**:\n${generated.destInput.safetyAssessment.safetyConstraints.map(c => `- ${c}`).join('\n')}\n\n`
    : '';

  const violationsSection = generated.destInput.safetyAssessment.violations.length > 0
    ? `**Violations**: ${generated.destInput.safetyAssessment.violations.join(', ')}`
    : '**Violations**: None';

  // Convert DEST input to IssueDestContract
  const destContract = convertToDestContract(generated.destInput);

  return `## Summary
${generated.summary}

## Goal
${generated.goal}

## Context
${generated.context}

${constraintsSection}## Acceptance Criteria
${generated.acceptanceCriteria.map(c => `- [ ] ${c}`).join('\n')}

---

## 🎯 DEST Judgment

### Outcome Assessment
**Current State**: ${generated.destInput.outcomeAssessment.currentState}
**Target State**: ${generated.destInput.outcomeAssessment.targetState}
**Progress**: ${generated.destInput.outcomeAssessment.progress}

### Safety Assessment
**Feedback Loops**: ${generated.destInput.safetyAssessment.feedbackLoops}

${safetyConstraintsSection}${violationsSection}

---

### Machine-Readable DEST Data

${formatDestBlock(destContract)}

---
*Generated by Luna Intent-to-Issue*`;
}

/**
 * Convert GeneratedIssue.destInput to IssueDestContract
 */
function convertToDestContract(destInput: GeneratedIssue['destInput']): IssueDestContract {
  // Map progress to outcome_state
  let outcome_state: OutcomeState = 'unknown';
  if (destInput.outcomeAssessment.progress === 'better') {
    outcome_state = 'ok';
  } else if (destInput.outcomeAssessment.progress === 'worse') {
    outcome_state = 'regressing';
  }

  // Map violations to safety_state
  const safety_state: SafetyState =
    destInput.safetyAssessment.violations.length > 0 ? 'violated' : 'ok';

  // Default trace_state (can be enhanced later)
  const trace_state = 'unknown';

  return {
    outcome_state,
    safety_state,
    trace_state,
    feedback_loops: destInput.safetyAssessment.feedbackLoops,
    violations: destInput.safetyAssessment.violations,
    notes: `Current: ${destInput.outcomeAssessment.currentState}. Target: ${destInput.outcomeAssessment.targetState}`,
  };
}

function displayIssuePreview(generated: GeneratedIssue) {
  console.log();
  console.log('='.repeat(80));
  console.log('📋 DRY-RUN MODE: Issue Preview (not created)');
  console.log('='.repeat(80));
  console.log();
  console.log(`**Title**: ${generated.title}`);
  console.log();
  console.log(`**Labels**: ${generated.labels.join(', ')}`);
  console.log();
  console.log('**Body**:');
  console.log('-'.repeat(80));
  console.log(formatIssueBody(generated));
  console.log('-'.repeat(80));
}

// =============================================================================
// GitHub Issue Creation
// =============================================================================

async function createGitHubIssue(
  generated: GeneratedIssue,
  githubToken: string,
  repository: string,
  verbose: boolean
): Promise<number> {
  const octokit = new Octokit({ auth: githubToken });
  const [owner, repo] = repository.split('/');

  if (verbose) {
    console.log(`   Repository: ${owner}/${repo}`);
    console.log(`   Title: ${generated.title}`);
    console.log(`   Labels: ${generated.labels.join(', ')}`);
  }

  try {
    const { data: issue } = await octokit.issues.create({
      owner,
      repo,
      title: generated.title,
      body: formatIssueBody(generated),
      labels: generated.labels,
    });

    return issue.number;
  } catch (error: any) {
    // If GitHub API fails, show generated content for manual creation
    console.log();
    console.log('📋 Generated Issue content (create manually if needed):');
    console.log('-'.repeat(80));
    console.log(`Title: ${generated.title}`);
    console.log();
    console.log(formatIssueBody(generated));
    console.log('-'.repeat(80));

    throw new Error(`GitHub Issue creation failed: ${error.message}`);
  }
}

// =============================================================================
// Coordinator Execution
// =============================================================================

async function executeCoordinator(issueNumber: number, dryRun: boolean): Promise<void> {
  const args = ['run', 'run-coordinator', '--', '--issue', issueNumber.toString()];
  if (dryRun) args.push('--dry-run');

  return new Promise((resolve, reject) => {
    const child = spawn('npm', args, {
      stdio: 'inherit',
      shell: true,
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Coordinator exited with code ${code}`));
      }
    });

    child.on('error', (error) => {
      reject(new Error(`Failed to spawn Coordinator: ${error.message}`));
    });
  });
}

async function postCoordinatorFailureComment(
  issueNumber: number,
  errorMessage: string,
  githubToken: string,
  repository: string
): Promise<void> {
  const octokit = new Octokit({ auth: githubToken });
  const [owner, repo] = repository.split('/');

  const body = `⚠️ **Coordinator Execution Failed**

The CoordinatorAgent failed to execute this Issue automatically.

**Error**: ${errorMessage}

**Next Steps**:
1. Check the error logs above
2. Fix any issues in the Issue description or environment
3. Retry with:
   \`\`\`
   npm run luna:run -- --issue ${issueNumber}
   \`\`\`

---
*Automated failure notification*`;

  try {
    await octokit.issues.createComment({
      owner,
      repo,
      issue_number: issueNumber,
      body,
    });
  } catch (error) {
    // Ignore comment posting errors (non-critical)
    console.error(`   Failed to post comment: ${(error as Error).message}`);
  }
}

// =============================================================================
// Execute
// =============================================================================

main().catch((error) => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
