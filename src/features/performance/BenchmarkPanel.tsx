import { useMemo, useState } from 'react';
import {
  createBenchmarkDataset,
  getBenchmarkDatasetPreset,
  isBenchmarkDatasetInteractiveSupported,
  listBenchmarkDatasetPresets,
  type BenchmarkDatasetPresetId,
} from './benchmarkDatasets';
import type { DiagramBenchmarkResult } from './diagramPerformance';

interface BenchmarkPanelProps {
  latestResult: DiagramBenchmarkResult | null;
  history: DiagramBenchmarkResult[];
  onLoadDataset: (presetId: BenchmarkDatasetPresetId) => void;
  onRerunDataset: (presetId: BenchmarkDatasetPresetId) => void;
  onCopyResults: () => void;
  onClearHistory: () => void;
}

function formatDuration(value: number): string {
  return `${value.toFixed(2)} ms`;
}

export default function BenchmarkPanel({
  latestResult,
  history,
  onLoadDataset,
  onRerunDataset,
  onCopyResults,
  onClearHistory,
}: BenchmarkPanelProps) {
  const presets = useMemo(() => listBenchmarkDatasetPresets(), []);
  const [selectedPresetId, setSelectedPresetId] = useState<BenchmarkDatasetPresetId>('s');
  const selectedDataset = useMemo(() => createBenchmarkDataset(selectedPresetId), [selectedPresetId]);
  const selectedPreset = useMemo(() => getBenchmarkDatasetPreset(selectedPresetId), [selectedPresetId]);
  const isInteractivePreset = selectedPreset.interactiveSupport === 'safe';
  const interactiveGuardMessage = useMemo(
    () => `Los presets grandes (L/XL/XXL) no están habilitados para carga interactiva: hoy siguen bloqueando la UI porque parse + layout corren en el main thread. Corré benchmark:phase0 con --presets=${selectedPresetId} para medirlos en modo controlado.`,
    [selectedPresetId],
  );

  return (
    <section className="panel-card" style={{ padding: 12, display: 'grid', gap: 12 }}>
      <div style={{ display: 'grid', gap: 4 }}>
        <strong style={{ fontSize: 14 }}>Baseline de performance · Fase 0</strong>
        <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>
          Presets sintéticos y determinísticos para comparar parse, layout y tiempo total hasta diagrama usable.
        </span>
      </div>

      <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
        <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
          Dataset
          <select
            className="select-modern"
            value={selectedPresetId}
            onChange={(event) => setSelectedPresetId(event.target.value as BenchmarkDatasetPresetId)}
          >
            {presets.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.label} · {preset.tableCount} tablas
              </option>
            ))}
          </select>
        </label>

        <div style={{ display: 'grid', gap: 4, fontSize: 12 }}>
          <span style={{ color: 'var(--text-muted)' }}>Versión</span>
          <strong>{selectedDataset.version}</strong>
        </div>

        <div style={{ display: 'grid', gap: 4, fontSize: 12 }}>
          <span style={{ color: 'var(--text-muted)' }}>Preset</span>
          <strong>
            {selectedDataset.label} · {selectedDataset.tableCount} tablas
          </strong>
        </div>

        <div style={{ display: 'grid', gap: 4, fontSize: 12 }}>
          <span style={{ color: 'var(--text-muted)' }}>Soporte interactivo</span>
          <strong>{isInteractivePreset ? 'UI segura (S/M)' : 'Solo CLI / medición controlada'}</strong>
        </div>
      </div>

      <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>{selectedDataset.description}</div>

      {!isInteractivePreset && (
        <div
          style={{
            display: 'grid',
            gap: 6,
            padding: 12,
            borderRadius: 14,
            border: '1px solid color-mix(in srgb, #f59e0b 52%, var(--border))',
            background: 'color-mix(in srgb, #f59e0b 10%, var(--panel))',
            fontSize: 12,
          }}
        >
          <strong style={{ color: 'var(--text)' }}>Preset no apto para correr desde la UI actual</strong>
          <span style={{ color: 'var(--text-muted)' }}>{interactiveGuardMessage}</span>
          <code style={{ fontSize: 11, overflowX: 'auto' }}>npm run benchmark:phase0 -- --presets={selectedPresetId}</code>
        </div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <button
          className="btn btn-sm"
          onClick={() => onLoadDataset(selectedPresetId)}
          disabled={!isBenchmarkDatasetInteractiveSupported(selectedPresetId)}
          title={!isInteractivePreset ? 'Disponible solo para S/M mientras parse + layout sigan en el main thread.' : undefined}
        >
          Cargar dataset en la app
        </button>
        <button
          className="btn btn-sm btn-subtle"
          onClick={() => onRerunDataset(selectedPresetId)}
          disabled={!isBenchmarkDatasetInteractiveSupported(selectedPresetId)}
          title={!isInteractivePreset ? 'Disponible solo para S/M mientras parse + layout sigan en el main thread.' : undefined}
        >
          Repetir baseline actual
        </button>
        <button className="btn btn-sm btn-ghost" onClick={onCopyResults} disabled={history.length === 0}>
          Copiar resultados JSON
        </button>
        <button className="btn btn-sm btn-ghost" onClick={onClearHistory} disabled={history.length === 0}>
          Limpiar historial
        </button>
      </div>

      {latestResult && (
        <div style={{ display: 'grid', gap: 8, border: '1px solid var(--border)', borderRadius: 14, padding: 12 }}>
          <strong style={{ fontSize: 13 }}>Última medición</strong>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8, fontSize: 12 }}>
            <div><span style={{ color: 'var(--text-muted)' }}>Trigger</span><br />{latestResult.trigger}</div>
            <div><span style={{ color: 'var(--text-muted)' }}>Tablas</span><br />{latestResult.tableCount}</div>
            <div><span style={{ color: 'var(--text-muted)' }}>Layout</span><br />{latestResult.layoutEngine}</div>
            <div><span style={{ color: 'var(--text-muted)' }}>Parse</span><br />{formatDuration(latestResult.parseMs)}</div>
            <div><span style={{ color: 'var(--text-muted)' }}>Layout</span><br />{formatDuration(latestResult.layoutMs)}</div>
            <div><span style={{ color: 'var(--text-muted)' }}>Total usable</span><br />{formatDuration(latestResult.totalMs)}</div>
            <div><span style={{ color: 'var(--text-muted)' }}>Relaciones</span><br />{latestResult.relationshipCount}</div>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gap: 8 }}>
        <strong style={{ fontSize: 13 }}>Historial reciente</strong>
        {history.length === 0 ? (
          <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>
            Todavía no hay corridas. Cargá un preset o repetí el baseline para registrar números.
          </span>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--text-muted)' }}>
                  <th style={{ padding: '6px 4px' }}>Dataset</th>
                  <th style={{ padding: '6px 4px' }}>Tablas</th>
                  <th style={{ padding: '6px 4px' }}>Rel.</th>
                  <th style={{ padding: '6px 4px' }}>Parse</th>
                  <th style={{ padding: '6px 4px' }}>Layout</th>
                  <th style={{ padding: '6px 4px' }}>Total</th>
                  <th style={{ padding: '6px 4px' }}>Motor</th>
                </tr>
              </thead>
              <tbody>
                {history.map((result) => (
                  <tr key={result.runId} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '6px 4px' }}>{result.datasetLabel ?? 'manual'}</td>
                    <td style={{ padding: '6px 4px' }}>{result.tableCount}</td>
                    <td style={{ padding: '6px 4px' }}>{result.relationshipCount}</td>
                    <td style={{ padding: '6px 4px' }}>{formatDuration(result.parseMs)}</td>
                    <td style={{ padding: '6px 4px' }}>{formatDuration(result.layoutMs)}</td>
                    <td style={{ padding: '6px 4px' }}>{formatDuration(result.totalMs)}</td>
                    <td style={{ padding: '6px 4px' }}>{result.layoutEngine}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
