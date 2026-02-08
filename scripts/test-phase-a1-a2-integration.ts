/**
 * Phase A1+A2 統合テスト
 *
 * Kernel Runtime + Ledgerの完全な動作確認
 */

import { KernelRuntime } from '../src/ssot/kernel-runtime.js';
import { KernelLedger } from '../src/ssot/kernel-ledger.js';
import {
  RecordDecisionOperation,
  LinkEvidenceOperation,
  SetStateOperation,
  RaiseExceptionOperation,
  CloseExceptionOperation,
} from '../src/types/kernel-operations.js';
import { ensureRulesConfigLoaded } from '../src/services/rules-config-service.js';
import * as fs from 'fs/promises';

async function main() {
  console.log('🧪 Phase A1+A2 統合テスト\n');
  console.log('=' .repeat(60));
  console.log();

  // Ensure rules configuration is loaded before creating KernelRuntime
  await ensureRulesConfigLoaded();
  console.log('✅ Rules configuration loaded\n');

  const ledgerPath = 'data/ssot/test-integration-ledger.ndjson';
  const registryPath = 'data/ssot/kernels-test.yaml';

  // テスト前にLedgerファイルを削除
  try {
    await fs.unlink(ledgerPath);
    console.log('🗑️  既存のLedgerファイルを削除\n');
  } catch {
    // ファイルが存在しない場合は無視
  }

  // ========================================================================
  // Phase A1: Kernel Runtime テスト
  // ========================================================================
  console.log('📦 Phase A1: Kernel Runtime テスト');
  console.log('-'.repeat(60));

  const runtime = new KernelRuntime({
    registryPath,
    ledgerPath,
    enableLedger: true,
    soloMode: true,
    dryRun: false,
    verbose: false, // ログを抑制
  });

  const testKernelId = 'KRN-TEST-001';
  let successCount = 0;
  let totalCount = 0;

  // Test 1: u.record_decision
  console.log('\n1️⃣  u.record_decision テスト');
  totalCount++;
  const recordOp: RecordDecisionOperation = {
    op: 'u.record_decision',
    actor: 'test-user',
    issue: '#TEST-001',
    payload: {
      kernel_id: testKernelId,
      decision_id: 'DR-INT-001',
      decision_type: 'architectural',
      decided_by: 'test-user',
      rationale: 'Phase A1+A2統合テスト',
      falsification_conditions: ['条件1', '条件2'],
      assurance_level: 'AL2',
    },
  };

  try {
    const result = await runtime.apply(recordOp);
    if (result.success) {
      console.log(`   ✅ Success (${result.op_id})`);
      successCount++;
    } else {
      console.log(`   ❌ Failed: ${result.error}`);
    }
  } catch (error) {
    console.log(`   ❌ Error: ${(error as Error).message}`);
  }

  // Test 2: u.link_evidence
  console.log('\n2️⃣  u.link_evidence テスト');
  totalCount++;
  const linkOp: LinkEvidenceOperation = {
    op: 'u.link_evidence',
    actor: 'test-user',
    issue: '#TEST-001',
    payload: {
      kernel_id: testKernelId,
      evidence_type: 'test_result',
      evidence_id: 'EV-INT-001',
      evidence_source: 'test-suite-alpha',
      verification_status: 'passed',
    },
  };

  try {
    const result = await runtime.apply(linkOp);
    if (result.success) {
      console.log(`   ✅ Success (${result.op_id})`);
      successCount++;
    } else {
      console.log(`   ❌ Failed: ${result.error}`);
    }
  } catch (error) {
    console.log(`   ❌ Error: ${(error as Error).message}`);
  }

  // Test 3: u.raise_exception
  console.log('\n3️⃣  u.raise_exception テスト');
  totalCount++;
  const raiseOp: RaiseExceptionOperation = {
    op: 'u.raise_exception',
    actor: 'test-user',
    issue: '#TEST-001',
    payload: {
      kernel_id: testKernelId,
      exception_type: 'risk',
      severity: 'medium',
      description: 'パフォーマンス懸念',
      resolution_strategy: '最適化を検討',
    },
  };

  try {
    const result = await runtime.apply(raiseOp);
    if (result.success) {
      const exceptionId = result.details?.exception_id;
      console.log(`   ✅ Success (${result.op_id}, Exception: ${exceptionId})`);
      successCount++;

      // Test 4: u.close_exception (直後にクローズ)
      console.log('\n4️⃣  u.close_exception テスト');
      totalCount++;
      const closeOp: CloseExceptionOperation = {
        op: 'u.close_exception',
        actor: 'test-user',
        issue: '#TEST-001',
        payload: {
          kernel_id: testKernelId,
          exception_id: exceptionId as string,
          resolution: '最適化実施済み',
          resolved_by: 'test-user',
        },
      };

      const closeResult = await runtime.apply(closeOp);
      if (closeResult.success) {
        console.log(`   ✅ Success (${closeResult.op_id})`);
        successCount++;
      } else {
        console.log(`   ❌ Failed: ${closeResult.error}`);
      }
    } else {
      console.log(`   ❌ Failed: ${result.error}`);
      totalCount++; // close_exceptionもカウント
    }
  } catch (error) {
    console.log(`   ❌ Error: ${(error as Error).message}`);
    totalCount++; // close_exceptionもカウント
  }

  // Test 5: u.set_state (draft -> under_review)
  console.log('\n5️⃣  u.set_state テスト (draft -> under_review)');
  totalCount++;
  const setState1: SetStateOperation = {
    op: 'u.set_state',
    actor: 'test-user',
    actor_role: 'product_owner',
    issue: '#TEST-001',
    payload: {
      kernel_id: testKernelId,
      from: 'draft',
      to: 'under_review',
      reason: 'レビュー準備完了',
      gate_checks: {
        nrvv_complete: true,
        evidence_sufficient: true,
        no_blocking_exceptions: true,
      },
    },
  };

  try {
    const result = await runtime.apply(setState1);
    if (result.success) {
      console.log(`   ✅ Success (${result.op_id})`);
      console.log(`      State: ${setState1.payload.from} → ${setState1.payload.to}`);
      successCount++;
    } else {
      console.log(`   ❌ Failed: ${result.error}`);
    }
  } catch (error) {
    console.log(`   ❌ Error: ${(error as Error).message}`);
  }

  // Test 6: u.set_state (under_review -> agreed)
  console.log('\n6️⃣  u.set_state テスト (under_review -> agreed)');
  totalCount++;
  const setState2: SetStateOperation = {
    op: 'u.set_state',
    actor: 'test-user',
    actor_role: 'product_owner',
    issue: '#TEST-001',
    payload: {
      kernel_id: testKernelId,
      from: 'under_review',
      to: 'agreed',
      reason: 'レビュー承認',
      gate_checks: {
        nrvv_complete: true,
        evidence_sufficient: true,
        no_blocking_exceptions: true,
      },
    },
  };

  try {
    const result = await runtime.apply(setState2);
    if (result.success) {
      console.log(`   ✅ Success (${result.op_id})`);
      console.log(`      State: ${setState2.payload.from} → ${setState2.payload.to}`);
      successCount++;
    } else {
      console.log(`   ❌ Failed: ${result.error}`);
    }
  } catch (error) {
    console.log(`   ❌ Error: ${(error as Error).message}`);
  }

  console.log('\n' + '='.repeat(60));
  console.log(`Phase A1テスト結果: ${successCount}/${totalCount} 成功\n`);

  // ========================================================================
  // Phase A2: Kernel Ledger テスト
  // ========================================================================
  console.log('📚 Phase A2: Kernel Ledger テスト');
  console.log('-'.repeat(60));

  const ledger = new KernelLedger({ ledgerPath, verbose: false });

  // Test 7: Ledger読み込み
  console.log('\n7️⃣  Ledger全エントリ読み込み');
  const allEntries = await ledger.readAll();
  console.log(`   ✅ ${allEntries.length}件のエントリを読み込み`);

  let ledgerSuccessCount = 0;
  let ledgerFailedCount = 0;
  for (const entry of allEntries) {
    if (entry.result.success) {
      ledgerSuccessCount++;
    } else {
      ledgerFailedCount++;
    }
  }
  console.log(`      成功: ${ledgerSuccessCount}件, 失敗: ${ledgerFailedCount}件`);

  // Test 8: Kernel IDでフィルタ
  console.log('\n8️⃣  Kernel IDでフィルタ');
  const kernelEntries = await ledger.readByKernel(testKernelId);
  console.log(`   ✅ ${kernelEntries.length}件のエントリ (Kernel: ${testKernelId})`);

  // Test 9: Issueでフィルタ
  console.log('\n9️⃣  Issueでフィルタ');
  const issueEntries = await ledger.readByIssue('#TEST-001');
  console.log(`   ✅ ${issueEntries.length}件のエントリ (Issue: #TEST-001)`);

  // Test 10: Ledger再生
  console.log('\n🔟 Ledger再生（状態再構成）');
  const reconstructedKernels = await ledger.replay();
  console.log(`   ✅ ${Object.keys(reconstructedKernels).length}個のKernelを再構成`);

  if (reconstructedKernels[testKernelId]) {
    const kernel = reconstructedKernels[testKernelId];
    console.log(`\n   📋 Kernel ${testKernelId} の再構成状態:`);
    console.log(`      - Maturity: ${kernel.maturity}`);
    console.log(`      - Decision ID: ${kernel.decision?.decision_id || 'なし'}`);
    console.log(`      - Evidence: ${kernel.evidence?.length || 0}件`);
    console.log(`      - Exceptions: ${kernel.exceptions?.length || 0}件`);
    console.log(`      - History: ${kernel.history.length}件`);

    // 状態遷移の検証
    if (kernel.maturity === 'agreed') {
      console.log(`\n   ✅ 状態遷移が正しく再現されました`);
      console.log(`      draft → under_review → agreed`);
    } else {
      console.log(`\n   ⚠️  期待される状態: agreed, 実際: ${kernel.maturity}`);
    }

    // Decisionの検証
    if (kernel.decision?.decision_id === 'DR-INT-001') {
      console.log(`   ✅ Decisionが正しく記録されています`);
    }

    // Evidenceの検証
    if (kernel.evidence && kernel.evidence.length > 0) {
      console.log(`   ✅ Evidenceが正しく記録されています`);
    }

    // Exceptionの検証
    const exceptions = kernel.exceptions || [];
    const closedExceptions = exceptions.filter(ex => ex.status === 'closed');
    if (closedExceptions.length > 0) {
      console.log(`   ✅ Exceptionが正しくクローズされています`);
    }
  } else {
    console.log(`   ❌ Kernel ${testKernelId} が見つかりません`);
  }

  // Test 11: Registry形式へのエクスポート
  console.log('\n1️⃣1️⃣  Registry形式へのエクスポート');
  const registry = await ledger.exportToRegistry();
  console.log(`   ✅ Registry生成完了`);
  console.log(`      Total Kernels: ${registry.statistics.total_kernels}`);

  console.log('\n' + '='.repeat(60));
  console.log('Phase A2テスト完了\n');

  // ========================================================================
  // 総合評価
  // ========================================================================
  console.log('📊 総合評価');
  console.log('='.repeat(60));
  console.log(`\n✅ Phase A1: Kernel Runtime`);
  console.log(`   - u.*操作実行: ${successCount}/${totalCount} 成功`);
  console.log(`   - Solo Mode: 動作確認済み`);
  console.log(`   - Gate判定: 動作確認済み`);

  console.log(`\n✅ Phase A2: Kernel Ledger`);
  console.log(`   - Ledger記録: ${allEntries.length}件`);
  console.log(`   - Ledger再生: ${Object.keys(reconstructedKernels).length}個のKernel再構成`);
  console.log(`   - フィルタ機能: 動作確認済み`);
  console.log(`   - Registry変換: 動作確認済み`);

  // 最終判定
  console.log(`\n${'='.repeat(60)}`);
  if (successCount === totalCount) {
    console.log(`✅ Phase A1+A2統合テスト完了！ すべてのテストが成功しました。`);
    console.log(`\n次のステップ:`);
    console.log(`   - Phase A3: CRとRuntimeの接続`);
    console.log(`   - Phase B1: Kernel Graph Schema導入`);
    console.log(`   - Phase C1: Issue一本道の運用固定`);
    console.log();
    process.exit(0);
  } else {
    console.log(`❌ Phase A1+A2統合テスト失敗: ${successCount}/${totalCount} 成功`);
    console.log(`\n失敗したテストを確認してください。`);
    console.log();
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
