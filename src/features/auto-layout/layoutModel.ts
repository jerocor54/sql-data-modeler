import { getTableHeightFromColumnCount } from '../../lib/diagramGeometry';
import type { LayoutGraphModel, LayoutGraphRelationship, LayoutGraphTable } from '../../lib/layoutGraph';
import type { DiagramViewport, ParseResult, Position } from '../../types/erd';

type PersistedLayoutCandidate = Position | DiagramViewport | null | undefined;

function isFiniteCoordinate(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isPersistedLayoutPosition(value: PersistedLayoutCandidate): value is Position {
  if (!value || typeof value !== 'object') return false;
  if ('zoom' in value) return false;

  return isFiniteCoordinate(value.x) && isFiniteCoordinate(value.y);
}

export function sanitizePersistedPositions(
  tableKeys: Iterable<string>,
  persistedPositions: Record<string, PersistedLayoutCandidate>,
): Record<string, Position> {
  const sanitized: Record<string, Position> = {};

  for (const tableKey of tableKeys) {
    const position = persistedPositions[tableKey];
    if (!isPersistedLayoutPosition(position)) continue;

    sanitized[tableKey] = {
      x: position.x,
      y: position.y,
    };
  }

  return sanitized;
}

function projectLayoutTables(parsed: ParseResult): LayoutGraphTable[] {
  return parsed.tables.map((table) => ({
    key: table.key,
    height: getTableHeightFromColumnCount(table.columns.length),
  }));
}

function projectLayoutRelationships(parsed: ParseResult, tableKeys: Set<string>): LayoutGraphRelationship[] {
  return parsed.relationships
    .filter((relationship) => tableKeys.has(relationship.sourceTable) && tableKeys.has(relationship.targetTable))
    .map((relationship) => ({
      id: relationship.id,
      sourceTable: relationship.sourceTable,
      targetTable: relationship.targetTable,
    }));
}

export function createLayoutGraphModel(
  parsed: ParseResult,
  persistedPositions: Record<string, PersistedLayoutCandidate>,
): LayoutGraphModel {
  const tables = projectLayoutTables(parsed);
  const tableKeys = new Set(tables.map((table) => table.key));

  return {
    tables,
    relationships: projectLayoutRelationships(parsed, tableKeys),
    persistedPositions: sanitizePersistedPositions(tableKeys, persistedPositions),
  };
}
