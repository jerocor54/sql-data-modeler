# Archive Report: phase-5-table-position-persistence

## Closure Summary

- Archived with verify verdict `PARTIAL` because the implementation is structurally complete but broader manual/runtime proof is still incomplete.
- Synced the `store-persistence-boundaries` delta into the main spec so the dedicated `tablePositions` durability seam is now part of the source of truth.
- Preserved the runtime-validation caveats instead of closing them silently.

## Specs Synced

| Domain | Action | Details |
| --- | --- | --- |
| `store-persistence-boundaries` | Updated | Added 2 requirements (`Isolate table-position durability from the broad snapshot`, `Hydrate dedicated table positions explicitly and fail safe`); modified 2 requirements (`Preserve durable user-valued workspace state`, `Keep the persistence slice narrowly scoped`); removed 0 requirements. |

## Verification Status Carried Forward

- `verify-report.md` verdict remains `PARTIAL`.
- Structural closure achieved: dedicated persistence seam, runtime store extraction, hydration gate, and narrow scope constraints are reflected in code and spec.
- Behavioral closure is still warning-bound because archive-quality manual evidence is incomplete.

## Explicit Caveats Preserved

- Drag-stop/runtime durability proof beyond the validated drag symptom is still pending.
- Reload restoration ordering, corrupt/missing-key fallback, and `visibilitychange` / `beforeunload` flush behavior were not fully exercised as archive-quality manual evidence.
- No automated test runner exists in this repository, so this slice still depends on manual/browser verification for behavioral proof.

## Traceability

### OpenSpec Artifacts

- `openspec/changes/phase-5-table-position-persistence/exploration.md`
- `openspec/changes/phase-5-table-position-persistence/proposal.md`
- `openspec/changes/phase-5-table-position-persistence/specs/store-persistence-boundaries/spec.md`
- `openspec/changes/phase-5-table-position-persistence/design.md`
- `openspec/changes/phase-5-table-position-persistence/tasks.md`
- `openspec/changes/phase-5-table-position-persistence/verify-report.md`

### Engram Observations

- Exploration: `#531`
- Proposal: `#533`
- Spec: `#537`
- Design: `#539`
- Tasks: `#542`
- Verify report: no Engram observation found at archive time; filesystem source used: `openspec/changes/phase-5-table-position-persistence/verify-report.md`

## Archive Handoff

- This closure covers only `phase-5-table-position-persistence`.
- The separately archived drag-freeze hotfix remains a distinct audit trail and was not merged into this archive.
- If a follow-up slice needs stronger closure, start with manual/browser evidence for deferred flush timing, reload ordering, corrupt-key fallback, and lifecycle flush behavior before broadening architecture scope.
