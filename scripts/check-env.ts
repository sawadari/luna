#!/usr/bin/env tsx
/**
 * Check Environment Variables
 *
 * Purpose: Verify that all required environment variables are set
 */

import '../src/config/env.js'; // Initialize dotenv to load .env file

function checkEnv() {
  console.log('='.repeat(80));
  console.log('🔍 Environment Variable Check');
  console.log('='.repeat(80));
  console.log();

  const checks = [
    {
      name: 'GITHUB_TOKEN',
      value: process.env.GITHUB_TOKEN,
      required: true,
      description: 'GitHub Personal Access Token',
    },
    {
      name: 'GITHUB_REPOSITORY',
      value: process.env.GITHUB_REPOSITORY,
      required: true,
      description: 'GitHub repository (owner/repo)',
    },
    {
      name: 'ANTHROPIC_API_KEY',
      value: process.env.ANTHROPIC_API_KEY,
      required: false,
      description: 'Anthropic API Key (optional)',
    },
  ];

  let allRequired = true;
  let allOptional = true;

  console.log('📋 Environment Variables:');
  console.log();

  for (const check of checks) {
    const isSet = !!check.value;
    const status = isSet ? '✅' : (check.required ? '❌' : '⚠️');
    const statusText = isSet ? 'Set' : 'Not set';
    const length = check.value ? ` (${check.value.length} chars)` : '';

    console.log(`${status} ${check.name}`);
    console.log(`   Status: ${statusText}${length}`);
    console.log(`   Description: ${check.description}`);
    console.log(`   Required: ${check.required ? 'Yes' : 'No'}`);

    if (!isSet && check.required) {
      allRequired = false;
      console.log(`   ⚠️  Action: Please set this variable`);
    }

    if (!isSet && !check.required) {
      allOptional = false;
    }

    console.log();
  }

  console.log('-'.repeat(80));
  console.log();

  if (allRequired && allOptional) {
    console.log('✅ All environment variables are set!');
    console.log('   You are ready to run Luna in full mode.');
  } else if (allRequired) {
    console.log('✅ All required environment variables are set!');
    console.log('   You can run Luna, but some optional features may be disabled.');
    console.log();
    console.log('📝 Optional variables not set:');
    for (const check of checks) {
      if (!check.value && !check.required) {
        console.log(`   - ${check.name}: ${check.description}`);
      }
    }
  } else {
    console.log('❌ Some required environment variables are missing!');
    console.log();
    console.log('📝 Missing required variables:');
    for (const check of checks) {
      if (!check.value && check.required) {
        console.log(`   - ${check.name}: ${check.description}`);
      }
    }
    console.log();
    console.log('💡 Setup Instructions:');
    console.log('   See SETUP_GUIDE.md for detailed setup instructions');
    console.log();
    console.log('   Quick setup:');
    console.log('   1. Get GitHub Personal Access Token from:');
    console.log('      https://github.com/settings/tokens');
    console.log();
    console.log('   2. Set environment variables:');
    console.log('      export GITHUB_TOKEN="ghp_your_token_here"');
    console.log('      export GITHUB_REPOSITORY="owner/repo"');
    console.log();

    process.exit(1);
  }

  console.log();
  console.log('📚 Documentation:');
  console.log('   - SETUP_GUIDE.md: Environment setup instructions');
  console.log('   - MVP_VERIFICATION.md: MVP verification guide');
  console.log('   - README.md: Project overview');
  console.log();

  console.log('🚀 Next Steps:');
  console.log('   1. Create a test issue:');
  console.log('      npm run create-test-issue');
  console.log();
  console.log('   2. Run E2E test (dry-run):');
  console.log('      npm run test:e2e');
  console.log();
  console.log('   3. Run CoordinatorAgent on real issue (dry-run):');
  console.log('      npm run run-coordinator -- --issue <number> --dry-run');
  console.log();
  console.log('   4. Run CoordinatorAgent on real issue (actual execution):');
  console.log('      npm run run-coordinator -- --issue <number>');
  console.log();
}

checkEnv();
