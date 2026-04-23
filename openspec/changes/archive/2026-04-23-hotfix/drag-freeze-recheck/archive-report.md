# Archive Report: hotfix/drag-freeze-recheck

## Closure Summary

- Archived after verify verdict `PASS WITH WARNINGS`.
- User validation confirmed drag responsiveness is fluent again after the presentation-membership stabilization.
- The warning about unexercised membership-sensitive refresh paths remains open and is preserved in this archive trail.

## Specs Synced

| Domain | Action | Details |
|---|---|---|
| `composition-root-store-selectors` | Updated | Modified `Keep the composition root on bounded store subscriptions` to require membership-sensitive presentation inputs and added the drag-position scenario. |
| `drag-presentation-stability` | Created | Promoted the hotfix capability spec to the main source of truth with drag-fluidity behavior, optional-local-fallback boundaries, and scope guardrails. |

## Verification Record

- Verdict: `PASS WITH WARNINGS`
- Drag evidence: user validated in-browser that dragging is fluent again; no `DiagramCanvasSurface` fallback was needed.
- Remaining caveat: task `3.2` is still incomplete, so parse/layout, add/remove, search/focus, preview, and selected-relationship refresh paths were not all manually exercised at runtime.
- Scope caveat: unrelated uncommitted `phase-5-table-position-persistence` work remains in the working tree and was intentionally excluded from this archive.

## Archive Contents

- `exploration.md`
- `proposal.md`
- `design.md`
- `tasks.md`
- `verify-report.md`
- `specs/composition-root-store-selectors/spec.md`
- `specs/drag-presentation-stability/spec.md`

## Source of Truth Updated

- `openspec/specs/composition-root-store-selectors/spec.md`
- `openspec/specs/drag-presentation-stability/spec.md`

## Traceability

- Artifact store mode: `hybrid`
- Engram archive topic: `sdd/hotfix/drag-freeze-recheck/archive-report`
- Observation IDs for prior phase artifacts: not available in filesystem-backed OpenSpec artifacts during this archive pass.

## Outcome

The hotfix is closed as an archived presentation invalidation fix. The main specs now capture the validated drag-fluidity behavior and explicitly retain the outstanding membership-refresh warning for follow-up validation.
