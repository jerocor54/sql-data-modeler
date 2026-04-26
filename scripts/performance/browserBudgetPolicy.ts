import type { BrowserPerformanceSnapshot } from '../../src/features/performance/browserPerformanceSnapshot.ts';

export type HarnessPresetId = 's' | 'm';

export type BrowserBudgetCheckName =
  | 'snapshot-total-ms-within-ceiling'
  | 'snapshot-status-label-match'
  | 'snapshot-requires-non-fallback'
  | 'snapshot-requires-fallback-boundary';

export type BrowserFatalCheckName = 'page-errors-empty' | 'console-errors-empty' | 'request-failures-empty';

export interface BrowserBudgetPolicy {
  presetId: HarnessPresetId;
  readinessCeilingMs: number;
  requiresNonFallback: boolean;
  requiresFallbackBoundary: boolean;
  expectedStatusLabel: BrowserPerformanceSnapshot['diagnostics']['statusLabel'];
  expectedFallbackLabel: BrowserPerformanceSnapshot['diagnostics']['fallbackLabel'];
  requiredBudgetChecks: readonly BrowserBudgetCheckName[];
  requiredFatalChecks: readonly BrowserFatalCheckName[];
}

export const DEFAULT_BROWSER_HARNESS_OUTPUT_DIRECTORY = 'docs/performance-artifacts/browser-harness';

export const BROWSER_BUDGET_POLICIES: Record<HarnessPresetId, BrowserBudgetPolicy> = {
  s: {
    presetId: 's',
    readinessCeilingMs: 45_000,
    requiresNonFallback: true,
    requiresFallbackBoundary: false,
    expectedStatusLabel: 'ready-non-fallback',
    expectedFallbackLabel: 'fallback inactivo',
    requiredBudgetChecks: [
      'snapshot-total-ms-within-ceiling',
      'snapshot-status-label-match',
      'snapshot-requires-non-fallback',
    ],
    requiredFatalChecks: ['page-errors-empty', 'console-errors-empty', 'request-failures-empty'],
  },
  m: {
    presetId: 'm',
    readinessCeilingMs: 120_000,
    requiresNonFallback: false,
    requiresFallbackBoundary: true,
    expectedStatusLabel: 'ready-fallback-boundary',
    expectedFallbackLabel: 'fallback activo',
    requiredBudgetChecks: [
      'snapshot-total-ms-within-ceiling',
      'snapshot-status-label-match',
      'snapshot-requires-fallback-boundary',
    ],
    requiredFatalChecks: ['page-errors-empty', 'console-errors-empty', 'request-failures-empty'],
  },
};

export function getBrowserBudgetPolicy(presetId: HarnessPresetId): BrowserBudgetPolicy {
  return BROWSER_BUDGET_POLICIES[presetId];
}

export function createBrowserHarnessReportPath(presetId: HarnessPresetId): string {
  return `${DEFAULT_BROWSER_HARNESS_OUTPUT_DIRECTORY}/browser-benchmark-report.${presetId}.json`;
}
