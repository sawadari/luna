#!/usr/bin/env tsx
/**
 * Test script for GateKeeperAgent
 */

import '../src/config/env.js';
import { GateKeeperAgent } from '../src/agents/gatekeeper-agent';
import { AgentConfig } from '../src/types';

async function main() {
  console.log('🧪 Testing GateKeeperAgent\n');

  const config: AgentConfig = {
    githubToken: process.env.GITHUB_TOKEN || 'test-token',
    repository: process.env.GITHUB_REPOSITORY || 'test/repo',
    verbose: true,
    dryRun: true,
  };

  const agent = new GateKeeperAgent(config);

  // Test 1: Check Gate G2
  console.log('📝 Test 1: Check Gate G2 (Problem Definition Gate)');
  const g2Result = await agent.checkGate({
    gateId: 'G2',
    checkedBy: 'TestUser',
    issueNumber: 100,
    context: {
      opportunity: 'Improve user experience',
      problem: 'Current UI is confusing',
    },
  });

  if (g2Result.status === 'success' || g2Result.status === 'blocked') {
    console.log(`✅ Gate G2 checked: ${g2Result.data?.status}`);
    console.log(`   Checks: ${g2Result.data?.checkResults.length} items`);
    g2Result.data?.checkResults.forEach((check) => {
      console.log(`   - ${check.message}`);
    });
    console.log();
  } else {
    console.log(`❌ Failed to check G2: ${g2Result.error}\n`);
  }

  // Test 2: Check Gate G4
  console.log('📝 Test 2: Check Gate G4 (Idea Traceability Gate)');
  const g4Result = await agent.checkGate({
    gateId: 'G4',
    checkedBy: 'TestUser',
    issueNumber: 100,
    context: {
      ideas: [{ id: 'idea-1', lp_level_id: 5 }],
      decision: { id: 'DR-001', chosen_option: 'Option A' },
    },
  });

  if (g4Result.status === 'success' || g4Result.status === 'blocked') {
    console.log(`✅ Gate G4 checked: ${g4Result.data?.status}`);
    console.log(`   Checks: ${g4Result.data?.checkResults.length} items`);
    g4Result.data?.checkResults.forEach((check) => {
      console.log(`   - ${check.message}`);
    });
    console.log();
  } else {
    console.log(`❌ Failed to check G4: ${g4Result.error}\n`);
  }

  // Test 3: Exempt Gate G3
  console.log('⏭️  Test 3: Exempt Gate G3 (Understanding & Hypotheses Gate)');
  const exemptResult = await agent.exemptGate({
    gateId: 'G3',
    reason: 'Emergency fix, will complete understanding phase later',
    approvedBy: 'ProductOwner',
    expiresAt: '2026-Q2',
    linkedExceptionId: 'EXC-BND-001',
  });

  if (exemptResult.status === 'success') {
    console.log(`✅ Gate G3 exempted: ${exemptResult.data?.status}`);
    console.log(`   Reason: ${exemptResult.data?.exemption?.reason}`);
    console.log(`   Approved by: ${exemptResult.data?.exemption?.approvedBy}`);
    console.log(`   Expires at: ${exemptResult.data?.exemption?.expiresAt}\n`);
  } else {
    console.log(`❌ Failed to exempt G3: ${exemptResult.error}\n`);
  }

  // Test 4: Enforce Gate Sequence
  console.log('🔒 Test 4: Enforce Gate Sequence for G5');
  const enforceResult = await agent.enforceGateSequence('G5');

  if (enforceResult.status === 'success') {
    console.log(`✅ Gate sequence check:`);
    console.log(`   Can proceed: ${enforceResult.data?.canProceed ? 'YES' : 'NO'}`);
    if (!enforceResult.data?.canProceed) {
      console.log(`   Missing gates: ${enforceResult.data?.missingGates.join(', ')}`);
    }
    console.log();
  } else {
    console.log(`❌ Failed to enforce sequence: ${enforceResult.error}\n`);
  }

  // Test 5: Get Gate Statistics
  console.log('📊 Test 5: Get Gate Statistics');
  const statsResult = await agent.getGateStats();

  if (statsResult.status === 'success') {
    const stats = statsResult.data;
    console.log(`✅ Gate Statistics:`);
    console.log(`   Total checks: ${stats?.totalChecks}`);
    console.log(`   Pass rate: ${stats?.passRate.toFixed(1)}%`);
    console.log(`   By Status:`);
    console.log(`     - Pending: ${stats?.byStatus.pending}`);
    console.log(`     - Passed: ${stats?.byStatus.passed}`);
    console.log(`     - Failed: ${stats?.byStatus.failed}`);
    console.log(`     - Skipped: ${stats?.byStatus.skipped}`);
    console.log(`   By Gate:`);
    console.log(`     - G2: ${stats?.byGate.G2}`);
    console.log(`     - G3: ${stats?.byGate.G3}`);
    console.log(`     - G4: ${stats?.byGate.G4}`);
    console.log(`     - G5: ${stats?.byGate.G5}`);
    console.log(`     - G6: ${stats?.byGate.G6}`);
    console.log();
  } else {
    console.log(`❌ Failed to get stats: ${statsResult.error}\n`);
  }

  // Test 6: Check Multiple Gates
  console.log('🔄 Test 6: Check Multiple Gates (G5, G6)');
  const gates = ['G5', 'G6'];

  for (const gateId of gates) {
    const result = await agent.checkGate({
      gateId: gateId as any,
      checkedBy: 'TestUser',
      issueNumber: 100,
    });

    if (result.status === 'success' || result.status === 'blocked') {
      console.log(`✅ Gate ${gateId}: ${result.data?.status}`);
    } else {
      console.log(`❌ Gate ${gateId}: Failed`);
    }
  }

  console.log('\n✅ All tests completed!');
}

main().catch((error) => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});
