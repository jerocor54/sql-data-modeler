import { memo, useCallback, useMemo, useRef, useState, type MutableRefObject, type RefObject } from 'react';
import {
  Background,
  Controls,
  MiniMap,
  PanOnScrollMode,
  ReactFlow,
  type Connection,
  type Edge,
  type Node as FlowNode,
  type OnEdgesChange,
  type OnNodesChange,
  type ReactFlowInstance,
  type Viewport,
} from '@xyflow/react';

import { getTableNodeHeight, TABLE_NODE_WIDTH } from '../../lib/diagramGeometry';
import type { DiagramViewport, TableModel } from '../../types/erd';
import type { DiagramBounds } from './diagramCanvasTypes';

import RoutedEdge from '../../components/edges/RoutedEdge';
import TableNode from '../../components/nodes/TableNode';

const nodeTypes = { tableNode: TableNode };
const edgeTypes = { routed: RoutedEdge };
const defaultEdgeOptions = { zIndex: 1 };
const fitViewOptions = { padding: 0.25 };
const VIEWPORT_CULLING_NODE_THRESHOLD = 72;

interface DiagramCanvasSurfaceProps {
  diagramViewport: DiagramViewport | null;
  disableViewportCulling?: boolean;
  edges: Edge[];
  exportRef: RefObject<HTMLDivElement | null>;
  hasSavedDiagramViewport: boolean;
  highlightedEdgeIds: Set<string>;
  nodes: FlowNode[];
  onConnect: (connection: Connection) => void;
  onEdgeClick: (_: unknown, edge: Edge) => void;
  onEdgesChange: OnEdgesChange<Edge>;
  onNodePositionCommit: (node: FlowNode) => void;
  onNodesChange: OnNodesChange<FlowNode>;
  onPaneClick: () => void;
  onViewportChange: (viewport: Viewport) => void;
  reactFlowRef: MutableRefObject<ReactFlowInstance<FlowNode, Edge> | null>;
  viewportPinnedNodeIds: Set<string>;
}

function getViewportBounds(viewport: Viewport, width: number, height: number, padding: number): DiagramBounds {
  const left = -viewport.x / viewport.zoom;
  const top = -viewport.y / viewport.zoom;
  const right = left + width / viewport.zoom;
  const bottom = top + height / viewport.zoom;

  return {
    bottom: bottom + padding,
    left: left - padding,
    right: right + padding,
    top: top - padding,
  };
}

function intersectsBounds(node: FlowNode, bounds: DiagramBounds): boolean {
  const table =
    node.data &&
    typeof node.data === 'object' &&
    'table' in node.data &&
    node.data.table &&
    typeof node.data.table === 'object' &&
    'columns' in node.data.table
      ? (node.data.table as TableModel)
      : null;
  const height = table ? getTableNodeHeight(table) : 120;
  const left = node.position.x;
  const top = node.position.y;
  const right = left + TABLE_NODE_WIDTH;
  const bottom = top + height;

  return !(right < bounds.left || left > bounds.right || bottom < bounds.top || top > bounds.bottom);
}

function areSetsEqual(left: Set<string>, right: Set<string>): boolean {
  if (left === right) return true;
  if (left.size !== right.size) return false;

  for (const value of left) {
    if (!right.has(value)) return false;
  }

  return true;
}

function DiagramCanvasSurfaceComponent({
  diagramViewport,
  disableViewportCulling = false,
  edges,
  exportRef,
  hasSavedDiagramViewport,
  highlightedEdgeIds,
  nodes,
  onConnect,
  onEdgeClick,
  onEdgesChange,
  onNodePositionCommit,
  onNodesChange,
  onPaneClick,
  onViewportChange,
  reactFlowRef,
  viewportPinnedNodeIds,
}: DiagramCanvasSurfaceProps) {
  const viewportHostRef = useRef<HTMLDivElement>(null);
  const [renderViewport, setRenderViewport] = useState<Viewport | null>(diagramViewport);

  const updateViewport = useCallback(
    (viewport: Viewport, shouldPersist: boolean) => {
      setRenderViewport((current) => {
        if (
          current &&
          current.x === viewport.x &&
          current.y === viewport.y &&
          current.zoom === viewport.zoom
        ) {
          return current;
        }

        return viewport;
      });

      if (shouldPersist) onViewportChange(viewport);
    },
    [onViewportChange],
  );

  const viewportVisibleNodeIds = useMemo(() => {
    if (disableViewportCulling || !renderViewport) return null;
    const host = viewportHostRef.current;
    if (!host) return null;
    if (nodes.length < VIEWPORT_CULLING_NODE_THRESHOLD) return null;

    const padding = Math.max(220, 360 / Math.max(renderViewport.zoom, 0.12));
    const bounds = getViewportBounds(renderViewport, host.clientWidth, host.clientHeight, padding);
    const visibleIds = new Set<string>();

    for (const node of nodes) {
      if (viewportPinnedNodeIds.has(node.id) || intersectsBounds(node, bounds)) visibleIds.add(node.id);
    }

    return visibleIds;
  }, [disableViewportCulling, nodes, renderViewport, viewportPinnedNodeIds]);

  const renderEdges = useMemo(() => {
    if (!viewportVisibleNodeIds) return edges;

    const nextEdges = edges.filter(
      (edge) =>
        highlightedEdgeIds.has(edge.id) ||
        viewportVisibleNodeIds.has(edge.source) ||
        viewportVisibleNodeIds.has(edge.target),
    );

    return nextEdges.length === edges.length ? edges : nextEdges;
  }, [edges, highlightedEdgeIds, viewportVisibleNodeIds]);

  return (
    <div ref={viewportHostRef} style={{ minHeight: 0 }}>
      <div ref={exportRef} className="rf-export-target">
        <ReactFlow
          onInit={(instance) => {
            reactFlowRef.current = instance;
            if (diagramViewport) {
              requestAnimationFrame(() => {
                void instance.setViewport(diagramViewport);
                updateViewport(diagramViewport, false);
              });
              return;
            }

            updateViewport(instance.getViewport(), false);
          }}
          nodes={nodes}
          edges={renderEdges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          defaultEdgeOptions={defaultEdgeOptions}
          defaultViewport={diagramViewport ?? undefined}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeDragStop={(_, node) => onNodePositionCommit(node)}
          onEdgeClick={onEdgeClick}
          onPaneClick={onPaneClick}
          onMove={(_, viewport) => updateViewport(viewport, false)}
          onMoveEnd={(_, viewport) => updateViewport(viewport, true)}
          onConnect={onConnect}
          onlyRenderVisibleElements
          fitView={!hasSavedDiagramViewport}
          fitViewOptions={fitViewOptions}
          minZoom={0.08}
          panOnDrag
          panOnScroll
          panOnScrollMode={PanOnScrollMode.Free}
          zoomOnScroll
          zoomOnPinch
        >
          <MiniMap pannable zoomable />
          <Controls />
          <Background gap={16} size={1.2} color="color-mix(in srgb, var(--text-muted) 20%, transparent)" />
        </ReactFlow>
      </div>
    </div>
  );
}

export const DiagramCanvasSurface = memo(DiagramCanvasSurfaceComponent, (prev, next) => {
  return (
    prev.diagramViewport === next.diagramViewport &&
    prev.disableViewportCulling === next.disableViewportCulling &&
    prev.edges === next.edges &&
    prev.exportRef === next.exportRef &&
    prev.hasSavedDiagramViewport === next.hasSavedDiagramViewport &&
    prev.nodes === next.nodes &&
    prev.onConnect === next.onConnect &&
    prev.onEdgeClick === next.onEdgeClick &&
    prev.onEdgesChange === next.onEdgesChange &&
    prev.onNodePositionCommit === next.onNodePositionCommit &&
    prev.onNodesChange === next.onNodesChange &&
    prev.onPaneClick === next.onPaneClick &&
    prev.onViewportChange === next.onViewportChange &&
    prev.reactFlowRef === next.reactFlowRef &&
    areSetsEqual(prev.highlightedEdgeIds, next.highlightedEdgeIds) &&
    areSetsEqual(prev.viewportPinnedNodeIds, next.viewportPinnedNodeIds)
  );
});
