## Exploration: hotfix/drag-freeze-recheck

### Current State
Dragging is locally controlled by React Flow through `onNodesChange`, so table position persistence does not run until `onNodeDragStop`. `handleNodeDragStart` in `useDiagramCanvasModel.ts` only patches affected relationship edges once at drag start to mark them as `draggingPreview`, clearing routed path metadata so `RoutedEdge.tsx` falls back to a dashed straight `BaseEdge`. The remaining continuous drag work comes from controlled `nodes` updates bubbling into `ERDApp.tsx`, where `useDiagramPresentation` is invalidated on every drag frame because it receives the full `nodes` array even though it only uses node ids and `nodes.length`, and that cascades into fresh `visibleNodeIds`, `visibleEdgeIds`, `presentedNodes`, `presentedEdges`, and surface-level edge filtering.

### Affected Areas
- `src/features/diagram-canvas/useDiagramCanvasModel.ts` — drag-start edge preview patching is O(edges) once per drag and does not explain sustained drag-time freezes.
- `src/components/ERDApp.tsx` — controlled canvas state from `useDiagramCanvasModel` re-renders the composition root on every drag tick and recomputes presentation filtering.
- `src/features/diagram-presentation/useDiagramPresentation.ts` — unnecessarily depends on the full `nodes` array; position-only node changes rebuild visibility sets and overview/focus edge selection work every drag frame.
- `src/features/diagram-canvas/DiagramCanvasSurface.tsx` — viewport culling and `renderEdges` filtering scan visible nodes/edges again during drag, likely amplifying the parent recomputation cost.
- `src/components/edges/RoutedEdge.tsx` — preview rendering is already simplified; remaining per-edge work is mostly React Flow reconciliation/rendering, not custom rerouting.

### Approaches
1. **Decouple presentation from node position churn** — stop invalidating `useDiagramPresentation` on every drag frame when only node coordinates changed.
   - Pros: Targets the strongest unnecessary continuous drag cost; small hotfix boundary around `ERDApp.tsx` and `useDiagramPresentation.ts`; preserves current drag preview behavior.
   - Cons: Needs care so focus/search mode still updates when node membership actually changes.
   - Effort: Low

2. **Freeze or relax surface edge culling during active drag** — avoid repeated viewport-based edge filtering while a node is being dragged.
   - Pros: Local mitigation in `DiagramCanvasSurface.tsx`; can reduce extra O(nodes + edges) scans during drag.
   - Cons: More of a secondary mitigation; can increase rendered edge count and may trade CPU filtering for DOM/SVG load.
   - Effort: Low/Medium

3. **Further trim drag-start preview patching** — reduce the one-time edge patch/update work in `handleNodeDragStart`.
   - Pros: Helps initial drag hitch if datasets have very high relationship counts.
   - Cons: Does not address sustained freeze while dragging; current code already avoids full reroute work.
   - Effort: Low

### Recommendation
Prioritize **Approach 1**. The clearest remaining dominant cost in the current code path is that `useDiagramPresentation.ts` recomputes from the full `nodes` array on every drag tick even though it only reads `nodes.map(id)` and `nodes.length`. That invalidation propagates through `ERDApp.tsx` into new visible-id sets, new presented node/edge arrays, and then `DiagramCanvasSurface.tsx` runs additional viewport and edge filtering. Keep `ERDApp.tsx` as the composition root, but narrow the hotfix so presentation visibility is driven by stable node identity/count inputs instead of position churn.

### Risks
- If presentation inputs are over-stabilized, true node membership changes after parse/layout could be missed.
- If drag-time culling is frozen as a follow-up mitigation, very large diagrams may render more edges than desired during the interaction.

### Ready for Proposal
Yes — propose a narrow drag-path hotfix centered on removing position-only invalidation from `useDiagramPresentation.ts`, with optional secondary drag-time culling relaxation only if profiling still shows surface filtering as a top contributor.
