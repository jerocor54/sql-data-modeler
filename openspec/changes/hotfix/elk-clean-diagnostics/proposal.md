# Proposal: ELK Clean Diagnostics

## Intent

Classify why the clean branch still falls back after the worker-constructor fix. Add only typed fallback-cause and ELK provenance diagnostics so we can decide the next optimization from evidence, not guesses.

## Scope

### In Scope
- Add an additive typed diagnostic contract to the auto-layout worker result/protocol.
- Preserve the current runtime behavior while surfacing fallback cause + provenance through `useAutoLayout` and the composition root.
- Expose the diagnostics in benchmark/runtime reporting only where needed to identify the post-bootstrap fallback path.

### Out of Scope
- Freeze-mitigation work, render optimizations, or broader performance rewrites.
- Reintroducing experimental benchmark/fallback optimizations from prior branches.
- Changing persistence/store boundaries beyond lightweight diagnostic plumbing.

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `auto-layout-worker-payload`: extend worker result semantics so layout runs can report typed fallback cause and ELK provenance in addition to engine/warning data.

## Approach

Define a narrow diagnostic shape at the worker boundary (typed cause, provenance stage, optional error code/message). Populate it in `layout.worker.ts` for ELK success, timeout, worker error, and fallback/emergency paths. Thread that metadata through `useAutoLayout` into existing performance/reporting seams, keeping Astro as shell and `ERDApp.tsx` as composition root.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/features/auto-layout/layoutWorkerProtocol.ts` | Modified | Add typed fallback/provenance result contract |
| `src/features/auto-layout/layout.worker.ts` | Modified | Emit classified diagnostics for ELK/fallback paths |
| `src/features/auto-layout/useAutoLayout.ts` | Modified | Forward diagnostics with existing layout lifecycle |
| `src/components/ERDApp.tsx` | Modified | Keep composition root wiring for lightweight diagnostic display/plumbing |
| `src/features/performance/diagramPerformance.ts` | Modified | Record diagnostics in benchmark result shape if needed |
| `src/features/performance/BenchmarkPanel.tsx` | Maybe Modified | Surface the classified fallback reason/provenance for inspection |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Diagnostics widen scope into another perf project | Med | Keep fields additive and avoid behavior changes |
| Cause taxonomy is too vague to guide next step | Med | Prefer explicit timeout/worker/ELK/fallback-emergency categories |
| UI noise leaks into normal app flow | Low | Confine display to existing warning/benchmark seams |

## Rollback Plan

Revert the diagnostic fields and any UI/reporting wiring, returning the worker/result contract to engine + warning only. No data migration or persistence rollback is required.

## Dependencies

- Assumes `hotfix/elk-worker-constructor-fix` remains in place on the clean baseline.

## Success Criteria

- [ ] A benchmarked fallback run reports a typed cause that distinguishes timeout, worker failure, ELK failure, or emergency fallback.
- [ ] Provenance shows whether ELK executed and where fallback was decided.
- [ ] No freeze-mitigation logic or broad optimization work is introduced.
- [ ] Existing layout behavior remains functionally unchanged aside from added diagnostics.
