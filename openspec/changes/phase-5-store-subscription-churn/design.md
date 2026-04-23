# Design: Phase 5 Store Subscription Churn

## Technical Approach

Keep `ERDApp.tsx` as the composition root, but stop treating the persisted Zustand store as one read surface. This slice narrows `appStore` to durable workspace state plus non-persisted runtime flags, moves high-churn session UI ownership next to the composition root, and rewires `ERDApp.tsx` to consume selector-scoped hooks instead of `useAppStore()` full-store destructuring.

## Architecture Decisions

| Decision | Choice | Alternatives considered | Rationale |
|---|---|---|---|
| Session ownership | Keep `panelSplit`, `activeViewTab`, and `diagramViewport` out of `appStore`; own them in a small `ERDApp`-adjacent session hook/module | Leave them persisted in Zustand; add a second global session store | These values are only coordinated by the composition root and immediate workspace props. Local session ownership removes persistence churn and avoids adding another global boundary for a narrow slice. |
| Durable store boundary | `appStore.ts` persists `sqlText`, `tablePositions`, `tableConfig`, and existing durable user preferences (`theme`, `globalTypeMode`, `exportScale`, `lineStyle`, `linePattern`, `relationGrouping`, `tableDesignTheme`, `dialect`, `viewMode`) | Persist everything; drop more keys such as `viewMode` or `lineStyle` | Preserves manual-layout and user-preference continuity while removing the confirmed high-churn fields only. |
| Selector strategy | Export selector-focused hooks/constants from `src/store/appStore.ts` and consume grouped slices in `ERDApp.tsx` | Keep raw selectors inline in `ERDApp.tsx`; create a larger store refactor | Keeps the hotspot readable, makes boundaries explicit, and stays inside the existing store contract. |

## Data Flow

```text
localStorage -> persist(appStore durable slice)
                  |
                  v
       appStore durable selectors ----> ERDApp ----> parse/layout/canvas props
                                         |
                                         +--> useERDAppSessionState()
                                              - panelSplit
                                              - activeViewTab
                                              - diagramViewport
```

Sequence:

```text
reload -> hydrate durable store -> ERDApp reads durable selectors
mount  -> session hook seeds defaults (editor tab, 42 split, null viewport)
drag panel / switch tab / move viewport -> session hook updates only
SQL/theme/layout changes -> durable store writes only durable keys
```

## File Changes

| File | Action | Description |
|---|---|---|
| `src/store/appStore.ts` | Modify | Remove session-only fields/actions from persisted state, keep `hasHydrated`, narrow `partialize`, and export selector-oriented hooks for durable slices/actions. |
| `src/components/ERDApp.tsx` | Modify | Replace full-store destructure with narrow selector hooks plus local/session hook wiring. |
| `src/components/workspaces/DiagramWorkspace.tsx` | Modify | Keep contract stable; accept session-owned viewport props/callbacks from the root without widening ownership. |
| `src/features/diagram-canvas/DiagramCanvasSurface.tsx` | Modify | No structural rewrite; continue `onMoveEnd` session updates and initial viewport restore from root-owned session state. |
| `src/components/useERDAppSessionState.ts` (or nearby equivalent) | Create | Centralize `panelSplit`, `activeViewTab`, `diagramViewport`, clamping/defaults, and stable callbacks for composition-root session state. |

## Interfaces / Contracts

```ts
type DurableAppState = Pick<AppState,
  'sqlText' | 'theme' | 'globalTypeMode' | 'exportScale' |
  'lineStyle' | 'linePattern' | 'relationGrouping' |
  'tableDesignTheme' | 'dialect' | 'viewMode' |
  'tableConfig' | 'tablePositions'
>;

interface ERDAppSessionState {
  activeViewTab: ViewTab;
  panelSplit: number; // clamped 22..78
  diagramViewport: DiagramViewport | null;
}
```

`readInitialViewPreferences()` becomes durable-only (`viewMode`); `activeViewTab` falls back to `'editor'` every reload. `hasSavedDiagramViewport` remains derived from session state.

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| Static | Store API and component signature updates | `npx tsc --noEmit` |
| Manual | Durable reload contract | Edit SQL, move tables, change table colors/preferences, reload, confirm restoration |
| Manual | Session reset contract | Resize panels, switch tabs, pan/zoom, reload, confirm defaults return |
| Manual | Subscription boundary | Use React DevTools Profiler around panel drag / viewport end; verify durable-store mutations no longer come from these session interactions and `ERDApp` is not subscribed to unrelated store churn |

## Migration / Rollout

No storage-key bump is required. Existing persisted snapshots may still contain `activeViewTab`, `panelSplit`, and `diagramViewport`, but the new store shape ignores them and the next durable write removes them because `partialize` no longer emits those keys. This keeps rollback simple: restore the removed fields/actions in `appStore.ts`, re-read them in `ERDApp.tsx`, and persisted snapshots remain backward-compatible.

Implementation order: (1) narrow `appStore.ts` and export selectors, (2) add `useERDAppSessionState`, (3) refactor `ERDApp.tsx` subscriptions/props, (4) adjust `DiagramWorkspace`/`DiagramCanvasSurface` typing if needed, (5) run typecheck and manual reload/profiler checks.

## Open Questions

- [ ] Whether `diagramViewport` should stay session-only in benchmark mode too, or only in normal app mode; default recommendation is session-only everywhere for consistency.
