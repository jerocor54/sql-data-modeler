# Tasks: ELK Clean Diagnostics

## Phase 1: Worker contract foundation

- [x] 1.1 Update `src/features/auto-layout/layoutWorkerProtocol.ts` to define `LayoutFallbackCause`, `ElkProvenance`, and `LayoutFallbackDiagnostics`, then thread optional diagnostics through the worker result/error contracts.
- [x] 1.2 Update `src/features/auto-layout/layout.worker.ts` to classify `timeout`, `elk-failure`, and `emergency-fallback` at existing ELK decision points while preserving current `engine` and `warning` behavior.

## Phase 2: Hook and lightweight surface wiring

- [x] 2.1 Update `src/features/auto-layout/useAutoLayout.ts` to normalize `status:'error'` and `worker.onerror` into `{ cause: 'worker-failure' }`, expose optional diagnostics, and pass them into `finishLayout(...)`.
- [x] 2.2 Update `src/components/ERDApp.tsx` to consume the hook’s additive diagnostics without adding persisted app state or changing the existing fallback warning pill behavior.
- [x] 2.3 Extend `src/features/performance/diagramPerformance.ts` so benchmark run/result types store optional `layoutDiagnostics` beside existing payload metrics only.
- [x] 2.4 Update `src/features/performance/BenchmarkPanel.tsx` to show fallback cause/provenance in the latest-result details and keep JSON export additive without redesigning broader benchmark UI.

## Phase 3: Validation and regression proof

- [x] 3.1 Run `npx tsc --noEmit` to validate the protocol, hook, ERD app, and benchmark signatures after diagnostics are threaded through.
- [ ] 3.2 Manually verify on the clean branch that the post-constructor-fix fallback now exposes its remaining reason in the warning/benchmark flow for ELK timeout, ELK throw, and worker transport failure cases.
- [x] 3.3 Confirm benchmark payloads and JSON remain additive-only: existing metrics stay unchanged and optional `layoutDiagnostics` appears only when fallback diagnostics exist.
