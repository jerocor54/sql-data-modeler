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
import type { DiagramBenchmarkLayoutEngine } from '../performance/diagramPerformance';
import LayoutWorker from './layout.worker?worker';
import { LAYOUT_WORKER_KIND, type LayoutWorkerRequest, type LayoutWorkerResponse } from './layoutWorkerProtocol';

interface UseAutoLayoutInput {
  finishLayout: (runId: number, layoutEngine: DiagramBenchmarkLayoutEngine) => void;
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

    worker.onmessage = (event: MessageEvent<LayoutWorkerResponse>) => {
      const response = event.data;

      if (response.jobId !== activeJobIdRef.current || response.kind !== LAYOUT_WORKER_KIND) return;

      if (response.status === 'success') {
        finishLayout(parseRunId, response.result.engine);
        setElkLayout(response.result.layout);
        setLayoutMode(response.result.engine);
        setLayoutWarning(response.result.warning);
        setLayoutPending(false);
        return;
      }

      finishLayout(parseRunId, 'fallback');
      setLayoutMode('fallback');
      setLayoutWarning(response.error.message);
      setLayoutPending(false);
    };

    worker.onerror = () => {
      if (jobId !== activeJobIdRef.current) return;

      finishLayout(parseRunId, 'fallback');
      setLayoutMode('fallback');
      setLayoutWarning('Unexpected layout worker failure.');
      setLayoutPending(false);
    };

    const request: LayoutWorkerRequest = {
      kind: LAYOUT_WORKER_KIND,
      jobId,
      payload: {
        relationGrouping,
        relationships,
        tablePositions,
        tables,
      },
    };

    worker.postMessage(request);

    return () => {
      if (workerRef.current === worker) workerRef.current = null;
      worker.terminate();
    };
  }, [finishLayout, isModelReady, layoutRevision, parseRunId, relationGrouping, relationships, startLayout, tablePositions, tables]);

  return {
    elkLayout,
    layoutMode,
    layoutPending,
    layoutWarning,
  };
}
