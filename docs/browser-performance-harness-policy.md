# Future browser harness policy

This document defines the intended policy for a future browser-backed harness that reads `window.__SQL_DATA_MODELER_PERF__`.

It is a policy seam only. It does **not** add automation, gates, or new runtime instrumentation by itself.

## Target route and execution context

- Primary target: `/benchmark` on the local DEV server.
- Primary mode: explicit benchmark presets, not arbitrary user-authored schemas.
- Initial contexts:
  - `S` as the small supported smoke path.
  - `M` as the known support boundary/fallback truth path.

Why `/benchmark` first:

- it already exposes deterministic benchmark datasets;
- it isolates performance intent better than the main editing surface;
- it keeps early browser evidence aligned with the existing CLI baseline language.

The first harness SHOULD avoid treating the general editor route as the primary gate target.

## Readiness and capture timing philosophy

The harness SHOULD prefer explicit app readiness over arbitrary sleeps.

Recommended capture flow:

1. Open `/benchmark` in DEV mode.
2. Select a declared benchmark context/preset.
3. Trigger the benchmark/app load path.
4. Wait until `window.__SQL_DATA_MODELER_PERF__` exists with the expected `schemaVersion`.
5. Wait until the route reaches the same honest "usable" point already documented for `/benchmark`: parse finished, layout/fallback finished, graph committed, and two `requestAnimationFrame` ticks passed after commit.
6. Read the snapshot once that state is stable.

The harness SHOULD NOT use fixed sleeps as pass/fail evidence except as a bounded timeout guard.

## Metrics the future harness should read

The harness SHOULD read the documented top-level categories from the snapshot contract:

- `schemaVersion` / `generatedAt`
- `timings` (`parseMs`, `layoutMs`, `renderApproxMs`, `totalMs`)
- `graph`
- `model`
- `presentation`
- `diagnostics`
- `longTasks`

Initial browser-backed checks should focus on:

- contract presence and version compatibility;
- metric readability/nullability without mutating app state;
- route/context truth (`viewMode`, automatic vs manual presentation, chosen layout mode);
- fallback/timeout truth in `diagnostics`;
- browser-only signals such as `longTasks` support and observed counts.

## What the first browser-backed gates SHOULD cover

The first gates SHOULD be narrow and honest:

- the DEV snapshot is present and readable on `/benchmark`;
- the selected benchmark context is reflected consistently in the exported snapshot;
- `S` can be captured through the browser path with coherent timing/graph/model data;
- `M` preserves the current truth boundary, including timeout/fallback diagnostics when that happens;
- browser-only observability that the CLI cannot provide yet, especially `longTasks` and final presentation diagnostics.

## What the first browser-backed gates SHOULD NOT cover

The first gates SHOULD NOT pretend to cover more than they really validate.

They SHOULD NOT initially gate on:

- precise FPS guarantees;
- pixel-perfect overlay rendering or visual diff approval;
- broad editor UX outside `/benchmark`;
- production-mode behavior;
- cross-browser certification;
- memory budgets or full interaction latency across all editing workflows.

Those concerns need dedicated harness scope and evidence later.

## Relationship with the CLI baseline gate

- The CLI baseline gate remains the source of truth for versioned parse/layout baseline budgets.
- The browser harness complements that evidence with real browser capture, route readiness, long-task observation, and fallback/presentation truth.
- The browser harness MUST NOT replace the CLI gate as long as browser automation is still narrower, noisier, or not yet budgeted honestly.
- Early browser-backed gates should start with semantic truth and capture integrity, not with fake precision budgets copied from Node/CLI runs.

## Current status

- Snapshot seam: available now via `window.__SQL_DATA_MODELER_PERF__` in DEV.
- Snapshot contract: documented now in `docs/browser-performance-snapshot-contract.md`.
- Harness policy: documented here.
- Actual browser automation and enforced browser-backed gates: still pending.
