# Auto Layout Worker Payload Specification

## Purpose

Define the Phase 5 slice that compacts auto-layout worker inputs and exposes payload timing only through benchmark-oriented surfaces.

## Requirements

### Requirement: Compact layout worker contract

The system MUST send auto-layout worker requests using a compact layout graph that contains only layout-relevant table geometry, minimal relationship linkage, sanitized persisted positions, and layout preferences. The system MUST NOT require full parsed table or relationship objects for this worker boundary.

#### Scenario: Send compact layout request

- GIVEN a parsed model with tables, relationships, and saved table positions
- WHEN auto-layout starts a worker job
- THEN the request includes only compact layout graph data plus layout preferences
- AND the worker can still produce the same layout result contract and engine/warning semantics

#### Scenario: Ignore non-layout source details

- GIVEN parsed tables include names, columns, SQL metadata, and other non-layout fields
- WHEN the layout graph is projected for the worker
- THEN those non-layout fields are excluded from the worker payload

### Requirement: Sanitize persisted layout positions

The system MUST include persisted positions only for known table keys with finite numeric `x` and `y` values. The system MUST discard viewport-shaped objects, missing coordinates, and invalid numeric values before sending the worker payload.

#### Scenario: Keep valid saved positions

- GIVEN persisted positions for existing tables with finite numeric coordinates
- WHEN the compact layout graph is created
- THEN those positions are preserved in the worker payload

#### Scenario: Drop invalid or unrelated saved state

- GIVEN persisted state contains viewport data, unknown table keys, or non-finite coordinates
- WHEN the compact layout graph is created
- THEN those entries are omitted from persisted positions sent to the worker

### Requirement: Expose payload metrics only in benchmark surfaces

The system SHALL measure layout payload size and worker communication timing around the compact worker request. The system SHALL store and surface these metrics only through benchmark run state, benchmark UI, and benchmark JSON export/copy flows, without widening persisted application state.

#### Scenario: Record payload timing for a benchmarked layout run

- GIVEN a layout run tracked by diagram performance benchmarking
- WHEN the compact worker request completes
- THEN the recorded benchmark result may include payload bytes, serialization, postMessage, round-trip, worker compute, and estimated transfer timing

#### Scenario: Keep runtime app state free of benchmark metrics

- GIVEN a normal app session that performs layout
- WHEN payload metrics are captured for benchmark reporting
- THEN the metrics remain confined to benchmark-oriented result/history surfaces
- AND no new persisted store contract is required for this slice
