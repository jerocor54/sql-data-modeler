# Proposal: Phase 8 First Export Slice

## Intent

Make Phase 8 real by turning the already-explored overview export direction into an explicit product contract. This reduces accidental giant full-detail exports without pretending selection, area, or schema export already exist.

## Scope

### In Scope
- Define overview export as an intentional export path independent from the currently visible presentation mode.
- Keep the current format buttons (`SVG`, `PNG`, `JPEG`) but route them through the explicit overview contract for this slice.
- Document this slice as Phase 8 step 1 only, aligned with the master performance plan.

### Out of Scope
- Selection, area, schema, or arbitrary visible-state export contracts.
- Pre-export warnings, cost prompts, or a broader export mode picker.
- A full pipeline redesign beyond the minimal hidden overview surface needed now.

## Capabilities

### New Capabilities
- `diagram-export-overview`: Export an intentional overview snapshot as a first-class contract, separate from live visible mode.

### Modified Capabilities
- None.

## Approach

Reuse the existing overview presentation rules instead of toggling the live UI into overview at export time. Feed overview-filtered nodes/edges into a dedicated export surface so the export contract is explicit, narrow, and less timing-sensitive.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/components/ERDApp.tsx` | Modified | Route export actions through explicit overview intent and isolated export state. |
| `src/features/diagram-export/OverviewExportSurface.tsx` | New | Hidden export-only surface for overview rendering. |
| `src/features/diagram-presentation/useDiagramPresentation.ts` | Modified | Reuse overview visibility helpers as export input. |
| `PERFORMANCE_OPTIMIZATION_PLAN.md` | Modified | Record Phase 8 step 1 as closed and keep later steps deferred. |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Export still depends on DOM snapshot cost | Med | Keep scope to overview only and defer warnings/pipeline redesign honestly. |
| Contract drifts into broader export modes | Med | State explicit non-goals in proposal/specs. |

## Rollback Plan

Revert the explicit overview export path and restore the previous live-surface export behavior if the hidden surface introduces regressions or unacceptable export mismatches.

## Dependencies

- Existing overview presentation contract and current `html-to-image` export stack.

## Success Criteria

- [ ] The change defines overview export as a first-class contract rather than an incidental visible-mode side effect.
- [ ] `SVG`, `PNG`, and `JPEG` exports use the overview path for this slice.
- [ ] Proposal/spec work does not claim selection, area, schema, warnings, or pipeline separation as delivered.
