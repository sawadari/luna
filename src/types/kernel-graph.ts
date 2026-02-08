/**
 * Kernel Graph Types - Phase B1実装
 *
 * 型付き知識グラフによるNRVV構造の強制
 * 永続化はYAMLのまま、内部表現としてグラフを使用
 */

/**
 * Node Type - グラフノードの種別
 */
export type NodeType =
  | 'Kernel'
  | 'Decision'
  | 'Need'
  | 'Requirement'
  | 'Verification'
  | 'Validation'
  | 'Evidence'
  | 'Exception'
  | 'Task'
  | 'Artifact';

/**
 * Edge Type - グラフエッジの種別
 */
export type EdgeType =
  | 'derived_from'     // Decision → NRVV
  | 'satisfies'        // Requirement → Need
  | 'verifies'         // Verification → Requirement
  | 'validates'        // Validation → Need
  | 'references'       // Artifact → Kernel
  | 'blocked_by'       // Kernel → Exception
  | 'depends_on'       // Kernel → Kernel
  | 'traces_to';       // 一般的なトレーサビリティ

/**
 * Graph Node - グラフノード
 */
export interface GraphNode {
  /** ノードID */
  id: string;

  /** ノード種別 */
  type: NodeType;

  /** ノードデータ（元のオブジェクト） */
  data: any;

  /** メタデータ */
  metadata?: {
    created_at?: string;
    updated_at?: string;
    owner?: string;
    tags?: string[];
  };
}

/**
 * Graph Edge - グラフエッジ
 */
export interface GraphEdge {
  /** エッジID */
  id: string;

  /** エッジ種別 */
  type: EdgeType;

  /** 始点ノードID */
  from: string;

  /** 終点ノードID */
  to: string;

  /** エッジの重み（オプション） */
  weight?: number;

  /** メタデータ */
  metadata?: {
    created_at?: string;
    rationale?: string;
    automated?: boolean; // 自動生成されたエッジか
  };
}

/**
 * Kernel Graph - Kernel知識グラフ
 */
export interface KernelGraph {
  /** グラフID（通常はKernel ID） */
  graph_id: string;

  /** ノード配列 */
  nodes: GraphNode[];

  /** エッジ配列 */
  edges: GraphEdge[];

  /** メタデータ */
  metadata?: {
    version: string;
    created_at: string;
    updated_at: string;
    description?: string;
  };
}

/**
 * Graph Validation Result - グラフ検証結果
 */
export interface GraphValidationResult {
  /** 検証成功フラグ */
  valid: boolean;

  /** エラー一覧 */
  errors: Array<{
    type: 'orphan_node' | 'cycle_detected' | 'invalid_edge' | 'missing_node' | 'constraint_violation';
    message: string;
    node_id?: string;
    edge_id?: string;
    details?: any;
  }>;

  /** 警告一覧 */
  warnings: Array<{
    type: 'weak_traceability' | 'missing_edge' | 'suggestion';
    message: string;
    node_id?: string;
    details?: any;
  }>;

  /** 統計情報 */
  statistics?: {
    total_nodes: number;
    total_edges: number;
    nodes_by_type: Record<NodeType, number>;
    edges_by_type: Record<EdgeType, number>;
    orphan_nodes: number;
    cycles: number;
  };
}

/**
 * Graph Query Result - グラフクエリ結果
 */
export interface GraphQueryResult {
  /** マッチしたノード */
  nodes: GraphNode[];

  /** マッチしたエッジ */
  edges: GraphEdge[];

  /** パス（経路）情報 */
  paths?: Array<{
    from: string;
    to: string;
    path: string[];
    length: number;
  }>;
}

/**
 * Traceability Matrix Entry - トレーサビリティマトリクスエントリ
 */
export interface TraceabilityMatrixEntry {
  source_id: string;
  source_type: NodeType;
  target_id: string;
  target_type: NodeType;
  relationship: EdgeType;
  path_length: number;
  intermediate_nodes?: string[];
}

/**
 * Graph Constraints - グラフ制約
 */
export interface GraphConstraints {
  /** 必須エッジ制約 */
  required_edges: Array<{
    from_type: NodeType;
    to_type: NodeType;
    edge_type: EdgeType;
    cardinality: '1' | '1..*' | '0..1' | '0..*';
  }>;

  /** 禁止エッジ制約 */
  forbidden_edges: Array<{
    from_type: NodeType;
    to_type: NodeType;
    edge_type: EdgeType;
  }>;

  /** サイクル禁止 */
  acyclic: boolean;

  /** 孤立ノード禁止 */
  no_orphans: boolean;
}

/**
 * Default Graph Constraints - デフォルトグラフ制約（Phase B1最小制約）
 */
export const DEFAULT_GRAPH_CONSTRAINTS: GraphConstraints = {
  required_edges: [
    // Requirement は必ず Need に接続される
    {
      from_type: 'Requirement',
      to_type: 'Need',
      edge_type: 'satisfies',
      cardinality: '1..*',
    },
    // Verification は必ず Requirement に接続される
    {
      from_type: 'Verification',
      to_type: 'Requirement',
      edge_type: 'verifies',
      cardinality: '1..*',
    },
    // Validation は必ず Need に接続される
    {
      from_type: 'Validation',
      to_type: 'Need',
      edge_type: 'validates',
      cardinality: '1..*',
    },
  ],
  forbidden_edges: [
    // Decision から Evidence への直接リンクは禁止（必ず Kernel 経由）
    {
      from_type: 'Decision',
      to_type: 'Evidence',
      edge_type: 'references',
    },
  ],
  acyclic: true, // サイクル禁止
  no_orphans: true, // 孤立ノード禁止
};
