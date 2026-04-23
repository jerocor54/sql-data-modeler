import { createElkLayout, createSafeFallbackLayout } from '../../lib/elkLayout';
import {
  ELK_LAYOUT_TIMEOUT_MS,
  LAYOUT_WORKER_KIND,
  type LayoutWorkerRequest,
  type LayoutWorkerResponse,
  type LayoutWorkerResult,
} from './layoutWorkerProtocol';

const workerScope = self as unknown as {
  onmessage: ((event: MessageEvent<LayoutWorkerRequest>) => void) | null;
  postMessage: (message: LayoutWorkerResponse) => void;
};

async function createLayoutResult(request: LayoutWorkerRequest): Promise<LayoutWorkerResult> {
  const { model, preferences } = request.payload;
  const computeStart = performance.now();

  try {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('ELK_LAYOUT_TIMEOUT')), ELK_LAYOUT_TIMEOUT_MS);
    });

    const layout = await Promise.race([createElkLayout(model.tables, model.relationships, preferences), timeoutPromise]);
    return {
      engine: 'elk',
      layout,
      metrics: {
        workerComputeMs: performance.now() - computeStart,
      },
      warning: '',
    };
  } catch (error) {
    const fallbackResult = createSafeFallbackLayout(
      model.tables,
      model.relationships,
      model.persistedPositions,
      preferences,
    );

    return {
      engine: 'fallback',
      layout: fallbackResult.layout,
      metrics: {
        workerComputeMs: performance.now() - computeStart,
      },
      warning:
        fallbackResult.mode === 'emergency'
          ? 'ELK y el layout rápido fallaron en este esquema grande; se activó una grilla de emergencia para mantener la app operativa.'
          : error instanceof Error && error.message === 'ELK_LAYOUT_TIMEOUT'
            ? 'EL layout tardó demasiado; se activó el modo rápido de respaldo.'
            : 'ELK falló en este esquema; se activó el layout de respaldo para mantener la app operativa.',
    };
  }
}

workerScope.onmessage = (event: MessageEvent<LayoutWorkerRequest>) => {
  const request = event.data;

  if (request.kind !== LAYOUT_WORKER_KIND) return;

  void createLayoutResult(request)
    .then((result) => {
      const response: LayoutWorkerResponse = {
        kind: LAYOUT_WORKER_KIND,
        jobId: request.jobId,
        status: 'success',
        result,
      };

      workerScope.postMessage(response);
    })
    .catch((error) => {
      const response: LayoutWorkerResponse = {
        kind: LAYOUT_WORKER_KIND,
        jobId: request.jobId,
        status: 'error',
        error: {
          code: 'LAYOUT_WORKER_ERROR',
          message: error instanceof Error ? error.message : 'Unexpected layout worker failure.',
        },
      };

      workerScope.postMessage(response);
    });
};

export {};
