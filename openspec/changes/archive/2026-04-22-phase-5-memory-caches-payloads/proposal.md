# Proposal: Phase 5 Memory Caches Payloads

## Intent

Start Phase 5 with the smallest boundary that reduces memory churn and worker transfer cost: compact the layout payload contract and measure serialization overhead. This follows the exploration recommendation and keeps scope narrow while the plan still needs to be corrected to reflect that Phase 4 is effectively closed in code.

## Scope

### In Scope
- Define a minimal layout-facing payload derived from parse output for worker requests.
- Add measurement around payload size, structured-clone/send cost, and worker round-trip timing.
- Update the plan/change narrative so this slice is explicitly framed as the first Phase 5 step after the effective closure of Phase 4.

### Out of Scope
- Full `DomainModel`/`LayoutModel`/`RenderModel` normalization.
- Broad React Flow graph redesign or `ERDApp.tsx` composition changes.
- Store persistence redesign beyond documenting later follow-up targets.

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- None.

## Approach

Project a compact layout contract behind the existing parse/layout boundary, likely between `useDiagramModel` and `useAutoLayout`, so layout receives only geometry-relevant table metadata, minimal relationships, and sanitized persisted positions. Instrument the worker path with performance marks/metrics before and after `postMessage`/response to verify whether payload compaction moves the real hotspot before touching store persistence.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `PERFORMANCE_OPTIMIZATION_PLAN.md` | Modified | Align narrative: Phase 4 effectively closed, Phase 5 starts with payload slice |
| `src/features/parse-sql/useDiagramModel.ts` | Modified | Derive compact layout input |
| `src/features/auto-layout/layoutWorkerProtocol.ts` | Modified | Replace broad payload with minimal contract |
| `src/features/auto-layout/useAutoLayout.ts` | Modified | Send measured compact payload |
| `src/features/auto-layout/layout.worker.ts` | Modified | Consume the new contract |
| `src/lib/layout.ts` | Modified | Accept reduced layout model if needed |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Implicit layout assumptions break | Med | Keep adapter boundary narrow and validate with `npx tsc --noEmit` |
| Metrics are noisy or misleading | Med | Measure payload bytes and timings at stable request boundaries |
| Gains are hidden by store/render churn | Med | Treat this as slice 1 and document store follow-up explicitly |

## Rollback Plan

Restore the previous worker payload contract and remove instrumentation hooks, keeping the Phase 4 UX changes intact.

## Dependencies

- Existing parse worker and layout worker pipeline remain the integration seam.
- Verification is limited to static checks and manual metric inspection; do not build.

## Success Criteria

- [ ] Layout worker requests use a smaller, explicit payload contract than `TableModel[]` + full relationships.
- [ ] Metrics expose payload/serialization cost around worker communication.
- [ ] The change narrative explains why payload compaction comes before broader store/persistence work.
