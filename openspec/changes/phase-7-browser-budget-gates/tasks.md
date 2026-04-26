# Tasks: Phase 7 Browser Budget Gates

## Phase 1: Policy and Contract Foundation

- [ ] 1.1 Create `scripts/performance/browserBudgetPolicy.ts` with typed preset policies for `s` and `m`, including readiness ceilings, fallback semantics, and required gate names consumed by the harness.
- [ ] 1.2 Update `src/features/performance/browserPerformanceSnapshot.ts` to expose only the extra serializable fields needed for browser budgets/coherence, and keep snapshot fields the primary browser assertion source.
- [ ] 1.3 Update `src/features/performance/PerformanceOverlay.tsx` to emit stable fallback/status labels that can be compared against snapshot truth without making the overlay the source of truth.

## Phase 2: Harness Budget Evaluation

- [ ] 2.1 Refactor `scripts/performance/runBrowserBenchmarkHarness.ts` to load the policy, capture snapshot plus overlay evidence, and collect fatal browser diagnostics (`pageerror`, console errors, failed requests) during each run.
- [ ] 2.2 Add policy-driven `checks.budgets` and `checks.fatal` evaluation in `scripts/performance/runBrowserBenchmarkHarness.ts`, preserving preset-aware semantics: `S` must pass within ceiling without fallback; `M` must preserve honest fallback/timeout-boundary truth.
- [ ] 2.3 Evolve the stable report shape in `scripts/performance/runBrowserBenchmarkHarness.ts` additively so `browser-benchmark-report.s.json` and `.m.json` keep their paths while gaining reproducible evidence and pass/fail explanations.

## Phase 3: Repo-Level Assert and Evidence Workflow

- [ ] 3.1 Update `scripts/performance/assertBrowserBenchmarkHarness.ts` to keep the fixed `s+m` workflow but fail the command when any required browser contract, coherence, budget, or fatal gate fails.
- [ ] 3.2 Manually run `npm run benchmark:browser -- --preset=s`, `npm run benchmark:browser -- --preset=m`, and `npm run benchmark:browser:assert` to verify the new gates, stable artifact writes, and honest `S` vs `M` outcomes.
- [ ] 3.3 Run `npx tsc --noEmit` to validate the new policy/report/snapshot typing after the harness changes.

## Phase 4: Documentation and Scope Guardrails

- [ ] 4.1 Update `docs/browser-performance-harness-policy.md` to document the machine-readable policy, preset-aware browser budgets, artifact fields, fatal-error gates, and rerun workflow.
- [ ] 4.2 Document explicit non-goals in `docs/browser-performance-harness-policy.md`: no FPS guarantees, no visual diff approval, no editor-route certification, no production-mode or cross-browser claims.
- [ ] 4.3 If long-task gating remains unresolved, record it as a follow-up note in `docs/browser-performance-harness-policy.md` or the change docs instead of widening this slice beyond coarse presence/coherence checks.
