import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { createBrowserHarnessReportPath, type HarnessPresetId } from './browserBudgetPolicy.ts';

interface CheckGroup {
  pass: boolean;
  results: Array<{ name: string; pass: boolean; detail: string }>;
}

interface HarnessReport {
  status: 'pass' | 'fail';
  harness: {
    presetId: HarnessPresetId;
  };
  checks: {
    contract: CheckGroup;
    readability: CheckGroup;
    coherence: CheckGroup;
    budgets: CheckGroup;
    fatal: CheckGroup;
  };
}

const PRESETS: readonly HarnessPresetId[] = ['s', 'm'];
const FORBIDDEN_FLAGS = ['--preset', '--output'];
const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(SCRIPT_DIRECTORY, '../..');
const HARNESS_SCRIPT_PATH = resolve(SCRIPT_DIRECTORY, 'runBrowserBenchmarkHarness.ts');

async function readHarnessReport(presetId: HarnessPresetId): Promise<HarnessReport> {
  const reportPath = resolve(PROJECT_ROOT, createBrowserHarnessReportPath(presetId));
  const raw = await readFile(reportPath, 'utf8');
  return JSON.parse(raw) as HarnessReport;
}

function assertReportPasses(report: HarnessReport): void {
  const failedGroups = Object.entries(report.checks)
    .filter(([, group]) => group.pass === false)
    .map(([groupName]) => groupName);

  if (report.status !== 'pass' || failedGroups.length > 0) {
    throw new Error(
      `El reporte browser-backed para preset ${report.harness.presetId.toUpperCase()} quedó en fail. Grupos fallidos: ${failedGroups.join(', ') || 'status=fail'}.`,
    );
  }
}

function assertAllowedArgs(argv: string[]) {
  const forbiddenArgument = argv.find((argument) => FORBIDDEN_FLAGS.some((flag) => argument === flag || argument.startsWith(`${flag}=`)));

  if (forbiddenArgument) {
    throw new Error(
      `${forbiddenArgument} no está permitido en benchmark:browser:assert. Este workflow fija presets s+m y conserva las rutas estables por preset.`,
    );
  }
}

async function runPreset(presetId: HarnessPresetId, forwardedArgs: string[]) {
  console.error(`\n▶ Running browser harness for preset ${presetId.toUpperCase()}...`);

  const child = spawn('npx', ['tsx', HARNESS_SCRIPT_PATH, `--preset=${presetId}`, ...forwardedArgs], {
    cwd: PROJECT_ROOT,
    env: process.env,
    stdio: 'inherit',
  });

  const [code, signal] = await once(child, 'exit');
  if (code !== 0) {
    throw new Error(
      `El harness browser-backed falló para preset ${presetId.toUpperCase()} (code=${String(code)}, signal=${String(signal)}).`,
    );
  }

  const report = await readHarnessReport(presetId);
  assertReportPasses(report);
}

async function main() {
  const forwardedArgs = process.argv.slice(2);
  assertAllowedArgs(forwardedArgs);

  for (const presetId of PRESETS) {
    await runPreset(presetId, forwardedArgs);
  }

  console.error('\n✅ Browser harness assert completado para S y M.');
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`\n❌ ${message}`);
  process.exitCode = 1;
});
