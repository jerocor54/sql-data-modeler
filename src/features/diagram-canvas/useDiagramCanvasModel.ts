import { useEffect, useMemo } from 'react';
import { useEdgesState, useNodesState, type Edge, type Node as FlowNode } from '@xyflow/react';

import type { ElkLayoutResult } from '../../lib/elkLayout';
import type {
  DiagramViewport,
  ParseResult,
  Position,
  RelationGroupingMode,
  RelationLinePattern,
  RelationLineStyle,
  TableDesignTheme,
  TableModel,
  TableVisualConfig,
  ThemeMode,
  TypeDisplayMode,
} from '../../types/erd';
import { buildDiagramCanvasGraph } from './buildDiagramCanvasGraph';

interface DiagramCanvasInteractionHandlers {
  onColumnSelect: (tableKey: string, columnName: string, kind: 'pk' | 'fk') => void;
  onGoToSql: (line: number) => void;
  onPreview: (tableKey: string) => void;
  onTableStyleChange: (tableKey: string, patch: Partial<TableVisualConfig>) => void;
}

interface UseDiagramCanvasModelInput extends DiagramCanvasInteractionHandlers {
  activeColumns: Set<string>;
  ambiguousColumns: Set<string>;
  ambiguousTableKeys: Set<string>;
  effectiveLineStyle: RelationLineStyle;
  focusedAmbiguousColumns: Set<string>;
  focusedAmbiguousTables: Set<string>;
  globalTypeMode: TypeDisplayMode;
  hasManualLayout: boolean;
  highlightedEdgeIds: Set<string>;
  linePattern: RelationLinePattern;
  parsed: ParseResult;
  relationGrouping: RelationGroupingMode;
  tableConfig: Record<string, TableVisualConfig>;
  tableMap: Map<string, TableModel>;
  tableDesignTheme: TableDesignTheme;
  tablePositions: Record<string, Position | DiagramViewport>;
  theme: ThemeMode;
  elkLayout: ElkLayoutResult | null;
}

export function useDiagramCanvasModel({
  activeColumns,
  ambiguousColumns,
  ambiguousTableKeys,
  effectiveLineStyle,
  elkLayout,
  focusedAmbiguousColumns,
  focusedAmbiguousTables,
  globalTypeMode,
  hasManualLayout,
  highlightedEdgeIds,
  linePattern,
  onColumnSelect,
  onGoToSql,
  onPreview,
  onTableStyleChange,
  parsed,
  relationGrouping,
  tableConfig,
  tableMap,
  tableDesignTheme,
  tablePositions,
  theme,
}: UseDiagramCanvasModelInput) {
  const [nodes, setNodes, onNodesChange] = useNodesState<FlowNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  const graph = useMemo(
    () =>
      elkLayout
        ? buildDiagramCanvasGraph({
            activeColumns,
            ambiguousColumns,
            ambiguousTableKeys,
            effectiveLineStyle,
            elkLayout,
            focusedAmbiguousColumns,
            focusedAmbiguousTables,
            globalTypeMode,
            hasManualLayout,
            highlightedEdgeIds,
            linePattern,
            onColumnSelect,
            onGoToSql,
            onPreview,
            onTableStyleChange,
            parsed,
            relationGrouping,
            tableConfig,
            tableMap,
            tableDesignTheme,
            tablePositions,
            theme,
          })
        : null,
    [
      activeColumns,
      ambiguousColumns,
      ambiguousTableKeys,
      effectiveLineStyle,
      elkLayout,
      focusedAmbiguousColumns,
      focusedAmbiguousTables,
      globalTypeMode,
      hasManualLayout,
      highlightedEdgeIds,
      linePattern,
      onColumnSelect,
      onGoToSql,
      onPreview,
      onTableStyleChange,
      parsed,
      relationGrouping,
      tableConfig,
      tableMap,
      tableDesignTheme,
      tablePositions,
      theme,
    ],
  );

  useEffect(() => {
    if (!graph) return;

    setNodes(graph.nodes);
    setEdges(graph.edges);
  }, [graph, setEdges, setNodes]);

  return {
    edges,
    nodes,
    onEdgesChange,
    onNodesChange,
    setEdges,
  };
}
