# Tasks: Phase 8 First Export Slice

## Phase 1: Contract Wiring

- [x] 1.1 Update `src/components/ERDApp.tsx` so `SVG`, `PNG`, and `JPEG` all create a `DiagramExportJob` with intent `overview` instead of exporting the live surface directly.
- [x] 1.2 Update `src/components/ERDApp.tsx` to derive overview export inputs from the existing presentation contract (`getOverviewVisibleEdgeIds(...)` plus current nodes) without mutating the visible editor mode.

## Phase 2: Hidden Overview Surface

- [x] 2.1 Finalize `src/features/diagram-export/OverviewExportSurface.tsx` as the hidden export-only React Flow surface, with inert callbacks and viewport culling disabled for capture stability.
- [x] 2.2 Wire `src/components/ERDApp.tsx` to mount/unmount `OverviewExportSurface`, capture from its `exportRef`, and keep the visible workspace viewport/focus untouched during export.

## Phase 3: Shared Overview Rules and Plan Tracking

- [x] 3.1 Update `src/features/diagram-presentation/useDiagramPresentation.ts` so overview edge filtering remains the single canonical source reused by both presentation and export.
- [x] 3.2 Update `PERFORMANCE_OPTIMIZATION_PLAN.md` to record Phase 8 step 1 as closed and explicitly leave selection/area/schema export, warning layers, and broader pipeline separation deferred.

## Phase 4: Validation

- [x] 4.1 Run `npx tsc --noEmit` to validate the overview export job types, hidden surface props, and ERD wiring.
- [x] 4.2 Add and run a repo-level Playwright DEV verification (`npm run verify:overview-export`) that exports from live `full`, `overview`, and `focus` request states and records reproducible JSON evidence for `SVG`, `PNG`, and `JPEG`.
- [x] 4.3 Make the executable verification fail if export mutates the visible requested/effective mode, mutates the visible viewport, or claims any selection/area/schema export capability in this slice.

## Explicitly Out of Scope

- [x] Do not add selection, area, schema, or arbitrary visible-state export paths.
- [x] Do not add warning prompts, cost messaging, or an export mode picker.
- [x] Do not split the export pipeline beyond the minimal hidden overview surface required for this slice.
