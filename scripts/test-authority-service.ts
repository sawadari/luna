#!/usr/bin/env tsx
/**
 * Test script for AuthorityService
 */

import '../src/config/env.js';
import { AuthorityService } from '../src/services/authority-service';
import { Role, MaturityLevel, TransitionRequest } from '../src/types/authority';
import {
  getAllTransitionRules,
  getAllResponsibilities,
} from '../src/config/state-transition-authority';

async function main() {
  console.log('🧪 Testing AuthorityService\n');

  const service = new AuthorityService({
    verbose: true,
    dryRun: false, // Registry に保存する（テスト用）
  });

  // Test 1: ユーザーにロールを割り当て
  console.log('📝 Test 1: Assign Roles to Users');

  await service.assignRole('alice', ['product_owner'], 'admin', 'Product Owner');
  await service.assignRole('bob', ['engineering_lead'], 'admin', 'Engineering Lead');
  await service.assignRole('carol', ['ssot_reviewer'], 'admin', 'SSOT Reviewer');
  await service.assignRole('dave', ['author'], 'admin', 'Content Author');

  console.log('✅ Roles assigned to 4 users\n');

  // Test 2: ユーザーのロールを取得
  console.log('📊 Test 2: Get User Roles');

  const aliceRoles = await service.getUserRoles('alice');
  const bobRoles = await service.getUserRoles('bob');
  const carolRoles = await service.getUserRoles('carol');
  const daveRoles = await service.getUserRoles('dave');

  console.log(`✅ alice: ${aliceRoles.join(', ')}`);
  console.log(`✅ bob: ${bobRoles.join(', ')}`);
  console.log(`✅ carol: ${carolRoles.join(', ')}`);
  console.log(`✅ dave: ${daveRoles.join(', ')}\n`);

  // Test 3: 状態遷移の権限チェック（許可）
  console.log('✅ Test 3: Check Transition Permission (Allowed)');

  // alice (product_owner) can transition draft -> under_review? No (author/ssot_reviewer only)
  const canAliceDraftToReview = await service.canTransition('draft', 'under_review', 'alice');
  console.log(`  alice (product_owner): draft -> under_review = ${canAliceDraftToReview ? 'YES' : 'NO'}`);

  // dave (author) can transition draft -> under_review? Yes
  const canDaveDraftToReview = await service.canTransition('draft', 'under_review', 'dave');
  console.log(`  dave (author): draft -> under_review = ${canDaveDraftToReview ? 'YES' : 'NO'}`);

  // carol (ssot_reviewer) can transition under_review -> agreed? Yes
  const canCarolReviewToAgreed = await service.canTransition('under_review', 'agreed', 'carol');
  console.log(`  carol (ssot_reviewer): under_review -> agreed = ${canCarolReviewToAgreed ? 'YES' : 'NO'}`);

  // alice (product_owner) can transition agreed -> frozen? Yes
  const canAliceAgreedToFrozen = await service.canTransition('agreed', 'frozen', 'alice');
  console.log(`  alice (product_owner): agreed -> frozen = ${canAliceAgreedToFrozen ? 'YES' : 'NO'}\n`);

  // Test 4: 状態遷移の権限チェック（拒否）
  console.log('❌ Test 4: Check Transition Permission (Denied)');

  // dave (author) can transition under_review -> agreed? No
  const canDaveReviewToAgreed = await service.canTransition('under_review', 'agreed', 'dave');
  console.log(`  dave (author): under_review -> agreed = ${canDaveReviewToAgreed ? 'YES' : 'NO'}`);

  // bob (engineering_lead) can transition frozen -> deprecated? No (product_owner only)
  const canBobFrozenToDeprecated = await service.canTransition('frozen', 'deprecated', 'bob');
  console.log(`  bob (engineering_lead): frozen -> deprecated = ${canBobFrozenToDeprecated ? 'YES' : 'NO'}\n`);

  // Test 5: 状態遷移を実行（許可）
  console.log('✅ Test 5: Execute Transition (Allowed)');

  const request1: TransitionRequest = {
    resourceId: 'KRN-001',
    from: 'draft',
    to: 'under_review',
    requestedBy: 'dave',
    requestedByRole: 'author',
    reason: 'Ready for review',
  };

  const result1 = await service.executeTransition(request1);

  if (result1.success) {
    console.log(`✅ Transition executed: ${result1.history?.from} -> ${result1.history?.to}`);
    console.log(`   Changed by: ${result1.history?.changedBy} (${result1.history?.changedByRole})`);
    console.log(`   Reason: ${result1.history?.reason}\n`);
  } else {
    console.log(`❌ Transition failed: ${result1.error}\n`);
  }

  // Test 6: 状態遷移を実行（拒否）
  console.log('❌ Test 6: Execute Transition (Denied)');

  const request2: TransitionRequest = {
    resourceId: 'KRN-001',
    from: 'under_review',
    to: 'agreed',
    requestedBy: 'dave',
    requestedByRole: 'author',
    reason: 'Trying to approve',
  };

  const result2 = await service.executeTransition(request2);

  if (result2.success) {
    console.log(`✅ Transition executed: ${result2.history?.from} -> ${result2.history?.to}\n`);
  } else {
    console.log(`❌ Transition denied: ${result2.error}\n`);
  }

  // Test 7: User Role 統計を取得
  console.log('📊 Test 7: Get User Role Statistics');

  const stats = await service.getUserRoleStats();

  console.log(`✅ User Role Statistics:`);
  console.log(`   Total Users: ${stats.totalUsers}`);
  console.log(`   By Role:`);
  console.log(`     - product_owner: ${stats.byRole.product_owner}`);
  console.log(`     - engineering_lead: ${stats.byRole.engineering_lead}`);
  console.log(`     - ssot_reviewer: ${stats.byRole.ssot_reviewer}`);
  console.log(`     - compliance_owner: ${stats.byRole.compliance_owner}`);
  console.log(`     - security_owner: ${stats.byRole.security_owner}`);
  console.log(`     - author: ${stats.byRole.author}\n`);

  // Test 8: State Transition Rules を表示
  console.log('📋 Test 8: Display State Transition Rules');

  const rules = getAllTransitionRules();

  console.log(`✅ State Transition Rules (${rules.length} rules):`);
  for (const rule of rules) {
    console.log(`   ${rule.from} -> ${rule.to}`);
    console.log(`     Allowed Roles: ${rule.allowedRoles.join(', ')}`);
    console.log(`     Description: ${rule.description}`);
  }
  console.log();

  // Test 9: Responsibility Model を表示
  console.log('📋 Test 9: Display Responsibility Model');

  const responsibilities = getAllResponsibilities();

  console.log(`✅ Responsibility Model (${responsibilities.length} roles):`);
  for (const resp of responsibilities) {
    console.log(`   Role: ${resp.role}`);
    console.log(`     Description: ${resp.description}`);
    console.log(`     Responsibilities:`);
    for (const r of resp.responsibilities) {
      console.log(`       - ${r}`);
    }
  }
  console.log();

  // Test 10: 複数ロールを持つユーザー
  console.log('✨ Test 10: User with Multiple Roles');

  await service.assignRole(
    'eve',
    ['product_owner', 'ssot_reviewer'],
    'admin',
    'Product Owner & SSOT Reviewer'
  );

  const eveRoles = await service.getUserRoles('eve');
  console.log(`✅ eve: ${eveRoles.join(', ')}`);

  // eve can transition draft -> under_review? Yes (has ssot_reviewer)
  const canEveDraftToReview = await service.canTransition('draft', 'under_review', 'eve');
  console.log(`  eve: draft -> under_review = ${canEveDraftToReview ? 'YES' : 'NO'}`);

  // eve can transition frozen -> deprecated? Yes (has product_owner)
  const canEveFrozenToDeprecated = await service.canTransition('frozen', 'deprecated', 'eve');
  console.log(`  eve: frozen -> deprecated = ${canEveFrozenToDeprecated ? 'YES' : 'NO'}\n`);

  console.log('✅ All tests completed!');
}

main().catch((error) => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});
