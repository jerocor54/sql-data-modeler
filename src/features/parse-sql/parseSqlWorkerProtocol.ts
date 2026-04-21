import type { Dialect, ParseResult } from '../../types/erd';
import type { WorkerJobError, WorkerJobRequest, WorkerJobResponse } from '../../lib/workers/jobProtocol';

export const PARSE_SQL_WORKER_KIND = 'parse-sql';

export interface ParseSqlWorkerPayload {
  sqlText: string;
  dialect: Dialect;
}

export type ParseSqlWorkerResult = ParseResult;

export type ParseSqlWorkerErrorCode = 'PARSE_SQL_WORKER_ERROR';

export type ParseSqlWorkerError = WorkerJobError<ParseSqlWorkerErrorCode>;

export type ParseSqlWorkerRequest = WorkerJobRequest<typeof PARSE_SQL_WORKER_KIND, ParseSqlWorkerPayload>;

export type ParseSqlWorkerResponse = WorkerJobResponse<
  typeof PARSE_SQL_WORKER_KIND,
  ParseSqlWorkerResult,
  ParseSqlWorkerError
>;
