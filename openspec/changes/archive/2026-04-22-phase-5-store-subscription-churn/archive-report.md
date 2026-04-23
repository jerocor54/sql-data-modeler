# Archive Report: phase-5-store-subscription-churn

## Summary

Archived the Phase 5 store subscription churn slice after syncing its delta specs into the main OpenSpec source of truth. This closure preserves the verify verdict of **PASS WITH WARNINGS** and keeps the manual validation caveats visible for the next slice.

## Change Metadata

- **Change**: `phase-5-store-subscription-churn`
- **Archive date**: `2026-04-22`
- **Artifact mode**: `hybrid`
- **Implementation commit**: `7dcb272`
- **Remote branch**: `origin/refactor/performance-foundation`
- **Verify verdict**: `PASS WITH WARNINGS`

## Traceability

| Artifact | Filesystem source | Engram observation |
|---|---|---:|
| Exploration | `openspec/changes/phase-5-store-subscription-churn/exploration.md` | `#491` |
| Proposal | `openspec/changes/phase-5-store-subscription-churn/proposal.md` | `#494` |
| Specs | `openspec/changes/phase-5-store-subscription-churn/specs/**/spec.md` | `#497` |
| Design | `openspec/changes/phase-5-store-subscription-churn/design.md` | `#500` |
| Tasks | `openspec/changes/phase-5-store-subscription-churn/tasks.md` | `#503` |
| Apply progress | Engram-only artifact for this slice | `#505` |
| Verify report | `openspec/changes/phase-5-store-subscription-churn/verify-report.md` | `#509` |

## Specs Synced

| Domain | Action | Details |
|---|---|---|
| `composition-root-store-selectors` | Created main spec | Added 2 requirements covering bounded composition-root subscriptions and stable workspace wiring. |
| `store-persistence-boundaries` | Created main spec | Added 3 requirements covering durable reload continuity, session-only persistence exclusion, and local-only scope. |

## Verification State Carried Forward

The change closes formally with warnings preserved rather than dropped:

1. Manual durable reload continuity for `sqlText`, `tablePositions`, `tableConfig`, and durable preferences was **not runtime-proven in-browser**.
2. Profiler evidence that root invalidation was reduced after selector/session extraction is **still pending**.
3. **No automated test runner exists**, so verification confidence remains bounded to static evidence plus TypeScript compilation.

## Handoff State

- `ERDApp.tsx` remains the composition root.
- Session-only UI ownership stays next to the root instead of moving back into the durable store.
- This archive does **not** reopen payload, parser, layout, or render contracts from earlier Phase 5 work.
- The next slice should treat the pending reload/profiler checks as explicit follow-up evidence, not as implicitly resolved by archive.

## Archive Verification

- [x] Delta specs synced into `openspec/specs/`
- [x] Archive report added to the change folder before archival
- [x] Change folder ready to move into dated archive path
- [x] Verify warnings preserved in the closure record
