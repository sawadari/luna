/**
 * State Transition Authority - Maturity State Transition Rules
 *
 * 識学理論（Shikigaku Theory）準拠の状態遷移権限設定
 */

import { StateTransitionRule, Responsibility } from '../types/authority';

/**
 * State Transition Rules
 *
 * Maturity State の遷移に必要なロールを定義
 */
export const STATE_TRANSITION_RULES: StateTransitionRule[] = [
  // draft → under_review
  {
    from: 'draft',
    to: 'under_review',
    allowedRoles: ['author', 'ssot_reviewer'],
    description: 'Draft から Under Review へ遷移（作成者またはSSOTレビュアーが実行）',
  },

  // under_review → agreed
  {
    from: 'under_review',
    to: 'agreed',
    allowedRoles: ['ssot_reviewer', 'product_owner'],
    description: 'Under Review から Agreed へ遷移（SSOTレビュアーまたはPOが承認）',
  },

  // under_review → draft (差し戻し)
  {
    from: 'under_review',
    to: 'draft',
    allowedRoles: ['ssot_reviewer', 'product_owner'],
    description: 'Under Review から Draft へ差し戻し（レビュー結果による）',
  },

  // agreed → frozen (Baseline化)
  {
    from: 'agreed',
    to: 'frozen',
    allowedRoles: ['product_owner', 'ssot_reviewer'],
    description: 'Agreed から Frozen へ遷移（Baseline化、POまたはSSOTレビュアーが実行）',
  },

  // frozen → deprecated (廃止)
  {
    from: 'frozen',
    to: 'deprecated',
    allowedRoles: ['product_owner'],
    description: 'Frozen から Deprecated へ遷移（廃止、POのみが実行可能）',
  },

  // * → draft (緊急リセット)
  {
    from: '*',
    to: 'draft',
    allowedRoles: ['product_owner'],
    description: '任意の状態から Draft へリセット（緊急時、POのみが実行可能）',
  },

  // agreed → under_review (再レビュー)
  {
    from: 'agreed',
    to: 'under_review',
    allowedRoles: ['product_owner', 'ssot_reviewer'],
    description: 'Agreed から Under Review へ再レビュー要求（POまたはSSOTレビュアー）',
  },

  // deprecated → draft (復活)
  {
    from: 'deprecated',
    to: 'draft',
    allowedRoles: ['product_owner'],
    description: 'Deprecated から Draft へ復活（POのみが実行可能）',
  },
];

/**
 * Responsibility Model - ロール別の責任
 */
export const RESPONSIBILITY_MODEL: Responsibility[] = [
  {
    role: 'product_owner',
    responsibilities: [
      '価値裁定',
      'Decision承認',
      '例外承認',
      'Baseline化（Frozen遷移）',
      '緊急リセット権限',
      'Kernel廃止決定',
    ],
    description: 'プロダクトの価値と方向性を決定する最終責任者',
  },
  {
    role: 'engineering_lead',
    responsibilities: [
      '技術評価',
      '実装判断',
      'アーキテクチャ決定',
      '技術的トレードオフの判断',
    ],
    description: '技術的な意思決定の責任者',
  },
  {
    role: 'ssot_reviewer',
    responsibilities: [
      '整合性検証',
      '状態遷移承認',
      'トレーサビリティ確認',
      'Kernel品質保証',
      'NRVV検証',
    ],
    description: 'Single Source of Truth の品質を保証する責任者',
  },
  {
    role: 'compliance_owner',
    responsibilities: ['法規評価', '安全性評価', '監査対応', 'コンプライアンス確認'],
    description: '法規制とコンプライアンスの責任者',
  },
  {
    role: 'security_owner',
    responsibilities: ['セキュリティ評価', '脆弱性対応', 'セキュリティポリシー策定'],
    description: 'セキュリティの責任者',
  },
  {
    role: 'author',
    responsibilities: ['コンテンツ作成', 'Draft作成', 'レビュー要求'],
    description: 'Kernel や Decision の作成者',
  },
];

/**
 * Get State Transition Rule
 *
 * @param from - 遷移元の状態
 * @param to - 遷移先の状態
 * @returns StateTransitionRule | undefined
 */
export function getStateTransitionRule(
  from: string,
  to: string
): StateTransitionRule | undefined {
  // 完全一致を優先
  const exactMatch = STATE_TRANSITION_RULES.find(
    (rule) => rule.from === from && rule.to === to
  );
  if (exactMatch) return exactMatch;

  // ワイルドカードマッチ
  const wildcardMatch = STATE_TRANSITION_RULES.find(
    (rule) => rule.from === '*' && rule.to === to
  );
  return wildcardMatch;
}

/**
 * Get All Transition Rules
 */
export function getAllTransitionRules(): StateTransitionRule[] {
  return STATE_TRANSITION_RULES;
}

/**
 * Get Responsibility by Role
 *
 * @param role - ロール
 * @returns Responsibility | undefined
 */
export function getResponsibilityByRole(role: string): Responsibility | undefined {
  return RESPONSIBILITY_MODEL.find((r) => r.role === role);
}

/**
 * Get All Responsibilities
 */
export function getAllResponsibilities(): Responsibility[] {
  return RESPONSIBILITY_MODEL;
}
