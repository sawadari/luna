#!/usr/bin/env tsx
/**
 * Test script for IssueAgent
 */

import '../src/config/env.js';
import { IssueAgent } from '../src/agents/issue-agent';

async function main() {
  console.log('🧪 Testing IssueAgent\n');

  const agent = new IssueAgent({
    githubToken: process.env.GITHUB_TOKEN,
    repository: 'sawadari/luna',
    verbose: true,
    dryRun: false,
  });

  // Test 1: Issue統計を取得
  console.log('📊 Test 1: Get Issue Statistics');

  const statsResult = await agent.getIssueStatistics();

  if (statsResult.status === 'success' && statsResult.data) {
    const stats = statsResult.data;
    console.log('✅ Issue Statistics:');
    console.log(`   Total issues: ${stats.totalIssues}`);
    console.log(`   Open issues: ${stats.openIssues}`);
    console.log(`   Closed issues: ${stats.closedIssues}`);
    console.log(`   Average time to close: ${stats.averageTimeToClose.toFixed(1)} hours`);
    console.log(`   By priority:`);
    console.log(`     - P0-Critical: ${stats.byPriority['P0-Critical']}`);
    console.log(`     - P1-High: ${stats.byPriority['P1-High']}`);
    console.log(`     - P2-Medium: ${stats.byPriority['P2-Medium']}`);
    console.log(`     - P3-Low: ${stats.byPriority['P3-Low']}`);
    console.log(`   By type:`);
    console.log(`     - bug: ${stats.byType.bug}`);
    console.log(`     - feature: ${stats.byType.feature}`);
    console.log(`     - test: ${stats.byType.test}`);
  } else {
    console.log(`❌ Failed to get statistics: ${statsResult.error}`);
  }

  // Test 2: オープンIssueを検索
  console.log('\n🔍 Test 2: Search Open Issues');

  const searchResult = await agent.searchIssues({
    state: 'open',
    limit: 10,
  });

  if (searchResult.status === 'success' && searchResult.data) {
    console.log(`✅ Found ${searchResult.data.length} open issues:`);
    for (const issue of searchResult.data.slice(0, 5)) {
      console.log(`   #${issue.number}: ${issue.title}`);
      console.log(`     Labels: ${issue.labels.map((l) => l.name).join(', ')}`);
    }
  } else {
    console.log(`❌ Failed to search issues: ${searchResult.error}`);
  }

  // Test 3: P1-High Issueを検索
  console.log('\n🔍 Test 3: Search P1-High Issues');

  const p1SearchResult = await agent.searchIssues({
    state: 'open',
    labels: ['priority:P1-High'],
    limit: 10,
  });

  if (p1SearchResult.status === 'success' && p1SearchResult.data) {
    console.log(`✅ Found ${p1SearchResult.data.length} P1-High issues:`);
    for (const issue of p1SearchResult.data) {
      console.log(`   #${issue.number}: ${issue.title}`);
    }
  } else {
    console.log(`❌ Failed to search P1-High issues: ${p1SearchResult.error}`);
  }

  // Test 4: Issue分析（Issue #4を分析）
  console.log('\n🔬 Test 4: Analyze Issue #4');

  const analyzeResult = await agent.analyzeIssue({
    issueNumber: 4,
    extractDependencies: true,
    suggestLabels: true,
  });

  if (analyzeResult.status === 'success' && analyzeResult.data) {
    const analysis = analyzeResult.data;
    console.log('✅ Issue Analysis:');
    console.log(`   Issue: #${analysis.issueNumber}`);
    console.log(`   Priority: ${analysis.priority || 'N/A'}`);
    console.log(`   Type: ${analysis.type || 'N/A'}`);
    console.log(`   Phase: ${analysis.phase || 'N/A'}`);
    console.log(`   Dependencies: ${analysis.dependencies.length > 0 ? analysis.dependencies.map((n) => `#${n}`).join(', ') : 'None'}`);
    console.log(`   Blocked by: ${analysis.blockedBy.length > 0 ? analysis.blockedBy.map((n) => `#${n}`).join(', ') : 'None'}`);
    console.log(`   Related issues: ${analysis.relatedIssues.length > 0 ? analysis.relatedIssues.map((n) => `#${n}`).join(', ') : 'None'}`);
    console.log(`   Suggested labels: ${analysis.suggestedLabels.length > 0 ? analysis.suggestedLabels.map((l) => l.name).join(', ') : 'None'}`);
    console.log(`   Recommendations:`);
    for (const rec of analysis.recommendations) {
      console.log(`     - ${rec}`);
    }
  } else {
    console.log(`❌ Failed to analyze issue: ${analyzeResult.error}`);
  }

  // Test 5: Issue取得（Issue #4を取得）
  console.log('\n📄 Test 5: Get Issue #4');

  const getResult = await agent.getIssue(4);

  if (getResult.status === 'success' && getResult.data) {
    const issue = getResult.data;
    console.log('✅ Issue Retrieved:');
    console.log(`   #${issue.number}: ${issue.title}`);
    console.log(`   State: ${issue.state}`);
    console.log(`   Created: ${issue.createdAt}`);
    console.log(`   Updated: ${issue.updatedAt}`);
    console.log(`   Labels: ${issue.labels.map((l) => l.name).join(', ')}`);
    console.log(`   URL: ${issue.htmlUrl}`);
  } else {
    console.log(`❌ Failed to get issue: ${getResult.error}`);
  }

  // Test 6: 新しいIssueを作成（DRY RUN）
  console.log('\n✨ Test 6: Create New Issue (Dry Run)');

  const agent2 = new IssueAgent({
    githubToken: process.env.GITHUB_TOKEN,
    repository: 'sawadari/luna',
    verbose: true,
    dryRun: true, // Dry runモード
  });

  const createResult = await agent2.createIssue({
    title: '[TEST] IssueAgent test issue',
    body: 'This is a test issue created by IssueAgent.\n\nDependencies: #4, #5\nBlocked by: #10',
    labels: ['type:test', 'priority:P2-Medium'],
    assignees: [],
  });

  if (createResult.status === 'success' && createResult.data) {
    console.log('✅ [DRY RUN] Issue would be created:');
    console.log(`   #${createResult.data.number}: ${createResult.data.title}`);
  } else {
    console.log(`❌ Failed to create issue: ${createResult.error}`);
  }

  console.log('\n✅ All tests completed!');
}

main().catch((error) => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});
