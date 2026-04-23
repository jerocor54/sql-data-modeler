# Tasks: Phase 5 Next Slice

## Phase 1: Browser Validation Setup

- [x] 1.1 Confirm `/benchmark` can run in a browser-capable environment and document the exact command, base URL, preset, timeout/fallback expectation, and evidence folder `docs/performance-artifacts/phase-5-next-slice/`.
- [x] 1.2 Add the minimum validation notes or helper script references in `docs/performance-*` or `scripts/performance/*` so the run context, filenames, and rerun steps are reproducible without changing app architecture.

## Phase 2: Benchmark Surface Verification

- [ ] 2.1 Run the benchmark route with a documented preset and capture rendered proof from `/benchmark` showing `payloadBytes`, `serializeMs`, `postMessageMs`, `roundTripMs`, `workerComputeMs`, and `estimatedTransferMs` in `src/features/performance/BenchmarkPanel.tsx`.
- [ ] 2.2 Record the same run context beside the UI proof: preset used, timestamp, commit/worktree state, browser/runtime, and whether preset `m` completed or hit fallback/timeout.
- [ ] 2.3 If any metric is absent in the rendered panel, stop and document the exact missing field and reproduction evidence instead of widening scope into store or render refactors.

## Phase 3: Copy and Export JSON Parity

- [ ] 3.1 From the same rendered result, capture copy-to-clipboard JSON evidence from `src/components/ERDApp.tsx` and verify all six payload fields exist with the same values shown in the panel.
- [ ] 3.2 Capture exported JSON evidence from the benchmark serialization path in `src/features/performance/diagramPerformance.ts` and verify the same six payload fields match the rendered panel and copied JSON.
- [x] 3.3 Store comparison artifacts under `docs/performance-artifacts/phase-5-next-slice/` with stable names for screenshot/log/JSON outputs and a short index of which files prove UI, copy parity, export parity, and fallback notes.

## Phase 4: Final Validation and Guardrails

- [x] 4.1 Update the slice evidence note/checklist to mark each spec scenario as pass/fail with links to the stored artifacts and any documented equivalent path.
- [x] 4.2 Verify the slice stays validation-only: no store redesign, no parse/render model-shape optimization, and no unrelated `ERDApp.tsx` expansion beyond benchmark evidence wiring.
- [x] 4.3 Summarize closure status for the previous `PASS WITH WARNINGS` item and list any follow-up as separate future work, not part of this slice.
