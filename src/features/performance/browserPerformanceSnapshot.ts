import { useEffect, useMemo } from 'react';
import type { ViewMode } from '../../types/erd';
import type { LayoutFallbackDiagnostics } from '../auto-layout/layoutWorkerProtocol';
import type { LayoutEngineMode } from '../auto-layout/useAutoLayout';
import type { DiagramPresentationMode, DiagramPresentationStrategy } from '../diagram-presentation/useDiagramPresentation';
import type { DiagramBenchmarkResult } from './diagramPerformance';
import type { LongTaskSummary } from './useLongTaskObserver';

export const DEV_BROWSER_PERFORMANCE_SNAPSHOT_KEY = '__SQL_DATA_MODELER_PERF__';

interface BrowserPerformanceSnapshotInput {
  latestResult: DiagramBenchmarkResult | null;
  layoutDiagnostics: LayoutFallbackDiagnostics | null;
  layoutMode: LayoutEngineMode;
  layoutPending: boolean;
  layoutWarning: string;
  longTasks: LongTaskSummary;
  presentationIsAutomatic: boolean;
  presentationMode: DiagramPresentationMode;
  presentationStrategy: DiagramPresentationStrategy;
  presentedEdgeCount: number;
  presentedNodeCount: number;
  relationshipCount: number;
  sqlTextLength: number;
  tableCount: number;
  totalEdgeCount: number;
  totalNodeCount: number;
  viewMode: ViewMode;
}

export interface BrowserPerformanceSnapshot {
  schemaVersion: 'phase-7-dev-v1';
  generatedAt: string;
  timings: {
    parseMs: number | null;
    layoutMs: number | null;
    renderApproxMs: number | null;
    totalMs: number | null;
  };
  graph: {
    nodes: {
      presented: number;
      total: number;
    };
    edges: {
      presented: number;
      total: number;
    };
  };
  model: {
    sqlTextLength: number;
    tableCount: number;
    relationshipCount: number;
  };
  presentation: {
    automatic: boolean;
    layoutEngine: DiagramBenchmarkResult['layoutEngine'] | null;
    layoutMode: LayoutEngineMode;
    layoutPending: boolean;
    mode: DiagramPresentationMode;
    strategy: DiagramPresentationStrategy;
    viewMode: ViewMode;
  };
  diagnostics: {
    fallbackActive: boolean;
    layoutWarning: string | null;
    layoutDiagnostics: {
      cause: LayoutFallbackDiagnostics['cause'];
      provenance: {
        stage: NonNullable<LayoutFallbackDiagnostics['provenance']>['stage'] | null;
        message: string | null;
      } | null;
    } | null;
  };
  longTasks: LongTaskSummary;
}

function serializeLayoutDiagnostics(diagnostics: LayoutFallbackDiagnostics | null): BrowserPerformanceSnapshot['diagnostics']['layoutDiagnostics'] {
  if (!diagnostics) return null;

  return {
    cause: diagnostics.cause,
    provenance: diagnostics.provenance
      ? {
          stage: diagnostics.provenance.stage ?? null,
          message: diagnostics.provenance.message ?? null,
        }
      : null,
  };
}

function deepFreeze<T>(value: T): Readonly<T> {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value as Record<string, unknown>)) {
      deepFreeze(nested);
    }
  }

  return value as Readonly<T>;
}

export function createBrowserPerformanceSnapshot(input: BrowserPerformanceSnapshotInput): BrowserPerformanceSnapshot {
  const parseMs = input.latestResult?.parseMs ?? null;
  const layoutMs = input.latestResult?.layoutMs ?? null;
  const totalMs = input.latestResult?.totalMs ?? null;
  const renderApproxMs = input.latestResult
    ? Math.max(0, input.latestResult.totalMs - input.latestResult.parseMs - input.latestResult.layoutMs)
    : null;
  const fallbackActive = input.layoutMode === 'fallback' || Boolean(input.layoutDiagnostics);

  return {
    schemaVersion: 'phase-7-dev-v1',
    generatedAt: new Date().toISOString(),
    timings: {
      parseMs,
      layoutMs,
      renderApproxMs,
      totalMs,
    },
    graph: {
      nodes: {
        presented: input.presentedNodeCount,
        total: input.totalNodeCount,
      },
      edges: {
        presented: input.presentedEdgeCount,
        total: input.totalEdgeCount,
      },
    },
    model: {
      sqlTextLength: input.sqlTextLength,
      tableCount: input.tableCount,
      relationshipCount: input.relationshipCount,
    },
    presentation: {
      automatic: input.presentationIsAutomatic,
      layoutEngine: input.latestResult?.layoutEngine ?? null,
      layoutMode: input.layoutMode,
      layoutPending: input.layoutPending,
      mode: input.presentationMode,
      strategy: input.presentationStrategy,
      viewMode: input.viewMode,
    },
    diagnostics: {
      fallbackActive,
      layoutWarning: input.layoutWarning || null,
      layoutDiagnostics: serializeLayoutDiagnostics(input.layoutDiagnostics),
    },
    longTasks: {
      supported: input.longTasks.supported,
      count: input.longTasks.count,
      maxDuration: input.longTasks.maxDuration,
      lastDuration: input.longTasks.lastDuration,
      lastObservedAt: input.longTasks.lastObservedAt,
    },
  };
}

export function useBrowserPerformanceSnapshot(input: BrowserPerformanceSnapshotInput): BrowserPerformanceSnapshot {
  return useMemo(() => createBrowserPerformanceSnapshot(input), [
    input.latestResult,
    input.layoutDiagnostics,
    input.layoutMode,
    input.layoutPending,
    input.layoutWarning,
    input.longTasks,
    input.presentationIsAutomatic,
    input.presentationMode,
    input.presentationStrategy,
    input.presentedEdgeCount,
    input.presentedNodeCount,
    input.relationshipCount,
    input.sqlTextLength,
    input.tableCount,
    input.totalEdgeCount,
    input.totalNodeCount,
    input.viewMode,
  ]);
}

export function useDevBrowserPerformanceExport(snapshot: BrowserPerformanceSnapshot): void {
  useEffect(() => {
    if (!import.meta.env.DEV || typeof window === 'undefined') return;

    Object.defineProperty(window, DEV_BROWSER_PERFORMANCE_SNAPSHOT_KEY, {
      value: deepFreeze(snapshot),
      configurable: true,
      enumerable: false,
      writable: false,
    });

    return () => {
      delete window.__SQL_DATA_MODELER_PERF__;
    };
  }, [snapshot]);
}

declare global {
  interface Window {
    __SQL_DATA_MODELER_PERF__?: Readonly<BrowserPerformanceSnapshot>;
  }
}
