#!/usr/bin/env tsx
/**
 * Kernel Registry Demo Script
 *
 * Purpose: Demonstrate Kernel Registry functionality with NRVV traceability
 */

import { KernelRegistryService } from '../src/ssot/kernel-registry';
import { KernelWithNRVV } from '../src/types/nrvv';

async function main() {
  console.log('='.repeat(70));
  console.log('🌸 Kernel Registry Demo - NRVV Traceability');
  console.log('='.repeat(70));
  console.log();

  const registry = new KernelRegistryService();

  // ========================================================================
  // 1. Load Registry
  // ========================================================================
  console.log('📂 Step 1: Load Kernel Registry from kernels.yaml');
  console.log('-'.repeat(70));

  const loadedRegistry = await registry.load();
  console.log(`✓ Registry loaded`);
  console.log(`  - Total Kernels: ${loadedRegistry.statistics.total_kernels}`);
  console.log(`  - Agreed: ${loadedRegistry.statistics.by_maturity.agreed}`);
  console.log(`  - Frozen: ${loadedRegistry.statistics.by_maturity.frozen}`);
  console.log();

  // ========================================================================
  // 2. Get All Kernels
  // ========================================================================
  console.log('📋 Step 2: Get All Kernels');
  console.log('-'.repeat(70));

  const allKernels = await registry.getAllKernels();
  for (const kernel of allKernels) {
    console.log(`✓ ${kernel.id}: "${kernel.statement}"`);
    console.log(`  - Category: ${kernel.category}`);
    console.log(`  - Maturity: ${kernel.maturity}`);
    console.log(`  - Owner: ${kernel.owner}`);
  }
  console.log();

  // ========================================================================
  // 3. Search Kernels
  // ========================================================================
  console.log('🔍 Step 3: Search Kernels by Criteria');
  console.log('-'.repeat(70));

  const criticalKernels = await registry.searchKernels({
    maturity: ['agreed', 'frozen'],
    tag: 'security',
  });

  console.log(`Found ${criticalKernels.length} security kernels (agreed/frozen):`);
  for (const kernel of criticalKernels) {
    console.log(`  - ${kernel.id}: ${kernel.statement}`);
  }
  console.log();

  // ========================================================================
  // 4. Validate NRVV
  // ========================================================================
  console.log('✅ Step 4: Validate NRVV Traceability');
  console.log('-'.repeat(70));

  for (const kernel of allKernels) {
    const validation = await registry.validateNRVV(kernel.id);

    console.log(`\n${kernel.id}: "${kernel.statement}"`);
    console.log(`  Valid: ${validation.isValid ? '✓' : '✗'}`);
    console.log(`  Traceability Complete: ${validation.traceabilityComplete ? '✓' : '✗'}`);

    if (validation.errors.length > 0) {
      console.log(`  Errors:`);
      for (const error of validation.errors) {
        console.log(`    - ${error}`);
      }
    }

    if (validation.warnings.length > 0) {
      console.log(`  Warnings:`);
      for (const warning of validation.warnings) {
        console.log(`    - ${warning}`);
      }
    }

    if (validation.missingLinks.length > 0) {
      console.log(`  Missing Links:`);
      for (const link of validation.missingLinks) {
        console.log(`    - ${link.from} -> ${link.to} (${link.type})`);
      }
    }
  }
  console.log();

  // ========================================================================
  // 5. Generate Traceability Matrix
  // ========================================================================
  console.log('📊 Step 5: Generate Traceability Matrix');
  console.log('-'.repeat(70));

  for (const kernel of allKernels) {
    console.log(`\n${kernel.id}: Traceability Matrix`);
    const matrix = await registry.generateTraceabilityMatrix(kernel.id);

    if (matrix.length === 0) {
      console.log('  (No needs defined)');
      continue;
    }

    console.log('  | Need | Requirements | Verifications | Validations | Complete |');
    console.log('  |------|--------------|---------------|-------------|----------|');

    for (const entry of matrix) {
      const needId = entry.needId.padEnd(10);
      const reqCount = entry.requirementIds.length.toString().padEnd(12);
      const verCount = entry.verificationIds.length.toString().padEnd(13);
      const valCount = entry.validationIds.length.toString().padEnd(11);
      const complete = entry.complete ? '✓' : '✗';

      console.log(`  | ${needId} | ${reqCount} | ${verCount} | ${valCount} | ${complete}        |`);
    }
  }
  console.log();

  // ========================================================================
  // 6. Add New Kernel
  // ========================================================================
  console.log('➕ Step 6: Add New Kernel');
  console.log('-'.repeat(70));

  const newKernel: KernelWithNRVV = {
    id: 'KRN-003',
    statement: 'すべてのユーザー入力は検証してからDBに保存する',
    category: 'security',
    owner: 'TechLead',
    maturity: 'draft',
    createdAt: new Date().toISOString(),
    lastUpdatedAt: new Date().toISOString(),

    needs: [
      {
        id: 'NEED-003',
        statement: 'SQLインジェクション攻撃を防止する',
        stakeholder: 'CISO',
        sourceType: 'security_requirement',
        priority: 'critical',
        traceability: {
          upstream: [],
          downstream: ['REQ-003'],
        },
      },
    ],

    requirements: [
      {
        id: 'REQ-003',
        statement: 'すべてのユーザー入力に対してバリデーションとサニタイゼーションを実施',
        type: 'security',
        priority: 'must',
        rationale: 'SQLインジェクション、XSS等の攻撃を防止',
        traceability: {
          upstream: ['NEED-003'],
          downstream: [],
        },
        constraints: [
          'プレースホルダを使用したプリペアドステートメント',
          'HTMLエスケープ処理',
        ],
      },
    ],

    verification: [],
    validation: [],

    history: [
      {
        timestamp: new Date().toISOString(),
        action: 'created',
        by: 'demo-script',
        maturity: 'draft',
      },
    ],

    tags: ['security', 'validation', 'input'],
    labels: ['Maturity:Draft', 'Priority:P0-Critical'],
  };

  await registry.saveKernel(newKernel);
  console.log(`✓ New Kernel added: ${newKernel.id}`);
  console.log(`  Statement: "${newKernel.statement}"`);
  console.log(`  Category: ${newKernel.category}`);
  console.log(`  Maturity: ${newKernel.maturity}`);
  console.log();

  // ========================================================================
  // 7. Get Convergence Rate
  // ========================================================================
  console.log('📈 Step 7: Calculate Convergence Rate');
  console.log('-'.repeat(70));

  const convergenceRate = await registry.getConvergenceRate();
  console.log(`Convergence Rate: ${convergenceRate.toFixed(1)}%`);
  console.log(`(% of agreed/frozen kernels with complete NRVV traceability)`);
  console.log();

  // ========================================================================
  // 8. Final Statistics
  // ========================================================================
  console.log('📊 Step 8: Final Statistics');
  console.log('-'.repeat(70));

  const finalRegistry = await registry.load();
  console.log(`Total Kernels: ${finalRegistry.statistics.total_kernels}`);
  console.log('By Maturity:');
  console.log(`  - Draft: ${finalRegistry.statistics.by_maturity.draft}`);
  console.log(`  - Under Review: ${finalRegistry.statistics.by_maturity.under_review}`);
  console.log(`  - Agreed: ${finalRegistry.statistics.by_maturity.agreed}`);
  console.log(`  - Frozen: ${finalRegistry.statistics.by_maturity.frozen}`);
  console.log(`  - Deprecated: ${finalRegistry.statistics.by_maturity.deprecated}`);
  console.log();

  console.log('='.repeat(70));
  console.log('✅ Demo Complete!');
  console.log('='.repeat(70));
  console.log();
  console.log('📁 Check kernels.yaml to see the updated registry');
  console.log();
}

main().catch((error) => {
  console.error('❌ Error:', error);
  process.exit(1);
});
