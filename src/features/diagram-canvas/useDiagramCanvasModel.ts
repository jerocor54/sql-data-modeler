import { useEffect, useRef } from 'react';
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
import {
  buildDiagramCanvasEdges,
  buildDiagramCanvasGraph,
  resolveDiagramTablePositions,
  type DiagramCanvasGraph,
} from './buildDiagramCanvasGraph';
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
    left.deferredRouting === right.deferredRouting &&
    left.draggingPreview === right.draggingPreview &&
    arePointsEqual(left.points, right.points) &&
    left.cardinality?.source.min === right.cardinality?.source.min &&
    left.cardinality?.source.max === right.cardinality?.source.max &&
    left.cardinality?.target.min === right.cardinality?.target.min &&
    left.cardinality?.target.max === right.cardinality?.target.max
  );
}

function getAffectedRelationshipIds(parsed: ParseResult, tableKeys: Iterable<string>): Set<string> {
  const tableKeySet = tableKeys instanceof Set ? tableKeys : new Set(tableKeys);

  return new Set(
    parsed.relationships
      .filter(
        (relationship) =>
          tableKeySet.has(relationship.sourceTable) || tableKeySet.has(relationship.targetTable),
      )
      .map((relationship) => relationship.id),
  );
}

function patchEdgesForDraggingPreview(previousEdges: Edge[], affectedEdgeIds: ReadonlySet<string>): Edge[] {
  if (affectedEdgeIds.size === 0) return previousEdges;
  let changed = false;

  const nextEdges = previousEdges.map((edge) => {
    if (!affectedEdgeIds.has(edge.id)) return edge;

    const previousData = (edge.data ?? {}) as RoutedEdgeData;
    if (previousData.draggingPreview) return edge;

    changed = true;
    return {
      ...edge,
      data: {
        ...previousData,
        path: undefined,
        points: undefined,
        labelX: undefined,
        labelY: undefined,
        showLabel: false,
        draggingPreview: true,
        deferredRouting: true,
      } satisfies RoutedEdgeData,
    };
  });

  return changed ? nextEdges : previousEdges;
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

interface GraphStructureInputs extends DiagramCanvasInteractionHandlers {
  effectiveLineStyle: RelationLineStyle;
  elkLayout: ElkLayoutResult;
  globalTypeMode: TypeDisplayMode;
  hasManualLayout: boolean;
  linePattern: RelationLinePattern;
  parsed: ParseResult;
  relationGrouping: RelationGroupingMode;
  tableConfig: Record<string, TableVisualConfig>;
  tableMap: Map<string, TableModel>;
  tableDesignTheme: TableDesignTheme;
  theme: ThemeMode;
}

interface DiagramCanvasGraphSnapshot {
  graph: DiagramCanvasGraph;
  resolvedPositions: Record<string, Position | DiagramViewport>;
  structureInputs: GraphStructureInputs;
}

function areStructureInputsEqual(left: GraphStructureInputs, right: GraphStructureInputs): boolean {
  return (
    left.effectiveLineStyle === right.effectiveLineStyle &&
    left.elkLayout === right.elkLayout &&
    left.globalTypeMode === right.globalTypeMode &&
    left.hasManualLayout === right.hasManualLayout &&
    left.linePattern === right.linePattern &&
    left.onColumnSelect === right.onColumnSelect &&
    left.onGoToSql === right.onGoToSql &&
    left.onPreview === right.onPreview &&
    left.onTableStyleChange === right.onTableStyleChange &&
    left.parsed === right.parsed &&
    left.relationGrouping === right.relationGrouping &&
    left.tableConfig === right.tableConfig &&
    left.tableMap === right.tableMap &&
    left.tableDesignTheme === right.tableDesignTheme &&
    left.theme === right.theme
  );
}

function getMovedTableKeys(
  parsed: ParseResult,
  previousPositions: Record<string, Position | DiagramViewport>,
  nextPositions: Record<string, Position | DiagramViewport>,
): string[] {
  return parsed.tables.flatMap((table) => {
    const previous = previousPositions[table.key];
    const next = nextPositions[table.key];

    if (!previous || !next) return [];
    return previous.x !== next.x || previous.y !== next.y ? [table.key] : [];
  });
}

function patchNodePositions(previousNodes: FlowNode[], nextPositions: Record<string, Position | DiagramViewport>): FlowNode[] {
  let changed = false;

  const nextNodes = previousNodes.map((node) => {
    const nextPosition = nextPositions[node.id];
    if (!nextPosition) return node;
    if (node.position.x === nextPosition.x && node.position.y === nextPosition.y) return node;

    changed = true;
    return {
      ...node,
      position: {
        x: nextPosition.x,
        y: nextPosition.y,
      },
    };
  });

  return changed ? nextNodes : previousNodes;
}

function patchAffectedEdges(previousEdges: Edge[], nextAffectedEdges: Edge[], affectedEdgeIds: ReadonlySet<string>): Edge[] {
  if (affectedEdgeIds.size === 0) return previousEdges;

  const nextAffectedEdgesById = new Map(nextAffectedEdges.map((edge) => [edge.id, edge]));
  let changed = false;

  const nextEdges = previousEdges.map((edge) => {
    if (!affectedEdgeIds.has(edge.id)) return edge;

    const nextEdge = nextAffectedEdgesById.get(edge.id);
    if (!nextEdge) return edge;
    if (areEdgesEquivalent(edge, nextEdge)) return edge;

    changed = true;
    return nextEdge;
  });

  return changed ? nextEdges : previousEdges;
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
  const previousGraphRef = useRef<DiagramCanvasGraphSnapshot | null>(null);

  const handleNodeDragStart = (tableKey: string) => {
    const affectedRelationshipIds = getAffectedRelationshipIds(parsed, [tableKey]);
    if (affectedRelationshipIds.size === 0) return;

    setEdges((current) => {
      const nextEdges = patchEdgesForDraggingPreview(current, affectedRelationshipIds);

      if (previousGraphRef.current && nextEdges !== current) {
        previousGraphRef.current = {
          ...previousGraphRef.current,
          graph: {
            ...previousGraphRef.current.graph,
            edges: patchEdgesForDraggingPreview(previousGraphRef.current.graph.edges, affectedRelationshipIds),
          },
        };
      }

      return nextEdges;
    });
  };

  useEffect(() => {
    if (!elkLayout) return;

    const structureInputs: GraphStructureInputs = {
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
      theme,
    };
    const resolvedPositions = resolveDiagramTablePositions(parsed, elkLayout, tablePositions);
    const previous = previousGraphRef.current;
    const movedTableKeys = previous
      ? getMovedTableKeys(parsed, previous.resolvedPositions, resolvedPositions)
      : [];

    const shouldIncrementallyPatch =
      previous !== null &&
      areStructureInputsEqual(previous.structureInputs, structureInputs) &&
      movedTableKeys.length > 0 &&
      movedTableKeys.length <= 2;

    let nextGraph: DiagramCanvasGraph;

    if (shouldIncrementallyPatch && previous) {
      const movedTableKeySet = new Set(movedTableKeys);
      const affectedRelationshipIds = getAffectedRelationshipIds(parsed, movedTableKeySet);
      const nextNodes = patchNodePositions(previous.graph.nodes, resolvedPositions);
      const seedEdges = previous.graph.edges.filter((edge) => !affectedRelationshipIds.has(edge.id));
      const nextAffectedEdges = buildDiagramCanvasEdges({
        effectiveLineStyle,
        elkLayout,
        globalTypeMode,
        hasManualLayout,
        linePattern,
        parsed,
        relationGrouping,
        resolvedPositions,
        routingMode: 'simplified',
        renderRelationshipIds: affectedRelationshipIds,
        seedEdges,
        tableMap,
      });
      const nextEdges = patchAffectedEdges(previous.graph.edges, nextAffectedEdges, affectedRelationshipIds);

      nextGraph = {
        edges: nextEdges,
        nodes: nextNodes,
      };
    } else {
      nextGraph = buildDiagramCanvasGraph({
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
      });
    }

    previousGraphRef.current = {
      graph: nextGraph,
      resolvedPositions,
      structureInputs,
    };

    setNodes((current) => reconcileCollection(current, nextGraph.nodes, areNodesEquivalent));
    setEdges((current) => reconcileCollection(current, nextGraph.edges, areEdgesEquivalent));
  }, [
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
    setEdges,
    setNodes,
    tableConfig,
    tableMap,
    tableDesignTheme,
    tablePositions,
    theme,
  ]);

  return {
    edges,
    handleNodeDragStart,
    nodes,
    onEdgesChange,
    onNodesChange,
    setEdges,
  };
}
