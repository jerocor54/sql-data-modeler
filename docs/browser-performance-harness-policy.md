# Browser harness policy

This document defines the policy for the browser-backed harness that reads `window.__SQL_DATA_MODELER_PERF__`.

Today the repo includes a MINIMAL local harness only. It stays narrow on purpose: DEV-only, benchmark-route only, preset-driven, and focused on snapshot contract/readability/coherence rather than fake UX precision.

## Target route and execution context

- Primary benchmark page: `/benchmark`.
- Real local DEV URL: `/sql-data-modeler/benchmark`, because Astro dev preserves the configured `base: '/sql-data-modeler'`.
- Primary mode: explicit benchmark presets, not arbitrary user-authored schemas.
- Initial contexts:
  - `S` as the small supported smoke path.
  - `M` as the known support boundary/fallback truth path.

Why the benchmark page first:

- it already exposes deterministic benchmark datasets;
- it isolates performance intent better than the main editing surface;
- it keeps early browser evidence aligned with the existing CLI baseline language.

The first harness SHOULD avoid treating the general editor route as the primary gate target.

## Readiness and capture timing philosophy

The harness SHOULD prefer explicit app readiness over arbitrary sleeps.

Recommended capture flow:

1. Open `/sql-data-modeler/benchmark` in DEV mode.
2. Select a declared benchmark context/preset.
3. Trigger the benchmark/app load path.
4. Wait until `window.__SQL_DATA_MODELER_PERF__` exists with the expected `schemaVersion`.
5. Wait until the route reaches the same honest "usable" point already documented for the benchmark page: parse finished, layout/fallback finished, graph committed, and two `requestAnimationFrame` ticks passed after commit.
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

- the DEV snapshot is present and readable on `/sql-data-modeler/benchmark`;
- the selected benchmark context is reflected consistently in the exported snapshot;
- `S` can be captured through the browser path with coherent timing/graph/model data;
- `M` preserves the current truth boundary, including timeout/fallback diagnostics when that happens;
- browser-only observability that the CLI cannot provide yet, especially `longTasks` and final presentation diagnostics.

## What the first browser-backed gates SHOULD NOT cover

The first gates SHOULD NOT pretend to cover more than they really validate.

They SHOULD NOT initially gate on:

- precise FPS guarantees;
- pixel-perfect overlay rendering or visual diff approval;
- broad editor UX outside the benchmark page;
- production-mode behavior;
- cross-browser certification;
- memory budgets or full interaction latency across all editing workflows.

Those concerns need dedicated harness scope and evidence later.

## Relationship with the CLI baseline gate

- The CLI baseline gate remains the source of truth for versioned parse/layout baseline budgets.
- The browser harness complements that evidence with real browser capture, route readiness, long-task observation, and fallback/presentation truth.
- The browser harness MUST NOT replace the CLI gate as long as browser automation is still narrower, noisier, or not yet budgeted honestly.
- Early browser-backed gates should start with semantic truth and capture integrity, not with fake precision budgets copied from Node/CLI runs.

## Minimal local harness available now

### Setup

1. Install dependencies from repo root with `npm install`.
2. Install the Playwright browser once on the machine:

   ```bash
   npx playwright install chromium
   ```

### Usage

Run the minimal browser harness from repo root:

```bash
npm run benchmark:browser -- --preset=s
```

Repo-level assert workflow:

```bash
npm run benchmark:browser:assert
```

That workflow reuses the same harness twice — first `s`, then `m` — keeps the same stable artifact files per preset, and exits non-zero if either semantic harness run fails.

That command now also persists the same JSON report to a stable artifact path:

```text
docs/performance-artifacts/browser-harness/browser-benchmark-report.s.json
```

Optional boundary check:

```bash
npm run benchmark:browser -- --preset=m
```

Which persists to:

```text
docs/performance-artifacts/browser-harness/browser-benchmark-report.m.json
```

Optional flags:

- the harness now reads Astro's announced DEV URL, so if `4321` is busy and Astro drifts to another free port, the browser run follows that real URL instead of staying stale on the requested one.
- default bounded wait guard is preset-aware: `S` keeps `45000 ms`, while `M` uses `120000 ms` by default because the current browser-backed support-boundary capture has already shown honest fallback-ready completion closer to ~94-100s+ than to `90000 ms`.
- `--timeout-ms=<ms>` still overrides the preset default when you want a custom bounded wait guard.
- `--output=<path>` overrides the default artifact path when you want to persist the JSON report somewhere else.
- `--headed` to watch Chromium run locally.
- `benchmark:browser:assert` forwards shared flags like `--headed`, `--host`, `--port`, and `--timeout-ms`, but intentionally rejects `--preset` and `--output` because that repo-level workflow exists to keep the fixed `s` + `m` sequence and the stable artifact paths honest.

Artifact note:

- default artifact names are stable and overwrite-in-place by preset on purpose;
- the harness still prints the same JSON to stdout, but now it also writes that exact report to disk for repeatable evidence capture;
- if you need versioned evidence for a specific slice, copy the stable file into the relevant evidence package after the run.

### What this harness actually does

1. Starts the local DEV server itself.
2. Opens `/sql-data-modeler/benchmark` in Chromium.
3. Selects an explicit preset (`s` by default, `m` optional).
4. Clicks **Cargar dataset en la app**.
5. Waits for the honest readiness seam already exported by the app:
   - snapshot exists,
   - `schemaVersion === 'phase-7-dev-v1'`,
   - `presentation.layoutPending === false`,
   - `timings.totalMs !== null`.
6. Reads `window.__SQL_DATA_MODELER_PERF__`.
7. Writes structured JSON to a stable artifact file for the selected preset.
8. Prints the same structured JSON with pass/fail for contract, readability, and coherence only.

### What this harness intentionally does NOT do

- no FPS claims;
- no visual diffing;
- no wide editor-route coverage;
- no production assertions;
- no cross-browser matrix;
- no browser timing budgets copied from CLI baselines.

## Current status

- Snapshot seam: available now via `window.__SQL_DATA_MODELER_PERF__` in DEV.
- Snapshot contract: documented now in `docs/browser-performance-snapshot-contract.md`.
- Minimal local harness: available now via `npm run benchmark:browser`.
- Enforced browser-backed gates or broader browser certification: still pending.
