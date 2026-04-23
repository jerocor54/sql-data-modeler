# Store Persistence Boundaries Specification

## Purpose

Define which app state MUST remain durable across reloads versus stay session-only for the Phase 5 persistence/subscription churn slice.

## Requirements

### Requirement: Preserve durable user-valued workspace state

The system MUST persist durable state that users reasonably expect to survive reloads, including `sqlText`, manual layout state in `tablePositions`, table presentation state in `tableConfig`, and other existing durable preferences kept by this slice. The system MUST preserve current manual-layout durability semantics.

#### Scenario: Restore durable manual workspace state

- GIVEN a user edits SQL, manually moves tables, and changes table visual configuration
- WHEN the app reloads after persistence hydration
- THEN `sqlText`, `tablePositions`, and `tableConfig` are restored
- AND manual-layout behavior remains equivalent to the pre-slice behavior

#### Scenario: Keep durable behavior unless explicitly exempted

- GIVEN a persisted key provides user-valued continuity across sessions
- WHEN this slice narrows persistence boundaries
- THEN that key remains persisted unless the change explicitly documents an exemption

### Requirement: Exclude session-only and derived churn from durable persistence

The system SHALL keep high-churn session UI state and derived runtime state out of the durable persisted snapshot when doing so does not break preserved durable behavior. This slice SHOULD treat panel-resize state, active-tab state, and viewport resume state as session-only unless an explicit exemption is documented.

#### Scenario: Skip session-only UI writes from durable snapshot

- GIVEN the user resizes panels, switches tabs, or pans the diagram during a session
- WHEN the durable store snapshot is written
- THEN those session-only updates are excluded from persisted durable state

#### Scenario: Allow a documented exception for valuable resume behavior

- GIVEN a session-only candidate is judged valuable enough to keep across reloads
- WHEN the slice finalizes its persistence boundary
- THEN that field may remain persisted
- AND the exception is documented as intentional rather than accidental carryover

### Requirement: Keep the persistence slice narrowly scoped

The system MUST implement this capability without redesigning payload contracts, parser normalization rules, or React Flow structure.

#### Scenario: Persistence changes stay local to store/session boundaries

- GIVEN downstream parser, layout, and canvas features consume persisted durable data
- WHEN this slice changes persistence boundaries
- THEN their existing payload and structural contracts remain unchanged
