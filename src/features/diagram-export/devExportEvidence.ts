import type { Viewport } from '@xyflow/react';

import type { ViewMode } from '../../types/erd';
import type { DiagramPresentationMode } from '../diagram-presentation/useDiagramPresentation';

export const DEV_DIAGRAM_EXPORT_EVIDENCE_KEY = '__SQL_DATA_MODELER_EXPORT__';

export type DiagramExportRequestedVisibleMode = DiagramPresentationMode | 'auto';

export interface DiagramExportViewportSnapshot {
  x: number;
  y: number;
  zoom: number;
}

export interface DiagramExportDevEvidence {
  schemaVersion: 'phase-8-overview-export-v1';
  status: 'started' | 'completed' | 'failed';
  job: {
    format: 'svg' | 'png' | 'jpeg';
    intent: 'overview';
  };
  exportSurface: 'overview-hidden';
  requestedVisibleModeBefore: DiagramExportRequestedVisibleMode;
  requestedVisibleModeAfter: DiagramExportRequestedVisibleMode;
  effectiveVisibleModeBefore: DiagramPresentationMode;
  effectiveVisibleModeAfter: DiagramPresentationMode;
  workspaceViewModeBefore: ViewMode;
  workspaceViewModeAfter: ViewMode;
  visibleViewportBefore: DiagramExportViewportSnapshot | null;
  visibleViewportAfter: DiagramExportViewportSnapshot | null;
  visiblePresentedNodeCountBefore: number;
  visiblePresentedEdgeCountBefore: number;
  exportInputNodeCount: number;
  exportInputEdgeCount: number;
  overviewContractNodeCount: number;
  overviewContractEdgeCount: number;
  exportRenderedNodeCount: number;
  exportRenderedEdgeCount: number;
  viewportStable: boolean;
  visibleModeStable: boolean;
  downloadFileName: string | null;
  downloadDataUrlPrefix: string | null;
  startedAt: string;
  completedAt: string | null;
  errorMessage: string | null;
}

export function cloneDiagramExportViewport(viewport: Viewport | null | undefined): DiagramExportViewportSnapshot | null {
  if (!viewport) return null;

  return {
    x: viewport.x,
    y: viewport.y,
    zoom: viewport.zoom,
  };
}

export function areDiagramExportViewportsEqual(
  left: DiagramExportViewportSnapshot | null,
  right: DiagramExportViewportSnapshot | null,
): boolean {
  if (left === right) return true;
  if (!left || !right) return left === right;

  return left.x === right.x && left.y === right.y && left.zoom === right.zoom;
}

declare global {
  interface Window {
    __SQL_DATA_MODELER_EXPORT__?: Readonly<DiagramExportDevEvidence>;
  }
}
