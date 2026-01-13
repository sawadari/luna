/**
 * ReviewAgent - Code Quality & Security Review
 */

import { Octokit } from '@octokit/rest';
import {
  GitHubIssue,
  AgentConfig,
  AgentResult,
  ReviewContext,
  CodeGenContext,
  CodeReview,
  ReviewIssue,
} from '../types';

export class ReviewAgent {
  private octokit: Octokit;
  private config: AgentConfig;

  constructor(config: AgentConfig) {
    this.config = config;
    this.octokit = new Octokit({ auth: config.githubToken });
  }

  private log(message: string): void {
    if (this.config.verbose) {
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] [ReviewAgent] ${message}`);
    }
  }

  /**
   * メイン実行
   */
  async execute(
    issueNumber: number,
    codeGenContext: CodeGenContext
  ): Promise<AgentResult<ReviewContext>> {
    const startTime = Date.now();
    this.log(`🔍 Code review starting for issue #${issueNumber}`);

    try {
      const [owner, repo] = this.config.repository.split('/');

      // 1. Issue取得
      const { data: issue } = await this.octokit.issues.get({
        owner,
        repo,
        issue_number: issueNumber,
      });

      this.log(`📋 Retrieved issue: ${issue.title}`);

      // 2. コードレビュー実行
      const reviews: CodeReview[] = [];
      for (const code of codeGenContext.generatedCode) {
        this.log(`🔍 Reviewing ${code.filename}...`);
        const review = await this.reviewFile(code);
        reviews.push(review);
      }

      // 3. セキュリティ問題抽出
      const securityIssues = this.extractSecurityIssues(reviews);
      this.log(`🔒 Found ${securityIssues.length} security issues`);

      // 4. 品質問題抽出
      const qualityIssues = this.extractQualityIssues(reviews);
      this.log(`📊 Found ${qualityIssues.length} quality issues`);

      // 5. 総合スコア計算
      const overallScore = this.calculateOverallScore(reviews);
      const passed = overallScore >= 80;
      this.log(
        `📈 Overall score: ${overallScore}/100 (${passed ? 'PASS' : 'FAIL'})`
      );

      // 6. 結果作成
      const context: ReviewContext = {
        issue,
        codeGenContext,
        reviews,
        overallScore,
        passed,
        securityIssues,
        qualityIssues,
        timestamp: new Date().toISOString(),
      };

      return {
        status: passed ? 'success' : 'blocked',
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
   * ファイルレビュー
   */
  private async reviewFile(code: {
    filename: string;
    content: string;
    language: string;
  }): Promise<CodeReview> {
    const issues: ReviewIssue[] = [];

    // 1. セキュリティチェック
    issues.push(...this.checkSecurity(code.content));

    // 2. 品質チェック
    issues.push(...this.checkQuality(code.content));

    // 3. スタイルチェック
    issues.push(...this.checkStyle(code.content));

    // 4. パフォーマンスチェック
    issues.push(...this.checkPerformance(code.content));

    // 5. スコア計算
    const score = this.calculateFileScore(issues);

    return {
      file: code.filename,
      issues,
      score,
    };
  }

  /**
   * セキュリティチェック
   */
  private checkSecurity(content: string): ReviewIssue[] {
    const issues: ReviewIssue[] = [];
    const lines = content.split('\n');

    lines.forEach((line, index) => {
      const lineNum = index + 1;

      // SQL Injection (detect string concatenation in queries)
      if (
        (line.match(/\bexec\s*\(/i) && line.includes('+')) ||
        (line.match(/\bquery\s*\(/i) && (line.includes('+') || line.includes('${')))
      ) {
        issues.push({
          line: lineNum,
          severity: 'error',
          category: 'security',
          message: 'Potential SQL injection vulnerability',
          suggestion: 'Use parameterized queries or prepared statements',
        });
      }

      // Command Injection
      if (line.match(/exec|spawn|system\([^`]/)) {
        issues.push({
          line: lineNum,
          severity: 'error',
          category: 'security',
          message: 'Potential command injection vulnerability',
          suggestion: 'Validate and sanitize all input before executing commands',
        });
      }

      // XSS
      if (line.includes('innerHTML') || line.includes('dangerouslySetInnerHTML')) {
        issues.push({
          line: lineNum,
          severity: 'warning',
          category: 'security',
          message: 'Potential XSS vulnerability',
          suggestion: 'Use textContent or properly sanitize HTML',
        });
      }

      // Hardcoded credentials
      if (
        line.match(/password\s*=\s*['"][^'"]+['"]/i) ||
        line.match(/api[_-]?key\s*=\s*['"][^'"]+['"]/i) ||
        line.match(/secret\s*=\s*['"][^'"]+['"]/i)
      ) {
        issues.push({
          line: lineNum,
          severity: 'error',
          category: 'security',
          message: 'Hardcoded credentials detected',
          suggestion: 'Use environment variables or secure configuration',
        });
      }

      // eval() usage
      if (line.includes('eval(')) {
        issues.push({
          line: lineNum,
          severity: 'error',
          category: 'security',
          message: 'Use of eval() is dangerous',
          suggestion: 'Avoid eval() and use safer alternatives',
        });
      }
    });

    return issues;
  }

  /**
   * 品質チェック
   */
  private checkQuality(content: string): ReviewIssue[] {
    const issues: ReviewIssue[] = [];
    const lines = content.split('\n');

    // 1. TODO/FIXME検出
    lines.forEach((line, index) => {
      if (line.includes('TODO:') || line.includes('FIXME:')) {
        issues.push({
          line: index + 1,
          severity: 'info',
          category: 'quality',
          message: 'Incomplete implementation',
          suggestion: 'Complete the implementation or create a follow-up task',
        });
      }
    });

    // 2. 複雑な関数検出
    const functionComplexity = this.analyzeComplexity(content);
    if (functionComplexity > 15) {
      issues.push({
        line: 1,
        severity: 'warning',
        category: 'quality',
        message: `High cyclomatic complexity: ${functionComplexity}`,
        suggestion: 'Consider breaking down into smaller functions',
      });
    }

    // 3. 長い関数検出
    const functionLengths = this.analyzeFunctionLengths(content);
    functionLengths.forEach(({ line, length }) => {
      if (length > 50) {
        issues.push({
          line,
          severity: 'warning',
          category: 'quality',
          message: `Function is too long: ${length} lines`,
          suggestion: 'Consider breaking down into smaller functions',
        });
      }
    });

    // 4. console.log検出 (プロダクションコード)
    lines.forEach((line, index) => {
      if (line.includes('console.log')) {
        issues.push({
          line: index + 1,
          severity: 'info',
          category: 'quality',
          message: 'console.log found in code',
          suggestion: 'Use proper logging library or remove before production',
        });
      }
    });

    // 5. エラーハンドリングチェック
    if (!content.includes('try') && !content.includes('catch')) {
      issues.push({
        line: 1,
        severity: 'warning',
        category: 'quality',
        message: 'No error handling detected',
        suggestion: 'Add try-catch blocks for error handling',
      });
    }

    return issues;
  }

  /**
   * スタイルチェック
   */
  private checkStyle(content: string): ReviewIssue[] {
    const issues: ReviewIssue[] = [];
    const lines = content.split('\n');

    lines.forEach((line, index) => {
      const lineNum = index + 1;

      // 長い行
      if (line.length > 100) {
        issues.push({
          line: lineNum,
          severity: 'info',
          category: 'style',
          message: `Line too long: ${line.length} characters`,
          suggestion: 'Break line into multiple lines',
        });
      }

      // var使用
      if (line.match(/\bvar\s+/)) {
        issues.push({
          line: lineNum,
          severity: 'warning',
          category: 'style',
          message: 'Use of "var" keyword',
          suggestion: 'Use "const" or "let" instead',
        });
      }

      // ==使用
      if (line.match(/[^=!]==[^=]/)) {
        issues.push({
          line: lineNum,
          severity: 'info',
          category: 'style',
          message: 'Use of loose equality (==)',
          suggestion: 'Use strict equality (===) instead',
        });
      }
    });

    return issues;
  }

  /**
   * パフォーマンスチェック
   */
  private checkPerformance(content: string): ReviewIssue[] {
    const issues: ReviewIssue[] = [];
    const lines = content.split('\n');

    lines.forEach((line, index) => {
      const lineNum = index + 1;

      // ループ内でのDOM操作
      if (
        line.includes('for') &&
        (line.includes('appendChild') || line.includes('innerHTML'))
      ) {
        issues.push({
          line: lineNum,
          severity: 'warning',
          category: 'performance',
          message: 'DOM manipulation inside loop',
          suggestion: 'Batch DOM operations outside the loop',
        });
      }

      // 同期的なファイルI/O
      if (line.includes('readFileSync') || line.includes('writeFileSync')) {
        issues.push({
          line: lineNum,
          severity: 'warning',
          category: 'performance',
          message: 'Synchronous file I/O',
          suggestion: 'Use async file operations instead',
        });
      }
    });

    return issues;
  }

  /**
   * 複雑度分析
   */
  private analyzeComplexity(content: string): number {
    let complexity = 1; // ベース複雑度

    // 制御フロー構文をカウント
    const ifCount = (content.match(/\bif\s*\(/g) || []).length;
    const forCount = (content.match(/\bfor\s*\(/g) || []).length;
    const whileCount = (content.match(/\bwhile\s*\(/g) || []).length;
    const caseCount = (content.match(/\bcase\s+/g) || []).length;
    const catchCount = (content.match(/\bcatch\s*\(/g) || []).length;
    const andCount = (content.match(/&&/g) || []).length;
    const orCount = (content.match(/\|\|/g) || []).length;

    complexity +=
      ifCount + forCount + whileCount + caseCount + catchCount + andCount + orCount;

    return complexity;
  }

  /**
   * 関数長分析
   */
  private analyzeFunctionLengths(
    content: string
  ): Array<{ line: number; length: number }> {
    const results: Array<{ line: number; length: number }> = [];
    const lines = content.split('\n');

    let inFunction = false;
    let functionStartLine = 0;
    let functionLength = 0;
    let braceCount = 0;

    lines.forEach((line, index) => {
      if (!inFunction && (line.match(/function\s+\w+\s*\(/) || line.match(/=>\s*{/))) {
        inFunction = true;
        functionStartLine = index + 1;
        functionLength = 1;
        braceCount = (line.match(/{/g) || []).length - (line.match(/}/g) || []).length;

        if (braceCount === 0) {
          results.push({ line: functionStartLine, length: functionLength });
          inFunction = false;
        }
      } else if (inFunction) {
        functionLength++;
        braceCount += (line.match(/{/g) || []).length;
        braceCount -= (line.match(/}/g) || []).length;

        if (braceCount === 0) {
          results.push({ line: functionStartLine, length: functionLength });
          inFunction = false;
        }
      }
    });

    return results;
  }

  /**
   * ファイルスコア計算
   */
  private calculateFileScore(issues: ReviewIssue[]): number {
    let score = 100;

    for (const issue of issues) {
      switch (issue.severity) {
        case 'error':
          score -= 10;
          break;
        case 'warning':
          score -= 5;
          break;
        case 'info':
          score -= 1;
          break;
      }
    }

    return Math.max(0, score);
  }

  /**
   * セキュリティ問題抽出
   */
  private extractSecurityIssues(reviews: CodeReview[]): ReviewIssue[] {
    const issues: ReviewIssue[] = [];

    for (const review of reviews) {
      for (const issue of review.issues) {
        if (issue.category === 'security') {
          issues.push(issue);
        }
      }
    }

    return issues;
  }

  /**
   * 品質問題抽出
   */
  private extractQualityIssues(reviews: CodeReview[]): ReviewIssue[] {
    const issues: ReviewIssue[] = [];

    for (const review of reviews) {
      for (const issue of review.issues) {
        if (issue.category === 'quality') {
          issues.push(issue);
        }
      }
    }

    return issues;
  }

  /**
   * 総合スコア計算
   */
  private calculateOverallScore(reviews: CodeReview[]): number {
    if (reviews.length === 0) {
      return 0;
    }

    const totalScore = reviews.reduce((sum, review) => sum + review.score, 0);
    return Math.round(totalScore / reviews.length);
  }
}
