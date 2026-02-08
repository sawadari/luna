#!/usr/bin/env tsx
/**
 * Test script for ChangeControlAgent
 */

import '../src/config/env.js';
import { ChangeControlAgent } from '../src/agents/change-control-agent';
import { AgentConfig } from '../src/types';
import { ensureRulesConfigLoaded } from '../src/services/rules-config-service';

async function main() {
  console.log('🧪 Testing ChangeControlAgent\n');

  // Ensure rules configuration is loaded before creating agents
  await ensureRulesConfigLoaded();
  console.log('✅ Rules configuration loaded\n');

  const config: AgentConfig = {
    githubToken: process.env.GITHUB_TOKEN || 'test-token',
    repository: process.env.GITHUB_REPOSITORY || 'test/repo',
    verbose: true,
    dryRun: true,
  };

  const agent = new ChangeControlAgent(config);

  // Test 1: Create ChangeRequest
  console.log('📝 Test 1: Create ChangeRequest (regulation_change)');
  const createResult = await agent.createChangeRequest({
    raised_by: 'TestUser',
    trigger_type: 'regulation_change',
    affected_scope: ['KRN-001', 'KRN-002'],
    notes: 'Test CR for regulation change',
  });

  if (createResult.status === 'success') {
    console.log(`✅ CR created: ${createResult.data?.cr_id}`);
    console.log(`   Proposed operations: ${createResult.data?.proposed_operations.join(', ')}`);
    console.log(`   Required reviews: ${createResult.data?.required_reviews.join(', ')}`);
    console.log(`   Decision update rule: ${createResult.data?.decision_update_rule}\n`);
  } else {
    console.log(`❌ Failed to create CR: ${createResult.error}\n`);
  }

  // Test 2: List ChangeRequests
  console.log('📋 Test 2: List all ChangeRequests');
  const listResult = await agent.listChangeRequests();

  if (listResult.status === 'success') {
    console.log(`✅ Found ${listResult.data?.length || 0} ChangeRequests`);
    listResult.data?.forEach((cr) => {
      console.log(`   - ${cr.cr_id}: ${cr.trigger_type} (${cr.gate_outcome})`);
    });
    console.log();
  } else {
    console.log(`❌ Failed to list CRs: ${listResult.error}\n`);
  }

  // Test 3: Approve ChangeRequest
  if (createResult.status === 'success' && createResult.data) {
    console.log('✅ Test 3: Approve ChangeRequest');
    const approveResult = await agent.approveChangeRequest(
      createResult.data.cr_id,
      'Approver'
    );

    if (approveResult.status === 'success') {
      console.log(`✅ CR approved: ${approveResult.data?.cr_id}`);
      console.log(`   Status: ${approveResult.data?.gate_outcome}\n`);
    } else {
      console.log(`❌ Failed to approve CR: ${approveResult.error}\n`);
    }

    // Test 4: Execute ChangeRequest
    console.log('▶️  Test 4: Execute ChangeRequest');
    const executeResult = await agent.executeChangeRequest(createResult.data.cr_id);

    if (executeResult.status === 'success') {
      console.log(`✅ CR executed: ${executeResult.data?.cr_id}`);
      console.log(`   Executed at: ${executeResult.data?.executed_at}\n`);
    } else {
      console.log(`❌ Failed to execute CR: ${executeResult.error}\n`);
    }

    // Test 5: Rollback ChangeRequest
    console.log('⏪ Test 5: Rollback ChangeRequest');
    const rollbackResult = await agent.rollbackChangeRequest(createResult.data.cr_id);

    if (rollbackResult.status === 'success') {
      console.log(`✅ CR rolled back: ${rollbackResult.data?.cr_id}`);
      console.log(`   Executed: ${rollbackResult.data?.executed}\n`);
    } else {
      console.log(`❌ Failed to rollback CR: ${rollbackResult.error}\n`);
    }
  }

  // Test 6: Create CR with different trigger types
  console.log('🔄 Test 6: Create CRs with different trigger types');
  const triggerTypes = [
    'safety_or_quality_incident',
    'market_or_customer_shift',
    'ai_generated_contamination',
  ];

  for (const triggerType of triggerTypes) {
    const result = await agent.createChangeRequest({
      raised_by: 'TestUser',
      trigger_type: triggerType as any,
      affected_scope: ['KRN-TEST'],
      notes: `Test CR for ${triggerType}`,
    });

    if (result.status === 'success') {
      console.log(`✅ ${triggerType}:`);
      console.log(`   Operations: ${result.data?.proposed_operations.join(', ')}`);
      console.log(`   Reviews: ${result.data?.required_reviews.join(', ')}`);
    } else {
      console.log(`❌ ${triggerType}: Failed`);
    }
  }

  console.log('\n✅ All tests completed!');
}

main().catch((error) => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});
