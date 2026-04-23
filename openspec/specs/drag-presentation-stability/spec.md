# Drag Presentation Stability Specification

## Purpose

Prevent drag-time coordinate churn from invalidating higher-level presentation and culling work while preserving recomputation for real membership or visibility input changes.

## Requirements

### Requirement: Ignore position-only node movement for presentation derivation

The system MUST NOT recompute higher-level presentation membership or culling derivations solely because an existing node's position changes during drag. The system MUST recompute those derivations when node identity, node count, or other membership-affecting visibility inputs materially change.

#### Scenario: Drag updates only coordinates

- GIVEN the same set of rendered nodes remains present during an active drag
- WHEN React Flow emits position-only updates for a dragged node
- THEN presentation derivation does not invalidate from those coordinate changes alone
- AND drag-time recalculation of presented nodes and edges is avoided

#### Scenario: Membership-sensitive inputs change

- GIVEN search, focus, parse, layout, or add/remove actions change node membership or visibility inputs
- WHEN those material inputs update
- THEN presentation derivation recomputes using the latest membership state

### Requirement: Keep drag-time mitigation local and optional

The system MAY apply a fallback drag-time mitigation in canvas presentation only if the primary invalidation fix is insufficient, and any such mitigation MUST remain local to drag-active behavior.

#### Scenario: Primary fix is sufficient

- GIVEN drag-time presentation invalidation no longer dominates interaction cost
- WHEN the hotfix is applied
- THEN no extra fallback behavior is required

#### Scenario: Local fallback is enabled

- GIVEN profiling still shows drag-only surface filtering churn after the primary fix
- WHEN a fallback mitigation is introduced
- THEN it is scoped to active drag behavior only
- AND it does not redefine persistence, payload, parser, or render-model contracts

### Requirement: Preserve hotfix boundaries

The system MUST treat this change as a presentation-path hotfix and MUST NOT redesign persistence, payloads, parser behavior, store ownership, or broader render architecture as part of this capability.

#### Scenario: Reviewing proposed follow-on changes

- GIVEN a proposed change alters store design or persistence payload structure
- WHEN evaluating this hotfix scope
- THEN that change is rejected as out of scope for drag-presentation stability
