/**
 * Kernel Graph Validator - Phase B1実装
 *
 * グラフ制約の検証とトレーサビリティチェック
 */

import {
  KernelGraph,
  GraphNode,
  GraphConstraints,
  GraphValidationResult,
  DEFAULT_GRAPH_CONSTRAINTS,
  NodeType,
  EdgeType,
  TraceabilityMatrixEntry,
} from '../types/kernel-graph.js';

/**
 * Kernel Graph Validator
 */
export class KernelGraphValidator {
  private constraints: GraphConstraints;

  constructor(constraints?: GraphConstraints) {
    this.constraints = constraints || DEFAULT_GRAPH_CONSTRAINTS;
  }

  /**
   * グラフを検証
   */
  validate(graph: KernelGraph): GraphValidationResult {
    const errors: GraphValidationResult['errors'] = [];
    const warnings: GraphValidationResult['warnings'] = [];

    // 1. 孤立ノードのチェック
    if (this.constraints.no_orphans) {
      const orphans = this.findOrphanNodes(graph);
      for (const orphan of orphans) {
        errors.push({
          type: 'orphan_node',
          message: `Orphan node detected: ${orphan.id} (${orphan.type})`,
          node_id: orphan.id,
        });
      }
    }

    // 2. サイクルのチェック
    if (this.constraints.acyclic) {
      const cycles = this.detectCycles(graph);
      for (const cycle of cycles) {
        errors.push({
          type: 'cycle_detected',
          message: `Cycle detected: ${cycle.join(' → ')}`,
          details: { cycle },
        });
      }
    }

    // 3. 必須エッジのチェック
    for (const constraint of this.constraints.required_edges) {
      const violations = this.checkRequiredEdges(graph, constraint);
      errors.push(...violations);
    }

    // 4. 禁止エッジのチェック
    for (const constraint of this.constraints.forbidden_edges) {
      const violations = this.checkForbiddenEdges(graph, constraint);
      errors.push(...violations);
    }

    // 5. エッジの妥当性チェック
    for (const edge of graph.edges) {
      const fromNode = graph.nodes.find(n => n.id === edge.from);
      const toNode = graph.nodes.find(n => n.id === edge.to);

      if (!fromNode) {
        errors.push({
          type: 'missing_node',
          message: `Edge references missing source node: ${edge.from}`,
          edge_id: edge.id,
        });
      }

      if (!toNode) {
        errors.push({
          type: 'missing_node',
          message: `Edge references missing target node: ${edge.to}`,
          edge_id: edge.id,
        });
      }
    }

    // 6. 統計情報の生成
    const statistics = this.generateStatistics(graph);

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      statistics,
    };
  }

  /**
   * 孤立ノードを検出
   */
  private findOrphanNodes(graph: KernelGraph): GraphNode[] {
    const orphans: GraphNode[] = [];

    for (const node of graph.nodes) {
      // Kernel ノードは孤立を許可
      if (node.type === 'Kernel') continue;

      // このノードに接続するエッジがあるか確認
      const hasIncomingEdge = graph.edges.some(e => e.to === node.id);
      const hasOutgoingEdge = graph.edges.some(e => e.from === node.id);

      if (!hasIncomingEdge && !hasOutgoingEdge) {
        orphans.push(node);
      }
    }

    return orphans;
  }

  /**
   * サイクルを検出（DFSベース）
   */
  private detectCycles(graph: KernelGraph): string[][] {
    const cycles: string[][] = [];
    const visited = new Set<string>();
    const stack = new Set<string>();

    const dfs = (nodeId: string, path: string[]) => {
      if (stack.has(nodeId)) {
        // サイクル検出
        const cycleStart = path.indexOf(nodeId);
        if (cycleStart !== -1) {
          cycles.push([...path.slice(cycleStart), nodeId]);
        }
        return;
      }

      if (visited.has(nodeId)) return;

      visited.add(nodeId);
      stack.add(nodeId);

      // 隣接ノードを探索
      const outgoingEdges = graph.edges.filter(e => e.from === nodeId);
      for (const edge of outgoingEdges) {
        dfs(edge.to, [...path, nodeId]);
      }

      stack.delete(nodeId);
    };

    for (const node of graph.nodes) {
      if (!visited.has(node.id)) {
        dfs(node.id, []);
      }
    }

    return cycles;
  }

  /**
   * 必須エッジの制約をチェック
   */
  private checkRequiredEdges(
    graph: KernelGraph,
    constraint: GraphConstraints['required_edges'][0]
  ): GraphValidationResult['errors'] {
    const errors: GraphValidationResult['errors'] = [];

    const sourceNodes = graph.nodes.filter(n => n.type === constraint.from_type);

    for (const sourceNode of sourceNodes) {
      const outgoingEdges = graph.edges.filter(
        e => e.from === sourceNode.id && e.type === constraint.edge_type
      );

      const targetNodes = outgoingEdges
        .map(e => graph.nodes.find(n => n.id === e.to))
        .filter(n => n && n.type === constraint.to_type);

      // Cardinality チェック
      const count = targetNodes.length;

      if (constraint.cardinality === '1' && count !== 1) {
        errors.push({
          type: 'constraint_violation',
          message: `Node ${sourceNode.id} (${sourceNode.type}) requires exactly 1 ${constraint.edge_type} edge to ${constraint.to_type}, but has ${count}`,
          node_id: sourceNode.id,
          details: { constraint, actual_count: count },
        });
      } else if (constraint.cardinality === '1..*' && count < 1) {
        errors.push({
          type: 'constraint_violation',
          message: `Node ${sourceNode.id} (${sourceNode.type}) requires at least 1 ${constraint.edge_type} edge to ${constraint.to_type}, but has ${count}`,
          node_id: sourceNode.id,
          details: { constraint, actual_count: count },
        });
      } else if (constraint.cardinality === '0..1' && count > 1) {
        errors.push({
          type: 'constraint_violation',
          message: `Node ${sourceNode.id} (${sourceNode.type}) allows at most 1 ${constraint.edge_type} edge to ${constraint.to_type}, but has ${count}`,
          node_id: sourceNode.id,
          details: { constraint, actual_count: count },
        });
      }
    }

    return errors;
  }

  /**
   * 禁止エッジの制約をチェック
   */
  private checkForbiddenEdges(
    graph: KernelGraph,
    constraint: GraphConstraints['forbidden_edges'][0]
  ): GraphValidationResult['errors'] {
    const errors: GraphValidationResult['errors'] = [];

    for (const edge of graph.edges) {
      const fromNode = graph.nodes.find(n => n.id === edge.from);
      const toNode = graph.nodes.find(n => n.id === edge.to);

      if (
        fromNode?.type === constraint.from_type &&
        toNode?.type === constraint.to_type &&
        edge.type === constraint.edge_type
      ) {
        errors.push({
          type: 'constraint_violation',
          message: `Forbidden edge detected: ${fromNode.type} -[${edge.type}]-> ${toNode.type}`,
          edge_id: edge.id,
          details: { constraint },
        });
      }
    }

    return errors;
  }

  /**
   * 統計情報を生成
   */
  private generateStatistics(graph: KernelGraph): GraphValidationResult['statistics'] {
    const nodesByType: Record<NodeType, number> = {
      Kernel: 0,
      Decision: 0,
      Need: 0,
      Requirement: 0,
      Verification: 0,
      Validation: 0,
      Evidence: 0,
      Exception: 0,
      Task: 0,
      Artifact: 0,
    };

    const edgesByType: Record<EdgeType, number> = {
      derived_from: 0,
      satisfies: 0,
      verifies: 0,
      validates: 0,
      references: 0,
      blocked_by: 0,
      depends_on: 0,
      traces_to: 0,
    };

    for (const node of graph.nodes) {
      nodesByType[node.type]++;
    }

    for (const edge of graph.edges) {
      edgesByType[edge.type]++;
    }

    const orphanNodes = this.findOrphanNodes(graph).length;
    const cycles = this.detectCycles(graph).length;

    return {
      total_nodes: graph.nodes.length,
      total_edges: graph.edges.length,
      nodes_by_type: nodesByType,
      edges_by_type: edgesByType,
      orphan_nodes: orphanNodes,
      cycles,
    };
  }

  /**
   * トレーサビリティマトリクスを生成
   */
  generateTraceabilityMatrix(graph: KernelGraph): TraceabilityMatrixEntry[] {
    const matrix: TraceabilityMatrixEntry[] = [];

    // すべてのノードペアについて、パスが存在するかチェック
    for (const sourceNode of graph.nodes) {
      for (const targetNode of graph.nodes) {
        if (sourceNode.id === targetNode.id) continue;

        const path = this.findPath(graph, sourceNode.id, targetNode.id);
        if (path) {
          // パスが見つかった場合、最初のエッジのタイプをrelationshipとして使用
          const firstEdge = graph.edges.find(
            e => e.from === path[0] && e.to === path[1]
          );

          matrix.push({
            source_id: sourceNode.id,
            source_type: sourceNode.type,
            target_id: targetNode.id,
            target_type: targetNode.type,
            relationship: firstEdge?.type || 'traces_to',
            path_length: path.length - 1,
            intermediate_nodes: path.slice(1, -1),
          });
        }
      }
    }

    return matrix;
  }

  /**
   * 最短パスを検索（BFS）
   */
  private findPath(
    graph: KernelGraph,
    startId: string,
    endId: string
  ): string[] | null {
    const queue: Array<{ nodeId: string; path: string[] }> = [
      { nodeId: startId, path: [startId] },
    ];
    const visited = new Set<string>([startId]);

    while (queue.length > 0) {
      const { nodeId, path } = queue.shift()!;

      if (nodeId === endId) {
        return path;
      }

      const outgoingEdges = graph.edges.filter(e => e.from === nodeId);
      for (const edge of outgoingEdges) {
        if (!visited.has(edge.to)) {
          visited.add(edge.to);
          queue.push({
            nodeId: edge.to,
            path: [...path, edge.to],
          });
        }
      }
    }

    return null;
  }
}
