import { cpus } from 'node:os';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';

import { createBenchmarkDataset, listBenchmarkDatasetPresets, type BenchmarkDatasetPresetId } from '../../src/features/performance/benchmarkDatasets.ts';
import { createLayoutGraphModel } from '../../src/features/auto-layout/layoutModel.ts';
import { createElkLayout } from '../../src/lib/elkLayout.ts';
import { parseSqlToModel } from '../../src/lib/sqlParser.ts';

type RunStatus = 'success' | 'error';
type BenchmarkMode = 'full' | 'parse-only';

interface BaselineRun {
  iteration: number;
  parseMs: number;
  layoutMs: number;
  totalMs: number;
  relationshipCount: number;
  status: RunStatus;
  errorMessage?: string;
}

interface MetricSummary {
  minMs: number;
  medianMs: number;
  averageMs: number;
  maxMs: number;
}

interface PresetSummary {
  presetId: BenchmarkDatasetPresetId;
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

const APP_ELK_TIMEOUT_BUDGET_MS = 2500;
const DEFAULT_ITERATIONS = 5;
const DEFAULT_WARMUPS = 1;

function parsePresetIds(input?: string): BenchmarkDatasetPresetId[] {
  const allPresetIds = listBenchmarkDatasetPresets().map((preset) => preset.id);

  if (!input || input === 'all') {
    return allPresetIds;
  }

  const requested = input
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean) as BenchmarkDatasetPresetId[];

  const invalid = requested.filter((presetId) => !allPresetIds.includes(presetId));
  if (invalid.length > 0) {
    throw new Error(`Presets inválidos: ${invalid.join(', ')}`);
  }

  return requested;
}

function parseNumberArg(flag: string, fallback: number): number {
  const raw = process.argv.find((argument: string) => argument.startsWith(`${flag}=`));
  if (!raw) return fallback;
  const value = Number(raw.slice(flag.length + 1));

  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`Valor inválido para ${flag}: ${raw}`);
  }

  return Math.floor(value);
}

function parseStringArg(flag: string): string | undefined {
  const raw = process.argv.find((argument: string) => argument.startsWith(`${flag}=`));
  return raw ? raw.slice(flag.length + 1) : undefined;
}

function parseModeArg(): BenchmarkMode {
  const raw = parseStringArg('--mode');
  if (!raw || raw === 'full') return 'full';
  if (raw === 'parse-only') return 'parse-only';
  throw new Error(`Modo inválido: ${raw}`);
}

function roundMs(value: number): number {
  return Number(value.toFixed(2));
}

function summarize(values: number[]): MetricSummary | null {
  if (values.length === 0) return null;

  const ordered = [...values].sort((left, right) => left - right);
  const middle = Math.floor(ordered.length / 2);
  const median = ordered.length % 2 === 0 ? (ordered[middle - 1] + ordered[middle]) / 2 : ordered[middle];
  const total = ordered.reduce((sum, current) => sum + current, 0);

  return {
    minMs: roundMs(ordered[0]),
    medianMs: roundMs(median),
    averageMs: roundMs(total / ordered.length),
    maxMs: roundMs(ordered[ordered.length - 1]),
  };
}

async function runPreset(
  presetId: BenchmarkDatasetPresetId,
  iterations: number,
  warmups: number,
  mode: BenchmarkMode,
): Promise<PresetSummary> {
  const dataset = createBenchmarkDataset(presetId);
  const warmupCount = Math.max(0, warmups);
  let warmupErrorMessage: string | undefined;

  for (let iteration = 0; iteration < warmupCount; iteration += 1) {
    try {
      const parsed = parseSqlToModel(dataset.sql, 'postgresql');
      if (mode === 'full') {
        const model = createLayoutGraphModel(parsed, {});
        await createElkLayout(model.tables, model.relationships, { relationGrouping: 'bundled' });
      }
    } catch (error) {
      warmupErrorMessage = error instanceof Error ? error.message : String(error);
      break;
    }
  }

  const runs: BaselineRun[] = [];

  for (let iteration = 1; iteration <= iterations; iteration += 1) {
    try {
      const parseStart = performance.now();
      const parsed = parseSqlToModel(dataset.sql, 'postgresql');
      const parseMs = performance.now() - parseStart;

      if (mode === 'parse-only') {
        runs.push({
          iteration,
          parseMs: roundMs(parseMs),
          layoutMs: 0,
          totalMs: roundMs(parseMs),
          relationshipCount: parsed.relationships.length,
          status: 'success',
        });
        continue;
      }

      try {
        const layoutStart = performance.now();
        const model = createLayoutGraphModel(parsed, {});
        await createElkLayout(model.tables, model.relationships, { relationGrouping: 'bundled' });
        const layoutMs = performance.now() - layoutStart;

        runs.push({
          iteration,
          parseMs: roundMs(parseMs),
          layoutMs: roundMs(layoutMs),
          totalMs: roundMs(parseMs + layoutMs),
          relationshipCount: parsed.relationships.length,
          status: 'success',
        });
      } catch (error) {
        runs.push({
          iteration,
          parseMs: roundMs(parseMs),
          layoutMs: 0,
          totalMs: roundMs(parseMs),
          relationshipCount: parsed.relationships.length,
          status: 'error',
          errorMessage: error instanceof Error ? error.message : String(error),
        });
        break;
      }
    } catch (error) {
      runs.push({
        iteration,
        parseMs: 0,
        layoutMs: 0,
        totalMs: 0,
        relationshipCount: 0,
        status: 'error',
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      break;
    }
  }

  const parsedRuns = runs.filter((run) => run.parseMs > 0);
  const successfulLayoutRuns = runs.filter((run) => run.status === 'success' && run.layoutMs > 0);
  const successfulTotalRuns = mode === 'parse-only' ? runs.filter((run) => run.status === 'success') : successfulLayoutRuns;
  const relationshipCount = parsedRuns[0]?.relationshipCount ?? 0;
  const layoutAverageMs = summarize(successfulLayoutRuns.map((run) => run.layoutMs))?.averageMs ?? 0;

  return {
    presetId,
    presetLabel: dataset.label,
    datasetVersion: dataset.version,
    tableCount: dataset.tableCount,
    relationshipCount,
    measuredIterations: mode === 'parse-only' ? parsedRuns.length : successfulLayoutRuns.length,
    warmupIterations: warmupCount,
    parse: summarize(parsedRuns.map((run) => run.parseMs)),
    layout: summarize(successfulLayoutRuns.map((run) => run.layoutMs)),
    total: summarize(successfulTotalRuns.map((run) => run.totalMs)),
    appLayoutTimeoutExceeded: mode === 'full' && layoutAverageMs > APP_ELK_TIMEOUT_BUDGET_MS,
    errorMessage: warmupErrorMessage ?? runs.find((run) => run.status === 'error')?.errorMessage,
    runs,
  };
}

function formatSummary(summary: MetricSummary | null): string {
  if (!summary) return 'n/a';
  return `avg ${summary.averageMs.toFixed(2)} ms · med ${summary.medianMs.toFixed(2)} ms · max ${summary.maxMs.toFixed(2)} ms`;
}

async function main() {
  const presetIds = parsePresetIds(parseStringArg('--presets'));
  const iterations = parseNumberArg('--iterations', DEFAULT_ITERATIONS);
  const warmups = parseNumberArg('--warmups', DEFAULT_WARMUPS);
  const mode = parseModeArg();
  const output = parseStringArg('--output');

  if (iterations <= 0) {
    throw new Error('`--iterations` tiene que ser mayor que 0.');
  }

  const results: PresetSummary[] = [];

  for (const presetId of presetIds) {
    console.log(`\n▶ Corriendo preset ${presetId.toUpperCase()}...`);
    const result = await runPreset(presetId, iterations, warmups, mode);
    results.push(result);

    console.log(`   tablas: ${result.tableCount} · relaciones: ${result.relationshipCount}`);
    console.log(`   parse : ${formatSummary(result.parse)}`);
    console.log(`   layout: ${mode === 'parse-only' ? 'omitido por modo parse-only' : formatSummary(result.layout)}`);
    console.log(`   total : ${formatSummary(result.total)}`);
    if (result.appLayoutTimeoutExceeded) {
      console.log(`   ⚠ supera el timeout actual de ELK en la app (${APP_ELK_TIMEOUT_BUDGET_MS} ms)`);
    }
    const failedRun = result.runs.find((run) => run.status === 'error');
    if (result.errorMessage ?? failedRun?.errorMessage) {
      console.log(`   ✖ error: ${result.errorMessage ?? failedRun?.errorMessage}`);
    }
  }

  const report: BaselineReport = {
    generatedAt: new Date().toISOString(),
    command: `npm run benchmark:phase0 -- ${process.argv.slice(2).join(' ')}`.trim(),
    nodeVersion: process.version,
    platform: process.platform,
    cpuModel: cpus()[0]?.model ?? 'unknown',
    iterations,
    warmups,
    mode,
    relationGrouping: 'bundled',
    appElkTimeoutBudgetMs: APP_ELK_TIMEOUT_BUDGET_MS,
    results,
  };

  if (output) {
    const outputPath = resolve(process.cwd(), output);
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, JSON.stringify(report, null, 2));
    console.log(`\n✅ Reporte guardado en ${outputPath}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
