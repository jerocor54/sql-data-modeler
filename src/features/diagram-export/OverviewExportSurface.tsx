import { useRef, type RefObject } from 'react';
import type { Edge, Node as FlowNode, ReactFlowInstance, Viewport } from '@xyflow/react';

import { DiagramCanvasSurface } from '../diagram-canvas/DiagramCanvasSurface';

interface OverviewExportSurfaceProps {
  edges: Edge[];
  exportRef: RefObject<HTMLDivElement | null>;
  nodes: FlowNode[];
}

const EMPTY_EDGE_IDS = new Set<string>();
const EMPTY_PINNED_NODE_IDS = new Set<string>();

export function OverviewExportSurface({ edges, exportRef, nodes }: OverviewExportSurfaceProps) {
  const reactFlowRef = useRef<ReactFlowInstance<FlowNode, Edge> | null>(null);

  return (
    <div
      aria-hidden="true"
      data-export-surface="overview"
      style={{
        position: 'fixed',
        top: -10000,
        left: -10000,
        width: 1,
        height: 1,
        opacity: 0,
        pointerEvents: 'none',
        overflow: 'hidden',
        zIndex: -1,
      }}
    >
      <DiagramCanvasSurface
        diagramViewport={null}
        disableViewportCulling
        edges={edges}
        exportRef={exportRef}
        hasSavedDiagramViewport={false}
        highlightedEdgeIds={EMPTY_EDGE_IDS}
        nodes={nodes}
        onConnect={() => undefined}
        onEdgeClick={() => undefined}
        onEdgesChange={() => undefined}
        onNodeDragStart={() => undefined}
        onNodePositionCommit={() => undefined}
        onNodesChange={() => undefined}
        onPaneClick={() => undefined}
        onViewportChange={(_: Viewport) => undefined}
        reactFlowRef={reactFlowRef}
        viewportPinnedNodeIds={EMPTY_PINNED_NODE_IDS}
      />
    </div>
  );
}
