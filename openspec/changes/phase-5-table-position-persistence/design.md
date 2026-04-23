# Design: Phase 5 Table Position Persistence

## Technical Approach

Keep `tablePositions` durable, but stop routing its runtime mutations through the persisted `appStore` middleware. The implementation splits concerns into: (1) persisted durable app preferences in `appStore`, (2) a non-persisted runtime table-position store, and (3) a dedicated localStorage helper that hydrates once and flushes deferred, dirty-checked writes. `ERDApp.tsx` remains the composition root and gates first render until both broad store hydration and table-position restoration finish.

## Architecture Decisions

| Decision | Options | Choice | Rationale |
|---|---|---|---|
| Runtime ownership | Keep positions inside persisted `appStore`; extract runtime store | Extract `tablePositions` to `src/store/tablePositionStore.ts` | Zustand `persist` writes on every `set`, so removing `tablePositions` from `partialize` alone would still rewrite the broad snapshot on drag-stop. Separate runtime store is the narrowest safe cut. |
| Durable channel | Persist middleware; dedicated helper | Dedicated helper under `src/store/tablePositionPersistence.ts` | Makes flush policy, dirty-checking, corruption handling, and storage key ownership explicit without reopening parser/layout/render contracts. |
| Boot gate | Let `hasHydrated` mean appStore-only; add final gate | Keep `hasHydrated` as final app-ready flag; add internal `hasStoreHydrated` (or equivalent) for main snapshot completion | Existing UI already hides initial render behind `!hasHydrated`; reusing that gate avoids downstream timing regressions and ensures manual-layout consumers never settle before positions restore. |

## Data Flow

### Boot

```text
persisted appStore hydrate
        ↓
ERDApp boot effect waits for store hydration
        ↓
read table-position storage key
        ↓
valid → replace runtime tablePositions
invalid/missing → reset runtime tablePositions to {}
        ↓
set hasHydrated=true
        ↓
parse/layout/canvas render with restored positions
```

### Manual move

```text
React Flow drag stop
  → runtime setTablePosition(tableKey, position)
  → subscribers/UI update immediately
  → persistence helper marks dirty if coordinates changed vs last flushed snapshot
  → schedule flush (debounce + idle fallback)
  → flush writes dedicated key only
```

### Flush policy

- Schedule on real runtime changes only.
- Debounce writes (target: ~150-250ms after latest commit).
- Use `requestIdleCallback` when available, otherwise `setTimeout`.
- Force immediate flush on `visibilitychange` to `hidden` and `beforeunload` if dirty.
- `resetTablePositions()` clears runtime state immediately and schedules/removes persisted payload in the same channel.

Dirty-check rules:
- Per-commit no-op check: ignore when `{x,y}` matches current runtime value.
- Flush check: compare pending snapshot against last successfully flushed snapshot; skip if structurally equal.
- Hydration seeds `lastFlushedSnapshot` so first boot does not rewrite storage.

## File Changes

| File | Action | Description |
|---|---|---|
| `src/store/appStore.ts` | Modify | Remove `tablePositions` from persisted store state/actions, narrow `DurableAppState`, and separate broad-store hydration from final app-ready flag. |
| `src/store/tablePositionStore.ts` | Create | Runtime-only Zustand store for `tablePositions`, `setTablePosition`, `resetTablePositions`, and `replaceTablePositions`. |
| `src/store/tablePositionPersistence.ts` | Create | Storage key, parser/validator, dirty snapshot tracking, flush scheduler, and lifecycle hooks. |
| `src/components/ERDApp.tsx` | Modify | Orchestrate boot hydration, register/unregister persistence lifecycle listeners, and read from the new table-position store hook. |
| `src/features/parse-sql/useDiagramModel.ts` | Verify | Keep `hasManualLayout` semantics unchanged with the new runtime source. |
| `src/features/diagram-canvas/useDiagramCanvasModel.ts` | Verify | Keep resolved-position contract unchanged. |

## Interfaces / Contracts

```ts
type PersistedTablePositions = Record<string, Position>;

interface TablePositionPersistence {
  load(): PersistedTablePositions;
  schedule(snapshot: PersistedTablePositions): void;
  flushNow(): void;
  dispose(): void;
}
```

Validation accepts only plain-object maps whose values contain finite numeric `x` and `y`; any invalid entry causes fallback to `{}` for this slice.

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| Type/compile | New store/helper wiring compiles | `npx tsc --noEmit` |
| Manual integration | Drag-stop updates runtime immediately without broad snapshot rewrite | DevTools: move a table, confirm main app storage key stays stable while dedicated key changes after deferred flush |
| Manual integration | Reload continuity | Move table, wait for flush, reload, verify restored manual layout before main UI appears |
| Manual resilience | Missing/corrupt key fallback | Delete/mangle dedicated key, reload, verify startup succeeds with auto/default layout |
| Manual lifecycle | Bounded durability | Move table and background/close tab, verify `visibilitychange`/`beforeunload` flush preserves latest move in normal browser flow |

## Migration / Rollout

No schema migration required beyond introducing a new localStorage key for positions. Keep one-time backward compatibility by reading legacy `tablePositions` from the old app snapshot only when the dedicated key is absent, then seed the new key on the first successful flush.

## Open Questions

- [ ] Confirm final debounce target (`150ms` vs `200ms`) during implementation based on perceived drag-stop responsiveness.
