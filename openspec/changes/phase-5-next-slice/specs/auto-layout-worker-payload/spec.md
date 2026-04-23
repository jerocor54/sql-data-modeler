# Delta for Auto Layout Worker Payload

## ADDED Requirements

### Requirement: Capture benchmark payload validation evidence

The system MUST define a reproducible browser-level validation flow for `/benchmark` that records UI proof, copy/export JSON proof, and run context for payload metrics. Evidence artifacts MUST be stored under `docs/performance-artifacts/phase-5-next-slice/` or a documented equivalent change-scoped folder.

#### Scenario: Store browser validation artifacts

- GIVEN a benchmark validation run completes on `/benchmark`
- WHEN evidence is captured for the slice
- THEN the artifact set includes rendered metric proof, copied/exported JSON proof, preset/run context, and fallback state notes
- AND the storage path is documented with filenames or log identifiers needed to re-open the evidence

#### Scenario: Keep the slice validation-only

- GIVEN this delta closes a prior verify warning
- WHEN follow-up work is planned or documented
- THEN the slice MUST NOT introduce store redesign, parse/render model-shape optimization, or unrelated `ERDApp.tsx` expansion

## MODIFIED Requirements

### Requirement: Expose payload metrics only in benchmark surfaces

The system SHALL measure layout payload size and worker communication timing around the compact worker request. The system SHALL store and surface these metrics only through benchmark run state, benchmark UI, and benchmark JSON export/copy flows, without widening persisted application state. Browser validation for `/benchmark` MUST confirm that rendered benchmark surfaces and copied/exported JSON expose the same payload metric field set and values for `payloadBytes`, `serializeMs`, `postMessageMs`, `roundTripMs`, `workerComputeMs`, and `estimatedTransferMs`.
(Previously: The requirement allowed payload metrics in benchmark UI/export surfaces but did not require browser-level parity evidence for rendered versus copied/exported values.)

#### Scenario: Record payload timing for a benchmarked layout run

- GIVEN a layout run tracked by diagram performance benchmarking on `/benchmark`
- WHEN the compact worker request completes and the benchmark surface renders
- THEN the rendered benchmark result includes the payload metric fields when available
- AND the values are observable in a browser-capable validation run

#### Scenario: Keep runtime app state free of benchmark metrics

- GIVEN a normal app session that performs layout
- WHEN payload metrics are captured for benchmark reporting
- THEN the metrics remain confined to benchmark-oriented result/history surfaces
- AND no new persisted store contract is required for this slice

#### Scenario: Preserve copy and export JSON parity

- GIVEN a rendered benchmark result with payload metric values visible in `BenchmarkPanel`
- WHEN the user copies or exports benchmark JSON for that same result
- THEN the JSON contains the same six payload metric fields
- AND each field value matches the rendered benchmark surface for that result
