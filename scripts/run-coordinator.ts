#!/usr/bin/env tsx
/**
 * Run CoordinatorAgent on Real GitHub Issue
 *
 * Purpose: Execute CoordinatorAgent against a real GitHub Issue
 */

import '../src/config/env.js'; // Initialize dotenv to load .env file
import { CoordinatorAgent } from '../src/agents/coordinator-agent';
import { AgentConfig } from '../src/types';
import { ensureRulesConfigLoaded } from '../src/services/rules-config-service';

interface RunOptions {
  issue: number;
  dryRun: boolean;
  verbose: boolean;
}

function parseArgs(): RunOptions {
  const args = process.argv.slice(2);
  const options: RunOptions = {
    issue: 0,
    dryRun: false,
    verbose: true,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '--issue':
      case '-i':
        options.issue = parseInt(args[++i], 10);
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
        console.error(`Unknown option: ${arg}`);
        printHelp();
        process.exit(1);
    }
  }

  return options;
}

function printHelp() {
  console.log(`
Usage: npm run run-coordinator -- [options]

Options:
  --issue, -i <number>    Issue number to process (required)
  --dry-run, -d          Run in dry-run mode (no actual execution)
  --verbose, -v          Enable verbose logging (default)
  --quiet, -q            Disable verbose logging
  --help, -h             Show this help message

Environment Variables (required):
  GITHUB_TOKEN           GitHub Personal Access Token
  GITHUB_REPOSITORY      Repository in format: owner/repo
  ANTHROPIC_API_KEY      Anthropic API Key (optional, for AI features)

Examples:
  # Dry-run mode (safe testing)
  npm run run-coordinator -- --issue 100 --dry-run

  # Actual execution
  npm run run-coordinator -- --issue 100

  # Quiet mode
  npm run run-coordinator -- --issue 100 --quiet
  `);
}

async function main() {
  console.log('='.repeat(80));
  console.log('🎯 CoordinatorAgent - Real GitHub Issue Execution');
  console.log('='.repeat(80));
  console.log();

  // Load rules configuration
  ensureRulesConfigLoaded();

  // Parse arguments
  const options = parseArgs();

  if (!options.issue) {
    console.error('❌ Error: --issue is required');
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
    console.log();
    console.log('   See SETUP_GUIDE.md for detailed instructions');
    process.exit(1);
  }

  if (!repository) {
    console.error('❌ Error: GITHUB_REPOSITORY environment variable not set');
    console.log('   Please set your repository in format: owner/repo');
    console.log('   export GITHUB_REPOSITORY="owner/repo"');
    console.log();
    console.log('   See SETUP_GUIDE.md for detailed instructions');
    process.exit(1);
  }

  // Display configuration
  console.log('⚙️  Configuration:');
  console.log(`   Repository: ${repository}`);
  console.log(`   Issue: #${options.issue}`);
  console.log(`   Mode: ${options.dryRun ? 'DRY-RUN' : 'REAL EXECUTION'}`);
  console.log(`   Verbose: ${options.verbose}`);
  console.log(`   Anthropic API: ${anthropicApiKey ? 'Enabled' : 'Disabled (code generation will be simulated)'}`);
  console.log();

  if (!options.dryRun) {
    console.log('⚠️  WARNING: You are about to run in REAL EXECUTION mode!');
    console.log('   This will:');
    console.log('   - Generate actual code');
    console.log('   - Create GitHub comments');
    console.log('   - Apply labels to the issue');
    console.log('   - Potentially create Pull Requests');
    console.log();
    console.log('   Press Ctrl+C now to cancel, or wait 5 seconds to continue...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    console.log();
  }

  // Create agent configuration
  const config: AgentConfig = {
    githubToken,
    anthropicApiKey,
    repository,
    dryRun: options.dryRun,
    verbose: options.verbose,
  };

  // Create and execute agent
  const agent = new CoordinatorAgent(config);

  console.log('🚀 Starting CoordinatorAgent...');
  console.log('-'.repeat(80));
  console.log();

  try {
    const startTime = Date.now();
    const result = await agent.execute(options.issue);
    const duration = ((Date.now() - startTime) / 1000 / 60).toFixed(2);

    console.log();
    console.log('='.repeat(80));

    if (result.status === 'success' && result.data) {
      console.log('✅ CoordinatorAgent Execution Complete');
      console.log('='.repeat(80));
      console.log();

      const data = result.data;

      console.log('📊 Execution Summary:');
      console.log(`   Overall Status: ${data.overallStatus}`);
      console.log(`   Total Tasks: ${data.metrics.totalTasks}`);
      console.log(`   Completed: ${data.metrics.completedTasks}`);
      console.log(`   Failed: ${data.metrics.failedTasks}`);
      console.log(`   Duration: ${duration}min`);
      console.log(`   Efficiency: ${(data.metrics.efficiencyRatio * 100).toFixed(0)}%`);
      console.log();

      console.log('🎯 Execution Plan:');
      console.log(`   Stages: ${data.executionPlan.stages.length}`);
      console.log(`   Critical Path: ${data.executionPlan.criticalPath.join(' → ')}`);
      console.log(`   Parallelization: ${data.executionPlan.parallelizationFactor.toFixed(2)}x`);
      console.log();

      console.log('📝 Task Details:');
      for (const task of data.executedTasks) {
        const status = task.status === 'completed' ? '✅' : '⚠️';
        console.log(`   ${status} ${task.id}: ${task.name} (${task.agent})`);
      }

      if (data.failedTasks.length > 0) {
        console.log();
        console.log('❌ Failed Tasks:');
        for (const task of data.failedTasks) {
          console.log(`   ✗ ${task.id}: ${task.name}`);
          if (task.error) {
            console.log(`     Error: ${task.error.message}`);
          }
        }
      }

      console.log();
      console.log('🔗 Next Steps:');
      console.log(`   - View issue: https://github.com/${repository}/issues/${options.issue}`);
      if (!options.dryRun) {
        console.log('   - Check issue comments for agent feedback');
        console.log('   - Review any created Pull Requests');
      } else {
        console.log('   - This was a dry-run, no actual changes were made');
        console.log('   - Run without --dry-run to execute for real');
      }

    } else {
      console.log('❌ CoordinatorAgent Execution Failed');
      console.log('='.repeat(80));
      console.log();

      if (result.error) {
        console.log(`Error: ${result.error.message}`);
        console.log();
        if (result.error.stack) {
          console.log('Stack trace:');
          console.log(result.error.stack);
        }
      }

      console.log();
      console.log('💡 Troubleshooting:');
      console.log('   - Check SETUP_GUIDE.md for environment setup');
      console.log('   - Verify issue number exists in repository');
      console.log('   - Check GitHub token permissions');
      console.log('   - Run with --dry-run to test without side effects');

      process.exit(1);
    }

  } catch (error: any) {
    console.log();
    console.log('='.repeat(80));
    console.log('❌ Unexpected Error');
    console.log('='.repeat(80));
    console.log();
    console.log(`Error: ${error.message}`);
    if (error.stack) {
      console.log();
      console.log('Stack trace:');
      console.log(error.stack);
    }
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
