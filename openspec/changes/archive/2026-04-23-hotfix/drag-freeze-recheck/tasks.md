# Tasks: Drag Freeze Recheck Hotfix

## Phase 1: Membership Input Foundation

- [x] 1.1 In `src/components/ERDApp.tsx`, add a small stable membership helper/type that derives `{ ids, key, count }` from `nodes` and reuses the previous object when ordered ids are unchanged.
- [x] 1.2 In `src/features/diagram-presentation/useDiagramPresentation.ts`, replace the `nodes: FlowNode[]` input contract with the membership contract and remove position-only dependency on full node objects.

## Phase 2: Presentation Wiring

- [x] 2.1 In `src/components/ERDApp.tsx`, pass the stable membership object into `useDiagramPresentation(...)` while keeping `ERDApp.tsx` as the composition root.
- [x] 2.2 In `src/features/diagram-presentation/useDiagramPresentation.ts`, rebuild `allNodeIds`, automatic strategy inputs, and related memo dependencies from `membership.ids` / `membership.count` so drag coordinate churn no longer invalidates presentation sets.
- [x] 2.3 Verify `presentedNodes` and `presentedEdges` in `src/components/ERDApp.tsx` still derive from `visibleNodeIds` / `visibleEdgeIds` without widening scope into persistence, payload, or render-model redesign.

## Phase 3: Validation

- [x] 3.1 Run drag profiling/manual instrumentation across `src/components/ERDApp.tsx` and `src/features/diagram-presentation/useDiagramPresentation.ts` to confirm active drag no longer rebuilds presentation/culling every frame and responsiveness improves.
- [ ] 3.2 Manually verify membership-sensitive refresh paths: parse/layout changes, node add/remove, search focus, preview, and selected relationship still recompute visible ids correctly.
- [x] 3.3 Recheck `src/features/diagram-canvas/DiagramCanvasSurface.tsx` during drag; if surface filtering remains dominant after the primary fix, stop and log a separate follow-up instead of expanding this hotfix.

## Minimal Batching Plan

- Batch A: Tasks 1.1-2.1 — introduce the stable membership contract and switch the hook call site.
- Batch B: Tasks 2.2-2.3 — finish hook internals and confirm bounded presentation wiring.
- Batch C: Tasks 3.1-3.3 — validate drag responsiveness and decide whether a separate fallback change is needed.
