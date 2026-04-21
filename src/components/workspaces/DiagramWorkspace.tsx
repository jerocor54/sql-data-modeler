import { useCallback, useEffect, useRef, useState, type MutableRefObject, type RefObject } from 'react';
import type {
  Connection,
  Edge,
  Node as FlowNode,
  OnEdgesChange,
  OnNodesChange,
  ReactFlowInstance,
  Viewport,
} from '@xyflow/react';

import type { DiagramViewport } from '../../types/erd';
import type { DiagramSearchResult } from '../../features/parse-sql/useDiagramModel';
import { DiagramCanvasOverlays } from '../../features/diagram-canvas/DiagramCanvasOverlays';
import { DiagramCanvasSurface } from '../../features/diagram-canvas/DiagramCanvasSurface';

interface DiagramWorkspaceProps {
  diagramSearch: string;
  diagramSearchResults: DiagramSearchResult[];
  diagramViewport: DiagramViewport | null;
  disableViewportCulling?: boolean;
  edges: Edge[];
  exportRef: RefObject<HTMLDivElement | null>;
  hasSavedDiagramViewport: boolean;
  highlightedEdgeIds: Set<string>;
  nodes: FlowNode[];
  onClearSearchHighlights: () => void;
  onConnect: (connection: Connection) => void;
  onDiagramSearchChange: (value: string) => void;
  onEdgeClick: (_: unknown, edge: Edge) => void;
  onEdgesChange: OnEdgesChange<Edge>;
  onFocusDiagramSearchResult: (result: DiagramSearchResult) => void;
  onNodePositionCommit: (node: FlowNode) => void;
  onNodesChange: OnNodesChange<FlowNode>;
  onPaneClick: () => void;
  onViewportChange: (viewport: Viewport) => void;
  reactFlowRef: MutableRefObject<ReactFlowInstance<FlowNode, Edge> | null>;
  viewportPinnedNodeIds: Set<string>;
}

export default function DiagramWorkspace({
  diagramSearch,
  diagramSearchResults,
  diagramViewport,
  disableViewportCulling = false,
  edges,
  exportRef,
  hasSavedDiagramViewport,
  highlightedEdgeIds,
  nodes,
  onClearSearchHighlights,
  onConnect,
  onDiagramSearchChange,
  onEdgeClick,
  onEdgesChange,
  onFocusDiagramSearchResult,
  onNodePositionCommit,
  onNodesChange,
  onPaneClick,
  onViewportChange,
  reactFlowRef,
  viewportPinnedNodeIds,
}: DiagramWorkspaceProps) {
  const [isDiagramFullscreen, setIsDiagramFullscreen] = useState(false);
  const diagramSurfaceRef = useRef<HTMLDivElement>(null);

  const toggleDiagramFullscreen = useCallback(async () => {
    if (!diagramSurfaceRef.current) return;

    try {
      if (document.fullscreenElement === diagramSurfaceRef.current) {
        await document.exitFullscreen();
        return;
      }

      await diagramSurfaceRef.current.requestFullscreen();
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('No se pudo cambiar pantalla completa del diagrama:', error);
    }
  }, []);

  useEffect(() => {
    const onFullscreenChange = () => {
      setIsDiagramFullscreen(document.fullscreenElement === diagramSurfaceRef.current);
    };

    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  return (
    <div style={{ minHeight: 0, display: 'grid', height: '100%' }}>
      <div
        ref={diagramSurfaceRef}
        className="panel-card"
        style={{
          position: 'relative',
          height: '100%',
          padding: 10,
          minHeight: 0,
          display: 'grid',
          gridTemplateRows: '1fr',
          background: 'var(--surface)',
        }}
      >
        <DiagramCanvasOverlays
          diagramSearch={diagramSearch}
          diagramSearchResults={diagramSearchResults}
          isDiagramFullscreen={isDiagramFullscreen}
          onClearSearchHighlights={onClearSearchHighlights}
          onDiagramSearchChange={onDiagramSearchChange}
          onFocusDiagramSearchResult={onFocusDiagramSearchResult}
          onToggleFullscreen={toggleDiagramFullscreen}
        />

        <DiagramCanvasSurface
          diagramViewport={diagramViewport}
          disableViewportCulling={disableViewportCulling}
          edges={edges}
          exportRef={exportRef}
          hasSavedDiagramViewport={hasSavedDiagramViewport}
          highlightedEdgeIds={highlightedEdgeIds}
          nodes={nodes}
          onConnect={onConnect}
          onEdgeClick={onEdgeClick}
          onEdgesChange={onEdgesChange}
          onNodePositionCommit={onNodePositionCommit}
          onNodesChange={onNodesChange}
          onPaneClick={onPaneClick}
          onViewportChange={onViewportChange}
          reactFlowRef={reactFlowRef}
          viewportPinnedNodeIds={viewportPinnedNodeIds}
        />
      </div>
    </div>
  );
}
