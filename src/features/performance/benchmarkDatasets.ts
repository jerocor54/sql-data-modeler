export type BenchmarkDatasetPresetId = 's' | 'm' | 'l' | 'xl' | 'xxl';

export interface BenchmarkDatasetPreset {
  id: BenchmarkDatasetPresetId;
  label: string;
  version: string;
  tableCount: number;
  description: string;
  interactiveSupport: 'safe' | 'controlled-only';
}

export interface BenchmarkDataset extends BenchmarkDatasetPreset {
  sql: string;
}

const DATASET_VERSION = 'phase-0-v1';

const DATASET_PRESETS: BenchmarkDatasetPreset[] = [
  {
    id: 's',
    label: 'S',
    version: DATASET_VERSION,
    tableCount: 50,
    description: 'Baseline chico para validar parse + layout sin estrés extremo.',
    interactiveSupport: 'safe',
  },
  {
    id: 'm',
    label: 'M',
    version: DATASET_VERSION,
    tableCount: 200,
    description: 'Escala media para detectar el primer salto real de costo.',
    interactiveSupport: 'safe',
  },
  {
    id: 'l',
    label: 'L',
    version: DATASET_VERSION,
    tableCount: 500,
    description: 'Tamaño grande para exponer hotspots visibles del main thread.',
    interactiveSupport: 'controlled-only',
  },
  {
    id: 'xl',
    label: 'XL',
    version: DATASET_VERSION,
    tableCount: 1000,
    description: 'Escala muy grande para medir el límite antes de workers.',
    interactiveSupport: 'controlled-only',
  },
  {
    id: 'xxl',
    label: 'XXL',
    version: DATASET_VERSION,
    tableCount: 3000,
    description: 'Estrés extremo, generado on-demand para evitar inflar el repo con fixtures gigantes.',
    interactiveSupport: 'controlled-only',
  },
];

const SCHEMA_NAMES = ['bench_core', 'bench_sales', 'bench_ops', 'bench_audit'] as const;
const COLUMN_TYPE_POOL = ['BIGINT', 'INTEGER', 'NUMERIC(12,2)', 'VARCHAR(120)', 'TIMESTAMP', 'BOOLEAN'] as const;

function padTableIndex(index: number): string {
  return String(index + 1).padStart(4, '0');
}

function getTableName(index: number): string {
  const schema = SCHEMA_NAMES[index % SCHEMA_NAMES.length];
  return `${schema}.entity_${padTableIndex(index)}`;
}

function getColumnType(index: number): string {
  return COLUMN_TYPE_POOL[index % COLUMN_TYPE_POOL.length];
}

function buildColumns(index: number): string[] {
  const columns = [
    '  id BIGINT PRIMARY KEY',
    '  entity_code VARCHAR(64) NOT NULL UNIQUE',
    '  status VARCHAR(24) NOT NULL',
    `  metric_value ${getColumnType(index + 1)} NOT NULL`,
    '  created_at TIMESTAMP NOT NULL',
    '  updated_at TIMESTAMP',
  ];

  if (index > 0) {
    columns.push(`  parent_entity_id BIGINT NOT NULL REFERENCES ${getTableName(index - 1)}(id)`);
  }

  if (index > 2 && index % 3 === 0) {
    columns.push(`  owner_entity_id BIGINT REFERENCES ${getTableName(Math.max(0, index - 3))}(id)`);
  }

  if (index > 5 && index % 5 === 0) {
    columns.push('  region_entity_id BIGINT');
    columns.push(
      `  CONSTRAINT fk_entity_${padTableIndex(index)}_region FOREIGN KEY (region_entity_id) REFERENCES ${getTableName(Math.max(0, index - 5))}(id)`,
    );
  }

  if (index > 11 && index % 8 === 0) {
    columns.push('  source_entity_id BIGINT');
    columns.push(
      `  CONSTRAINT fk_entity_${padTableIndex(index)}_source FOREIGN KEY (source_entity_id) REFERENCES ${getTableName(Math.floor(index / 2))}(id)`,
    );
  }

  return columns;
}

function buildTableSql(index: number): string {
  return `CREATE TABLE ${getTableName(index)} (\n${buildColumns(index).join(',\n')}\n);`;
}

export function listBenchmarkDatasetPresets(): BenchmarkDatasetPreset[] {
  return DATASET_PRESETS;
}

export function getBenchmarkDatasetPreset(id: BenchmarkDatasetPresetId): BenchmarkDatasetPreset {
  const preset = DATASET_PRESETS.find((candidate) => candidate.id === id);

  if (!preset) {
    throw new Error(`Unknown benchmark dataset preset: ${id}`);
  }

  return preset;
}

export function isBenchmarkDatasetInteractiveSupported(id: BenchmarkDatasetPresetId): boolean {
  return getBenchmarkDatasetPreset(id).interactiveSupport === 'safe';
}

export function createBenchmarkDataset(id: BenchmarkDatasetPresetId): BenchmarkDataset {
  const preset = getBenchmarkDatasetPreset(id);

  return {
    ...preset,
    sql: Array.from({ length: preset.tableCount }, (_, index) => buildTableSql(index)).join('\n\n'),
  };
}
