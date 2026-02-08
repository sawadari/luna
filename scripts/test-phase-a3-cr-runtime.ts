/**
 * Phase A3: CR-Runtime統合テスト
 *
 * ChangeRequestからKernel操作が自動実行されることを確認
 */

import { ChangeControlAgent } from '../src/agents/change-control-agent.js';
import { KernelLedger } from '../src/ssot/kernel-ledger.js';
import { ensureRulesConfigLoaded } from '../src/services/rules-config-service.js';
import * as fs from 'fs/promises';

async function main() {
  console.log('🧪 Phase A3: CR-Runtime統合テスト\n');
  console.log('=' .repeat(60));
  console.log();

  // Ensure rules configuration is loaded before creating agents
  await ensureRulesConfigLoaded();
  console.log('✅ Rules configuration loaded\n');

  const ledgerPath = 'data/ssot/test-a3-ledger.ndjson';
  const registryPath = 'data/ssot/kernels-test.yaml';

  // テスト前にLedgerファイルを削除
  try {
    await fs.unlink(ledgerPath);
    console.log('🗑️  既存のLedgerファイルを削除\n');
  } catch {
    // ファイルが存在しない場合は無視
  }

  // ========================================================================
  // Phase A3テスト: CRからKernel操作を実行
  // ========================================================================
  console.log('📦 Phase A3: ChangeRequest実行テスト');
  console.log('-'.repeat(60));

  const agent = new ChangeControlAgent({
    githubToken: process.env.GITHUB_TOKEN || 'dummy-token',
    repository: process.env.GITHUB_REPOSITORY || 'dummy/repo',
    dryRun: false,
    verbose: false,
    // Phase A3: Kernel Runtime設定を指定（テスト用）
    kernelRegistryPath: registryPath,
    kernelLedgerPath: ledgerPath,
    kernelSoloMode: true,  // テスト用にSolo Mode有効化
  });

  // Test 1: CRを作成（operation_detailsも含む）
  console.log('\n1️⃣  ChangeRequest作成');
  const crResult = await agent.createChangeRequest({
    raised_by: 'test-user',
    trigger_type: 'manual',
    affected_scope: ['KRN-TEST-001'],
    notes: 'Phase A3統合テスト',
    operation_details: [
      {
        operation_type: 'u.record_decision',
        kernel_id: 'KRN-TEST-001',
        payload: {
          decision_id: 'DR-A3-001',
          decision_type: 'architectural',
          decided_by: 'test-user',
          rationale: 'Phase A3でCRからRuntime経由の実行をテスト',
          assurance_level: 'AL1',
        },
      },
      {
        operation_type: 'u.link_evidence',
        kernel_id: 'KRN-TEST-001',
        payload: {
          evidence_type: 'test_result',
          evidence_id: 'EV-A3-001',
          evidence_source: 'test-phase-a3-cr-runtime.ts',
          verification_status: 'passed',
        },
      },
      {
        operation_type: 'u.set_state',
        kernel_id: 'KRN-TEST-001',
        payload: {
          from: 'agreed',
          to: 'frozen',
          reason: 'Phase A3テストによるfreeze',
          actor_role: 'product_owner',
          gate_checks: {
            nrvv_complete: true,
            evidence_sufficient: true,
            no_blocking_exceptions: true,
          },
        },
      },
    ],
  });

  if (crResult.status !== 'success' || !crResult.data) {
    console.log('   ❌ CR作成失敗:', crResult.error);
    console.log('\n❌ Phase A3テスト失敗: CR作成に失敗しました');
    process.exit(1);
  }

  const cr = crResult.data;
  console.log(`   ✅ CR作成成功: ${cr.cr_id}`);
  console.log(`   ✅ ${cr.operation_details?.length || 0}件の操作を含む`);

  // Test 2: CRを承認
  console.log('\n2️⃣  ChangeRequest承認');
  const approveResult = await agent.approveChangeRequest(cr.cr_id, 'test-approver');

  if (approveResult.status !== 'success') {
    console.log('   ❌ CR承認失敗:', approveResult.error);
    console.log('\n❌ Phase A3テスト失敗: CR承認に失敗しました');
    process.exit(1);
  }

  console.log(`   ✅ CR承認成功: ${cr.cr_id}`);

  // Test 3: CRを実行（KernelRuntime経由）
  console.log('\n3️⃣  ChangeRequest実行（Kernel操作実行）');
  const executeResult = await agent.executeChangeRequest(cr.cr_id, 'test-executor');

  if (executeResult.status !== 'success' || !executeResult.data) {
    console.log('   ❌ CR実行失敗:', executeResult.error);
    console.log('\n❌ Phase A3テスト失敗: CR実行に失敗しました');
    process.exit(1);
  }

  const executedCR = executeResult.data;
  console.log(`   ✅ CR実行完了: ${executedCR.cr_id}`);

  if (executedCR.execution_results) {
    console.log(`\n   実行結果:`);
    for (const result of executedCR.execution_results) {
      const status = result.success ? '✅ SUCCESS' : '❌ FAILED';
      console.log(`      ${status} - ${result.operation_type} (${result.op_id})`);
      if (result.error) {
        console.log(`         Error: ${result.error}`);
      }
    }

    const successCount = executedCR.execution_results.filter(r => r.success).length;
    const totalCount = executedCR.execution_results.length;
    console.log(`\n   実行成功率: ${successCount}/${totalCount}`);
  }

  // ========================================================================
  // Ledger確認
  // ========================================================================
  console.log('\n' + '='.repeat(60));
  console.log('📚 Ledger確認');
  console.log('-'.repeat(60));

  const ledger = new KernelLedger({ ledgerPath, verbose: false });
  const allEntries = await ledger.readAll();
  console.log(`\n✅ ${allEntries.length}件のLedgerエントリを確認`);

  if (allEntries.length > 0) {
    console.log('\nLedgerエントリ:');
    for (const entry of allEntries) {
      const status = entry.result.success ? '✅' : '❌';
      console.log(`   ${status} ${entry.operation.op} (${entry.entry_id})`);
    }
  }

  // Ledger再生
  console.log('\n🔄 Ledger再生（状態再構成）');
  const reconstructedKernels = await ledger.replay();
  console.log(`   ✅ ${Object.keys(reconstructedKernels).length}個のKernelを再構成`);

  if (reconstructedKernels['KRN-TEST-001']) {
    const kernel = reconstructedKernels['KRN-TEST-001'];
    console.log(`\n   📋 Kernel KRN-TEST-001 の状態:`);
    console.log(`      - Maturity: ${kernel.maturity}`);
    console.log(`      - Decision: ${kernel.decision?.decision_id || 'なし'}`);
    console.log(`      - Evidence: ${kernel.evidence?.length || 0}件`);
    console.log(`      - History: ${kernel.history.length}件`);

    if (kernel.maturity === 'frozen') {
      console.log(`\n   ✅ 状態がfrozenに遷移しました（CR経由で実行）`);
    }
  }

  // ========================================================================
  // 総合評価
  // ========================================================================
  console.log('\n' + '='.repeat(60));
  console.log('📊 Phase A3総合評価');
  console.log('='.repeat(60));

  console.log(`\n✅ Phase A3: CR-Runtime統合`);
  console.log(`   - CR作成: 成功`);
  console.log(`   - CR承認: 成功`);
  console.log(`   - CR実行: 成功`);
  console.log(`   - Kernel操作実行: ${executedCR.execution_results?.filter(r => r.success).length || 0}/${executedCR.execution_results?.length || 0}`);
  console.log(`   - Ledger記録: ${allEntries.length}件`);
  console.log(`   - 状態再構成: 成功`);

  // 最終判定
  const finalSuccessCount = executedCR.execution_results?.filter(r => r.success).length || 0;
  const finalTotalCount = executedCR.execution_results?.length || 0;

  console.log(`\n${'='.repeat(60)}`);
  if (finalSuccessCount === finalTotalCount && finalTotalCount > 0) {
    console.log(`✅ Phase A3テスト完了！ すべてのKernel操作が成功しました。`);
    console.log(`\n📋 完成した機能:`);
    console.log(`   ✅ ChangeRequestからKernel操作を自動実行`);
    console.log(`   ✅ 実行結果（op_id群）をCRに記録`);
    console.log(`   ✅ Ledgerへの自動記録`);
    console.log(`\n次のステップ:`);
    console.log(`   - Phase B1: Kernel Graph Schema導入`);
    console.log(`   - Phase C1: Issue一本道の運用固定`);
    console.log();
    process.exit(0);
  } else {
    console.log(`❌ Phase A3テスト失敗: ${finalSuccessCount}/${finalTotalCount} Kernel操作が成功`);
    console.log(`\n失敗したKernel操作を確認してください。`);
    console.log();
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
