# Browser Performance Gates Specification

## Purpose

Define the first honest browser-backed benchmark gates for `/sql-data-modeler/benchmark` using the existing DEV snapshot contract and browser harness artifacts.

## Requirements

### Requirement: Scope browser gates to the benchmark route

The system MUST run this capability only against the benchmark route and its documented benchmark presets. It MUST NOT require broad editor-route coverage, production-mode certification, or cross-browser execution for this slice.

#### Scenario: Run only the benchmark route gate

- GIVEN the repo executes browser performance gates
- WHEN the first Phase 7 gate run starts
- THEN it evaluates `/sql-data-modeler/benchmark` only
- AND it does not claim coverage for the main editor route or other routes

### Requirement: Use the browser-readable snapshot contract as the metric source

Browser-backed metrics and semantic assertions MUST come from a documented browser-readable snapshot contract exposed to the browser harness. The gate MAY read overlay-visible status for coherence checks, but snapshot fields MUST remain the source of truth for browser assertions.

#### Scenario: Snapshot fields drive gate assertions

- GIVEN a browser harness report is produced for a preset run
- WHEN readiness, fallback, timeout, or comparable browser metrics are asserted
- THEN those assertions are derived from readable snapshot fields
- AND overlay-visible state is treated as a consistency check, not the primary source

### Requirement: Enforce first browser-backed pass/fail semantics for presets S and M

The system MUST define separate pass/fail semantics for presets `S` and `M`. Preset `S` MUST reach a usable settled state within its documented coarse browser ceiling and MUST remain non-fallback. Preset `M` MUST reach a usable settled state within its longer documented guard while preserving explicit timeout or fallback truth when that boundary is reached; it MUST NOT be reported as a non-fallback success when the snapshot shows fallback-boundary behavior.

#### Scenario: Preset S passes as non-fallback browser truth

- GIVEN preset `S` completes within its documented browser gate ceiling
- WHEN the harness evaluates its settled browser snapshot
- THEN the run passes only if the snapshot shows usable settled state without fallback

#### Scenario: Preset M preserves honest fallback-boundary truth

- GIVEN preset `M` reaches usable settled state under its longer guard
- WHEN the harness evaluates its settled browser snapshot
- THEN the run passes only if timeout/fallback truth matches the documented `M` boundary
- AND the run fails if it is labeled as non-fallback success against the snapshot evidence

### Requirement: Persist reproducible browser gate artifacts

The system MUST persist browser gate results as stable JSON artifacts that capture the preset, route, browser-derived snapshot evidence, gate outcomes, and enough metadata to reproduce or compare runs honestly. Artifact output SHOULD remain stable across repeated local runs when behavior is unchanged.

#### Scenario: Persist stable evidence for a gate run

- GIVEN a browser gate run finishes for benchmark presets
- WHEN artifacts are written
- THEN stable JSON evidence is persisted for each evaluated run
- AND the artifact contains the fields required to explain why the gate passed or failed

### Requirement: State explicit non-goals for this capability

This capability MUST NOT guarantee FPS targets, smoothness certification, pixel-perfect overlay rendering, visual diff approval, broad editor-route interaction health, production-mode behavior, or cross-browser parity. It MAY enforce coarse timing ceilings and browser fatal-error detection only as honest benchmark-route gates.

#### Scenario: Reject scope drift beyond honest browser gates

- GIVEN the capability documentation or assertions are reviewed
- WHEN a claim implies FPS guarantees, visual diffing, production certification, or cross-browser coverage
- THEN that claim is excluded from this specification
