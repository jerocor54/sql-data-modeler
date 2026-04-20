export type Dialect = 'auto' | 'postgresql' | 'oracle';

export type TypeDisplayMode = 'icon' | 'text';
export type ViewMode = 'split' | 'tabs';
export type ViewTab = 'editor' | 'diagram';

export type RelationLineStyle = 'orthogonal' | 'curved' | 'straight';
export type RelationLinePattern = 'solid' | 'dashed';
export type RelationGroupingMode = 'bundled' | 'separate';
export type TableDesignTheme = 'modern' | 'dbeaver';

export type ThemeMode = 'light' | 'dark' | 'deepblue';

export interface ColumnModel {
  name: string;
  rawType: string;
  isPrimary: boolean;
  isForeign: boolean;
  isNullable: boolean;
  isUnique: boolean;
  line: number;
}

export interface TableModel {
  id: string;
  key: string;
  name: string;
  lineStart: number;
  columns: ColumnModel[];
}

export interface Relationship {
  id: string;
  sourceTable: string;
  sourceColumn: string;
  targetTable: string;
  targetColumn: string;
  constraintName?: string;
}

export type RelationshipEndpointMin = 0 | 1;
export type RelationshipEndpointMax = 'one' | 'many';

export interface RelationshipEndpointCardinality {
  min: RelationshipEndpointMin;
  max: RelationshipEndpointMax;
}

export interface RelationshipCardinality {
  source: RelationshipEndpointCardinality;
  target: RelationshipEndpointCardinality;
}

export interface AmbiguousReference {
  sourceTable: string;
  sourceColumn: string;
  targetTableInput: string;
  candidateTargetTables: string[];
}

export interface ParseResult {
  tables: TableModel[];
  relationships: Relationship[];
  errors: string[];
  warnings: string[];
  ambiguousReferences: AmbiguousReference[];
}

export interface TableVisualConfig {
  bgColor: string;
  textColor: string;
  useThemeDefaults?: boolean;
}

export interface Position {
  x: number;
  y: number;
}

export interface DiagramViewport extends Position {
  zoom: number;
}
