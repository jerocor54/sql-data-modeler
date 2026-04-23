# Design: Phase 5 Memory Caches Payloads

## Technical Approach

This first Phase 5 slice introduces a **layout-only graph contract** between parsed domain data and the layout worker. The contract is derived in the `auto-layout` feature from `ParseResult` plus persisted table positions, then sent to the worker with request-level metrics. Scope stays intentionally narrow: reduce payload size, expose serialization/transfer timing, and update the master plan to state honestly that Phase 4 is effectively closed in code even if the document still says pending.

## Architecture Decisions

| Decision | Choice | Alternatives considered | Rationale |
|---|---|---|---|
| Compact contract ownership | Derive the compact model in `src/features/auto-layout/layoutModel.ts` | Derive in `ERDApp.tsx`; derive in `useDiagramModel` | Keeps `ERDApp.tsx` as composition root and avoids coupling parse feature ownership to layout internals. |
| Layout data shape | Worker receives only `tables[{key,height}]`, `relationships[{id,sourceTable,targetTable}]`, and sanitized persisted positions | Keep sending `TableModel[]`/full `Relationship[]`; send `columnCount` and recompute height in worker | Height is the geometry fact layout actually consumes; removing names, columns, line metadata, and column strings cuts clone cost fastest. |
| Metrics storage | Store payload/timing numbers only inside `useDiagramPerformance` benchmark state | Zustand persistence; ad-hoc fields in app store; logging-only | Metrics stay transient, exportable, and visible in benchmark UI without polluting runtime architecture or persistence. |

## Data Flow

```text
Parse worker -> ParseResult
                |
                v
auto-layout/layoutModel.ts
  - project parsed tables/relationships
  - sanitize persisted positions
  - measure payload bytes/serialization
                |
                v
useAutoLayout -> layout.worker -> elkLayout/layout.ts
                |                  |
                |                  -> worker compute metrics
                v
      useDiagramPerformance <- response metrics + engine
```

Sequence:

```text
main: derive compact model
main: measure payloadBytes + serializeMs
main: postMessage(request)
worker: receive request, start timer
worker: compute ELK or fallback
worker: post result + workerComputeMs
main: measure roundTripMs and transferOverheadMs
```

## File Changes

| File | Action | Description |
|---|---|---|
| `PERFORMANCE_OPTIMIZATION_PLAN.md` | Modify | Mark Phase 4 as effectively closed in code and frame this change as Phase 5 slice 1. |
| `src/lib/layoutGraph.ts` | Create | Shared minimal layout types used by adapter, worker protocol, and layout libs. |
| `src/features/auto-layout/layoutModel.ts` | Create | Pure adapter from `ParseResult` + persisted positions to compact layout graph; payload measurement helper. |
| `src/features/auto-layout/layoutWorkerProtocol.ts` | Modify | Replace broad payload with `model` + `preferences`; add worker metrics metadata. |
| `src/features/auto-layout/useAutoLayout.ts` | Modify | Build compact model, measure request/round-trip, forward metrics to performance hook. |
| `src/features/auto-layout/layout.worker.ts` | Modify | Consume compact graph and return compute duration with existing layout result/warning. |
| `src/lib/diagramGeometry.ts` | Modify | Extract `getTableHeightFromColumnCount()` so render and adapter share geometry rules. |
| `src/lib/elkLayout.ts` | Modify | Accept compact layout graph/table contract instead of full `TableModel`. |
| `src/lib/layout.ts` | Modify | Same narrowing for fallback/persisted-position logic. |
| `src/features/performance/diagramPerformance.ts` | Modify | Extend benchmark result with optional layout payload metrics. |
| `src/features/performance/BenchmarkPanel.tsx` | Modify | Show compact payload/timing fields only in benchmark surface/export path. |

## Interfaces / Contracts

```ts
export interface LayoutGraphTable { key: string; height: number }
export interface LayoutGraphRelationship { id: string; sourceTable: string; targetTable: string }
export interface LayoutGraphModel {
  tables: LayoutGraphTable[];
  relationships: LayoutGraphRelationship[];
  persistedPositions: Record<string, { x: number; y: number }>;
}

export interface LayoutWorkerMetrics {
  payloadBytes: number;
  serializeMs: number;
  postMessageMs: number;
  roundTripMs: number;
  workerComputeMs: number;
  estimatedTransferMs: number;
}
```

`sanitizePersistedPositions()` MUST drop viewport-like objects and invalid numbers. `ElkLayoutResult` and warning semantics stay unchanged for callers.

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| Static | Contract compatibility and signature updates | `npx tsc --noEmit` |
| Manual | Benchmark panel shows payload/timing numbers and copy JSON includes them | Run app locally without build; inspect latest benchmark result |
| Manual | Layout still works for ELK and fallback paths with saved positions | Exercise small and medium datasets plus forced fallback scenarios if reproducible |

## Migration / Rollout

No data migration required. Compatibility is atomic inside one app bundle because the worker producer and consumer ship together. Rollout order: introduce shared contract, adapt libs, switch worker protocol, then wire metrics/UI. Rollback is simple: restore previous worker payload/signatures and remove benchmark metric fields; no persisted schema changes are involved.

## Open Questions

- [ ] Whether benchmark UI should show all payload fields or only `payloadBytes` + `estimatedTransferMs` while full JSON remains copy/export only.
