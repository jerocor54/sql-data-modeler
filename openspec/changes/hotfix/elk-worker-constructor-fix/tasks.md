# Tasks: ELK Worker Constructor Fix

## Phase 1: Constructor seam foundation

- [x] 1.1 Update `src/lib/elkLayout.ts` local ELK typing so bootstrap expects a constructable ELK API plus a `workerFactory`-returned worker, keeping seam-only aliases/helpers inside this file.
- [x] 1.2 Add guarded module-resolution helpers in `src/lib/elkLayout.ts` for `elkjs/lib/elk-api.js` and `elkjs/lib/elk-worker.min.js`; validate constructable exports and throw descriptive errors on module-shape drift.

## Phase 2: ELK bootstrap replacement

- [x] 2.1 Replace `getElkInstance()` in `src/lib/elkLayout.ts` to lazy-import `elk-api.js` and `elk-worker.min.js`, instantiate `new ELK({ workerFactory: () => new WorkerCtor() })`, and preserve `elkLoaderPromise` memoization.
- [x] 2.2 Review `src/features/auto-layout/layout.worker.ts` and `src/features/auto-layout/layoutWorkerProtocol.ts`; only add a tiny typing adjustment if the seam cannot stay fully encapsulated in `src/lib/elkLayout.ts`.

## Phase 3: Validation

- [x] 3.1 Run `npx tsc --noEmit` to verify the constructor seam compiles under strict TypeScript without changing the worker payload contract.
- [ ] 3.2 Run `npm run benchmark:phase0 -- --presets S,M --iterations 1 --warmups 0` and confirm successful runs report `engine: 'elk'` instead of immediate fallback.
- [ ] 3.3 Do a manual smoke check via the benchmark page or existing auto-layout UI: confirm known-good schemas still return ELK results, and forced ELK failure/timeout still surfaces the current fallback warnings from `src/features/auto-layout/layout.worker.ts`.
