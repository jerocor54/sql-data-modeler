# Design: ELK Worker Module Resolution Hotfix

## Technical Approach

Keep the fix local to `src/lib/elkLayout.ts`. Replace browser-time worker module import with a build-time worker asset URL seam, while preserving the current `createElkLayout()` signature, singleton loader, and fallback/diagnostic behavior already enforced by `layout.worker.ts`.

## Architecture Decisions

| Decision | Options | Choice | Rationale |
|---|---|---|---|
| Browser worker seam | `import('elkjs/lib/elk-worker.min.js')`; `new URL(...)`; static `?url` asset import | Static `?url` asset import for `elk-worker.min.js` | Vite resolves the worker path during bundling instead of leaving the browser to resolve a bare specifier at runtime. This is the narrowest fix for the reported failure. |
| Runtime compatibility split | One browser-oriented path everywhere; runtime branch in `elkLayout.ts` | Branch inside `getElkInstance()` between browser and Node/CLI bootstrap | Browser needs bundler-owned asset resolution; Node/CLI should keep ELK's package-owned worker bootstrap. This preserves the benchmark script path without widening the change. |
| Diagnostics/fallback ownership | Add new error plumbing; keep current worker boundary | Keep `layout.worker.ts` and protocol unchanged | The failure-classification hotfix already owns diagnostics. This change only restores ELK bootstrap, so warning text, fallback causes, and result contracts stay stable. |

## Data Flow

```text
layout.worker.ts -> createElkLayout()
createElkLayout -> getElkInstance()

Browser:
  import 'elkjs/lib/elk-api.js'
  use statically resolved worker asset URL
  new ELK({ workerUrl })

Node / CLI:
  import 'elkjs/lib/main.js'
  use ELK's packaged workerFactory path

ELK layout success -> result engine 'elk'
ELK bootstrap/layout failure -> existing worker catch -> fallback + existing diagnostics
```

## File Changes

| File | Action | Description |
|---|---|---|
| `src/lib/elkLayout.ts` | Modify | Add browser/Node bootstrap branch, static worker asset URL import, and small local helpers that keep constructor guards explicit. |
| `src/features/auto-layout/layout.worker.ts` | Validate only | Must remain the fallback boundary with current warning strings and `elk-failure`/timeout/emergency behavior intact. |
| `scripts/performance/runPhase0Baseline.ts` | Validate only | Confirms Node/CLI bootstrap still works after the runtime split. |

## Interfaces / Contracts

```ts
import elkWorkerUrl from 'elkjs/lib/elk-worker.min.js?url';

type ElkApiConstructor = new (args: {
  workerUrl?: string;
  workerFactory?: (url?: string) => { postMessage: (message: unknown) => void };
}) => { layout: (graph: unknown) => Promise<unknown> };
```

Implementation notes:
- Browser branch SHOULD use `workerUrl: elkWorkerUrl` and MUST NOT dynamically import `elk-worker.min.js` as a module.
- Node/CLI branch SHOULD import `elkjs/lib/main.js` so ELK keeps its packaged fake-worker / `web-worker` fallback behavior.
- Existing descriptive constructor guards stay local to `elkLayout.ts`.
- `elkLoaderPromise` memoization remains unchanged.

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| Type validation | Browser asset import and runtime branch compile | Run `npx tsc --noEmit`. |
| CLI integration | Node benchmark path still constructs ELK | Run `npm run benchmark:phase0 -- --presets S,M --iterations 1 --warmups 0`. |
| Browser smoke | Runtime no longer throws `Failed to resolve module specifier 'elkjs/lib/elk-worker.min.js'` | Manual `/benchmark` or normal app smoke with S, M, and known small real schema; confirm `engine: 'elk'` or fallback only for non-resolution reasons. |
| Regression smoke | Constructor-fix and diagnostics unchanged | Force timeout / thrown ELK path and verify existing warning text and typed diagnostics remain unchanged. |

## Migration / Rollout

No migration required.

Implementation order:
1. Update `src/lib/elkLayout.ts` with the static worker asset URL and runtime branch.
2. Keep worker/fallback code untouched; only revalidate it.
3. Run type-check, Node benchmark smoke, then browser smoke.

Rollback: revert the new asset URL import and runtime branch in `src/lib/elkLayout.ts`, returning to the current constructor seam.

## Open Questions

- [ ] None blocking; during implementation, verify the browser branch can rely on `workerUrl` alone and does not need a custom `workerFactory` wrapper.
