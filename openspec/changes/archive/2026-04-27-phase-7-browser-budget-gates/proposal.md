# Proposal: Phase 7 Browser Budget Gates

## Intent

The current browser harness proves only minimal semantic truth for `/sql-data-modeler/benchmark` (`S` works on ELK, `M` reaches the honest timeout/fallback boundary). That is not enough to catch broader browser regressions in readiness, coarse UX health, overlay truth, or fatal page behavior before Phase 8 work starts.

## Scope

### In Scope
- Expand the Phase 7 harness from contract/readability checks to a first honest set of browser-backed budgets/gates on the benchmark route.
- Define which browser signals can gate now: readiness-to-usable, fallback truth, fatal page errors, long-task/overlay/snapshot coherence, and coarse preset-aware timing ceilings.
- Produce the spec/design/task contract for repo-level enforcement and stable evidence artifacts.

### Out of Scope
- Exact FPS guarantees, visual diff approval, or pixel-perfect overlay rendering.
- Broad editor-route interaction coverage, production-mode certification, or cross-browser matrix runs.
- New runtime optimization claims for `M`, timeout tuning, or Phase 8 feature work.

## Capabilities

### New Capabilities
- `browser-performance-gates`: browser-backed benchmark budgets and semantic gates for readiness, diagnostics truth, overlay coherence, and fatal-browser-regression detection.

### Modified Capabilities
- None.

## Approach

Build on the existing DEV snapshot contract and Playwright harness instead of inventing new internals. The first slice should gate: `S` reaches usable settled state within a documented coarse ceiling and stays non-fallback; `M` reaches usable settled state within its longer guard while preserving explicit timeout/fallback truth; both runs expose readable snapshot fields, no fatal page errors, and overlay-visible status that agrees with the snapshot. Avoid fake precision: long-task data may support sanity thresholds or presence/coherence checks, but not machine-independent FPS promises.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `openspec/specs/` | New | Add capability spec for browser-backed gates. |
| `scripts/performance/runBrowserBenchmarkHarness.ts` | Modified | Capture/report broader gate signals. |
| `scripts/performance/assertBrowserBenchmarkHarness.ts` | Modified | Enforce repo-level browser assertions. |
| `src/features/performance/browserPerformanceSnapshot.ts` | Modified | Expose only the extra serializable fields truly needed. |
| `src/features/performance/PerformanceOverlay.tsx` | Modified | Keep overlay truth alignable with snapshot/harness checks. |
| `docs/browser-performance-harness-policy.md` | Modified | Document the first honest browser budgets and exclusions. |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Noisy machine-dependent timings | High | Use coarse preset-aware ceilings and semantic checks first. |
| Scope drift into fake FPS/UX certification | Med | Lock explicit non-goals in spec/design. |
| Snapshot/overlay coupling grows | Med | Extend only documented DEV-only contracts. |

## Rollback Plan

Revert new browser-budget assertions and docs, returning to the current minimal harness plus CLI baseline gate. Keep runtime behavior unchanged.

## Dependencies

- Existing DEV snapshot contract and minimal Playwright harness
- `npx tsc --noEmit`

## Success Criteria

- [ ] Proposal/specs define the first browser-backed budgets/gates without claiming exact FPS or broad UX coverage.
- [ ] Initial gates clearly separate `S` non-fallback expectations from `M` fallback-boundary expectations.
- [ ] Overlay/browser/snapshot coherence becomes a deliberate validated contract, not an assumption.
- [ ] Repo-level browser assertions can grow from the current minimal harness without replacing the CLI baseline gate.
