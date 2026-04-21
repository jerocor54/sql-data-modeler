export interface WorkerJobError<TCode extends string = string> {
  code: TCode;
  message: string;
}

export interface WorkerJobRequest<TKind extends string, TPayload> {
  kind: TKind;
  jobId: string;
  payload: TPayload;
}

export interface WorkerJobSuccess<TKind extends string, TResult> {
  kind: TKind;
  jobId: string;
  status: 'success';
  result: TResult;
}

export interface WorkerJobFailure<TKind extends string, TError extends WorkerJobError = WorkerJobError> {
  kind: TKind;
  jobId: string;
  status: 'error';
  error: TError;
}

export type WorkerJobResponse<TKind extends string, TResult, TError extends WorkerJobError = WorkerJobError> =
  | WorkerJobSuccess<TKind, TResult>
  | WorkerJobFailure<TKind, TError>;

export function createWorkerJobId(prefix: string, revision: number): string {
  return `${prefix}:${revision}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
}
