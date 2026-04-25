# ELK Worker Runtime Resolution Specification

## Purpose

Define the runtime-resolution seam that restores browser ELK execution without changing `createElkLayout()` contracts, diagnostics, fallback semantics, or unrelated performance behavior.

## Requirements

### Requirement: Resolve ELK worker through a runtime-safe seam

The system MUST obtain ELK worker code for browser/runtime execution through a bundler-safe or asset-safe seam that does not depend on the browser resolving `elkjs/lib/elk-worker.min.js` as a bare module specifier at runtime.

#### Scenario: Browser runtime resolves worker successfully

- GIVEN a browser/runtime build that executes `createElkLayout()`
- WHEN ELK bootstrap prepares the worker-backed engine
- THEN worker code resolves through the runtime-safe seam
- AND layout execution does not fail because of `Failed to resolve module specifier 'elkjs/lib/elk-worker.min.js'`

#### Scenario: Legitimate ELK runtime failure still surfaces normally

- GIVEN worker resolution succeeds but ELK later fails for a non-resolution reason
- WHEN `createElkLayout()` runs a layout
- THEN the system preserves the existing failure diagnostics and fallback behavior

### Requirement: Preserve current constructor-fix contract

The system MUST preserve the current ELK constructor/bootstrap contract used by `createElkLayout()`. The hotfix MUST remain local to worker-code resolution and MUST NOT require caller contract changes.

#### Scenario: Existing callers remain valid

- GIVEN any current caller that invokes `createElkLayout()` with the existing inputs
- WHEN the hotfix is present
- THEN the caller contract and returned layout/fallback shape remain unchanged

#### Scenario: Successful bootstrap keeps current diagnostics behavior

- GIVEN the worker-backed ELK engine initializes and completes successfully
- WHEN layout execution finishes
- THEN no new diagnostic category is introduced for the success path

### Requirement: Preserve non-browser compatibility

The system SHALL keep Node or CLI execution compatible when those runtimes use the same ELK bootstrap path or import the same module boundary.

#### Scenario: Node or CLI path remains compatible

- GIVEN a Node or CLI runtime that imports or executes the ELK layout bootstrap
- WHEN the hotfix is used outside the browser
- THEN the runtime does not regress solely because worker resolution was made bundler-safe for browser delivery

### Requirement: Exclude unrelated optimization work

The hotfix MUST NOT redefine layout benchmarks, worker payload structure, or broader auto-layout performance behavior beyond what is necessary to restore runtime worker resolution.

#### Scenario: Benchmarks remain behavior checks, not redesign work

- GIVEN benchmark or real-schema validation for this hotfix
- WHEN the change is specified and implemented
- THEN validation only confirms restored ELK execution and preserved fallback semantics
- AND no new benchmark metrics, payload redesign, or optimization scope is required
