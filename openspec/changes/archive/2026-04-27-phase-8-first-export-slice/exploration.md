## Exploration: Phase 8 first export slice

### Current State
The app already exports the current diagram DOM to SVG/PNG/JPEG from `src/components/ERDApp.tsx` using `html-to-image`. Export bounds are computed from `presentedNodes`, and the live React Flow export target is rendered through `DiagramCanvasSurface`. The diagram already has presentation modes (`full`, `overview`, `focus`) driven by `useDiagramPresentation`, but export has no explicit mode of its own, no warning layer, and no separate pipeline.

### Affected Areas
- `src/components/ERDApp.tsx` — owns export actions, export state, presentation mode controls, and passes `presentedNodes`/`presentedEdges` into the canvas.
- `src/features/diagram-presentation/useDiagramPresentation.ts` — already defines the existing overview/focus/full visibility contract that export can reuse.
- `src/features/diagram-canvas/DiagramCanvasSurface.tsx` — wraps the live React Flow DOM export target and disables viewport culling during export.
- `src/store/appStore.ts` — currently persists only `exportScale`; no export intent/mode/warning preference exists.

### Approaches
1. **Explicit overview export first** — add a first-class export path that intentionally exports overview, instead of relying on whatever visible mode happens to be active.
   - Pros: Reuses existing presentation logic, matches roadmap step 1, avoids giant default full-detail output, smallest honest product step.
   - Cons: Needs a clean contract so export is not coupled to temporary UI mode toggles.
   - Effort: Low/Medium

2. **Export mode selection first** — introduce a fuller mode picker now (current/overview/focus/full, later selection/area/schema).
   - Pros: More explicit UX from day one.
   - Cons: Bigger surface area, more product decisions, and selection/area/schema do not exist yet as export contracts.
   - Effort: Medium

3. **Warnings first** — warn before costly exports without changing export semantics.
   - Pros: Very small UI change.
   - Cons: Does not solve the main issue that default export intent is still ambiguous and can still produce giant full-detail output.
   - Effort: Low

4. **Separate export pipeline first** — extract export off the live UI path before changing UX.
   - Pros: Better long-term architecture.
   - Cons: Premature before defining the first export contract; higher effort than the immediate product need.
   - Effort: High

### Recommendation
Start with **explicit overview export first**. The codebase already has an overview visibility system, and the current export path already snapshots `presentedNodes`/`presentedEdges`; making overview an intentional export contract is the smallest honest move that directly reduces the risk of giant full-detail exports while staying aligned with Phase 8 step 1.

### Risks
- The current export implementation lives inside `ERDApp.tsx` and is coupled to live rendered state, so a naive implementation that temporarily flips UI mode to `overview` may create timing/race issues.
- `html-to-image` still snapshots DOM on the main thread, and export disables viewport culling, so very large overviews can still be expensive even if they are cheaper than full-detail export.

### Ready for Proposal
Yes — propose a narrow change: add an explicit overview export action/contract, keep current format buttons, do not include selection/area/schema yet, and defer warnings/pipeline separation until the overview path is explicit.
