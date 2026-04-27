# Diagram Export Overview Specification

## Purpose

Define the first narrow export contract as an explicit overview snapshot, separate from the live editor presentation state.

## Requirements

### Requirement: Export overview as an intentional contract

The system MUST define overview export as a first-class export capability rather than an incidental snapshot of whatever presentation mode is currently visible.

#### Scenario: User exports the diagram from the current format controls

- GIVEN the user triggers diagram export
- WHEN this Phase 8 slice handles the request
- THEN the export uses the overview contract
- AND the capability does not claim selection, area, or schema export

### Requirement: Overview export must not depend on visible mode mutation

The system MUST produce the overview export without mutating the visible UI mode during export. It MUST NOT require temporarily switching the live editor into overview presentation to capture the output.

#### Scenario: Export runs while the editor stays in its current mode

- GIVEN the editor is currently showing any supported live presentation state
- WHEN overview export is generated
- THEN the visible editor mode remains unchanged
- AND the export result is still the overview snapshot

### Requirement: Current format buttons route through the overview slice

For this slice, the existing `SVG`, `PNG`, and `JPEG` export actions MUST resolve through the overview export contract.

#### Scenario: Format-specific export uses the same overview intent

- GIVEN the user chooses `SVG`, `PNG`, or `JPEG`
- WHEN the export starts
- THEN the selected file format is produced
- AND the rendered content corresponds to the overview export scope

### Requirement: Keep later export work out of scope

This slice MUST NOT specify or imply selection export, area export, schema export, warning layers, cost prompts, broad export-mode picking, or broader export pipeline separation as delivered behavior.

#### Scenario: Scope is reviewed against nearby roadmap work

- GIVEN this specification is used to judge Phase 8 step 1
- WHEN broader export features are compared against it
- THEN those features are treated as deferred work
- AND this slice is evaluated only as explicit overview export
