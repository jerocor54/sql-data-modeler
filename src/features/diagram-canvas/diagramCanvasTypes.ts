import type { TableDesignTheme, TableModel, TableVisualConfig, ThemeMode, TypeDisplayMode } from '../../types/erd';

export interface TableNodeData {
  table: TableModel;
  config: TableVisualConfig;
  appTheme: ThemeMode;
  designTheme: TableDesignTheme;
  typeMode: TypeDisplayMode;
  onColumnSelect: (tableKey: string, columnName: string, kind: 'pk' | 'fk') => void;
  onGoToSql: (line: number) => void;
  onPreview: (tableKey: string) => void;
  onTableStyleChange: (tableKey: string, patch: Partial<TableVisualConfig>) => void;
}

export interface DiagramBounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface RoutedEdgeData {
  path?: string;
  points?: Array<{ x: number; y: number }>;
  labelX?: number;
  labelY?: number;
  showLabel?: boolean;
  cardinality?: {
    source: { min: 0 | 1; max: 'one' | 'many' };
    target: { min: 0 | 1; max: 'one' | 'many' };
  };
}
