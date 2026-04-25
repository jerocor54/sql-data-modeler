import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Download, FolderOpen, MoreHorizontal, Save } from 'lucide-react';
import { downloadTextFile, getCursorIndexForLine } from '../lib/download';
import type { AmbiguousReference, Dialect, ThemeMode } from '../types/erd';
import { getEditorTheme } from './sql-editor/monacoTheme';
import type { MonacoEditorInstance, MonacoInstance } from './sql-editor/SqlMonacoEditor';

const LazySqlMonacoEditor = lazy(() => import('./sql-editor/SqlMonacoEditor'));

interface SqlEditorPanelProps {
  sqlText: string;
  onSqlChange: (value: string) => void;
  onGoToLine?: number | null;
  onGoToLineHandled: () => void;
  errors: string[];
  warnings: string[];
  ambiguousReferences: AmbiguousReference[];
  onAmbiguousReferenceSelect: (reference: AmbiguousReference) => void;
  dialect: Dialect;
  onDialectChange: (dialect: Dialect) => void;
  theme: ThemeMode;
  themeReady: boolean;
}

function readDocumentTheme(): ThemeMode | null {
  if (typeof document === 'undefined') return null;

  const theme = document.documentElement.dataset.theme;
  if (theme === 'light' || theme === 'dark' || theme === 'deepblue') return theme;
  return null;
}

function getMonacoSelectionCharacterCount(editor: MonacoEditorInstance): number {
  const model = editor.getModel();
  if (!model) return 0;

  const selections = editor.getSelections() ?? [];

  return selections.reduce((total, selection) => {
    if (selection.isEmpty()) return total;
    return total + model.getValueInRange(selection).length;
  }, 0);
}

function getTextareaSelectionCharacterCount(textarea: HTMLTextAreaElement | null): number {
  if (!textarea) return 0;
  if (textarea.selectionStart === textarea.selectionEnd) return 0;
  return textarea.value.slice(textarea.selectionStart, textarea.selectionEnd).length;
}

export default function SqlEditorPanel({
  sqlText,
  onSqlChange,
  onGoToLine,
  onGoToLineHandled,
  errors,
  warnings,
  ambiguousReferences,
  onAmbiguousReferenceSelect,
  dialect,
  onDialectChange,
  theme,
  themeReady,
}: SqlEditorPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<MonacoEditorInstance | null>(null);
  const monacoRef = useRef<MonacoInstance | null>(null);
  const fallbackTextareaRef = useRef<HTMLTextAreaElement>(null);
  const actionsMenuRef = useRef<HTMLDivElement>(null);
  const actionsTriggerRef = useRef<HTMLButtonElement>(null);
  const [openActionsMenu, setOpenActionsMenu] = useState(false);
  const [editorReady, setEditorReady] = useState(false);
  const [monacoLoadState, setMonacoLoadState] = useState<'idle' | 'loading' | 'ready' | 'failed'>('idle');
  const [monacoLoadAttempt, setMonacoLoadAttempt] = useState(0);
  const [textareaFocused, setTextareaFocused] = useState(false);
  const [resolvedTheme, setResolvedTheme] = useState<ThemeMode>(() => readDocumentTheme() ?? theme);
  const [selectionCharacterCount, setSelectionCharacterCount] = useState<number | null>(null);

  const editorTheme = useMemo(() => getEditorTheme(resolvedTheme), [resolvedTheme]);
  const genericWarnings = useMemo(
    () => warnings.filter((warning) => !warning.startsWith('Referencia ambigua:')),
    [warnings],
  );

  const requestMonacoLoad = useCallback(() => {
    setMonacoLoadAttempt((attempt) => attempt + 1);
  }, []);

  const showTextareaEditor = monacoLoadState !== 'ready' || textareaFocused;

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (monacoLoadState !== 'idle') return;

    if ('requestIdleCallback' in window) {
      const idleCallbackId = window.requestIdleCallback(() => {
        requestMonacoLoad();
      }, { timeout: 3000 });

      return () => window.cancelIdleCallback(idleCallbackId);
    }

    const timer = globalThis.setTimeout(() => {
      requestMonacoLoad();
    }, 1800);

    return () => globalThis.clearTimeout(timer);
  }, [monacoLoadState, requestMonacoLoad]);

  useEffect(() => {
    let cancelled = false;

    if (monacoLoadAttempt === 0 || monacoLoadState === 'loading' || monacoLoadState === 'ready') return;

    const setupMonacoLoader = async () => {
      if (typeof window === 'undefined') return;

      try {
        setMonacoLoadState('loading');
        const { ensureSqlMonacoRuntime } = await import('./sql-editor/SqlMonacoEditor');
        if (cancelled) return;
        await ensureSqlMonacoRuntime();
        if (cancelled) return;
        setMonacoLoadState('ready');
      } catch {
        if (!cancelled) {
          setMonacoLoadState('failed');
          setEditorReady(false);
        }
      }
    };

    setupMonacoLoader();

    return () => {
      cancelled = true;
    };
  }, [monacoLoadAttempt]);

  useEffect(() => {
    if (!themeReady) {
      const documentTheme = readDocumentTheme();
      if (documentTheme) setResolvedTheme(documentTheme);
      return;
    }

    setResolvedTheme(theme);
  }, [theme, themeReady]);

  useEffect(() => {
    if (!openActionsMenu) return;

    const closeMenu = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;

      const clickedMenu = actionsMenuRef.current?.contains(target);
      const clickedTrigger = actionsTriggerRef.current?.contains(target);
      if (!clickedMenu && !clickedTrigger) setOpenActionsMenu(false);
    };

    document.addEventListener('pointerdown', closeMenu);
    return () => document.removeEventListener('pointerdown', closeMenu);
  }, [openActionsMenu]);

  useEffect(() => {
    if (editorReady || monacoLoadState !== 'loading') return;

    const timer = window.setTimeout(() => {
      if (!editorReady) {
        setMonacoLoadState('failed');
        setEditorReady(false);
      }
    }, 4500);

    return () => window.clearTimeout(timer);
  }, [editorReady, monacoLoadState]);

  const onEditorMount = useCallback((editor: MonacoEditorInstance, monaco: MonacoInstance) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    setEditorReady(true);
    setMonacoLoadState('ready');

    monaco.editor.setTheme(getEditorTheme(resolvedTheme));
  }, [resolvedTheme]);

  useEffect(() => {
    if (showTextareaEditor || !editorRef.current) {
      setSelectionCharacterCount(null);
      return;
    }

    const editor = editorRef.current;
    const syncSelectionCharacterCount = () => {
      const count = getMonacoSelectionCharacterCount(editor);
      setSelectionCharacterCount(count > 0 ? count : null);
    };

    syncSelectionCharacterCount();

    const selectionDisposable = editor.onDidChangeCursorSelection(syncSelectionCharacterCount);
    const contentDisposable = editor.onDidChangeModelContent(syncSelectionCharacterCount);

    return () => {
      selectionDisposable.dispose();
      contentDisposable.dispose();
    };
  }, [editorReady, showTextareaEditor]);

  useEffect(() => {
    if (!monacoRef.current) return;
    monacoRef.current.editor.setTheme(editorTheme);
  }, [editorTheme]);

  useEffect(() => {
    if (!onGoToLine) return;

    if (showTextareaEditor) {
      if (fallbackTextareaRef.current) {
        const index = getCursorIndexForLine(sqlText, onGoToLine);
        fallbackTextareaRef.current.focus();
        fallbackTextareaRef.current.setSelectionRange(index, index);
        fallbackTextareaRef.current.scrollTo({ top: Math.max(0, onGoToLine - 2) * 20, behavior: 'smooth' });
      }
      onGoToLineHandled();
      return;
    }

    if (!editorRef.current) return;

    const model = editorRef.current.getModel();
    const maxLine = model?.getLineCount() ?? onGoToLine;
    const lineNumber = Math.max(1, Math.min(onGoToLine, maxLine));

    editorRef.current.revealLineInCenter(lineNumber);
    editorRef.current.setPosition({ lineNumber, column: 1 });
    editorRef.current.focus();

    onGoToLineHandled();
  }, [editorReady, onGoToLine, onGoToLineHandled, showTextareaEditor, sqlText]);

  return (
    <section className="panel-card" style={{ display: 'grid', gridTemplateRows: 'auto 1fr auto', minHeight: 0, height: '100%', padding: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ display: 'grid', gap: 2 }}>
          <h2 style={{ margin: 0, fontSize: 14, letterSpacing: 0.2 }}>Editor SQL (DDL)</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', minHeight: 20 }}>
            <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>Render en vivo</span>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                minHeight: 18,
                fontSize: 11,
                lineHeight: 1.1,
                padding: '2px 7px',
                borderRadius: 999,
                color: 'var(--text-muted)',
                background: selectionCharacterCount
                  ? 'color-mix(in srgb, var(--panel-alt) 88%, transparent)'
                  : 'transparent',
                border: selectionCharacterCount
                  ? '1px solid color-mix(in srgb, var(--border) 80%, transparent)'
                  : '1px solid transparent',
                visibility: selectionCharacterCount ? 'visible' : 'hidden',
              }}
            >
              Selección: {selectionCharacterCount ?? 0} {(selectionCharacterCount ?? 0) === 1 ? 'carácter' : 'caracteres'}
            </span>
          </div>
        </div>
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            ref={actionsTriggerRef}
            className="btn btn-icon"
            onClick={() => setOpenActionsMenu((open) => !open)}
            title="Opciones SQL"
          >
            <MoreHorizontal size={16} />
          </button>

          {openActionsMenu && (
            <div
              ref={actionsMenuRef}
              className="overlay-panel"
              style={{
                position: 'absolute',
                top: 'calc(100% + 6px)',
                right: 0,
                width: 260,
                padding: 12,
                zIndex: 90,
                display: 'grid',
                gap: 12,
              }}
            >
              <div className="overlay-section">
                <span className="overlay-label">Archivo SQL</span>

                <div className="compact-action-row" aria-label="Acciones de archivo SQL">
                  <button
                    className="btn btn-icon compact-action-btn"
                    onClick={() => {
                      fileInputRef.current?.click();
                      setOpenActionsMenu(false);
                    }}
                    title="Cargar .sql"
                    aria-label="Cargar .sql"
                  >
                    <FolderOpen size={14} />
                  </button>

                  <button
                    className="btn btn-icon compact-action-btn"
                    onClick={() => {
                      downloadTextFile('schema.sql', sqlText, 'text/sql;charset=utf-8');
                      setOpenActionsMenu(false);
                    }}
                    title="Descargar .sql"
                    aria-label="Descargar .sql"
                  >
                    <Download size={14} />
                  </button>

                  <button
                    className="btn btn-icon compact-action-btn"
                    onClick={() => {
                      downloadTextFile('schema-backup.sql', sqlText, 'text/sql;charset=utf-8');
                      setOpenActionsMenu(false);
                    }}
                    title="Guardar backup"
                    aria-label="Guardar backup"
                  >
                    <Save size={14} />
                  </button>
                </div>
              </div>

              <div className="overlay-section">
                <span className="overlay-label">Parser</span>

                <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
                  Dialecto del parser
                  <select
                    className="select-modern"
                    value={dialect}
                    onChange={(event) => onDialectChange(event.target.value as Dialect)}
                  >
                    <option value="auto">Auto</option>
                    <option value="postgresql">PostgreSQL</option>
                    <option value="oracle">Oracle</option>
                  </select>
                </label>
              </div>
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept=".sql,text/sql"
            hidden
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              const content = await file.text();
              onSqlChange(content);
              event.target.value = '';
            }}
          />
        </div>
      </div>

      <div className="field" style={{ minHeight: 0, overflow: 'hidden', borderRadius: 12 }}>
        {showTextareaEditor ? (
          <div style={{ height: '100%', display: 'grid', gridTemplateRows: 'auto 1fr' }}>
            <div
              style={{
                padding: '8px 10px',
                fontSize: 12,
                color: monacoLoadState === 'failed' ? '#f59e0b' : 'var(--text-muted)',
                borderBottom: '1px solid var(--border)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 8,
              }}
            >
              {monacoLoadState === 'failed' ? (
                <>
                  <span>Modo fallback activo: Monaco no respondió a tiempo.</span>
                  <button
                    className="btn btn-sm"
                    onClick={() => {
                      setEditorReady(false);
                      setMonacoLoadState('idle');
                      requestMonacoLoad();
                    }}
                  >
                    Reintentar Monaco
                  </button>
                </>
              ) : (
                <>
                  <span>
                    {monacoLoadState === 'loading'
                      ? 'Editor liviano activo mientras Monaco termina de prepararse.'
                      : 'Editor liviano activo. Monaco se carga al interactuar o en segundo plano.'}
                  </span>
                  <button
                    className="btn btn-sm"
                    onClick={() => requestMonacoLoad()}
                    disabled={monacoLoadState === 'loading'}
                  >
                    {monacoLoadState === 'loading' ? 'Cargando Monaco…' : 'Cargar Monaco'}
                  </button>
                </>
              )}
            </div>

            <textarea
              ref={fallbackTextareaRef}
              value={sqlText}
              onChange={(event) => onSqlChange(event.target.value)}
              onFocus={() => {
                setTextareaFocused(true);
                if (monacoLoadState === 'idle') requestMonacoLoad();
              }}
              onPointerDown={() => {
                if (monacoLoadState === 'idle') requestMonacoLoad();
              }}
              onSelect={() => {
                const count = getTextareaSelectionCharacterCount(fallbackTextareaRef.current);
                setSelectionCharacterCount(count > 0 ? count : null);
              }}
              onBlur={() => {
                setTextareaFocused(false);
                setSelectionCharacterCount(null);
              }}
              spellCheck={false}
              style={{
                width: '100%',
                height: '100%',
                resize: 'none',
                border: 'none',
                padding: '10px 12px',
                lineHeight: '20px',
                fontSize: 13,
                fontFamily: 'JetBrains Mono, Fira Code, Menlo, Consolas, monospace',
              }}
            />
          </div>
        ) : (
          <Suspense fallback={<div style={{ height: '100%', display: 'grid', placeItems: 'center', color: 'var(--text-muted)' }}>Cargando editor…</div>}>
            <LazySqlMonacoEditor
              sqlText={sqlText}
              resolvedTheme={resolvedTheme}
              onSqlChange={onSqlChange}
              onEditorMount={onEditorMount}
            />
          </Suspense>
        )}
      </div>

      <div style={{ marginTop: 8, display: 'grid', gap: 4, maxHeight: 90, overflow: 'auto' }}>
        {errors.length === 0 && warnings.length === 0 ? (
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Sin errores ni advertencias de referencia.</span>
        ) : (
          <>
            {ambiguousReferences.map((reference) => (
              <button
                key={`${reference.sourceTable}.${reference.sourceColumn}.${reference.targetTableInput}`}
                className="btn btn-sm"
                style={{
                  justifyContent: 'flex-start',
                  textAlign: 'left',
                  fontSize: 12,
                  color: '#f59e0b',
                  borderColor: 'color-mix(in srgb, #f59e0b 28%, var(--border))',
                  background: 'color-mix(in srgb, #f59e0b 8%, transparent)',
                }}
                onClick={() => onAmbiguousReferenceSelect(reference)}
                title="Centrar y resaltar tablas ambiguas en el diagrama"
              >
                ⚠️ Referencia ambigua: {reference.sourceTable}.{reference.sourceColumn} → {reference.targetTableInput}
              </button>
            ))}
            {genericWarnings.map((warning) => (
              <span key={warning} style={{ color: '#f59e0b', fontSize: 12 }}>
                ⚠️ {warning}
              </span>
            ))}
            {errors.map((error) => (
            <span key={error} style={{ color: '#f87171', fontSize: 12 }}>
              ⚠️ {error}
            </span>
            ))}
          </>
        )}
      </div>
    </section>
  );
}
