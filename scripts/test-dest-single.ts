/**
 * Test DESTAgent on a single Issue
 * Usage: npx tsx scripts/test-dest-single.ts <issue-number>
 */

import { DESTAgent } from '../src/agents/dest-agent.js';
import { AgentConfig } from '../src/types/index.js';
import * as dotenv from 'dotenv';

dotenv.config();

async function main() {
  const issueNumber = parseInt(process.argv[2] || '36');

  const config: AgentConfig = {
    githubToken: process.env.GITHUB_TOKEN || '',
    repository: process.env.REPOSITORY || 'sawadari/luna',
    dryRun: false, // Allow file creation and comments
    verbose: true,
  };

  console.log(`\n🔍 Testing DESTAgent on Issue #${issueNumber}\n`);

  const destAgent = new DESTAgent(config);
  const result = await destAgent.execute(issueNumber);

  console.log('\n✅ DEST Judgment Result:');
  console.log(JSON.stringify(result, null, 2));

  if (result.data) {
    console.log(`\n📊 Judgment Summary:`);
    console.log(`   AL: ${result.data.al}`);
    console.log(`   Outcome OK: ${result.data.outcomeOk}`);
    console.log(`   Safety OK: ${result.data.safetyOk}`);
    console.log(`   Judgment ID: ${result.data.judgmentId}`);
    console.log(`\n📁 Result saved to: .ai/dest-judgment.json`);
  } else {
    console.log('\n⏭️ No DEST fields found in Issue - judgment skipped');
  }
}

main().catch(console.error);
