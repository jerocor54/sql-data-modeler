# Tasks: Phase 5 Memory Caches Payloads

## Phase 1: Boundary and contract

- [x] 1.1 Update `PERFORMANCE_OPTIMIZATION_PLAN.md` to frame this change as Phase 5 slice 1 and note Phase 4 is effectively closed in code but still pending in the document. Validate: wording matches proposal/design; no scope creep.
- [x] 1.2 Create `src/lib/layoutGraph.ts` with `LayoutGraphTable`, `LayoutGraphRelationship`, `LayoutGraphModel`, and metrics types; update `src/lib/diagramGeometry.ts` to expose a reusable height helper from column count. Depends on: none. Validate: `npx tsc --noEmit`.
- [x] 1.3 Create `src/features/auto-layout/layoutModel.ts` to project `ParseResult` + persisted positions into the compact graph and sanitize invalid persisted coordinates. Depends on: 1.2. Validate: adapter output only includes `tables`, `relationships`, `persistedPositions`.

## Phase 2: Worker and layout engine narrowing

- [x] 2.1 Update `src/features/auto-layout/layoutWorkerProtocol.ts` so requests send `model` plus layout preferences, and responses can carry worker timing metadata. Depends on: 1.2. Validate: protocol no longer references full `TableModel[]` / broad `Relationship[]` payloads.
- [x] 2.2 Update `src/lib/layout.ts` and `src/lib/elkLayout.ts` to consume the compact layout graph contract while preserving existing layout and warning semantics. Depends on: 1.2. Validate: both ELK and fallback paths compile against shared types.
- [x] 2.3 Update `src/features/auto-layout/layout.worker.ts` to consume the compact model, measure worker compute duration, and return it with the existing layout result. Depends on: 2.1, 2.2. Validate: response shape stays compatible with callers after type-check.

## Phase 3: Main-thread wiring and benchmark surfacing

- [x] 3.1 Update `src/features/auto-layout/useAutoLayout.ts` to build the compact model via `layoutModel.ts`, measure payload bytes / serialization / round-trip timings around `postMessage`, and keep `ERDApp.tsx` untouched. Depends on: 1.3, 2.1, 2.3. Validate: `npx tsc --noEmit`.
- [x] 3.2 Extend `src/features/performance/diagramPerformance.ts` so benchmark state stores optional layout payload metrics and `finishLayout` accepts them without polluting persisted app state. Depends on: 3.1. Validate: latest result + history types include optional metric fields.
- [x] 3.3 Update `src/features/performance/BenchmarkPanel.tsx` and JSON export/copy flow to surface payload metrics in the benchmark UI/export path only. Depends on: 3.2. Validate: manual benchmark run shows payload/timing fields and copied JSON includes them.

## Phase 4: Verification and batching

- [x] 4.1 Run `npx tsc --noEmit` after Phases 1-3 and manually exercise a small/medium dataset to confirm ELK and fallback layouts still work with saved positions. Depends on: 3.3. Validate: no type errors; no regression in layout completion.
- [x] 4.2 Record follow-up notes if payload gains are masked by store/render churn, explicitly deferring persistence/store redesign to later Phase 5 slices. Depends on: 4.1. Validate: scope remains limited to worker payload + measurement.

## Batching Plan

- Batch A: 1.1-1.3
- Batch B: 2.1-2.3
- Batch C: 3.1-3.3
- Batch D: 4.1-4.2
