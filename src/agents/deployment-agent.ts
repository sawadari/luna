/**
 * DeploymentAgent - Automated Deployment & Rollback
 */

import { Octokit } from '@octokit/rest';
import { execSync } from 'child_process';
import * as https from 'https';
import * as http from 'http';
import {
  GitHubIssue,
  AgentConfig,
  AgentResult,
  DeploymentContext,
  CodeGenContext,
  ReviewContext,
  TestContext,
  DeploymentConfig,
  DeploymentResult,
  DeploymentEnvironment,
  DeploymentStatus,
  HealthCheckResult,
} from '../types';
import { KernelRegistryService } from '../ssot/kernel-registry';
import type { Validation } from '../types/nrvv';
import { getRulesConfig, ensureRulesConfigLoaded, RulesConfigService } from '../services/rules-config-service';

export class DeploymentAgent {
  private octokit: Octokit;
  private config: AgentConfig;
  private kernelRegistry: KernelRegistryService;
  private rulesConfig: RulesConfigService;
  private defaultDeploymentConfig: DeploymentConfig = {
    environment: 'staging',
    autoRollback: true,
    healthCheckTimeout: 30000,
    deployTimeout: 300000,
  };

  constructor(config: AgentConfig) {
    this.config = config;
    this.octokit = new Octokit({ auth: config.githubToken });
    this.kernelRegistry = new KernelRegistryService();
    this.rulesConfig = getRulesConfig();
  }

  private log(message: string): void {
    if (this.config.verbose) {
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] [DeploymentAgent] ${message}`);
    }
  }

  /**
   * メイン実行
   */
  async execute(
    issueNumber: number,
    codeGenContext: CodeGenContext,
    reviewContext: ReviewContext,
    testContext: TestContext,
    deployConfig?: Partial<DeploymentConfig>
  ): Promise<AgentResult<DeploymentContext>> {
    const startTime = Date.now();
    this.log(`🚀 Deployment starting for issue #${issueNumber}`);

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

      // 3. Check deployment rules for target environment
      const targetEnv = deployConfig?.environment || this.defaultDeploymentConfig.environment;
      const autoDeployEnabled = this.rulesConfig.get<boolean>(
        `human_ai_boundary.auto_deployment.environments.${targetEnv}.enabled`
      ) ?? (targetEnv === 'dev' || targetEnv === 'staging');

      if (!autoDeployEnabled) {
        this.log(`⚠️  Auto-deployment disabled for ${targetEnv} environment`);

        // Early return with blocked status - actually prevent deployment
        const context: DeploymentContext = {
          issue,
          codeGenContext,
          reviewContext,
          testContext,
          deploymentResults: [],
          overallSuccess: false,
          timestamp: new Date().toISOString(),
        };

        return {
          status: 'blocked',
          data: context,
          error: new Error(`Auto-deployment to ${targetEnv} is disabled by rules-config.yaml`),
          metrics: {
            durationMs: Date.now() - startTime,
            timestamp: new Date().toISOString(),
          },
        };
      }

      // コードが生成されていない場合はスキップ
      if (codeGenContext.generatedCode.length === 0) {
        this.log(`ℹ️  No code to deploy (0 files generated)`);

        const context: DeploymentContext = {
          issue,
          codeGenContext,
          reviewContext,
          testContext,
          deploymentResults: [],
          overallSuccess: true,
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

      // 2. デプロイ設定
      const finalConfig: DeploymentConfig = {
        ...this.defaultDeploymentConfig,
        ...deployConfig,
      };

      // 3. デプロイ実行
      const deploymentResults = await this.deploy(finalConfig);
      this.log(`✅ Deployment complete`);

      // 4. 成功判定
      const overallSuccess = this.checkDeploymentSuccess(deploymentResults);

      this.log(
        `📈 Deployment: ${overallSuccess ? 'SUCCESS' : 'FAILED'}`
      );

      // 5. 結果作成
      const context: DeploymentContext = {
        issue,
        codeGenContext,
        reviewContext,
        testContext,
        deploymentResults,
        overallSuccess,
        timestamp: new Date().toISOString(),
      };

      // 6. Validation記録 (dry-runモードではスキップ)
      if (!this.config.dryRun && overallSuccess) {
        try {
          await this.recordValidation(issueNumber, context);
          this.log('✅ Validation recorded to kernels.yaml');
        } catch (error) {
          this.log(`⚠️  Failed to record validation: ${(error as Error).message}`);
        }
      }

      return {
        status: overallSuccess ? 'success' : 'blocked',
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
   * デプロイ実行
   */
  private async deploy(config: DeploymentConfig): Promise<DeploymentResult[]> {
    const results: DeploymentResult[] = [];

    this.log(`🚀 Deploying to ${config.environment}...`);

    const deployStartTime = Date.now();
    let status: DeploymentStatus = 'deploying';
    let error: string | undefined;

    try {
      // デプロイコマンド実行 (dry-runモードではスキップ)
      if (this.config.dryRun) {
        this.log('🔍 Dry-run mode: Skipping actual deployment');
        status = 'deployed';
      } else {
        await this.executeDeployment(config);
        status = 'deployed';
      }

      // ヘルスチェック
      if (config.healthCheckUrl) {
        this.log('🏥 Running health check...');
        const healthCheck = await this.performHealthCheck(
          config.healthCheckUrl,
          config.healthCheckTimeout || 30000
        );

        if (!healthCheck.healthy) {
          this.log('❌ Health check failed');

          if (config.autoRollback) {
            this.log('🔄 Auto-rollback enabled, rolling back...');
            await this.rollback(config);
            status = 'rolled_back';
            error = `Health check failed: ${healthCheck.error}`;
          } else {
            status = 'failed';
            error = `Health check failed: ${healthCheck.error}`;
          }
        } else {
          this.log('✅ Health check passed');
        }
      }
    } catch (deployError) {
      this.log(`❌ Deployment failed: ${(deployError as Error).message}`);
      status = 'failed';
      error = (deployError as Error).message;

      if (config.autoRollback) {
        this.log('🔄 Auto-rollback enabled, rolling back...');
        try {
          await this.rollback(config);
          status = 'rolled_back';
        } catch (rollbackError) {
          this.log(`❌ Rollback failed: ${(rollbackError as Error).message}`);
          error = `Deployment failed: ${error}, Rollback also failed: ${(rollbackError as Error).message}`;
        }
      }
    }

    const duration = Date.now() - deployStartTime;
    const version = this.generateVersion();

    results.push({
      environment: config.environment,
      status,
      version,
      deployedAt: new Date().toISOString(),
      duration,
      url: config.healthCheckUrl,
      error,
    });

    return results;
  }

  /**
   * デプロイコマンド実行
   */
  private async executeDeployment(config: DeploymentConfig): Promise<void> {
    // 環境別のデプロイコマンド
    const commands: Record<DeploymentEnvironment, string> = {
      dev: 'npm run deploy:dev',
      staging: 'npm run deploy:staging',
      production: 'npm run deploy:prod',
    };

    const command = commands[config.environment];

    this.log(`Executing: ${command}`);

    try {
      execSync(command, {
        encoding: 'utf-8',
        timeout: config.deployTimeout || 300000,
        stdio: 'pipe',
      });
    } catch (error: any) {
      throw new Error(`Deployment command failed: ${error.message}`);
    }
  }

  /**
   * ヘルスチェック実行
   */
  private async performHealthCheck(
    url: string,
    timeout: number
  ): Promise<HealthCheckResult> {
    const startTime = Date.now();

    return new Promise((resolve) => {
      const protocol = url.startsWith('https') ? https : http;
      const timeoutId = setTimeout(() => {
        resolve({
          healthy: false,
          responseTime: Date.now() - startTime,
          error: 'Health check timeout',
        });
      }, timeout);

      const req = protocol.get(url, (res) => {
        clearTimeout(timeoutId);

        const healthy = res.statusCode ? res.statusCode >= 200 && res.statusCode < 300 : false;

        resolve({
          healthy,
          statusCode: res.statusCode,
          responseTime: Date.now() - startTime,
          error: healthy ? undefined : `HTTP ${res.statusCode}`,
        });

        // Drain response to free up socket
        res.resume();
      });

      req.on('error', (error) => {
        clearTimeout(timeoutId);
        resolve({
          healthy: false,
          responseTime: Date.now() - startTime,
          error: error.message,
        });
      });

      req.end();
    });
  }

  /**
   * ロールバック実行
   */
  private async rollback(config: DeploymentConfig): Promise<void> {
    this.log('🔄 Executing rollback...');

    if (this.config.dryRun) {
      this.log('🔍 Dry-run mode: Skipping actual rollback');
      return;
    }

    const commands: Record<DeploymentEnvironment, string> = {
      dev: 'npm run rollback:dev',
      staging: 'npm run rollback:staging',
      production: 'npm run rollback:prod',
    };

    const command = commands[config.environment];

    try {
      execSync(command, {
        encoding: 'utf-8',
        timeout: config.deployTimeout || 300000,
        stdio: 'pipe',
      });
      this.log('✅ Rollback completed');
    } catch (error: any) {
      throw new Error(`Rollback command failed: ${error.message}`);
    }
  }

  /**
   * バージョン生成
   */
  private generateVersion(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hour = String(now.getHours()).padStart(2, '0');
    const minute = String(now.getMinutes()).padStart(2, '0');
    const second = String(now.getSeconds()).padStart(2, '0');

    return `v${year}.${month}.${day}-${hour}${minute}${second}`;
  }

  /**
   * デプロイ成功判定
   */
  private checkDeploymentSuccess(results: DeploymentResult[]): boolean {
    for (const result of results) {
      if (result.status !== 'deployed') {
        return false;
      }
    }
    return true;
  }

  /**
   * デプロイサマリー取得
   */
  getSummary(context: DeploymentContext): string {
    const summary = ['## Deployment Results', ''];

    for (const result of context.deploymentResults) {
      summary.push(`### ${result.environment}`);
      summary.push(`- Status: ${this.getStatusEmoji(result.status)} ${result.status}`);
      summary.push(`- Version: ${result.version}`);
      summary.push(`- Duration: ${result.duration}ms`);

      if (result.url) {
        summary.push(`- URL: ${result.url}`);
      }

      if (result.error) {
        summary.push(`- Error: ${result.error}`);
      }

      summary.push('');
    }

    summary.push('## Overall Status');
    summary.push(
      context.overallSuccess
        ? '✅ Deployment SUCCESSFUL'
        : '❌ Deployment FAILED'
    );

    return summary.join('\n');
  }

  /**
   * ステータス絵文字取得
   */
  private getStatusEmoji(status: DeploymentStatus): string {
    const emojis: Record<DeploymentStatus, string> = {
      pending: '⏳',
      deploying: '🚀',
      deployed: '✅',
      failed: '❌',
      rolled_back: '🔄',
    };
    return emojis[status];
  }

  /**
   * Validation記録
   */
  private async recordValidation(
    issueNumber: number,
    context: DeploymentContext
  ): Promise<void> {
    this.log('📝 Recording Validation to Kernel Registry...');

    // kernels.yaml内のIssueに対応するKernelを検索
    const kernels = await this.kernelRegistry.searchKernels({
      tag: `issue-${issueNumber}`,
    });

    if (kernels.length === 0) {
      this.log(`⚠️  No kernel found for issue #${issueNumber}, skipping validation recording`);
      return;
    }

    const kernel = kernels[0]; // 最初のKernelを使用

    // Validation ID生成
    const validationId = this.generateValidationId(kernel.id);

    // デプロイ結果から情報を集計
    const deploymentResult = context.deploymentResults[0];
    const environment = deploymentResult?.environment || 'unknown';

    // Validation作成
    const validation: Validation = {
      id: validationId,
      statement: 'システムが本番環境で正常に動作することを確認',
      method: 'field_test',
      criteria: [
        'デプロイ成功',
        'ヘルスチェック通過',
        `環境: ${environment}`,
      ],
      traceability: {
        upstream: [...kernel.needs.map((n) => n.id), ...kernel.requirements.map((r) => r.id)],
        downstream: [],
      },
      status: context.overallSuccess ? 'passed' : 'failed',
      validatedAt: new Date().toISOString(),
      validatedBy: 'DeploymentAgent',
      evidence: [
        {
          type: 'field_data',
          path: 'deployment-log.json',
          createdAt: new Date().toISOString(),
        },
      ],
      notes: `Issue #${issueNumber}: ${context.issue.title}`,
    };

    // Kernel Registryに記録
    await this.kernelRegistry.addValidationToKernel(kernel.id, validation);

    this.log(`✅ Validation ${validationId} recorded for Kernel ${kernel.id}`);
  }

  /**
   * Validation ID生成
   */
  private generateValidationId(kernelId: string): string {
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 1000)
      .toString()
      .padStart(3, '0');
    return `VAL-${kernelId}-${timestamp}-${random}`;
  }
}
