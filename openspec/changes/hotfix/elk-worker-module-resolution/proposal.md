# Proposal: ELK Worker Module Resolution Hotfix

## Intent

Restore ELK execution in browser/runtime by replacing the current runtime bare-specifier worker import with a bundler-safe worker asset seam, while keeping `createElkLayout()` and fallback behavior unchanged.

## Scope

### In Scope
- Update ELK bootstrap so the worker script resolves through build-time asset handling instead of browser-time `import('elkjs/lib/elk-worker.min.js')`.
- Keep the current constructor fix, diagnostics, and fallback flow intact.
- Verify the fix against the failing benchmark and small real-schema runtime paths already identified.

### Out of Scope
- Benchmark/performance redesign or worker-payload changes.
- Any caller contract changes for `createElkLayout()` or auto-layout UI behavior.

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- None.

## Approach

Replace the dynamic worker-module import in `src/lib/elkLayout.ts` with a static, bundler-resolvable seam (preferred: explicit worker asset URL or equivalent build-time import). Keep `elkjs/lib/elk-api.js` loading compatible with the current constructor path, instantiate ELK with the resolved worker factory, and preserve existing `elk-failure` diagnostics and fallback semantics.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/lib/elkLayout.ts` | Modified | Swap runtime worker module resolution for bundler-safe worker asset resolution. |
| `src/features/auto-layout/layout.worker.ts` | Validate only | Confirm diagnostics/fallback behavior stays unchanged after ELK recovery. |
| `openspec/changes/hotfix/elk-worker-module-resolution/proposal.md` | New | Proposal artifact for this hotfix. |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Asset URL pattern breaks under Astro base path or production build | Med | Use bundler-native asset resolution and verify browser/runtime execution on known failing cases. |
| Worker bootstrap regresses current constructor fix | Low | Limit the change to worker resolution only; keep API constructor path untouched. |

## Rollback Plan

Revert the `src/lib/elkLayout.ts` worker-resolution seam to the current implementation and ship with existing fallback behavior if the asset-based bootstrap proves incompatible.

## Dependencies

- Existing `elkjs` package contents and Astro/Vite asset handling.

## Success Criteria

- [ ] ELK no longer fails with `Failed to resolve module specifier 'elkjs/lib/elk-worker.min.js'` in the browser/runtime.
- [ ] Benchmarks `S`, `M`, and the known small real schema execute ELK successfully or fall back only for non-resolution reasons.
- [ ] `createElkLayout()` callers and current fallback/diagnostic contracts remain unchanged.
