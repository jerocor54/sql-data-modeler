## Implementation Progress

**Change**: phase-5-memory-caches-payloads
**Mode**: Standard
**Batch**: A+B+C+D (tasks 1.1-4.2)

### Completed Tasks
- [x] 1.1 Update `PERFORMANCE_OPTIMIZATION_PLAN.md` to reframe the work as Phase 5 slice 1 and record Phase 4 as effectively closed in code.
- [x] 1.2 Create the shared compact layout graph contract in `src/lib/layoutGraph.ts` and extract `getTableHeightFromColumnCount()` in `src/lib/diagramGeometry.ts`.
- [x] 1.3 Create `src/features/auto-layout/layoutModel.ts` to project `ParseResult` plus persisted positions into the compact graph while dropping viewport-like or invalid coordinates.
- [x] 2.1 Update `src/features/auto-layout/layoutWorkerProtocol.ts` so the worker request carries `{ model, preferences }` and successful results can include worker compute timing metadata.
- [x] 2.2 Narrow `src/lib/layout.ts` and `src/lib/elkLayout.ts` to the shared `LayoutGraph*` contract while preserving ELK/fallback result and warning behavior.
- [x] 2.3 Update `src/features/auto-layout/layout.worker.ts` to consume the compact model, measure compute duration, and return it with the layout result.
- [x] 3.1 Update `src/features/auto-layout/useAutoLayout.ts` to build the compact model through `layoutModel.ts`, measure payload bytes plus serialization/postMessage/round-trip timings, and keep `ERDApp.tsx` untouched.
- [x] 3.2 Extend `src/features/performance/diagramPerformance.ts` so benchmark runs/history store optional layout payload metrics without touching persisted app state.
- [x] 3.3 Update `src/features/performance/BenchmarkPanel.tsx` and JSON export/copy flow so payload metrics are visible only in benchmark UI/export surfaces.
- [x] 4.1 Run `npx tsc --noEmit` and perform the best feasible non-build compact-layout smoke checks for ELK/fallback compatibility with saved positions.
- [x] 4.2 Record follow-up notes that any remaining gains masked by store/render churn stay deferred to later Phase 5 slices, not this payload-focused slice.

### Files Changed
| File | Action | What Was Done |
|------|--------|---------------|
| `PERFORMANCE_OPTIMIZATION_PLAN.md` | Modified | Marked Phase 4 as effectively closed in code and framed current work as Phase 5 slice 1. |
| `src/lib/layoutGraph.ts` | Created | Added compact layout graph and worker metric interfaces. |
| `src/lib/diagramGeometry.ts` | Modified | Extracted reusable table height helper from column count. |
| `src/features/auto-layout/layoutModel.ts` | Created | Added pure adapter and persisted-position sanitization for compact layout payloads. |
| `src/features/auto-layout/layoutWorkerProtocol.ts` | Modified | Switched the worker request to `{ model, preferences }` and added optional worker timing metadata on success results. |
| `src/lib/layout.ts` | Modified | Moved fallback layout math to `LayoutGraphTable`/`LayoutGraphRelationship` heights instead of broad table models. |
| `src/lib/elkLayout.ts` | Modified | Updated ELK/fallback pipeline internals to consume compact layout graph types and table heights directly. |
| `src/features/auto-layout/layout.worker.ts` | Modified | Consumed the compact layout model, measured worker compute time, and returned it with existing engine/warning semantics. |
| `src/features/auto-layout/useAutoLayout.ts` | Modified | Added the minimal compatibility adapter to send the compact model without doing the later Batch C timing/benchmark work yet. |
| `scripts/performance/runPhase0Baseline.ts` | Modified | Adapted the baseline CLI to project parsed SQL into the compact layout model before calling ELK. |
| `openspec/changes/phase-5-memory-caches-payloads/tasks.md` | Modified | Marked Batch A tasks complete. |
| `openspec/changes/phase-5-memory-caches-payloads/tasks.md` | Modified | Marked Batch B tasks complete. |
| `src/features/auto-layout/useAutoLayout.ts` | Modified | Measured compact worker payload bytes, JSON serialization, postMessage overhead, round-trip timing, and forwarded worker timing metadata to benchmark state. |
| `src/features/performance/diagramPerformance.ts` | Modified | Added optional benchmark-only layout payload metrics and let `finishLayout()` capture them per run/history entry. |
| `src/features/performance/BenchmarkPanel.tsx` | Modified | Surfaced payload timing data in latest/history benchmark UI while keeping it isolated to benchmark surfaces. |
| `openspec/changes/phase-5-memory-caches-payloads/tasks.md` | Modified | Marked Batch C tasks complete. |
| `openspec/changes/phase-5-memory-caches-payloads/tasks.md` | Modified | Marked Batch D verification/documentation tasks complete. |
| `openspec/changes/phase-5-memory-caches-payloads/apply-progress.md` | Modified | Merged final Batch D validation results and follow-up notes into the cumulative progress artifact. |

### Deviations from Design
Compatibility-only follow-through from Batch B remains: `useAutoLayout.ts` and `scripts/performance/runPhase0Baseline.ts` had to adopt the compact model early so the narrowed worker/layout contract kept compiling before metrics landed. Batch C then layered measurement and benchmark surfacing on top without touching `ERDApp.tsx` or persistence. Batch D stayed documentation/verification-only and did not widen into store or render refactors.

### Issues Found
No browser session or build step was allowed in this environment, so the final verification used non-build smoke checks instead of true manual UI exercise: `npx tsc --noEmit`, ELK runs on the `s` and `m` benchmark datasets via `node --import tsx`, and fallback/saved-position compatibility checks via `createLayoutGraphModel()`, `createAutoLayout()`, and `createSafeFallbackLayout()`. If future profiling still shows muted wins, the remaining suspect is broad store/render churn rather than the worker payload slice itself.

### Remaining Tasks
- [ ] Optional: browser-level benchmark/UI confirmation that BenchmarkPanel surfaces payload metrics and copied/exported JSON still matches the new fields.
- [ ] Later Phase 5 slice: reduce broad store subscriptions / persistence churn only after measuring that they still mask payload gains.

### Status
11/11 tasks complete. Ready for verify.
