/**
 * Gate Definitions - G2 to G6
 *
 * CrePS の Box 間遷移を管理する 5 つの Gate。
 */

import { GateDefinition } from '../types/gate';

/**
 * G2: Problem Definition Gate
 *
 * B1 (Problem Recognition) → B2 (Understanding)
 */
const G2_PROBLEM_DEFINITION: GateDefinition = {
  id: 'G2',
  name: 'Problem Definition Gate',
  description: 'Problem が明確に定義されているか確認',
  fromBox: 'B1',
  toBox: 'B2',
  checks: [
    {
      id: 'G2-1',
      description: 'Opportunity が定義されている',
      required: true,
    },
    {
      id: 'G2-2',
      description: 'Problem statement が記述されている',
      required: true,
    },
    {
      id: 'G2-3',
      description: 'Outcome/Safety が DEST の outcome_ok/safety_ok へ写像されている',
      required: true,
    },
    {
      id: 'G2-4',
      description: 'Stakeholder が特定されている',
      required: false,
    },
  ],
};

/**
 * G3: Understanding & Hypotheses Gate
 *
 * B2 (Understanding) → B3 (Ideation)
 */
const G3_UNDERSTANDING_HYPOTHESES: GateDefinition = {
  id: 'G3',
  name: 'Understanding & Hypotheses Gate',
  description: 'システム理解と仮説が十分か確認',
  fromBox: 'B2',
  toBox: 'B3',
  checks: [
    {
      id: 'G3-1',
      description: 'stock/flow/delay/feedback/decision-info の5点セットが最低1つある',
      required: true,
    },
    {
      id: 'G3-2',
      description: 'システムダイナミクスが記述されている',
      required: false,
    },
    {
      id: 'G3-3',
      description: '仮説（Hypotheses）が検証可能な形で記述されている',
      required: true,
    },
    {
      id: 'G3-4',
      description: '制約条件（Constraints）が明示されている',
      required: false,
    },
  ],
};

/**
 * G4: Idea Traceability Gate
 *
 * B3 (Ideation) → B4 (Planning/Concept)
 */
const G4_IDEA_TRACEABILITY: GateDefinition = {
  id: 'G4',
  name: 'Idea Traceability Gate',
  description: 'アイデアのトレーサビリティと LP 分析が完了しているか確認',
  fromBox: 'B3',
  toBox: 'B4',
  checks: [
    {
      id: 'G4-1',
      description: '各アイデアに lp_level_id（12..1）が付与されている',
      required: true,
    },
    {
      id: 'G4-2',
      description: 'Decision Record が作成されている',
      required: true,
    },
    {
      id: 'G4-3',
      description: 'Option Set が評価されている',
      required: true,
    },
    {
      id: 'G4-4',
      description: 'Value Model による評価が行われている',
      required: false,
    },
  ],
};

/**
 * G5: Concept Feasibility Gate
 *
 * B4 (Planning/Concept) → B5 (Implementation)
 */
const G5_CONCEPT_FEASIBILITY: GateDefinition = {
  id: 'G5',
  name: 'Concept Feasibility Gate',
  description: 'コンセプトの実現可能性が確認されているか',
  fromBox: 'B4',
  toBox: 'B5',
  checks: [
    {
      id: 'G5-1',
      description: 'Wait/Freeze/Revise の運用姿勢が仕様化されている',
      required: true,
    },
    {
      id: 'G5-2',
      description: 'Kernel が SSOT に登録されている',
      required: true,
    },
    {
      id: 'G5-3',
      description: 'NRVV トレーサビリティが完成している',
      required: true,
    },
    {
      id: 'G5-4',
      description: 'テスト計画が作成されている',
      required: false,
    },
  ],
};

/**
 * G6: Field Validity Gate
 *
 * B5 (Implementation) → B6 (Field Test)
 */
const G6_FIELD_VALIDITY: GateDefinition = {
  id: 'G6',
  name: 'Field Validity Gate',
  description: '実装が現場で有効か確認',
  fromBox: 'B5',
  toBox: 'B6',
  checks: [
    {
      id: 'G6-1',
      description: 'AL判定ログ（assurance_observation）がある',
      required: true,
    },
    {
      id: 'G6-2',
      description: 'テストが実行され、カバレッジ 80% 以上',
      required: true,
    },
    {
      id: 'G6-3',
      description: 'デプロイが成功している',
      required: true,
    },
    {
      id: 'G6-4',
      description: '監視メトリクスが収集されている',
      required: false,
    },
  ],
};

/**
 * 全ての Gate 定義
 */
export const GATE_DEFINITIONS: GateDefinition[] = [
  G2_PROBLEM_DEFINITION,
  G3_UNDERSTANDING_HYPOTHESES,
  G4_IDEA_TRACEABILITY,
  G5_CONCEPT_FEASIBILITY,
  G6_FIELD_VALIDITY,
];

/**
 * Gate ID から Gate 定義を取得
 */
export function getGateDefinition(gateId: string): GateDefinition | undefined {
  return GATE_DEFINITIONS.find((gate) => gate.id === gateId);
}

/**
 * Gate の順序を取得
 */
export function getGateSequence(): string[] {
  return ['G2', 'G3', 'G4', 'G5', 'G6'];
}

/**
 * 次の Gate を取得
 */
export function getNextGate(currentGateId: string): string | undefined {
  const sequence = getGateSequence();
  const currentIndex = sequence.indexOf(currentGateId);
  if (currentIndex === -1 || currentIndex === sequence.length - 1) {
    return undefined;
  }
  return sequence[currentIndex + 1];
}

/**
 * 前の Gate を取得
 */
export function getPreviousGate(currentGateId: string): string | undefined {
  const sequence = getGateSequence();
  const currentIndex = sequence.indexOf(currentGateId);
  if (currentIndex <= 0) {
    return undefined;
  }
  return sequence[currentIndex - 1];
}
