import { useStore } from '@xyflow/react';

export type DiagramLodLevel = 'far' | 'medium' | 'near';

export interface TableColumnLodState {
  hiddenCount: number;
  showTypes: boolean;
  visibleCount: number;
}

export interface TableNodeLodState extends TableColumnLodState {
  lodLevel: DiagramLodLevel;
  supportsRichDetail: boolean;
}

export interface DiagramEdgeLodState {
  lodLevel: DiagramLodLevel;
  showMarkers: boolean;
  showUnhighlightedLabels: boolean;
}

export const DIAGRAM_LOD_ZOOM = {
  far: 0.36,
  medium: 0.78,
} as const;

export function getDiagramLodLevel(zoom: number): DiagramLodLevel {
  if (zoom < DIAGRAM_LOD_ZOOM.far) return 'far';
  if (zoom < DIAGRAM_LOD_ZOOM.medium) return 'medium';
  return 'near';
}

export function getTableColumnLodState(zoom: number, columnCount: number): TableColumnLodState {
  if (columnCount <= 0) {
    return {
      hiddenCount: 0,
      showTypes: false,
      visibleCount: 0,
    };
  }

  const lodLevel = getDiagramLodLevel(zoom);

  if (lodLevel === 'far') {
    return {
      hiddenCount: columnCount,
      showTypes: false,
      visibleCount: 0,
    };
  }

  if (lodLevel === 'medium') {
    const visibleCount = columnCount <= 10 ? Math.min(columnCount, 6) : columnCount <= 24 ? 5 : 4;

    return {
      hiddenCount: Math.max(0, columnCount - visibleCount),
      showTypes: false,
      visibleCount,
    };
  }

  if (columnCount <= 12) {
    return {
      hiddenCount: 0,
      showTypes: zoom >= 0.92,
      visibleCount: columnCount,
    };
  }

  let visibleCount = columnCount;

  if (zoom < 0.96) visibleCount = Math.min(columnCount, 8);
  else if (zoom < 1.18) visibleCount = Math.min(columnCount, 12);
  else if (zoom < 1.42) visibleCount = Math.min(columnCount, 18);
  else if (zoom < 1.72) visibleCount = Math.min(columnCount, 28);

  return {
    hiddenCount: Math.max(0, columnCount - visibleCount),
    showTypes: zoom >= 1.06,
    visibleCount,
  };
}

export function getTableNodeLodState(zoom: number, columnCount: number): TableNodeLodState {
  const columnState = getTableColumnLodState(zoom, columnCount);
  const lodLevel = getDiagramLodLevel(zoom);

  return {
    ...columnState,
    lodLevel,
    supportsRichDetail: lodLevel === 'near',
  };
}

export function areTableNodeLodStatesEqual(left: TableNodeLodState, right: TableNodeLodState): boolean {
  return (
    left.lodLevel === right.lodLevel &&
    left.hiddenCount === right.hiddenCount &&
    left.showTypes === right.showTypes &&
    left.supportsRichDetail === right.supportsRichDetail &&
    left.visibleCount === right.visibleCount
  );
}

export function getDiagramEdgeLodState(zoom: number): DiagramEdgeLodState {
  const lodLevel = getDiagramLodLevel(zoom);

  return {
    lodLevel,
    showMarkers: lodLevel === 'near' && zoom >= 0.96,
    showUnhighlightedLabels: lodLevel === 'near' && zoom >= 1.08,
  };
}

export function areDiagramEdgeLodStatesEqual(left: DiagramEdgeLodState, right: DiagramEdgeLodState): boolean {
  return (
    left.lodLevel === right.lodLevel &&
    left.showMarkers === right.showMarkers &&
    left.showUnhighlightedLabels === right.showUnhighlightedLabels
  );
}

export function useDiagramZoom(): number {
  return useStore((state) => state.transform[2], Object.is);
}

export function useDiagramLodLevel(): DiagramLodLevel {
  return useStore((state) => getDiagramLodLevel(state.transform[2]), Object.is);
}

export function useTableNodeLodState(columnCount: number): TableNodeLodState {
  return useStore((state) => getTableNodeLodState(state.transform[2], columnCount), areTableNodeLodStatesEqual);
}

export function useDiagramEdgeLodState(): DiagramEdgeLodState {
  return useStore((state) => getDiagramEdgeLodState(state.transform[2]), areDiagramEdgeLodStatesEqual);
}
