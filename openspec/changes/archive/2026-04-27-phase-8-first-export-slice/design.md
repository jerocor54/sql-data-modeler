# Design: Phase 8 First Export Slice

## Technical Approach

This slice formalizes **overview export** as its own path instead of snapshotting the live diagram surface. `ERDApp.tsx` will keep the current `SVG` / `PNG` / `JPEG` controls, but each action will create an export job with intent `overview`. That job renders a hidden `OverviewExportSurface` using the same React Flow canvas primitives as the visible workspace while feeding it overview-filtered edges and the full node set. The export capture continues to use `html-to-image`, but against the hidden surface only.

## Architecture Decisions

| Decision | Choice | Alternatives considered | Rationale |
|---|---|---|---|
| Dedicated overview path | Export from `OverviewExportSurface` mounted only during an overview job | Reuse the visible canvas directly | Makes the contract explicit and keeps export semantics independent from whatever the user is viewing. |
| Reuse presentation rules | Build overview export inputs from `getOverviewVisibleEdgeIds(...)` and current node data | Duplicate overview filtering inside export code | Keeps one overview definition and avoids drift between presentation and export behavior. |
| No visible-mode mutation | Do **not** switch the live editor to overview before capture | Temporarily set visible mode to `overview`, wait, export, then restore | Avoids flicker, viewport jumps, focus loss, and timing-sensitive races with React Flow rendering. The user’s current mode stays stable while export runs. |

## Data Flow

```text
Format button
  -> handleExportDiagram(format)
  -> exportJob { format, intent: 'overview' }
  -> mount OverviewExportSurface
  -> DiagramCanvasSurface renders hidden React Flow tree
  -> exportDiagram(exportJob)
  -> html-to-image captures hidden .react-flow__viewport
  -> file download
```

Live workspace state is still the source of truth for nodes, edges, theme, and export scale, but the rendered export DOM is isolated from the visible workspace DOM.

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `openspec/changes/phase-8-first-export-slice/design.md` | Create | Technical design for the overview export slice. |
| `src/components/ERDApp.tsx` | Modify | Route format buttons through `overview` intent, compute overview export inputs, mount the hidden export surface, and capture from its ref. |
| `src/features/diagram-export/OverviewExportSurface.tsx` | Create | Hidden export-only wrapper around `DiagramCanvasSurface` with inert callbacks and viewport culling disabled. |
| `src/features/diagram-presentation/useDiagramPresentation.ts` | Modify | Expose/reuse overview edge filtering helper as the canonical overview export input. |
| `PERFORMANCE_OPTIMIZATION_PLAN.md` | Modify | Mark Phase 8 step 1 complete and keep later export steps deferred. |

## Interfaces / Contracts

```ts
type DiagramExportIntent = 'overview';

interface DiagramExportJob {
  format: 'svg' | 'png' | 'jpeg';
  intent: DiagramExportIntent;
}
```

`OverviewExportSurface` receives only the data needed for this slice:
- `nodes: FlowNode[]`
- `edges: Edge[]`
- `exportRef: RefObject<HTMLDivElement | null>`

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Type validation | New overview export types and props stay consistent | Run `npx tsc --noEmit`. |
| Browser integration | Export from visible `full`, `overview`, and `focus` request states still produces overview output for `SVG`, `PNG`, and `JPEG` | Run `npm run verify:overview-export` against the local DEV app; it loads the benchmark route, exercises the real controls, and persists a JSON report under `docs/performance-artifacts/export-slice/`. |
| Regression check | Visible mode and viewport do not change during export | Reuse `npm run verify:overview-export`; the script reads DEV export evidence emitted by `ERDApp.tsx` and fails if requested/effective mode or the visible React Flow viewport changes during capture. |

## Migration / Rollout

No migration required.

## Open Questions

- [ ] None for this slice.
