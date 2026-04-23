import { useEffect, useRef, useState } from 'react';

import type { ElkLayoutResult } from '../../lib/elkLayout';
import { createWorkerJobId } from '../../lib/workers/jobProtocol';
import type {
  DiagramViewport,
  Position,
  RelationGroupingMode,
  Relationship,
  TableModel,
} from '../../types/erd';
import type { DiagramBenchmarkLayoutEngine, DiagramBenchmarkLayoutMetrics } from '../performance/diagramPerformance';
import LayoutWorker from './layout.worker?worker';
import { createLayoutGraphModel } from './layoutModel';
import { LAYOUT_WORKER_KIND, type LayoutWorkerRequest, type LayoutWorkerResponse } from './layoutWorkerProtocol';

interface UseAutoLayoutInput {
  finishLayout: (
    runId: number,
    layoutEngine: DiagramBenchmarkLayoutEngine,
    layoutMetrics?: DiagramBenchmarkLayoutMetrics,
  ) => void;
  isModelReady: boolean;
  layoutRevision: number;
  parseRunId: number | null;
  relationGrouping: RelationGroupingMode;
  relationships: Relationship[];
  startLayout: (runId: number) => void;
  tablePositions: Record<string, Position | DiagramViewport>;
  tables: TableModel[];
}

export type LayoutEngineMode = 'elk' | 'fallback';

const payloadEncoder = new TextEncoder();

export function useAutoLayout({
  finishLayout,
  isModelReady,
  layoutRevision,
  parseRunId,
  relationGrouping,
  relationships,
  startLayout,
  tablePositions,
  tables,
}: UseAutoLayoutInput) {
  const activeJobIdRef = useRef<string | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const [elkLayout, setElkLayout] = useState<ElkLayoutResult | null>(null);
  const [layoutMode, setLayoutMode] = useState<LayoutEngineMode>('elk');
  const [layoutWarning, setLayoutWarning] = useState('');
  const [layoutPending, setLayoutPending] = useState(false);

  useEffect(() => {
    workerRef.current?.terminate();

    if (!isModelReady || parseRunId == null) return;

    if (tables.length === 0) {
      setElkLayout({ positions: {}, edgePaths: {} });
      setLayoutMode('elk');
      setLayoutWarning('');
      setLayoutPending(false);
      return;
    }

    const jobId = createWorkerJobId(LAYOUT_WORKER_KIND, layoutRevision);
    const worker = new LayoutWorker();
    workerRef.current = worker;
    activeJobIdRef.current = jobId;

    setLayoutPending(true);
    startLayout(parseRunId);

    const roundTripStart = performance.now();

    const model = createLayoutGraphModel({ tables, relationships, errors: [], warnings: [], ambiguousReferences: [] }, tablePositions);
    const payloadMetricsStart = performance.now();
    const serializedPayload = JSON.stringify({
      model,
      preferences: {
        relationGrouping,
      },
    });
    const serializeMs = performance.now() - payloadMetricsStart;
    const payloadBytes = payloadEncoder.encode(serializedPayload).byteLength;

    const request: LayoutWorkerRequest = {
      kind: LAYOUT_WORKER_KIND,
      jobId,
      payload: {
        model,
        preferences: {
          relationGrouping,
        },
      },
    };
    let postMessageMs = 0;

    worker.onmessage = (event: MessageEvent<LayoutWorkerResponse>) => {
      const response = event.data;

      if (response.jobId !== activeJobIdRef.current || response.kind !== LAYOUT_WORKER_KIND) return;

      const roundTripMs = performance.now() - roundTripStart;
      const workerComputeMs = response.status === 'success' ? response.result.metrics?.workerComputeMs : undefined;
      const layoutMetrics: DiagramBenchmarkLayoutMetrics = {
        payloadBytes,
        serializeMs,
        postMessageMs,
        roundTripMs,
        workerComputeMs,
        estimatedTransferMs: workerComputeMs != null ? Math.max(0, roundTripMs - workerComputeMs) : undefined,
      };

      if (response.status === 'success') {
        finishLayout(parseRunId, response.result.engine, layoutMetrics);
        setElkLayout(response.result.layout);
        setLayoutMode(response.result.engine);
        setLayoutWarning(response.result.warning);
        setLayoutPending(false);
        return;
      }

      finishLayout(parseRunId, 'fallback', layoutMetrics);
      setLayoutMode('fallback');
      setLayoutWarning(response.error.message);
      setLayoutPending(false);
    };

    worker.onerror = () => {
      if (jobId !== activeJobIdRef.current) return;

      const roundTripMs = performance.now() - roundTripStart;

      finishLayout(parseRunId, 'fallback', {
        payloadBytes,
        serializeMs,
        postMessageMs,
        roundTripMs,
        estimatedTransferMs: roundTripMs,
      });
      setLayoutMode('fallback');
      setLayoutWarning('Unexpected layout worker failure.');
      setLayoutPending(false);
    };

    const postMessageStart = performance.now();
    worker.postMessage(request);
    postMessageMs = performance.now() - postMessageStart;

    return () => {
      if (workerRef.current === worker) workerRef.current = null;
      worker.terminate();
    };
  }, [finishLayout, isModelReady, layoutRevision, parseRunId, relationGrouping, relationships, startLayout, tables]);

  return {
    elkLayout,
    layoutMode,
    layoutPending,
    layoutWarning,
  };
}
