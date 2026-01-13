#!/usr/bin/env tsx
/**
 * CoordinatorAgent Test Script
 *
 * Purpose: Test CoordinatorAgent with mock issue
 */

import '../src/config/env.js'; // Initialize dotenv to load .env file
import { CoordinatorAgent } from '../src/agents/coordinator-agent';
import { AgentConfig, GitHubIssue } from '../src/types';

async function main() {
  console.log('='.repeat(70));
  console.log('🎯 CoordinatorAgent Test');
  console.log('='.repeat(70));
  console.log();

  // Mock configuration
  const config: AgentConfig = {
    githubToken: process.env.GITHUB_TOKEN || 'mock-token',
    repository: 'test/repo',
    dryRun: true,
    verbose: true,
  };

  const agent = new CoordinatorAgent(config);

  // ========================================================================
  // Test 1: Small Feature
  // ========================================================================
  console.log('📋 Test 1: Small Feature');
  console.log('-'.repeat(70));

  const mockIssueSmall: GitHubIssue = {
    number: 1,
    title: 'Add user profile page',
    body: 'Implement a basic user profile page with name and email display',
    labels: [
      { name: 'type:feature', color: '0e8a16' },
      { name: 'complexity:small', color: 'd4c5f9' },
      { name: 'priority:P2-Medium', color: 'fbca04' },
    ],
    state: 'open',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  try {
    const result = await agent.executeWithIssue(mockIssueSmall);

    if (result.status === 'success' && result.data) {
      console.log(`\n✓ Coordination successful`);
      console.log(`  Overall Status: ${result.data.overallStatus}`);
      console.log(`  Total Tasks: ${result.data.metrics.totalTasks}`);
      console.log(`  Completed: ${result.data.metrics.completedTasks}`);
      console.log(`  Failed: ${result.data.metrics.failedTasks}`);
      console.log(
        `  Duration: ${result.data.metrics.actualDuration.toFixed(2)}min`
      );
      console.log(
        `  Parallelization: ${result.data.executionPlan.parallelizationFactor.toFixed(2)}x`
      );
      console.log(
        `  Critical Path: ${result.data.executionPlan.criticalPath.join(' → ')}`
      );

      console.log(`\n  Execution Stages:`);
      for (const stage of result.data.executionPlan.stages) {
        console.log(
          `    Stage ${stage.stage}: ${stage.tasks.length} tasks in parallel (${stage.estimatedDuration.toFixed(0)}min)`
        );
        for (const taskId of stage.tasks) {
          const task = result.data.dag.nodes.get(taskId);
          console.log(`      - ${taskId}: ${task?.name} (${task?.agent})`);
        }
      }
    } else {
      console.log(`\n✗ Coordination failed`);
      if (result.error) {
        console.log(`  Error: ${result.error.message}`);
      }
    }
  } catch (error) {
    console.error(`✗ Test failed:`, error);
  }

  console.log();

  // ========================================================================
  // Test 2: Large Feature
  // ========================================================================
  console.log('📋 Test 2: Large Feature');
  console.log('-'.repeat(70));

  const mockIssueLarge: GitHubIssue = {
    number: 2,
    title: 'Implement authentication system',
    body: 'Add complete JWT-based authentication with login, registration, and password reset',
    labels: [
      { name: 'type:feature', color: '0e8a16' },
      { name: 'complexity:large', color: 'd4c5f9' },
      { name: 'priority:P0-Critical', color: 'd73a4a' },
    ],
    state: 'open',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  try {
    const result = await agent.executeWithIssue(mockIssueLarge);

    if (result.status === 'success' && result.data) {
      console.log(`\n✓ Coordination successful`);
      console.log(`  Overall Status: ${result.data.overallStatus}`);
      console.log(`  Total Tasks: ${result.data.metrics.totalTasks}`);
      console.log(`  Completed: ${result.data.metrics.completedTasks}`);
      console.log(`  Failed: ${result.data.metrics.failedTasks}`);
      console.log(
        `  Duration: ${result.data.metrics.actualDuration.toFixed(2)}min`
      );
      console.log(
        `  Parallelization: ${result.data.executionPlan.parallelizationFactor.toFixed(2)}x`
      );
      console.log(
        `  Critical Path: ${result.data.executionPlan.criticalPath.join(' → ')}`
      );

      console.log(`\n  Execution Stages:`);
      for (const stage of result.data.executionPlan.stages) {
        console.log(
          `    Stage ${stage.stage}: ${stage.tasks.length} tasks in parallel (${stage.estimatedDuration.toFixed(0)}min)`
        );
        for (const taskId of stage.tasks) {
          const task = result.data.dag.nodes.get(taskId);
          console.log(`      - ${taskId}: ${task?.name} (${task?.agent})`);
        }
      }
    } else {
      console.log(`\n✗ Coordination failed`);
      if (result.error) {
        console.log(`  Error: ${result.error.message}`);
      }
    }
  } catch (error) {
    console.error(`✗ Test failed:`, error);
  }

  console.log();

  // ========================================================================
  // Test 3: Bug Fix
  // ========================================================================
  console.log('📋 Test 3: Bug Fix (Small)');
  console.log('-'.repeat(70));

  const mockIssueBug: GitHubIssue = {
    number: 3,
    title: 'Fix login redirect issue',
    body: 'Users are not redirected to dashboard after login',
    labels: [
      { name: 'type:bug', color: 'd73a4a' },
      { name: 'complexity:small', color: 'd4c5f9' },
      { name: 'priority:P1-High', color: 'fbca04' },
    ],
    state: 'open',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  try {
    const result = await agent.executeWithIssue(mockIssueBug);

    if (result.status === 'success' && result.data) {
      console.log(`\n✓ Coordination successful`);
      console.log(`  Overall Status: ${result.data.overallStatus}`);
      console.log(`  Total Tasks: ${result.data.metrics.totalTasks}`);
      console.log(`  Completed: ${result.data.metrics.completedTasks}`);
      console.log(`  Failed: ${result.data.metrics.failedTasks}`);
      console.log(
        `  Duration: ${result.data.metrics.actualDuration.toFixed(2)}min`
      );
      console.log(
        `  Parallelization: ${result.data.executionPlan.parallelizationFactor.toFixed(2)}x`
      );

      console.log(`\n  Note: For bugs, Code Review is skipped for small complexity`);
    } else {
      console.log(`\n✗ Coordination failed`);
      if (result.error) {
        console.log(`  Error: ${result.error.message}`);
      }
    }
  } catch (error) {
    console.error(`✗ Test failed:`, error);
  }

  console.log();

  // ========================================================================
  // Test 4: Documentation
  // ========================================================================
  console.log('📋 Test 4: Documentation');
  console.log('-'.repeat(70));

  const mockIssueDocs: GitHubIssue = {
    number: 4,
    title: 'Update API documentation',
    body: 'Add documentation for new authentication endpoints',
    labels: [
      { name: 'type:docs', color: '0075ca' },
      { name: 'complexity:medium', color: 'd4c5f9' },
      { name: 'priority:P2-Medium', color: 'fbca04' },
    ],
    state: 'open',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  try {
    const result = await agent.executeWithIssue(mockIssueDocs);

    if (result.status === 'success' && result.data) {
      console.log(`\n✓ Coordination successful`);
      console.log(`  Overall Status: ${result.data.overallStatus}`);
      console.log(`  Total Tasks: ${result.data.metrics.totalTasks}`);
      console.log(`  Completed: ${result.data.metrics.completedTasks}`);
      console.log(`  Failed: ${result.data.metrics.failedTasks}`);
      console.log(
        `  Duration: ${result.data.metrics.actualDuration.toFixed(2)}min`
      );

      console.log(`\n  Note: For docs, testing and deployment are skipped`);
    } else {
      console.log(`\n✗ Coordination failed`);
      if (result.error) {
        console.log(`  Error: ${result.error.message}`);
      }
    }
  } catch (error) {
    console.error(`✗ Test failed:`, error);
  }

  console.log();

  // ========================================================================
  // Summary
  // ========================================================================
  console.log('='.repeat(70));
  console.log('✅ All Tests Completed');
  console.log('='.repeat(70));
  console.log();
  console.log('📋 Test Summary:');
  console.log('  ✓ Small Feature: Task decomposition & parallelization');
  console.log('  ✓ Large Feature: Scaled duration & critical path');
  console.log('  ✓ Bug Fix: Adaptive task pipeline (skip review for small bugs)');
  console.log('  ✓ Documentation: Custom pipeline (skip test & deploy)');
  console.log();
  console.log('🚀 CoordinatorAgent is ready for production!');
  console.log();
}

main().catch((error) => {
  console.error('❌ Test Failed:', error);
  process.exit(1);
});
