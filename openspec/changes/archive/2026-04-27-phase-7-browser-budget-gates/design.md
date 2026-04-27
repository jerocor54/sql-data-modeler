# Design: Phase 7 Browser Budget Gates

## Technical Approach

Extend the existing DEV-only Playwright harness instead of adding a second measurement path. `runBrowserBenchmarkHarness.ts` should keep owning server boot, route navigation, preset selection, readiness wait, snapshot read, and artifact write; the change is to add a policy-driven **budget evaluation layer** on top of the current contract/readability/coherence checks. The browser-readable snapshot remains the primary metric source, while overlay text and page-level browser signals become secondary evidence used only for consistency and fatal-regression detection.

## Architecture Decisions

| Decision | Choice | Alternatives considered | Rationale |
|---|---|---|---|
| Policy location | Keep browser gate policy in `docs/browser-performance-harness-policy.md`, add a machine-readable policy file under `scripts/performance/browserBudgetPolicy.ts` | JSON-only config; hardcoded thresholds inside harness | Docs stay human-auditable, TS policy stays typed/versioned near the runner. This avoids drift and keeps repo-level assertions explicit. |
| Source of truth | Snapshot fields stay authoritative; overlay and browser events are coherence checks only | DOM text as primary source; Playwright timing APIs as pass/fail source | Snapshot is already serializable, versioned, and app-owned. DOM text is more fragile, and raw browser timing is noisier across machines. |
| Budget model | Use coarse preset-aware ceilings plus semantic gates | exact FPS/interaction budgets; single global timeout budget | Coarse preset budgets are honest for local DEV variability. Semantic truth catches regressions without overclaiming precision. |
| Artifact stability | Evolve current JSON report shape additively; keep one stable file per preset | New artifact family per run; overwrite with unstructured logs only | Existing stable report paths are already consumed as evidence. Additive evolution preserves comparability and avoids churn. |

## Data Flow

```text
browserBudgetPolicy.ts
        │
        ▼
runBrowserBenchmarkHarness.ts ──► DEV server + Playwright page
        │                                │
        │ reads                          ├─ snapshot: window.__SQL_DATA_MODELER_PERF__
        │                                ├─ overlay text/labels
        │                                └─ fatal browser errors (pageerror/console/request failures)
        ▼
browser budget evaluation ──► report JSON ──► assertBrowserBenchmarkHarness.ts
```

Sequence:
1. Harness boots Astro DEV and resolves the real base URL.
2. Playwright opens `/sql-data-modeler/benchmark`, selects preset, triggers load, and waits for the existing usable seam.
3. Harness captures snapshot, overlay evidence, and fatal browser diagnostics.
4. Policy evaluates preset-specific budget/gate rules.
5. Stable JSON artifacts are written for `s` and `m`; `benchmark:browser:assert` fails if any required gate fails.

## File Changes

| File | Action | Description |
|---|---|---|
| `openspec/changes/phase-7-browser-budget-gates/design.md` | Create | Technical design for this change. |
| `scripts/performance/browserBudgetPolicy.ts` | Create | Typed preset policy: ceilings, allowed fallback semantics, required checks. |
| `scripts/performance/runBrowserBenchmarkHarness.ts` | Modify | Capture browser fatal signals, overlay evidence, and evaluate policy into report fields. |
| `scripts/performance/assertBrowserBenchmarkHarness.ts` | Modify | Continue fixed `s+m` workflow, but fail on broader policy gates. |
| `src/features/performance/browserPerformanceSnapshot.ts` | Modify | Add only serializable fields needed for policy/coherence (no React/Zustand internals). |
| `src/features/performance/PerformanceOverlay.tsx` | Modify | Expose stable labels/status text that can be compared against snapshot truth. |
| `docs/browser-performance-harness-policy.md` | Modify | Document policy semantics, variability rules, and non-goals. |

## Interfaces / Contracts

```ts
interface BrowserBudgetPolicy {
  presetId: 's' | 'm';
  readinessCeilingMs: number;
  requiresNonFallback: boolean;
  allowsFallbackBoundary: boolean;
}

interface BrowserBenchmarkReport {
  status: 'pass' | 'fail';
  harness: { route: string; presetId: 's' | 'm'; timeoutMs: number; browser: 'chromium' };
  checks: { contract: CheckGroup; readability: CheckGroup; coherence: CheckGroup; budgets: CheckGroup; fatal: CheckGroup };
  evidence: { snapshot: BrowserPerformanceSnapshot | null; overlay: { fallbackLabel: string | null }; browser: { pageErrors: string[]; consoleErrors: string[] } };
}
```

`checks.budgets` and `checks.fatal` are new, but `snapshot` remains the metric source of truth. Existing stable paths `browser-benchmark-report.s.json` and `.m.json` remain unchanged.

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| Type validation | Policy/report types stay aligned | `npx tsc --noEmit` |
| Script integration | `s`/`m` report generation and assert workflow | Manual `npm run benchmark:browser(:assert)` during implementation |
| Artifact review | Stable JSON fields explain pass/fail honestly | Compare generated reports with existing artifact structure |

## Migration / Rollout

No migration required. Roll out by adding policy and additive report fields first, then turning repo-level assert onto the new checks.

## Open Questions

- [ ] Whether long-task gating should stay presence/coherence-only in this slice or allow a very coarse max-duration sanity threshold for `S`.
- [ ] Exact snapshot field needed for overlay coherence beyond current fallback status, if any.
