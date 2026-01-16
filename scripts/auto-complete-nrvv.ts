#!/usr/bin/env tsx
/**
 * Auto-Complete NRVV for Incomplete Kernels
 *
 * This script:
 * 1. Finds incomplete Kernels (missing V or V)
 * 2. Uses AI to suggest Verification/Validation
 * 3. Auto-completes NRVV for selected Kernels
 *
 * Usage:
 *   npm run auto-complete-nrvv
 *   npm run auto-complete-nrvv -- --kernel KRN-0001
 *   npm run auto-complete-nrvv -- --all
 */

import { Command } from 'commander';
import { KernelRegistryService } from '../src/ssot/kernel-registry';
import { env } from '../src/config/env';

const program = new Command();

program
  .name('auto-complete-nrvv')
  .description('Auto-complete NRVV for incomplete Kernels using AI')
  .option('-k, --kernel <id>', 'Specific Kernel ID to auto-complete')
  .option('-a, --all', 'Auto-complete all incomplete Kernels')
  .option('--dry-run', 'Show suggestions without applying them')
  .parse(process.argv);

const options = program.opts();

async function main() {
  console.log('🤖 NRVV Auto-Completion Tool\n');

  // Check for API key
  if (!env.anthropicApiKey) {
    console.error('❌ Error: ANTHROPIC_API_KEY not configured');
    console.error('   Please set ANTHROPIC_API_KEY in .env file\n');
    process.exit(1);
  }

  // Initialize services
  const kernelRegistry = new KernelRegistryService(
    undefined,
    env.anthropicApiKey
  );
  await kernelRegistry.load();

  // Get incomplete Kernels
  const incompleteKernels = await kernelRegistry.getIncompleteKernels();
  console.log(`📊 Found ${incompleteKernels.length} incomplete Kernels\n`);

  if (incompleteKernels.length === 0) {
    console.log('✅ No incomplete Kernels found. All Kernels are complete!\n');
    return;
  }

  // Filter Kernels based on options
  let kernelsToProcess = incompleteKernels;

  if (options.kernel) {
    kernelsToProcess = incompleteKernels.filter((k) => k.id === options.kernel);

    if (kernelsToProcess.length === 0) {
      console.error(`❌ Error: Kernel ${options.kernel} not found or already complete\n`);
      process.exit(1);
    }

    console.log(`🎯 Processing specific Kernel: ${options.kernel}\n`);
  } else if (!options.all) {
    console.log('📋 Incomplete Kernels:');
    incompleteKernels.forEach((k, idx) => {
      console.log(`   ${idx + 1}. ${k.id}: ${k.statement}`);
    });
    console.log('\n💡 Use --kernel <id> to process specific Kernel');
    console.log('💡 Use --all to process all incomplete Kernels\n');
    return;
  }

  // Process each Kernel
  let successCount = 0;
  let errorCount = 0;

  for (const kernel of kernelsToProcess) {
    console.log(`\n🔍 Processing: ${kernel.id}`);
    console.log(`   Statement: ${kernel.statement}`);
    console.log(`   Requirements: ${kernel.requirements.length}`);

    try {
      // Get suggestions
      console.log('   🤖 Generating V&V suggestions with Claude...');
      const suggestions = await kernelRegistry.suggestVerificationValidation(
        kernel.id
      );

      console.log(`   ✅ Suggested:`);
      console.log(`      - ${suggestions.verification.length} Verification items`);
      console.log(`      - ${suggestions.validation.length} Validation items`);

      if (options.dryRun) {
        console.log(`\n   📄 Verification Suggestions:`);
        suggestions.verification.forEach((v, idx) => {
          console.log(`      ${idx + 1}. ${v.statement}`);
          console.log(`         Method: ${v.method}`);
          console.log(`         Criteria: ${v.criteria.join(', ')}`);
        });

        console.log(`\n   📄 Validation Suggestions:`);
        suggestions.validation.forEach((v, idx) => {
          console.log(`      ${idx + 1}. ${v.statement}`);
          console.log(`         Method: ${v.method}`);
          console.log(`         Criteria: ${v.criteria.join(', ')}`);
        });

        console.log(`\n   ⚠️  Dry-run mode: Changes not applied`);
      } else {
        // Apply suggestions
        console.log('   💾 Applying suggestions to Kernel...');
        await kernelRegistry.autoCompleteNRVV(kernel.id);
        console.log(`   ✅ NRVV auto-completed for ${kernel.id}`);
        successCount++;
      }
    } catch (error) {
      console.error(`   ❌ Error processing ${kernel.id}:`, (error as Error).message);
      errorCount++;
    }
  }

  // Summary
  console.log(`\n${'='.repeat(60)}`);
  console.log('📊 Summary');
  console.log(`${'='.repeat(60)}`);
  console.log(`Total incomplete Kernels: ${incompleteKernels.length}`);
  console.log(`Processed: ${kernelsToProcess.length}`);

  if (!options.dryRun) {
    console.log(`Success: ${successCount}`);
    console.log(`Errors: ${errorCount}`);
  } else {
    console.log(`Mode: Dry-run (no changes applied)`);
  }

  console.log('');

  if (!options.dryRun && successCount > 0) {
    console.log('✅ NRVV auto-completion completed!');
    console.log('💡 Run "npm run check-convergence" to verify convergence rate\n');
  }
}

main().catch((error) => {
  console.error('❌ Error:', error);
  process.exit(1);
});
