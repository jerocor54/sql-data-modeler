## Exploration: phase-5-store-subscription-churn

### Current State
`src/store/appStore.ts` uses a single persisted Zustand store and `partialize` currently writes almost every user-facing value into `localStorage`: `sqlText`, theme/display preferences, `viewMode`, `activeViewTab`, `diagramViewport`, `panelSplit`, `tableConfig`, and `tablePositions`. That means the durable SQL payload and the heaviest per-table maps share the same persistence boundary as session-only UI preferences.

`src/components/ERDApp.tsx` still calls `useAppStore()` once and destructures the full store object. In practice, any store mutation that changes a selected key can invalidate the entire composition root, even when only one subtree cares. The churn suspects are visible in real code paths: `setPanelSplit(...)` fires during `pointermove`, `setDiagramViewport(...)` fires from `ReactFlow` `onMoveEnd`, `setSqlText(...)` fires from editor changes, and `setTablePosition(...)` persists manual node movement.

The app already has a healthier precedent for ephemeral state separation: `src/features/diagram-canvas/diagramCanvasTransientState.ts` keeps highlight/focus canvas state in a dedicated transient Zustand store with selector-based reads. By contrast, the main app store still mixes durable state (`sqlText`, `tablePositions`, `tableConfig`), session UI state (`panelSplit`, `activeViewTab`, likely `diagramViewport`), and non-persisted runtime flags (`hasHydrated`) inside one broad subscription surface. That mix can easily hide the gains from the compact layout payload slice because the app may still spend time rerendering the root and serializing oversized persisted snapshots after interaction.

### Affected Areas
- `src/store/appStore.ts` — persistence boundary, state classification, and write-amplification source.
- `src/components/ERDApp.tsx` — full-store subscription hotspot and main composition root invalidation surface.
- `src/components/workspaces/DiagramWorkspace.tsx` — receives viewport and diagram props from the root; should keep contract stable.
- `src/features/diagram-canvas/DiagramCanvasSurface.tsx` — persists viewport changes and shows where session UI state crosses the store boundary.
- `src/features/parse-sql/useDiagramModel.ts` — consumes `sqlText` and `tablePositions`; confirms manual-layout semantics must not be reopened lightly.
- `src/features/diagram-canvas/useDiagramCanvasModel.ts` — consumes `tableConfig` and `tablePositions`; confirms downstream render/layout contracts should stay untouched.

### Approaches
1. **Selectors only in `ERDApp`** — replace `useAppStore()` full destructure with targeted selector subscriptions while keeping one persisted store.
   - Pros: smallest code motion; immediately reduces root invalidation fan-out.
   - Cons: leaves `partialize` broad, so persistence write-amplification remains.
   - Effort: Low.

2. **Narrow session-state extraction + selectors** — keep durable domain/user-preference state persisted, but stop persisting session-only UI state (`panelSplit`, `activeViewTab`, and likely `diagramViewport`) and read the remaining store via targeted selectors/hooks.
   - Pros: attacks both subscription churn and unnecessary persistence churn without changing parser/layout/render contracts; preserves Astro shell and `ERDApp.tsx` as composition root.
   - Cons: needs an explicit decision about whether restoring `diagramViewport` is product-critical or just convenience.
   - Effort: Medium.

3. **Full durable/ephemeral/derived store split** — create separate stores/modules for persisted preferences, session UI, and derived runtime state.
   - Pros: cleanest long-term ownership model.
   - Cons: too wide for the next slice; risks reopening feature boundaries and composition wiring.
   - Effort: High.

### Recommendation
The next **technical** slice should be **Approach 2: narrow session-state extraction + selectors**, while keeping the browser-only benchmark warning explicitly outside this change.

Why: the codebase already shows two concrete churn sources, not just theory. First, `ERDApp.tsx` is over-subscribed to the entire Zustand store. Second, the persisted snapshot currently mixes large durable payloads with high-churn session UI writes. A safe slice is to keep durable semantics intact for `sqlText`, `tableConfig`, and `tablePositions`, but remove session-only state from persistence and stop subscribing the composition root to everything at once. That gives a real chance to expose whether payload gains were being masked by root invalidation/localStorage serialization, WITHOUT reopening parser/layout/render contracts.

### Risks
- `diagramViewport` may be considered a user-valued convenience; removing it from persistence changes resume behavior and needs explicit product sign-off.
- `tablePositions` is large, but it is also part of the manual-layout contract; removing or reshaping it would exceed the safe slice.
- `lineStyle` appears persisted in `appStore.ts` but `ERDApp.tsx` hardcodes `effectiveLineStyle = 'orthogonal'`; cleaning dead state is tempting, but it should stay secondary unless it naturally fits the chosen slice.
- If the next slice grows into a full store redesign, it will violate the project rule to keep the technical boundary narrow.

### Ready for Proposal
Yes — propose a store-focused slice limited to (1) selectorizing `ERDApp.tsx` store reads and (2) reclassifying persisted vs session-only app state, explicitly excluding parser/layout/render refactors and excluding closure of the pending browser-only benchmark warning.
