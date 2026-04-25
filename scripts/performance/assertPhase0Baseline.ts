import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

type BenchmarkMode = 'full' | 'parse-only';
type RunStatus = 'success' | 'error';
type PresetId = 's' | 'm' | 'l' | 'xl' | 'xxl';

interface MetricSummary {
  minMs: number;
  medianMs: number;
  averageMs: number;
  maxMs: number;
}

interface BaselineRun {
  iteration: number;
  parseMs: number;
  layoutMs: number;
  totalMs: number;
  relationshipCount: number;
  status: RunStatus;
  errorMessage?: string;
}

interface PresetSummary {
  presetId: PresetId;
  presetLabel: string;
  datasetVersion: string;
  tableCount: number;
  relationshipCount: number;
  measuredIterations: number;
  warmupIterations: number;
  parse: MetricSummary | null;
  layout: MetricSummary | null;
  total: MetricSummary | null;
  appLayoutTimeoutExceeded: boolean;
  errorMessage?: string;
  runs: BaselineRun[];
}

interface BaselineReport {
  generatedAt: string;
  command: string;
  nodeVersion: string;
  platform: NodeJS.Platform;
  cpuModel: string;
  iterations: number;
  warmups: number;
  mode: BenchmarkMode;
  relationGrouping: 'bundled';
  appElkTimeoutBudgetMs: number;
  results: PresetSummary[];
}

interface FullBudgetGate {
  parseMs: number;
  layoutMs: number;
  totalMs: number;
}

interface ParseOnlyBudgetGate {
  parseMs: number;
}

const DEFAULT_FULL_REPORT_PATH = 'docs/performance-baseline-results.phase-0.full.json';
const DEFAULT_PARSE_ONLY_REPORT_PATH = 'docs/performance-baseline-results.phase-0.parse-only.json';
const STACK_OVERFLOW_MESSAGE = 'Maximum call stack size exceeded';

// Evidence source: docs/performance-baseline.md budgets + support matrix.
const FULL_BUDGETS: Record<'s' | 'm', FullBudgetGate> = {
  s: { parseMs: 10, layoutMs: 400, totalMs: 450 },
  m: { parseMs: 50, layoutMs: 30000, totalMs: 31000 },
};

const PARSE_ONLY_BUDGETS: Record<PresetId, ParseOnlyBudgetGate> = {
  s: { parseMs: 10 },
  m: { parseMs: 50 },
  l: { parseMs: 300 },
  xl: { parseMs: 1000 },
  xxl: { parseMs: 8500 },
};

const PRESET_COUNTS: Record<PresetId, { tableCount: number; relationshipCount: number }> = {
  s: { tableCount: 50, relationshipCount: 78 },
  m: { tableCount: 200, relationshipCount: 326 },
  l: { tableCount: 500, relationshipCount: 824 },
  xl: { tableCount: 1000, relationshipCount: 1653 },
  xxl: { tableCount: 3000, relationshipCount: 4969 },
};

function parseStringArg(flag: string): string | undefined {
  const raw = process.argv.find((argument) => argument.startsWith(`${flag}=`));
  return raw ? raw.slice(flag.length + 1) : undefined;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function assertFiniteNumber(value: unknown, label: string): asserts value is number {
  assert(typeof value === 'number' && Number.isFinite(value), `${label} debe ser un número finito.`);
}

function assertString(value: unknown, label: string): asserts value is string {
  assert(typeof value === 'string' && value.length > 0, `${label} debe ser un string no vacío.`);
}

function assertMetricSummary(value: MetricSummary | null, label: string): asserts value is MetricSummary {
  assert(value !== null, `${label} no puede ser null.`);
  assertFiniteNumber(value.minMs, `${label}.minMs`);
  assertFiniteNumber(value.medianMs, `${label}.medianMs`);
  assertFiniteNumber(value.averageMs, `${label}.averageMs`);
  assertFiniteNumber(value.maxMs, `${label}.maxMs`);
}

function assertAverageWithinBudget(metric: MetricSummary | null, budgetMs: number, label: string) {
  assertMetricSummary(metric, label);
  assert(metric.averageMs <= budgetMs, `${label}.averageMs=${metric.averageMs} supera el budget de ${budgetMs} ms.`);
}

function assertCommonReportShape(report: BaselineReport, expectedMode: BenchmarkMode, sourcePath: string) {
  assertString(report.generatedAt, `${sourcePath}: generatedAt`);
  assertString(report.command, `${sourcePath}: command`);
  assertString(report.nodeVersion, `${sourcePath}: nodeVersion`);
  assertString(report.cpuModel, `${sourcePath}: cpuModel`);
  assert(report.mode === expectedMode, `${sourcePath}: mode debe ser ${expectedMode}.`);
  assert(report.relationGrouping === 'bundled', `${sourcePath}: relationGrouping debe ser bundled.`);
  assertFiniteNumber(report.iterations, `${sourcePath}: iterations`);
  assert(report.iterations > 0, `${sourcePath}: iterations debe ser > 0.`);
  assertFiniteNumber(report.warmups, `${sourcePath}: warmups`);
  assert(report.warmups >= 0, `${sourcePath}: warmups debe ser >= 0.`);
  assertFiniteNumber(report.appElkTimeoutBudgetMs, `${sourcePath}: appElkTimeoutBudgetMs`);
  assert(report.appElkTimeoutBudgetMs === 2500, `${sourcePath}: appElkTimeoutBudgetMs debe seguir en 2500 ms.`);
  assert(Array.isArray(report.results), `${sourcePath}: results debe ser un array.`);
}

function assertCommonPresetShape(preset: PresetSummary, sourcePath: string) {
  assertString(preset.presetLabel, `${sourcePath}:${preset.presetId}: presetLabel`);
  assert(preset.datasetVersion === 'phase-0-v1', `${sourcePath}:${preset.presetId}: datasetVersion debe ser phase-0-v1.`);
  assert(Array.isArray(preset.runs), `${sourcePath}:${preset.presetId}: runs debe ser un array.`);
  assertFiniteNumber(preset.measuredIterations, `${sourcePath}:${preset.presetId}: measuredIterations`);
  assertFiniteNumber(preset.warmupIterations, `${sourcePath}:${preset.presetId}: warmupIterations`);
  assert(typeof preset.appLayoutTimeoutExceeded === 'boolean', `${sourcePath}:${preset.presetId}: appLayoutTimeoutExceeded debe ser boolean.`);

  const expectedCounts = PRESET_COUNTS[preset.presetId];
  assert(
    preset.tableCount === expectedCounts.tableCount,
    `${sourcePath}:${preset.presetId}: tableCount=${preset.tableCount} difiere del baseline esperado ${expectedCounts.tableCount}.`,
  );
  assert(
    preset.relationshipCount === expectedCounts.relationshipCount,
    `${sourcePath}:${preset.presetId}: relationshipCount=${preset.relationshipCount} difiere del baseline esperado ${expectedCounts.relationshipCount}.`,
  );

  for (const run of preset.runs) {
    assertFiniteNumber(run.iteration, `${sourcePath}:${preset.presetId}: run.iteration`);
    assertFiniteNumber(run.parseMs, `${sourcePath}:${preset.presetId}: run.parseMs`);
    assertFiniteNumber(run.layoutMs, `${sourcePath}:${preset.presetId}: run.layoutMs`);
    assertFiniteNumber(run.totalMs, `${sourcePath}:${preset.presetId}: run.totalMs`);
    assertFiniteNumber(run.relationshipCount, `${sourcePath}:${preset.presetId}: run.relationshipCount`);
    assert(run.status === 'success' || run.status === 'error', `${sourcePath}:${preset.presetId}: run.status inválido.`);
  }
}

function getPresetMap(report: BaselineReport, sourcePath: string) {
  const presetMap = new Map<PresetId, PresetSummary>();
  for (const preset of report.results) {
    assertCommonPresetShape(preset, sourcePath);
    assert(!presetMap.has(preset.presetId), `${sourcePath}: preset duplicado ${preset.presetId}.`);
    presetMap.set(preset.presetId, preset);
  }
  return presetMap;
}

function assertSuccessPreset(preset: PresetSummary, report: BaselineReport, sourcePath: string) {
  assert(preset.measuredIterations === report.iterations, `${sourcePath}:${preset.presetId}: measuredIterations debe coincidir con iterations.`);
  assert(!preset.errorMessage, `${sourcePath}:${preset.presetId}: no debe tener errorMessage.`);
  assert(
    preset.runs.length === report.iterations && preset.runs.every((run) => run.status === 'success'),
    `${sourcePath}:${preset.presetId}: todas las runs deben completar con success.`,
  );
}

function assertExpectedStackOverflowPreset(preset: PresetSummary, parseBudgetMs: number, sourcePath: string) {
  assertAverageWithinBudget(preset.parse, parseBudgetMs, `${sourcePath}:${preset.presetId}: parse`);
  assert(preset.layout === null, `${sourcePath}:${preset.presetId}: layout debe ser null para el caso no soportado.`);
  assert(preset.total === null, `${sourcePath}:${preset.presetId}: total debe ser null para el caso no soportado.`);
  assert(preset.measuredIterations === 0, `${sourcePath}:${preset.presetId}: measuredIterations debe quedar en 0.`);
  assert(
    (preset.errorMessage ?? '').includes(STACK_OVERFLOW_MESSAGE),
    `${sourcePath}:${preset.presetId}: errorMessage debe incluir "${STACK_OVERFLOW_MESSAGE}".`,
  );
  assert(
    preset.runs.length >= 1 && preset.runs[0]?.status === 'error' && (preset.runs[0]?.errorMessage ?? '').includes(STACK_OVERFLOW_MESSAGE),
    `${sourcePath}:${preset.presetId}: la primera run debe fallar con stack overflow esperado.`,
  );
}

function assertFullReport(report: BaselineReport, sourcePath: string) {
  assertCommonReportShape(report, 'full', sourcePath);
  const presetMap = getPresetMap(report, sourcePath);
  const expectedPresetIds: PresetId[] = ['s', 'm', 'l', 'xl'];

  assert(report.results.length === expectedPresetIds.length, `${sourcePath}: full debe incluir exactamente ${expectedPresetIds.join(', ')}.`);
  for (const presetId of expectedPresetIds) {
    assert(presetMap.has(presetId), `${sourcePath}: falta el preset ${presetId}.`);
  }

  const safePresetIds: Array<'s' | 'm'> = ['s', 'm'];
  for (const presetId of safePresetIds) {
    const preset = presetMap.get(presetId);
    assert(preset, `${sourcePath}: falta el preset ${presetId}.`);
    const budgets = FULL_BUDGETS[presetId];
    assertSuccessPreset(preset, report, sourcePath);
    assertAverageWithinBudget(preset.parse, budgets.parseMs, `${sourcePath}:${presetId}: parse`);
    assertAverageWithinBudget(preset.layout, budgets.layoutMs, `${sourcePath}:${presetId}: layout`);
    assertAverageWithinBudget(preset.total, budgets.totalMs, `${sourcePath}:${presetId}: total`);
  }

  assert(presetMap.get('s')?.appLayoutTimeoutExceeded === false, `${sourcePath}: S no debe exceder el timeout in-app.`);
  assert(presetMap.get('m')?.appLayoutTimeoutExceeded === true, `${sourcePath}: M debe seguir marcado como timeout/fallback esperado.`);

  assertExpectedStackOverflowPreset(presetMap.get('l')!, PARSE_ONLY_BUDGETS.l.parseMs, sourcePath);
  assertExpectedStackOverflowPreset(presetMap.get('xl')!, PARSE_ONLY_BUDGETS.xl.parseMs, sourcePath);
}

function assertParseOnlyReport(report: BaselineReport, sourcePath: string) {
  assertCommonReportShape(report, 'parse-only', sourcePath);
  const presetMap = getPresetMap(report, sourcePath);
  const expectedPresetIds: PresetId[] = ['s', 'm', 'l', 'xl', 'xxl'];

  assert(
    report.results.length === expectedPresetIds.length,
    `${sourcePath}: parse-only debe incluir exactamente ${expectedPresetIds.join(', ')}.`,
  );
  for (const presetId of expectedPresetIds) {
    const preset = presetMap.get(presetId);
    assert(preset, `${sourcePath}: falta el preset ${presetId}.`);
    assertSuccessPreset(preset, report, sourcePath);
    assertAverageWithinBudget(preset.parse, PARSE_ONLY_BUDGETS[presetId].parseMs, `${sourcePath}:${presetId}: parse`);
    assertMetricSummary(preset.total, `${sourcePath}:${presetId}: total`);
    assert(preset.layout === null, `${sourcePath}:${presetId}: layout debe quedar null en parse-only.`);
    assert(preset.total.averageMs === preset.parse!.averageMs, `${sourcePath}:${presetId}: total.averageMs debe coincidir con parse.averageMs en parse-only.`);
    assert(preset.appLayoutTimeoutExceeded === false, `${sourcePath}:${presetId}: parse-only no debe marcar timeout de layout.`);
  }
}

async function readReport(filePath: string): Promise<BaselineReport> {
  const absolutePath = resolve(process.cwd(), filePath);
  const content = await readFile(absolutePath, 'utf8');
  return JSON.parse(content) as BaselineReport;
}

async function main() {
  const fullPath = parseStringArg('--full') ?? DEFAULT_FULL_REPORT_PATH;
  const parseOnlyPath = parseStringArg('--parse-only') ?? DEFAULT_PARSE_ONLY_REPORT_PATH;

  const fullReport = await readReport(fullPath);
  const parseOnlyReport = await readReport(parseOnlyPath);

  assertFullReport(fullReport, fullPath);
  assertParseOnlyReport(parseOnlyReport, parseOnlyPath);

  console.log('✅ CLI anti-regression gates passed.');
  console.log(`   full       → ${fullPath}`);
  console.log(`   parse-only → ${parseOnlyPath}`);
  console.log('   gates      → JSON shape, documented budgets, and expected timeout/failure boundaries');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
