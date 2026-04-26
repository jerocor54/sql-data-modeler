# DEV browser performance snapshot contract

This document makes the current Phase 7 browser snapshot contract explicit.

## Where the snapshot lives

- Runtime key: `window.__SQL_DATA_MODELER_PERF__`
- Source module: `src/features/performance/browserPerformanceSnapshot.ts`
- Export hook: `useDevBrowserPerformanceExport(snapshot)`

The value is published as a deep-frozen, read-only object so future tooling can inspect it without mutating app state.

## Scope: DEV-only by design

- The snapshot is exported only when `import.meta.env.DEV` is true.
- The snapshot is removed on cleanup/unmount.
- Production builds MUST NOT be treated as supporting this contract.

This seam exists for local development and for a future browser-backed harness that reads real metrics from a running app.

## Schema version semantics

- Current version: `phase-7-dev-v1`
- The schema version identifies the serialized snapshot shape, not the broader product version.
- Consumers SHOULD reject or explicitly branch on unknown versions instead of guessing.
- Additive or breaking shape changes MUST ship with a new schema version.

## Snapshot categories exposed today

The exported object contains these top-level categories:

- `schemaVersion` / `generatedAt` — contract version and generation timestamp
- `timings` — `parseMs`, `layoutMs`, `renderApproxMs`, `totalMs`
- `graph` — presented vs total `nodes` and `edges`
- `model` — `sqlTextLength`, `tableCount`, `relationshipCount`
- `presentation` — automatic/manual presentation state, layout engine/mode, pending state, strategy, and `viewMode`
- `diagnostics` — fallback activation, layout warning, and reduced layout diagnostic provenance
- `longTasks` — browser long-task support plus observed counts/durations

Null values are valid when a metric is not available yet.

## Intended consumer

The intended consumer is a future browser-backed performance harness that runs against the DEV app, reads this serializable snapshot, and evaluates real browser behavior without reaching into React internals or Zustand internals.

## Non-goals and compatibility caveats

- This is NOT a production API.
- This is NOT a promise of backward compatibility across schema versions.
- This is NOT a complete UX/FPS contract; it exposes the metrics currently available from the app.
- This does NOT replace CLI baseline evidence or create browser gates by itself.
- This does NOT guarantee every internal diagnostic remains exposed forever; only the documented serialized shape for a given `schemaVersion` is the contract.
- Future harness work still needs its own policy for pass/fail gates, capture timing, and browser automation.
