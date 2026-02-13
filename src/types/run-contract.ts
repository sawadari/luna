/**
 * RunContract v1
 *
 * 実行契約: luna:do/luna:run の成功条件を定義
 * feature系は最低条件を満たさない限り成功にしない
 */

/**
 * 実行タイプ
 */
export type ExecutionType =
  | 'feature' // 新機能追加
  | 'bug' // バグ修正
  | 'enhancement' // 既存機能改善
  | 'refactor' // リファクタリング
  | 'docs' // ドキュメント更新
  | 'test' // テスト追加
  | 'chore'; // その他作業

/**
 * Phase Gate 結果
 */
export interface PhaseGateResult {
  /**
   * Gate通過したか
   */
  passed: boolean;

  /**
   * Phase名
   */
  phaseName: string;

  /**
   * 失敗理由（passed=falseの場合）
   */
  reason?: string;

  /**
   * 不足項目リスト
   */
  missingItems?: string[];
}

/**
 * 知識メトリクス
 */
export interface KnowledgeMetrics {
  /**
   * 読み込まれたKernel数
   */
  kernels_loaded: number;

  /**
   * 参照されたKernel数（コード生成で実際に使用）
   */
  kernels_referenced: number;

  /**
   * 新規作成されたKernel数
   */
  kernels_created: number;

  /**
   * 更新されたKernel数
   */
  kernels_updated: number;

  /**
   * エビデンスリンク数
   */
  evidence_linked: number;

  /**
   * 知識再利用率 (0.0 - 1.0)
   * = kernels_referenced / max(kernels_loaded, 1)
   */
  reuse_rate: number;

  /**
   * 収束度 (0.0 - 1.0)
   * 既存知識が活用されているほど高い
   */
  convergence_delta: number;
}

/**
 * 実行契約
 */
export interface RunContract {
  /**
   * 実行タイプ
   */
  execution_type: ExecutionType;

  /**
   * 生成されたファイル数
   */
  generated_files: number;

  /**
   * Kernel更新数（created + updated）
   */
  kernel_updates: number;

  /**
   * 知識メトリクス
   */
  knowledge_metrics: KnowledgeMetrics;

  /**
   * 契約違反の理由（成功条件を満たさない場合）
   */
  violation_reasons: string[];

  /**
   * Phase Gate 結果
   */
  gate_results: PhaseGateResult[];
}

/**
 * 実行契約の成功条件
 */
export interface RunContractRequirements {
  /**
   * 最低生成ファイル数
   * feature/enhancement: 1以上必須
   * bug: 1以上推奨（設定変更のみの場合は0も許容）
   * docs/test/chore: 0も許容
   */
  min_generated_files: number;

  /**
   * 最低Kernel更新数
   * feature/enhancement: 1以上必須
   * bug: 0も許容（既存Kernelの参照のみでも可）
   * docs/test/chore: 0も許容
   */
  min_kernel_updates: number;

  /**
   * 知識再利用が必須か
   * feature/enhancement: true（例外時は理由必須）
   * bug: false（新規知識なしでも可）
   * docs/test/chore: false
   */
  requires_knowledge_reuse: boolean;

  /**
   * 知識再利用の例外理由（requires_knowledge_reuse=trueで reuse_rate=0の場合）
   */
  knowledge_reuse_exception_reason?: string;
}

/**
 * 実行タイプごとの契約要件
 */
export const RUN_CONTRACT_REQUIREMENTS: Record<
  ExecutionType,
  RunContractRequirements
> = {
  feature: {
    min_generated_files: 1,
    min_kernel_updates: 1,
    requires_knowledge_reuse: true,
  },
  enhancement: {
    min_generated_files: 1,
    min_kernel_updates: 1,
    requires_knowledge_reuse: true,
  },
  bug: {
    min_generated_files: 0, // 設定変更のみの修正も許容
    min_kernel_updates: 0, // 既存知識の参照のみでも可
    requires_knowledge_reuse: false,
  },
  refactor: {
    min_generated_files: 1,
    min_kernel_updates: 0, // Kernel更新なしでも可
    requires_knowledge_reuse: false,
  },
  docs: {
    min_generated_files: 0,
    min_kernel_updates: 0,
    requires_knowledge_reuse: false,
  },
  test: {
    min_generated_files: 0,
    min_kernel_updates: 0,
    requires_knowledge_reuse: false,
  },
  chore: {
    min_generated_files: 0,
    min_kernel_updates: 0,
    requires_knowledge_reuse: false,
  },
};

/**
 * 実行契約を検証
 */
export function validateRunContract(
  contract: RunContract
): { valid: boolean; violations: string[] } {
  const requirements = RUN_CONTRACT_REQUIREMENTS[contract.execution_type];
  const violations: string[] = [];

  // 最低生成ファイル数チェック
  if (contract.generated_files < requirements.min_generated_files) {
    violations.push(
      `Generated files (${contract.generated_files}) below minimum (${requirements.min_generated_files}) for ${contract.execution_type}`
    );
  }

  // 最低Kernel更新数チェック
  if (contract.kernel_updates < requirements.min_kernel_updates) {
    violations.push(
      `Kernel updates (${contract.kernel_updates}) below minimum (${requirements.min_kernel_updates}) for ${contract.execution_type}`
    );
  }

  // 知識再利用チェック
  if (requirements.requires_knowledge_reuse) {
    // P0 Fix: kernels_loaded === 0 の初回実行は免除
    const hasKernelsAvailable = contract.knowledge_metrics.kernels_loaded > 0;
    if (
      hasKernelsAvailable &&
      contract.knowledge_metrics.reuse_rate === 0 &&
      !requirements.knowledge_reuse_exception_reason
    ) {
      violations.push(
        `Knowledge reuse required for ${contract.execution_type} but reuse_rate is 0 (no exception reason provided). ` +
        `${contract.knowledge_metrics.kernels_loaded} kernels were loaded but none were referenced.`
      );
    }
  }

  // Phase Gate チェック
  const failedGates = contract.gate_results.filter((g) => !g.passed);
  if (failedGates.length > 0) {
    failedGates.forEach((gate) => {
      violations.push(
        `Phase Gate failed: ${gate.phaseName} - ${gate.reason}`
      );
      if (gate.missingItems && gate.missingItems.length > 0) {
        violations.push(`  Missing: ${gate.missingItems.join(', ')}`);
      }
    });
  }

  return {
    valid: violations.length === 0,
    violations,
  };
}

/**
 * 知識メトリクスを計算
 */
export function calculateKnowledgeMetrics(
  kernelsLoaded: number,
  kernelsReferenced: number,
  kernelsCreated: number,
  kernelsUpdated: number,
  evidenceLinked: number
): KnowledgeMetrics {
  const reuse_rate =
    kernelsLoaded > 0 ? kernelsReferenced / kernelsLoaded : 0;

  // 収束度: 既存知識を多く使い、新規作成が少ないほど高い
  // = (referenced + updated) / max(loaded + created, 1)
  const convergence_delta =
    kernelsLoaded + kernelsCreated > 0
      ? (kernelsReferenced + kernelsUpdated) /
        (kernelsLoaded + kernelsCreated)
      : 0;

  return {
    kernels_loaded: kernelsLoaded,
    kernels_referenced: kernelsReferenced,
    kernels_created: kernelsCreated,
    kernels_updated: kernelsUpdated,
    evidence_linked: evidenceLinked,
    reuse_rate: Math.min(reuse_rate, 1.0),
    convergence_delta: Math.min(convergence_delta, 1.0),
  };
}

/**
 * 実行契約を作成
 */
export function createRunContract(
  executionType: ExecutionType,
  generatedFiles: number,
  kernelUpdates: number,
  knowledgeMetrics: KnowledgeMetrics,
  gateResults: PhaseGateResult[]
): RunContract {
  const contract: RunContract = {
    execution_type: executionType,
    generated_files: generatedFiles,
    kernel_updates: kernelUpdates,
    knowledge_metrics: knowledgeMetrics,
    violation_reasons: [],
    gate_results: gateResults,
  };

  const validation = validateRunContract(contract);
  if (!validation.valid) {
    contract.violation_reasons = validation.violations;
  }

  return contract;
}
