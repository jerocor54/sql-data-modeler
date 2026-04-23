# Composition Root Store Selectors Specification

## Purpose

Define selector-based app-store reads at the composition root so `ERDApp.tsx` stops invalidating from unrelated store churn while remaining the composition root.

## Requirements

### Requirement: Keep the composition root on bounded store subscriptions

The system MUST keep `ERDApp.tsx` as the composition root, but it MUST consume app-store state through explicit selectors or equivalent bounded subscription seams instead of subscribing to the full store object.

#### Scenario: Read only the slices each boundary needs

- GIVEN the composition root coordinates editor, diagram, layout, and export flows
- WHEN it reads app-store state
- THEN each read is limited to the specific durable or session slice required by that boundary
- AND the root no longer depends on the entire store object as one subscription

#### Scenario: Unrelated churn does not widen root invalidation

- GIVEN a store update only affects one high-churn UI field
- WHEN the composition root has no selector dependency on that field
- THEN that update does not require a broader root subscription reaction than before the slice boundary change

### Requirement: Preserve downstream workspace contracts while narrowing reads

The system SHALL narrow store reads without moving ownership away from the existing composition boundary and without changing workspace-facing contracts for manual layout, parser inputs, or React Flow wiring.

#### Scenario: Keep diagram workspace wiring stable

- GIVEN diagram workspace and canvas features receive viewport, node, edge, and callback props from the root
- WHEN composition-root subscriptions are narrowed
- THEN those features continue receiving equivalent props and behaviors
- AND no React Flow structural rewrite is required
