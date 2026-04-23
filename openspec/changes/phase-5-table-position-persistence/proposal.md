# Proposal: Phase 5 Table Position Persistence

## Intent

Follow the archived payload and store-churn slices by attacking the next measured hotspot: synchronous persistence work on manual table drops. Preserve manual layout durability, but move `tablePositions` off the broad persisted snapshot path.

## Scope

### In Scope
- Remove `tablePositions` from the broad `appStore` persisted snapshot while keeping the in-memory contract unchanged for current consumers.
- Add a dedicated persistence channel for `tablePositions` with deferred, dirty-checked writes.
- Add an explicit hydration seam at `ERDApp.tsx` so durable positions restore before manual-layout consumers rely on them.

### Out of Scope
- Payload/parser/render architecture changes.
- React Flow or ELK behavior redesign.
- Browser benchmark validation closure or new benchmark instrumentation.

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `store-persistence-boundaries`: refine how durable `tablePositions` persistence is delivered without weakening reload continuity.

## Approach

Keep `ERDApp.tsx` as composition root. `appStore` continues owning in-memory `tablePositions`, but durable writes move to a focused helper or store-local module under `src/store/` or `src/lib/`, keyed separately from the main snapshot. Writes SHOULD skip no-op coordinates and flush after drag-stop on a deferred policy; hydration MUST restore saved positions before `hasManualLayout`-dependent flows settle. Last-write-loss on abrupt tab close is an accepted caveat only if documented and bounded.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/store/appStore.ts` | Modified | Remove `tablePositions` from broad snapshot; keep in-memory ownership/actions. |
| `src/components/ERDApp.tsx` | Modified | Wire hydration/bootstrap seam for durable positions. |
| `src/store/` or `src/lib/` | New | Dedicated table-position persistence helper/channel. |
| `src/features/parse-sql/useDiagramModel.ts` | Verified-compatible | Preserve `hasManualLayout` semantics. |
| `src/features/diagram-canvas/useDiagramCanvasModel.ts` | Verified-compatible | Preserve resolved-position contract. |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Lost final move before deferred flush | Med | Use bounded flush timing and document durability caveat. |
| Hydration ordering breaks initial manual layout | Med | Restore positions before downstream layout/manual checks finalize. |
| Slice expands into store redesign | Low | Limit change to `tablePositions` durability path only. |

## Rollback Plan

Re-add `tablePositions` to the main persisted snapshot and remove the dedicated persistence seam. Keep rollback local to store persistence and root hydration wiring.

## Dependencies

- `openspec/changes/phase-5-table-position-persistence/exploration.md`
- `PERFORMANCE_OPTIMIZATION_PLAN.md`
- Archived Phase 5 payload and store-churn reports/specs

## Success Criteria

- [ ] Real table-position changes no longer rewrite the broad persisted app snapshot.
- [ ] Manual layout still restores after reload through a dedicated durability seam.
- [ ] Dirty-check + deferred flush policy is explicit, bounded, and rollbackable.
- [ ] No payload/parser/render or browser-validation scope is reopened.
