# Proposal: Phase 5 Next Slice

## Intent

Close the remaining Phase 5 warning with browser-capable evidence for `/benchmark`: confirm `BenchmarkPanel` renders payload metrics and confirm copied/exported JSON preserves the same payload metric fields.

## Scope

### In Scope
- Capture browser-level evidence for payload metrics shown in `BenchmarkPanel` after a benchmark run.
- Prove copy/export JSON parity for `payloadBytes`, `serializeMs`, `postMessageMs`, `roundTripMs`, `workerComputeMs`, and `estimatedTransferMs`.
- Add the minimum docs/scripts/supporting hooks needed to make this validation reproducible.

### Out of Scope
- Store redesign or Zustand persistence refactors.
- Parse/render/model-shape optimization.
- Expanding `ERDApp.tsx` beyond benchmark wiring already owned there.

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `auto-layout-worker-payload`: tighten evidence around benchmark-surface rendering and JSON copy/export parity so the archived warning can be closed.

## Approach

Use the existing compact payload instrumentation as the source of truth. Validate the real browser route `/benchmark`, compare visible panel values against copied/exported JSON, and record reproducible evidence plus any tiny support changes needed to remove ambiguity.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/pages/benchmark.astro` | Modified | Stable browser entry for validation runs. |
| `src/features/performance/BenchmarkPanel.tsx` | Modified | Confirm/display payload metric evidence surfaces. |
| `src/features/performance/diagramPerformance.ts` | Modified | Preserve JSON field parity for benchmark serialization. |
| `src/components/ERDApp.tsx` | Modified | Keep copy-to-clipboard wiring aligned without widening scope. |
| `scripts/performance/*` | Modified/New | Optional reproducible helpers for evidence capture. |
| `docs/performance-*` | Modified/New | Record the validation procedure and closure evidence. |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Browser-only behavior still hard to prove | Med | Define explicit evidence checklist and artifact outputs. |
| `m` preset falls back and muddies results | Med | Use documented preset/expectations and record fallback state. |
| Scope drifts into store churn | Low | Treat this as verification-only; defer structural work. |

## Rollback Plan

Revert any validation-only UI/script/docs changes and keep the archived warning open; no data migration or store contract rollback should be needed.

## Dependencies

- Browser-capable execution environment for `/benchmark`
- Existing Phase 5 payload instrumentation and archive report

## Success Criteria

- [ ] Browser evidence shows `BenchmarkPanel` rendering payload metrics on `/benchmark`.
- [ ] Copied/exported JSON contains the same payload metric fields and values shown in the panel.
- [ ] Repro steps and artifacts are documented well enough to re-run verification.
- [ ] Previous `PASS WITH WARNINGS` benchmark-surface warning can be explicitly closed.
