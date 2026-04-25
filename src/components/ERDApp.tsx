import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  type ReactFlowInstance,
  type Viewport,
  addEdge,
  getNodesBounds,
  getViewportForBounds,
  type Connection,
  type Edge,
  type Node as FlowNode,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { toJpeg, toPng, toSvg } from 'html-to-image';
import { DownloadCloud, Moon, MoreHorizontal, Sparkles, Sun } from 'lucide-react';

import { downloadDataUrl } from '../lib/download';
import {
  useAppStoreDurablePreferences,
  useAppStoreHasStoreHydrated,
  useAppStoreHasHydrated,
  useAppStoreHydrationActions,
  useAppStoreSqlState,
  useAppStoreTableConfigState,
} from '../store/appStore';
import { createTablePositionPersistence } from '../store/tablePositionPersistence';
import { useTablePositionStore, useTablePositionStoreState } from '../store/tablePositionStore';
import type {
  AmbiguousReference,
  DiagramViewport,
  Relationship,
  RelationGroupingMode,
  RelationLinePattern,
  TableDesignTheme,
  TableVisualConfig,
  ThemeMode,
  TypeDisplayMode,
  ViewMode,
} from '../types/erd';
import { useAutoLayout } from '../features/auto-layout/useAutoLayout';
import { useSyncDiagramCanvasTransientState } from '../features/diagram-canvas/diagramCanvasTransientState';
import { useDiagramCanvasModel } from '../features/diagram-canvas/useDiagramCanvasModel';
import {
  useDiagramPresentation,
  type DiagramFocusDepth,
  type DiagramPresentationNodeMembership,
  type DiagramPresentationMode,
  type DiagramPresentationStrategy,
} from '../features/diagram-presentation/useDiagramPresentation';
import { useDiagramModel, type DiagramSearchResult } from '../features/parse-sql/useDiagramModel';
import BenchmarkPanel from '../features/performance/BenchmarkPanel';
import {
  createBenchmarkDataset,
  isBenchmarkDatasetInteractiveSupported,
  type BenchmarkDatasetPresetId,
} from '../features/performance/benchmarkDatasets';
import {
  serializeBenchmarkResults,
  useDiagramPerformance,
  type DiagramBenchmarkRunMeta,
} from '../features/performance/diagramPerformance';
import DiagramWorkspace from './workspaces/DiagramWorkspace';
import SqlEditorPanel from './SqlEditorPanel';
import { useERDAppSessionState } from './useERDAppSessionState';

const EXPORT_MIN_WIDTH = 1400;
const EXPORT_MIN_HEIGHT = 900;
const EXPORT_PADDING = 120;

function formatExportLabel(format: 'svg' | 'png' | 'jpeg'): string {
  if (format === 'svg') return 'SVG';
  if (format === 'png') return 'PNG';
  return 'JPEG';
}

function ensureSvgBackground(dataUrl: string, fillColor: string): string {
  const utfPrefix = 'data:image/svg+xml;charset=utf-8,';
  if (!dataUrl.startsWith(utfPrefix)) return dataUrl;

  try {
    const decoded = decodeURIComponent(dataUrl.slice(utfPrefix.length));
    if (!decoded.startsWith('<svg')) return dataUrl;
    if (decoded.includes('data-sql-bg="true"')) return dataUrl;

    const backgroundRect = `<rect data-sql-bg="true" x="0" y="0" width="100%" height="100%" fill="${fillColor}" />`;
    const withBackground = decoded.replace(/<svg([^>]*)>/, `<svg$1>${backgroundRect}`);
    return `${utfPrefix}${encodeURIComponent(withBackground)}`;
  } catch {
    return dataUrl;
  }
}

function normalize(value: string): string {
  return value.toLowerCase();
}

function getPresentationStrategyLabel(strategy: DiagramPresentationStrategy): string {
  if (strategy === 'normal') return 'Normal';
  if (strategy === 'large') return 'Large';
  return 'Extreme';
}

function getPresentationModeLabel(mode: DiagramPresentationMode): string {
  if (mode === 'full') return 'Full';
  if (mode === 'overview') return 'Overview';
  return 'Focus';
}

function getFocusDepthBadge(depth: DiagramFocusDepth | null): string {
  if (depth === null) return '—';
  return `Nivel ${depth}`;
}

function formatLayoutDiagnosticsTitle(
  diagnostics: ReturnType<typeof useAutoLayout>['layoutDiagnostics'],
): string | undefined {
  if (!diagnostics) return undefined;

  const parts = [`Causa: ${diagnostics.cause}`];
  if (diagnostics.provenance?.stage) parts.push(`Stage: ${diagnostics.provenance.stage}`);
  if (diagnostics.provenance?.message) parts.push(`Mensaje: ${diagnostics.provenance.message}`);
  return parts.join(' · ');
}

function isKeyboardTypingContext(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  return Boolean(element?.closest('input, textarea, select, [contenteditable="true"], .monaco-editor, .view-lines'));
}

function mergeSets<T>(...sets: Array<Set<T>>): Set<T> {
  const merged = new Set<T>();
  for (const current of sets) {
    for (const value of current) merged.add(value);
  }
  return merged;
}

function getHighlightedEdges(
  selected: { table: string; column: string; kind: 'pk' | 'fk' } | null,
  relationships: Relationship[],
): Set<string> {
  if (!selected) return new Set<string>();
  const selectedCol = normalize(selected.column);

  const ids = relationships
    .filter((rel) => {
      if (selected.kind === 'pk') {
        return rel.targetTable === selected.table && normalize(rel.targetColumn) === selectedCol;
      }

      return rel.sourceTable === selected.table && normalize(rel.sourceColumn) === selectedCol;
    })
    .map((rel) => rel.id);

  return new Set(ids);
}

function getActiveColumns(
  selected: { table: string; column: string; kind: 'pk' | 'fk' } | null,
  relationships: Relationship[],
): Set<string> {
  const active = new Set<string>();
  if (!selected) return active;

  const selectedCol = normalize(selected.column);
  active.add(`${selected.table}.${selectedCol}`);

  for (const rel of relationships) {
    if (selected.kind === 'pk' && rel.targetTable === selected.table && normalize(rel.targetColumn) === selectedCol) {
      active.add(`${rel.sourceTable}.${normalize(rel.sourceColumn)}`);
    }
    if (selected.kind === 'fk' && rel.sourceTable === selected.table && normalize(rel.sourceColumn) === selectedCol) {
      active.add(`${rel.targetTable}.${normalize(rel.targetColumn)}`);
    }
  }

  return active;
}

function getActiveColumnsForRelationship(relationshipId: string | null, relationships: Relationship[]): Set<string> {
  const active = new Set<string>();
  if (!relationshipId) return active;

  const relationship = relationships.find((rel) => rel.id === relationshipId);
  if (!relationship) return active;

  active.add(`${relationship.sourceTable}.${normalize(relationship.sourceColumn)}`);
  active.add(`${relationship.targetTable}.${normalize(relationship.targetColumn)}`);

  return active;
}

function areOrderedIdsEqual(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;

  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false;
  }

  return true;
}

function buildPresentationMembershipKey(ids: string[]): string {
  return ids.join('\u0000');
}

function useStablePresentationMembership(nodes: FlowNode[]): DiagramPresentationNodeMembership {
  const membershipRef = useRef<DiagramPresentationNodeMembership | null>(null);

  return useMemo(() => {
    const ids = nodes.map((node) => node.id);
    const previousMembership = membershipRef.current;

    if (previousMembership && areOrderedIdsEqual(previousMembership.ids, ids)) return previousMembership;

    const nextMembership = {
      ids,
      key: buildPresentationMembershipKey(ids),
      count: ids.length,
    } satisfies DiagramPresentationNodeMembership;

    membershipRef.current = nextMembership;
    return nextMembership;
  }, [nodes]);
}

interface ERDAppProps {
  mode?: 'app' | 'benchmark';
}

export default function ERDApp({ mode = 'app' }: ERDAppProps) {
  const hasHydrated = useAppStoreHasHydrated();
  const hasStoreHydrated = useAppStoreHasStoreHydrated();
  const { setHasHydrated } = useAppStoreHydrationActions();
  const { sqlText, setSqlText } = useAppStoreSqlState();
  const {
    theme,
    setTheme,
    globalTypeMode,
    setGlobalTypeMode,
    exportScale,
    setExportScale,
    linePattern,
    setLinePattern,
    relationGrouping,
    setRelationGrouping,
    tableDesignTheme,
    setTableDesignTheme,
    dialect,
    setDialect,
    viewMode,
    setViewMode,
  } = useAppStoreDurablePreferences();
  const {
    tableConfig,
    setTableConfig,
    resetAllTableColorsToTheme,
  } = useAppStoreTableConfigState();
  const {
    tablePositions,
    setTablePosition,
    resetTablePositions,
    replaceTablePositions,
  } = useTablePositionStoreState();
  const { activeViewTab, setActiveViewTab, diagramViewport, setDiagramViewport, panelSplit, setPanelSplit } =
    useERDAppSessionState();

  const isBenchmarkMode = mode === 'benchmark';
  const [benchmarkRunRevision, setBenchmarkRunRevision] = useState(0);
  const [diagramSearch, setDiagramSearch] = useState('');
  const pendingBenchmarkMetaRef = useRef<DiagramBenchmarkRunMeta | null>(null);
  const { latestResult, history, createParseRun, finishParse, startLayout, finishLayout, finalizeRun, clearHistory } = useDiagramPerformance();
  const {
    ambiguousColumns,
    ambiguousReferences,
    ambiguousTableKeys,
    diagramSearchResults,
    hasManualLayout,
    isReady: isDiagramModelReady,
    parseRunId,
    parsed,
    tableMap,
  } = useDiagramModel({
    benchmarkRunRevision,
    createParseRun,
    dialect,
    diagramSearch,
    finishParse,
    pendingBenchmarkMetaRef,
    sqlText,
    tablePositions,
  });
  const tableNameById = useMemo(() => new Map(parsed.tables.map((table) => [table.key, table.name] as const)), [parsed.tables]);
  const effectiveLineStyle = 'orthogonal';

  const [selected, setSelected] = useState<{ table: string; column: string; kind: 'pk' | 'fk' } | null>(null);
  const [selectedRelationshipId, setSelectedRelationshipId] = useState<string | null>(null);
  const [goToLine, setGoToLine] = useState<number | null>(null);
  const [previewTable, setPreviewTable] = useState<string | null>(null);
  const [openDiagramMenu, setOpenDiagramMenu] = useState(false);
  const [exportingFormat, setExportingFormat] = useState<'svg' | 'png' | 'jpeg' | null>(null);
  const [isResizingPanels, setIsResizingPanels] = useState(false);
  const [layoutRevision, setLayoutRevision] = useState(0);
  const [focusedAmbiguousTables, setFocusedAmbiguousTables] = useState<Set<string>>(new Set());
  const [focusedAmbiguousColumns, setFocusedAmbiguousColumns] = useState<Set<string>>(new Set());
  const [searchFocusedTables, setSearchFocusedTables] = useState<Set<string>>(new Set());
  const [searchFocusedColumns, setSearchFocusedColumns] = useState<Set<string>>(new Set());
  const exportRef = useRef<HTMLDivElement>(null);
  const panelsRef = useRef<HTMLElement>(null);
  const diagramMenuRef = useRef<HTMLDivElement>(null);
  const diagramMenuTriggerRef = useRef<HTMLButtonElement>(null);
  const reactFlowRef = useRef<ReactFlowInstance<FlowNode, Edge> | null>(null);
  const focusResetTimerRef = useRef<number | null>(null);
  const handledFocusViewportRequestRef = useRef(0);
  const tablePositionPersistenceRef = useRef<ReturnType<typeof createTablePositionPersistence> | null>(null);

  useEffect(() => {
    if (!hasStoreHydrated || tablePositionPersistenceRef.current) return;

    const tablePositionPersistence = createTablePositionPersistence();
    tablePositionPersistenceRef.current = tablePositionPersistence;
    replaceTablePositions(tablePositionPersistence.load());
    setHasHydrated(true);

    return () => {
      tablePositionPersistence.dispose();
      tablePositionPersistenceRef.current = null;
    };
  }, [hasStoreHydrated, replaceTablePositions, setHasHydrated]);

  useEffect(() => {
    const tablePositionPersistence = tablePositionPersistenceRef.current;
    if (!hasHydrated || !tablePositionPersistence) return;

    const flushTablePositions = () => {
      tablePositionPersistence.flushNow();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') flushTablePositions();
    };

    window.addEventListener('beforeunload', flushTablePositions);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('beforeunload', flushTablePositions);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [hasHydrated]);

  const commitTablePosition = useCallback((tableKey: string, position: { x: number; y: number }) => {
    setTablePosition(tableKey, position);
    tablePositionPersistenceRef.current?.schedule(useTablePositionStore.getState().tablePositions);
  }, [setTablePosition]);

  const clearTablePositions = useCallback(() => {
    resetTablePositions();
    tablePositionPersistenceRef.current?.schedule(useTablePositionStore.getState().tablePositions);
  }, [resetTablePositions]);

  useEffect(() => {
    if (!hasHydrated) return;
    document.documentElement.dataset.theme = theme;
  }, [hasHydrated, theme]);

  useEffect(() => {
    if (!openDiagramMenu) return;

    const closeMenu = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;

      const clickedMenu = diagramMenuRef.current?.contains(target);
      const clickedTrigger = diagramMenuTriggerRef.current?.contains(target);
      if (!clickedMenu && !clickedTrigger) setOpenDiagramMenu(false);
    };

    document.addEventListener('pointerdown', closeMenu);
    return () => document.removeEventListener('pointerdown', closeMenu);
  }, [openDiagramMenu]);

  useEffect(() => {
    if (!isResizingPanels) return;

    const onPointerMove = (event: PointerEvent) => {
      if (!panelsRef.current) return;
      const rect = panelsRef.current.getBoundingClientRect();
      const ratio = ((event.clientX - rect.left) / rect.width) * 100;
      setPanelSplit(ratio);
    };

    const onPointerUp = () => setIsResizingPanels(false);

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);

    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, [isResizingPanels, setPanelSplit]);

  const highlightedEdgeIds = useMemo(() => {
    if (selectedRelationshipId) return new Set([selectedRelationshipId]);
    return getHighlightedEdges(selected, parsed.relationships);
  }, [selected, selectedRelationshipId, parsed.relationships]);
  const activeColumns = useMemo(() => {
    if (selectedRelationshipId) return getActiveColumnsForRelationship(selectedRelationshipId, parsed.relationships);
    return getActiveColumns(selected, parsed.relationships);
  }, [selected, selectedRelationshipId, parsed.relationships]);
  const searchResultTableIds = useMemo(
    () => new Set(diagramSearchResults.map((result) => result.tableKey)),
    [diagramSearchResults],
  );
  const focusSignalTableIds = useMemo(
    () => mergeSets(focusedAmbiguousTables, searchFocusedTables),
    [focusedAmbiguousTables, searchFocusedTables],
  );
  const focusSignalColumnIds = useMemo(
    () => mergeSets(focusedAmbiguousColumns, searchFocusedColumns),
    [focusedAmbiguousColumns, searchFocusedColumns],
  );
  const viewportPinnedNodeIds = useMemo(() => {
    const pinned = new Set<string>(focusSignalTableIds);

    if (selected) pinned.add(selected.table);
    if (previewTable) pinned.add(previewTable);

    if (selectedRelationshipId) {
      const relationship = parsed.relationships.find((rel) => rel.id === selectedRelationshipId);
      if (relationship) {
        pinned.add(relationship.sourceTable);
        pinned.add(relationship.targetTable);
      }
    }

    return pinned;
  }, [focusSignalTableIds, parsed.relationships, previewTable, selected, selectedRelationshipId]);
  useSyncDiagramCanvasTransientState({
    activeColumns,
    ambiguousColumns,
    ambiguousTableKeys,
    focusedAmbiguousColumns: focusSignalColumnIds,
    focusedAmbiguousTables: focusSignalTableIds,
    highlightedEdgeIds,
  });
  const handleDiagramColumnSelect = useCallback((tableKey: string, columnName: string, kind: 'pk' | 'fk') => {
    setSelectedRelationshipId(null);
    setSelected((prev) =>
      prev?.table === tableKey && normalize(prev.column) === normalize(columnName) && prev.kind === kind
        ? null
        : { table: tableKey, column: columnName, kind },
    );
  }, []);
  const handleGoToSql = useCallback((line: number) => {
    setGoToLine(line);
    if (viewMode === 'tabs') setActiveViewTab('editor');
  }, [setActiveViewTab, viewMode]);
  const handlePreviewTable = useCallback((tableKey: string) => {
    setPreviewTable(tableKey);
  }, []);
  const handleTableStyleChange = useCallback((tableKey: string, patch: Partial<TableVisualConfig>) => {
    setTableConfig(tableKey, patch);
  }, [setTableConfig]);
  const { elkLayout, layoutMode, layoutPending, layoutWarning, layoutDiagnostics } = useAutoLayout({
    finishLayout,
    isModelReady: hasHydrated && isDiagramModelReady,
    layoutRevision,
    parseRunId,
    relationGrouping,
    relationships: parsed.relationships,
    startLayout,
    tablePositions,
    tables: parsed.tables,
  });
  const { nodes, edges, handleNodeDragStart, onNodesChange, onEdgesChange, setEdges } = useDiagramCanvasModel({
    effectiveLineStyle,
    elkLayout,
    globalTypeMode,
    hasManualLayout,
    linePattern,
    onColumnSelect: handleDiagramColumnSelect,
    onGoToSql: handleGoToSql,
    onPreview: handlePreviewTable,
    onTableStyleChange: handleTableStyleChange,
    parsed,
    relationGrouping,
    tableConfig,
    tableMap,
    tableDesignTheme,
    tablePositions,
    theme,
  });
  const presentationMembership = useStablePresentationMembership(nodes);
  const {
      activeFocusContext,
      activeFocusContextId,
      activeFocusContextIndex,
      activeFocusContextViewportNodeIds,
      automaticReason: diagramPresentationAutomaticReason,
      canDecreaseFocusDepth,
      canIncreaseFocusDepth,
      currentAutomaticStrategy,
      effectiveMode: diagramPresentationMode,
      effectiveReason: diagramPresentationEffectiveReason,
      effectiveFocusDepth,
      focusContextCount,
      focusViewportRequestToken,
      focusSignalCount: diagramPresentationFocusSignalCount,
      focusVisibilityLabel,
      focusVisibleEdgeCount,
      focusVisibleNodeCount,
      goToNextFocusContext,
      goToPreviousFocusContext,
      expandFocusDepth,
      isAutomaticMode: isDiagramPresentationAutomatic,
      isAutomaticFocusDepth,
      requestCenterActiveFocusContext,
      requestedMode: requestedDiagramPresentationMode,
      reduceFocusDepth,
      resetToAutomaticMode: resetDiagramPresentationMode,
      searchMatchCount: diagramPresentationSearchMatchCount,
      setManualMode: setDiagramPresentationMode,
     visibleEdgeIds,
     visibleNodeIds,
  } = useDiagramPresentation({
    ambiguousFocusTableIds: focusedAmbiguousTables,
    edges,
    highlightedEdgeIds,
    membership: presentationMembership,
    previewTableId: previewTable,
    relationships: parsed.relationships,
    searchQuery: diagramSearch,
    searchFocusedTableIds: searchFocusedTables,
    searchResultTableIds,
    selectedRelationshipId,
    selectedTableId: selected?.table ?? null,
    tableNameById,
  });
  const presentedNodes = useMemo(
    () => nodes.filter((node) => visibleNodeIds.has(node.id)),
    [nodes, visibleNodeIds],
  );
  const presentedEdges = useMemo(
    () => edges.filter((edge) => visibleEdgeIds.has(edge.id)),
    [edges, visibleEdgeIds],
  );

  useEffect(() => () => {
    if (focusResetTimerRef.current) window.clearTimeout(focusResetTimerRef.current);
  }, []);

  const centerFocusContextInViewport = useCallback(() => {
    if (!activeFocusContextId) return;

    const contextNodes = nodes.filter((node) => activeFocusContextViewportNodeIds.has(node.id));
    if (contextNodes.length === 0) return;

    if (viewMode === 'tabs') setActiveViewTab('diagram');

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        void reactFlowRef.current?.fitView({
          nodes: contextNodes,
          duration: 420,
          padding: contextNodes.length === 1 ? 0.72 : 0.4,
          minZoom: 0.12,
          maxZoom: 1.25,
        });
      });
    });
  }, [activeFocusContextId, activeFocusContextViewportNodeIds, nodes, setActiveViewTab, viewMode]);

  useEffect(() => {
    if (!focusViewportRequestToken) return;
    if (handledFocusViewportRequestRef.current === focusViewportRequestToken) return;

    handledFocusViewportRequestRef.current = focusViewportRequestToken;
    centerFocusContextInViewport();
  }, [centerFocusContextInViewport, focusViewportRequestToken]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      if (isKeyboardTypingContext(event.target)) return;

      if (event.code === 'BracketLeft') {
        if (focusContextCount <= 1) return;
        event.preventDefault();
        goToPreviousFocusContext();
        return;
      }

      if (event.code === 'BracketRight') {
        if (focusContextCount <= 1) return;
        event.preventDefault();
        goToNextFocusContext();
        return;
      }

      if (event.code === 'KeyC') {
        if (!activeFocusContextId) return;
        event.preventDefault();
        requestCenterActiveFocusContext();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeFocusContextId, focusContextCount, goToNextFocusContext, goToPreviousFocusContext, requestCenterActiveFocusContext]);

  const focusTablesAndColumns = useCallback((tableKeys: Set<string>, columnKeys: Set<string>) => {
    setFocusedAmbiguousTables(tableKeys);
    setFocusedAmbiguousColumns(columnKeys);

    const focusNodes = nodes.filter((node) => tableKeys.has(node.id));
    if (focusNodes.length > 0) {
      if (viewMode === 'tabs') setActiveViewTab('diagram');
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          void reactFlowRef.current?.fitView({
            nodes: focusNodes,
            duration: 450,
            padding: tableKeys.size === 1 ? 0.5 : 0.35,
            minZoom: 0.12,
            maxZoom: 1.2,
          });
        });
      });
    }

    if (focusResetTimerRef.current) window.clearTimeout(focusResetTimerRef.current);
    focusResetTimerRef.current = window.setTimeout(() => {
      setFocusedAmbiguousTables(new Set());
      setFocusedAmbiguousColumns(new Set());
    }, 5000);
  }, [nodes, setActiveViewTab, viewMode]);

  const focusAmbiguousReference = useCallback((reference: AmbiguousReference) => {
    focusTablesAndColumns(
      new Set<string>([reference.sourceTable, ...reference.candidateTargetTables]),
      new Set<string>([`${reference.sourceTable}.${normalize(reference.sourceColumn)}`]),
    );
  }, [focusTablesAndColumns]);

  const focusDiagramSearchResult = useCallback((result: DiagramSearchResult) => {
    setSelected(null);
    setSelectedRelationshipId(null);
    setSearchFocusedTables(new Set<string>([result.tableKey]));
    setSearchFocusedColumns(
      result.columnName ? new Set<string>([`${result.tableKey}.${normalize(result.columnName)}`]) : new Set<string>(),
    );
    focusTablesAndColumns(
      new Set<string>([result.tableKey]),
      result.columnName ? new Set<string>([`${result.tableKey}.${normalize(result.columnName)}`]) : new Set<string>(),
    );
  }, [focusTablesAndColumns]);
  const clearDiagramSearchFocus = useCallback(() => {
    setSearchFocusedTables(new Set());
    setSearchFocusedColumns(new Set());
  }, []);
  const requestGlobalRelayout = useCallback(() => {
    setLayoutRevision((current) => current + 1);
  }, []);
  useEffect(() => {
    if (diagramSearch.trim()) return;
    clearDiagramSearchFocus();
  }, [clearDiagramSearchFocus, diagramSearch]);
  useEffect(() => {
    if (!hasHydrated) return;
    if (!isDiagramModelReady) return;
    if (layoutPending) return;
    if (parsed.tables.length > 0 && nodes.length !== parsed.tables.length) return;

    let frameB: number | null = null;
    const frameA = window.requestAnimationFrame(() => {
      frameB = window.requestAnimationFrame(() => {
        finalizeRun(parseRunId);
      });
    });

    return () => {
      window.cancelAnimationFrame(frameA);
      if (frameB) window.cancelAnimationFrame(frameB);
    };
  }, [finalizeRun, hasHydrated, isDiagramModelReady, layoutPending, nodes.length, parseRunId, parsed.tables.length]);

  const onConnect = useCallback((connection: Connection) => setEdges((eds) => addEdge(connection, eds)), [setEdges]);
  const onEdgeClick = useCallback((_: unknown, edge: Edge) => {
    setSelected(null);
    setSelectedRelationshipId((prev) => (prev === edge.id ? null : edge.id));
  }, []);
  const onPaneClick = useCallback(() => {
    setSelected(null);
    setSelectedRelationshipId(null);
  }, []);

  const exportDiagram = useCallback(
    async (format: 'svg' | 'png' | 'jpeg') => {
      if (!exportRef.current) {
        setExportingFormat(null);
        return;
      }

      try {
        const viewportEl = exportRef.current.querySelector('.react-flow__viewport') as HTMLElement | null;
        if (!viewportEl) return;

        const hasNodes = presentedNodes.length > 0;
        const fallbackWidth = Math.max(EXPORT_MIN_WIDTH, exportRef.current.clientWidth);
        const fallbackHeight = Math.max(EXPORT_MIN_HEIGHT, exportRef.current.clientHeight);

        const bounds = hasNodes
          ? getNodesBounds(presentedNodes)
          : {
              x: 0,
              y: 0,
              width: fallbackWidth,
              height: fallbackHeight,
            };

        const width = Math.max(EXPORT_MIN_WIDTH, Math.ceil(Math.max(bounds.width, 1) + EXPORT_PADDING * 2));
        const height = Math.max(EXPORT_MIN_HEIGHT, Math.ceil(Math.max(bounds.height, 1) + EXPORT_PADDING * 2));
        const viewport = getViewportForBounds(bounds, width, height, 0.12, 2, 0.08);
        const backgroundColor = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#0c1636';

        const options = {
          cacheBust: true,
          width,
          height,
          backgroundColor,
          style: {
            width: `${width}px`,
            height: `${height}px`,
            transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
            transformOrigin: '0 0',
            background: backgroundColor,
            backgroundColor,
          },
        };

        if (format === 'svg') {
          const data = await toSvg(viewportEl, options);
          const withBackground = ensureSvgBackground(data, backgroundColor);
          downloadDataUrl('diagram.svg', withBackground);
          return;
        }

        if (format === 'png') {
          const data = await toPng(viewportEl, {
            ...options,
            pixelRatio: exportScale,
          });
          downloadDataUrl('diagram.png', data);
          return;
        }

        const data = await toJpeg(viewportEl, {
          ...options,
          pixelRatio: exportScale,
          quality: 0.95,
        });
        downloadDataUrl('diagram.jpg', data);
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Error exportando diagrama:', error);
      } finally {
        setExportingFormat(null);
      }
    },
    [exportScale, presentedNodes],
  );

  const handleExportDiagram = useCallback(
    (format: 'svg' | 'png' | 'jpeg') => {
      if (exportingFormat) return;

      setExportingFormat(format);

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          void exportDiagram(format);
        });
      });
    },
    [exportDiagram, exportingFormat],
  );

  const previewData = parsed.tables.find((table) => table.key === previewTable) ?? null;
  const loadBenchmarkDataset = useCallback(
    (presetId: BenchmarkDatasetPresetId) => {
      if (!isBenchmarkDatasetInteractiveSupported(presetId)) return;

      const dataset = createBenchmarkDataset(presetId);

      pendingBenchmarkMetaRef.current = {
        datasetId: dataset.id,
        datasetLabel: dataset.label,
        datasetVersion: dataset.version,
        trigger: 'dataset-load',
      };
      clearTablePositions();
      setSelected(null);
      setSelectedRelationshipId(null);
      setSqlText(dataset.sql);
    },
    [clearTablePositions, setSqlText],
  );

  const rerunBenchmarkDataset = useCallback((presetId: BenchmarkDatasetPresetId) => {
    if (!isBenchmarkDatasetInteractiveSupported(presetId)) return;

    const dataset = createBenchmarkDataset(presetId);

    pendingBenchmarkMetaRef.current = {
      datasetId: dataset.id,
      datasetLabel: dataset.label,
      datasetVersion: dataset.version,
      trigger: 'manual-rerun',
    };
    clearTablePositions();
    setSelected(null);
    setSelectedRelationshipId(null);
    setBenchmarkRunRevision((current) => current + 1);
  }, [clearTablePositions]);

  const copyBenchmarkResults = useCallback(async () => {
    if (history.length === 0 || typeof navigator === 'undefined' || !navigator.clipboard) return;

    try {
      await navigator.clipboard.writeText(serializeBenchmarkResults(history));
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('No se pudo copiar el baseline al portapapeles:', error);
    }
  }, [history]);

  const hasSavedDiagramViewport = Boolean(diagramViewport);
  const setSessionViewport = useCallback(
    (viewport: Viewport | DiagramViewport) => {
      setDiagramViewport({
        x: viewport.x,
        y: viewport.y,
        zoom: viewport.zoom,
      });
    },
    [setDiagramViewport],
  );
  const editorPanel = (
    <div style={{ minHeight: 0, display: 'grid', height: '100%' }}>
      <SqlEditorPanel
        sqlText={sqlText}
        onSqlChange={setSqlText}
        onGoToLine={goToLine}
        onGoToLineHandled={() => setGoToLine(null)}
        errors={parsed.errors}
        warnings={parsed.warnings}
        ambiguousReferences={parsed.ambiguousReferences}
        onAmbiguousReferenceSelect={focusAmbiguousReference}
        dialect={dialect}
        onDialectChange={setDialect}
        theme={theme}
        themeReady={hasHydrated}
      />
    </div>
  );
  const diagramPanel = (
    <DiagramWorkspace
      diagramSearch={diagramSearch}
      diagramSearchResults={diagramSearchResults}
      diagramViewport={diagramViewport}
      disableViewportCulling={Boolean(exportingFormat)}
      edges={presentedEdges}
      exportRef={exportRef}
      hasSavedDiagramViewport={hasSavedDiagramViewport}
      highlightedEdgeIds={highlightedEdgeIds}
      nodes={presentedNodes}
      onClearSearchHighlights={() => {
        clearDiagramSearchFocus();
      }}
      onConnect={onConnect}
      onDiagramSearchChange={setDiagramSearch}
      onEdgeClick={onEdgeClick}
      onEdgesChange={onEdgesChange}
      onFocusDiagramSearchResult={focusDiagramSearchResult}
      onNodeDragStart={(node) => handleNodeDragStart(node.id)}
      onNodePositionCommit={(node) => commitTablePosition(node.id, node.position)}
      onNodesChange={onNodesChange}
      onPaneClick={onPaneClick}
      onViewportChange={setSessionViewport}
      reactFlowRef={reactFlowRef}
      viewportPinnedNodeIds={viewportPinnedNodeIds}
    />
  );
  const presentedNodeCountLabel = `${presentedNodes.length}/${nodes.length} tablas`;
  const presentedEdgeCountLabel = `${presentedEdges.length}/${edges.length} relaciones`;
  const isSearchContextActive = diagramSearch.trim().length > 0;
  const presentationExplanation = isDiagramPresentationAutomatic
    ? diagramPresentationAutomaticReason
    : diagramPresentationEffectiveReason;
  const isFocusModeActive = diagramPresentationMode === 'focus';
  const focusDepthStatus = isFocusModeActive
    ? `${getFocusDepthBadge(effectiveFocusDepth)} · ${focusVisibilityLabel}${isAutomaticFocusDepth ? ' · auto' : ' · manual'}`
    : null;
  const focusContextStatus = focusContextCount > 0
    ? `${activeFocusContextIndex + 1}/${focusContextCount}${activeFocusContext ? ` · ${activeFocusContext.label}` : ''}`
    : null;

  return (
    <main className="app-root" style={{ height: '100dvh', padding: 14, display: 'grid', gridTemplateRows: 'auto 1fr', gap: 10 }}>
      <header className="panel-card" style={{ padding: 12, display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ display: 'grid', gap: 8, minWidth: 0, flex: '1 1 420px' }}>
          <div style={{ display: 'grid', gap: 2 }}>
            <strong style={{ fontSize: 15, lineHeight: 1.1 }}>SQL Data Modeler</strong>
            <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>PostgreSQL + Oracle · ERD en tiempo real</span>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
            {layoutPending && <span className="status-pill">Reordenando layout…</span>}
            <span className="status-pill">
              Estrategia activa: {getPresentationStrategyLabel(currentAutomaticStrategy)}
            </span>
            <span className="status-pill">
              Modo visible: {getPresentationModeLabel(diagramPresentationMode)}
              {isDiagramPresentationAutomatic ? ' · auto' : ' · manual'}
            </span>
            <span className="status-pill">
              {presentedNodeCountLabel} · {presentedEdgeCountLabel}
            </span>
            {focusDepthStatus && <span className="status-pill">{focusDepthStatus}</span>}
            {isSearchContextActive && (
              <span className="status-pill">
                Búsqueda activa · {diagramPresentationSearchMatchCount} coincidencia{diagramPresentationSearchMatchCount === 1 ? '' : 's'}
              </span>
            )}
            {layoutMode === 'fallback' && layoutWarning && (
              <span
                className="status-pill"
                title={formatLayoutDiagnosticsTitle(layoutDiagnostics)}
                style={{
                  color: '#f59e0b',
                  borderColor: 'color-mix(in srgb, #f59e0b 35%, var(--border))',
                  background: 'color-mix(in srgb, #f59e0b 10%, transparent)',
                }}
              >
                {layoutWarning}
              </span>
            )}
          </div>

          <div style={{ display: 'grid', gap: 4 }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{presentationExplanation}</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, fontSize: 12, color: 'var(--text-muted)' }}>
              {diagramPresentationFocusSignalCount > 0 && <span>Señales activas: {diagramPresentationFocusSignalCount}</span>}
              {focusContextStatus && <span>Contexto activo: {focusContextStatus}</span>}
              {activeFocusContext && <span>Origen del foco: {activeFocusContext.originLabel}</span>}
              {isFocusModeActive && (
                <>
                  <span>
                    Focus en {getFocusDepthBadge(effectiveFocusDepth)}: {focusVisibilityLabel?.toLowerCase()}.
                  </span>
                  <span>
                    Visible ahora: {focusVisibleNodeCount ?? presentedNodes.length} tablas · {focusVisibleEdgeCount ?? presentedEdges.length} relaciones.
                  </span>
                </>
              )}
              {focusContextCount > 0 && <span>Shortcuts: [ anterior · ] siguiente · C centrar</span>}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', alignItems: 'center', gap: 10, flex: '0 1 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
              Modo diagrama
              <select
                className="select-modern"
                value={requestedDiagramPresentationMode}
                onChange={(event) => {
                  const nextMode = event.target.value as DiagramPresentationMode | 'auto';
                  if (nextMode === 'auto') {
                    resetDiagramPresentationMode();
                    return;
                  }

                  setDiagramPresentationMode(nextMode);
                }}
              >
                <option value="auto">Automático</option>
                <option value="full">Full</option>
                <option value="overview">Overview</option>
                <option value="focus">Focus</option>
              </select>
            </label>

            <button
              className="btn btn-sm btn-ghost"
              disabled={focusContextCount <= 1}
              onClick={goToPreviousFocusContext}
              title="Ir al contexto anterior ([)"
            >
              Contexto anterior
            </button>

            <button
              className="btn btn-sm btn-ghost"
              disabled={focusContextCount <= 1}
              onClick={goToNextFocusContext}
              title="Ir al contexto siguiente (])"
            >
              Contexto siguiente
            </button>

            <button
              className="btn btn-sm btn-ghost"
              disabled={!activeFocusContextId}
              onClick={requestCenterActiveFocusContext}
              title="Recentrar el contexto actual (C)"
            >
              Centrar foco
            </button>

            <button
              className="btn btn-sm btn-ghost"
              disabled={diagramPresentationMode === 'overview'}
              onClick={() => setDiagramPresentationMode('overview')}
              title="Volver a overview"
            >
              Ver overview
            </button>

            <button
              className="btn btn-sm btn-ghost"
              disabled={!isFocusModeActive || !canDecreaseFocusDepth}
              onClick={reduceFocusDepth}
              title="Reducir vecindario visible del focus"
            >
              Menos contexto
            </button>

            <button
              className="btn btn-sm btn-ghost"
              disabled={!isFocusModeActive || !canIncreaseFocusDepth}
              onClick={expandFocusDepth}
              title="Expandir vecindario visible del focus"
            >
              Más contexto
            </button>

            <button
              className="btn btn-sm btn-ghost"
              disabled={isDiagramPresentationAutomatic}
              onClick={resetDiagramPresentationMode}
              title="Volver a la estrategia automática"
            >
              Reset auto
            </button>
          </div>

          {exportingFormat && (
            <span className="status-pill">
              <span className="loader-dot" /> Exportando {formatExportLabel(exportingFormat)}...
            </span>
          )}

          <div
            className="theme-switcher"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: 4,
              borderRadius: 999,
              border: '1px solid var(--border)',
              background: 'color-mix(in srgb, var(--surface-2) 88%, transparent)',
            }}
          >
          <button
            className={`theme-pill ${theme === 'light' ? 'active' : ''}`}
            aria-pressed={theme === 'light'}
            onClick={() => setTheme('light')}
            title="Tema claro"
            style={{
              background: theme === 'light' ? '#ffffff' : 'transparent',
              color: theme === 'light' ? '#0f172a' : 'var(--text-muted)',
            }}
          >
            <Sun size={14} />
          </button>

          <button
            className={`theme-pill ${theme === 'dark' ? 'active' : ''}`}
            aria-pressed={theme === 'dark'}
            onClick={() => setTheme('dark')}
            title="Tema oscuro"
            style={{
              background: theme === 'dark' ? '#111827' : 'transparent',
              color: theme === 'dark' ? '#f8fafc' : 'var(--text-muted)',
            }}
          >
            <Moon size={14} />
          </button>

          <button
            className={`theme-pill ${theme === 'deepblue' ? 'active' : ''}`}
            aria-pressed={theme === 'deepblue'}
            onClick={() => setTheme('deepblue')}
            title="Tema deepblue"
            style={{
              background: theme === 'deepblue' ? '#1d4ed8' : 'transparent',
              color: theme === 'deepblue' ? '#dbeafe' : 'var(--text-muted)',
            }}
          >
            <Sparkles size={14} />
          </button>
        </div>

        <div style={{ position: 'relative' }}>
          <button
            ref={diagramMenuTriggerRef}
            className="btn btn-icon"
            onClick={() => setOpenDiagramMenu((open) => !open)}
            title="Opciones de diagrama"
          >
            <MoreHorizontal size={16} />
          </button>

          {openDiagramMenu && (
            <div
              ref={diagramMenuRef}
              className="overlay-panel"
              style={{
                position: 'absolute',
                top: 'calc(100% + 8px)',
                right: 0,
                width: 320,
                padding: 12,
                zIndex: 90,
                display: 'grid',
                gap: 12,
              }}
            >
              <div className="overlay-section">
                <span className="overlay-label">Vista y estilo</span>

                <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
                  Tipo de vista
                  <select
                    className="select-modern"
                    value={viewMode}
                    onChange={(event) => setViewMode(event.target.value as ViewMode)}
                  >
                    <option value="split">2 paneles</option>
                    <option value="tabs">Pestañas</option>
                  </select>
                </label>

                <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
                  Tipo de dato (global)
                  <select
                    className="select-modern"
                    value={globalTypeMode}
                    onChange={(event) => setGlobalTypeMode(event.target.value as TypeDisplayMode)}
                  >
                    <option value="text">Texto</option>
                    <option value="icon">Ícono</option>
                  </select>
                </label>

                <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
                  Diseño de tablas
                  <select
                    className="select-modern"
                    value={tableDesignTheme}
                    onChange={(event) => setTableDesignTheme(event.target.value as TableDesignTheme)}
                  >
                    <option value="modern">Moderno</option>
                    <option value="dbeaver">DBeaver</option>
                  </select>
                </label>

                <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
                  Diseño visual de línea
                  <select
                    className="select-modern"
                    value={linePattern}
                    onChange={(event) => setLinePattern(event.target.value as RelationLinePattern)}
                  >
                    <option value="solid">Continua</option>
                    <option value="dashed">Punteada</option>
                  </select>
                </label>

                <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
                  Agrupación de relaciones
                  <select
                    className="select-modern"
                    value={relationGrouping}
                    onChange={(event) => {
                      setRelationGrouping(event.target.value as RelationGroupingMode);
                      requestGlobalRelayout();
                    }}
                  >
                    <option value="separate">Separadas por relación</option>
                    <option value="bundled">Unión final por tabla</option>
                  </select>
                </label>
              </div>

              <div className="overlay-section">
                <span className="overlay-label">Acciones</span>

                <button className="btn menu-item" onClick={() => {
                  clearTablePositions();
                  requestGlobalRelayout();
                  setSelected(null);
                  setSelectedRelationshipId(null);
                  setOpenDiagramMenu(false);
                }}>
                  <Sparkles size={14} /> Auto-organizar tablas
                </button>

                <button className="btn menu-item" onClick={() => {
                  resetAllTableColorsToTheme();
                  setOpenDiagramMenu(false);
                }}>
                  <Sparkles size={14} /> Reset colores al tema
                </button>
              </div>

              <div className="overlay-section">
                <span className="overlay-label">Exportar</span>

                <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
                  Escala export (PNG/JPEG)
                  <select
                    className="select-modern"
                    value={exportScale}
                    onChange={(event) => setExportScale(Number(event.target.value) as 1 | 2 | 3 | 4)}
                  >
                    <option value={1}>1x · rápido</option>
                    <option value={2}>2x · recomendado</option>
                    <option value={3}>3x · alta</option>
                    <option value={4}>4x · ultra</option>
                  </select>
                </label>

                <div className="compact-format-row">
                  {(['svg', 'png', 'jpeg'] as const).map((format) => (
                    <button
                      key={format}
                      className="btn btn-subtle btn-sm compact-format-btn"
                      disabled={Boolean(exportingFormat)}
                      aria-busy={exportingFormat === format}
                      onClick={() => {
                        handleExportDiagram(format);
                        setOpenDiagramMenu(false);
                      }}
                      title={`Exportar ${formatExportLabel(format)}`}
                    >
                      {exportingFormat === format ? <span className="loader-dot" /> : <DownloadCloud size={14} />}
                      {formatExportLabel(format)}
                    </button>
                  ))}
                </div>
               </div>
             </div>
           )}
        </div>
        </div>
      </header>

      {isBenchmarkMode && (
        <BenchmarkPanel
          latestResult={latestResult}
          history={history}
          onLoadDataset={loadBenchmarkDataset}
          onRerunDataset={rerunBenchmarkDataset}
          onCopyResults={copyBenchmarkResults}
          onClearHistory={clearHistory}
        />
      )}

      {!hasHydrated ? (
        <section
          aria-hidden="true"
          style={{
            height: '100%',
            minHeight: 0,
            borderRadius: 24,
            background: 'color-mix(in srgb, var(--panel) 72%, transparent)',
            border: '1px solid color-mix(in srgb, var(--border) 70%, transparent)',
          }}
        />
      ) : viewMode === 'split' ? (
        <section
          ref={panelsRef}
          style={{
            height: '100%',
            minHeight: 0,
            overflow: 'hidden',
            display: 'grid',
            gridTemplateColumns: `${panelSplit}% 12px minmax(0, 1fr)`,
            alignItems: 'stretch',
          }}
        >
          <div style={{ minHeight: 0, paddingRight: 8, display: 'grid' }}>{editorPanel}</div>

          <div
            role="separator"
            aria-label="Ajustar paneles"
            aria-orientation="vertical"
            title="Arrastrá para redimensionar paneles"
            onPointerDown={(event) => {
              event.preventDefault();
              setIsResizingPanels(true);
            }}
            style={{
              cursor: 'col-resize',
              display: 'grid',
              placeItems: 'center',
              borderRadius: 10,
              background: isResizingPanels ? 'color-mix(in srgb, var(--accent) 26%, transparent)' : 'transparent',
            }}
          >
            <div
              style={{
                width: 4,
                height: 74,
                borderRadius: 999,
                background: 'color-mix(in srgb, var(--text-muted) 46%, transparent)',
              }}
            />
          </div>

          <div style={{ minHeight: 0, paddingLeft: 8, display: 'grid' }}>{diagramPanel}</div>
        </section>
      ) : (
        <section style={{ height: '100%', minHeight: 0, display: 'grid', gridTemplateRows: 'auto 1fr', gap: 10 }}>
          <div className="panel-card" style={{ padding: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <div className="tab-list" role="tablist" aria-label="Vista principal">
            <button
              className="tab-btn"
              role="tab"
              aria-selected={activeViewTab === 'editor'}
              data-active={activeViewTab === 'editor'}
              onClick={() => setActiveViewTab('editor')}
            >
              Editor SQL
            </button>
            <button
              className="tab-btn"
              role="tab"
              aria-selected={activeViewTab === 'diagram'}
              data-active={activeViewTab === 'diagram'}
              onClick={() => setActiveViewTab('diagram')}
            >
              Diagrama
            </button>
            </div>
          </div>

          <div style={{ minHeight: 0, display: 'grid', overflow: 'hidden' }}>
            <div
              style={{
                minHeight: 0,
                height: '100%',
                display: activeViewTab === 'editor' ? 'grid' : 'none',
              }}
            >
              {editorPanel}
            </div>
            <div
              style={{
                minHeight: 0,
                height: '100%',
                display: activeViewTab === 'diagram' ? 'grid' : 'none',
              }}
            >
              {diagramPanel}
            </div>
          </div>
        </section>
      )}

      {previewData && (
        <div
          className="dialog-overlay"
          onClick={() => setPreviewTable(null)}
        >
          <div
            className="panel-card overlay-panel dialog-panel"
            style={{ display: 'grid', gap: 12 }}
            onClick={(event) => event.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
              <div style={{ display: 'grid', gap: 4 }}>
                <span className="overlay-label">Preview</span>
                <strong>Previsualización: {previewData.name}</strong>
              </div>
              <button className="btn btn-sm btn-ghost" onClick={() => setPreviewTable(null)}>
                Cerrar
              </button>
            </div>

            <div style={{ border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden', background: 'color-mix(in srgb, var(--surface) 92%, transparent)' }}>
              {previewData.columns.map((col) => (
                <div
                  key={col.name}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '72px 1fr auto',
                    minHeight: 40,
                    padding: '10px 12px',
                    borderBottom: '1px solid var(--border)',
                    fontSize: 12,
                    gap: 8,
                    alignItems: 'center',
                  }}
                >
                  <strong style={{ color: 'var(--text-muted)', fontSize: 11 }}>{col.isPrimary ? 'PK' : col.isForeign ? 'FK' : 'COL'}</strong>
                  <span>{col.name}</span>
                  <span style={{ color: 'var(--text-muted)' }}>{col.rawType}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
