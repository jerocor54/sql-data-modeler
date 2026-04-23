# Tasks: Phase 5 Store Subscription Churn

## Phase 1: Narrative and store boundary foundation

- [x] 1.1 Update `PERFORMANCE_OPTIMIZATION_PLAN.md` only if the current Phase 5 narrative still treats store/persistence churn as an unnamed follow-up; record this slice as the bounded next step after payload work. Depends on: none. Validate: wording matches proposal/design and does not reopen parser/layout scope.
- [x] 1.2 Narrow `src/store/appStore.ts` persistence boundaries: remove `panelSplit`, `activeViewTab`, and `diagramViewport` from durable state/actions, keep `hasHydrated` runtime-only, and restrict `partialize` to durable workspace state + documented preferences. Depends on: 1.1. Validate: persisted snapshot contract matches spec scenarios.
- [x] 1.3 Add selector-oriented exports/hooks in `src/store/appStore.ts` for durable reads/actions used by `ERDApp.tsx`, keeping the store API explicit instead of full-store destructuring. Depends on: 1.2. Validate: selector surface covers SQL, preferences, table config, positions, and required actions only.

## Phase 2: Session ownership extraction at the composition boundary

- [x] 2.1 Create `src/components/useERDAppSessionState.ts` (or project-local equivalent) to own `panelSplit`, `activeViewTab`, and `diagramViewport`, including defaults, panel split clamping, and stable callbacks. Depends on: 1.2. Validate: reload defaults are `editor`, `42`, and `null` viewport.
- [x] 2.2 Refactor `src/components/ERDApp.tsx` to replace `useAppStore()` whole-store subscription with the new durable selectors plus `useERDAppSessionState()`. Depends on: 1.3, 2.1. Validate: root no longer reads the full store object and keeps composition-root ownership.

## Phase 3: Nearby composition consumer wiring

- [x] 3.1 Update `src/components/workspaces/DiagramWorkspace.tsx` to receive session-owned viewport/tab/split props and callbacks from `ERDApp.tsx` without widening workspace ownership. Depends on: 2.2. Validate: public prop behavior stays equivalent for manual layout and workspace flow.
- [x] 3.2 Update `src/features/diagram-canvas/DiagramCanvasSurface.tsx` only as needed so viewport restore and `onMoveEnd` continue through root-owned session callbacks instead of persisted store writes. Depends on: 3.1. Validate: no React Flow structural rewrite and session-only viewport writes stay local.

## Phase 4: Non-regression validation and evidence

- [x] 4.1 Run `npx tsc --noEmit` after Phases 1-3. Depends on: 3.2. Validate: store selectors, session hook, and workspace signatures compile cleanly.
- [ ] 4.2 Manual durable-state check: edit SQL, move tables, change table config/preferences, reload, and confirm `sqlText`, `tablePositions`, `tableConfig`, and durable preferences restore. Depends on: 4.1. Validate: preserved durable behavior matches pre-slice semantics.
- [ ] 4.3 Manual session-reset + churn check: resize panels, switch tabs, pan/zoom, reload, then profile drag/viewport interactions to confirm session state resets on reload, persisted snapshots omit session-only keys, and `ERDApp` avoids broad subscription churn. Depends on: 4.1. Validate: evidence shows narrowed persistence boundary and reduced unrelated root invalidation.

## Batching Plan

- Batch A: 1.1-1.3
- Batch B: 2.1-2.2
- Batch C: 3.1-3.2
- Batch D: 4.1-4.3
