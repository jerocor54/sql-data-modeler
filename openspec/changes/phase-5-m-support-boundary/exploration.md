## Exploration: phase-5-m-support-boundary

### Current State
The clean recovery baseline changed the decision surface. Verified context says the real schema now runs without fallback, benchmark preset `S` recovered ELK execution, and preset `M` still hits the honest `ELK_LAYOUT_TIMEOUT` boundary and falls back. The code already exposes that boundary through typed diagnostics in `layout.worker.ts` / `useAutoLayout.ts`, but the product-facing support matrix is no longer truthful: `benchmarkDatasets.ts` still marks `M` as `interactiveSupport: 'safe'`, and `BenchmarkPanel.tsx` still renders “UI segura (S/M)”.

`PERFORMANCE_OPTIMIZATION_PLAN.md` is also behind the recovered reality. It still frames Phase 5 around the earlier payload/table-position sequence and does not encode the post-recovery baseline or the current support boundary: real schema = supported on ELK, preset `S` = supported on ELK, preset `M` = fallback-by-timeout case unless a later optimization slice proves otherwise.

### Affected Areas
- `PERFORMANCE_OPTIMIZATION_PLAN.md` — stale phase status, stale “current slice” narrative, and missing recovered support boundary.
- `src/features/performance/benchmarkDatasets.ts` — currently declares preset `M` as `interactiveSupport: 'safe'`.
- `src/features/performance/BenchmarkPanel.tsx` — currently tells users the UI is safe for `S/M` and enables the same support boundary in product copy.
- `docs/performance-baseline.md` — already contains useful evidence about `M` vs timeout; likely needs alignment once the support boundary is formalized.
- `src/features/auto-layout/layoutWorkerProtocol.ts` — defines the timeout/fallback taxonomy that supports truthful messaging.
- `src/features/auto-layout/layout.worker.ts` — emits the actual timeout/fallback warning and diagnostics used to justify the boundary.

### Approaches
1. **Formalize the recovered support boundary first** — update plan/copy/docs so product truth matches current evidence, then close the recovery milestone.
   - Pros: smallest safe slice; aligns roadmap with verified reality; removes dishonest `S/M` support messaging; creates a clean baseline before any new optimization bet.
   - Cons: does not make `M` faster by itself.
   - Effort: Low.

2. **Open a dedicated preset-`M` optimization slice now** — try to keep ELK interactive for `M`.
   - Pros: directly attacks the remaining painful benchmark case.
   - Cons: still speculative until the support boundary is made explicit; higher technical risk; easy to reopen broad tuning too early; violates the current instruction to treat this as a narrow post-recovery planning slice.
   - Effort: Medium/High.

3. **Move to the next roadmap phase immediately** — treat recovery as “good enough” and proceed.
   - Pros: preserves delivery momentum.
   - Cons: leaves roadmap and product messaging false; skips unresolved support-matrix truth; makes later decisions harder because the baseline story is inconsistent.
   - Effort: Low.

### Recommendation
Choose **Approach 1: formalize the recovered support boundary first**.

Why: the evidence is already sufficient to draw a truthful line. The system is no longer in generic “ELK recovery unknown” territory. We now know three concrete things: real schema is back on ELK, preset `S` is back on ELK, and preset `M` still exceeds the 2500 ms app timeout and falls back honestly. That means the narrowest safe next slice is not another optimization gamble; it is a truthfulness slice that updates the plan, support matrix, and benchmark/product copy to reflect what is actually supported today.

After that, the next technical decision becomes cleaner: if the team wants `M` to be interactive on ELK, that should be a separate deliberate slice with explicit success criteria. Until then, `M` should be treated as a documented fallback case, not implied supported behavior.

### Risks
- If the support boundary is not formalized now, users and future contributors will keep reading `M` as supported because the code still says `S/M` is UI-safe.
- If a dedicated `M` optimization slice starts before the boundary is documented, scope can drift back into broad speculative tuning.
- If the team jumps to the next roadmap phase now, `PERFORMANCE_OPTIMIZATION_PLAN.md` will keep guiding work from a stale recovery narrative.

### Ready for Proposal
Yes — propose a narrow truthfulness slice focused on the recovered support matrix, stale plan corrections, benchmark/product copy, and explicit deferral of any dedicated preset-`M` optimization to a later change.
