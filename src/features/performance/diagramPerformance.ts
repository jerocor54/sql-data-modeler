import { useCallback, useRef, useState } from 'react';
import type { ParseResult } from '../../types/erd';

export type DiagramBenchmarkTrigger = 'editor-change' | 'dataset-load' | 'manual-rerun';
export type DiagramBenchmarkLayoutEngine = 'elk' | 'fallback';

export interface DiagramBenchmarkRunMeta {
  datasetId?: string;
  datasetLabel?: string;
  datasetVersion?: string;
  trigger: DiagramBenchmarkTrigger;
}

export interface DiagramBenchmarkResult extends DiagramBenchmarkRunMeta {
  runId: number;
  tableCount: number;
  relationshipCount: number;
  parseMs: number;
  layoutMs: number;
  totalMs: number;
  layoutEngine: DiagramBenchmarkLayoutEngine;
  recordedAt: string;
}

interface DiagramBenchmarkRun extends DiagramBenchmarkRunMeta {
  runId: number;
  parseMs: number;
  layoutMs: number;
  layoutEngine: DiagramBenchmarkLayoutEngine;
  tableCount: number;
  relationshipCount: number;
  readyRecorded: boolean;
}

interface MeasureParseInput {
  meta: DiagramBenchmarkRunMeta;
}

const PERFORMANCE_PREFIX = 'sql-data-modeler:benchmark';

function buildMarkName(runId: number, phase: string, boundary: 'start' | 'end'): string {
  return `${PERFORMANCE_PREFIX}:${runId}:${phase}:${boundary}`;
}

function measureDuration(runId: number, phase: string): number {
  const startMark = buildMarkName(runId, phase, 'start');
  const endMark = buildMarkName(runId, phase, 'end');
  const measureName = `${PERFORMANCE_PREFIX}:${runId}:${phase}`;

  performance.mark(endMark);
  performance.measure(measureName, startMark, endMark);
  const entry = performance.getEntriesByName(measureName).at(-1);

  performance.clearMarks(startMark);
  performance.clearMarks(endMark);
  performance.clearMeasures(measureName);

  return entry?.duration ?? 0;
}

export function useDiagramPerformance() {
  const [latestResult, setLatestResult] = useState<DiagramBenchmarkResult | null>(null);
  const [history, setHistory] = useState<DiagramBenchmarkResult[]>([]);
  const runCounterRef = useRef(0);
  const activeRunRef = useRef<DiagramBenchmarkRun | null>(null);

  const createParseRun = useCallback((input: MeasureParseInput): number => {
    const run: DiagramBenchmarkRun = {
      ...input.meta,
      runId: ++runCounterRef.current,
      parseMs: 0,
      layoutMs: 0,
      layoutEngine: 'elk',
      tableCount: 0,
      relationshipCount: 0,
      readyRecorded: false,
    };

    activeRunRef.current = run;
    performance.mark(buildMarkName(run.runId, 'total', 'start'));
    performance.mark(buildMarkName(run.runId, 'parse', 'start'));
    return run.runId;
  }, []);

  const finishParse = useCallback((runId: number, parsed: ParseResult) => {
    const run = activeRunRef.current;
    if (!run || run.runId !== runId) return;

    run.parseMs = measureDuration(run.runId, 'parse');
    run.tableCount = parsed.tables.length;
    run.relationshipCount = parsed.relationships.length;
  }, []);

  const startLayout = useCallback((runId: number) => {
    const run = activeRunRef.current;
    if (!run || run.runId !== runId) return;
    performance.mark(buildMarkName(run.runId, 'layout', 'start'));
  }, []);

  const finishLayout = useCallback((runId: number, layoutEngine: DiagramBenchmarkLayoutEngine) => {
    const run = activeRunRef.current;
    if (!run || run.runId !== runId) return;
    run.layoutEngine = layoutEngine;
    run.layoutMs = measureDuration(run.runId, 'layout');
  }, []);

  const finalizeRun = useCallback((runId: number | null | undefined) => {
    const run = activeRunRef.current;
    if (!run || run.readyRecorded || run.runId !== runId) return null;

    run.readyRecorded = true;
    const totalMs = measureDuration(run.runId, 'total');
    const result: DiagramBenchmarkResult = {
      runId: run.runId,
      datasetId: run.datasetId,
      datasetLabel: run.datasetLabel,
      datasetVersion: run.datasetVersion,
      trigger: run.trigger,
      tableCount: run.tableCount,
      relationshipCount: run.relationshipCount,
      parseMs: Number(run.parseMs.toFixed(2)),
      layoutMs: Number(run.layoutMs.toFixed(2)),
      totalMs: Number(totalMs.toFixed(2)),
      layoutEngine: run.layoutEngine,
      recordedAt: new Date().toISOString(),
    };

    setLatestResult(result);
    setHistory((current) => [result, ...current].slice(0, 12));
    return result;
  }, []);

  const clearHistory = useCallback(() => {
    setLatestResult(null);
    setHistory([]);
  }, []);

  return {
    latestResult,
    history,
    createParseRun,
    finishParse,
    startLayout,
    finishLayout,
    finalizeRun,
    clearHistory,
  };
}

export function serializeBenchmarkResults(results: DiagramBenchmarkResult[]): string {
  return JSON.stringify(results, null, 2);
}
