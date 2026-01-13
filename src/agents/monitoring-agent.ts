/**
 * MonitoringAgent - System Monitoring & Alerting
 */

import { Octokit } from '@octokit/rest';
import * as https from 'https';
import * as http from 'http';
import {
  GitHubIssue,
  AgentConfig,
  AgentResult,
  MonitoringContext,
  DeploymentContext,
  Metric,
  Alert,
  HealthStatus,
  HealthCheck,
} from '../types';

export class MonitoringAgent {
  private octokit: Octokit;
  private config: AgentConfig;
  private metrics: Metric[] = [];
  private alerts: Alert[] = [];

  constructor(config: AgentConfig) {
    this.config = config;
    this.octokit = new Octokit({ auth: config.githubToken });
  }

  private log(message: string): void {
    if (this.config.verbose) {
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] [MonitoringAgent] ${message}`);
    }
  }

  /**
   * メイン実行
   */
  async execute(
    issueNumber: number,
    deploymentContext: DeploymentContext
  ): Promise<AgentResult<MonitoringContext>> {
    const startTime = Date.now();
    this.log(`📊 Monitoring starting for issue #${issueNumber}`);

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
      if (deploymentContext.codeGenContext.generatedCode.length === 0) {
        this.log(`ℹ️  No deployment to monitor (0 files deployed)`);

        const context: MonitoringContext = {
          issue,
          deploymentContext,
          metrics: [],
          alerts: [],
          healthStatus: { status: 'healthy', checks: [], uptime: 0, timestamp: new Date().toISOString() },
          isHealthy: true,
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

      // 2. メトリクス収集
      await this.collectMetrics(deploymentContext);
      this.log(`📈 Collected ${this.metrics.length} metrics`);

      // 3. ヘルスチェック実行
      const healthStatus = await this.checkHealth(deploymentContext);
      this.log(`🏥 Health status: ${healthStatus.status}`);

      // 4. アラート生成
      this.generateAlerts(healthStatus);
      this.log(`🚨 Generated ${this.alerts.length} alerts`);

      // 5. 健全性判定
      const isHealthy = healthStatus.status === 'healthy';

      this.log(`📈 System: ${isHealthy ? 'HEALTHY' : 'UNHEALTHY'}`);

      // 6. 結果作成
      const context: MonitoringContext = {
        issue,
        deploymentContext,
        metrics: this.metrics,
        alerts: this.alerts,
        healthStatus,
        isHealthy,
        timestamp: new Date().toISOString(),
      };

      return {
        status: isHealthy ? 'success' : 'blocked',
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
   * メトリクス収集
   */
  private async collectMetrics(deploymentContext: DeploymentContext): Promise<void> {
    this.metrics = [];

    // デプロイメトリクス
    for (const deployment of deploymentContext.deploymentResults) {
      this.recordMetric({
        name: 'deployment_duration_ms',
        type: 'histogram',
        value: deployment.duration,
        timestamp: deployment.deployedAt,
        labels: {
          environment: deployment.environment,
          status: deployment.status,
        },
      });

      this.recordMetric({
        name: 'deployment_status',
        type: 'gauge',
        value: deployment.status === 'deployed' ? 1 : 0,
        timestamp: deployment.deployedAt,
        labels: {
          environment: deployment.environment,
        },
      });
    }

    // テストメトリクス
    const testContext = deploymentContext.testContext;
    const totalTests = testContext.testResults.reduce(
      (sum, r) => sum + r.passed + r.failed + r.skipped,
      0
    );
    const passedTests = testContext.testResults.reduce(
      (sum, r) => sum + r.passed,
      0
    );

    this.recordMetric({
      name: 'test_pass_rate',
      type: 'gauge',
      value: totalTests > 0 ? (passedTests / totalTests) * 100 : 0,
      timestamp: testContext.timestamp,
    });

    this.recordMetric({
      name: 'code_coverage_percentage',
      type: 'gauge',
      value: testContext.coverage.statements.percentage,
      timestamp: testContext.timestamp,
      labels: { type: 'statements' },
    });

    // 品質メトリクス
    const reviewContext = deploymentContext.reviewContext;
    this.recordMetric({
      name: 'code_quality_score',
      type: 'gauge',
      value: reviewContext.overallScore,
      timestamp: reviewContext.timestamp,
    });

    this.recordMetric({
      name: 'security_issues_count',
      type: 'counter',
      value: reviewContext.securityIssues.length,
      timestamp: reviewContext.timestamp,
    });
  }

  /**
   * メトリクス記録
   */
  recordMetric(metric: Metric): void {
    this.metrics.push(metric);
  }

  /**
   * ヘルスチェック実行
   */
  private async checkHealth(
    deploymentContext: DeploymentContext
  ): Promise<HealthStatus> {
    const checks: HealthCheck[] = [];
    const startTime = Date.now();

    // 1. デプロイメントチェック
    const deploymentCheck = this.checkDeploymentHealth(deploymentContext);
    checks.push(deploymentCheck);

    // 2. テストチェック
    const testCheck = this.checkTestHealth(deploymentContext.testContext);
    checks.push(testCheck);

    // 3. コード品質チェック
    const qualityCheck = this.checkQualityHealth(deploymentContext.reviewContext);
    checks.push(qualityCheck);

    // 4. カバレッジチェック
    const coverageCheck = this.checkCoverageHealth(deploymentContext.testContext);
    checks.push(coverageCheck);

    // 5. エンドポイントチェック
    for (const deployment of deploymentContext.deploymentResults) {
      if (deployment.url && deployment.status === 'deployed') {
        const endpointCheck = await this.checkEndpointHealth(deployment.url);
        checks.push(endpointCheck);
      }
    }

    // ステータス判定
    const failedChecks = checks.filter((c) => c.status === 'fail').length;
    let status: 'healthy' | 'degraded' | 'unhealthy';

    if (failedChecks === 0) {
      status = 'healthy';
    } else if (failedChecks <= 2) {
      status = 'degraded';
    } else {
      status = 'unhealthy';
    }

    const uptime = Date.now() - startTime;

    return {
      status,
      checks,
      uptime,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * デプロイメントヘルスチェック
   */
  private checkDeploymentHealth(
    deploymentContext: DeploymentContext
  ): HealthCheck {
    const startTime = Date.now();
    const allDeployed = deploymentContext.deploymentResults.every(
      (d) => d.status === 'deployed'
    );

    return {
      name: 'deployment',
      status: allDeployed ? 'pass' : 'fail',
      message: allDeployed
        ? 'All deployments successful'
        : 'Some deployments failed',
      duration: Date.now() - startTime,
    };
  }

  /**
   * テストヘルスチェック
   */
  private checkTestHealth(testContext: any): HealthCheck {
    const startTime = Date.now();

    return {
      name: 'tests',
      status: testContext.overallPassed ? 'pass' : 'fail',
      message: testContext.overallPassed
        ? 'All tests passed'
        : 'Some tests failed',
      duration: Date.now() - startTime,
    };
  }

  /**
   * 品質ヘルスチェック
   */
  private checkQualityHealth(reviewContext: any): HealthCheck {
    const startTime = Date.now();

    return {
      name: 'quality',
      status: reviewContext.passed ? 'pass' : 'fail',
      message: reviewContext.passed
        ? `Quality score: ${reviewContext.overallScore}/100`
        : `Quality score below threshold: ${reviewContext.overallScore}/100`,
      duration: Date.now() - startTime,
    };
  }

  /**
   * カバレッジヘルスチェック
   */
  private checkCoverageHealth(testContext: any): HealthCheck {
    const startTime = Date.now();

    return {
      name: 'coverage',
      status: testContext.coverageMet ? 'pass' : 'fail',
      message: testContext.coverageMet
        ? 'Coverage target met (≥80%)'
        : `Coverage below target: ${testContext.coverage.statements.percentage.toFixed(2)}%`,
      duration: Date.now() - startTime,
    };
  }

  /**
   * エンドポイントヘルスチェック
   */
  private async checkEndpointHealth(url: string): Promise<HealthCheck> {
    const startTime = Date.now();

    try {
      const result = await this.pingEndpoint(url, 10000);

      return {
        name: `endpoint:${url}`,
        status: result.healthy ? 'pass' : 'fail',
        message: result.healthy
          ? `Response time: ${result.responseTime}ms`
          : `Failed: ${result.error}`,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      return {
        name: `endpoint:${url}`,
        status: 'fail',
        message: (error as Error).message,
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * エンドポイントPing
   */
  private async pingEndpoint(
    url: string,
    timeout: number
  ): Promise<{ healthy: boolean; responseTime: number; error?: string }> {
    const startTime = Date.now();

    return new Promise((resolve) => {
      const protocol = url.startsWith('https') ? https : http;
      const timeoutId = setTimeout(() => {
        resolve({
          healthy: false,
          responseTime: Date.now() - startTime,
          error: 'Timeout',
        });
      }, timeout);

      const req = protocol.get(url, (res) => {
        clearTimeout(timeoutId);

        const healthy = res.statusCode ? res.statusCode >= 200 && res.statusCode < 300 : false;

        resolve({
          healthy,
          responseTime: Date.now() - startTime,
          error: healthy ? undefined : `HTTP ${res.statusCode}`,
        });

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
   * アラート生成
   */
  private generateAlerts(healthStatus: HealthStatus): void {
    this.alerts = [];

    for (const check of healthStatus.checks) {
      if (check.status === 'fail') {
        this.createAlert({
          severity: this.determineSeverity(check.name),
          message: `Health check failed: ${check.name}`,
          metric: check.name,
        });
      }
    }

    // メトリクスベースのアラート
    for (const metric of this.metrics) {
      this.checkMetricThreshold(metric);
    }
  }

  /**
   * アラート作成
   */
  private createAlert(params: {
    severity: Alert['severity'];
    message: string;
    metric?: string;
    threshold?: number;
    currentValue?: number;
  }): void {
    this.alerts.push({
      id: this.generateAlertId(),
      severity: params.severity,
      message: params.message,
      metric: params.metric,
      threshold: params.threshold,
      currentValue: params.currentValue,
      timestamp: new Date().toISOString(),
      resolved: false,
    });
  }

  /**
   * メトリクス閾値チェック
   */
  private checkMetricThreshold(metric: Metric): void {
    // テスト合格率
    if (metric.name === 'test_pass_rate' && metric.value < 100) {
      this.createAlert({
        severity: 'warning',
        message: 'Test pass rate below 100%',
        metric: metric.name,
        threshold: 100,
        currentValue: metric.value,
      });
    }

    // コードカバレッジ
    if (
      metric.name === 'code_coverage_percentage' &&
      metric.value < 80
    ) {
      this.createAlert({
        severity: 'warning',
        message: 'Code coverage below 80%',
        metric: metric.name,
        threshold: 80,
        currentValue: metric.value,
      });
    }

    // コード品質スコア
    if (metric.name === 'code_quality_score' && metric.value < 80) {
      this.createAlert({
        severity: 'error',
        message: 'Code quality score below 80',
        metric: metric.name,
        threshold: 80,
        currentValue: metric.value,
      });
    }

    // セキュリティ問題
    if (metric.name === 'security_issues_count' && metric.value > 0) {
      this.createAlert({
        severity: 'critical',
        message: `${metric.value} security issues detected`,
        metric: metric.name,
        threshold: 0,
        currentValue: metric.value,
      });
    }
  }

  /**
   * 重要度判定
   */
  private determineSeverity(checkName: string): Alert['severity'] {
    if (checkName.includes('security')) return 'critical';
    if (checkName.includes('deployment')) return 'error';
    if (checkName.includes('quality')) return 'warning';
    return 'info';
  }

  /**
   * アラートID生成
   */
  private generateAlertId(): string {
    return `alert-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * モニタリングサマリー取得
   */
  getSummary(context: MonitoringContext): string {
    const summary = [
      '## Monitoring Summary',
      '',
      '### Health Status',
      `- Overall: ${this.getHealthEmoji(context.healthStatus.status)} ${context.healthStatus.status.toUpperCase()}`,
      '',
      '### Health Checks',
    ];

    for (const check of context.healthStatus.checks) {
      const emoji = check.status === 'pass' ? '✅' : '❌';
      summary.push(`- ${emoji} ${check.name}: ${check.message}`);
    }

    summary.push('', '### Metrics');
    for (const metric of context.metrics) {
      summary.push(
        `- ${metric.name}: ${metric.value.toFixed(2)}${metric.type === 'gauge' && metric.name.includes('percentage') ? '%' : ''}`
      );
    }

    if (context.alerts.length > 0) {
      summary.push('', '### Alerts');
      for (const alert of context.alerts) {
        const emoji = this.getAlertEmoji(alert.severity);
        summary.push(`- ${emoji} [${alert.severity.toUpperCase()}] ${alert.message}`);
      }
    }

    return summary.join('\n');
  }

  /**
   * ヘルス絵文字取得
   */
  private getHealthEmoji(status: string): string {
    const emojis: Record<string, string> = {
      healthy: '✅',
      degraded: '⚠️',
      unhealthy: '❌',
    };
    return emojis[status] || '❓';
  }

  /**
   * アラート絵文字取得
   */
  private getAlertEmoji(severity: Alert['severity']): string {
    const emojis: Record<Alert['severity'], string> = {
      info: 'ℹ️',
      warning: '⚠️',
      error: '❌',
      critical: '🚨',
    };
    return emojis[severity];
  }
}
