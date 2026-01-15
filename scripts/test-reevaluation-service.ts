#!/usr/bin/env tsx
/**
 * Test script for ReevaluationService
 */

import '../src/config/env.js';
import { ReevaluationService } from '../src/services/reevaluation-service';
import { DecisionRecord, FalsificationCondition } from '../src/types';

async function main() {
  console.log('🧪 Testing ReevaluationService\n');

  const service = new ReevaluationService({
    verbose: true,
    dryRun: false, // Registry に保存する（テスト用）
  });

  // Test 1: DecisionRecord with Falsification Conditions を登録
  console.log('📝 Test 1: Register DecisionRecord with Falsification Conditions');

  const falsificationConditions: FalsificationCondition[] = [
    {
      id: 'fc-001',
      condition: 'ユーザー満足度が70%を下回る',
      signalRef: 'sig.user_satisfaction',
      threshold: 0.7,
      thresholdComparison: 'lt',
    },
    {
      id: 'fc-002',
      condition: 'コストが予算の120%を超える',
      signalRef: 'sig.cost_ratio',
      threshold: 1.2,
      thresholdComparison: 'gt',
    },
    {
      id: 'fc-003',
      condition: 'レスポンスタイムが500ms を超える',
      signalRef: 'sig.response_time_ms',
      threshold: 500,
      thresholdComparison: 'gt',
    },
  ];

  const decisionRecord: DecisionRecord = {
    id: 'DEC-2026-001',
    opportunityId: 'OPP-2026-001',
    decisionType: 'adopt',
    chosenOptionId: 'OPT-001',
    decidedBy: 'ProductOwner',
    decidedAt: new Date().toISOString(),
    rationale: 'Option OPT-001 selected based on hypothesis: Improve user experience with new UI',
    tradeoffs: ['Speed vs. Quality', 'Risk: Technical complexity'],
    alternatives: ['OPT-002', 'OPT-003'],
    // ✨ NEW Fields
    falsificationConditions,
    linkedEvaluationIds: [],
    remainingRisks: ['技術スタックの成熟度', 'サードパーティAPIの可用性'],
    dissentingViews: [],
    impactScope: ['ユーザー体験', 'UI/UX', 'パフォーマンス'],
    linkedEvidence: [],
  };

  await service.registerDecision(decisionRecord);

  console.log(`✅ DecisionRecord registered: ${decisionRecord.id}`);
  console.log(`   Falsification Conditions: ${falsificationConditions.length}`);
  console.log(`   Remaining Risks: ${decisionRecord.remainingRisks.length}`);
  console.log(`   Impact Scope: ${decisionRecord.impactScope.join(', ')}\n`);

  // Test 2: Falsification Conditions を評価（閾値未達）
  console.log('📊 Test 2: Check Falsification Conditions (Not Triggered)');

  const signalValues1 = {
    'sig.user_satisfaction': 0.85, // OK (> 0.7)
    'sig.cost_ratio': 1.05, // OK (< 1.2)
    'sig.response_time_ms': 350, // OK (< 500)
  };

  const result1 = await service.checkFalsificationConditions(decisionRecord.id, signalValues1);

  console.log(`✅ Evaluation completed:`);
  console.log(`   Needs Reevaluation: ${result1.needsReevaluation ? 'YES' : 'NO'}`);
  console.log(`   Triggers detected: ${result1.triggers.length}\n`);

  // Test 3: Falsification Conditions を評価（閾値達成）
  console.log('⚠️  Test 3: Check Falsification Conditions (Triggered)');

  const signalValues2 = {
    'sig.user_satisfaction': 0.65, // NG (< 0.7) - TRIGGER!
    'sig.cost_ratio': 1.35, // NG (> 1.2) - TRIGGER!
    'sig.response_time_ms': 350, // OK (< 500)
  };

  const result2 = await service.checkFalsificationConditions(decisionRecord.id, signalValues2);

  console.log(`✅ Evaluation completed:`);
  console.log(`   Needs Reevaluation: ${result2.needsReevaluation ? 'YES' : 'NO'}`);
  console.log(`   Triggers detected: ${result2.triggers.length}`);

  for (const trigger of result2.triggers) {
    console.log(`   - ${trigger.message}`);
    console.log(`     Actual: ${trigger.actualValue}, Threshold: ${trigger.threshold}`);
  }
  console.log();

  // Test 4: Reevaluation プロセス開始
  if (result2.triggers.length > 0) {
    console.log('🔄 Test 4: Start Reevaluation Process');

    const reevaluation = await service.startReevaluation(
      decisionRecord.id,
      result2.triggers[0],
      'SystemMonitor'
    );

    console.log(`✅ Reevaluation started: ${reevaluation.id}`);
    console.log(`   Decision: ${reevaluation.decisionId}`);
    console.log(`   Trigger: ${reevaluation.trigger.message}`);
    console.log(`   Status: ${reevaluation.status}`);
    console.log(`   Started by: ${reevaluation.startedBy}\n`);

    // Test 5: Reevaluation プロセス完了
    console.log('✅ Test 5: Complete Reevaluation Process');

    const completedReevaluation = await service.completeReevaluation(
      reevaluation.id,
      'Decision remains valid after review',
      undefined // 新しい Decision は作成しない
    );

    console.log(`✅ Reevaluation completed: ${completedReevaluation.id}`);
    console.log(`   Status: ${completedReevaluation.status}`);
    console.log(`   Conclusion: ${completedReevaluation.conclusion}\n`);
  }

  // Test 6: Decision 統計取得
  console.log('📊 Test 6: Get Decision Statistics');

  const stats = await service.getDecisionStats();

  console.log(`✅ Decision Statistics:`);
  console.log(`   Total Decisions: ${stats.totalDecisions}`);
  console.log(`   By Type:`);
  console.log(`     - Adopt: ${stats.byType.adopt}`);
  console.log(`     - Defer: ${stats.byType.defer}`);
  console.log(`     - Reject: ${stats.byType.reject}`);
  console.log(`     - Explore: ${stats.byType.explore}`);
  console.log(`   With Falsification Conditions: ${stats.withFalsificationConditions}`);
  console.log(`   Reevaluations: ${stats.reevaluations}\n`);

  // Test 7: DecisionRecord の新フィールド検証
  console.log('✅ Test 7: Verify DecisionRecord New Fields');

  console.log(`✅ DecisionRecord (${decisionRecord.id}):`);
  console.log(`   - falsificationConditions: ${decisionRecord.falsificationConditions.length} conditions`);
  decisionRecord.falsificationConditions.forEach((fc, i) => {
    console.log(`     ${i + 1}. ${fc.condition}`);
    if (fc.signalRef && fc.threshold) {
      console.log(`        Signal: ${fc.signalRef}, Threshold: ${fc.threshold}, Comparison: ${fc.thresholdComparison}`);
    }
  });
  console.log(`   - linkedEvaluationIds: ${decisionRecord.linkedEvaluationIds.length} (Phase 2)`);
  console.log(`   - remainingRisks: ${decisionRecord.remainingRisks.length} risks`);
  decisionRecord.remainingRisks.forEach((risk, i) => {
    console.log(`     ${i + 1}. ${risk}`);
  });
  console.log(`   - dissentingViews: ${decisionRecord.dissentingViews?.length || 0} (Optional)`);
  console.log(`   - impactScope: ${decisionRecord.impactScope.length} areas`);
  decisionRecord.impactScope.forEach((scope, i) => {
    console.log(`     ${i + 1}. ${scope}`);
  });
  console.log(`   - linkedEvidence: ${decisionRecord.linkedEvidence.length} (Phase 2)`);
  console.log();

  console.log('✅ All tests completed!');
}

main().catch((error) => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});
