# Delta for auto-layout-worker-payload

## ADDED Requirements

### Requirement: Classify ELK fallback diagnostics

The system MUST attach an additive typed fallback diagnostic to the auto-layout worker result whenever a run leaves the ELK path or can identify why ELK did not remain active. The diagnostic MUST classify at least timeout, worker failure, ELK failure, and emergency fallback causes. The system MAY include ELK provenance with `stage` and `message` when that information is available.

#### Scenario: Report typed cause for an ELK fallback

- GIVEN a layout run that falls back after entering the worker flow
- WHEN the worker returns its result
- THEN the result includes a typed fallback cause that distinguishes timeout, worker failure, ELK failure, or emergency fallback
- AND existing engine and warning fields remain available

#### Scenario: Keep provenance optional on clean success or opaque failure

- GIVEN a layout run where ELK provenance is unavailable or unnecessary
- WHEN the worker returns success or fallback data
- THEN the result may omit provenance fields without failing the contract

### Requirement: Preserve diagnostics-only hotfix scope

The system MUST keep this change limited to diagnostic classification and propagation. The system MUST NOT introduce freeze mitigation, new fallback heuristics, benchmark redesign, or broader persistence changes as part of this hotfix.

#### Scenario: Preserve current fallback behavior

- GIVEN a schema that already falls back on the clean baseline
- WHEN diagnostics are added for the same run
- THEN the runtime fallback behavior remains functionally unchanged
- AND only additive diagnostic fields differ

#### Scenario: Keep benchmark surfaces additive

- GIVEN existing benchmark reporting flows
- WHEN fallback diagnostics are surfaced for inspection
- THEN benchmark payloads keep their current shape except for additive diagnostic fields
- AND no optimization-only metrics or redesign fields are introduced

## MODIFIED Requirements

### Requirement: Compact layout worker contract

The system MUST send auto-layout worker requests using a compact layout graph that contains only layout-relevant table geometry, minimal relationship linkage, sanitized persisted positions, and layout preferences. The system MUST NOT require full parsed table or relationship objects for this worker boundary. The system MUST preserve the current worker result semantics for layout positions, engine selection, and warning behavior while allowing optional typed fallback diagnostics and optional ELK provenance to be returned with the result.

(Previously: The worker boundary preserved the same layout result contract and engine/warning semantics without diagnostic metadata.)

#### Scenario: Send compact layout request

- GIVEN a parsed model with tables, relationships, and saved table positions
- WHEN auto-layout starts a worker job
- THEN the request includes only compact layout graph data plus layout preferences
- AND the worker can still produce the same layout result contract with engine/warning semantics plus optional diagnostics

#### Scenario: Ignore non-layout source details

- GIVEN parsed tables include names, columns, SQL metadata, and other non-layout fields
- WHEN the layout graph is projected for the worker
- THEN those non-layout fields are excluded from the worker payload

### Requirement: Expose payload metrics only in benchmark surfaces

The system SHALL measure layout payload size and worker communication timing around the compact worker request. The system SHALL store and surface these metrics only through benchmark run state, benchmark UI, and benchmark JSON export/copy flows, without widening persisted application state. The system SHALL propagate typed fallback diagnostics through the worker, `useAutoLayout`, and composition-root runtime warning/reporting seams when present, while keeping benchmark metrics confined to benchmark-oriented surfaces.

(Previously: Only payload metrics were described here, and benchmark-only confinement did not distinguish additive runtime diagnostics from benchmark metrics.)

#### Scenario: Record payload timing for a benchmarked layout run

- GIVEN a layout run tracked by diagram performance benchmarking
- WHEN the compact worker request completes
- THEN the recorded benchmark result may include payload bytes, serialization, postMessage, round-trip, worker compute, and estimated transfer timing
- AND it may also include additive fallback diagnostics for inspection

#### Scenario: Keep runtime app state free of benchmark metrics

- GIVEN a normal app session that performs layout
- WHEN payload metrics and fallback diagnostics are captured
- THEN payload metrics remain confined to benchmark-oriented result/history surfaces
- AND runtime warning/reporting seams may receive only the additive fallback diagnostics without requiring new persisted state
