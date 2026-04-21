import type { ElkLayoutResult } from '../../lib/elkLayout';
import type { WorkerJobError, WorkerJobRequest, WorkerJobResponse } from '../../lib/workers/jobProtocol';
import type { DiagramViewport, Position, RelationGroupingMode, Relationship, TableModel } from '../../types/erd';

export const LAYOUT_WORKER_KIND = 'auto-layout';
export const ELK_LAYOUT_TIMEOUT_MS = 2500;

export interface LayoutWorkerPayload {
  relationGrouping: RelationGroupingMode;
  relationships: Relationship[];
  tablePositions: Record<string, Position | DiagramViewport>;
  tables: TableModel[];
}

export interface LayoutWorkerResult {
  engine: 'elk' | 'fallback';
  layout: ElkLayoutResult;
  warning: string;
}

export type LayoutWorkerErrorCode = 'LAYOUT_WORKER_ERROR';

export type LayoutWorkerError = WorkerJobError<LayoutWorkerErrorCode>;

export type LayoutWorkerRequest = WorkerJobRequest<typeof LAYOUT_WORKER_KIND, LayoutWorkerPayload>;

export type LayoutWorkerResponse = WorkerJobResponse<typeof LAYOUT_WORKER_KIND, LayoutWorkerResult, LayoutWorkerError>;
