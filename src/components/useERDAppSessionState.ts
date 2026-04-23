import { useCallback, useState } from 'react';

import type { DiagramViewport, ViewTab } from '../types/erd';

export const DEFAULT_ACTIVE_VIEW_TAB: ViewTab = 'editor';
export const DEFAULT_PANEL_SPLIT = 42;
export const MIN_PANEL_SPLIT = 22;
export const MAX_PANEL_SPLIT = 78;

function clampPanelSplit(value: number): number {
  return Math.max(MIN_PANEL_SPLIT, Math.min(MAX_PANEL_SPLIT, value));
}

export interface ERDAppSessionState {
  activeViewTab: ViewTab;
  diagramViewport: DiagramViewport | null;
  panelSplit: number;
  setActiveViewTab: (tab: ViewTab) => void;
  setDiagramViewport: (viewport: DiagramViewport | null) => void;
  setPanelSplit: (value: number) => void;
}

export function useERDAppSessionState(): ERDAppSessionState {
  const [activeViewTabState, setActiveViewTabState] = useState<ViewTab>(DEFAULT_ACTIVE_VIEW_TAB);
  const [diagramViewportState, setDiagramViewportState] = useState<DiagramViewport | null>(null);
  const [panelSplitState, setPanelSplitState] = useState(DEFAULT_PANEL_SPLIT);

  const setActiveViewTab = useCallback((tab: ViewTab) => {
    setActiveViewTabState(tab);
  }, []);

  const setDiagramViewport = useCallback((viewport: DiagramViewport | null) => {
    setDiagramViewportState(viewport);
  }, []);

  const setPanelSplit = useCallback((value: number) => {
    setPanelSplitState(clampPanelSplit(value));
  }, []);

  return {
    activeViewTab: activeViewTabState,
    diagramViewport: diagramViewportState,
    panelSplit: panelSplitState,
    setActiveViewTab,
    setDiagramViewport,
    setPanelSplit,
  };
}
