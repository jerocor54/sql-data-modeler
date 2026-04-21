import { parseSqlToModel } from '../../lib/sqlParser';
import { PARSE_SQL_WORKER_KIND, type ParseSqlWorkerRequest, type ParseSqlWorkerResponse } from './parseSqlWorkerProtocol';

const workerScope = self as unknown as {
  onmessage: ((event: MessageEvent<ParseSqlWorkerRequest>) => void) | null;
  postMessage: (message: ParseSqlWorkerResponse) => void;
};

workerScope.onmessage = (event: MessageEvent<ParseSqlWorkerRequest>) => {
  const request = event.data;

  if (request.kind !== PARSE_SQL_WORKER_KIND) return;

  try {
    const result = parseSqlToModel(request.payload.sqlText, request.payload.dialect);
    const response: ParseSqlWorkerResponse = {
      kind: PARSE_SQL_WORKER_KIND,
      jobId: request.jobId,
      status: 'success',
      result,
    };

    workerScope.postMessage(response);
  } catch (error) {
    const response: ParseSqlWorkerResponse = {
      kind: PARSE_SQL_WORKER_KIND,
      jobId: request.jobId,
      status: 'error',
      error: {
        code: 'PARSE_SQL_WORKER_ERROR',
        message: error instanceof Error ? error.message : 'Unexpected parser worker failure.',
      },
    };

    workerScope.postMessage(response);
  }
};

export {};
