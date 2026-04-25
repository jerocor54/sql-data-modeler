## Implementation Progress

**Change**: phase-5-support-boundary-truthfulness
**Mode**: Standard

### Completed Tasks
- [x] 1.1 Update `PERFORMANCE_OPTIMIZATION_PLAN.md` Phase 5 to state the recovered baseline truth: real schemas supported, preset `S` interactive-safe on ELK, preset `M` currently times out/falls back, and Phase 5 remains copy-only.
- [x] 1.2 Add explicit non-goals in `PERFORMANCE_OPTIMIZATION_PLAN.md` that defer preset-`M` optimization, timeout tuning, runtime changes, and roadmap acceleration.
- [x] 2.1 Modify `src/features/performance/benchmarkDatasets.ts` so preset `M` uses a non-safe `interactiveSupport` classification while `S` stays `safe` and `L+` remains controlled-only.
- [x] 2.2 Update benchmark preset descriptions in `src/features/performance/benchmarkDatasets.ts` to match the verified boundary and remove aspirational `M` support language.
- [x] 2.3 Revise `src/features/performance/BenchmarkPanel.tsx` copy so benchmark guidance says `S` is safe, `M` is current timeout/fallback territory, and `L+` is for controlled/CLI measurement only.
- [x] 3.1 Update the support matrix and manual benchmark guidance in `docs/performance-baseline.md` so they match the same real-schema/`S`/`M` boundary used in plan and UI.
- [x] 3.2 Refresh the “lectura técnica honesta” or equivalent evidence-summary section in `docs/performance-baseline.md` to explain that `M` crossing `ELK_LAYOUT_TIMEOUT_MS` reflects the current contract, not a new regression.
- [x] 4.1 Review diffs for `PERFORMANCE_OPTIMIZATION_PLAN.md`, `src/features/performance/benchmarkDatasets.ts`, `src/features/performance/BenchmarkPanel.tsx`, and `docs/performance-baseline.md` to confirm every surface says the same support matrix and rejects speculative `M` claims.
- [x] 4.2 Run `npx tsc --noEmit` to verify the metadata/copy edits introduce no TypeScript regressions.
- [x] 4.3 Inspect untouched runtime evidence sources (`src/features/auto-layout/layout.worker.ts`, related timeout contract files if referenced by copy) and confirm no runtime/layout behavior changed in this slice.

### Files Changed
| File | Action | What Was Done |
|------|--------|---------------|
| `src/features/performance/benchmarkDatasets.ts` | Modified | Kept `interactiveSupport` as the truthful messaging taxonomy and added a separate helper for in-app benchmark action gating. |
| `src/features/performance/BenchmarkPanel.tsx` | Modified | Switched benchmark buttons to the new in-app gating helper so preset `M` stays runnable while the warning/copy remains truthful. |
| `src/components/ERDApp.tsx` | Modified | Switched dataset load/rerun guards to the new in-app gating helper, restoring pre-drift behavior for preset `M`. |
| `openspec/changes/phase-5-support-boundary-truthfulness/apply-progress.md` | Created | Captured cumulative apply progress plus the verification-driven runtime-gating remediation. |

### Deviations from Design
None — implementation now matches the design intent by keeping support messaging separate from runtime gates.

### Issues Found
- Verify had correctly flagged a hidden coupling: `interactiveSupport` was driving both truthful messaging and runtime action gating, which accidentally disabled preset `M`.

### Remaining Tasks
- [ ] None.

### Status
10/10 tasks complete. Ready for verify.
