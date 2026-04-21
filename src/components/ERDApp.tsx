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
import { useAppStore } from '../store/appStore';
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

interface ERDAppProps {
  mode?: 'app' | 'benchmark';
}

export default function ERDApp({ mode = 'app' }: ERDAppProps) {
  const {
    sqlText,
    setSqlText,
    theme,
    hasHydrated,
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
    activeViewTab,
    setActiveViewTab,
    diagramViewport,
    setDiagramViewport,
    panelSplit,
    setPanelSplit,
    tableConfig,
    setTableConfig,
    resetAllTableColorsToTheme,
    tablePositions,
    setTablePosition,
    resetTablePositions,
  } = useAppStore();

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
  const exportRef = useRef<HTMLDivElement>(null);
  const panelsRef = useRef<HTMLElement>(null);
  const diagramMenuRef = useRef<HTMLDivElement>(null);
  const diagramMenuTriggerRef = useRef<HTMLButtonElement>(null);
  const reactFlowRef = useRef<ReactFlowInstance<FlowNode, Edge> | null>(null);
  const focusResetTimerRef = useRef<number | null>(null);

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
  const viewportPinnedNodeIds = useMemo(() => {
    const pinned = new Set<string>(focusedAmbiguousTables);

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
  }, [focusedAmbiguousTables, parsed.relationships, previewTable, selected, selectedRelationshipId]);
  useSyncDiagramCanvasTransientState({
    activeColumns,
    ambiguousColumns,
    ambiguousTableKeys,
    focusedAmbiguousColumns,
    focusedAmbiguousTables,
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
  const { elkLayout, layoutMode, layoutPending, layoutWarning } = useAutoLayout({
    finishLayout,
    isModelReady: isDiagramModelReady,
    layoutRevision,
    parseRunId,
    relationGrouping,
    relationships: parsed.relationships,
    startLayout,
    tablePositions,
    tables: parsed.tables,
  });
  const { nodes, edges, onNodesChange, onEdgesChange, setEdges } = useDiagramCanvasModel({
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

  useEffect(() => () => {
    if (focusResetTimerRef.current) window.clearTimeout(focusResetTimerRef.current);
  }, []);

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
    focusTablesAndColumns(
      new Set<string>([result.tableKey]),
      result.columnName ? new Set<string>([`${result.tableKey}.${normalize(result.columnName)}`]) : new Set<string>(),
    );
  }, [focusTablesAndColumns]);
  useEffect(() => {
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
  }, [finalizeRun, isDiagramModelReady, layoutPending, nodes.length, parseRunId, parsed.tables.length]);

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

        const hasNodes = nodes.length > 0;
        const fallbackWidth = Math.max(EXPORT_MIN_WIDTH, exportRef.current.clientWidth);
        const fallbackHeight = Math.max(EXPORT_MIN_HEIGHT, exportRef.current.clientHeight);

        const bounds = hasNodes
          ? getNodesBounds(nodes)
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
    [exportScale, nodes],
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
      resetTablePositions();
      setSelected(null);
      setSelectedRelationshipId(null);
      setSqlText(dataset.sql);
    },
    [resetTablePositions, setSqlText],
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
    resetTablePositions();
    setSelected(null);
    setSelectedRelationshipId(null);
    setBenchmarkRunRevision((current) => current + 1);
  }, [resetTablePositions]);

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
  const setPersistedViewport = useCallback(
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
      edges={edges}
      exportRef={exportRef}
      hasSavedDiagramViewport={hasSavedDiagramViewport}
      highlightedEdgeIds={highlightedEdgeIds}
      nodes={nodes}
      onClearSearchHighlights={() => {
        setFocusedAmbiguousTables(new Set());
        setFocusedAmbiguousColumns(new Set());
      }}
      onConnect={onConnect}
      onDiagramSearchChange={setDiagramSearch}
      onEdgeClick={onEdgeClick}
      onEdgesChange={onEdgesChange}
      onFocusDiagramSearchResult={focusDiagramSearchResult}
      onNodePositionCommit={(node) => setTablePosition(node.id, node.position)}
      onNodesChange={onNodesChange}
      onPaneClick={onPaneClick}
      onViewportChange={setPersistedViewport}
      reactFlowRef={reactFlowRef}
      viewportPinnedNodeIds={viewportPinnedNodeIds}
    />
  );

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
            {layoutMode === 'fallback' && layoutWarning && (
              <span
                className="status-pill"
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
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', alignItems: 'center', gap: 10, flex: '0 1 auto' }}>
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
                      setLayoutRevision((prev) => prev + 1);
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
                  resetTablePositions();
                  setLayoutRevision((prev) => prev + 1);
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
