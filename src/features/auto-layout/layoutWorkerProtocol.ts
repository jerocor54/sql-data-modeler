import type { ElkLayoutResult } from '../../lib/elkLayout';
import type { LayoutGraphModel, LayoutWorkerMetrics } from '../../lib/layoutGraph';
import type { WorkerJobError, WorkerJobRequest, WorkerJobResponse } from '../../lib/workers/jobProtocol';
import type { RelationGroupingMode } from '../../types/erd';

export const LAYOUT_WORKER_KIND = 'auto-layout';
export const ELK_LAYOUT_TIMEOUT_MS = 2500;

export interface LayoutWorkerPayload {
  model: LayoutGraphModel;
  preferences: {
    relationGrouping: RelationGroupingMode;
  };
}

export type LayoutFallbackCause = 'timeout' | 'worker-failure' | 'elk-failure' | 'emergency-fallback';

export interface ElkProvenance {
  stage: 'worker-start' | 'elk-start' | 'elk-success' | 'elk-error' | 'fallback' | 'emergency-fallback';
  message?: string;
}

export interface LayoutFallbackDiagnostics {
  cause: LayoutFallbackCause;
  provenance?: ElkProvenance;
}

export interface LayoutWorkerResult {
  engine: 'elk' | 'fallback';
  layout: ElkLayoutResult;
  metrics?: Pick<LayoutWorkerMetrics, 'workerComputeMs'>;
  warning: string;
  diagnostics?: LayoutFallbackDiagnostics;
}

export type LayoutWorkerErrorCode = 'LAYOUT_WORKER_ERROR';

export type LayoutWorkerError = WorkerJobError<LayoutWorkerErrorCode> & {
  diagnostics?: LayoutFallbackDiagnostics;
};

export type LayoutWorkerRequest = WorkerJobRequest<typeof LAYOUT_WORKER_KIND, LayoutWorkerPayload>;

export type LayoutWorkerResponse = WorkerJobResponse<typeof LAYOUT_WORKER_KIND, LayoutWorkerResult, LayoutWorkerError>;
