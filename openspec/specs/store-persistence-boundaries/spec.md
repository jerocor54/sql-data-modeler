# Store Persistence Boundaries Specification

## Purpose

Define which app state MUST remain durable across reloads versus stay session-only for the Phase 5 persistence/subscription churn slice.

## Requirements

### Requirement: Preserve durable user-valued workspace state

The system MUST persist durable state that users reasonably expect to survive reloads, including `sqlText`, manual layout state in `tablePositions`, table presentation state in `tableConfig`, and other existing durable preferences kept by this slice. `tablePositions` MUST remain durable through a dedicated persistence channel instead of the broad persisted app snapshot. The system MUST preserve current manual-layout durability semantics, reload continuity, and in-memory behavior for current consumers.

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

### Requirement: Isolate table-position durability from the broad snapshot

The system MUST keep `tablePositions` available in memory for runtime/manual layout behavior while excluding it from the broad persisted app snapshot. Durable position writes MUST flow through a dedicated channel that applies deferred flushing and dirty-checking.

#### Scenario: Preserve runtime behavior without broad snapshot persistence

- GIVEN a user drops a table at new coordinates
- WHEN the app commits the manual move
- THEN in-memory `tablePositions` is updated immediately for existing consumers
- AND the broad persisted app snapshot does not rewrite `tablePositions`

#### Scenario: Skip redundant dedicated writes

- GIVEN the latest durable position data already matches the committed coordinates
- WHEN the dedicated position channel evaluates a flush
- THEN it does not write a new durable payload

### Requirement: Hydrate dedicated table positions explicitly and fail safe

The system MUST restore durable `tablePositions` through an explicit hydration step before manual-layout-dependent flows settle. If dedicated persisted position data is absent or corrupt, the system MUST fall back to an empty/default in-memory position set without failing startup.

#### Scenario: Restore manual layout on reload

- GIVEN dedicated persisted position data exists and is valid
- WHEN the app boots and hydration completes
- THEN `tablePositions` is restored before manual-layout consumers finalize their initial state

#### Scenario: Migrate legacy table positions before broad snapshot cleanup

- GIVEN the dedicated table-position key is absent
- AND the legacy broad app snapshot still contains valid `tablePositions`
- WHEN the app boots and the broad store hydration removes `tablePositions` from its persisted snapshot
- THEN the pre-hydration legacy positions are still restored into runtime `tablePositions`
- AND those positions are immediately written into the dedicated table-position key
- AND the broad app snapshot remains free of `tablePositions`

#### Scenario: Fall back when persisted data is unavailable

- GIVEN dedicated persisted position data is missing or cannot be parsed
- WHEN the app hydrates table positions
- THEN the app continues with empty/default in-memory positions
- AND no payload/parser/render behavior is changed as part of that fallback

### Requirement: Keep the persistence slice narrowly scoped

The system MUST implement this capability without redesigning payload contracts, parser normalization rules, React Flow structure, or browser-validation scope. The change MUST stay limited to the `tablePositions` durability boundary and its hydration/write path.

#### Scenario: Persistence changes stay local to store/session boundaries

- GIVEN downstream parser, layout, and canvas features consume persisted durable data
- WHEN this slice changes persistence boundaries
- THEN their existing payload and structural contracts remain unchanged

#### Scenario: Non-goals remain out of scope

- GIVEN this slice introduces a dedicated `tablePositions` persistence seam
- WHEN the change is implemented
- THEN it does not reopen payload/parser/render architecture or browser-validation work
