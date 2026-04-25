# Performance Support Boundary Specification

## Purpose

Define the recovered support boundary for benchmark presets and require all plan, docs, and product copy to describe only verified behavior without changing runtime execution.

## Requirements

### Requirement: Record the recovered baseline truth in the master plan

The master performance plan MUST describe the recovered baseline as a truthfulness/documentation slice. It MUST state that real schemas are supported today, preset `S` is interactively safe on ELK, and preset `M` currently crosses the in-app timeout boundary and falls back.

#### Scenario: Refresh Phase 5 narrative with verified boundary

- GIVEN the master plan still implies broader interactive support or an optimization slice
- WHEN the Phase 5 truthfulness update is applied
- THEN the plan records the recovered baseline and current verified support boundary
- AND the plan does not claim preset `M` is interactively ELK-safe today

#### Scenario: Keep the plan anchored to verified evidence

- GIVEN benchmark and recovery evidence already exists for the current branch
- WHEN the master plan is updated
- THEN its support statements align with that evidence only

### Requirement: Keep benchmark and support messaging truthful

Benchmark metadata, benchmark UI copy, and baseline documentation MUST use one support matrix. That matrix MUST present `S` as interactive and ELK-safe, MUST state that real schemas are supported, and MUST describe `M` as timeout/fallback territory today rather than interactive support.

#### Scenario: Present the verified support matrix consistently

- GIVEN a user reads benchmark preset metadata, benchmark copy, and baseline docs
- WHEN those surfaces describe current support
- THEN all of them communicate the same `S`/real-schema/`M` boundary

#### Scenario: Reject aspirational support claims

- GIVEN a copy surface refers to future optimization or hoped-for `M` support
- WHEN the truthfulness slice is applied
- THEN that surface omits speculative claims and describes only verified behavior

### Requirement: Preserve current runtime behavior

This slice MUST change only plan, copy, documentation, and support messaging. It MUST NOT alter layout execution, timeout thresholds, fallback behavior, benchmark mechanics, or any existing runtime/layout contract.

#### Scenario: Documentation-only change preserves behavior

- GIVEN the application runtime before the truthfulness slice
- WHEN the slice is implemented
- THEN parse, ELK execution, timeout handling, fallback selection, and layout results behave the same as before

### Requirement: State explicit non-goals to prevent drift

The change documentation MUST list explicit non-goals that prevent optimization drift. It MUST defer preset-`M` performance fixes, timeout tuning, roadmap acceleration, and any broader runtime or architecture work to later slices.

#### Scenario: Non-goals block roadmap skipping

- GIVEN the truthfulness slice is reviewed with nearby Phase 5 work
- WHEN scope is described
- THEN the documentation explicitly excludes optimization work and roadmap advancement beyond messaging truthfulness
