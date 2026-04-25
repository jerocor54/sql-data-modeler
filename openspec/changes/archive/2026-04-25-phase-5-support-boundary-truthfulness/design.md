# Design: Phase 5 Support Boundary Truthfulness

## Technical Approach

Implement this as a documentation/copy-only slice that normalizes one verified support matrix across the master plan, benchmark metadata, benchmark UI, and baseline docs. Source of truth stays the existing evidence: real schemas complete on ELK today, preset `S` is interactively safe, and preset `M` currently crosses `ELK_LAYOUT_TIMEOUT_MS` (`2500`) and falls back.

## Architecture Decisions

| Decision | Options | Choice | Rationale |
|---|---|---|---|
| Support taxonomy for benchmark presets | Keep `safe` for `M`; add new runtime behavior; reclassify copy/metadata only | Reclassify `M` out of interactive-safe messaging without changing runtime gates | Spec requires truthful messaging only; runtime behavior must remain unchanged. |
| BenchmarkPanel message for `M` | Treat `M` like `S`; lump `M` with `L+`; explain timeout/fallback explicitly | Present `M` as current timeout/fallback territory, distinct from `S` and from larger CLI-only stress presets | Matches verified evidence and avoids implying `M` is interactively ELK-safe. |
| Baseline docs scope | Leave docs as-is; rewrite entire baseline; align only support-boundary sections | Targeted alignment in support matrix, manual benchmark guidance, and evidence interpretation | Keeps change local and additive per project standards. |

## Data Flow

Verified evidence → support matrix text → user-facing surfaces

```text
docs/performance-baseline.md
          │
          ├── PERFORMANCE_OPTIMIZATION_PLAN.md
          ├── benchmarkDatasets.ts
          └── BenchmarkPanel.tsx
```

Runtime data flow does not change. `layout.worker.ts` and `layoutWorkerProtocol.ts` remain evidence sources only: timeout still yields fallback, and UI copy is updated to describe that existing contract.

## File Changes

| File | Action | Description |
|---|---|---|
| `PERFORMANCE_OPTIMIZATION_PLAN.md` | Modify | Correct Phase 5 status/slice narrative, state recovered baseline truth, and add explicit non-goals preventing optimization drift. |
| `src/features/performance/benchmarkDatasets.ts` | Modify | Change preset `M` support label so metadata no longer marks it as interactively safe; keep `S` safe and `L+` controlled-only. |
| `src/features/performance/BenchmarkPanel.tsx` | Modify | Replace `S/M` safety wording with copy that says `S` is safe, `M` currently times out/falls back, and `L+` stays CLI/controlled measurement. |
| `docs/performance-baseline.md` | Modify | Align preset table, manual benchmark guidance, and “lectura técnica honesta” with the same `S`/real-schema/`M` boundary. |

## Interfaces / Contracts

No new interfaces. Update only the meaning and displayed wording of existing benchmark metadata.

- `BenchmarkDatasetPreset.interactiveSupport`
  - `s`: stays `safe`
  - `m`: changes to non-safe classification used today for non-interactive messaging/gating
  - `l/xl/xxl`: unchanged

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| Static review | Support matrix consistency | Diff all four files and verify identical claims: real schemas supported, `S` safe, `M` timeout/fallback, `L+` controlled-only. |
| Type check | No TS regressions from copy/metadata edits | Run `npx tsc --noEmit`. |
| Behavioral regression | Runtime unchanged | Verify no changes in layout worker, timeout constant, benchmark mechanics, or button handlers beyond copy/metadata inputs. |

## Migration / Rollout

No migration required. Rollout is immediate once wording and metadata are aligned.

## Open Questions

- [ ] Should `docs/performance-baseline.md` explicitly call real-schema support “recovered baseline truth” using the same wording as the plan, or is equivalent plain language enough?
