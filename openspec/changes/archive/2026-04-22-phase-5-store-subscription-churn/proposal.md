# Proposal: Phase 5 Store Subscription Churn

## Intent

Follow the compact worker payload slice by removing the next measured bottlenecks: broad `ERDApp.tsx` subscriptions and persistence of high-churn session UI state. This keeps Phase 5 focused on real hotspots without changing durable payload contracts.

## Scope

### In Scope
- Replace `ERDApp.tsx` full-store subscription with explicit selectors/hooks at composition-root boundaries.
- Narrow persisted `appStore` state to durable data/preferences; extract session-only UI state (`panelSplit`, `activeViewTab`, candidate `diagramViewport`) out of durable persistence.
- Preserve existing downstream contracts for SQL parsing, manual table positions, table config, and React Flow workspace props.

### Out of Scope
- Payload contract changes, worker schema changes, or reopening `auto-layout-worker-payload`.
- React Flow/render architecture redesign.
- Parser/domain normalization, table-position reshaping, or browser validation closure for `phase-5-next-slice`.

## Capabilities

### New Capabilities
- `store-persistence-boundaries`: define which app state MUST persist across reloads versus remain session-only.
- `composition-root-store-selectors`: define selector-based app-store reads at the composition root to avoid broad invalidation.

### Modified Capabilities
- None.

## Approach

Keep `ERDApp.tsx` as composition root, but stop reading the whole Zustand store at once. Reclassify state into: durable persisted (`sqlText`, `tablePositions`, `tableConfig`, user preferences), session-only UI (`panelSplit`, `activeViewTab`, likely `diagramViewport`), and runtime flags (`hasHydrated`). If `diagramViewport` resume behavior is too valuable to drop, keep rollback simple by restoring persistence for that field only.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/store/appStore.ts` | Modified | Narrow `partialize`, expose selectors or selector-friendly exports. |
| `src/components/ERDApp.tsx` | Modified | Replace broad subscription with bounded reads. |
| `src/components/workspaces/DiagramWorkspace.tsx` | Modified | Consume stable viewport/session props without widening ownership. |
| `src/features/diagram-canvas/DiagramCanvasSurface.tsx` | Modified | Keep viewport wiring stable while session state moves. |
| `src/store/*session*` or `src/features/**/session*.ts` | New | Session-only UI state owner, if extraction is needed. |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Losing valued viewport restore behavior | Med | Decide explicitly; keep single-field rollback path. |
| Slice grows into store redesign | Med | Limit changes to selectorization + persistence boundary only. |

## Rollback Plan

Revert selectorized `ERDApp.tsx` reads to prior store access and re-add removed session keys to `partialize`. Do not touch parser/layout contracts, so rollback stays local to store/session wiring.

## Dependencies

- Exploration findings in `sdd/phase-5-store-subscription-churn/explore`
- Phase 5 master-plan rule: measured follow-up after compact payload work

## Success Criteria

- [ ] `ERDApp.tsx` no longer subscribes to the entire app store object.
- [ ] Persisted snapshot excludes session-only UI churn targeted by this slice.
- [ ] Manual layout, SQL persistence, and table visual config behavior remain intact.
- [ ] Change can be reverted by store/session wiring only.
