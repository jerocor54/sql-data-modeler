# Phase 5 Next Slice · Evidence checklist

## Artifact map

- UI proof: `docs/performance-artifacts/phase-5-next-slice/benchmark-panel-ui.png`
- Copy JSON parity: `docs/performance-artifacts/phase-5-next-slice/benchmark-copy-results.json`
- Export JSON parity: `docs/performance-artifacts/phase-5-next-slice/benchmark-export-results.json`
- Run context: `docs/performance-artifacts/phase-5-next-slice/benchmark-run-context.json`
- Freeform notes / fallback details: `docs/performance-artifacts/phase-5-next-slice/benchmark-notes.md`

## Scenario status

| Requirement | Scenario | Status | Evidence | Notes |
| --- | --- | --- | --- | --- |
| Capture benchmark payload validation evidence | Store browser validation artifacts | PENDING | Folder + stable filenames prepared in this directory | Browser-capable capture still required |
| Capture benchmark payload validation evidence | Keep the slice validation-only | PASS | `openspec/changes/phase-5-next-slice/tasks.md`, `openspec/changes/phase-5-next-slice/apply-progress.md` | This slice only adds reproducibility docs/artifact structure |
| Expose payload metrics only in benchmark surfaces | Record payload timing for a benchmarked layout run | PENDING | Await `benchmark-panel-ui.png` and `benchmark-run-context.json` | Must show all six payload metrics from `/sql-data-modeler/benchmark` |
| Expose payload metrics only in benchmark surfaces | Keep runtime app state free of benchmark metrics | PASS | Static code path already verified in archived change `openspec/changes/archive/2026-04-22-phase-5-memory-caches-payloads/verify-report.md` | No new persisted-store changes were introduced here |
| Expose payload metrics only in benchmark surfaces | Preserve copy and export JSON parity | PENDING | Await `benchmark-copy-results.json` and `benchmark-export-results.json` | Compare against the same run shown in UI |

## Archived warning closure status

- Previous status: `PASS WITH WARNINGS`
- Warning still open?: `YES`
- Closure condition: capture browser UI proof plus copy/export JSON parity for the same run and update this checklist from `PENDING` to `PASS`.

## Browser-only pending evidence

1. Screenshot of `BenchmarkPanel` latest result with all six payload fields visible.
2. Copied JSON payload from `navigator.clipboard.writeText(serializeBenchmarkResults(history))`.
3. Exported JSON for the same run.
4. Exact runtime context: preset, timestamp, browser, commit/worktree state, engine mode, fallback/timeout note.

## Out of scope guardrails

- No store redesign.
- No parse/render model-shape optimization.
- No unrelated `ERDApp.tsx` expansion.
- Any future optimization work must be opened as a separate change after this evidence is captured.
