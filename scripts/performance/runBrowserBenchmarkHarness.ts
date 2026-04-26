import { spawn, type ChildProcessByStdio } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, resolve } from 'node:path';
import process from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';
import type { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';

import astroConfig from '../../astro.config.mjs';

import {
  createBenchmarkDataset,
  getBenchmarkDatasetPreset,
  type BenchmarkDatasetPresetId,
} from '../../src/features/performance/benchmarkDatasets.ts';
import {
  DEV_BROWSER_PERFORMANCE_SNAPSHOT_KEY,
  type BrowserPerformanceSnapshot,
} from '../../src/features/performance/browserPerformanceSnapshot.ts';

type HarnessPresetId = Extract<BenchmarkDatasetPresetId, 's' | 'm'>;

interface HarnessOptions {
  presetId: HarnessPresetId;
  host: string;
  port: number;
  timeoutMs: number;
  timeoutSource: 'default' | 'cli';
  headed: boolean;
  outputPath: string;
}

interface ResolvedDevServerRoute {
  baseUrl: string;
  routeUrl: string;
}

interface CheckResult {
  name: string;
  pass: boolean;
  detail: string;
}

interface HarnessReport {
  status: 'pass' | 'fail';
  harness: {
    mode: 'dev';
    route: string;
    baseUrl: string;
    presetId: HarnessPresetId;
    presetLabel: string;
    expectedTableCount: number;
    browser: 'chromium';
    timeoutMs: number;
    headed: boolean;
  };
  checks: {
    contract: {
      pass: boolean;
      results: CheckResult[];
    };
    readability: {
      pass: boolean;
      results: CheckResult[];
    };
    coherence: {
      pass: boolean;
      results: CheckResult[];
    };
  };
  snapshot: BrowserPerformanceSnapshot | null;
  failure?: {
    message: string;
    serverLogTail: string[];
  };
}

interface SnapshotReadinessTarget {
  schemaVersion: BrowserPerformanceSnapshot['schemaVersion'];
  expectedTableCount: number;
  expectedRelationshipCount: number;
  previousGeneratedAt: string | null;
  previousTimingSignature: string | null;
}

interface SnapshotReadinessState {
  ready: boolean;
  reasons: string[];
}

interface BenchmarkPanelPresetExpectation {
  presetId: HarnessPresetId;
  presetSummary: string;
  supportLabel: string;
  description: string;
}

const PROJECT_ROOT = new URL('../../', import.meta.url);
const PROJECT_ROOT_PATH = fileURLToPath(PROJECT_ROOT);
const BENCHMARK_PAGE_PATH = '/benchmark';
const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 4321;
const DEFAULT_OUTPUT_DIRECTORY = 'docs/performance-artifacts/browser-harness';
const DEFAULT_TIMEOUT_MS_BY_PRESET: Record<HarnessPresetId, number> = {
  s: 45_000,
  m: 120_000,
};
const SUPPORTED_PRESETS: readonly HarnessPresetId[] = ['s', 'm'];
const APP_BASE_PATH = normalizeBasePath(astroConfig.base);
const ROUTE_PATH = withBasePath(BENCHMARK_PAGE_PATH);

type DevServerProcess = ChildProcessByStdio<null, Readable, Readable>;

function normalizeBasePath(basePath: unknown): string {
  if (typeof basePath !== 'string') {
    return '';
  }

  const trimmed = basePath.trim();
  if (!trimmed || trimmed === '/') {
    return '';
  }

  const withLeadingSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return withLeadingSlash.replace(/\/+$/, '');
}

function withBasePath(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;

  if (!APP_BASE_PATH) {
    return normalizedPath;
  }

  if (normalizedPath === '/') {
    return APP_BASE_PATH;
  }

  return `${APP_BASE_PATH}${normalizedPath}`;
}

function parseFlagValue(flag: string): string | undefined {
  const argument = process.argv.find((value) => value.startsWith(`${flag}=`));
  return argument ? argument.slice(flag.length + 1) : undefined;
}

function parseBooleanFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

function parsePositiveInteger(raw: string | undefined, fallback: number, label: string): number {
  if (!raw) return fallback;

  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`Valor inválido para ${label}: ${raw}`);
  }

  return value;
}

function parsePresetId(raw: string | undefined): HarnessPresetId {
  if (!raw) return 's';

  const normalized = raw.trim().toLowerCase();
  if (SUPPORTED_PRESETS.includes(normalized as HarnessPresetId)) {
    return normalized as HarnessPresetId;
  }

  throw new Error(`Preset inválido: ${raw}. Este harness mínimo solo soporta ${SUPPORTED_PRESETS.join(', ')}.`);
}

function createDefaultOutputPath(presetId: HarnessPresetId): string {
  return `${DEFAULT_OUTPUT_DIRECTORY}/browser-benchmark-report.${presetId}.json`;
}

function parseOutputPath(raw: string | undefined, presetId: HarnessPresetId): string {
  if (!raw) {
    return createDefaultOutputPath(presetId);
  }

  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error('Valor inválido para --output: no puede estar vacío.');
  }

  return trimmed;
}

function parseOptions(): HarnessOptions {
  const presetId = parsePresetId(parseFlagValue('--preset'));
  const timeoutArgument = parseFlagValue('--timeout-ms');

  return {
    presetId,
    host: parseFlagValue('--host') ?? DEFAULT_HOST,
    port: parsePositiveInteger(parseFlagValue('--port'), DEFAULT_PORT, '--port'),
    timeoutMs: parsePositiveInteger(timeoutArgument, DEFAULT_TIMEOUT_MS_BY_PRESET[presetId], '--timeout-ms'),
    timeoutSource: timeoutArgument ? 'cli' : 'default',
    headed: parseBooleanFlag('--headed'),
    outputPath: parseOutputPath(parseFlagValue('--output'), presetId),
  };
}

function resolveOutputPath(outputPath: string): string {
  return isAbsolute(outputPath) ? outputPath : resolve(PROJECT_ROOT_PATH, outputPath);
}

async function writeHarnessReport(outputPath: string, report: HarnessReport): Promise<void> {
  const resolvedOutputPath = resolveOutputPath(outputPath);
  await mkdir(dirname(resolvedOutputPath), { recursive: true });
  await writeFile(resolvedOutputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}

function createBaseUrl(options: HarnessOptions): string {
  return `http://${options.host}:${options.port}`;
}

function createCheck(name: string, pass: boolean, detail: string): CheckResult {
  return { name, pass, detail };
}

function createRouteUrl(baseUrl: string): string {
  return new URL(ROUTE_PATH, `${baseUrl}/`).toString();
}

function summarizeGroup(results: CheckResult[]) {
  return {
    pass: results.every((result) => result.pass),
    results,
  };
}

function isNumberOrNull(value: unknown): value is number | null {
  return value === null || typeof value === 'number';
}

function buildChecks(snapshot: BrowserPerformanceSnapshot, presetId: HarnessPresetId): HarnessReport['checks'] {
  const preset = getBenchmarkDatasetPreset(presetId);
  const expectedFallback = preset.interactiveSupport === 'fallback-only';

  const contractResults: CheckResult[] = [
    createCheck(
      'snapshot-key-present',
      Boolean(snapshot),
      `Se leyó ${DEV_BROWSER_PERFORMANCE_SNAPSHOT_KEY} desde la app en DEV.`,
    ),
    createCheck(
      'schema-version',
      snapshot.schemaVersion === 'phase-7-dev-v1',
      `schemaVersion=${snapshot.schemaVersion}`,
    ),
    createCheck(
      'top-level-categories',
      Boolean(snapshot.timings && snapshot.graph && snapshot.model && snapshot.presentation && snapshot.diagnostics && snapshot.longTasks),
      'El snapshot expone timings, graph, model, presentation, diagnostics y longTasks.',
    ),
  ];

  const readabilityResults: CheckResult[] = [
    createCheck(
      'generated-at-string',
      typeof snapshot.generatedAt === 'string' && snapshot.generatedAt.length > 0,
      `generatedAt=${snapshot.generatedAt}`,
    ),
    createCheck(
      'timings-readable',
      isNumberOrNull(snapshot.timings.parseMs) &&
        isNumberOrNull(snapshot.timings.layoutMs) &&
        isNumberOrNull(snapshot.timings.renderApproxMs) &&
        isNumberOrNull(snapshot.timings.totalMs),
      `timings=${JSON.stringify(snapshot.timings)}`,
    ),
    createCheck(
      'long-task-shape-readable',
      typeof snapshot.longTasks.supported === 'boolean' &&
        typeof snapshot.longTasks.count === 'number' &&
        isNumberOrNull(snapshot.longTasks.maxDuration) &&
        isNumberOrNull(snapshot.longTasks.lastDuration) &&
        isNumberOrNull(snapshot.longTasks.lastObservedAt),
      `longTasks=${JSON.stringify(snapshot.longTasks)}`,
    ),
  ];

  const coherenceResults: CheckResult[] = [
    createCheck(
      'layout-settled',
      snapshot.presentation.layoutPending === false,
      `layoutPending=${String(snapshot.presentation.layoutPending)}`,
    ),
    createCheck(
      'total-usable-available',
      snapshot.timings.totalMs !== null,
      `totalMs=${String(snapshot.timings.totalMs)}`,
    ),
    createCheck(
      'preset-table-count-match',
      snapshot.model.tableCount === preset.tableCount,
      `snapshot=${snapshot.model.tableCount} · expected=${preset.tableCount}`,
    ),
    createCheck(
      'graph-counts-monotonic',
      snapshot.graph.nodes.presented <= snapshot.graph.nodes.total &&
        snapshot.graph.edges.presented <= snapshot.graph.edges.total,
      `nodes=${snapshot.graph.nodes.presented}/${snapshot.graph.nodes.total} · edges=${snapshot.graph.edges.presented}/${snapshot.graph.edges.total}`,
    ),
    createCheck(
      'fallback-truth-aligned',
      expectedFallback ? snapshot.diagnostics.fallbackActive : !snapshot.diagnostics.fallbackActive,
      `fallbackActive=${String(snapshot.diagnostics.fallbackActive)} · expectedPresetBoundary=${preset.interactiveSupport}`,
    ),
  ];

  return {
    contract: summarizeGroup(contractResults),
    readability: summarizeGroup(readabilityResults),
    coherence: summarizeGroup(coherenceResults),
  };
}

function countDatasetRelationships(sql: string): number {
  return (sql.match(/\bREFERENCES\b/gu) ?? []).length;
}

function readSnapshotTimingSignature(snapshot: BrowserPerformanceSnapshot | null): string | null {
  if (!snapshot) return null;

  return JSON.stringify({
    parseMs: snapshot.timings.parseMs,
    layoutMs: snapshot.timings.layoutMs,
    renderApproxMs: snapshot.timings.renderApproxMs,
    totalMs: snapshot.timings.totalMs,
  });
}

function evaluateSnapshotReadiness(
  snapshot: BrowserPerformanceSnapshot | null,
  readinessTarget: SnapshotReadinessTarget,
): SnapshotReadinessState {
  const reasons: string[] = [];

  if (!snapshot) {
    reasons.push('snapshot ausente');
    return { ready: false, reasons };
  }

  if (snapshot.schemaVersion !== readinessTarget.schemaVersion) {
    reasons.push(`schemaVersion=${snapshot.schemaVersion}`);
  }

  if (snapshot.presentation.layoutPending !== false) {
    reasons.push(`layoutPending=${String(snapshot.presentation.layoutPending)}`);
  }

  if (snapshot.model.tableCount !== readinessTarget.expectedTableCount) {
    reasons.push(`tableCount=${snapshot.model.tableCount}/${readinessTarget.expectedTableCount}`);
  }

  if (snapshot.model.relationshipCount !== readinessTarget.expectedRelationshipCount) {
    reasons.push(`relationshipCount=${snapshot.model.relationshipCount}/${readinessTarget.expectedRelationshipCount}`);
  }

  if (snapshot.timings.totalMs === null) {
    reasons.push('totalMs=null');
  }

  if (readinessTarget.previousGeneratedAt !== null && snapshot.generatedAt === readinessTarget.previousGeneratedAt) {
    reasons.push(`generatedAt sin cambio (${snapshot.generatedAt})`);
  }

  const timingSignature = readSnapshotTimingSignature(snapshot);
  if (readinessTarget.previousTimingSignature !== null && timingSignature === readinessTarget.previousTimingSignature) {
    reasons.push(`timings siguen stale (${timingSignature})`);
  }

  return {
    ready: reasons.length === 0,
    reasons,
  };
}

async function readDevBrowserPerformanceSnapshot(
  page: import('playwright').Page,
): Promise<BrowserPerformanceSnapshot | null> {
  const snapshot = await page.evaluate(
    ({ snapshotKey }) => {
      const value = (window as unknown as Record<string, unknown>)[snapshotKey];
      return value ? JSON.parse(JSON.stringify(value)) : null;
    },
    { snapshotKey: DEV_BROWSER_PERFORMANCE_SNAPSHOT_KEY },
  );

  return snapshot as BrowserPerformanceSnapshot | null;
}

async function waitForReadySnapshot(
  page: import('playwright').Page,
  readinessTarget: SnapshotReadinessTarget,
  timeoutMs: number,
): Promise<BrowserPerformanceSnapshot> {
  const deadline = Date.now() + timeoutMs;
  let lastSnapshot: BrowserPerformanceSnapshot | null = null;
  let lastReasons: string[] = ['sin evaluación'];

  while (Date.now() < deadline) {
    const snapshot = await readDevBrowserPerformanceSnapshot(page);
    const readiness = evaluateSnapshotReadiness(snapshot, readinessTarget);

    lastSnapshot = snapshot;
    lastReasons = readiness.reasons;

    if (readiness.ready && snapshot) {
      return snapshot;
    }

    await delay(200);
  }

  const snapshotSummary = lastSnapshot
    ? JSON.stringify({
        generatedAt: lastSnapshot.generatedAt,
        schemaVersion: lastSnapshot.schemaVersion,
        layoutPending: lastSnapshot.presentation.layoutPending,
        tableCount: lastSnapshot.model.tableCount,
        relationshipCount: lastSnapshot.model.relationshipCount,
        timings: lastSnapshot.timings,
      })
    : 'null';

  throw new Error(
    `El snapshot del benchmark no quedó listo dentro de ${timeoutMs}ms. Últimas razones: ${lastReasons.join(', ')}. Último snapshot: ${snapshotSummary}`,
  );
}

function createSnapshotReadinessTarget(
  presetId: HarnessPresetId,
  previousSnapshot: BrowserPerformanceSnapshot | null,
): SnapshotReadinessTarget {
  const dataset = createBenchmarkDataset(presetId);

  return {
    schemaVersion: 'phase-7-dev-v1',
    expectedTableCount: dataset.tableCount,
    expectedRelationshipCount: countDatasetRelationships(dataset.sql),
    previousGeneratedAt: previousSnapshot?.generatedAt ?? null,
    previousTimingSignature: readSnapshotTimingSignature(previousSnapshot),
  };
}

function createBenchmarkPanelPresetExpectation(presetId: HarnessPresetId): BenchmarkPanelPresetExpectation {
  const preset = getBenchmarkDatasetPreset(presetId);
  const dataset = createBenchmarkDataset(presetId);
  const supportLabel =
    preset.interactiveSupport === 'safe'
      ? 'Interactivo seguro hoy (S)'
      : 'Timeout/fallback hoy (M)';

  return {
    presetId,
    presetSummary: `${dataset.label} · ${dataset.tableCount} tablas`,
    supportLabel,
    description: dataset.description,
  };
}

async function waitForBenchmarkPresetCommit(
  page: import('playwright').Page,
  expectation: BenchmarkPanelPresetExpectation,
  timeoutMs: number,
): Promise<void> {
  const datasetCombobox = page.getByRole('combobox', { name: 'Dataset', exact: true });
  const body = page.locator('body');
  const deadline = Date.now() + timeoutMs;

  await datasetCombobox.waitFor({ state: 'visible', timeout: timeoutMs });

  while (Date.now() < deadline) {
    const [selectedPresetId, bodyText] = await Promise.all([datasetCombobox.inputValue(), body.innerText()]);

    if (
      selectedPresetId === expectation.presetId &&
      bodyText.includes(expectation.presetSummary) &&
      bodyText.includes(expectation.supportLabel) &&
      bodyText.includes(expectation.description)
    ) {
      return;
    }

    await delay(100);
  }

  throw new Error(
    `El preset ${expectation.presetId} no terminó de reflejarse en el combobox Dataset y el panel dentro de ${timeoutMs}ms.`,
  );
}

async function waitForBenchmarkRouteInteractionReady(
  page: import('playwright').Page,
  timeoutMs: number,
): Promise<void> {
  const defaultPresetExpectation = createBenchmarkPanelPresetExpectation('s');
  const datasetCombobox = page.getByRole('combobox', { name: 'Dataset', exact: true });
  const loadButton = page.getByRole('button', { name: 'Cargar dataset en la app', exact: true });
  const rerunButton = page.getByRole('button', { name: 'Repetir baseline actual', exact: true });
  const body = page.locator('body');
  const deadline = Date.now() + timeoutMs;

  await Promise.all([
    datasetCombobox.waitFor({ state: 'visible', timeout: timeoutMs }),
    loadButton.waitFor({ state: 'visible', timeout: timeoutMs }),
    rerunButton.waitFor({ state: 'visible', timeout: timeoutMs }),
  ]);

  while (Date.now() < deadline) {
    const [snapshot, selectedPresetId, loadButtonDisabled, rerunButtonDisabled, bodyText] = await Promise.all([
      page.evaluate((snapshotKey) => {
        return (window as unknown as Record<string, unknown>)[snapshotKey] as BrowserPerformanceSnapshot | undefined;
      }, DEV_BROWSER_PERFORMANCE_SNAPSHOT_KEY),
      datasetCombobox.inputValue(),
      loadButton.isDisabled(),
      rerunButton.isDisabled(),
      body.innerText(),
    ]);

    if (
      snapshot?.schemaVersion === 'phase-7-dev-v1' &&
      selectedPresetId === defaultPresetExpectation.presetId &&
      loadButtonDisabled === false &&
      rerunButtonDisabled === false &&
      bodyText.includes(defaultPresetExpectation.presetSummary) &&
      bodyText.includes(defaultPresetExpectation.supportLabel) &&
      bodyText.includes(defaultPresetExpectation.description)
    ) {
      return;
    }

    await delay(100);
  }

  throw new Error(
    `La ruta benchmark no quedó lista para interactuar dentro de ${timeoutMs}ms usando los controles accesibles esperados.`,
  );
}

async function waitForDevRoute(routeUrl: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError = 'Sin respuesta todavía.';

  while (Date.now() < deadline) {
    try {
      const response = await fetch(routeUrl, { redirect: 'manual' });
      if (response.ok || response.status === 302 || response.status === 304) {
        return;
      }
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }

    await delay(250);
  }

  throw new Error(`El servidor DEV no respondió a tiempo en ${routeUrl}. Último estado: ${lastError}`);
}

function readDevServerBaseUrlFromLine(line: string): string | null {
  const normalizedLine = line.trim();
  if (!normalizedLine) return null;

  const urlMatch = normalizedLine.match(/https?:\/\/[^\s)]+/u);
  if (!urlMatch) return null;

  try {
    const candidateUrl = new URL(urlMatch[0]);
    const baseUrl = `${candidateUrl.protocol}//${candidateUrl.host}`;
    return baseUrl.replace(/\/+$/u, '');
  } catch {
    return null;
  }
}

function startDevServer(
  options: HarnessOptions,
  serverLogTail: string[],
): { child: DevServerProcess; readyBaseUrl: Promise<string> } {
  const child = spawn('npm', ['run', 'dev', '--', '--host', options.host, '--port', String(options.port)], {
    cwd: PROJECT_ROOT,
    env: { ...process.env, CI: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let settleReadyBaseUrl: ((value: string) => void) | null = null;
  let settleReadyBaseUrlError: ((reason?: unknown) => void) | null = null;
  let resolvedReadyBaseUrl = false;

  const readyBaseUrl = new Promise<string>((resolve, reject) => {
    settleReadyBaseUrl = resolve;
    settleReadyBaseUrlError = reject;
  });

  const resolveReadyBaseUrl = (value: string) => {
    if (resolvedReadyBaseUrl) return;
    resolvedReadyBaseUrl = true;
    settleReadyBaseUrl?.(value);
  };

  const rejectReadyBaseUrl = (reason: unknown) => {
    if (resolvedReadyBaseUrl) return;
    resolvedReadyBaseUrl = true;
    settleReadyBaseUrlError?.(reason);
  };

  const appendLog = (chunk: string) => {
    for (const line of chunk.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      serverLogTail.push(trimmed);
      if (serverLogTail.length > 40) serverLogTail.shift();

      const parsedBaseUrl = readDevServerBaseUrlFromLine(trimmed);
      if (parsedBaseUrl) {
        resolveReadyBaseUrl(parsedBaseUrl);
      }
    }
  };

  child.stdout.on('data', (chunk: Buffer | string) => appendLog(String(chunk)));
  child.stderr.on('data', (chunk: Buffer | string) => appendLog(String(chunk)));

  child.once('exit', (code, signal) => {
    rejectReadyBaseUrl(
      new Error(`El servidor DEV terminó antes de anunciar su URL (code=${String(code)}, signal=${String(signal)}).`),
    );
  });

  return { child, readyBaseUrl };
}

async function resolveDevServerRoute(
  options: HarnessOptions,
  readyBaseUrl: Promise<string>,
): Promise<ResolvedDevServerRoute> {
  const baseUrl = await readyBaseUrl;
  const routeUrl = createRouteUrl(baseUrl);
  await waitForDevRoute(routeUrl, options.timeoutMs);

  return { baseUrl, routeUrl };
}

async function stopDevServer(child: DevServerProcess): Promise<void> {
  if (child.killed || child.exitCode !== null) return;

  child.kill('SIGTERM');
  const exitPromise = once(child, 'exit');
  const timeoutPromise = delay(5_000).then(() => 'timeout');
  const result = await Promise.race([exitPromise, timeoutPromise]);

  if (result === 'timeout' && child.exitCode === null) {
    child.kill('SIGKILL');
    await once(child, 'exit');
  }
}

async function captureSnapshot(options: HarnessOptions): Promise<HarnessReport> {
  const requestedBaseUrl = createBaseUrl(options);
  const requestedRouteUrl = createRouteUrl(requestedBaseUrl);
  const preset = getBenchmarkDatasetPreset(options.presetId);
  const serverLogTail: string[] = [];
  const { child, readyBaseUrl } = startDevServer(options, serverLogTail);
  let baseUrl = requestedBaseUrl;
  let routeUrl = requestedRouteUrl;

  try {
    const resolvedRoute = await resolveDevServerRoute(options, readyBaseUrl);
    baseUrl = resolvedRoute.baseUrl;
    routeUrl = resolvedRoute.routeUrl;

    const browser = await chromium.launch({ headless: !options.headed });

    try {
      const context = await browser.newContext();
      const page = await context.newPage();

      await page.goto(routeUrl, { waitUntil: 'domcontentloaded', timeout: options.timeoutMs });
      await waitForBenchmarkRouteInteractionReady(page, options.timeoutMs);
      await page.getByRole('combobox', { name: 'Dataset' }).selectOption(options.presetId);
      await waitForBenchmarkPresetCommit(
        page,
        createBenchmarkPanelPresetExpectation(options.presetId),
        options.timeoutMs,
      );
      const previousSnapshot = await readDevBrowserPerformanceSnapshot(page);
      const readinessTarget = createSnapshotReadinessTarget(
        options.presetId,
        previousSnapshot,
      );
      await page.getByRole('button', { name: 'Cargar dataset en la app' }).click();

      const snapshot = await waitForReadySnapshot(page, readinessTarget, options.timeoutMs);

      await context.close();

      if (!snapshot) {
        throw new Error(`No se pudo leer ${DEV_BROWSER_PERFORMANCE_SNAPSHOT_KEY} después de la espera.`);
      }

      const typedSnapshot = snapshot;
      const checks = buildChecks(typedSnapshot, options.presetId);
      const status = checks.contract.pass && checks.readability.pass && checks.coherence.pass ? 'pass' : 'fail';

        return {
          status,
          harness: {
            mode: 'dev',
            route: ROUTE_PATH,
            baseUrl,
            presetId: options.presetId,
            presetLabel: preset.label,
            expectedTableCount: preset.tableCount,
            browser: 'chromium',
            timeoutMs: options.timeoutMs,
            headed: options.headed,
          },
        checks,
        snapshot: typedSnapshot,
      };
    } finally {
      await browser.close();
    }
  } catch (error) {
    return {
      status: 'fail',
      harness: {
        mode: 'dev',
        route: ROUTE_PATH,
        baseUrl,
        presetId: options.presetId,
        presetLabel: preset.label,
        expectedTableCount: preset.tableCount,
        browser: 'chromium',
        timeoutMs: options.timeoutMs,
        headed: options.headed,
      },
      checks: {
        contract: { pass: false, results: [] },
        readability: { pass: false, results: [] },
        coherence: { pass: false, results: [] },
      },
      snapshot: null,
      failure: {
        message: error instanceof Error ? error.message : String(error),
        serverLogTail,
      },
    };
  } finally {
    await stopDevServer(child);
  }
}

async function main() {
  const options = parseOptions();
  const report = await captureSnapshot(options);

  await writeHarnessReport(options.outputPath, report);

  console.log(JSON.stringify(report, null, 2));
  console.error(`Harness report persisted to ${options.outputPath}`);

  if (report.status !== 'pass') {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(
    JSON.stringify(
      {
        status: 'fail',
        failure: {
          message,
        },
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
});
