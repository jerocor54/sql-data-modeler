# Design: ELK Worker Constructor Fix

## Technical Approach

Replace the current `elk.bundled.js` lazy import in `src/lib/elkLayout.ts` with an explicit ELK runtime seam that imports `elk-api.js` and `elk-worker.min.js`, resolves constructable exports, and instantiates ELK with `workerFactory`. This keeps the fix local to ELK bootstrapping, preserves `createElkLayout()` and worker payload contracts, and leaves the existing fallback path untouched.

## Architecture Decisions

| Decision | Options | Choice | Rationale |
|---|---|---|---|
| ELK bootstrap path | Keep `elk.bundled.js`; wire `elk-api.js` + worker constructor | Use explicit `elk-api.js` + `workerFactory` | Verified repo context says these exports are constructable; this bypasses the `_Worker is not a constructor` failure without redesigning layout flow. |
| Where to contain compatibility logic | Spread changes into worker/protocol layers; isolate inside `elkLayout.ts` | Isolate inside `src/lib/elkLayout.ts` | Matches project standards: local hotfix, clear ownership, unchanged callers. |
| Worker export handling | Assume `module.Worker`; add guarded resolution | Add runtime guard for constructable worker export | `elk-worker.min.js` currently exposes named `Worker`, but the proposal already identifies build-shape drift risk; guard gives deterministic failure and protects fallback behavior. |

## Data Flow

```text
layout.worker.ts
  -> createElkLayout(tables, relationships, preferences)
  -> getElkInstance()
     -> import('elkjs/lib/elk-api.js')
     -> import('elkjs/lib/elk-worker.min.js')
     -> resolve constructable ELK + Worker
     -> new ELK({ workerFactory: () => new WorkerCtor() })
  -> elk.layout(first pass)
  -> elk.layout(second pass)
  -> ElkLayoutResult

If bootstrap or layout fails:
layout.worker.ts catch -> createSafeFallbackLayout(...) -> engine: 'fallback'
```

## File Changes

| File | Action | Description |
|---|---|---|
| `src/lib/elkLayout.ts` | Modify | Replace bundled import path with explicit constructor seam, add local runtime guards/types for ELK API and worker constructor resolution, keep cached singleton behavior. |
| `src/features/auto-layout/layout.worker.ts` | No code change expected | Existing try/catch remains the rollback-safe fallback boundary; only revalidated against the new bootstrap path. |
| `src/features/auto-layout/layoutWorkerProtocol.ts` | No code change expected | Payload/result contracts stay unchanged unless a tiny local type alias is needed, which should remain inside `elkLayout.ts` if possible. |

## Interfaces / Contracts

```ts
type ElkWorkerLike = { postMessage: (message: unknown) => void };
type ElkWorkerConstructor = new () => ElkWorkerLike;
type ElkApiConstructor = new (args: {
  workerFactory: () => ElkWorkerLike;
}) => { layout: (graph: unknown) => Promise<unknown> };
```

Implementation notes:
- Add local helpers such as `resolveElkApiConstructor(module)` and `resolveElkWorkerConstructor(module)`.
- Each helper MUST validate `typeof candidate === 'function'` before construction and throw a descriptive error if the module shape is invalid.
- `getElkInstance()` continues memoizing the initialized ELK instance via `elkLoaderPromise`.
- `createElkLayout()` signature and all callers remain unchanged.

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| Type validation | New seam compiles under strict TS | Run `npx tsc --noEmit`. |
| Script validation | ELK bootstrap works outside UI fallback path | Run `npm run benchmark:phase0 -- --presets S,M --iterations 1 --warmups 0`. |
| App integration smoke | Worker still returns `engine: 'elk'` on known good schema and `fallback` on forced ELK failure/timeout | Manual browser smoke on benchmark page or existing layout flow; verify warnings stay unchanged for fallback cases. |

## Migration / Rollout

No migration required. Roll out as a hotfix on the existing worker path only. If the explicit seam fails in production or CI validation, rollback is a single-file revert of the new constructor seam in `src/lib/elkLayout.ts` plus removal of any seam-only local types.

## Open Questions

- [ ] None blocking. During implementation, confirm whether `new WorkerCtor()` is sufficient in the browser bundle or whether the resolved constructor expects an optional URL argument that can remain `undefined`.
