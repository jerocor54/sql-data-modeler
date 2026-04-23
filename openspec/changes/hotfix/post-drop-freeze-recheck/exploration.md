## Exploration: post-drop freeze dominant source recheck

### Current State
Dragging stays fast because React Flow updates node motion locally during drag, but drop still calls `setTablePosition(node.id, node.position)` from `ERDApp.tsx`, which updates the persisted Zustand store. That store still uses `persist(...)` with `tablePositions` inside `partialize`, so every drop writes the full persisted slice back to `localStorage`, including `sqlText`, preferences, `tableConfig`, and `tablePositions`. In parallel, `useDiagramCanvasModel` reacts to the new `tablePositions` object, incrementally patches the moved node and affected edges, and may schedule a deferred orthogonal reroute for up to 16 affected edges after 96 ms. `useAutoLayout` no longer reruns on `tablePositions` changes, so the former global layout-worker relaunch is out of the drop path.

### Affected Areas
- `src/components/ERDApp.tsx` — drop commit still calls `setTablePosition` synchronously on `onNodeDragStop`.
- `src/store/appStore.ts` — `persist` still serializes `tablePositions` as part of the persisted slice, forcing synchronous storage work on every drop.
- `src/features/diagram-canvas/useDiagramCanvasModel.ts` — drop triggers incremental node/edge patching and optional deferred `routingMode: 'full'` recomputation for affected relationships.
- `src/features/diagram-canvas/buildDiagramCanvasGraph.ts` — edge building cost scales with affected relationships, but current drop path limits this to the moved table’s relationship set rather than the full graph.
- `src/features/parse-sql/useDiagramModel.ts` — `tablePositions` still toggles `hasManualLayout`, but it does not restart SQL parsing.

### Approaches
1. **Hotfix persistence boundary** — stop persisting `tablePositions` in the Zustand `persist` slice for now.
   - Pros: Smallest blast radius; directly removes the only clearly synchronous whole-document work on drop; matches the symptom that drag is smooth but drop stalls; avoids reopening parser/layout/render architecture.
   - Cons: Manual table positions stop surviving reloads until a broader persistence design lands.
   - Effort: Low

2. **Hotfix deferred edge refinement** — skip or downgrade the deferred `routingMode: 'full'` refinement on drop.
   - Pros: Small local change in canvas code; reduces post-drop rerouting work when a moved table has many orthogonal relationships.
   - Cons: Likely secondary, not primary; does not remove synchronous persisted-store serialization; visual edge quality may regress after drop.
   - Effort: Low

3. **Hybrid micro-hotfix** — keep persistence as-is, but gate or debounce either `setTablePosition` or the deferred full refinement.
   - Pros: Preserves persisted manual layout.
   - Cons: Higher risk than needed for a hotfix; delayed commits can desync rendered node state from durable state; still leaves broad-store serialization cost in place unless the debounce is long enough to be noticeable.
   - Effort: Medium

### Recommendation
The most likely dominant freeze source is persisted Zustand/localStorage work, not deferred edge refinement. The evidence is the CURRENT drop path: drag is smooth until `onNodeDragStop`, `useAutoLayout` no longer relaunches, and `persist` still synchronously serializes the whole partialized store on every `setTablePosition` update. The smallest safe hotfix is to remove `tablePositions` from `partialize` in `src/store/appStore.ts` and keep the rest of the drag-stop path unchanged; if an extra guard is desired, it should be a separate follow-up to measure whether deferred full refinement still causes noticeable post-drop jank after persistence is removed.

### Risks
- Users lose persisted manual table placements across reloads for this hotfix window.
- If some freezes are actually dominated by orthogonal rerouting for dense hubs, removing persistence alone may reduce the stall a lot but not eliminate all post-drop jank.
- Any future change that reintroduces `tablePositions` persistence without a scoped storage strategy will likely bring the freeze back.

### Ready for Proposal
Yes — propose a minimal hotfix that changes the persistence boundary only: `src/store/appStore.ts` MUST stop persisting `tablePositions`; optionally note `src/components/ERDApp.tsx` and `src/features/diagram-canvas/useDiagramCanvasModel.ts` as observation points only, not required code changes for the first fix.
