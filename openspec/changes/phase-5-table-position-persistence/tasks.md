# Tasks: Phase 5 Table Position Persistence

## Phase 1: Plan + persistence boundary

- [x] 1.1 Update `PERFORMANCE_OPTIMIZATION_PLAN.md` slice narrative so Phase 5 explicitly scopes this follow-up to `tablePositions` durability, reduced sync churn, and reload continuity only.
- [x] 1.2 Modify `src/store/appStore.ts` to remove `tablePositions` from the persisted snapshot/types, keep broad durable preferences intact, and split broad-store hydration from final app-ready hydration.
- [x] 1.3 Create `src/store/tablePositionStore.ts` with runtime-only `tablePositions`, `setTablePosition`, `resetTablePositions`, and `replaceTablePositions` APIs matching current consumers.

## Phase 2: Dedicated table-position durability seam

- [x] 2.1 Create `src/store/tablePositionPersistence.ts` with dedicated storage key, finite `{x,y}` parser/validator, dirty snapshot tracking, deferred flush scheduling, `flushNow`, and `dispose`, falling back to `{}` on invalid data.
- [x] 2.2 Add helper support for legacy fallback reads from the old app snapshot only when the dedicated key is absent, so reload continuity survives the migration without reopening payload contracts.
- [x] 2.3 Wire runtime position updates and resets through the helper so real coordinate changes schedule writes, no-op commits skip writes, and resets clear the dedicated durable payload.

## Phase 3: Root hydration + integration wiring

- [x] 3.1 Update `src/components/ERDApp.tsx` boot flow to wait for broad store hydration, load dedicated table positions, replace runtime positions, and only then set the final `hasHydrated` gate.
- [x] 3.2 Register/unregister `visibilitychange` and `beforeunload` flush hooks in `src/components/ERDApp.tsx` so deferred writes stay bounded without leaking listeners.
- [x] 3.3 Switch `ERDApp.tsx` selector usage to the new runtime table-position store while preserving `useDiagramModel.ts` and `useDiagramCanvasModel.ts` contracts unchanged.

## Phase 4: Validation + evidence

- [x] 4.1 Verify `src/features/parse-sql/useDiagramModel.ts` and `src/features/diagram-canvas/useDiagramCanvasModel.ts` keep identical `hasManualLayout` and resolved-position semantics after the store source swap.
- [ ] 4.2 Run `npx tsc --noEmit`, then record manual evidence that drag-stop updates runtime immediately, the broad app snapshot stays stable, and the dedicated key flushes only after the deferred policy.
- [ ] 4.3 Record manual reload/fallback evidence: moved tables restore before UI settles, missing/corrupt dedicated storage falls back safely, and normal background/close flows flush the latest dirty move.

## Dependencies

`1.1 → 1.2 → 1.3 → 2.1/2.2 → 2.3 → 3.1/3.2/3.3 → 4.1 → 4.2/4.3`

## Batching Plan

- Batch A: `1.1-1.3` foundation (`appStore` boundary + runtime store).
- Batch B: `2.1-2.3` dedicated persistence helper and write path.
- Batch C: `3.1-3.3` hydration gate and root integration wiring.
- Batch D: `4.1-4.3` non-regression verification and manual evidence capture.
