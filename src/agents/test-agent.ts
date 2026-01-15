/**
 * TestAgent - Automated Testing & Coverage
 */

import { Octokit } from '@octokit/rest';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import {
  GitHubIssue,
  AgentConfig,
  AgentResult,
  TestContext,
  CodeGenContext,
  ReviewContext,
  TestResult,
  TestFailure,
  CoverageReport,
  CoverageMetric,
} from '../types';
import { KernelRegistryService } from '../ssot/kernel-registry';
import type { Verification } from '../types/nrvv';

export class TestAgent {
  private octokit: Octokit;
  private config: AgentConfig;
  private kernelRegistry: KernelRegistryService;

  constructor(config: AgentConfig) {
    this.config = config;
    this.octokit = new Octokit({ auth: config.githubToken });
    this.kernelRegistry = new KernelRegistryService();
  }

  private log(message: string): void {
    if (this.config.verbose) {
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] [TestAgent] ${message}`);
    }
  }

  /**
   * メイン実行
   */
  async execute(
    issueNumber: number,
    codeGenContext: CodeGenContext,
    reviewContext: ReviewContext
  ): Promise<AgentResult<TestContext>> {
    const startTime = Date.now();
    this.log(`🧪 Testing starting for issue #${issueNumber}`);

    try {
      const [owner, repo] = this.config.repository.split('/');

      // 1. Issue取得
      const { data: issueData } = await this.octokit.issues.get({
        owner,
        repo,
        issue_number: issueNumber,
      });

      const issue: GitHubIssue = {
        number: issueData.number,
        title: issueData.title,
        body: issueData.body || '',
        labels: issueData.labels.map((l) =>
          typeof l === 'string' ? { name: l, color: '' } : { name: l.name!, color: l.color! }
        ),
        state: issueData.state as 'open' | 'closed',
        created_at: issueData.created_at,
        updated_at: issueData.updated_at,
      };

      this.log(`📋 Retrieved issue: ${issue.title}`);

      // コードが生成されていない場合はスキップ
      if (codeGenContext.generatedCode.length === 0) {
        this.log(`ℹ️  No code to test (0 files generated)`);

        const context: TestContext = {
          issue,
          codeGenContext,
          reviewContext,
          testResults: [],
          coverage: this.createEmptyCoverage(),
          overallPassed: true,
          coverageMet: true,
          timestamp: new Date().toISOString(),
        };

        return {
          status: 'success',
          data: context,
          metrics: {
            durationMs: Date.now() - startTime,
            timestamp: new Date().toISOString(),
          },
        };
      }

      // 2. テスト実行
      const testResults = await this.runTests();
      this.log(`✅ Test execution complete`);

      // 3. カバレッジ測定
      const coverage = await this.measureCoverage();
      this.log(`📊 Coverage measurement complete`);

      // 4. 結果判定
      const overallPassed = this.checkTestsPassed(testResults);
      const coverageMet = this.checkCoverageMet(coverage);

      this.log(
        `📈 Tests: ${overallPassed ? 'PASS' : 'FAIL'}, Coverage: ${
          coverageMet ? 'MET' : 'NOT MET'
        }`
      );

      // 5. 結果作成
      const context: TestContext = {
        issue,
        codeGenContext,
        reviewContext,
        testResults,
        coverage,
        overallPassed,
        coverageMet,
        timestamp: new Date().toISOString(),
      };

      // 6. Verification記録 (dry-runモードではスキップ)
      if (!this.config.dryRun && overallPassed && coverageMet) {
        try {
          await this.recordVerification(issueNumber, context);
          this.log('✅ Verification recorded to kernels.yaml');
        } catch (error) {
          this.log(`⚠️  Failed to record verification: ${(error as Error).message}`);
        }
      }

      return {
        status: overallPassed && coverageMet ? 'success' : 'blocked',
        data: context,
        metrics: {
          durationMs: Date.now() - startTime,
          timestamp: new Date().toISOString(),
        },
      };
    } catch (error) {
      this.log(`❌ Error: ${(error as Error).message}`);
      return {
        status: 'error',
        error: error as Error,
        metrics: {
          durationMs: Date.now() - startTime,
          timestamp: new Date().toISOString(),
        },
      };
    }
  }

  /**
   * テスト実行
   */
  private async runTests(): Promise<TestResult[]> {
    this.log('🧪 Running tests...');

    try {
      // Vitestでテスト実行
      const output = execSync('npm test -- --run --reporter=json', {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      return this.parseTestOutput(output);
    } catch (error: any) {
      // テスト失敗時もoutputを解析
      if (error.stdout) {
        return this.parseTestOutput(error.stdout);
      }
      throw error;
    }
  }

  /**
   * テスト出力解析
   */
  private parseTestOutput(output: string): TestResult[] {
    const results: TestResult[] = [];

    try {
      // JSON形式の出力を解析
      const jsonMatch = output.match(/\{[\s\S]*"testResults"[\s\S]*\}/);
      if (jsonMatch) {
        const data = JSON.parse(jsonMatch[0]);

        for (const testFile of data.testResults || []) {
          const failures: TestFailure[] = [];

          for (const test of testFile.assertionResults || []) {
            if (test.status === 'failed') {
              failures.push({
                testName: test.title,
                message: test.failureMessages?.[0] || 'Test failed',
                stack: test.failureMessages?.[1],
              });
            }
          }

          results.push({
            file: testFile.name || 'unknown',
            passed: testFile.numPassingTests || 0,
            failed: testFile.numFailingTests || 0,
            skipped: testFile.numPendingTests || 0,
            duration: testFile.perfStats?.runtime || 0,
            failures,
          });
        }
      }
    } catch (parseError) {
      this.log(`⚠️  Failed to parse test output: ${(parseError as Error).message}`);
    }

    // フォールバック: シンプルな解析
    if (results.length === 0) {
      results.push(this.parseSimpleTestOutput(output));
    }

    return results;
  }

  /**
   * シンプルなテスト出力解析
   */
  private parseSimpleTestOutput(output: string): TestResult {
    let passed = 0;
    let failed = 0;
    let skipped = 0;

    // "Tests" 行を探す
    const lines = output.split('\n');
    const testsLine = lines.find((line) => line.trim().startsWith('Tests'));

    if (testsLine) {
      // "X passed" パターン (Tests行から)
      const passedMatch = testsLine.match(/(\d+)\s+passed/);
      if (passedMatch) {
        passed = parseInt(passedMatch[1], 10);
      }

      // "X failed" パターン (Tests行から)
      const failedMatch = testsLine.match(/(\d+)\s+failed/);
      if (failedMatch) {
        failed = parseInt(failedMatch[1], 10);
      }

      // "X skipped" パターン (Tests行から)
      const skippedMatch = testsLine.match(/(\d+)\s+skipped/);
      if (skippedMatch) {
        skipped = parseInt(skippedMatch[1], 10);
      }
    }

    return {
      file: 'all',
      passed,
      failed,
      skipped,
      duration: 0,
      failures: [],
    };
  }

  /**
   * カバレッジ測定
   */
  private async measureCoverage(): Promise<CoverageReport> {
    this.log('📊 Measuring coverage...');

    try {
      // Vitestでカバレッジ測定
      const output = execSync('npm run test:coverage -- --run', {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      return this.parseCoverageOutput(output);
    } catch (error: any) {
      // カバレッジ測定失敗時もoutputを解析
      if (error.stdout) {
        return this.parseCoverageOutput(error.stdout);
      }

      // デフォルト値を返す
      return this.createEmptyCoverage();
    }
  }

  /**
   * カバレッジ出力解析
   */
  private parseCoverageOutput(output: string): CoverageReport {
    // "All files | X | Y | Z | W |" パターンを探す
    const allFilesMatch = output.match(
      /All files\s+\|\s+([\d.]+)\s+\|\s+([\d.]+)\s+\|\s+([\d.]+)\s+\|\s+([\d.]+)\s+\|/
    );

    if (allFilesMatch) {
      const [, stmts, branches, funcs, lines] = allFilesMatch;
      return {
        statements: this.createCoverageMetric(parseFloat(stmts)),
        branches: this.createCoverageMetric(parseFloat(branches)),
        functions: this.createCoverageMetric(parseFloat(funcs)),
        lines: this.createCoverageMetric(parseFloat(lines)),
      };
    }

    // coverage-summary.jsonを読み込む
    try {
      const coveragePath = path.join(process.cwd(), 'coverage', 'coverage-summary.json');
      if (fs.existsSync(coveragePath)) {
        const coverageData = JSON.parse(fs.readFileSync(coveragePath, 'utf-8'));
        const total = coverageData.total;

        return {
          statements: {
            total: total.statements.total,
            covered: total.statements.covered,
            percentage: total.statements.pct,
          },
          branches: {
            total: total.branches.total,
            covered: total.branches.covered,
            percentage: total.branches.pct,
          },
          functions: {
            total: total.functions.total,
            covered: total.functions.covered,
            percentage: total.functions.pct,
          },
          lines: {
            total: total.lines.total,
            covered: total.lines.covered,
            percentage: total.lines.pct,
          },
        };
      }
    } catch (fileError) {
      this.log(`⚠️  Failed to read coverage file: ${(fileError as Error).message}`);
    }

    return this.createEmptyCoverage();
  }

  /**
   * カバレッジメトリクス作成
   */
  private createCoverageMetric(percentage: number): CoverageMetric {
    const total = 100;
    const covered = Math.round((percentage / 100) * total);
    return {
      total,
      covered,
      percentage,
    };
  }

  /**
   * 空のカバレッジレポート作成
   */
  private createEmptyCoverage(): CoverageReport {
    return {
      statements: { total: 0, covered: 0, percentage: 0 },
      branches: { total: 0, covered: 0, percentage: 0 },
      functions: { total: 0, covered: 0, percentage: 0 },
      lines: { total: 0, covered: 0, percentage: 0 },
    };
  }

  /**
   * テスト通過判定
   */
  private checkTestsPassed(testResults: TestResult[]): boolean {
    for (const result of testResults) {
      if (result.failed > 0) {
        return false;
      }
    }
    return true;
  }

  /**
   * カバレッジ達成判定 (80%以上)
   */
  private checkCoverageMet(coverage: CoverageReport): boolean {
    const targetCoverage = 80;

    return (
      coverage.statements.percentage >= targetCoverage &&
      coverage.branches.percentage >= targetCoverage &&
      coverage.functions.percentage >= targetCoverage &&
      coverage.lines.percentage >= targetCoverage
    );
  }

  /**
   * テスト結果サマリー取得
   */
  getSummary(context: TestContext): string {
    const totalPassed = context.testResults.reduce((sum, r) => sum + r.passed, 0);
    const totalFailed = context.testResults.reduce((sum, r) => sum + r.failed, 0);
    const totalSkipped = context.testResults.reduce((sum, r) => sum + r.skipped, 0);

    const summary = [
      '## Test Results',
      `- Passed: ${totalPassed}`,
      `- Failed: ${totalFailed}`,
      `- Skipped: ${totalSkipped}`,
      '',
      '## Coverage',
      `- Statements: ${context.coverage.statements.percentage.toFixed(2)}%`,
      `- Branches: ${context.coverage.branches.percentage.toFixed(2)}%`,
      `- Functions: ${context.coverage.functions.percentage.toFixed(2)}%`,
      `- Lines: ${context.coverage.lines.percentage.toFixed(2)}%`,
      '',
      `## Status`,
      `- Tests: ${context.overallPassed ? '✅ PASSED' : '❌ FAILED'}`,
      `- Coverage: ${context.coverageMet ? '✅ MET (≥80%)' : '❌ NOT MET (<80%)'}`,
    ];

    // 失敗したテストの詳細
    if (totalFailed > 0) {
      summary.push('', '## Failed Tests');
      for (const result of context.testResults) {
        for (const failure of result.failures) {
          summary.push(`- ${result.file}: ${failure.testName}`);
          summary.push(`  ${failure.message}`);
        }
      }
    }

    return summary.join('\n');
  }

  /**
   * Verification記録
   */
  private async recordVerification(
    issueNumber: number,
    context: TestContext
  ): Promise<void> {
    this.log('📝 Recording Verification to Kernel Registry...');

    // kernels.yaml内のIssueに対応するKernelを検索
    const kernels = await this.kernelRegistry.searchKernels({
      tag: `issue-${issueNumber}`,
    });

    if (kernels.length === 0) {
      this.log(`⚠️  No kernel found for issue #${issueNumber}, skipping verification recording`);
      return;
    }

    const kernel = kernels[0]; // 最初のKernelを使用

    // Verification ID生成
    const verificationId = this.generateVerificationId(kernel.id);

    // テスト結果からカバレッジを集計
    const totalPassed = context.testResults.reduce((sum, r) => sum + r.passed, 0);
    const coveragePercent = context.coverage.statements.percentage.toFixed(2);

    // Verification作成
    const verification: Verification = {
      id: verificationId,
      statement: 'テストが正常に実行され、カバレッジ目標を達成することを確認',
      method: 'test',
      testCase: 'automated-tests',
      criteria: [
        `全テスト通過: ${totalPassed}件`,
        `カバレッジ${coveragePercent}%達成 (≥80%)`,
      ],
      traceability: {
        upstream: kernel.requirements.map((r) => r.id),
        downstream: [],
      },
      status: context.overallPassed && context.coverageMet ? 'passed' : 'failed',
      verifiedAt: new Date().toISOString(),
      verifiedBy: 'TestAgent',
      evidence: [
        {
          type: 'test_result',
          path: 'test-results.json',
          createdAt: new Date().toISOString(),
        },
      ],
      notes: `Issue #${issueNumber}: ${context.issue.title}`,
    };

    // Kernel Registryに記録
    await this.kernelRegistry.addVerificationToKernel(kernel.id, verification);

    this.log(`✅ Verification ${verificationId} recorded for Kernel ${kernel.id}`);
  }

  /**
   * Verification ID生成
   */
  private generateVerificationId(kernelId: string): string {
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 1000)
      .toString()
      .padStart(3, '0');
    return `VER-${kernelId}-${timestamp}-${random}`;
  }
}
