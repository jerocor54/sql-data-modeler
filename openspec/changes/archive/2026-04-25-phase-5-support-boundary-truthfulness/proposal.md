# Proposal: Phase 5 Support Boundary Truthfulness

## Intent

Align roadmap, benchmark presets, and product copy with verified reality after recovery: real schema and preset `S` complete on ELK, while preset `M` currently crosses the in-app timeout boundary and falls back.

## Scope

### In Scope
- Update `PERFORMANCE_OPTIMIZATION_PLAN.md` to record the recovered baseline and current Phase 5 truthfulness slice.
- Reclassify benchmark preset support in `src/features/performance/benchmarkDatasets.ts` and `src/features/performance/BenchmarkPanel.tsx` so UI copy no longer implies `M` is interactively supported.
- Align `docs/performance-baseline.md` with the verified support matrix and fallback evidence.

### Out of Scope
- Any ELK runtime fix, timeout tuning, or broad performance optimization for preset `M`.
- New benchmark infrastructure, new datasets, or changes to worker/layout algorithms.

## Capabilities

### New Capabilities
- `performance-support-boundary`: Define the verified interactive support matrix and required benchmark/product messaging for fallback-boundary cases.

### Modified Capabilities
- None.

## Approach

Use the existing diagnostics and documented benchmark evidence as the source of truth. Update plan/docs/copy additively so the product says only what current behavior proves, and explicitly defer any future preset-`M` optimization slice.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `PERFORMANCE_OPTIMIZATION_PLAN.md` | Modified | Refresh Phase 5 status, baseline narrative, and support boundary. |
| `src/features/performance/benchmarkDatasets.ts` | Modified | Change preset `M` support classification. |
| `src/features/performance/BenchmarkPanel.tsx` | Modified | Replace `S/M` safety copy with truthful support/fallback messaging. |
| `docs/performance-baseline.md` | Modified | Document recovered evidence and current support matrix. |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Copy and docs diverge again | Med | Use one verified support boundary across all touched files. |
| Proposal accidentally expands into optimization work | Med | Keep scope documentation-only and additive. |
| Users read fallback as regression instead of current contract | Low | State evidence and timeout boundary explicitly. |

## Rollback Plan

Revert the proposal-driven copy/support-matrix edits in the four affected files and restore the prior wording/classification if the team decides to postpone truthfulness updates. No schema, runtime contract, or persisted data changes are involved.

## Dependencies

- Verified evidence already captured in `openspec/changes/phase-5-m-support-boundary/exploration.md` and `docs/performance-baseline.md`.

## Success Criteria

- [ ] Plan, benchmark preset metadata, UI copy, and baseline docs describe the same support boundary.
- [ ] Preset `M` is no longer presented as interactively safe in product-facing benchmark surfaces.
- [ ] The change explicitly defers any dedicated preset-`M` optimization to a later slice.
