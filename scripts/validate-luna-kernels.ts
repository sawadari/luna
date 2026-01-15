#!/usr/bin/env tsx
/**
 * Validate Luna Base NRVV Kernels
 *
 * Purpose: Validate kernels-luna-base.yaml using KernelRegistryService
 */

import '../src/config/env.js';
import { KernelRegistryService } from '../dist/ssot/kernel-registry.js';
import * as path from 'path';

async function main() {
  console.log('='.repeat(70));
  console.log('🔍 Luna Base NRVV Kernels Validation');
  console.log('='.repeat(70));
  console.log();

  const kernelPath = path.join(process.cwd(), 'kernels-luna-base.yaml');
  console.log(`📂 Kernel file: ${kernelPath}`);
  console.log();

  // Initialize Kernel Registry Service
  const kernelRegistry = new KernelRegistryService(kernelPath);

  try {
    // Load kernels
    console.log('📥 Loading kernels...');
    await kernelRegistry.load();
    console.log('✓ Kernels loaded successfully');
    console.log();

    // Get all kernel IDs
    const allKernels = await kernelRegistry.getAllKernels();
    console.log(`📊 Total kernels: ${allKernels.length}`);
    console.log();

    // Validate each kernel
    for (const kernel of allKernels) {
      console.log(`🔍 Validating ${kernel.id}: ${kernel.statement}`);
      console.log('-'.repeat(70));

      // NRVV Validation
      const validationResult = await kernelRegistry.validateNRVV(kernel.id);

      if (validationResult.isValid) {
        console.log('  ✓ NRVV structure is valid');
      } else {
        console.log('  ✗ NRVV validation failed');
        for (const error of validationResult.errors) {
          console.log(`    ERROR: ${error}`);
        }
      }

      if (validationResult.warnings.length > 0) {
        console.log('  ⚠ Warnings:');
        for (const warning of validationResult.warnings) {
          console.log(`    - ${warning}`);
        }
      }

      if (validationResult.traceabilityComplete) {
        console.log('  ✓ Traceability is complete');
      } else {
        console.log('  ⚠ Traceability incomplete');
        for (const missing of validationResult.missingLinks) {
          console.log(`    Missing: ${missing.from} → ${missing.to} (${missing.type})`);
        }
      }

      // Display NRVV structure
      console.log();
      console.log('  📋 NRVV Structure:');
      console.log(`    - Needs: ${kernel.needs.length}`);
      console.log(`    - Requirements: ${kernel.requirements.length}`);
      console.log(`    - Verification: ${kernel.verification.length}`);
      console.log(`    - Validation: ${kernel.validation.length}`);

      // Display traceability
      console.log();
      console.log('  🔗 Traceability:');
      for (const need of kernel.needs) {
        const reqCount = need.traceability.downstream.length;
        console.log(`    ${need.id} → ${reqCount} requirements`);
      }
      for (const req of kernel.requirements) {
        const verCount = req.traceability.downstream.filter(id => id.startsWith('VER')).length;
        const valCount = req.traceability.downstream.filter(id => id.startsWith('VAL')).length;
        console.log(`    ${req.id} → ${verCount} verifications, ${valCount} validations`);
      }

      console.log();
    }

    // Generate Traceability Matrix
    console.log('='.repeat(70));
    console.log('📊 Traceability Matrix');
    console.log('='.repeat(70));
    console.log();

    const matrix = await kernelRegistry.generateTraceabilityMatrix();
    console.log(`Total entries: ${matrix.length}`);
    console.log();

    for (const entry of matrix) {
      console.log(`${entry.needId}:`);
      console.log(`  Requirements: ${entry.requirementIds.join(', ')}`);
      console.log(`  Verifications: ${entry.verificationIds.join(', ')}`);
      console.log(`  Validations: ${entry.validationIds.join(', ')}`);
      console.log(`  Complete: ${entry.complete ? '✓' : '✗'}`);
      console.log();
    }

    // Statistics
    console.log('='.repeat(70));
    console.log('📈 Statistics');
    console.log('='.repeat(70));
    console.log();

    const stats = {
      totalKernels: allKernels.length,
      totalNeeds: allKernels.reduce((sum, k) => sum + k.needs.length, 0),
      totalRequirements: allKernels.reduce((sum, k) => sum + k.requirements.length, 0),
      totalVerifications: allKernels.reduce((sum, k) => sum + k.verification.length, 0),
      totalValidations: allKernels.reduce((sum, k) => sum + k.validation.length, 0),
      byMaturity: {
        draft: allKernels.filter(k => k.maturity === 'draft').length,
        under_review: allKernels.filter(k => k.maturity === 'under_review').length,
        agreed: allKernels.filter(k => k.maturity === 'agreed').length,
        frozen: allKernels.filter(k => k.maturity === 'frozen').length,
        deprecated: allKernels.filter(k => k.maturity === 'deprecated').length,
      },
    };

    console.log(`Total Kernels: ${stats.totalKernels}`);
    console.log(`Total Needs: ${stats.totalNeeds}`);
    console.log(`Total Requirements: ${stats.totalRequirements}`);
    console.log(`Total Verifications: ${stats.totalVerifications}`);
    console.log(`Total Validations: ${stats.totalValidations}`);
    console.log();
    console.log('By Maturity:');
    console.log(`  Draft: ${stats.byMaturity.draft}`);
    console.log(`  Under Review: ${stats.byMaturity.under_review}`);
    console.log(`  Agreed: ${stats.byMaturity.agreed}`);
    console.log(`  Frozen: ${stats.byMaturity.frozen}`);
    console.log(`  Deprecated: ${stats.byMaturity.deprecated}`);
    console.log();

    console.log('='.repeat(70));
    console.log('✅ Validation Complete');
    console.log('='.repeat(70));
    console.log();
    console.log('🎉 All Luna Base NRVV Kernels are valid!');
    console.log();

  } catch (error) {
    console.error('❌ Validation Failed:', error);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('❌ Unexpected Error:', error);
  process.exit(1);
});
