# Design: ELK Clean Diagnostics

## Technical Approach

Keep the hotfix local to the existing auto-layout seam. Add a small typed diagnostics contract at the worker boundary, let `layout.worker.ts` populate it for ELK timeout / ELK failure / emergency fallback, let `useAutoLayout.ts` normalize worker-transport failures, and surface the result only through existing warning + benchmark/reporting paths.

## Architecture Decisions

| Decision | Options | Choice | Rationale |
|---|---|---|---|
| Fallback taxonomy | free-form strings; broad error codes; narrow enum | Narrow enum: `timeout \| worker-failure \| elk-failure \| emergency-fallback` | Matches the spec, stays cheap to compare, and avoids coupling UI/benchmark logic to Spanish warning text. |
| Provenance shape | raw `Error`; large trace object; compact metadata | Optional `{ stage, message? }` | Enough to answer “did ELK start, fail, or get bypassed?” without redesigning runtime state. |
| Transport placement | benchmark-only; runtime store; worker protocol + local hook state | Protocol-first, then hook propagation | Keeps ownership clear: worker emits, hook normalizes, ERDApp/benchmark read. No persisted app-state widening. |

## Data Flow

```text
ERDApp
  └─ useAutoLayout
      ├─ postMessage(LayoutWorkerRequest)
      ├─ receives LayoutWorkerResponse
      ├─ normalizes diagnostics for success/error/onerror
      ├─ sets layoutWarning + optional layoutDiagnostics
      └─ finishLayout(runId, engine, metrics, diagnostics)
             └─ useDiagramPerformance stores additive diagnostics
                    └─ BenchmarkPanel + JSON export display them
```

Sequence:

```text
ERDApp -> useAutoLayout -> layout.worker
layout.worker -> createElkLayout
createElkLayout --> layout.worker : success | throws | timeout
layout.worker --> useAutoLayout : result { engine, warning, diagnostics?, provenance? }
useAutoLayout --> ERDApp : warning + optional diagnostics
useAutoLayout --> diagramPerformance : metrics + optional diagnostics
```

## File Changes

| File | Action | Description |
|---|---|---|
| `src/features/auto-layout/layoutWorkerProtocol.ts` | Modify | Add shared diagnostic/provenance types and thread them through result/error contracts. |
| `src/features/auto-layout/layout.worker.ts` | Modify | Classify ELK timeout, ELK failure, fallback emergency, and attach provenance at decision points. |
| `src/features/auto-layout/useAutoLayout.ts` | Modify | Normalize worker `status:error` / `worker.onerror` into `worker-failure`, expose hook diagnostics, and forward diagnostics to benchmark reporting. |
| `src/features/performance/diagramPerformance.ts` | Modify | Extend benchmark result/run state with additive `layoutDiagnostics`. |
| `src/features/performance/BenchmarkPanel.tsx` | Modify | Show fallback cause/provenance in latest result and let JSON export inherit it automatically. |
| `src/components/ERDApp.tsx` | Modify | Keep current fallback warning pill; optionally consume returned diagnostics for future composition-root reporting without new store state. |

## Interfaces / Contracts

```ts
export type LayoutFallbackCause =
  | 'timeout'
  | 'worker-failure'
  | 'elk-failure'
  | 'emergency-fallback';

export interface ElkProvenance {
  stage: 'worker-start' | 'elk-start' | 'elk-success' | 'elk-error' | 'fallback' | 'emergency-fallback';
  message?: string;
}

export interface LayoutFallbackDiagnostics {
  cause: LayoutFallbackCause;
  provenance?: ElkProvenance;
}
```

Contract rules:
- `engine: 'elk'` MAY omit diagnostics entirely.
- `engine: 'fallback'` SHOULD include diagnostics.
- Worker `status:'error'` and `worker.onerror` are normalized in `useAutoLayout` to `{ cause: 'worker-failure' }` because no success result exists.
- Existing `warning` strings remain unchanged and user-facing.

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| Type-check | New protocol + hook signatures | `npx tsc --noEmit` |
| Integration-ish manual | ELK success, timeout, thrown ELK error, worker error | Run app/benchmark flows and inspect warning pill + benchmark panel/JSON. |
| Regression | Benchmark payload metrics remain additive-only | Confirm existing metrics shape still serializes, with optional `layoutDiagnostics` only. |

## Migration / Rollout

No migration required. Roll out as a local hotfix on the clean branch. Rollback is a straight removal of diagnostic fields and wiring in protocol, hook, and benchmark UI.

## Open Questions

- [ ] Whether `BenchmarkPanel` history table should add a dedicated “cause” column now, or keep details only in the latest-result card + JSON to minimize UI churn.
