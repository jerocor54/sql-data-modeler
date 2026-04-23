# Design: Drag Freeze Recheck Hotfix

## Technical Approach

Keep `ERDApp.tsx` as composition root, but stop feeding `useDiagramPresentation` the full drag-churning `nodes` array. The root will derive a stable membership input from node ids and reuse that reference while drag only changes coordinates. `useDiagramPresentation.ts` will consume that membership input to build `allNodeIds` and automatic strategy thresholds, so focus/overview visibility recalculates only when membership-sensitive inputs change.

## Architecture Decisions

| Decision | Options | Choice | Rationale |
|---|---|---|---|
| Presentation input boundary | Pass full `nodes`; move logic out of root; pass stable membership input | Pass stable membership input from `ERDApp.tsx` | Matches project standard: root stays composition root, but downstream invalidation narrows to membership changes. |
| Membership representation | `nodes.length` only; joined key only; stable ids + key | Stable `{ ids, key, count }` | `useDiagramPresentation` still needs the node id set, while `key/count` give cheap change signals and readable contracts. |
| Surface drag fallback | Add immediately; skip unless needed | Do not add initially | Exploration shows dominant waste is higher-level presentation invalidation. Extra drag-local behavior increases complexity and temporary over-render risk. |

## Data Flow

`useDiagramCanvasModel` updates node positions every drag tick  
`nodes` → `ERDApp.tsx` → `useStablePresentationMembership(nodes)`  
coordinate-only drag → same membership object reference  
membership/search/focus/relationship changes → `useDiagramPresentation(...)` recomputes  
`visibleNodeIds`/`visibleEdgeIds` → `presentedNodes`/`presentedEdges` → `DiagramCanvasSurface`

## File Changes

| File | Action | Description |
|---|---|---|
| `src/components/ERDApp.tsx` | Modify | Derive and pass stable presentation membership instead of full `nodes` into `useDiagramPresentation`. |
| `src/features/diagram-presentation/useDiagramPresentation.ts` | Modify | Replace `nodes` input with membership contract; build `allNodeIds` and strategy from that stable input. |
| `src/features/diagram-canvas/DiagramCanvasSurface.tsx` | No change (initially) | Keep as-is unless validation proves surface filtering still dominates after the primary fix. |

## Interfaces / Contracts

```ts
interface DiagramPresentationNodeMembership {
  ids: string[];
  key: string;
  count: number;
}
```

- `ERDApp.tsx` owns creation of this contract.
- The helper reuses the previous object when `count` and ordered ids are unchanged.
- `useDiagramPresentation` depends on `membership` instead of `nodes`.

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| Unit-ish hook logic | Membership helper preserves reference on position-only churn and changes on add/remove | Small pure helper assertions if extracted; otherwise focused TypeScript-safe helper review. |
| Integration | Drag updates do not rebuild presentation sets every frame | Manual profiling/logging around `useDiagramPresentation`, `presentedNodes`, and `presentedEdges` during drag. |
| Validation | Real membership changes still recalc | Manually verify parse/layout/add-remove/search/focus/selection flows update visible counts correctly. |

## Migration / Rollout

No migration required. Roll out in this order: (1) add stable membership helper in `ERDApp.tsx`, (2) switch `useDiagramPresentation` contract, (3) re-check drag behavior, (4) only if still needed, add a drag-local `DiagramCanvasSurface` fallback in a separate follow-up patch. Rollback by restoring the old `nodes` argument and removing the membership helper/contract.

## Open Questions

- [ ] No blocker: if post-fix profiling still shows `viewportVisibleNodeIds`/`renderEdges` as dominant during drag, a local surface mitigation can be introduced separately.
