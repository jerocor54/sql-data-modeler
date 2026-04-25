# Proposal: ELK Worker Constructor Fix

## Intent

Restore ELK execution on the clean baseline by replacing the brittle bundled bootstrap in `src/lib/elkLayout.ts` with an explicit constructor seam that uses `elk-api.js` plus the imported worker constructor.

## Scope

### In Scope
- Replace `import('elkjs/lib/elk.bundled.js')` + `new ELK()` with explicit ELK API and worker-constructor wiring.
- Keep the current layout pipeline contract and fallback behavior unchanged.
- Make only the minimal adjacent typing/validation updates needed to keep the worker path coherent.

### Out of Scope
- Benchmark instrumentation, payload optimization, or broader performance work.
- Astro shell, `ERDApp.tsx`, store shape, or unrelated layout heuristics.

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- None. This is an internal runtime compatibility fix; spec-level behavior should remain unchanged for `auto-layout-worker-payload`.

## Approach

Use the verified constructable exports directly: load `elkjs/lib/elk-api.js` for the ELK constructor, load `elkjs/lib/elk-worker.min.js` for the `Worker` constructor, and instantiate ELK with an explicit worker factory instead of relying on bundled implicit bootstrap behavior.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/lib/elkLayout.ts` | Modified | Swap bundled import for explicit ELK API + worker constructor seam. |
| `src/features/auto-layout/layout.worker.ts` | Reviewed | Confirm worker-facing contract and fallback path stay unchanged. |
| `src/features/auto-layout/layoutWorkerProtocol.ts` | Possible minor update | Only if typing needs tightening around the ELK init seam. |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Worker import shape differs across build output | Med | Guard import resolution explicitly and keep current fallback layout path intact. |
| Constructor typing drifts from elkjs runtime exports | Low | Type against verified constructable exports in this repo before wiring. |

## Rollback Plan

Revert `src/lib/elkLayout.ts` to the current bundled import path and remove any seam-specific typing changes. No data migration or persisted-state rollback is required.

## Dependencies

- Existing `elkjs` package exports: `lib/elk-api.js` and `lib/elk-worker.min.js`.

## Success Criteria

- [ ] ELK no longer fails with `_Worker is not a constructor` on the clean baseline.
- [ ] Benchmarks `S`, `M`, and the known small real schema complete with engine `elk` instead of immediate fallback.
- [ ] No contract changes are required for the current auto-layout worker payload or fallback semantics.
