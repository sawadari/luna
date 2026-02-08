/**
 * Kernel Graph Converter - Phase B1実装
 *
 * KernelWithNRVV ⇄ KernelGraph の双方向変換
 */

import { KernelWithNRVV } from '../types/nrvv.js';
import {
  KernelGraph,
  GraphNode,
  GraphEdge,
} from '../types/kernel-graph.js';

/**
 * Kernel Graph Converter
 */
export class KernelGraphConverter {
  /**
   * KernelWithNRVV を KernelGraph に変換
   */
  static toGraph(kernel: KernelWithNRVV): KernelGraph {
    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];

    // 1. Kernel ノード
    nodes.push({
      id: kernel.id,
      type: 'Kernel',
      data: {
        statement: kernel.statement,
        category: kernel.category,
        owner: kernel.owner,
        maturity: kernel.maturity,
      },
      metadata: {
        created_at: kernel.createdAt,
        updated_at: kernel.lastUpdatedAt,
        owner: kernel.owner,
        tags: kernel.tags,
      },
    });

    // 2. Decision ノード（存在する場合）
    if (kernel.decision) {
      const decisionId = `${kernel.id}-DECISION-${kernel.decision.decision_id}`;
      nodes.push({
        id: decisionId,
        type: 'Decision',
        data: kernel.decision,
      });

      // Decision → Kernel への derived_from エッジ
      edges.push({
        id: `${decisionId}-derives-${kernel.id}`,
        type: 'derived_from',
        from: decisionId,
        to: kernel.id,
      });
    }

    // 3. Need ノード
    for (const need of kernel.needs) {
      nodes.push({
        id: need.id,
        type: 'Need',
        data: need,
      });

      // Need → Kernel への traces_to エッジ
      edges.push({
        id: `${need.id}-traces-${kernel.id}`,
        type: 'traces_to',
        from: need.id,
        to: kernel.id,
      });

      // Decision → Need への derived_from エッジ（Decision が存在する場合）
      if (kernel.decision) {
        const decisionId = `${kernel.id}-DECISION-${kernel.decision.decision_id}`;
        edges.push({
          id: `${decisionId}-derives-${need.id}`,
          type: 'derived_from',
          from: decisionId,
          to: need.id,
        });
      }
    }

    // 4. Requirement ノード
    for (const req of kernel.requirements) {
      nodes.push({
        id: req.id,
        type: 'Requirement',
        data: req,
      });

      // Requirement → Kernel への traces_to エッジ
      edges.push({
        id: `${req.id}-traces-${kernel.id}`,
        type: 'traces_to',
        from: req.id,
        to: kernel.id,
      });

      // Requirement → Need への satisfies エッジ（upstream traceability）
      if (req.traceability && req.traceability.upstream) {
        for (const upstreamId of req.traceability.upstream) {
          edges.push({
            id: `${req.id}-satisfies-${upstreamId}`,
            type: 'satisfies',
            from: req.id,
            to: upstreamId,
          });
        }
      }

      // Decision → Requirement への derived_from エッジ（Decision が存在する場合）
      if (kernel.decision) {
        const decisionId = `${kernel.id}-DECISION-${kernel.decision.decision_id}`;
        edges.push({
          id: `${decisionId}-derives-${req.id}`,
          type: 'derived_from',
          from: decisionId,
          to: req.id,
        });
      }
    }

    // 5. Verification ノード
    for (const ver of kernel.verification) {
      nodes.push({
        id: ver.id,
        type: 'Verification',
        data: ver,
      });

      // Verification → Kernel への traces_to エッジ
      edges.push({
        id: `${ver.id}-traces-${kernel.id}`,
        type: 'traces_to',
        from: ver.id,
        to: kernel.id,
      });

      // Verification → Requirement への verifies エッジ（upstream traceability）
      if (ver.traceability && ver.traceability.upstream) {
        for (const upstreamId of ver.traceability.upstream) {
          edges.push({
            id: `${ver.id}-verifies-${upstreamId}`,
            type: 'verifies',
            from: ver.id,
            to: upstreamId,
          });
        }
      }

      // Decision → Verification への derived_from エッジ（Decision が存在する場合）
      if (kernel.decision) {
        const decisionId = `${kernel.id}-DECISION-${kernel.decision.decision_id}`;
        edges.push({
          id: `${decisionId}-derives-${ver.id}`,
          type: 'derived_from',
          from: decisionId,
          to: ver.id,
        });
      }
    }

    // 6. Validation ノード
    for (const val of kernel.validation) {
      nodes.push({
        id: val.id,
        type: 'Validation',
        data: val,
      });

      // Validation → Kernel への traces_to エッジ
      edges.push({
        id: `${val.id}-traces-${kernel.id}`,
        type: 'traces_to',
        from: val.id,
        to: kernel.id,
      });

      // Validation → Need への validates エッジ（upstream traceability）
      if (val.traceability && val.traceability.upstream) {
        for (const upstreamId of val.traceability.upstream) {
          edges.push({
            id: `${val.id}-validates-${upstreamId}`,
            type: 'validates',
            from: val.id,
            to: upstreamId,
          });
        }
      }

      // Decision → Validation への derived_from エッジ（Decision が存在する場合）
      if (kernel.decision) {
        const decisionId = `${kernel.id}-DECISION-${kernel.decision.decision_id}`;
        edges.push({
          id: `${decisionId}-derives-${val.id}`,
          type: 'derived_from',
          from: decisionId,
          to: val.id,
        });
      }
    }

    // 7. Evidence ノード（Phase A1拡張）
    if (kernel.evidence) {
      for (const evidence of kernel.evidence) {
        nodes.push({
          id: evidence.id,
          type: 'Evidence',
          data: evidence,
        });

        // Evidence → Kernel への references エッジ
        edges.push({
          id: `${evidence.id}-references-${kernel.id}`,
          type: 'references',
          from: evidence.id,
          to: kernel.id,
        });
      }
    }

    // 8. Exception ノード（Phase A1拡張）
    if (kernel.exceptions) {
      for (const exception of kernel.exceptions) {
        nodes.push({
          id: exception.id,
          type: 'Exception',
          data: exception,
        });

        // Kernel → Exception への blocked_by エッジ（open状態の場合）
        if (exception.status === 'open') {
          edges.push({
            id: `${kernel.id}-blocked-by-${exception.id}`,
            type: 'blocked_by',
            from: kernel.id,
            to: exception.id,
          });
        }
      }
    }

    return {
      graph_id: kernel.id,
      nodes,
      edges,
      metadata: {
        version: '1.0.0',
        created_at: kernel.createdAt,
        updated_at: kernel.lastUpdatedAt,
        description: `Knowledge graph for ${kernel.id}`,
      },
    };
  }

  /**
   * KernelGraph を KernelWithNRVV に変換（逆変換）
   *
   * Note: グラフ表現から完全なKernelを復元するのは困難なため、
   * 基本的な構造のみ復元する（簡易実装）
   */
  static fromGraph(graph: KernelGraph): Partial<KernelWithNRVV> {
    const kernelNode = graph.nodes.find(n => n.type === 'Kernel');
    if (!kernelNode) {
      throw new Error('Kernel node not found in graph');
    }

    const needs = graph.nodes
      .filter(n => n.type === 'Need')
      .map(n => n.data);

    const requirements = graph.nodes
      .filter(n => n.type === 'Requirement')
      .map(n => n.data);

    const verification = graph.nodes
      .filter(n => n.type === 'Verification')
      .map(n => n.data);

    const validation = graph.nodes
      .filter(n => n.type === 'Validation')
      .map(n => n.data);

    const decisionNode = graph.nodes.find(n => n.type === 'Decision');
    const decision = decisionNode ? decisionNode.data : undefined;

    const evidenceNodes = graph.nodes.filter(n => n.type === 'Evidence');
    const evidence = evidenceNodes.length > 0
      ? evidenceNodes.map(n => n.data)
      : undefined;

    const exceptionNodes = graph.nodes.filter(n => n.type === 'Exception');
    const exceptions = exceptionNodes.length > 0
      ? exceptionNodes.map(n => n.data)
      : undefined;

    return {
      id: kernelNode.id,
      statement: kernelNode.data.statement,
      category: kernelNode.data.category,
      owner: kernelNode.data.owner,
      maturity: kernelNode.data.maturity,
      createdAt: kernelNode.metadata?.created_at || new Date().toISOString(),
      lastUpdatedAt: kernelNode.metadata?.updated_at || new Date().toISOString(),
      needs,
      requirements,
      verification,
      validation,
      decision,
      evidence,
      exceptions,
      history: [],
      tags: kernelNode.metadata?.tags,
    };
  }

  /**
   * 複数のKernelをグラフに統合
   */
  static mergeGraphs(graphs: KernelGraph[]): KernelGraph {
    const allNodes: GraphNode[] = [];
    const allEdges: GraphEdge[] = [];

    for (const graph of graphs) {
      allNodes.push(...graph.nodes);
      allEdges.push(...graph.edges);
    }

    // 重複ノード・エッジの除去
    const uniqueNodes = Array.from(
      new Map(allNodes.map(n => [n.id, n])).values()
    );
    const uniqueEdges = Array.from(
      new Map(allEdges.map(e => [e.id, e])).values()
    );

    return {
      graph_id: 'merged-graph',
      nodes: uniqueNodes,
      edges: uniqueEdges,
      metadata: {
        version: '1.0.0',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        description: `Merged graph from ${graphs.length} kernels`,
      },
    };
  }
}
