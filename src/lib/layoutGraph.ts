import type { Position } from '../types/erd';

export interface LayoutGraphTable {
  key: string;
  height: number;
}

export interface LayoutGraphRelationship {
  id: string;
  sourceTable: string;
  targetTable: string;
}

export interface LayoutGraphModel {
  tables: LayoutGraphTable[];
  relationships: LayoutGraphRelationship[];
  persistedPositions: Record<string, Position>;
}

export interface LayoutGraphPayloadMetrics {
  payloadBytes: number;
  serializeMs: number;
}

export interface LayoutWorkerMetrics extends LayoutGraphPayloadMetrics {
  postMessageMs: number;
  roundTripMs: number;
  workerComputeMs: number;
  estimatedTransferMs: number;
}
