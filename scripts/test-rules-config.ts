/**
 * Rules Configuration Service テストスクリプト
 *
 * RulesConfigServiceの動作確認
 */

import { RulesConfigService } from '../src/services/rules-config-service.js';
import * as path from 'path';

async function main() {
  console.log('🧪 Rules Configuration Service テスト\n');
  console.log('='.repeat(60));
  console.log();

  let hasFailures = false;

  try {
    // 1. RulesConfigService初期化
    console.log('1. RulesConfigService初期化');
    const configPath = path.join(process.cwd(), 'rules-config.yaml');
    const rulesConfig = new RulesConfigService(configPath);
    console.log(`   ✅ RulesConfigService created with path: ${configPath}`);
    console.log();

    // 2. ルール設定をロード
    console.log('2. ルール設定をロード');
    await rulesConfig.load();
    console.log('   ✅ Rules configuration loaded');
    console.log();

    // 3. バリデーション実行
    console.log('3. バリデーション実行');
    const validation = rulesConfig.validate();
    console.log(`   ${validation.isValid ? '✅' : '❌'} Validation result: ${validation.isValid ? 'VALID' : 'INVALID'}`);

    if (validation.errors.length > 0) {
      console.log(`   ❌ ${validation.errors.length} errors found:`);
      validation.errors.forEach(error => {
        console.log(`      - ${error.path}: ${error.message}`);
      });
      hasFailures = true;
    }

    if (validation.warnings.length > 0) {
      console.log(`   ⚠️  ${validation.warnings.length} warnings:`);
      validation.warnings.forEach(warning => {
        console.log(`      - ${warning.path}: ${warning.message}`);
      });
    }
    console.log();

    // 4. ルール値取得テスト
    console.log('4. ルール値取得テスト');

    const testCases = [
      { path: 'human_ai_boundary.dest_judgment.enabled', expected: 'boolean' },
      { path: 'human_ai_boundary.code_generation.quality_threshold', expected: 'number' },
      { path: 'human_ai_boundary.review_required.min_quality_score', expected: 'number' },
      { path: 'human_ai_boundary.auto_verification.coverage_threshold', expected: 'number' },
      { path: 'organization_rules.max_issue_complexity', expected: 'string' },
      { path: 'individual_preferences.verbose_logging', expected: 'boolean' },
      { path: 'core_architecture.kernel_runtime.default_registry_path', expected: 'string' },
      { path: 'core_architecture.al0_gate.enabled', expected: 'boolean' },
    ];

    for (const testCase of testCases) {
      const value = rulesConfig.get(testCase.path);
      const actualType = typeof value;
      const typeMatch = actualType === testCase.expected;

      console.log(`   ${typeMatch ? '✅' : '❌'} ${testCase.path}`);
      console.log(`      Expected: ${testCase.expected}, Got: ${actualType}, Value: ${JSON.stringify(value)}`);

      if (!typeMatch) {
        hasFailures = true;
      }
    }
    console.log();

    // 5. 変更履歴テスト
    console.log('5. 変更履歴取得テスト');
    const changeHistory = rulesConfig.getChangeHistory();
    console.log(`   ✅ ${changeHistory.length} change history entries found`);

    if (changeHistory.length > 0) {
      console.log(`   Latest changes:`);
      changeHistory.slice(-3).forEach(entry => {
        console.log(`      - ${entry.timestamp}: ${entry.rule} (by ${entry.changed_by})`);
      });
    }
    console.log();

    // 6. ルール設定全体取得テスト
    console.log('6. ルール設定全体取得テスト');
    const config = rulesConfig.getConfig();
    if (config) {
      console.log(`   ✅ Config loaded successfully`);
      console.log(`      - Version: ${config.meta.version}`);
      console.log(`      - Last updated: ${config.meta.last_updated}`);
      console.log(`      - Description: ${config.meta.description}`);
    } else {
      console.log(`   ❌ Config is null`);
      hasFailures = true;
    }
    console.log();

    // 7. フォールバック機能テスト
    console.log('7. フォールバック機能テスト');
    const nonExistentRule = rulesConfig.get('non.existent.rule', { useDefault: true });
    console.log(`   ${nonExistentRule === undefined ? '✅' : '⚠️ '} Non-existent rule with fallback: ${nonExistentRule}`);
    console.log();

    // 8. 各エージェント用ルールの確認
    console.log('8. 各エージェント用ルールの確認');
    const agentRules = [
      { agent: 'DESTAgent', path: 'human_ai_boundary.dest_judgment.enabled' },
      { agent: 'PlanningAgent', path: 'human_ai_boundary.planning_layer.enabled' },
      { agent: 'CodeGenAgent', path: 'human_ai_boundary.code_generation.enabled' },
      { agent: 'ReviewAgent', path: 'human_ai_boundary.review_required.enabled' },
      { agent: 'TestAgent', path: 'human_ai_boundary.auto_verification.enabled' },
      { agent: 'DeploymentAgent', path: 'human_ai_boundary.auto_deployment.enabled' },
      { agent: 'MonitoringAgent', path: 'human_ai_boundary.continuous_monitoring.enabled' },
    ];

    for (const agentRule of agentRules) {
      const value = rulesConfig.get<boolean>(agentRule.path);
      console.log(`   ${value !== undefined ? '✅' : '❌'} ${agentRule.agent}: ${agentRule.path} = ${value}`);

      if (value === undefined) {
        hasFailures = true;
      }
    }
    console.log();

    // 総合評価
    console.log('='.repeat(60));
    console.log('📊 総合評価');
    console.log('='.repeat(60));
    console.log();

    if (!hasFailures && validation.isValid) {
      console.log('✅ RulesConfigService テスト完了！');
      console.log();
      console.log('📋 実装完了機能:');
      console.log('   ✅ rules-config.yaml読み込み');
      console.log('   ✅ ドット記法でルール取得');
      console.log('   ✅ バリデーション機能');
      console.log('   ✅ 変更履歴管理');
      console.log('   ✅ フォールバック機能');
      console.log();
      console.log('🎉 Issue #40: ルール設定ファイルによる一元管理機能 - Phase 3完了');
      console.log();
      process.exit(0);
    } else {
      console.log('❌ RulesConfigService テスト失敗');
      console.log();
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ テスト失行（例外）:', error);
    process.exit(1);
  }
}

main();
