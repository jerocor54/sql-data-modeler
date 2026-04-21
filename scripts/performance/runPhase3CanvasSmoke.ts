import { createBenchmarkDataset, type BenchmarkDatasetPresetId } from '../../src/features/performance/benchmarkDatasets';
import { getDiagramEdgeLodState, getTableNodeLodState } from '../../src/features/diagram-canvas/diagramLod';
import { parseSqlToModel } from '../../src/lib/sqlParser';

interface CanvasSmokeSummary {
  dataset: string;
  tableCount: number;
  relationshipCount: number;
  zoomSamples: number;
  nodeInvalidationsBefore: number;
  nodeInvalidationsAfter: number;
  edgeInvalidationsBefore: number;
  edgeInvalidationsAfter: number;
  totalInvalidationsBefore: number;
  totalInvalidationsAfter: number;
  totalReductionPct: number;
}

const DEFAULT_PRESETS: BenchmarkDatasetPresetId[] = ['s', 'm'];

function buildZoomSamples(sampleCount: number, startZoom: number, endZoom: number): number[] {
  if (sampleCount <= 1) return [startZoom];

  return Array.from({ length: sampleCount }, (_, index) => {
    const progress = index / (sampleCount - 1);
    return startZoom + (endZoom - startZoom) * progress;
  });
}

function countTransitions<T>(samples: T[], isEqual: (left: T, right: T) => boolean): number {
  if (samples.length <= 1) return 0;

  let transitions = 0;

  for (let index = 1; index < samples.length; index += 1) {
    if (!isEqual(samples[index - 1], samples[index])) transitions += 1;
  }

  return transitions;
}

function main() {
  const zoomSamples = buildZoomSamples(180, 0.12, 1.8);
  const edgeStateTransitions = countTransitions(
    zoomSamples.map((zoom) => getDiagramEdgeLodState(zoom)),
    (left, right) =>
      left.lodLevel === right.lodLevel &&
      left.showMarkers === right.showMarkers &&
      left.showUnhighlightedLabels === right.showUnhighlightedLabels,
  );

  const summaries: CanvasSmokeSummary[] = DEFAULT_PRESETS.map((presetId) => {
    const dataset = createBenchmarkDataset(presetId);
    const parsed = parseSqlToModel(dataset.sql, 'postgresql');
    const zoomSteps = Math.max(0, zoomSamples.length - 1);
    const nodeInvalidationsBefore = parsed.tables.length * zoomSteps;
    const nodeInvalidationsAfter = parsed.tables.reduce((total, table) => {
      const transitions = countTransitions(
        zoomSamples.map((zoom) => getTableNodeLodState(zoom, table.columns.length)),
        (left, right) =>
          left.lodLevel === right.lodLevel &&
          left.hiddenCount === right.hiddenCount &&
          left.showTypes === right.showTypes &&
          left.supportsRichDetail === right.supportsRichDetail &&
          left.visibleCount === right.visibleCount,
      );

      return total + transitions;
    }, 0);
    const edgeInvalidationsBefore = parsed.relationships.length * zoomSteps;
    const edgeInvalidationsAfter = parsed.relationships.length * edgeStateTransitions;
    const totalInvalidationsBefore = nodeInvalidationsBefore + edgeInvalidationsBefore;
    const totalInvalidationsAfter = nodeInvalidationsAfter + edgeInvalidationsAfter;
    const totalReductionPct =
      totalInvalidationsBefore === 0
        ? 0
        : ((totalInvalidationsBefore - totalInvalidationsAfter) / totalInvalidationsBefore) * 100;

    return {
      dataset: dataset.label,
      tableCount: parsed.tables.length,
      relationshipCount: parsed.relationships.length,
      zoomSamples: zoomSamples.length,
      nodeInvalidationsBefore,
      nodeInvalidationsAfter,
      edgeInvalidationsBefore,
      edgeInvalidationsAfter,
      totalInvalidationsBefore,
      totalInvalidationsAfter,
      totalReductionPct,
    };
  });

  console.table(
    summaries.map((summary) => ({
      dataset: summary.dataset,
      tables: summary.tableCount,
      relationships: summary.relationshipCount,
      zoomSamples: summary.zoomSamples,
      nodeBefore: summary.nodeInvalidationsBefore,
      nodeAfter: summary.nodeInvalidationsAfter,
      edgeBefore: summary.edgeInvalidationsBefore,
      edgeAfter: summary.edgeInvalidationsAfter,
      totalBefore: summary.totalInvalidationsBefore,
      totalAfter: summary.totalInvalidationsAfter,
      reductionPct: `${summary.totalReductionPct.toFixed(2)}%`,
    })),
  );

  console.log('\nSmoke assumptions: continuous zoom sweep from 0.12 → 1.80 using 180 samples.');
  console.log('Before = every zoom sample invalidates every node/edge subscribed to raw zoom.');
  console.log('After = selectors only invalidate when a table/edge LOD bucket actually changes.');
}

main();
