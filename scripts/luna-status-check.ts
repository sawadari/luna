#!/usr/bin/env tsx
/**
 * Luna Status Check - Lunaを使ってLunaの状態を確認
 */

import '../src/config/env.js';
import { GateKeeperAgent } from '../src/agents/gatekeeper-agent';
import { IssueAgent } from '../src/agents/issue-agent';
import { PRAgent } from '../src/agents/pr-agent';

async function checkLunaStatus() {
  console.log('🌙 Luna Status Check - Lunaを使ってLunaを確認\n');

  // Gate統計
  const gateAgent = new GateKeeperAgent({
    githubToken: process.env.GITHUB_TOKEN,
    repository: 'sawadari/luna',
    verbose: false,
  });
  const gateStats = await gateAgent.getGateStats();
  if (gateStats.data) {
    console.log('📊 Gate Statistics:');
    console.log(`   Total checks: ${gateStats.data.totalChecks}`);
    console.log(`   Passed: ${gateStats.data.passedCount}`);
    console.log(`   Pass rate: ${gateStats.data.passRate.toFixed(1)}%`);
  }

  // Issue統計
  const issueAgent = new IssueAgent({
    githubToken: process.env.GITHUB_TOKEN,
    repository: 'sawadari/luna',
    verbose: false,
  });
  const issueStats = await issueAgent.getIssueStatistics();
  if (issueStats.data) {
    console.log('\n📊 Issue Statistics:');
    console.log(`   Total issues: ${issueStats.data.totalIssues}`);
    console.log(`   Open: ${issueStats.data.openIssues}`);
    console.log(`   P1-High: ${issueStats.data.byPriority['P1-High']}`);
    console.log(`   P2-Medium: ${issueStats.data.byPriority['P2-Medium']}`);
  }

  // PR統計
  const prAgent = new PRAgent({
    githubToken: process.env.GITHUB_TOKEN,
    repository: 'sawadari/luna',
    verbose: false,
  });
  const prStats = await prAgent.getPRStatistics();
  if (prStats.data) {
    console.log('\n📊 PR Statistics:');
    console.log(`   Total PRs: ${prStats.data.totalPRs}`);
    console.log(`   Merge rate: ${prStats.data.mergeRate.toFixed(1)}%`);
  }

  console.log('\n✅ Luna is running and monitoring itself!');
}

checkLunaStatus().catch((error) => {
  console.error('❌ Error:', error);
  process.exit(1);
});
