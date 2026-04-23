# Proposal: Drag Freeze Recheck Hotfix

## Intent

Remove drag-time presentation invalidation triggered by passing the full changing `nodes` array into higher-level presentation/culling logic. The hotfix keeps `ERDApp.tsx` as composition root while stopping position-only drag churn from recomputing visibility and presented edge/node sets every frame.

## Scope

### In Scope
- Stabilize `useDiagramPresentation.ts` inputs around node identity/count instead of drag-time coordinates.
- Update `ERDApp.tsx` to pass only the minimal presentation inputs needed for membership-sensitive recomputation.
- Touch `DiagramCanvasSurface.tsx` only if a small follow-up guard is required after the primary invalidation fix.

### Out of Scope
- Persistence, parser, payload, layout, or browser-validation slices.
- React Flow structural rewrites, rerouting redesign, or broad canvas virtualization work.
- Any change that hides real node membership changes after parse/layout updates.

## Capabilities

### New Capabilities
- `drag-presentation-stability`: Prevent drag position updates from invalidating higher-level presentation/culling derivations unless node membership changes.

### Modified Capabilities
- `composition-root-store-selectors`: Keep `ERDApp.tsx` as composition root while further narrowing high-churn invalidation propagated into downstream presentation wiring.

## Approach

Project a stable membership signature from `nodes` (for example ids/count) before calling presentation logic, and make `useDiagramPresentation` depend on that projection rather than full node objects. Only if drag still spends time in surface filtering should `DiagramCanvasSurface.tsx` temporarily relax culling during active drag as a fallback mitigation.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/features/diagram-presentation/useDiagramPresentation.ts` | Modified | Stop position-only invalidation from rebuilding presentation sets each drag tick |
| `src/components/ERDApp.tsx` | Modified | Pass minimal membership-based inputs while preserving composition-root ownership |
| `src/features/diagram-canvas/DiagramCanvasSurface.tsx` | Possible | Add drag-only culling fallback if profiling still shows surface churn |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Over-stabilized inputs miss real membership updates | Med | Tie memo inputs to node ids/count changes, not coordinates |
| Drag fallback renders more edges temporarily | Low | Use only if primary fix is insufficient and keep it drag-scoped |

## Rollback Plan

Revert the presentation input narrowing in `ERDApp.tsx` and `useDiagramPresentation.ts`; remove any drag-only surface fallback so the previous full-node invalidation path resumes unchanged.

## Dependencies

- Existing drag flow in `useDiagramCanvasModel.ts`
- Current presentation/culling contracts in `ERDApp.tsx` and `DiagramCanvasSurface.tsx`

## Success Criteria

- [ ] Dragging a node no longer recomputes presentation/culling from position-only `nodes` changes every frame.
- [ ] Search/focus and real node add/remove/layout membership changes still refresh presentation correctly.
- [ ] The hotfix remains confined to presentation/canvas flow and keeps `ERDApp.tsx` as composition root.
