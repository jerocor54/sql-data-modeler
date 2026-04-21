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
import type { RoutedEdgeData, TableNodeData } from './diagramCanvasTypes';

function isTableNodeDataEqual(left: TableNodeData, right: TableNodeData): boolean {
  return (
    left.table === right.table &&
    left.appTheme === right.appTheme &&
    left.designTheme === right.designTheme &&
    left.typeMode === right.typeMode &&
    left.onColumnSelect === right.onColumnSelect &&
    left.onGoToSql === right.onGoToSql &&
    left.onPreview === right.onPreview &&
    left.onTableStyleChange === right.onTableStyleChange &&
    left.config.bgColor === right.config.bgColor &&
    left.config.textColor === right.config.textColor &&
    left.config.useThemeDefaults === right.config.useThemeDefaults
  );
}

function areNodesEquivalent(left: FlowNode, right: FlowNode): boolean {
  const leftData = left.data as unknown as TableNodeData;
  const rightData = right.data as unknown as TableNodeData;

  return (
    left.id === right.id &&
    left.type === right.type &&
    left.draggable === right.draggable &&
    left.position.x === right.position.x &&
    left.position.y === right.position.y &&
    isTableNodeDataEqual(leftData, rightData)
  );
}

function arePointsEqual(
  left: Array<{ x: number; y: number }> | undefined,
  right: Array<{ x: number; y: number }> | undefined,
): boolean {
  if (left === right) return true;
  if (!left || !right) return !left && !right;
  if (left.length !== right.length) return false;

  return left.every((point, index) => point.x === right[index]?.x && point.y === right[index]?.y);
}

function isEdgeDataEqual(left: RoutedEdgeData, right: RoutedEdgeData): boolean {
  return (
    left.path === right.path &&
    left.labelX === right.labelX &&
    left.labelY === right.labelY &&
    left.showLabel === right.showLabel &&
    arePointsEqual(left.points, right.points) &&
    left.cardinality?.source.min === right.cardinality?.source.min &&
    left.cardinality?.source.max === right.cardinality?.source.max &&
    left.cardinality?.target.min === right.cardinality?.target.min &&
    left.cardinality?.target.max === right.cardinality?.target.max
  );
}

function areEdgesEquivalent(left: Edge, right: Edge): boolean {
  return (
    left.id === right.id &&
    left.type === right.type &&
    left.source === right.source &&
    left.target === right.target &&
    left.sourceHandle === right.sourceHandle &&
    left.targetHandle === right.targetHandle &&
    left.label === right.label &&
    left.zIndex === right.zIndex &&
    left.animated === right.animated &&
    left.interactionWidth === right.interactionWidth &&
    left.style?.stroke === right.style?.stroke &&
    left.style?.strokeWidth === right.style?.strokeWidth &&
    left.style?.strokeLinecap === right.style?.strokeLinecap &&
    left.style?.strokeDasharray === right.style?.strokeDasharray &&
    left.style?.strokeDashoffset === right.style?.strokeDashoffset &&
    left.style?.strokeOpacity === right.style?.strokeOpacity &&
    left.style?.filter === right.style?.filter &&
    isEdgeDataEqual((left.data ?? {}) as RoutedEdgeData, (right.data ?? {}) as RoutedEdgeData)
  );
}

function reconcileCollection<T extends { id: string }>(
  previousItems: T[],
  nextItems: T[],
  comparator: (left: T, right: T) => boolean,
): T[] {
  const previousById = new Map(previousItems.map((item) => [item.id, item]));
  let changed = previousItems.length !== nextItems.length;

  const reconciled = nextItems.map((item, index) => {
    const previous = previousById.get(item.id);

    if (!previous || !comparator(previous, item)) {
      changed = true;
      return item;
    }

    if (previousItems[index] !== previous) changed = true;
    return previous;
  });

  return changed ? reconciled : previousItems;
}

interface DiagramCanvasInteractionHandlers {
  onColumnSelect: (tableKey: string, columnName: string, kind: 'pk' | 'fk') => void;
  onGoToSql: (line: number) => void;
  onPreview: (tableKey: string) => void;
  onTableStyleChange: (tableKey: string, patch: Partial<TableVisualConfig>) => void;
}

interface UseDiagramCanvasModelInput extends DiagramCanvasInteractionHandlers {
  effectiveLineStyle: RelationLineStyle;
  globalTypeMode: TypeDisplayMode;
  hasManualLayout: boolean;
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
  effectiveLineStyle,
  elkLayout,
  globalTypeMode,
  hasManualLayout,
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
            effectiveLineStyle,
            elkLayout,
            globalTypeMode,
            hasManualLayout,
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
      effectiveLineStyle,
      elkLayout,
      globalTypeMode,
      hasManualLayout,
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

    setNodes((current) => reconcileCollection(current, graph.nodes, areNodesEquivalent));
    setEdges((current) => reconcileCollection(current, graph.edges, areEdgesEquivalent));
  }, [graph, setEdges, setNodes]);

  return {
    edges,
    nodes,
    onEdgesChange,
    onNodesChange,
    setEdges,
  };
}
