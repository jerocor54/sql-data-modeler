import { useEffect, useMemo, useRef, useState } from 'react';
import { Handle, Position as HandlePosition, type NodeProps } from '@xyflow/react';
import {
  Eye,
  Link2,
  MoreHorizontal,
  Palette,
  RotateCcw,
  Type,
} from 'lucide-react';
import { TABLE_NODE_WIDTH } from '../../lib/diagramGeometry';
import { EDGE_HANDLE_IDS } from '../../lib/edgeRouting';
import { getTypeIconKey, type SqlTypeIconKey } from '../../lib/typeIcons';
import type { TableDesignTheme, TableModel, TableVisualConfig, ThemeMode, TypeDisplayMode } from '../../types/erd';

interface TableNodeData {
  table: TableModel;
  config: TableVisualConfig;
  appTheme: ThemeMode;
  designTheme: TableDesignTheme;
  typeMode: TypeDisplayMode;
  activeColumns: Set<string>;
  ambiguousColumns: Set<string>;
  isAmbiguousTable: boolean;
  focusedAmbiguousColumns: Set<string>;
  isFocusedAmbiguousTable: boolean;
  onColumnSelect: (tableKey: string, columnName: string, kind: 'pk' | 'fk') => void;
  onGoToSql: (line: number) => void;
  onPreview: (tableKey: string) => void;
  onTableStyleChange: (tableKey: string, patch: Partial<TableVisualConfig>) => void;
}

function badgeStyles(isPrimary: boolean, isForeign: boolean, designTheme: TableDesignTheme): React.CSSProperties {
  if (designTheme === 'dbeaver') {
    if (isPrimary) return { color: '#0f6cbd', fontWeight: 700 };
    if (isForeign) return { color: '#0f6cbd', fontWeight: 700 };
    return { color: '#5f6f82', fontWeight: 700 };
  }

  if (isPrimary) return { background: '#f59e0b33', color: '#fbbf24' };
  if (isForeign) return { background: '#22d3ee33', color: '#22d3ee' };
  return { background: '#33415533', color: '#94a3b8' };
}

const TYPE_INDICATOR_MAP: Record<SqlTypeIconKey, { label: string; color: string }> = {
  numeric: { label: '123', color: '#60A5FA' },
  text: { label: 'A-z', color: '#A78BFA' },
  date: { label: '◴', color: '#38BDF8' },
  boolean: { label: '◉', color: '#34D399' },
  json: { label: '{}', color: '#F59E0B' },
  decimal: { label: '1.2', color: '#F97316' },
  uuid: { label: 'UUID', color: '#E879F9' },
  binary: { label: '0x', color: '#F43F5E' },
  generic: { label: 'T', color: '#94A3B8' },
};

const HIDDEN_HANDLE_STYLE: React.CSSProperties = {
  width: 10,
  height: 10,
  border: 'none',
  background: 'transparent',
  opacity: 0,
  pointerEvents: 'none',
};

function HeaderTableGlyph({ primary, secondary }: { primary: string; secondary: string }) {
  return (
    <span
      aria-hidden="true"
      style={{
        width: 12,
        height: 12,
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gridTemplateRows: 'repeat(3, 1fr)',
        gap: 1,
        flexShrink: 0,
      }}
    >
      {Array.from({ length: 9 }).map((_, index) => (
        <span key={index} style={{ background: index === 0 ? primary : secondary, borderRadius: 1 }} />
      ))}
    </span>
  );
}

function getDbeaverPalette(appTheme: ThemeMode) {
  if (appTheme === 'light') {
    return {
      frameBorderColor: '#2f95f3',
      headerBackground: '#f8fbff',
      tableBackground: '#ffffff',
      textColor: '#111827',
      rowDividerColor: '#d7e7f8',
      triggerBackground: '#f5f8fc',
      triggerBorder: '#c9ddf5',
      triggerText: '#55708c',
      popupBackground: '#ffffff',
      popupBorder: '#c9ddf5',
      popupShadow: '0 10px 22px rgba(55, 93, 133, 0.18)',
      indicatorColor: '#0f6cbd',
      mutedColor: '#5f6f82',
      glyphPrimary: '#9dc8f7',
      glyphSecondary: '#4c9ef0',
    };
  }

  if (appTheme === 'deepblue') {
    return {
      frameBorderColor: '#6aaeff',
      headerBackground: '#153a7d',
      tableBackground: '#0f285a',
      textColor: '#e8f1ff',
      rowDividerColor: 'rgba(130, 177, 255, 0.22)',
      triggerBackground: 'rgba(255, 255, 255, 0.06)',
      triggerBorder: 'rgba(130, 177, 255, 0.32)',
      triggerText: '#c6dbff',
      popupBackground: '#102650',
      popupBorder: 'rgba(130, 177, 255, 0.26)',
      popupShadow: '0 12px 28px rgba(4, 15, 40, 0.5)',
      indicatorColor: '#7fb5ff',
      mutedColor: '#b0c7ea',
      glyphPrimary: '#aed2ff',
      glyphSecondary: '#67a8ff',
    };
  }

  return {
    frameBorderColor: '#62a7ff',
    headerBackground: '#182943',
    tableBackground: '#121f33',
    textColor: '#e7eef8',
    rowDividerColor: 'rgba(148, 163, 184, 0.2)',
    triggerBackground: 'rgba(255, 255, 255, 0.04)',
    triggerBorder: 'rgba(96, 165, 250, 0.28)',
    triggerText: '#d0dcef',
    popupBackground: '#111c2e',
    popupBorder: 'rgba(96, 165, 250, 0.25)',
    popupShadow: '0 12px 28px rgba(2, 6, 23, 0.45)',
    indicatorColor: '#79b0ff',
    mutedColor: '#aab9cf',
    glyphPrimary: '#a9d0ff',
    glyphSecondary: '#66a7ff',
  };
}

export default function TableNode({ data }: NodeProps & { data: TableNodeData }) {
  const [openMenu, setOpenMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!openMenu) return;

    const onDocumentPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      const clickedInsideMenu = menuRef.current?.contains(target);
      const clickedTrigger = triggerRef.current?.contains(target);
      if (!clickedInsideMenu && !clickedTrigger) setOpenMenu(false);
    };

    document.addEventListener('pointerdown', onDocumentPointerDown);
    return () => document.removeEventListener('pointerdown', onDocumentPointerDown);
  }, [openMenu]);

  const rowTypeLabel = useMemo(
    () =>
      (rawType: string) =>
        data.typeMode === 'icon' ? (() => {
          const iconMeta = TYPE_INDICATOR_MAP[getTypeIconKey(rawType)];
          const isDbeaver = data.designTheme === 'dbeaver';
          const palette = getDbeaverPalette(data.appTheme);
          return (
            <span
              title={rawType}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                minWidth: isDbeaver ? 22 : 24,
                height: 18,
                borderRadius: isDbeaver ? 2 : 4,
                background: isDbeaver ? 'transparent' : 'color-mix(in srgb, var(--surface) 18%, transparent)',
                border: isDbeaver ? 'none' : '1px solid color-mix(in srgb, var(--text-muted) 30%, transparent)',
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: 0.2,
                padding: isDbeaver ? '0' : '0 4px',
                lineHeight: 1,
                color: isDbeaver ? palette.indicatorColor : iconMeta.color,
              }}
            >
              {iconMeta.label}
            </span>
          );
        })() : rawType,
    [data.appTheme, data.designTheme, data.typeMode],
  );
  const showStrongFocus = data.isFocusedAmbiguousTable;
  const isDbeaver = data.designTheme === 'dbeaver';
  const dbeaverPalette = getDbeaverPalette(data.appTheme);
  const effectiveBg = isDbeaver && data.config.useThemeDefaults ? dbeaverPalette.tableBackground : data.config.bgColor;
  const effectiveText = isDbeaver && data.config.useThemeDefaults ? dbeaverPalette.textColor : data.config.textColor;
  const frameBorderColor = isDbeaver ? dbeaverPalette.frameBorderColor : 'color-mix(in srgb, var(--border) 85%, transparent)';
  const headerBackground = isDbeaver ? dbeaverPalette.headerBackground : effectiveBg;
  const rowDividerColor = isDbeaver ? dbeaverPalette.rowDividerColor : '#33415555';

  return (
    <div
      style={{
        width: TABLE_NODE_WIDTH,
        position: 'relative',
        borderRadius: isDbeaver ? 3 : 12,
        overflow: 'visible',
        border: showStrongFocus
          ? '1px solid rgba(245, 158, 11, 0.92)'
          : data.isAmbiguousTable
            ? '1px solid color-mix(in srgb, #f59e0b 60%, var(--border))'
            : `1px solid ${frameBorderColor}`,
        background: effectiveBg,
        color: effectiveText,
        boxShadow: showStrongFocus
          ? `0 0 0 4px rgba(245, 158, 11, 0.18), inset 0 3px 0 color-mix(in srgb, ${effectiveText} 28%, transparent)`
          : isDbeaver
            ? 'none'
            : `inset 0 3px 0 color-mix(in srgb, ${effectiveText} 28%, transparent)`,
      }}
    >
      <Handle
        id={EDGE_HANDLE_IDS.target.left}
        type="target"
        position={HandlePosition.Left}
        isConnectable={false}
        style={{ ...HIDDEN_HANDLE_STYLE, left: -5 }}
      />
      <Handle
        id={EDGE_HANDLE_IDS.target.right}
        type="target"
        position={HandlePosition.Right}
        isConnectable={false}
        style={{ ...HIDDEN_HANDLE_STYLE, right: -5 }}
      />
      <Handle
        id={EDGE_HANDLE_IDS.target.top}
        type="target"
        position={HandlePosition.Top}
        isConnectable={false}
        style={{ ...HIDDEN_HANDLE_STYLE, top: -5, left: '50%', transform: 'translate(-50%, 0)' }}
      />
      <Handle
        id={EDGE_HANDLE_IDS.target.bottom}
        type="target"
        position={HandlePosition.Bottom}
        isConnectable={false}
        style={{ ...HIDDEN_HANDLE_STYLE, bottom: -5, left: '50%', transform: 'translate(-50%, 0)' }}
      />

      <Handle
        id={EDGE_HANDLE_IDS.source.left}
        type="source"
        position={HandlePosition.Left}
        isConnectable={false}
        style={{ ...HIDDEN_HANDLE_STYLE, left: -5 }}
      />
      <Handle
        id={EDGE_HANDLE_IDS.source.right}
        type="source"
        position={HandlePosition.Right}
        isConnectable={false}
        style={{ ...HIDDEN_HANDLE_STYLE, right: -5 }}
      />
      <Handle
        id={EDGE_HANDLE_IDS.source.top}
        type="source"
        position={HandlePosition.Top}
        isConnectable={false}
        style={{ ...HIDDEN_HANDLE_STYLE, top: -5, left: '50%', transform: 'translate(-50%, 0)' }}
      />
      <Handle
        id={EDGE_HANDLE_IDS.source.bottom}
        type="source"
        position={HandlePosition.Bottom}
        isConnectable={false}
        style={{ ...HIDDEN_HANDLE_STYLE, bottom: -5, left: '50%', transform: 'translate(-50%, 0)' }}
      />

      <div style={{ borderRadius: isDbeaver ? 3 : 12, overflow: 'hidden' }}>
        <div
          style={{
            padding: isDbeaver ? '7px 10px' : '10px 12px',
            borderBottom: isDbeaver ? `1px solid ${frameBorderColor}` : '1px solid #47556955',
            background: headerBackground,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
              {isDbeaver && <HeaderTableGlyph primary={dbeaverPalette.glyphPrimary} secondary={dbeaverPalette.glyphSecondary} />}
              <strong
                style={{
                  fontSize: isDbeaver ? 13 : 14,
                  minWidth: 0,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  fontWeight: isDbeaver ? 600 : 700,
                }}
              >
                {data.table.name}
              </strong>
              {data.isAmbiguousTable && (
                <span
                  title="Esta tabla participa en una referencia ambigua"
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: '#fbbf24',
                    background: 'rgba(245, 158, 11, 0.12)',
                    border: '1px solid rgba(245, 158, 11, 0.28)',
                    borderRadius: 999,
                    padding: '3px 8px',
                    flexShrink: 0,
                    letterSpacing: 0.2,
                  }}
                >
                  AMBIGUA
                </span>
              )}
            </div>
            <button
              ref={triggerRef}
              className="btn btn-icon btn-sm"
              onClick={() => setOpenMenu((s) => !s)}
              style={{
                cursor: 'pointer',
                background: isDbeaver ? dbeaverPalette.triggerBackground : undefined,
                borderColor: isDbeaver ? dbeaverPalette.triggerBorder : undefined,
                color: isDbeaver ? dbeaverPalette.triggerText : undefined,
              }}
              title="Opciones de tabla"
            >
              <MoreHorizontal size={14} />
            </button>
          </div>
        </div>

        <div>
          {data.table.columns.map((column) => {
            const columnKey = `${data.table.key}.${column.name.toLowerCase()}`;
            const isActive = data.activeColumns.has(columnKey);
            const isAmbiguous = data.ambiguousColumns.has(columnKey);
            const isFocusedAmbiguous = data.focusedAmbiguousColumns.has(columnKey);
            return (
              <button
                key={column.name}
                style={{
                  width: '100%',
                  border: 'none',
                  borderBottom: `1px solid ${rowDividerColor}`,
                  background: isActive
                    ? 'color-mix(in srgb, #38bdf8 22%, transparent)'
                    : isFocusedAmbiguous
                      ? 'color-mix(in srgb, #f59e0b 28%, transparent)'
                    : isAmbiguous
                      ? 'color-mix(in srgb, #f59e0b 16%, transparent)'
                      : 'transparent',
                  color: 'inherit',
                  textAlign: 'left',
                  display: 'grid',
                  gridTemplateColumns: 'auto 1fr auto',
                  gap: 8,
                  alignItems: 'center',
                  padding: isDbeaver ? '6px 10px' : '7px 10px',
                  cursor: column.isPrimary || column.isForeign ? 'pointer' : 'inherit',
                  boxShadow: isFocusedAmbiguous
                    ? 'inset 3px 0 0 rgba(245, 158, 11, 0.92)'
                    : isAmbiguous
                      ? 'inset 2px 0 0 rgba(245, 158, 11, 0.7)'
                      : undefined,
                }}
                onClick={() => {
                  if (column.isPrimary) data.onColumnSelect(data.table.key, column.name, 'pk');
                  else if (column.isForeign) data.onColumnSelect(data.table.key, column.name, 'fk');
                }}
              >
                <span
                  style={
                    isDbeaver
                      ? {
                          fontSize: 10,
                          fontWeight: 700,
                          color: column.isPrimary ? dbeaverPalette.indicatorColor : column.isForeign ? dbeaverPalette.indicatorColor : dbeaverPalette.mutedColor,
                          minWidth: 28,
                          letterSpacing: 0.2,
                        }
                      : {
                          ...badgeStyles(column.isPrimary, column.isForeign, data.designTheme),
                          fontSize: 10,
                          borderRadius: 999,
                          padding: '3px 8px',
                          fontWeight: 700,
                          letterSpacing: 0.2,
                        }
                  }
                  >
                   {column.isPrimary ? 'PK' : column.isForeign ? 'FK' : 'COL'}
                </span>
                <span style={{ fontSize: 12, fontWeight: column.isPrimary && isDbeaver ? 700 : 500 }}>{column.name}</span>
                <small style={{ opacity: 0.92, fontSize: 11, display: 'inline-flex', alignItems: 'center' }}>{rowTypeLabel(column.rawType)}</small>
              </button>
            );
          })}
        </div>
      </div>

      {openMenu && (
        <div
          ref={menuRef}
          className="overlay-panel"
          style={{
            position: 'absolute',
            top: 42,
            right: 8,
            width: 210,
            border: isDbeaver ? `1px solid ${dbeaverPalette.popupBorder}` : '1px solid var(--border)',
            borderRadius: 14,
            padding: 10,
            background: isDbeaver ? dbeaverPalette.popupBackground : 'color-mix(in srgb, var(--surface) 96%, transparent)',
            color: isDbeaver ? dbeaverPalette.textColor : 'var(--text)',
            display: 'grid',
            gap: 8,
            boxShadow: isDbeaver ? dbeaverPalette.popupShadow : '0 14px 26px rgba(2, 6, 23, 0.25)',
            zIndex: 80,
          }}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="compact-icon-row">
            <label
              className="btn btn-subtle btn-icon btn-sm compact-icon-btn compact-color-button"
              title="Cambiar color de fondo"
              aria-label="Cambiar color de fondo"
              style={{ ['--swatch-color' as string]: data.config.bgColor }}
            >
              <Palette size={14} />
              <input
                type="color"
                value={data.config.bgColor}
                className="compact-color-input"
                onChange={(event) =>
                  data.onTableStyleChange(data.table.key, { bgColor: event.target.value, useThemeDefaults: false })
                }
              />
            </label>

            <label
              className="btn btn-subtle btn-icon btn-sm compact-icon-btn compact-color-button"
              title="Cambiar color del texto"
              aria-label="Cambiar color del texto"
              style={{ ['--swatch-color' as string]: data.config.textColor }}
            >
              <Type size={14} />
              <input
                type="color"
                value={data.config.textColor}
                className="compact-color-input"
                onChange={(event) =>
                  data.onTableStyleChange(data.table.key, { textColor: event.target.value, useThemeDefaults: false })
                }
              />
            </label>

            <button
              className="btn btn-subtle btn-icon btn-sm compact-icon-btn"
              onClick={() => {
                data.onPreview(data.table.key);
                setOpenMenu(false);
              }}
              title="Previsualizar tabla"
              aria-label="Previsualizar tabla"
            >
              <Eye size={14} />
            </button>

            <button
              className="btn btn-subtle btn-icon btn-sm compact-icon-btn"
              onClick={() => {
                data.onGoToSql(data.table.lineStart);
                setOpenMenu(false);
              }}
              title="Ir al SQL de la tabla"
              aria-label="Ir al SQL de la tabla"
            >
              <Link2 size={14} />
            </button>
          </div>

          <div className="compact-detail-row">
            <span className="compact-color-chip" title={`Color de fondo actual: ${data.config.bgColor}`}>
              <span className="compact-color-chip__swatch" style={{ background: data.config.bgColor }} />
              Fondo
            </span>
            <span className="compact-color-chip" title={`Color de texto actual: ${data.config.textColor}`}>
              <span className="compact-color-chip__swatch" style={{ background: data.config.textColor }} />
              Texto
            </span>
            <button
              className="btn btn-ghost btn-icon btn-sm compact-icon-btn"
              onClick={() => data.onTableStyleChange(data.table.key, { useThemeDefaults: true })}
              title="Restablecer colores según el tema"
              aria-label="Restablecer colores según el tema"
            >
              <RotateCcw size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
