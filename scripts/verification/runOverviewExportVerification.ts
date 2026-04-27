import { spawn, type ChildProcessByStdio } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, resolve } from 'node:path';
import process from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';
import type { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';

import type { Page } from 'playwright';
import { chromium } from 'playwright';

import astroConfig from '../../astro.config.mjs';
import { createBenchmarkDataset, getBenchmarkDatasetPreset } from '../../src/features/performance/benchmarkDatasets.ts';
import {
  DEV_BROWSER_PERFORMANCE_SNAPSHOT_KEY,
  type BrowserPerformanceSnapshot,
} from '../../src/features/performance/browserPerformanceSnapshot.ts';
import {
  DEV_DIAGRAM_EXPORT_EVIDENCE_KEY,
  areDiagramExportViewportsEqual,
  type DiagramExportDevEvidence,
} from '../../src/features/diagram-export/devExportEvidence.ts';

interface VerificationOptions {
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

interface ModeCase {
  id: 'full' | 'overview' | 'focus-request';
  requestedMode: 'full' | 'overview' | 'focus';
  expectedEffectiveMode: 'full' | 'overview' | 'focus';
}

interface ExportVerificationCaseReport {
  state: ModeCase['id'];
  requestedMode: ModeCase['requestedMode'];
  expectedEffectiveMode: ModeCase['expectedEffectiveMode'];
  format: 'svg' | 'png' | 'jpeg';
  pass: boolean;
  evidence: DiagramExportDevEvidence | null;
  checks: Array<{ name: string; pass: boolean; detail: string }>;
}

interface VerificationReport {
  status: 'pass' | 'fail';
  harness: {
    mode: 'dev';
    route: string;
    baseUrl: string;
    browser: 'chromium';
    datasetPresetId: 's';
    datasetLabel: string;
    expectedTableCount: number;
    timeoutMs: number;
    timeoutSource: 'default' | 'cli';
    headed: boolean;
  };
  scope: {
    verifies: string[];
    deferred: string[];
  };
  outOfScopeClaimCheck: {
    pass: boolean;
    detail: string;
    menuText: string;
  };
  cases: ExportVerificationCaseReport[];
  browser: {
    pageErrors: string[];
    consoleErrors: string[];
    requestFailures: string[];
  };
  failure?: {
    message: string;
    serverLogTail: string[];
  };
}

type DevServerProcess = ChildProcessByStdio<null, Readable, Readable>;

const PROJECT_ROOT = new URL('../../', import.meta.url);
const PROJECT_ROOT_PATH = fileURLToPath(PROJECT_ROOT);
const BENCHMARK_PAGE_PATH = '/benchmark';
const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 4321;
const DEFAULT_TIMEOUT_MS = 90_000;
const DEFAULT_OUTPUT_PATH = 'docs/performance-artifacts/export-slice/overview-export-verification.json';
const APP_BASE_PATH = normalizeBasePath(astroConfig.base);
const ROUTE_PATH = withBasePath(BENCHMARK_PAGE_PATH);
const STATE_CASES: ModeCase[] = [
  { id: 'full', requestedMode: 'full', expectedEffectiveMode: 'full' },
  { id: 'overview', requestedMode: 'overview', expectedEffectiveMode: 'overview' },
  { id: 'focus-request', requestedMode: 'focus', expectedEffectiveMode: 'full' },
];

function normalizeBasePath(basePath: unknown): string {
  if (typeof basePath !== 'string') return '';

  const trimmed = basePath.trim();
  if (!trimmed || trimmed === '/') return '';

  const withLeadingSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return withLeadingSlash.replace(/\/+$/u, '');
}

function withBasePath(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  if (!APP_BASE_PATH) return normalizedPath;
  if (normalizedPath === '/') return APP_BASE_PATH;
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

function parseOptions(): VerificationOptions {
  const timeoutArgument = parseFlagValue('--timeout-ms');

  return {
    host: parseFlagValue('--host') ?? DEFAULT_HOST,
    port: parsePositiveInteger(parseFlagValue('--port'), DEFAULT_PORT, '--port'),
    timeoutMs: parsePositiveInteger(timeoutArgument, DEFAULT_TIMEOUT_MS, '--timeout-ms'),
    timeoutSource: timeoutArgument ? 'cli' : 'default',
    headed: parseBooleanFlag('--headed'),
    outputPath: parseFlagValue('--output')?.trim() || DEFAULT_OUTPUT_PATH,
  };
}

function createBaseUrl(options: VerificationOptions): string {
  return `http://${options.host}:${options.port}`;
}

function createRouteUrl(baseUrl: string): string {
  return new URL(ROUTE_PATH, `${baseUrl}/`).toString();
}

function resolveOutputPath(outputPath: string): string {
  return isAbsolute(outputPath) ? outputPath : resolve(PROJECT_ROOT_PATH, outputPath);
}

async function writeVerificationReport(outputPath: string, report: VerificationReport): Promise<void> {
  const resolvedOutputPath = resolveOutputPath(outputPath);
  await mkdir(dirname(resolvedOutputPath), { recursive: true });
  await writeFile(resolvedOutputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}

async function waitForDevRoute(routeUrl: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError = 'Sin respuesta todavía.';

  while (Date.now() < deadline) {
    try {
      const response = await fetch(routeUrl, { redirect: 'manual' });
      if (response.ok || response.status === 302 || response.status === 304) return;
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
    return `${candidateUrl.protocol}//${candidateUrl.host}`.replace(/\/+$/u, '');
  } catch {
    return null;
  }
}

function startDevServer(
  options: VerificationOptions,
  serverLogTail: string[],
): { child: DevServerProcess; readyBaseUrl: Promise<string> } {
  const child = spawn('npm', ['run', 'dev', '--', '--host', options.host, '--port', String(options.port)], {
    cwd: PROJECT_ROOT_PATH,
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
    for (const line of chunk.split(/\r?\n/u)) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      serverLogTail.push(trimmed);
      if (serverLogTail.length > 40) serverLogTail.shift();

      const parsedBaseUrl = readDevServerBaseUrlFromLine(trimmed);
      if (parsedBaseUrl) resolveReadyBaseUrl(parsedBaseUrl);
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
  options: VerificationOptions,
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

async function readDevBrowserPerformanceSnapshot(page: Page): Promise<BrowserPerformanceSnapshot | null> {
  return page.evaluate((key) => {
    const value = (window as unknown as Record<string, unknown>)[key];
    return value && typeof value === 'object' ? (value as BrowserPerformanceSnapshot) : null;
  }, DEV_BROWSER_PERFORMANCE_SNAPSHOT_KEY);
}

async function readExportEvidence(page: Page): Promise<DiagramExportDevEvidence | null> {
  return page.evaluate((key) => {
    const value = (window as unknown as Record<string, unknown>)[key];
    return value && typeof value === 'object' ? (value as DiagramExportDevEvidence) : null;
  }, DEV_DIAGRAM_EXPORT_EVIDENCE_KEY);
}

async function clearExportEvidence(page: Page): Promise<void> {
  await page.evaluate((key) => {
    delete (window as unknown as Record<string, unknown>)[key];
  }, DEV_DIAGRAM_EXPORT_EVIDENCE_KEY);
}

async function waitForBenchmarkRouteInteractionReady(page: Page, timeoutMs: number): Promise<void> {
  const datasetCombobox = page.getByRole('combobox', { name: 'Dataset', exact: true });
  const loadButton = page.getByRole('button', { name: 'Cargar dataset en la app', exact: true });
  const modeCombobox = page.getByRole('combobox', { name: 'Modo diagrama', exact: true });
  const deadline = Date.now() + timeoutMs;

  await Promise.all([
    datasetCombobox.waitFor({ state: 'visible', timeout: timeoutMs }),
    loadButton.waitFor({ state: 'visible', timeout: timeoutMs }),
    modeCombobox.waitFor({ state: 'visible', timeout: timeoutMs }),
  ]);

  while (Date.now() < deadline) {
    const snapshot = await readDevBrowserPerformanceSnapshot(page);
    const selectedPresetId = await datasetCombobox.inputValue();
    const loadButtonDisabled = await loadButton.isDisabled();

    if (snapshot?.schemaVersion === 'phase-7-dev-v1' && selectedPresetId === 's' && loadButtonDisabled === false) {
      return;
    }

    await delay(100);
  }

  throw new Error(`La ruta benchmark no quedó lista para interactuar dentro de ${timeoutMs}ms.`);
}

async function waitForDatasetReady(page: Page, timeoutMs: number): Promise<void> {
  const dataset = createBenchmarkDataset('s');
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const snapshot = await readDevBrowserPerformanceSnapshot(page);

    if (
      snapshot &&
      snapshot.model.tableCount === dataset.tableCount &&
      snapshot.graph.nodes.total === dataset.tableCount &&
      snapshot.model.relationshipCount > 0
    ) {
      return;
    }

    await delay(100);
  }

  throw new Error(`El dataset S no quedó listo para verificar export dentro de ${timeoutMs}ms.`);
}

async function openDiagramMenu(page: Page): Promise<void> {
  const markerText = 'Fase 8 actual: exporta el overview explícito';
  const isOpen = await page.evaluate((text) => document.body.innerText.includes(text), markerText);
  if (isOpen) return;

  await page.evaluate(() => {
    const trigger = document.querySelector('button[title="Opciones de diagrama"]');
    if (!(trigger instanceof HTMLButtonElement)) {
      throw new Error('No encontré el botón de opciones de diagrama.');
    }

    trigger.click();
  });

  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    if (await page.evaluate((text) => document.body.innerText.includes(text), markerText)) return;
    await delay(100);
  }

  throw new Error('El menú de opciones de diagrama no abrió el bloque de export overview.');
}

async function setRequestedMode(page: Page, mode: ModeCase['requestedMode'], timeoutMs: number): Promise<void> {
  const modeCombobox = page.getByRole('combobox', { name: 'Modo diagrama', exact: true });
  await modeCombobox.selectOption(mode);

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if ((await modeCombobox.inputValue()) === mode) return;
    await delay(50);
  }

  throw new Error(`El modo solicitado ${mode} no quedó seleccionado en el combobox.`);
}

async function waitForCompletedExportEvidence(
  page: Page,
  format: 'svg' | 'png' | 'jpeg',
  timeoutMs: number,
): Promise<DiagramExportDevEvidence> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const evidence = await readExportEvidence(page);
    if (!evidence || evidence.job.format !== format) {
      await delay(50);
      continue;
    }

    if (evidence.status === 'completed' || evidence.status === 'failed') {
      return evidence;
    }

    await delay(50);
  }

  throw new Error(`La evidencia DEV de export ${format} no completó dentro de ${timeoutMs}ms.`);
}

async function verifyOutOfScopeClaims(page: Page): Promise<{ pass: boolean; detail: string; menuText: string }> {
  await openDiagramMenu(page);
  const menuText = await page.locator('body').innerText();
  const hasOverviewLabel = /exportar overview/iu.test(menuText) && /fase 8 actual: exporta el overview explícito/iu.test(menuText);
  const claimsDeferredCapabilities = /\b(selection|selecci[oó]n|area|schema)\b/iu.test(menuText);
  await page.keyboard.press('Escape');

  return {
    pass: hasOverviewLabel && !claimsDeferredCapabilities,
    detail: hasOverviewLabel
      ? claimsDeferredCapabilities
        ? 'El menú menciona capacidades diferidas.'
        : 'El menú solo declara overview explícito y no anuncia selection/area/schema.'
      : 'El menú no declara claramente el alcance overview actual.',
    menuText,
  };
}

function createCheck(name: string, pass: boolean, detail: string): { name: string; pass: boolean; detail: string } {
  return { name, pass, detail };
}

async function runExportCase(
  page: Page,
  modeCase: ModeCase,
  format: 'svg' | 'png' | 'jpeg',
  timeoutMs: number,
): Promise<ExportVerificationCaseReport> {
  const formatLabel = format === 'svg' ? 'SVG' : format === 'png' ? 'PNG' : 'JPEG';
  await setRequestedMode(page, modeCase.requestedMode, timeoutMs);
  await clearExportEvidence(page);
  await openDiagramMenu(page);
  await page.getByRole('button', { name: formatLabel, exact: true }).click();

  const evidence = await waitForCompletedExportEvidence(page, format, timeoutMs);
  const checks = [
    createCheck('status-completed', evidence.status === 'completed', `status=${evidence.status}`),
    createCheck('explicit-overview-intent', evidence.job.intent === 'overview', `intent=${evidence.job.intent}`),
    createCheck('overview-hidden-surface', evidence.exportSurface === 'overview-hidden', `surface=${evidence.exportSurface}`),
    createCheck(
      'requested-mode-preserved',
      evidence.requestedVisibleModeBefore === modeCase.requestedMode && evidence.requestedVisibleModeAfter === modeCase.requestedMode,
      `requestedBefore=${evidence.requestedVisibleModeBefore} · requestedAfter=${evidence.requestedVisibleModeAfter}`,
    ),
    createCheck(
      'effective-mode-stable',
      evidence.effectiveVisibleModeBefore === modeCase.expectedEffectiveMode &&
        evidence.effectiveVisibleModeAfter === modeCase.expectedEffectiveMode,
      `effectiveBefore=${evidence.effectiveVisibleModeBefore} · effectiveAfter=${evidence.effectiveVisibleModeAfter}`,
    ),
    createCheck('viewport-stable', evidence.viewportStable, JSON.stringify({ before: evidence.visibleViewportBefore, after: evidence.visibleViewportAfter })),
    createCheck('visible-mode-stable-flag', evidence.visibleModeStable, `visibleModeStable=${String(evidence.visibleModeStable)}`),
    createCheck(
      'overview-contract-input-counts',
      evidence.exportInputNodeCount === evidence.overviewContractNodeCount &&
        evidence.exportInputEdgeCount === evidence.overviewContractEdgeCount,
      `inputNodes=${evidence.exportInputNodeCount}/${evidence.overviewContractNodeCount} · inputEdges=${evidence.exportInputEdgeCount}/${evidence.overviewContractEdgeCount}`,
    ),
    createCheck(
      'hidden-surface-has-dom-content',
      evidence.exportRenderedNodeCount > 0 && evidence.exportRenderedEdgeCount > 0,
      `renderedNodes=${evidence.exportRenderedNodeCount} · renderedEdges=${evidence.exportRenderedEdgeCount}`,
    ),
    createCheck(
      'download-file-name',
      evidence.downloadFileName === (format === 'svg' ? 'diagram.svg' : format === 'png' ? 'diagram.png' : 'diagram.jpg'),
      `downloadFileName=${String(evidence.downloadFileName)}`,
    ),
    createCheck(
      'download-data-url-prefix',
      typeof evidence.downloadDataUrlPrefix === 'string' && evidence.downloadDataUrlPrefix.startsWith(`data:image/${format === 'svg' ? 'svg+xml' : format}`),
      `prefix=${String(evidence.downloadDataUrlPrefix)}`,
    ),
    createCheck(
      'focus-request-falls-back-honestly',
      modeCase.id !== 'focus-request' || evidence.visiblePresentedNodeCountBefore === evidence.overviewContractNodeCount,
      `visibleNodes=${evidence.visiblePresentedNodeCountBefore} · overviewNodes=${evidence.overviewContractNodeCount}`,
    ),
    createCheck(
      'viewport-equality-helper',
      areDiagramExportViewportsEqual(evidence.visibleViewportBefore, evidence.visibleViewportAfter),
      'Comparación estructural del viewport visible antes/después.',
    ),
  ];

  return {
    state: modeCase.id,
    requestedMode: modeCase.requestedMode,
    expectedEffectiveMode: modeCase.expectedEffectiveMode,
    format,
    pass: checks.every((check) => check.pass) && evidence.errorMessage === null,
    evidence,
    checks,
  };
}

async function captureVerification(options: VerificationOptions): Promise<VerificationReport> {
  const requestedBaseUrl = createBaseUrl(options);
  const requestedRouteUrl = createRouteUrl(requestedBaseUrl);
  const datasetPreset = getBenchmarkDatasetPreset('s');
  const dataset = createBenchmarkDataset('s');
  const serverLogTail: string[] = [];
  const { child, readyBaseUrl } = startDevServer(options, serverLogTail);
  let baseUrl = requestedBaseUrl;
  let routeUrl = requestedRouteUrl;
  const browser = {
    pageErrors: [] as string[],
    consoleErrors: [] as string[],
    requestFailures: [] as string[],
  };

  const buildHarness = () => ({
    mode: 'dev' as const,
    route: ROUTE_PATH,
    baseUrl,
    browser: 'chromium' as const,
    datasetPresetId: 's' as const,
    datasetLabel: dataset.label,
    expectedTableCount: dataset.tableCount,
    timeoutMs: options.timeoutMs,
    timeoutSource: options.timeoutSource,
    headed: options.headed,
  });

  try {
    const resolvedRoute = await resolveDevServerRoute(options, readyBaseUrl);
    baseUrl = resolvedRoute.baseUrl;
    routeUrl = resolvedRoute.routeUrl;

    const chromiumBrowser = await chromium.launch({ headless: !options.headed });
    let context: import('playwright').BrowserContext | null = null;

    try {
      context = await chromiumBrowser.newContext({ viewport: { width: 1440, height: 900 } });
      const page = await context.newPage();

      page.on('pageerror', (error) => {
        browser.pageErrors.push(error.message);
      });
      page.on('console', (message) => {
        if (message.type() === 'error') browser.consoleErrors.push(message.text());
      });
      page.on('requestfailed', (request) => {
        browser.requestFailures.push(`${request.method()} ${request.url()} :: ${request.failure()?.errorText ?? 'unknown'}`);
      });

      await page.goto(routeUrl, { waitUntil: 'domcontentloaded', timeout: options.timeoutMs });
      await waitForBenchmarkRouteInteractionReady(page, options.timeoutMs);
      await page.getByRole('button', { name: 'Cargar dataset en la app', exact: true }).click();
      await waitForDatasetReady(page, options.timeoutMs);

      const outOfScopeClaimCheck = await verifyOutOfScopeClaims(page);
      const cases: ExportVerificationCaseReport[] = [];

      for (const modeCase of STATE_CASES) {
        for (const format of ['svg', 'png', 'jpeg'] as const) {
          cases.push(await runExportCase(page, modeCase, format, options.timeoutMs));
        }
      }

      const report: VerificationReport = {
        status:
          outOfScopeClaimCheck.pass &&
          cases.every((item) => item.pass) &&
          browser.pageErrors.length === 0 &&
          browser.consoleErrors.length === 0 &&
          browser.requestFailures.length === 0
            ? 'pass'
            : 'fail',
        harness: buildHarness(),
        scope: {
          verifies: [
            'explicit overview export contract',
            'visible requested/effective mode stability during export',
            'visible viewport stability during export',
            'SVG/PNG/JPEG overview export from full, overview, and focus request states',
          ],
          deferred: ['selection export', 'area export', 'schema export'],
        },
        outOfScopeClaimCheck,
        cases,
        browser,
      };

      await context.close();
      await chromiumBrowser.close();
      return report;
    } catch (error) {
      if (context) await context.close();
      await chromiumBrowser.close();
      throw error;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      status: 'fail',
      harness: {
        ...buildHarness(),
        datasetLabel: datasetPreset.label,
      },
      scope: {
        verifies: ['overview export slice only'],
        deferred: ['selection export', 'area export', 'schema export'],
      },
      outOfScopeClaimCheck: {
        pass: false,
        detail: 'La verificación no llegó a ejecutar el chequeo de alcance.',
        menuText: '',
      },
      cases: [],
      browser,
      failure: {
        message,
        serverLogTail,
      },
    };
  } finally {
    await stopDevServer(child);
  }
}

async function main(): Promise<void> {
  const options = parseOptions();
  const report = await captureVerification(options);
  await writeVerificationReport(options.outputPath, report);

  if (report.status !== 'pass') {
    throw new Error(`La verificación ejecutable de overview export falló. Reporte: ${resolveOutputPath(options.outputPath)}`);
  }

  process.stdout.write(`${resolveOutputPath(options.outputPath)}\n`);
}

await main();
