## Exploration: phase-5-table-position-persistence

### Current State
`src/store/appStore.ts` still keeps `tablePositions` inside the single persisted Zustand snapshot. The store uses `persist(...)` with only `name` and `partialize`, so it stays on the default `localStorage` backend. Zustand v5's persist middleware wraps every `set`/`setState` call with `setItem()`, and `setItem()` serializes `options.partialize({ ...get() })`, meaning every real `setTablePosition(...)` commit rewrites the persisted snapshot after cloning the whole `tablePositions` map.

`ERDApp.tsx` now reads `tablePositions` through `useAppStoreTablePositionState()` and only commits a manual move on `DiagramCanvasSurface` `onNodeDragStop`, so this is a drag-stop hotspot, not a drag-frame hotspot. Downstream consumers still rely on the in-memory shape: `useDiagramModel.ts` checks `tablePositions` to detect manual layout, while `useDiagramCanvasModel.ts` resolves node positions from `tablePositions` and already incrementally patches moved nodes/edges. Importantly, `useAutoLayout.ts` does not include `tablePositions` in its effect dependencies, so a manual drop no longer retriggers ELK layout work; the remaining suspect is the persistence/write path around the drop commit itself.

### Affected Areas
- `src/store/appStore.ts` — current persistence boundary, `setTablePosition`, `resetTablePositions`, and the broad persisted snapshot.
- `src/components/ERDApp.tsx` — composition-root wiring for manual position commits and any hydration/bootstrap seam.
- `src/features/diagram-canvas/DiagramCanvasSurface.tsx` — confirms position commits happen on drag-stop only.
- `src/features/diagram-canvas/useDiagramCanvasModel.ts` — must keep current in-memory `tablePositions` contract for resolved positions and incremental reroute patching.
- `src/features/parse-sql/useDiagramModel.ts` — must keep current `hasManualLayout` semantics.
- `src/types/erd.ts` — shared `Position` contract if a helper/store seam needs typed persistence I/O.
- `src/store/` or `src/lib/` (new helper seam likely) — best place for isolated table-position persistence without reopening parser/layout/render architecture.

### Approaches
1. **Keep `tablePositions` in the main persisted snapshot + add dirty-check minimization** — retain the current store shape and skip writes when the committed coordinates did not actually change.
   - Pros: tiniest code change; no hydration migration; preserves current persistence semantics automatically.
   - Cons: only avoids no-op writes; every real drop still clones the full positions map and rewrites the broad persisted snapshot, so the main hotspot likely remains.
   - Effort: Low.

2. **Separate persistence channel for `tablePositions` with deferred flush** — keep `tablePositions` in app memory for all existing consumers, but remove it from the main `persist` snapshot and hydrate/flush it through a dedicated helper or lightweight positions store keyed separately in local storage. Persist writes should be debounced and/or scheduled on idle, with structural dirty-checking before writing.
   - Pros: smallest safe boundary that targets manual-layout persistence cost only; preserves reload continuity; keeps `ERDApp.tsx` as composition root; avoids reopening payload/layout/parser/render contracts; lets the app update in-memory position immediately while shrinking synchronous localStorage work at drop time.
   - Cons: introduces a second durability seam and explicit hydration flow; deferred writes can lose the last move if the tab closes before flush unless the policy is carefully chosen.
   - Effort: Medium.

3. **Move manual positions into a dedicated persisted Zustand store/module** — fully isolate table-position ownership and persistence from the main app store.
   - Pros: strongest long-term separation; independently tunable persistence policy and selectors.
   - Cons: more invasive than this slice needs; touches more consumers and increases architectural motion for a hotspot-specific optimization.
   - Effort: Medium/High.

### Recommendation
Yes — the next actionable technical slice SHOULD target `tablePositions` persistence, but NOT by reopening the app architecture. The best boundary is **Approach 2: keep the current in-memory `tablePositions` contract, remove it from the broad main persisted snapshot, and persist it through a dedicated table-position channel with deferred/dirty-checked writes**.

Why: the store-churn slice already narrowed root subscriptions, the reroute hotfix already removed the visible freeze, and current code shows that manual drop commits do not rerun ELK. What still happens on each real drop is: clone the positions map, update Zustand state, and let persist serialize/write the durable snapshot through `localStorage`. That is EXACTLY the kind of synchronous persistence cost the new slice is supposed to attack. A separate positions persistence seam is the smallest safe cut because it preserves manual-layout durability while avoiding unnecessary rewrites of the rest of the durable snapshot.

### Risks
- Deferred persistence can weaken durability if the tab closes before the flush; the proposal must define acceptable flush timing and fallback behavior.
- A second storage key/helper needs explicit hydration ordering so `hasManualLayout` and initial diagram rendering stay equivalent after reload.
- Full removal of `tablePositions` from durability would violate the existing persistence spec and user-valued manual layout continuity.
- This slice must stay out of browser-only benchmark validation, parser/layout payload design, and wider render/model-shape refactors.

### Ready for Proposal
Yes — propose a narrow persistence slice that isolates `tablePositions` durability from the main persisted store, preserves reload continuity for manual layout, and explicitly keeps benchmark validation closure plus parser/layout/render architecture out of scope.
