#!/usr/bin/env tsx
/**
 * Test script for ExceptionRegistryAgent
 */

import '../src/config/env.js';
import { ExceptionRegistryAgent } from '../src/agents/exception-registry-agent';
import { AgentConfig } from '../src/types';

async function main() {
  console.log('🧪 Testing ExceptionRegistryAgent\n');

  const config: AgentConfig = {
    githubToken: process.env.GITHUB_TOKEN || 'test-token',
    repository: process.env.GITHUB_REPOSITORY || 'test/repo',
    verbose: true,
    dryRun: true,
  };

  const agent = new ExceptionRegistryAgent(config);

  // Test 1: Propose Exception
  console.log('📝 Test 1: Propose Exception (E_quality_over_speed)');
  const proposeResult = await agent.proposeException({
    type: 'E_quality_over_speed',
    rationale: 'User experience takes priority over performance benchmarks',
    requested_by: 'ProductOwner',
    linked_decision_id: 'DR-001',
    requested_expiry_condition: '2026-Q2',
    proposed_mitigation_plan: 'Optimize critical paths by Q2 end',
    monitoring_signal: 'sig.quality_score',
  });

  if (proposeResult.status === 'success') {
    console.log(`✅ Proposal created: ${proposeResult.data?.proposal_id}`);
    console.log(`   Type: ${proposeResult.data?.type}`);
    console.log(`   Expiry: ${proposeResult.data?.requested_expiry_condition}`);
    console.log(`   Monitoring: ${proposeResult.data?.monitoring_signal}\n`);
  } else {
    console.log(`❌ Failed to create proposal: ${proposeResult.error}\n`);
  }

  // Test 2: Approve Exception
  if (proposeResult.status === 'success' && proposeResult.data) {
    console.log('✅ Test 2: Approve Exception');
    const approveResult = await agent.approveException(
      proposeResult.data.proposal_id,
      'TechLead',
      'CR-2026-001'
    );

    if (approveResult.status === 'success') {
      console.log(`✅ Exception approved: ${approveResult.data?.exception_id}`);
      console.log(`   Status: ${approveResult.data?.status}`);
      console.log(`   Approved by: ${approveResult.data?.approved_by}\n`);
    } else {
      console.log(`❌ Failed to approve exception: ${approveResult.error}\n`);
    }

    // Test 3: Update Exception Status
    if (approveResult.status === 'success' && approveResult.data) {
      console.log('🔄 Test 3: Update Exception Status');
      const updateResult = await agent.updateExceptionStatus(
        approveResult.data.exception_id,
        'mitigated',
        'TechLead',
        'Mitigation plan completed'
      );

      if (updateResult.status === 'success') {
        console.log(`✅ Status updated: ${updateResult.data?.exception_id}`);
        console.log(`   New status: ${updateResult.data?.status}`);
        console.log(`   History: ${updateResult.data?.statusHistory.length} entries\n`);
      } else {
        console.log(`❌ Failed to update status: ${updateResult.error}\n`);
      }
    }
  }

  // Test 4: Detect Expired Exceptions
  console.log('⏰ Test 4: Detect Expired Exceptions');
  const expiredResult = await agent.detectExpiredExceptions();

  if (expiredResult.status === 'success') {
    console.log(`✅ Found ${expiredResult.data?.length || 0} expired exceptions`);
    expiredResult.data?.forEach((exc) => {
      console.log(`   - ${exc.exception_id}: ${exc.expiry_condition}`);
    });
    console.log();
  } else {
    console.log(`❌ Failed to detect expired: ${expiredResult.error}\n`);
  }

  // Test 5: Evaluate Exceptions by Signal
  console.log('📊 Test 5: Evaluate Exceptions by Signal');
  const evaluateResult = await agent.evaluateExceptionsBySignal();

  if (evaluateResult.status === 'success') {
    console.log(`✅ Evaluated ${evaluateResult.data?.length || 0} exceptions`);
    evaluateResult.data?.forEach((result) => {
      console.log(`   - ${result.exception.exception_id}: ${result.shouldReview ? 'Review needed' : 'OK'}`);
    });
    console.log();
  } else {
    console.log(`❌ Failed to evaluate: ${evaluateResult.error}\n`);
  }

  // Test 6: Get Exception Stats
  console.log('📈 Test 6: Get Exception Statistics');
  const statsResult = await agent.getExceptionStats();

  if (statsResult.status === 'success') {
    const stats = statsResult.data;
    console.log(`✅ Exception Statistics:`);
    console.log(`   Total: ${stats?.totalExceptions}`);
    console.log(`   By Status:`);
    console.log(`     - Open: ${stats?.byStatus.open}`);
    console.log(`     - Mitigated: ${stats?.byStatus.mitigated}`);
    console.log(`     - Closed: ${stats?.byStatus.closed}`);
    console.log(`     - Expired: ${stats?.byStatus.expired}`);
    console.log(`   By Type:`);
    console.log(`     - Quality over Speed: ${stats?.byType.E_quality_over_speed}`);
    console.log(`     - Differentiation over Cost: ${stats?.byType.E_differentiation_over_cost}`);
    console.log(`     - Technical Debt: ${stats?.byType.E_technical_debt}`);
    console.log();
  } else {
    console.log(`❌ Failed to get stats: ${statsResult.error}\n`);
  }

  // Test 7: Multiple Exception Types
  console.log('🔄 Test 7: Propose Multiple Exception Types');
  const types = [
    'E_technical_debt',
    'E_boundary_exception',
    'E_regulation_override',
  ];

  for (const type of types) {
    const result = await agent.proposeException({
      type: type as any,
      rationale: `Test exception for ${type}`,
      requested_by: 'TestUser',
      requested_expiry_condition: '2026-12-31',
      proposed_mitigation_plan: 'Will address before expiry',
    });

    if (result.status === 'success') {
      console.log(`✅ ${type}: ${result.data?.proposal_id}`);
    } else {
      console.log(`❌ ${type}: Failed`);
    }
  }

  console.log('\n✅ All tests completed!');
}

main().catch((error) => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});
