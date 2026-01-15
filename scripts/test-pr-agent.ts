#!/usr/bin/env tsx
/**
 * Test script for PRAgent
 */

import '../src/config/env.js';
import { PRAgent } from '../src/agents/pr-agent';

async function main() {
  console.log('🧪 Testing PRAgent\n');

  const agent = new PRAgent({
    githubToken: process.env.GITHUB_TOKEN,
    repository: 'sawadari/luna',
    verbose: true,
    dryRun: false,
  });

  // Test 1: PR統計を取得
  console.log('📊 Test 1: Get PR Statistics');

  const statsResult = await agent.getPRStatistics();

  if (statsResult.status === 'success' && statsResult.data) {
    const stats = statsResult.data;
    console.log('✅ PR Statistics:');
    console.log(`   Total PRs: ${stats.totalPRs}`);
    console.log(`   Open PRs: ${stats.openPRs}`);
    console.log(`   Closed PRs: ${stats.closedPRs}`);
    console.log(`   Merged PRs: ${stats.mergedPRs}`);
    console.log(`   Merge rate: ${stats.mergeRate.toFixed(1)}%`);
    console.log(`   Average time to merge: ${stats.averageTimeToMerge.toFixed(1)} hours`);
  } else {
    console.log(`❌ Failed to get statistics: ${statsResult.error?.message}`);
  }

  // Test 2: オープンPRを検索
  console.log('\n🔍 Test 2: Search Open PRs');

  const searchResult = await agent.searchPRs({
    state: 'open',
    limit: 10,
  });

  if (searchResult.status === 'success' && searchResult.data) {
    console.log(`✅ Found ${searchResult.data.length} open PRs:`);
    for (const pr of searchResult.data.slice(0, 5)) {
      console.log(`   #${pr.number}: ${pr.title}`);
      console.log(`     Branch: ${pr.headBranch} -> ${pr.baseBranch}`);
      console.log(`     Changes: +${pr.additions}/-${pr.deletions} (${pr.changedFiles} files)`);
      console.log(`     Mergeable: ${pr.mergeable ? 'Yes' : 'No'}`);
    }
  } else {
    console.log(`❌ Failed to search PRs: ${searchResult.error?.message}`);
  }

  // Test 3: マージされたPRを検索
  console.log('\n🔍 Test 3: Search Merged PRs');

  const allPRsResult = await agent.searchPRs({
    limit: 100,
  });

  if (allPRsResult.status === 'success' && allPRsResult.data) {
    const mergedPRs = allPRsResult.data.filter((pr) => pr.merged);
    console.log(`✅ Found ${mergedPRs.length} merged PRs (out of ${allPRsResult.data.length} total)`);
    for (const pr of mergedPRs.slice(0, 3)) {
      console.log(`   #${pr.number}: ${pr.title}`);
      console.log(`     Merged at: ${pr.mergedAt}`);
      console.log(`     Merged by: ${pr.mergedBy || 'N/A'}`);
    }
  } else {
    console.log(`❌ Failed to search merged PRs: ${allPRsResult.error?.message}`);
  }

  // Test 4: PR取得（最初のオープンPRを取得）
  if (searchResult.status === 'success' && searchResult.data && searchResult.data.length > 0) {
    const firstPR = searchResult.data[0];
    console.log(`\n📄 Test 4: Get PR #${firstPR.number}`);

    const getResult = await agent.getPR(firstPR.number);

    if (getResult.status === 'success' && getResult.data) {
      const pr = getResult.data;
      console.log('✅ PR Retrieved:');
      console.log(`   #${pr.number}: ${pr.title}`);
      console.log(`   State: ${pr.state}`);
      console.log(`   Draft: ${pr.draft}`);
      console.log(`   Branch: ${pr.headBranch} -> ${pr.baseBranch}`);
      console.log(`   Changes: +${pr.additions}/-${pr.deletions} (${pr.changedFiles} files)`);
      console.log(`   Mergeable: ${pr.mergeable}`);
      console.log(`   Mergeable state: ${pr.mergeableState}`);
      console.log(`   Created: ${pr.createdAt}`);
      console.log(`   URL: ${pr.htmlUrl}`);
    } else {
      console.log(`❌ Failed to get PR: ${getResult.error?.message}`);
    }

    // Test 5: PRレビュー
    console.log(`\n🔬 Test 5: Review PR #${firstPR.number}`);

    const reviewResult = await agent.reviewPR({
      prNumber: firstPR.number,
      reviewer: 'test-reviewer',
    });

    if (reviewResult.status === 'success' && reviewResult.data) {
      const review = reviewResult.data;
      console.log('✅ PR Review Result:');
      console.log(`   Decision: ${review.decision}`);
      console.log(`   Quality score: ${review.qualityScore}/100`);
      console.log(`   Auto-mergeable: ${review.autoMergeable ? 'Yes' : 'No'}`);
      console.log(`   Estimated review time: ${review.estimatedReviewTime} minutes`);
      console.log(`   Issues found: ${review.issues.length}`);
      for (const issue of review.issues) {
        console.log(`     [${issue.severity.toUpperCase()}] ${issue.category}: ${issue.message}`);
      }
      console.log(`   Recommendations: ${review.recommendations.length}`);
      for (const rec of review.recommendations) {
        console.log(`     - ${rec}`);
      }
    } else {
      console.log(`❌ Failed to review PR: ${reviewResult.error?.message}`);
    }
  } else {
    console.log('\n⏭️  Skipping Test 4-5: No open PRs found');
  }

  // Test 6: 新しいPRを作成（DRY RUN）
  console.log('\n✨ Test 6: Create New PR (Dry Run)');

  const agent2 = new PRAgent({
    githubToken: process.env.GITHUB_TOKEN,
    repository: 'sawadari/luna',
    verbose: true,
    dryRun: true, // Dry runモード
  });

  const createResult = await agent2.createPR({
    title: '[TEST] PRAgent test PR',
    body: 'This is a test PR created by PRAgent.\n\nThis PR includes:\n- Feature A\n- Feature B',
    head: 'feature/test-branch',
    base: 'main',
    draft: true,
    labels: ['type:test', 'priority:P2-Medium'],
    reviewers: ['test-reviewer'],
  });

  if (createResult.status === 'success' && createResult.data) {
    console.log('✅ [DRY RUN] PR would be created:');
    console.log(`   #${createResult.data.number}: ${createResult.data.title}`);
    console.log(`   Branch: ${createResult.data.headBranch} -> ${createResult.data.baseBranch}`);
    console.log(`   Draft: ${createResult.data.draft}`);
  } else {
    console.log(`❌ Failed to create PR: ${createResult.error?.message}`);
  }

  console.log('\n✅ All tests completed!');
}

main().catch((error) => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});
