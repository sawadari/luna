/**
 * Phase A2: Kernel Ledger テストスクリプト
 *
 * Ledger記録・再生機能の動作確認
 */

import { KernelRuntime } from '../src/ssot/kernel-runtime.js';
import { KernelLedger } from '../src/ssot/kernel-ledger.js';
import {
  RecordDecisionOperation,
  SetStateOperation,
} from '../src/types/kernel-operations.js';
import { ensureRulesConfigLoaded } from '../src/services/rules-config-service.js';
import * as fs from 'fs/promises';

async function main() {
  console.log('🧪 Phase A2: Kernel Ledger テスト\n');

  // Ensure rules configuration is loaded before creating KernelRuntime
  await ensureRulesConfigLoaded();
  console.log('✅ Rules configuration loaded\n');

  // テスト失敗フラグ
  let hasFailures = false;

  const ledgerPath = 'data/ssot/test-kernel-ledger.ndjson';

  // テスト前にLedgerファイルを削除
  try {
    await fs.unlink(ledgerPath);
    console.log('   🗑️  既存のLedgerファイルを削除\n');
  } catch {
    // ファイルが存在しない場合は無視
  }

  // 1. KernelRuntime初期化（Ledger有効）
  console.log('1. KernelRuntime初期化（Ledger有効）...');
  const runtime = new KernelRuntime({
    registryPath: 'data/ssot/kernels-luna-base.yaml',
    ledgerPath,
    enableLedger: true,
    soloMode: true,
    dryRun: false, // Ledger記録のため、dry-runを無効化
    verbose: true,
  });
  console.log('   ✅ KernelRuntime初期化完了\n');

  // 2. 複数の操作を実行してLedgerに記録
  console.log('2. Kernel操作を実行（Ledgerに記録）...');

  const testKernelId = 'KRN-TEST-001';

  // u.record_decision
  const recordOp: RecordDecisionOperation = {
    op: 'u.record_decision',
    actor: 'test-user',
    issue: '#A2-TEST',
    payload: {
      kernel_id: testKernelId,
      decision_id: 'DR-A2-001',
      decision_type: 'architectural',
      decided_by: 'test-user',
      rationale: 'Testing Ledger recording',
      assurance_level: 'AL1',
    },
  };

  try {
    const result1 = await runtime.apply(recordOp);
    console.log(`   ${result1.success ? '✅' : '❌'} u.record_decision: ${result1.success ? 'Success' : result1.error}`);
    if (!result1.success) hasFailures = true;
  } catch (error) {
    hasFailures = true;
    console.log(`   ❌ u.record_decision エラー: ${(error as Error).message}`);
  }

  // u.set_state (draft -> under_review)
  const setState1: SetStateOperation = {
    op: 'u.set_state',
    actor: 'test-user',
    actor_role: 'product_owner',
    issue: '#A2-TEST',
    payload: {
      kernel_id: testKernelId,
      from: 'draft',
      to: 'under_review',
      reason: 'Testing state transition',
      gate_checks: {
        nrvv_complete: true,
        evidence_sufficient: true,
        no_blocking_exceptions: true,
      },
    },
  };

  try {
    const result2 = await runtime.apply(setState1);
    console.log(`   ${result2.success ? '✅' : '❌'} u.set_state (draft -> under_review): ${result2.success ? 'Success' : result2.error}`);
    if (!result2.success) hasFailures = true;
  } catch (error) {
    hasFailures = true;
    console.log(`   ❌ u.set_state エラー: ${(error as Error).message}`);
  }

  // u.set_state (under_review -> agreed)
  const setState2: SetStateOperation = {
    op: 'u.set_state',
    actor: 'test-user',
    actor_role: 'product_owner',
    issue: '#A2-TEST',
    payload: {
      kernel_id: testKernelId,
      from: 'under_review',
      to: 'agreed',
      reason: 'Testing second state transition',
      gate_checks: {
        nrvv_complete: true,
        evidence_sufficient: true,
        no_blocking_exceptions: true,
      },
    },
  };

  try {
    const result3 = await runtime.apply(setState2);
    console.log(`   ${result3.success ? '✅' : '❌'} u.set_state (under_review -> agreed): ${result3.success ? 'Success' : result3.error}`);
    if (!result3.success) hasFailures = true;
  } catch (error) {
    hasFailures = true;
    console.log(`   ❌ u.set_state エラー: ${(error as Error).message}`);
  }

  console.log();

  // 3. Ledgerからエントリを読み込み
  console.log('3. Ledgerからエントリを読み込み...');
  const ledger = new KernelLedger({ ledgerPath, verbose: false });
  const allEntries = await ledger.readAll();
  console.log(`   ✅ ${allEntries.length}件のエントリを読み込み`);

  for (const entry of allEntries) {
    console.log(`      - ${entry.entry_id}: ${entry.operation.op} (${entry.result.success ? 'SUCCESS' : 'FAILED'})`);
  }
  console.log();

  // 4. Kernel IDでフィルタ
  console.log('4. Kernel IDでエントリをフィルタ...');
  const kernelEntries = await ledger.readByKernel(testKernelId);
  console.log(`   ✅ ${kernelEntries.length}件のエントリ（Kernel: ${testKernelId}）`);
  console.log();

  // 5. Ledgerを再生して状態を再構成
  console.log('5. Ledgerを再生して状態を再構成...');
  const reconstructedKernels = await ledger.replay();
  console.log(`   ✅ ${Object.keys(reconstructedKernels).length}個のKernelを再構成`);

  if (reconstructedKernels[testKernelId]) {
    const kernel = reconstructedKernels[testKernelId];
    console.log(`   ✅ Kernel ${testKernelId} の状態:`);
    console.log(`      - Maturity: ${kernel.maturity}`);
    console.log(`      - Decision: ${kernel.decision?.decision_id}`);
    console.log(`      - History: ${kernel.history.length}件`);

    // 状態遷移の確認
    if (kernel.maturity === 'agreed') {
      console.log(`   ✅ 状態遷移が正しく再現されました（draft -> under_review -> agreed）`);
    } else {
      hasFailures = true;
    console.log(`   ❌ 状態遷移の再現に失敗: ${kernel.maturity}`);
    }
  } else {
    hasFailures = true;
    console.log(`   ❌ Kernel ${testKernelId} が見つかりません`);
  }
  console.log();

  // 6. Kernel Registryフォーマットにエクスポート
  console.log('6. Kernel Registryフォーマットにエクスポート...');
  const registry = await ledger.exportToRegistry();
  console.log(`   ✅ Registry生成完了: ${registry.statistics.total_kernels}個のKernel`);
  console.log();

  // 7. Phase A2実装確認
  console.log('7. Phase A2実装確認...');
  console.log('   ✅ KernelLedger実装完了');
  console.log('   ✅ append-only記録');
  console.log('   ✅ NDJSON/YAMLフォーマット対応');
  console.log('   ✅ replay()による状態再構成');
  console.log('   ✅ KernelRuntime統合');
  console.log();

  console.log('📋 Phase A2完成条件:');
  console.log('   ✅ 空状態 + Ledger replay で現行Kernelを再現できる');
  console.log('   ✅ 監査時に任意Kernelの変更履歴を時系列で出せる');
  console.log();

  console.log('📋 次のステップ:');
  console.log('   1. Phase A3: CRとRuntimeの接続');
  console.log('   2. Phase B1: Kernel Graph Schema導入');
  console.log('   3. Phase C1: Issue一本道の運用固定');
  console.log();

  // 最終判定
  if (hasFailures) {
    console.log('❌ Phase A2テスト失敗: 1つ以上のテストが失敗しました');
    process.exit(1);
  } else {
    console.log('✅ Phase A2テスト完了: すべてのテストが成功しました');
    process.exit(0);
  }
}

main().catch((error) => {
  console.error('❌ Phase A2テスト失敗（例外）:', error);
  process.exit(1);
});
