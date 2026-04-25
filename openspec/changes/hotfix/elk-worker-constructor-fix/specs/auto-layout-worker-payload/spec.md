# Delta for Auto Layout Worker Payload

## ADDED Requirements

### Requirement: Construct ELK with explicit runtime worker seam

The system MUST instantiate ELK through an explicit runtime seam that resolves a constructable ELK API and constructable worker dependency, and MUST NOT rely on implicit bundled worker bootstrap behavior.

#### Scenario: Initialize ELK through explicit constructable exports

- GIVEN the runtime exposes a constructable ELK API and worker constructor
- WHEN `createElkLayout()` initializes ELK for a layout run
- THEN it uses the explicit constructor seam to create the ELK instance
- AND the resulting instance remains usable by the existing layout worker path

#### Scenario: Avoid the bundled bootstrap constructor failure

- GIVEN the implicit bundled bootstrap would fail with `_Worker is not a constructor`
- WHEN ELK initialization uses the explicit constructable exports instead
- THEN ELK initialization succeeds without changing the worker payload contract

### Requirement: Preserve layout and fallback contracts across constructor fix

The system MUST preserve the current `createElkLayout()` success behavior, returned layout result contract, and downstream engine/warning semantics when ELK succeeds. The system MUST continue to fall back safely when ELK later fails for legitimate graph or layout reasons.

#### Scenario: Preserve successful layout behavior

- GIVEN ELK initializes and computes a layout successfully
- WHEN downstream auto-layout consumes that result
- THEN the behavior matches the existing `createElkLayout()` success path
- AND no caller, payload, or store contract changes are required

#### Scenario: Preserve legitimate failure fallback

- GIVEN ELK initializes successfully but layout computation still fails for real graph or layout reasons
- WHEN the auto-layout flow handles that failure
- THEN the current fallback path still executes safely
- AND the existing warning and engine semantics remain unchanged

### Requirement: Keep the hotfix scoped to runtime constructor compatibility

The system MUST treat this change as a runtime-constructor compatibility fix only. The system MUST NOT introduce benchmark instrumentation changes, performance optimization work, payload redesign, store-shape changes, or layout heuristic redesign as part of this hotfix.

#### Scenario: Reject unrelated hotfix scope expansion

- GIVEN the constructor fix is implemented
- WHEN the change is reviewed against its intended scope
- THEN benchmark and payload behavior remain unchanged
- AND no unrelated layout redesign or optimization work is required
