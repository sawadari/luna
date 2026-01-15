/**
 * Add DEST fields to existing Issues
 *
 * This script adds Outcome Assessment and Safety Assessment sections
 * to all open issues that don't have them yet.
 *
 * Usage:
 *   npx tsx scripts/add-dest-fields-to-issues.ts [--dry-run]
 */

import { Octokit } from '@octokit/rest';
import * as dotenv from 'dotenv';

dotenv.config();

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
const [owner, repo] = (process.env.REPOSITORY || 'sawadari/luna').split('/');
const dryRun = process.argv.includes('--dry-run');

const DEST_TEMPLATE = `

---

## 🎯 DEST Judgment (Auto-added)

### Outcome Assessment

**Current State**: (Please describe the current situation)
**Target State**: (Please describe the desired outcome)
**Progress**: better/same/worse (Please choose one)

### Safety Assessment

**Feedback Loops**: present/absent/harmful (Please choose one)
**Safety Constraints**: (Please list any safety requirements)
**Violations**: (Please list any potential violations or risks)

---

*DEST fields were automatically added to enable Luna's Self-Improvement Loop.*
*Please fill out these fields to enable DEST judgment.*
`;

function hasDestFields(body: string): boolean {
  return (
    body.includes('## Outcome Assessment') ||
    body.includes('### Outcome Assessment') ||
    body.includes('Outcome Assessment') &&
    (body.includes('## Safety Assessment') ||
     body.includes('### Safety Assessment') ||
     body.includes('Safety Assessment'))
  );
}

function inferProgressFromLabels(labels: string[]): string {
  if (labels.some(l => l.includes('bug') || l.includes('fix'))) {
    return 'better (fixing a bug improves the system)';
  }
  if (labels.some(l => l.includes('feature') || l.includes('enhancement'))) {
    return 'better (adding requested feature)';
  }
  if (labels.some(l => l.includes('refactor'))) {
    return 'same (refactoring maintains functionality)';
  }
  return 'better (improvement)';
}

function inferFeedbackLoops(labels: string[]): string {
  if (labels.some(l => l.includes('bug'))) {
    return 'absent (bug prevents proper feedback)';
  }
  return 'present (users can provide feedback)';
}

function generateDestFields(issue: any): string {
  const labels = issue.labels.map((l: any) => typeof l === 'string' ? l : l.name);
  const progress = inferProgressFromLabels(labels);
  const feedbackLoops = inferFeedbackLoops(labels);

  return `

---

## 🎯 DEST Judgment (Auto-added)

### Outcome Assessment

**Current State**: ${issue.title} (current state)
**Target State**: ${issue.title} (resolved/implemented)
**Progress**: ${progress}

### Safety Assessment

**Feedback Loops**: ${feedbackLoops}
**Safety Constraints**:
- Must maintain system stability
- Must not introduce breaking changes
- Must include appropriate tests

**Violations**: None identified (please review)

---

*DEST fields were automatically added to enable Luna's Self-Improvement Loop.*
*Please review and update these fields as needed.*
`;
}

async function main() {
  console.log(`\n🔍 Scanning issues in ${owner}/${repo}...\n`);

  if (dryRun) {
    console.log('🔒 DRY RUN MODE - No changes will be made\n');
  }

  // Fetch all open issues
  const { data: issues } = await octokit.issues.listForRepo({
    owner,
    repo,
    state: 'open',
    per_page: 100,
  });

  console.log(`Found ${issues.length} open issues\n`);

  let updatedCount = 0;
  let skippedCount = 0;

  for (const issue of issues) {
    // Skip pull requests
    if (issue.pull_request) {
      continue;
    }

    const body = issue.body || '';

    if (hasDestFields(body)) {
      console.log(`⏭️  Issue #${issue.number}: Already has DEST fields`);
      skippedCount++;
      continue;
    }

    console.log(`✏️  Issue #${issue.number}: ${issue.title}`);
    console.log(`    Adding DEST fields...`);

    const newBody = body + generateDestFields(issue);

    if (!dryRun) {
      await octokit.issues.update({
        owner,
        repo,
        issue_number: issue.number,
        body: newBody,
      });
      console.log(`    ✅ Updated`);
    } else {
      console.log(`    [DRY RUN] Would update`);
    }

    updatedCount++;

    // Rate limiting: wait 1 second between updates
    if (!dryRun) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  console.log(`\n📊 Summary:`);
  console.log(`   Updated: ${updatedCount}`);
  console.log(`   Skipped: ${skippedCount}`);
  console.log(`   Total: ${issues.length - (issues.filter(i => i.pull_request).length)}`);

  if (dryRun) {
    console.log(`\n💡 Run without --dry-run to apply changes`);
  }
}

main().catch(error => {
  console.error('❌ Error:', error.message);
  process.exit(1);
});
