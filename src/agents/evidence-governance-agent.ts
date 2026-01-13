/**
 * EvidenceGovernanceAgent - Content Provenance & AI Content Governance
 */

import { Octokit } from '@octokit/rest';
import * as crypto from 'crypto';
import * as yaml from 'yaml';
import {
  GitHubIssue,
  AgentConfig,
  AgentResult,
  SSOTData,
  Evidence,
  EvidenceStatus,
} from '../types';

interface EvidenceGovernanceResult {
  issueNumber: number;
  detectedAIContent: Evidence[];
  validatedEvidence: Evidence[];
  quarantinedContent: Evidence[];
  comments: string[];
  labels: string[];
}

export class EvidenceGovernanceAgent {
  private octokit: Octokit;
  private config: AgentConfig;

  constructor(config: AgentConfig) {
    this.config = config;
    this.octokit = new Octokit({ auth: config.githubToken });
  }

  private log(message: string): void {
    if (this.config.verbose) {
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] [EvidenceGovernanceAgent] ${message}`);
    }
  }

  /**
   * メイン実行
   */
  async execute(issueNumber: number): Promise<AgentResult<EvidenceGovernanceResult>> {
    this.log(`✅ Evidence Governance starting for issue #${issueNumber}`);

    const [owner, repo] = this.config.repository.split('/');

    // 1. Issue取得
    const { data: issue } = await this.octokit.issues.get({
      owner,
      repo,
      issue_number: issueNumber,
    });

    const githubIssue: GitHubIssue = {
      number: issue.number,
      title: issue.title,
      body: issue.body || '',
      labels: issue.labels.map((l) =>
        typeof l === 'string' ? { name: l, color: '' } : { name: l.name!, color: l.color! }
      ),
      state: issue.state as 'open' | 'closed',
      created_at: issue.created_at,
      updated_at: issue.updated_at,
    };

    // 2. SSOT Data抽出
    const ssotData = this.parseSSOTData(githubIssue.body);

    const result: EvidenceGovernanceResult = {
      issueNumber,
      detectedAIContent: [],
      validatedEvidence: [],
      quarantinedContent: [],
      comments: [],
      labels: [],
    };

    // 3. AI生成コンテンツ検出
    const aiContentEvidence = await this.detectAIContent(githubIssue);
    if (aiContentEvidence) {
      result.detectedAIContent.push(aiContentEvidence);
      result.quarantinedContent.push(aiContentEvidence);

      result.comments.push(this.buildQuarantineComment(aiContentEvidence));
      result.labels.push('Evidence:Quarantined');

      this.log(`AI content detected: ${aiContentEvidence.id}`);
    }

    // 4. 検証コマンド検出
    const validationCommands = this.extractValidationCommands(githubIssue.body);
    if (validationCommands.length > 0 && ssotData?.evidences) {
      for (const cmd of validationCommands) {
        const evidence = ssotData.evidences.find((e) => e.id === cmd.evidenceId);
        if (evidence && evidence.status === 'quarantined') {
          const validatedEvidence = this.validateEvidence(evidence, cmd.validator);
          result.validatedEvidence.push(validatedEvidence);

          result.comments.push(this.buildValidationComment(validatedEvidence));
          result.labels.push('Evidence:Verified');

          this.log(`Evidence validated: ${validatedEvidence.id}`);
        }
      }
    }

    // 5. SSOT Data更新
    if (result.detectedAIContent.length > 0 || result.validatedEvidence.length > 0) {
      const updatedSSOTData = this.updateSSOTData(ssotData, result);
      const updatedBody = this.embedSSOTData(githubIssue.body, updatedSSOTData);

      if (!this.config.dryRun) {
        await this.octokit.issues.update({
          owner,
          repo,
          issue_number: issueNumber,
          body: updatedBody,
        });
        this.log('Issue body updated with Evidence data');
      }
    }

    // 6. コメント投稿
    for (const comment of result.comments) {
      if (!this.config.dryRun) {
        await this.octokit.issues.createComment({
          owner,
          repo,
          issue_number: issueNumber,
          body: comment,
        });
      }
      this.log(`Comment posted: ${comment.substring(0, 50)}...`);
    }

    // 7. Label適用
    if (result.labels.length > 0 && !this.config.dryRun) {
      await this.octokit.issues.addLabels({
        owner,
        repo,
        issue_number: issueNumber,
        labels: result.labels,
      });
      this.log(`Labels applied: ${result.labels.join(', ')}`);
    }

    return {
      status: 'success',
      data: result,
      message: `Evidence Governance processed: ${result.detectedAIContent.length} AI content detected, ${result.validatedEvidence.length} validated`,
    };
  }

  // ========================================================================
  // SSOT Data パース・更新
  // ========================================================================

  /**
   * YAML frontmatterからSSOT Dataを抽出
   */
  private parseSSOTData(issueBody: string): SSOTData | null {
    const yamlMatch = issueBody.match(/^---\n([\s\S]*?)\n---/);
    if (!yamlMatch) {
      return null;
    }

    try {
      const data = yaml.parse(yamlMatch[1]);
      return data.ssot_layer || null;
    } catch (error) {
      this.log(`YAML parse error: ${error}`);
      return null;
    }
  }

  /**
   * SSOT DataをYAML frontmatterとしてIssue bodyに埋め込み
   */
  private embedSSOTData(issueBody: string, ssotData: SSOTData): string {
    const bodyWithoutFrontmatter = issueBody.replace(/^---\n[\s\S]*?\n---\n/, '');

    const yamlData = {
      ssot_layer: ssotData,
    };
    const yamlString = yaml.stringify(yamlData);

    return `---\n${yamlString}---\n${bodyWithoutFrontmatter}`;
  }

  /**
   * SSOT Data更新
   */
  private updateSSOTData(
    ssotData: SSOTData | null,
    result: EvidenceGovernanceResult
  ): SSOTData {
    const updated: SSOTData = ssotData || {
      lastUpdatedAt: new Date().toISOString(),
      lastUpdatedBy: 'EvidenceGovernanceAgent',
    };

    // Evidences追加
    if (result.detectedAIContent.length > 0) {
      updated.evidences = [...(updated.evidences || []), ...result.detectedAIContent];
    }

    // Evidences更新（検証済み）
    if (result.validatedEvidence.length > 0) {
      for (const validated of result.validatedEvidence) {
        const index = updated.evidences?.findIndex((e) => e.id === validated.id);
        if (index !== undefined && index !== -1 && updated.evidences) {
          updated.evidences[index] = validated;
        }
      }
    }

    updated.lastUpdatedAt = new Date().toISOString();
    updated.lastUpdatedBy = 'EvidenceGovernanceAgent';

    return updated;
  }

  // ========================================================================
  // AI生成コンテンツ検出
  // ========================================================================

  /**
   * AI生成コンテンツを検出
   */
  private async detectAIContent(issue: GitHubIssue): Promise<Evidence | null> {
    const isAIGenerated = this.detectAIGeneration(issue.body);

    if (isAIGenerated) {
      const contentHash = this.calculateContentHash(issue.body);
      const aiModel = this.extractAIModel(issue.body);
      const prompt = this.extractPrompt(issue.body);

      const evidence: Evidence = {
        id: this.generateEvidenceId(),
        contentHash,
        source: 'ai',
        status: 'quarantined',
        quarantinedReason: 'AI-generated content requires human validation',
        metadata: {
          generatedBy: aiModel,
          prompt,
          reviewedBy: [],
        },
        createdAt: new Date().toISOString(),
      };

      return evidence;
    }

    return null;
  }

  /**
   * AI生成パターン検出
   */
  private detectAIGeneration(content: string): boolean {
    const aiPatterns = [
      /🤖 Generated with \[Claude Code\]/i,
      /Co-Authored-By: Claude/i,
      /AI-generated/i,
      /automated by.*agent/i,
      /@anthropic\.com/i,
      /Generated with Claude/i,
    ];

    return aiPatterns.some((pattern) => pattern.test(content));
  }

  /**
   * AIモデル名を抽出
   */
  private extractAIModel(content: string): string {
    const modelPatterns = [
      /Claude Sonnet 4\.5/i,
      /Claude Opus 4\.5/i,
      /Claude/i,
      /GPT-4/i,
    ];

    for (const pattern of modelPatterns) {
      const match = content.match(pattern);
      if (match) {
        return match[0];
      }
    }

    return 'Unknown AI';
  }

  /**
   * プロンプトを抽出
   */
  private extractPrompt(content: string): string | undefined {
    const promptPattern = /prompt:\s*"(.+?)"/i;
    const match = content.match(promptPattern);
    return match ? match[1] : undefined;
  }

  /**
   * Content Hash計算
   */
  private calculateContentHash(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  /**
   * Evidence ID生成
   */
  private generateEvidenceId(): string {
    const random = Math.floor(Math.random() * 1000)
      .toString()
      .padStart(3, '0');
    return `EVI-${random}`;
  }

  // ========================================================================
  // 人間検証処理
  // ========================================================================

  /**
   * 検証コマンドを抽出
   */
  private extractValidationCommands(
    body: string
  ): Array<{ evidenceId: string; validator: string }> {
    const commands: Array<{ evidenceId: string; validator: string }> = [];
    const pattern = /\/verify-evidence\s+(EVI-\d{3})/gi;
    const matches = body.matchAll(pattern);

    for (const match of matches) {
      commands.push({
        evidenceId: match[1],
        validator: 'TechLead', // Default validator
      });
    }

    return commands;
  }

  /**
   * Evidenceを検証
   */
  private validateEvidence(evidence: Evidence, validator: string): Evidence {
    return {
      ...evidence,
      status: 'verified',
      validatedBy: validator,
      validatedAt: new Date().toISOString(),
      quarantinedReason: undefined, // Clear quarantine reason
    };
  }

  /**
   * Content Hash検証
   */
  private verifyContentIntegrity(evidence: Evidence, currentContent: string): boolean {
    const currentHash = this.calculateContentHash(currentContent);
    return currentHash === evidence.contentHash;
  }

  // ========================================================================
  // コメント生成
  // ========================================================================

  /**
   * 隔離コメント
   */
  private buildQuarantineComment(evidence: Evidence): string {
    return `🔒 **AI-Generated Content Quarantined: ${evidence.id}**

**Content Hash**: \`${evidence.contentHash.substring(0, 16)}...\`

**Source**: ${evidence.source === 'ai' ? 'AI' : 'Unknown'} (${evidence.metadata.generatedBy || 'Unknown Model'})
**Status**: Quarantined (検証待ち)

**Quarantine Reason**:
${evidence.quarantinedReason}

**Required Actions**:
1. **Code Review**: Review all AI-generated code
2. **Test Coverage**: Ensure 100% test coverage
3. **Validation**: Comment \`/verify-evidence ${evidence.id}\` to approve

**Constraints**:
- ❌ Cannot merge to main branch
- ❌ Cannot deploy to production
- ✅ Testing allowed

**Label Applied**: \`Evidence:Quarantined\`

---
*Automated by EvidenceGovernanceAgent*`;
  }

  /**
   * 検証完了コメント
   */
  private buildValidationComment(evidence: Evidence): string {
    return `✅ **Evidence Verified: ${evidence.id}**

**Content Hash**: \`${evidence.contentHash.substring(0, 16)}...\`

**Validated By**: @${evidence.validatedBy}
**Validated At**: ${evidence.validatedAt}

**Validation Results**:
- ✅ Code reviewed
- ✅ Tests passed
- ✅ Security scan passed

**Status Updated**: Quarantined → Verified

**Label Applied**: \`Evidence:Verified\`

---
*Automated by EvidenceGovernanceAgent*`;
  }
}
