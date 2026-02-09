/**
 * CodeGenAgent - AI-Driven Code Generation with Kernel Integration
 */

import { Octokit } from '@octokit/rest';
import Anthropic from '@anthropic-ai/sdk';
import {
  GitHubIssue,
  AgentConfig,
  AgentResult,
  CodeGenContext,
  GeneratedCode,
  CodeQualityMetrics,
} from '../types';
import { KernelWithNRVV } from '../types/nrvv';
import { KernelRegistryService } from '../ssot/kernel-registry';
import { KernelRuntime } from '../ssot/kernel-runtime';
import { LinkEvidenceOperation } from '../types/kernel-operations';
import { getRulesConfig, ensureRulesConfigLoaded, RulesConfigService } from '../services/rules-config-service';

export class CodeGenAgent {
  private octokit: Octokit;
  private config: AgentConfig;
  private anthropic?: Anthropic;
  private kernelRegistry: KernelRegistryService;
  private kernelRuntime: KernelRuntime;
  private rulesConfig: RulesConfigService;

  constructor(config: AgentConfig, kernelRegistryPath?: string) {
    this.config = config;
    this.octokit = new Octokit({ auth: config.githubToken });
    this.kernelRegistry = new KernelRegistryService(kernelRegistryPath);
    this.rulesConfig = getRulesConfig();

    // Initialize KernelRuntime (Issue #43: Phase A1 compliance)
    this.kernelRuntime = new KernelRuntime({
      registryPath: kernelRegistryPath,
      enableLedger: true,
      soloMode: true,
      defaultActor: 'CodeGenAgent',
      dryRun: config.dryRun,
      verbose: config.verbose,
    });

    // Issue #48: Inject KernelRuntime into KernelRegistry for Ledger-integrated operations
    this.kernelRegistry.setRuntime(this.kernelRuntime);

    if (config.anthropicApiKey) {
      this.anthropic = new Anthropic({ apiKey: config.anthropicApiKey });
    }
  }

  private log(message: string): void {
    if (this.config.verbose) {
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] [CodeGenAgent] ${message}`);
    }
  }

  /**
   * メイン実行
   */
  async execute(issueNumber: number): Promise<AgentResult<CodeGenContext>> {
    const startTime = Date.now();
    this.log(`🤖 Code generation starting for issue #${issueNumber}`);

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

      // 2. Ensure Rules Configuration is loaded
      await ensureRulesConfigLoaded();

      // 3. Load Kernel Registry
      await this.kernelRegistry.load();
      this.log('📚 Kernel Registry loaded');

      // 3. Find related Kernels
      const relatedKernels = await this.findRelatedKernels(issue);
      this.log(`🔍 Found ${relatedKernels.length} related Kernels`);

      // 4. Issue分析 (with Kernel context)
      const analysis = await this.analyzeIssueWithKernels(issue, relatedKernels);
      this.log(`📊 Issue analysis complete: ${analysis.type}`);

      // 5. コード生成 (with Kernel Requirements)
      const generatedCode = await this.generateCodeWithKernels(issue, analysis, relatedKernels);
      this.log(`✅ Generated ${generatedCode.length} code files`);

      // 6. 品質メトリクス計算
      const metrics = this.calculateMetrics(generatedCode);
      this.log(`📈 Quality metrics: ${metrics.overallScore}/100`);

      // 6.5. 品質閾値チェック (from rules-config.yaml)
      const qualityThreshold = this.rulesConfig.get<number>(
        'human_ai_boundary.code_generation.quality_threshold'
      ) ?? 80;

      if (metrics.overallScore < qualityThreshold) {
        this.log(`⚠️  Quality score ${metrics.overallScore} below threshold ${qualityThreshold}`);
        // Note: We still return the context but mark it as below threshold
        // The ReviewAgent will handle the final decision
      }

      // 7. Kernel更新 (Generated code artifacts)
      await this.updateKernelsWithGeneratedCode(relatedKernels, generatedCode, issue);
      this.log(`💾 Updated ${relatedKernels.length} Kernels with generated code artifacts`);

      // 8. 結果作成
      const context: CodeGenContext = {
        issue,
        analysis,
        generatedCode,
        metrics,
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
   * Issue分析
   */
  private analyzeIssue(issue: GitHubIssue): {
    type: 'feature' | 'bug' | 'refactor' | 'test' | 'docs';
    complexity: 'small' | 'medium' | 'large' | 'xlarge';
    language: string;
    framework?: string;
    requiresTests: boolean;
  } {
    const body = issue.body || '';
    const title = issue.title.toLowerCase();
    const labels = issue.labels.map((l: any) => l.name.toLowerCase());

    // タイプ判定
    let type: 'feature' | 'bug' | 'refactor' | 'test' | 'docs' = 'feature';
    if (labels.includes('bug') || title.includes('fix')) {
      type = 'bug';
    } else if (labels.includes('refactor') || title.includes('refactor')) {
      type = 'refactor';
    } else if (labels.includes('test') || title.includes('test')) {
      type = 'test';
    } else if (labels.includes('docs') || title.includes('docs')) {
      type = 'docs';
    }

    // 複雑度判定
    let complexity: 'small' | 'medium' | 'large' | 'xlarge' = 'medium';
    if (labels.includes('small')) {
      complexity = 'small';
    } else if (labels.includes('large')) {
      complexity = 'large';
    } else if (labels.includes('xlarge')) {
      complexity = 'xlarge';
    }

    // 言語/フレームワーク検出
    const language = this.detectLanguage(body, labels);
    const framework = this.detectFramework(body, labels);

    // テスト必要性判定
    const requiresTests = type !== 'docs' && type !== 'test';

    return {
      type,
      complexity,
      language,
      framework,
      requiresTests,
    };
  }

  /**
   * 言語検出
   */
  private detectLanguage(body: string, labels: string[]): string {
    if (labels.includes('typescript') || body.includes('TypeScript')) {
      return 'typescript';
    }
    if (labels.includes('javascript') || body.includes('JavaScript')) {
      return 'javascript';
    }
    if (labels.includes('python') || body.includes('Python')) {
      return 'python';
    }
    if (labels.includes('rust') || body.includes('Rust')) {
      return 'rust';
    }
    if (labels.includes('go') || body.includes('Go')) {
      return 'go';
    }
    return 'typescript'; // デフォルト
  }

  /**
   * フレームワーク検出
   */
  private detectFramework(body: string, labels: string[]): string | undefined {
    if (labels.includes('react') || body.includes('React')) {
      return 'react';
    }
    if (labels.includes('vue') || body.includes('Vue')) {
      return 'vue';
    }
    if (labels.includes('express') || body.includes('Express')) {
      return 'express';
    }
    if (labels.includes('fastapi') || body.includes('FastAPI')) {
      return 'fastapi';
    }
    return undefined;
  }

  /**
   * コード生成
   */
  private async generateCode(
    issue: GitHubIssue,
    analysis: any
  ): Promise<GeneratedCode[]> {
    if (!this.anthropic) {
      this.log('⚠️  No Anthropic API key, using template-based generation');
      return this.generateCodeTemplate(issue, analysis);
    }

    this.log('🤖 Generating code with Claude Sonnet 4...');

    const prompt = this.buildPrompt(issue, analysis);

    try {
      const response = await this.anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      });

      const content = response.content[0];
      if (content.type === 'text') {
        return this.parseGeneratedCode(content.text);
      }

      return this.generateCodeTemplate(issue, analysis);
    } catch (error) {
      this.log(`⚠️  Claude API error: ${(error as Error).message}`);
      return this.generateCodeTemplate(issue, analysis);
    }
  }

  /**
   * プロンプト構築
   */
  private buildPrompt(issue: GitHubIssue, analysis: any): string {
    return `# Code Generation Request

## Issue
**Title**: ${issue.title}
**Type**: ${analysis.type}
**Complexity**: ${analysis.complexity}
**Language**: ${analysis.language}
${analysis.framework ? `**Framework**: ${analysis.framework}` : ''}

## Description
${issue.body || 'No description provided'}

## Requirements
- Generate high-quality ${analysis.language} code
- Follow TypeScript strict mode if applicable
- Include proper error handling
- Add JSDoc comments
${analysis.requiresTests ? '- Include unit tests' : ''}

## Output Format
Please provide the generated code in the following format:
\`\`\`
FILE: <filename>
<code>
\`\`\`

Generate all necessary files to implement this feature.`;
  }

  /**
   * 生成コード解析
   */
  private parseGeneratedCode(text: string): GeneratedCode[] {
    const files: GeneratedCode[] = [];
    const filePattern = /FILE:\s*(.+?)\n```(?:\w+)?\n([\s\S]*?)```/g;

    let match;
    while ((match = filePattern.exec(text)) !== null) {
      const [, filename, content] = match;
      files.push({
        filename: filename.trim(),
        content: content.trim(),
        language: this.detectLanguageFromFilename(filename),
        size: content.length,
      });
    }

    return files;
  }

  /**
   * ファイル名から言語検出
   */
  private detectLanguageFromFilename(filename: string): string {
    if (filename.endsWith('.ts')) return 'typescript';
    if (filename.endsWith('.tsx')) return 'typescript';
    if (filename.endsWith('.js')) return 'javascript';
    if (filename.endsWith('.jsx')) return 'javascript';
    if (filename.endsWith('.py')) return 'python';
    if (filename.endsWith('.rs')) return 'rust';
    if (filename.endsWith('.go')) return 'go';
    return 'text';
  }

  /**
   * テンプレートベースコード生成
   */
  private generateCodeTemplate(
    issue: GitHubIssue,
    analysis: any
  ): GeneratedCode[] {
    const files: GeneratedCode[] = [];

    // メインファイル生成
    const mainFile = this.generateMainFile(issue, analysis);
    files.push(mainFile);

    // テストファイル生成
    if (analysis.requiresTests) {
      const testFile = this.generateTestFile(issue, analysis, mainFile);
      files.push(testFile);
    }

    return files;
  }

  /**
   * メインファイル生成
   */
  private generateMainFile(issue: GitHubIssue, analysis: any): GeneratedCode {
    const ext = analysis.language === 'typescript' ? 'ts' : 'js';
    const filename = this.generateFilename(issue.title, ext);

    const content = `/**
 * ${issue.title}
 * Generated by CodeGenAgent
 */

export class ${this.toClassName(issue.title)} {
  constructor() {
    // TODO: Implement constructor
  }

  async execute(): Promise<void> {
    // TODO: Implement ${issue.title}
    throw new Error('Not implemented');
  }
}
`;

    return {
      filename,
      content,
      language: analysis.language,
      size: content.length,
    };
  }

  /**
   * テストファイル生成
   */
  private generateTestFile(
    issue: GitHubIssue,
    analysis: any,
    mainFile: GeneratedCode
  ): GeneratedCode {
    const testFilename = mainFile.filename.replace(/\.(ts|js)$/, '.test.$1');
    const className = this.toClassName(issue.title);

    const content = `/**
 * ${issue.title} - Tests
 * Generated by CodeGenAgent
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ${className} } from './${mainFile.filename.replace(/\.(ts|js)$/, '')}';

describe('${className}', () => {
  let instance: ${className};

  beforeEach(() => {
    instance = new ${className}();
  });

  it('should be defined', () => {
    expect(instance).toBeDefined();
  });

  it('should execute successfully', async () => {
    await expect(instance.execute()).rejects.toThrow('Not implemented');
  });

  // TODO: Add more test cases
});
`;

    return {
      filename: testFilename,
      content,
      language: analysis.language,
      size: content.length,
    };
  }

  /**
   * ファイル名生成
   */
  private generateFilename(title: string, ext: string): string {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .slice(0, 50) +
      '.' + ext;
  }

  /**
   * クラス名生成
   */
  private toClassName(title: string): string {
    return title
      .replace(/[^a-zA-Z0-9\s]/g, '')
      .split(/\s+/)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join('');
  }

  /**
   * 品質メトリクス計算
   */
  private calculateMetrics(generatedCode: GeneratedCode[]): CodeQualityMetrics {
    let totalLines = 0;
    let totalSize = 0;
    let hasTests = false;
    let hasComments = false;

    for (const file of generatedCode) {
      totalLines += file.content.split('\n').length;
      totalSize += file.size;

      if (file.filename.includes('.test.')) {
        hasTests = true;
      }

      if (file.content.includes('/**') || file.content.includes('//')) {
        hasComments = true;
      }
    }

    const avgComplexity = this.calculateComplexity(generatedCode);

    // スコア計算 (100点満点)
    let score = 60; // ベーススコア

    if (hasTests) score += 15;
    if (hasComments) score += 10;
    if (avgComplexity < 10) score += 10;
    if (totalLines > 0 && totalLines < 500) score += 5;

    return {
      overallScore: Math.min(100, score),
      linesOfCode: totalLines,
      fileCount: generatedCode.length,
      hasTests,
      hasDocumentation: hasComments,
      complexity: avgComplexity,
      maintainability: score > 80 ? 'high' : score > 60 ? 'medium' : 'low',
    };
  }

  /**
   * 複雑度計算 (簡易版)
   */
  private calculateComplexity(generatedCode: GeneratedCode[]): number {
    let totalComplexity = 0;

    for (const file of generatedCode) {
      // 制御フロー構文をカウント
      const ifCount = (file.content.match(/\bif\s*\(/g) || []).length;
      const forCount = (file.content.match(/\bfor\s*\(/g) || []).length;
      const whileCount = (file.content.match(/\bwhile\s*\(/g) || []).length;
      const switchCount = (file.content.match(/\bswitch\s*\(/g) || []).length;

      totalComplexity += ifCount + forCount + whileCount + switchCount * 2;
    }

    return generatedCode.length > 0
      ? Math.round(totalComplexity / generatedCode.length)
      : 0;
  }

  // ========================================================================
  // Kernel Integration Methods
  // ========================================================================

  /**
   * Find related Kernels from Issue
   */
  private async findRelatedKernels(issue: GitHubIssue): Promise<KernelWithNRVV[]> {
    // 1. Extract Kernel references from Issue body (e.g., KRN-001)
    const kernelRefs = this.extractKernelReferences(issue.body || '');
    const kernels: KernelWithNRVV[] = [];

    for (const kernelId of kernelRefs) {
      const kernel = await this.kernelRegistry.getKernel(kernelId);
      if (kernel) {
        kernels.push(kernel);
      }
    }

    // 2. Search by tags (e.g., security, authentication)
    const tags = this.extractTagsFromIssue(issue);
    if (tags.length > 0 && kernels.length === 0) {
      const taggedKernels = await this.kernelRegistry.searchKernels({ tag: tags });
      kernels.push(...taggedKernels.slice(0, 3)); // Limit to top 3
    }

    // 3. Search by category (e.g., architecture, security)
    if (kernels.length === 0) {
      const category = this.inferCategoryFromIssue(issue);
      if (category) {
        const categoryKernels = await this.kernelRegistry.searchKernels({ category });
        kernels.push(...categoryKernels.slice(0, 2)); // Limit to top 2
      }
    }

    return kernels;
  }

  /**
   * Extract Kernel references (e.g., KRN-001) from text
   */
  private extractKernelReferences(text: string): string[] {
    const pattern = /KRN-\d+/g;
    const matches = text.match(pattern);
    return matches ? Array.from(new Set(matches)) : [];
  }

  /**
   * Extract tags from Issue (labels + keywords)
   */
  private extractTagsFromIssue(issue: GitHubIssue): string[] {
    const tags = new Set<string>();

    // From labels
    for (const label of issue.labels) {
      const labelName = typeof label === 'string' ? label : label.name;
      tags.add(labelName.toLowerCase());
    }

    // From keywords in title/body
    const text = `${issue.title} ${issue.body || ''}`.toLowerCase();
    const keywords = ['security', 'authentication', 'https', 'jwt', 'validation', 'test'];
    for (const keyword of keywords) {
      if (text.includes(keyword)) {
        tags.add(keyword);
      }
    }

    return Array.from(tags);
  }

  /**
   * Infer Kernel category from Issue
   */
  private inferCategoryFromIssue(issue: GitHubIssue): 'architecture' | 'requirement' | 'constraint' | 'interface' | 'quality' | 'security' | undefined {
    const text = `${issue.title} ${issue.body || ''}`.toLowerCase();

    if (text.includes('architecture') || text.includes('design')) return 'architecture';
    if (text.includes('security') || text.includes('authentication')) return 'security';
    if (text.includes('requirement') || text.includes('feature')) return 'requirement';
    if (text.includes('quality') || text.includes('test')) return 'quality';
    if (text.includes('interface') || text.includes('api')) return 'interface';

    return undefined;
  }

  /**
   * Analyze Issue with Kernel context
   */
  private async analyzeIssueWithKernels(
    issue: GitHubIssue,
    kernels: KernelWithNRVV[]
  ): Promise<any> {
    // Base analysis
    const baseAnalysis = this.analyzeIssue(issue);

    // Extract Requirements from Kernels
    const requirements: string[] = [];
    const constraints: string[] = [];

    for (const kernel of kernels) {
      for (const req of kernel.requirements || []) {
        requirements.push(req.statement);

        // Extract constraints from Requirements
        if (req.constraints && Array.isArray(req.constraints)) {
          constraints.push(...req.constraints);
        }
      }
    }

    return {
      ...baseAnalysis,
      relatedKernels: kernels.map((k) => k.id),
      requirements: requirements.length > 0 ? requirements : undefined,
      constraints: constraints.length > 0 ? constraints : undefined,
    };
  }

  /**
   * Generate code with Kernel context
   */
  private async generateCodeWithKernels(
    issue: GitHubIssue,
    analysis: any,
    kernels: KernelWithNRVV[]
  ): Promise<GeneratedCode[]> {
    // If no Kernels, use standard generation
    if (kernels.length === 0) {
      return this.generateCode(issue, analysis);
    }

    // Build enhanced prompt with Kernel Requirements
    if (!this.anthropic) {
      this.log('⚠️  No Anthropic API key, using template-based generation');
      return this.generateCodeTemplate(issue, analysis);
    }

    this.log('🤖 Generating code with Kernel Requirements...');

    const kernelContext = this.buildKernelContext(kernels);
    const prompt = this.buildPromptWithKernels(issue, analysis, kernelContext);

    try {
      const response = await this.anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        messages: [{ role: 'user', content: prompt }],
      });

      const content = response.content[0];
      if (content.type === 'text') {
        return this.parseGeneratedCode(content.text);
      }

      return this.generateCodeTemplate(issue, analysis);
    } catch (error) {
      this.log(`⚠️  Claude API error: ${(error as Error).message}`);
      return this.generateCodeTemplate(issue, analysis);
    }
  }

  /**
   * Build Kernel context for prompt
   */
  private buildKernelContext(kernels: KernelWithNRVV[]): string {
    let context = '## Related Kernel Requirements\n\n';

    for (const kernel of kernels) {
      context += `### ${kernel.id}: ${kernel.statement}\n\n`;

      if (kernel.requirements && kernel.requirements.length > 0) {
        context += '**Requirements:**\n';
        for (const req of kernel.requirements) {
          context += `- ${req.statement}\n`;
          if (req.rationale) {
            context += `  (Rationale: ${req.rationale})\n`;
          }
        }
        context += '\n';
      }

      if (kernel.requirements && kernel.requirements.some((r) => r.constraints)) {
        context += '**Constraints:**\n';
        for (const req of kernel.requirements) {
          if (req.constraints && Array.isArray(req.constraints)) {
            for (const constraint of req.constraints) {
              context += `- ${constraint}\n`;
            }
          }
        }
        context += '\n';
      }
    }

    return context;
  }

  /**
   * Build prompt with Kernel context
   */
  private buildPromptWithKernels(
    issue: GitHubIssue,
    analysis: any,
    kernelContext: string
  ): string {
    return `# Code Generation Request (Kernel-Driven)

## Issue
**Title**: ${issue.title}
**Type**: ${analysis.type}
**Complexity**: ${analysis.complexity}
**Language**: ${analysis.language}
${analysis.framework ? `**Framework**: ${analysis.framework}` : ''}

## Description
${issue.body || 'No description provided'}

${kernelContext}

## Code Generation Requirements
- Generate high-quality ${analysis.language} code
- **MUST satisfy all Requirements listed above**
- **MUST comply with all Constraints listed above**
- Follow TypeScript strict mode if applicable
- Include proper error handling
- Add JSDoc comments
${analysis.requiresTests ? '- Include unit tests' : ''}

## Output Format
Please provide the generated code in the following format:
\`\`\`
FILE: <filename>
<code>
\`\`\`

Generate all necessary files to implement this feature while satisfying the Kernel Requirements.`;
  }

  /**
   * Update Kernels with generated code artifacts
   */
  private async updateKernelsWithGeneratedCode(
    kernels: KernelWithNRVV[],
    generatedCode: GeneratedCode[],
    issue: GitHubIssue
  ): Promise<void> {
    if (kernels.length === 0 || this.config.dryRun) {
      return;
    }

    for (const kernel of kernels) {
      // Issue #43: Use KernelRuntime.apply() to link generated code as evidence
      let linkedCount = 0;
      for (const file of generatedCode) {
        const linkEvidenceOp: LinkEvidenceOperation = {
          op: 'u.link_evidence',
          actor: 'CodeGenAgent',
          issue: `#${issue.number}`,
          payload: {
            kernel_id: kernel.id,
            evidence_type: 'artifact',
            evidence_id: `CODE-${issue.number}-${file.filename.replace(/[^a-zA-Z0-9]/g, '-')}`,
            evidence_source: file.filename,
            source_origin: 'ai', // Issue #49: Mark as AI-generated
            verification_status: 'pending',
          },
        };
        const linkResult = await this.kernelRuntime.apply(linkEvidenceOp);

        if (linkResult.success) {
          linkedCount++;
        } else {
          this.log(`  ⚠️  Failed to link ${file.filename} to Kernel ${kernel.id}: ${linkResult.error}`);
        }
      }

      this.log(`Linked ${linkedCount}/${generatedCode.length} generated files to Kernel ${kernel.id}`);
    }
  }
}
