import type { LayoutFallbackDiagnostics } from '../auto-layout/layoutWorkerProtocol';
import type { LayoutEngineMode } from '../auto-layout/useAutoLayout';
import type { DiagramPresentationMode, DiagramPresentationStrategy } from '../diagram-presentation/useDiagramPresentation';
import type { DiagramBenchmarkResult } from './diagramPerformance';
import type { LongTaskSummary } from './useLongTaskObserver';

interface PerformanceOverlayProps {
  latestResult: DiagramBenchmarkResult | null;
  layoutDiagnostics: LayoutFallbackDiagnostics | null;
  layoutMode: LayoutEngineMode;
  layoutPending: boolean;
  layoutWarning: string;
  longTasks: LongTaskSummary;
  presentationIsAutomatic: boolean;
  presentationMode: DiagramPresentationMode;
  presentationStrategy: DiagramPresentationStrategy;
  presentedEdgeCount: number;
  presentedNodeCount: number;
  relationshipCount: number;
  sqlTextLength: number;
  tableCount: number;
  totalEdgeCount: number;
  totalNodeCount: number;
  viewMode: 'split' | 'tabs';
}

function formatMs(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '—';
  return `${value.toFixed(1)} ms`;
}

function formatCount(value: number): string {
  return new Intl.NumberFormat('es-AR').format(value);
}

function formatOptionalMs(value: number | null): string {
  return value == null ? '—' : formatMs(value);
}

function formatObservedAt(value: number | null): string {
  if (value == null) return '—';

  return new Date(value).toLocaleTimeString('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

function getPresentationModeLabel(mode: DiagramPresentationMode): string {
  if (mode === 'full') return 'full';
  if (mode === 'overview') return 'overview';
  return 'focus';
}

function getPresentationStrategyLabel(strategy: DiagramPresentationStrategy): string {
  if (strategy === 'normal') return 'normal';
  if (strategy === 'large') return 'large';
  return 'extreme';
}

function formatDiagnostics(diagnostics: LayoutFallbackDiagnostics | null): string {
  if (!diagnostics) return 'No fallback diagnostics';

  const parts = [`cause=${diagnostics.cause}`];
  if (diagnostics.provenance?.stage) parts.push(`stage=${diagnostics.provenance.stage}`);
  if (diagnostics.provenance?.message) parts.push(diagnostics.provenance.message);
  return parts.join(' · ');
}

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
      <span style={{ color: 'var(--text-muted)' }}>{label}</span>
      <strong style={{ textAlign: 'right' }}>{value}</strong>
    </div>
  );
}

export default function PerformanceOverlay({
  latestResult,
  layoutDiagnostics,
  layoutMode,
  layoutPending,
  layoutWarning,
  longTasks,
  presentationIsAutomatic,
  presentationMode,
  presentationStrategy,
  presentedEdgeCount,
  presentedNodeCount,
  relationshipCount,
  sqlTextLength,
  tableCount,
  totalEdgeCount,
  totalNodeCount,
  viewMode,
}: PerformanceOverlayProps) {
  if (!import.meta.env.DEV) return null;

  const parseMs = latestResult?.parseMs ?? null;
  const layoutMs = latestResult?.layoutMs ?? null;
  const renderMs = latestResult ? Math.max(0, latestResult.totalMs - latestResult.parseMs - latestResult.layoutMs) : null;
  const fallbackActive = layoutMode === 'fallback' || Boolean(layoutDiagnostics);

  return (
    <aside
      aria-label="Performance overlay"
      className="panel-card overlay-panel"
      style={{
        position: 'fixed',
        right: 16,
        bottom: 16,
        zIndex: 40,
        width: 'min(320px, calc(100vw - 32px))',
        padding: 12,
        display: 'grid',
        gap: 10,
        fontSize: 11,
        lineHeight: 1.35,
        backdropFilter: 'blur(10px)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
        <div style={{ display: 'grid', gap: 2 }}>
          <span className="overlay-label">Dev performance</span>
          <strong>Fase 7 · observabilidad base</strong>
        </div>
        {layoutPending && <span className="status-pill">running</span>}
      </div>

      <div style={{ display: 'grid', gap: 6 }}>
        <MetricRow label="parse" value={formatMs(parseMs)} />
        <MetricRow label="layout" value={formatMs(layoutMs)} />
        <MetricRow label="render aprox" value={formatMs(renderMs)} />
        <MetricRow label="nodes" value={`${formatCount(presentedNodeCount)}/${formatCount(totalNodeCount)}`} />
        <MetricRow label="edges" value={`${formatCount(presentedEdgeCount)}/${formatCount(totalEdgeCount)}`} />
      </div>

      <div style={{ display: 'grid', gap: 6, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
        <MetricRow
          label="modo"
          value={`${layoutMode} · ${getPresentationModeLabel(presentationMode)} · ${presentationIsAutomatic ? 'auto' : 'manual'}`}
        />
        <MetricRow label="estrategia" value={getPresentationStrategyLabel(presentationStrategy)} />
        <MetricRow label="vista" value={viewMode} />
        <MetricRow label="SQL chars" value={formatCount(sqlTextLength)} />
        <MetricRow label="tablas" value={formatCount(tableCount)} />
        <MetricRow label="relaciones" value={formatCount(relationshipCount)} />
      </div>

      <div style={{ display: 'grid', gap: 4, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
        <span style={{ color: fallbackActive ? '#f59e0b' : 'var(--text-muted)' }}>
          fallback {fallbackActive ? 'activo' : 'inactivo'}
        </span>
        {(layoutWarning || layoutDiagnostics) && (
          <span style={{ color: 'var(--text-muted)', wordBreak: 'break-word' }}>
            {layoutWarning ? `${layoutWarning} · ` : ''}
            {formatDiagnostics(layoutDiagnostics)}
          </span>
        )}
      </div>

      <div style={{ display: 'grid', gap: 6, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
        <MetricRow label="long tasks" value={longTasks.supported ? formatCount(longTasks.count) : 'unsupported'} />
        <MetricRow label="max long task" value={formatOptionalMs(longTasks.maxDuration)} />
        <MetricRow label="last long task" value={formatOptionalMs(longTasks.lastDuration)} />
        <MetricRow label="última captura" value={formatObservedAt(longTasks.lastObservedAt)} />
      </div>
    </aside>
  );
}
