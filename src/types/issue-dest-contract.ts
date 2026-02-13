/**
 * IssueDestContract v1
 *
 * 機械可読なDEST判定データ契約
 * create-issue-from-intent.ts と dest-agent.ts で共通利用
 */

/**
 * Outcome状態（システムが目標に向かって進捗しているか）
 */
export type OutcomeState = 'ok' | 'regressing' | 'unknown';

/**
 * Safety状態（フィードバックループと安全制約が満たされているか）
 */
export type SafetyState = 'ok' | 'violated' | 'unknown';

/**
 * Trace状態（証拠と反証可能性の状態）
 */
export type TraceState = 'ok' | 'partial' | 'absent' | 'unknown';

/**
 * フィードバックループの状態
 */
export type FeedbackLoops = 'present' | 'absent' | 'harmful';

/**
 * IssueDestContract v1
 *
 * Issueに埋め込まれる機械可読なDEST判定データ
 * YAMLフェンスコードブロックとして本文末尾に配置される
 *
 * @example
 * ```dest
 * outcome_state: ok
 * safety_state: ok
 * trace_state: unknown
 * feedback_loops: present
 * violations: []
 * notes: "This is a simple UI improvement with no safety concerns"
 * ```
 */
export interface IssueDestContract {
  /**
   * Outcome状態
   * - ok: システムは目標に向かって進捗している
   * - regressing: システムが目標から遠ざかっている
   * - unknown: 判定不能（情報不足）
   */
  outcome_state: OutcomeState;

  /**
   * Safety状態
   * - ok: フィードバックループが機能し、安全制約が満たされている
   * - violated: 安全制約違反がある
   * - unknown: 判定不能（情報不足）
   */
  safety_state: SafetyState;

  /**
   * Trace状態（証拠と反証可能性）
   * - ok: 十分な証拠と反証可能性がある
   * - partial: 部分的な証拠のみ
   * - absent: 証拠がない
   * - unknown: 判定不能
   */
  trace_state: TraceState;

  /**
   * フィードバックループの状態
   * - present: フィードバックループが存在し機能している
   * - absent: フィードバックループがない
   * - harmful: 有害なフィードバックループがある
   */
  feedback_loops: FeedbackLoops;

  /**
   * 安全制約違反のリスト
   * 空配列の場合は違反なし
   */
  violations: string[];

  /**
   * 追加のメモや補足情報（任意）
   */
  notes?: string;
}

/**
 * IssueDestContract解析結果
 */
export interface IssueDestParseResult {
  /**
   * 解析されたDESTデータ
   */
  data: IssueDestContract | null;

  /**
   * 解析の信頼度 (0.0 - 1.0)
   * - 1.0: dest blockから厳密に解析
   * - 0.7-0.9: GitHub Form形式から準厳密に解析
   * - 0.3-0.6: 自由文からヒューリスティックに解析
   * - 0.0: 解析失敗
   */
  confidence: number;

  /**
   * 解析に使用したメソッド
   */
  method: 'dest_block' | 'github_form' | 'heuristic' | 'failed';

  /**
   * エラーメッセージ（解析失敗時）
   */
  error?: string;
}

/**
 * destブロックをYAML形式でフォーマット
 */
export function formatDestBlock(contract: IssueDestContract): string {
  const lines: string[] = [
    '```dest',
    `outcome_state: ${contract.outcome_state}`,
    `safety_state: ${contract.safety_state}`,
    `trace_state: ${contract.trace_state}`,
    `feedback_loops: ${contract.feedback_loops}`,
  ];

  if (contract.violations.length > 0) {
    lines.push('violations:');
    contract.violations.forEach((v) => lines.push(`  - ${v}`));
  } else {
    lines.push('violations: []');
  }

  if (contract.notes) {
    lines.push(`notes: "${contract.notes}"`);
  }

  lines.push('```');

  return lines.join('\n');
}

/**
 * AL判定に必要な最小閾値
 */
export const DEST_CONFIDENCE_THRESHOLD = 0.7;

/**
 * IssueDestContractのデフォルト値（情報不足時）
 */
export const DEFAULT_DEST_CONTRACT: IssueDestContract = {
  outcome_state: 'unknown',
  safety_state: 'unknown',
  trace_state: 'unknown',
  feedback_loops: 'absent',
  violations: [],
  notes: 'Auto-generated with insufficient information',
};
