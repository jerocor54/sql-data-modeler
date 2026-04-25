# Tasks: ELK Worker Module Resolution Hotfix

## Phase 1: Runtime seam

- [x] 1.1 Update `src/lib/elkLayout.ts` to replace the runtime bare-module worker import with `elkjs/lib/elk-worker.min.js?url`, keeping `createElkLayout()` and `elkLoaderPromise` unchanged.
- [x] 1.2 In `src/lib/elkLayout.ts`, add the browser/Node bootstrap split inside `getElkInstance()`: browser uses `workerUrl`, Node/CLI keeps ELK's package-backed path via `elkjs/lib/main.js`.
- [x] 1.3 Keep constructor guards and any tiny compatibility helpers local to `src/lib/elkLayout.ts`; only add a separate helper file if the runtime split cannot stay readable in place.

## Phase 2: Contract preservation

- [x] 2.1 Validate `src/features/auto-layout/layout.worker.ts` requires no behavior change and remains the sole boundary for timeout, `elk-failure`, and emergency-fallback warnings/diagnostics.
- [x] 2.2 Validate `scripts/performance/runPhase0Baseline.ts` continues calling `createElkLayout()` without contract changes; touch it only if import/runtime compatibility breaks.

## Phase 3: Verification

- [x] 3.1 Run `npx tsc --noEmit` to confirm the `?url` asset import and runtime branch compile in strict TypeScript.
- [ ] 3.2 Run `npm run benchmark:phase0 -- --presets S,M --iterations 1 --warmups 0` to verify Node/CLI ELK bootstrap still works after the split.
- [ ] 3.3 Smoke-test browser runtime on `/benchmark` or a known small schema; confirm the module-resolution error is gone and `engine: 'elk'` returns unless a real ELK failure occurs.
- [ ] 3.4 Force a timeout or thrown ELK path and confirm `layout.worker.ts` still emits the same warning strings and diagnostic causes as before.

## Minimal batching plan

- Batch A: 1.1-1.3 (`src/lib/elkLayout.ts` only)
- Batch B: 2.1-2.2 (contract validation, no widening)
- Batch C: 3.1-3.4 (type-check, CLI smoke, browser/regression smoke)
