#!/usr/bin/env tsx
/**
 * Update DEST fields in GitHub Issues to add explicit outcome_ok and safety_ok declarations
 */
import { execSync } from 'child_process';
import * as fs from 'fs';

const ISSUES = [33, 34, 35, 36];

function getIssueBody(issueNumber: number): string {
  const result = execSync(`gh issue view ${issueNumber} --json body -q .body`, {
    encoding: 'utf-8',
  });
  return result.trim();
}

function updateIssueBody(issueNumber: number, newBody: string): boolean {
  try {
    // Write to temp file
    const tempFile = `issue-${issueNumber}-temp.txt`;
    fs.writeFileSync(tempFile, newBody, 'utf-8');

    // Update via gh
    execSync(`gh issue edit ${issueNumber} --body-file ${tempFile}`, {
      encoding: 'utf-8',
    });

    // Cleanup
    fs.unlinkSync(tempFile);
    return true;
  } catch (error) {
    console.error(`Failed to update issue ${issueNumber}:`, error);
    return false;
  }
}

function addExplicitDeclarations(body: string): string {
  let updated = body;

  // Add outcome_ok after "Progress: better"
  if (body.includes('**Progress**: better') && !body.includes('outcome_ok: true')) {
    updated = updated.replace(
      /\*\*Progress\*\*: better \(adding requested feature\)/,
      '**Progress**: better (adding requested feature)\n\n✅ **outcome_ok: true**'
    );
  }

  // Add safety_ok after "Violations: None"
  if (body.includes('**Violations**: None') && !body.includes('safety_ok: true')) {
    updated = updated.replace(
      /\*\*Violations\*\*: None identified \(please review\)/,
      '**Violations**: None identified (please review)\n\n✅ **safety_ok: true**'
    );
  }

  return updated;
}

async function main() {
  for (const issueNum of ISSUES) {
    console.log(`Updating Issue #${issueNum}...`);
    try {
      // Get current body
      const body = getIssueBody(issueNum);

      // Check if already updated
      if (body.includes('outcome_ok: true') && body.includes('safety_ok: true')) {
        console.log(`  Issue #${issueNum} already has explicit declarations. Skipping.`);
        continue;
      }

      // Add explicit declarations
      const newBody = addExplicitDeclarations(body);

      // Check if any changes
      if (newBody === body) {
        console.log(`  No changes needed for Issue #${issueNum}`);
        continue;
      }

      // Update on GitHub
      if (updateIssueBody(issueNum, newBody)) {
        console.log(`  ✅ Issue #${issueNum} updated successfully`);
      }
    } catch (error) {
      console.error(`  ❌ Error updating Issue #${issueNum}:`, error);
    }
  }

  console.log('\nDone!');
}

main();
