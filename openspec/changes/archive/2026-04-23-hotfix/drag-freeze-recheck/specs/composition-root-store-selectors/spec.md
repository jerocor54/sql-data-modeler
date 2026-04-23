# Delta for Composition Root Store Selectors

## MODIFIED Requirements

### Requirement: Keep the composition root on bounded store subscriptions

The system MUST keep `ERDApp.tsx` as the composition root, and it MUST consume app-store state through explicit selectors or equivalent bounded subscription seams. For drag-sensitive presentation wiring, the root MUST pass only the minimal membership-sensitive inputs required downstream, rather than forwarding high-churn position-only node data into presentation derivation.

(Previously: The root had to use bounded selectors instead of subscribing to the whole store, but it did not explicitly constrain drag-sensitive presentation inputs.)

#### Scenario: Read only the slices each boundary needs

- GIVEN the composition root coordinates editor, diagram, layout, and export flows
- WHEN it reads app-store state
- THEN each read is limited to the specific durable or session slice required by that boundary
- AND the root no longer depends on the entire store object as one subscription

#### Scenario: Unrelated churn does not widen root invalidation

- GIVEN a store update only affects one high-churn UI field
- WHEN the composition root has no selector dependency on that field
- THEN that update does not require a broader root subscription reaction than before the slice boundary change

#### Scenario: Drag position churn stays out of presentation inputs

- GIVEN the root receives node updates whose only change is position during drag
- WHEN it prepares inputs for presentation derivation
- THEN it forwards stable membership-sensitive inputs instead of the full changing node array
- AND downstream presentation recalculation is reserved for material membership or visibility changes
