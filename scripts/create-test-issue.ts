#!/usr/bin/env tsx
/**
 * Create Test Issue on GitHub
 *
 * Purpose: Create a real GitHub Issue to test the full pipeline
 */

import '../src/config/env.js'; // Initialize dotenv to load .env file
import { Octokit } from '@octokit/rest';

async function main() {
  console.log('='.repeat(80));
  console.log('📝 Create Test Issue on GitHub');
  console.log('='.repeat(80));
  console.log();

  const githubToken = process.env.GITHUB_TOKEN;
  const repository = process.env.GITHUB_REPOSITORY;

  if (!githubToken) {
    console.error('❌ Error: GITHUB_TOKEN environment variable not set');
    console.log('   Please set GITHUB_TOKEN with your GitHub Personal Access Token');
    process.exit(1);
  }

  if (!repository) {
    console.error('❌ Error: GITHUB_REPOSITORY environment variable not set');
    console.log('   Please set GITHUB_REPOSITORY in format: owner/repo');
    process.exit(1);
  }

  const [owner, repo] = repository.split('/');
  const octokit = new Octokit({ auth: githubToken });

  console.log(`📂 Repository: ${owner}/${repo}`);
  console.log();

  // Create test issue
  const issueTitle = '[TEST] Implement user profile feature';
  const issueBody = `## Description
This is a test issue to verify the Luna autonomous development pipeline.

## Requirements
- Create a user profile page component
- Display user name and email
- Add profile edit functionality
- Include avatar upload

## Acceptance Criteria
- ✅ User can view their profile
- ✅ User can edit their profile information
- ✅ Changes are saved to the backend
- ✅ Tests pass with 80%+ coverage

---
*This is an automated test issue created by Luna test suite*`;

  try {
    console.log('📝 Creating test issue...');
    const { data: issue } = await octokit.issues.create({
      owner,
      repo,
      title: issueTitle,
      body: issueBody,
      labels: ['type:feature', 'complexity:medium', 'priority:P2-Medium', 'test'],
    });

    console.log();
    console.log('✅ Test issue created successfully!');
    console.log('-'.repeat(80));
    console.log(`📋 Issue #${issue.number}: ${issue.title}`);
    console.log(`🔗 URL: ${issue.html_url}`);
    console.log();

    console.log('🎯 Next steps:');
    console.log('   1. Run CoordinatorAgent against this issue:');
    console.log(`      npm run agents:coordinator -- --issue ${issue.number}`);
    console.log();
    console.log('   2. Or test with actual execution (non-dry-run):');
    console.log(`      GITHUB_REPOSITORY=${repository} tsx -e "import {CoordinatorAgent} from './src/agents/coordinator-agent'; const agent = new CoordinatorAgent({githubToken: process.env.GITHUB_TOKEN!, anthropicApiKey: process.env.ANTHROPIC_API_KEY, repository: '${repository}', dryRun: false, verbose: true}); agent.execute(${issue.number}).then(console.log)"`);
    console.log();

    console.log('✨ Test issue is ready for pipeline testing!');
    console.log();

    return issue.number;
  } catch (error: any) {
    console.error('❌ Failed to create test issue:', error.message);
    if (error.response) {
      console.error('   Response:', error.response.data);
    }
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('❌ Script failed:', error);
  process.exit(1);
});
