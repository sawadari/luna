/**
 * Gate Types - Gate Control (G2-G6)
 *
 * CrePS の Box 間遷移を管理する Gate。
 * G2→G3→G4→G5→G6 の順に通過しないと次へ進めない。
 */

/**
 * Gate ID
 */
export type GateId = 'G2' | 'G3' | 'G4' | 'G5' | 'G6';

/**
 * Gate ステータス
 */
export type GateStatus = 'pending' | 'passed' | 'failed' | 'skipped';

/**
 * CrePS Box
 */
export type CrePSBox = 'B1' | 'B2' | 'B3' | 'B4' | 'B5' | 'B6';

/**
 * Gate チェック項目
 */
export interface GateCheck {
  /** チェック ID */
  id: string;

  /** チェック項目の説明 */
  description: string;

  /** 必須チェックか（true: Must, false: Should） */
  required: boolean;

  /** チェック関数 */
  checkFunction?: (context: any) => Promise<boolean>;
}

/**
 * Gate チェック結果
 */
export interface GateCheckResult {
  /** チェック ID */
  checkId: string;

  /** 合格したか */
  passed: boolean;

  /** メッセージ */
  message: string;

  /** チェック日時 */
  checkedAt: string;
}

/**
 * Gate 例外（スキップ承認）
 */
export interface GateExemption {
  /** 理由 */
  reason: string;

  /** 承認者 */
  approvedBy: string;

  /** 承認日時 */
  approvedAt: string;

  /** 期限（任意） */
  expiresAt?: string;

  /** 紐づく Exception ID */
  linkedExceptionId?: string;
}

/**
 * Gate 結果
 */
export interface GateResult {
  /** Gate ID */
  gateId: GateId;

  /** ステータス */
  status: GateStatus;

  /** チェック日時 */
  checkedAt: string;

  /** チェック実行者 */
  checkedBy: string;

  /** チェック結果リスト */
  checkResults: GateCheckResult[];

  /** 例外（スキップの場合） */
  exemption?: GateExemption;

  /** Issue番号 */
  issueNumber?: number;

  /** 備考 */
  notes?: string;
}

/**
 * Gate 定義
 */
export interface GateDefinition {
  /** Gate ID */
  id: GateId;

  /** Gate 名 */
  name: string;

  /** 説明 */
  description: string;

  /** 遷移元 Box */
  fromBox: CrePSBox;

  /** 遷移先 Box */
  toBox: CrePSBox;

  /** チェック項目リスト */
  checks: GateCheck[];
}

/**
 * Gate レジストリ
 */
export interface GateRegistry {
  /** Gate 結果リスト */
  gateResults: GateResult[];

  /** バージョン */
  version: string;

  /** 最終更新日時 */
  lastUpdated: string;
}

/**
 * Gate 統計
 */
export interface GateStats {
  /** 全 Gate チェック数 */
  totalChecks: number;

  /** ステータス別集計 */
  byStatus: Record<GateStatus, number>;

  /** Gate 別集計 */
  byGate: Record<GateId, number>;

  /** 合格率 */
  passRate: number;

  /** スキップされた Gate 数 */
  skippedCount: number;

  /** スキップされた Gate ID リスト */
  skippedGateIds: string[];
}
