import { useEffect, useMemo, useRef, useState } from 'react';
import { HelpCircle, Maximize2, Minimize2, Search, X } from 'lucide-react';

import type { DiagramSearchResult } from '../parse-sql/useDiagramModel';
import type { RelationshipEndpointCardinality } from '../../types/erd';
import { CardinalityLegendMark } from '../../components/edges/RoutedEdge';

const CARDINALITY_MEANINGS: Array<{ token: '0' | '1' | 'N'; label: string }> = [
  { token: '0', label: 'opcional' },
  { token: '1', label: 'obligatorio / uno' },
  { token: 'N', label: 'muchos' },
];

const CARDINALITY_EXAMPLES: Array<{ label: string; cardinality: RelationshipEndpointCardinality }> = [
  { label: '0..1', cardinality: { min: 0, max: 'one' } },
  { label: '1..1', cardinality: { min: 1, max: 'one' } },
  { label: '0..N', cardinality: { min: 0, max: 'many' } },
  { label: '1..N', cardinality: { min: 1, max: 'many' } },
];

function DiagramCardinalityLegend() {
  return (
    <aside className="overlay-panel diagram-legend diagram-help-panel" aria-label="Leyenda de cardinalidad">
      <div className="diagram-legend__header">
        <span className="overlay-label">Leyenda</span>
        <span className="diagram-legend__title">Cardinalidad</span>
      </div>

      <div className="diagram-legend__tokens" aria-label="Equivalencias básicas">
        {CARDINALITY_MEANINGS.map((item) => (
          <span key={item.token} className="diagram-legend__token-pill">
            <strong>{item.token}</strong>
            <span>{item.label}</span>
          </span>
        ))}
      </div>

      <div className="diagram-legend__examples" aria-label="Ejemplos de combinaciones">
        {CARDINALITY_EXAMPLES.map((item) => (
          <div key={item.label} className="diagram-legend__example">
            <span className="diagram-legend__example-label">{item.label}</span>
            <span className="diagram-legend__example-mark">
              <CardinalityLegendMark cardinality={item.cardinality} />
            </span>
          </div>
        ))}
      </div>
    </aside>
  );
}

interface DiagramCanvasOverlaysProps {
  diagramSearch: string;
  diagramSearchResults: DiagramSearchResult[];
  isDiagramFullscreen: boolean;
  onClearSearchHighlights: () => void;
  onDiagramSearchChange: (value: string) => void;
  onFocusDiagramSearchResult: (result: DiagramSearchResult) => void;
  onToggleFullscreen: () => void | Promise<void>;
}

export function DiagramCanvasOverlays({
  diagramSearch,
  diagramSearchResults,
  isDiagramFullscreen,
  onClearSearchHighlights,
  onDiagramSearchChange,
  onFocusDiagramSearchResult,
  onToggleFullscreen,
}: DiagramCanvasOverlaysProps) {
  const [activeDiagramSearchIndex, setActiveDiagramSearchIndex] = useState(0);
  const [isDiagramHelpOpen, setIsDiagramHelpOpen] = useState(false);
  const [isDiagramSearchOpen, setIsDiagramSearchOpen] = useState(false);
  const diagramSearchInputRef = useRef<HTMLInputElement>(null);
  const diagramSearchResultItemRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const activeDiagramSearchResult = useMemo(
    () => diagramSearchResults[activeDiagramSearchIndex] ?? null,
    [activeDiagramSearchIndex, diagramSearchResults],
  );

  useEffect(() => {
    if (!isDiagramSearchOpen) return;

    const focusId = window.requestAnimationFrame(() => {
      diagramSearchInputRef.current?.focus();
      diagramSearchInputRef.current?.select();
    });

    return () => window.cancelAnimationFrame(focusId);
  }, [isDiagramSearchOpen]);

  useEffect(() => {
    setActiveDiagramSearchIndex(0);
  }, [diagramSearch]);

  useEffect(() => {
    if (activeDiagramSearchIndex < diagramSearchResults.length) return;
    setActiveDiagramSearchIndex(Math.max(0, diagramSearchResults.length - 1));
  }, [activeDiagramSearchIndex, diagramSearchResults.length]);

  useEffect(() => {
    if (!isDiagramSearchOpen || !activeDiagramSearchResult) return;

    const activeItem = diagramSearchResultItemRefs.current[activeDiagramSearchResult.id];
    if (!activeItem) return;

    activeItem.scrollIntoView({ block: 'nearest' });
  }, [activeDiagramSearchResult, isDiagramSearchOpen]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;

      const target = event.target as HTMLElement | null;
      const isTypingContext = Boolean(target?.closest('input, textarea, select, [contenteditable="true"], .monaco-editor, .view-lines'));

      if (isTypingContext) return;
      if (event.code !== 'KeyF') return;

      event.preventDefault();
      void onToggleFullscreen();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onToggleFullscreen]);

  return (
    <>
      <div className="diagram-utility-stack">
        <div className="diagram-utility-toolbar">
          <button
            type="button"
            className="btn btn-icon diagram-utility-btn diagram-search-toggle"
            aria-label={isDiagramSearchOpen ? 'Cerrar buscador del diagrama' : 'Abrir buscador del diagrama'}
            aria-expanded={isDiagramSearchOpen}
            onClick={() => {
              setIsDiagramSearchOpen((open) => {
                const nextOpen = !open;
                if (nextOpen) setIsDiagramHelpOpen(false);
                return nextOpen;
              });
            }}
            title={isDiagramSearchOpen ? 'Cerrar buscador' : 'Buscar en diagrama'}
          >
            {isDiagramSearchOpen ? <X size={15} /> : <Search size={15} />}
          </button>

          <button
            type="button"
            className="btn btn-icon diagram-utility-btn diagram-help-toggle"
            aria-label={isDiagramHelpOpen ? 'Ocultar leyenda de cardinalidad' : 'Mostrar leyenda de cardinalidad'}
            aria-expanded={isDiagramHelpOpen}
            onClick={() => {
              setIsDiagramHelpOpen((open) => {
                const nextOpen = !open;
                if (nextOpen) setIsDiagramSearchOpen(false);
                return nextOpen;
              });
            }}
            title={isDiagramHelpOpen ? 'Ocultar leyenda' : 'Mostrar leyenda'}
          >
            {isDiagramHelpOpen ? <X size={15} /> : <HelpCircle size={15} />}
          </button>
        </div>

        {isDiagramSearchOpen && (
          <div className="overlay-panel diagram-search-panel">
            <div className="diagram-search-panel__header">
              <Search size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
              <input
                ref={diagramSearchInputRef}
                type="text"
                value={diagramSearch}
                onChange={(event) => {
                  onDiagramSearchChange(event.target.value);
                  setIsDiagramSearchOpen(true);
                }}
                onFocus={(event) => {
                  event.currentTarget.select();
                  setIsDiagramSearchOpen(true);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'ArrowDown') {
                    event.preventDefault();
                    if (diagramSearchResults.length > 0) {
                      setActiveDiagramSearchIndex((current) => (current + 1) % diagramSearchResults.length);
                    }
                    return;
                  }

                  if (event.key === 'ArrowUp') {
                    event.preventDefault();
                    if (diagramSearchResults.length > 0) {
                      setActiveDiagramSearchIndex((current) =>
                        current === 0 ? diagramSearchResults.length - 1 : current - 1,
                      );
                    }
                    return;
                  }

                  if (event.key === 'Enter' && activeDiagramSearchResult) {
                    event.preventDefault();
                    onFocusDiagramSearchResult(activeDiagramSearchResult);
                  }
                }}
                placeholder="Buscar tabla o propiedad"
                className="diagram-search-input"
              />
              {diagramSearch && (
                <button
                  type="button"
                  className="btn btn-icon btn-ghost"
                  onClick={() => {
                    onDiagramSearchChange('');
                    setActiveDiagramSearchIndex(0);
                    onClearSearchHighlights();
                    diagramSearchInputRef.current?.focus();
                  }}
                  title="Limpiar búsqueda"
                  aria-label="Limpiar búsqueda"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {diagramSearch.trim() && (
              <div className="diagram-search-results">
                <div style={{ padding: '0.5rem 0.75rem', fontSize: 11, color: 'var(--text-muted)' }}>
                  {diagramSearchResults.length > 0
                    ? `${diagramSearchResults.length} coincidencia${diagramSearchResults.length === 1 ? '' : 's'} · Enter enfoca el resultado activo`
                    : 'Sin coincidencias para esta búsqueda'}
                </div>
                {diagramSearchResults.length > 0 ? (
                  diagramSearchResults.map((result) => (
                    <button
                      key={result.id}
                      ref={(element) => {
                        diagramSearchResultItemRefs.current[result.id] = element;
                      }}
                      className="btn btn-sm btn-ghost diagram-search-result"
                      onClick={() => onFocusDiagramSearchResult(result)}
                      style={{
                        background:
                          activeDiagramSearchResult?.id === result.id
                            ? 'color-mix(in srgb, var(--accent) 18%, var(--surface-2))'
                            : undefined,
                        borderColor:
                          activeDiagramSearchResult?.id === result.id
                            ? 'color-mix(in srgb, var(--accent) 50%, var(--border))'
                            : undefined,
                      }}
                      onMouseEnter={() => {
                        const index = diagramSearchResults.findIndex((candidate) => candidate.id === result.id);
                        if (index >= 0) setActiveDiagramSearchIndex(index);
                      }}
                    >
                      <span style={{ minWidth: 0, display: 'grid', gap: 2 }}>
                        <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: 600 }}>{result.label}</span>
                        {(result.schemaName || result.kind === 'column') && (
                          <span style={{ color: 'var(--text-muted)', fontSize: 11, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            {result.schemaName && <span>Schema: {result.schemaName}</span>}
                            {result.kind === 'column' && <span>Tabla: {result.entityName}</span>}
                          </span>
                        )}
                      </span>
                      <span style={{ color: 'var(--text-muted)', fontSize: 11, flexShrink: 0 }}>{result.matchText}</span>
                    </button>
                  ))
                ) : (
                  <div style={{ padding: '0.65rem 0.75rem', fontSize: 12, color: 'var(--text-muted)' }}>
                    No encontré tablas ni propiedades con ese nombre.
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {isDiagramHelpOpen && <DiagramCardinalityLegend />}
      </div>

      <button
        className="btn btn-icon overlay-panel"
        onClick={() => void onToggleFullscreen()}
        title={isDiagramFullscreen ? 'Salir de pantalla completa (F)' : 'Pantalla completa (F)'}
        style={{
          position: 'absolute',
          top: 12,
          right: 12,
          zIndex: 8,
          display: 'grid',
          placeItems: 'center',
        }}
      >
        {isDiagramFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
      </button>
    </>
  );
}
