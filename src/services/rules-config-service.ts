/**
 * Rules Configuration Service
 *
 * 人間-AI責任分界ルール設定の管理サービス
 * rules-config.yamlをロード・解析し、各エージェントがルールを取得できるようにする
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { parse } from 'yaml';
import { env } from '../config/env.js';
import type {
  RulesConfig,
  ValidationResult,
  ValidationError,
  ValidationWarning,
  ChangeHistoryEntry,
  RuleGetOptions,
} from '../types/rules-config.js';

export class RulesConfigService {
  private config: RulesConfig | null = null;
  private configPath: string;

  constructor(configPath?: string) {
    // デフォルトはプロジェクトルートのrules-config.yaml
    this.configPath =
      configPath || path.join(process.cwd(), 'rules-config.yaml');
  }

  /**
   * ルール設定をロード
   */
  async load(): Promise<void> {
    try {
      const content = await fs.readFile(this.configPath, 'utf-8');
      this.config = parse(content) as RulesConfig;

      // ロード後に基本的なバリデーション
      const validation = this.validate();
      if (!validation.isValid) {
        console.warn(
          `⚠️  Rules config validation found ${validation.errors.length} errors`
        );
        validation.errors.forEach((error) => {
          console.warn(`   - ${error.path}: ${error.message}`);
        });
      }

      if (validation.warnings.length > 0) {
        console.warn(
          `⚠️  Rules config validation found ${validation.warnings.length} warnings`
        );
        validation.warnings.forEach((warning) => {
          console.warn(`   - ${warning.path}: ${warning.message}`);
        });
      }
    } catch (error) {
      console.error('❌ Failed to load rules-config.yaml:', error);
      throw new Error(
        `Failed to load rules configuration: ${(error as Error).message}`
      );
    }
  }

  /**
   * ルール値を取得（ドット記法のパス）
   *
   * @example
   * get('human_ai_boundary.dest_judgment.enabled')
   * get('organization_rules.max_issue_complexity')
   */
  get<T = any>(path: string, options?: RuleGetOptions): T | undefined {
    if (!this.config) {
      throw new Error(
        'Rules config not loaded. Call load() first.'
      );
    }

    const parts = path.split('.');
    let current: any = this.config;

    for (const part of parts) {
      if (current === undefined || current === null) {
        // 環境変数へのフォールバック（後方互換性）
        if (options?.fallbackToEnv) {
          return this.getFromEnv(path) as T;
        }
        return options?.useDefault ? this.getDefault(path) as T : undefined;
      }
      current = current[part];
    }

    return current as T;
  }

  /**
   * ルール値を設定（主に変更履歴記録用）
   */
  set(path: string, value: any, changedBy: string, rationale: string): void {
    if (!this.config) {
      throw new Error('Rules config not loaded. Call load() first.');
    }

    const parts = path.split('.');
    const oldValue = this.get(path);
    let current: any = this.config;

    // 最後の要素を除いて進む
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!(part in current)) {
        current[part] = {};
      }
      current = current[part];
    }

    // 値を設定
    const lastPart = parts[parts.length - 1];
    current[lastPart] = value;

    // 変更履歴を記録
    this.addChangeHistory({
      timestamp: new Date().toISOString(),
      changed_by: changedBy,
      rule: path,
      old_value: oldValue,
      new_value: value,
      rationale,
    });

    // メタ情報更新
    this.config.meta.last_updated = new Date().toISOString();
    this.config.meta.last_updated_by = changedBy;
  }

  /**
   * ルール設定を保存
   */
  async save(): Promise<void> {
    if (!this.config) {
      throw new Error('Rules config not loaded. Call load() first.');
    }

    try {
      const yaml = await import('yaml');
      const content = yaml.stringify(this.config, {
        indent: 2,
        lineWidth: 100,
      });
      await fs.writeFile(this.configPath, content, 'utf-8');
    } catch (error) {
      console.error('❌ Failed to save rules-config.yaml:', error);
      throw new Error(
        `Failed to save rules configuration: ${(error as Error).message}`
      );
    }
  }

  /**
   * バリデーション実行
   */
  validate(): ValidationResult {
    if (!this.config) {
      return {
        isValid: false,
        errors: [
          {
            path: 'root',
            message: 'Config not loaded',
            value: null,
          },
        ],
        warnings: [],
      };
    }

    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // 必須フィールドのチェック
    if (!this.config.meta) {
      errors.push({
        path: 'meta',
        message: 'Meta information is required',
        value: undefined,
      });
    }

    if (!this.config.human_ai_boundary) {
      errors.push({
        path: 'human_ai_boundary',
        message: 'Human-AI boundary configuration is required',
        value: undefined,
      });
    }

    // 閾値の妥当性チェック
    const qualityThreshold = this.get<number>(
      'human_ai_boundary.code_generation.quality_threshold'
    );
    if (qualityThreshold !== undefined && (qualityThreshold < 0 || qualityThreshold > 100)) {
      errors.push({
        path: 'human_ai_boundary.code_generation.quality_threshold',
        message: 'Quality threshold must be between 0 and 100',
        value: qualityThreshold,
      });
    }

    const convergenceThreshold = this.get<number>(
      'human_ai_boundary.kernel_generation.convergence_monitoring.threshold'
    );
    if (convergenceThreshold !== undefined && (convergenceThreshold < 0 || convergenceThreshold > 100)) {
      errors.push({
        path: 'human_ai_boundary.kernel_generation.convergence_monitoring.threshold',
        message: 'Convergence threshold must be between 0 and 100',
        value: convergenceThreshold,
      });
    }

    // AL閾値の整合性チェック
    const alThreshold = this.get<any>(
      'human_ai_boundary.dest_judgment.al_threshold'
    );
    if (alThreshold) {
      const alLevels = ['AL0', 'AL1', 'AL2', 'AL3', 'AL4'];
      const blockIndex = alLevels.indexOf(alThreshold.block_below);
      const approvalIndex = alLevels.indexOf(alThreshold.require_approval);
      const proceedIndex = alLevels.indexOf(alThreshold.auto_proceed);

      if (blockIndex > approvalIndex || approvalIndex > proceedIndex) {
        errors.push({
          path: 'human_ai_boundary.dest_judgment.al_threshold',
          message: 'AL threshold levels must be in order: block_below <= require_approval <= auto_proceed',
          value: alThreshold,
        });
      }
    }

    // 警告: DESTが無効の場合
    const destEnabled = this.get<boolean>(
      'human_ai_boundary.dest_judgment.enabled'
    );
    if (destEnabled === false) {
      warnings.push({
        path: 'human_ai_boundary.dest_judgment.enabled',
        message: 'DEST judgment is disabled. This may lead to wasted implementation efforts.',
        suggestion: 'Consider enabling DEST judgment for better resource optimization',
      });
    }

    // 警告: Planning Layerが無効の場合
    const planningEnabled = this.get<boolean>(
      'human_ai_boundary.planning_layer.enabled'
    );
    if (planningEnabled === false) {
      warnings.push({
        path: 'human_ai_boundary.planning_layer.enabled',
        message: 'Planning Layer is disabled. This may lead to suboptimal solutions.',
        suggestion: 'Consider enabling Planning Layer for better solution exploration',
      });
    }

    // core_architecture の必須項目チェック
    if (!this.config.core_architecture) {
      errors.push({
        path: 'core_architecture',
        message: 'Core architecture configuration is required',
        value: undefined,
      });
    } else {
      // kernel_runtime 設定チェック
      if (!this.config.core_architecture.kernel_runtime) {
        errors.push({
          path: 'core_architecture.kernel_runtime',
          message: 'Kernel runtime configuration is required',
          value: undefined,
        });
      } else {
        const kernelRuntime = this.config.core_architecture.kernel_runtime;
        if (!kernelRuntime.default_registry_path) {
          errors.push({
            path: 'core_architecture.kernel_runtime.default_registry_path',
            message: 'Default registry path is required',
            value: undefined,
          });
        }
        if (!kernelRuntime.default_ledger_path) {
          errors.push({
            path: 'core_architecture.kernel_runtime.default_ledger_path',
            message: 'Default ledger path is required',
            value: undefined,
          });
        }
      }

      // AL0 Gate チェック
      if (!this.config.core_architecture.al0_gate) {
        errors.push({
          path: 'core_architecture.al0_gate',
          message: 'AL0 gate configuration is required',
          value: undefined,
        });
      }
    }

    // 環境キー整合チェック（auto_deployment.environments）
    const autoDeployment = this.get<any>('human_ai_boundary.auto_deployment');
    if (autoDeployment && autoDeployment.environments) {
      const validEnvironments = ['dev', 'staging', 'production'];
      const envKeys = Object.keys(autoDeployment.environments);

      for (const key of envKeys) {
        if (!validEnvironments.includes(key)) {
          errors.push({
            path: `human_ai_boundary.auto_deployment.environments.${key}`,
            message: `Invalid environment key: ${key}. Valid keys are: ${validEnvironments.join(', ')}`,
            value: key,
          });
        }
      }

      // 必須環境キーの存在チェック
      for (const env of validEnvironments) {
        if (!autoDeployment.environments[env]) {
          errors.push({
            path: `human_ai_boundary.auto_deployment.environments.${env}`,
            message: `Environment configuration for ${env} is required`,
            value: undefined,
          });
        }
      }
    }

    // organization_rules の必須項目チェック
    if (!this.config.organization_rules) {
      errors.push({
        path: 'organization_rules',
        message: 'Organization rules configuration is required',
        value: undefined,
      });
    } else {
      if (!this.config.organization_rules.max_issue_complexity) {
        errors.push({
          path: 'organization_rules.max_issue_complexity',
          message: 'Max issue complexity is required',
          value: undefined,
        });
      }
      if (!this.config.organization_rules.branch_strategy) {
        errors.push({
          path: 'organization_rules.branch_strategy',
          message: 'Branch strategy configuration is required',
          value: undefined,
        });
      }
    }

    // individual_preferences の必須項目チェック
    if (!this.config.individual_preferences) {
      errors.push({
        path: 'individual_preferences',
        message: 'Individual preferences configuration is required',
        value: undefined,
      });
    } else {
      if (this.config.individual_preferences.notification_level === undefined) {
        errors.push({
          path: 'individual_preferences.notification_level',
          message: 'Notification level is required',
          value: undefined,
        });
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * 変更履歴を取得
   */
  getChangeHistory(): ChangeHistoryEntry[] {
    if (!this.config) {
      return [];
    }
    return this.config.change_history || [];
  }

  /**
   * 変更履歴を追加
   */
  private addChangeHistory(entry: ChangeHistoryEntry): void {
    if (!this.config) {
      return;
    }
    if (!this.config.change_history) {
      this.config.change_history = [];
    }
    this.config.change_history.push(entry);
  }

  /**
   * 環境変数から値を取得（後方互換性）
   */
  private getFromEnv(path: string): any {
    // パスから環境変数名へのマッピング
    const envMapping: Record<string, string> = {
      'human_ai_boundary.dest_judgment.enabled': 'ENABLE_DEST_JUDGMENT',
      'human_ai_boundary.planning_layer.enabled': 'ENABLE_PLANNING_LAYER',
      'human_ai_boundary.kernel_generation.enabled': 'ENABLE_SSOT_LAYER',
      'human_ai_boundary.planning_layer.creps_gates.enabled': 'ENABLE_CREPS_GATES',
      'individual_preferences.dry_run_default': 'DRY_RUN',
      'individual_preferences.verbose_logging': 'VERBOSE',
    };

    const envKey = envMapping[path];
    if (envKey && envKey in env) {
      return (env as any)[envKey];
    }

    return undefined;
  }

  /**
   * デフォルト値を取得
   */
  private getDefault(path: string): any {
    // よく使われるルールのデフォルト値
    const defaults: Record<string, any> = {
      'human_ai_boundary.dest_judgment.enabled': true,
      'human_ai_boundary.planning_layer.enabled': true,
      'human_ai_boundary.kernel_generation.enabled': true,
      'human_ai_boundary.code_generation.quality_threshold': 80,
      'human_ai_boundary.kernel_generation.convergence_monitoring.threshold': 70,
      'organization_rules.max_issue_complexity': 'large',
      'individual_preferences.verbose_logging': true,
      'individual_preferences.dry_run_default': false,
      'individual_preferences.notification_level': 'all',
    };

    return defaults[path];
  }

  /**
   * ルール設定全体を取得
   */
  getConfig(): RulesConfig | null {
    return this.config;
  }

  /**
   * ルール設定がロード済みかチェック
   */
  isLoaded(): boolean {
    return this.config !== null;
  }
}

// シングルトンインスタンス
let instance: RulesConfigService | null = null;
let loadPromise: Promise<void> | null = null;

/**
 * グローバルインスタンスを取得（同期）
 *
 * ⚠️ IMPORTANT: 使用前に必ず ensureRulesConfigLoaded() を await してください
 */
export function getRulesConfig(): RulesConfigService {
  if (!instance) {
    instance = new RulesConfigService();
  }
  return instance;
}

/**
 * ルール設定が確実にロードされていることを保証（非同期）
 *
 * すべてのエージェントのコンストラクタまたは初期化メソッドで呼び出してください
 */
export async function ensureRulesConfigLoaded(): Promise<void> {
  const rulesConfig = getRulesConfig();

  // 既にロード済みの場合は何もしない
  if (rulesConfig.isLoaded()) {
    return;
  }

  // ロード中の場合は既存のPromiseを待つ（複数同時呼び出し対策）
  if (loadPromise) {
    return loadPromise;
  }

  // ロードを開始
  loadPromise = rulesConfig.load().catch(error => {
    console.error('❌ Failed to load rules-config.yaml:', error);
    throw error;
  }).finally(() => {
    loadPromise = null;
  });

  return loadPromise;
}
