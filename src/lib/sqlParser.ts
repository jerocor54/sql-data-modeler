import type { AmbiguousReference, ColumnModel, Dialect, ParseResult, Relationship, TableModel } from '../types/erd';

interface Segment {
  text: string;
  offset: number;
}

interface TableBlock {
  tableName: string;
  body: string;
  startIndex: number;
  bodyStartIndex: number;
}

interface AlterTableConstraint {
  tableName: string;
  constraintName?: string;
  type: 'primary' | 'foreign' | 'unique';
  sourceColumns: string[];
  targetTable?: string;
  targetColumns: string[];
}

const CONSTRAINT_TOKENS = ['constraint', 'not', 'null', 'default', 'primary', 'references', 'unique', 'check'];

function normalizeIdentifier(value: string): string {
  return value
    .trim()
    .replace(/[`,]/g, '')
    .replace(/^"|"$/g, '')
    .replace(/^\[(.*)\]$/, '$1')
    .replace(/^'(.*)'$/, '$1')
    .toLowerCase();
}

function displayIdentifier(value: string): string {
  return value.trim().replace(/[`,]/g, '').replace(/^"|"$/g, '').replace(/^\[(.*)\]$/, '$1');
}

function unqualifiedIdentifier(value: string): string {
  const normalized = normalizeIdentifier(value);
  const parts = normalized.split('.').filter(Boolean);
  return parts[parts.length - 1] ?? normalized;
}

function countLinesBefore(text: string, index: number): number {
  return text.slice(0, index).split('\n').length;
}

function splitTopLevelByComma(input: string): Segment[] {
  const result: Segment[] = [];
  let start = 0;
  let depthParen = 0;
  let depthBrackets = 0;
  let inSingle = false;
  let inDouble = false;

  for (let i = 0; i < input.length; i += 1) {
    const c = input[i];

    if (c === "'" && !inDouble) {
      inSingle = !inSingle;
      continue;
    }

    if (c === '"' && !inSingle) {
      inDouble = !inDouble;
      continue;
    }

    if (inSingle || inDouble) continue;

    if (c === '(') depthParen += 1;
    else if (c === ')') depthParen = Math.max(0, depthParen - 1);
    else if (c === '[') depthBrackets += 1;
    else if (c === ']') depthBrackets = Math.max(0, depthBrackets - 1);

    if (c === ',' && depthParen === 0 && depthBrackets === 0) {
      const piece = input.slice(start, i).trim();
      if (piece) result.push({ text: piece, offset: start });
      start = i + 1;
    }
  }

  const tail = input.slice(start).trim();
  if (tail) result.push({ text: tail, offset: start });

  return result;
}

function removeComments(sql: string): string {
  const preserveLength = (match: string) => match.replace(/[^\n\r]/g, ' ');

  return sql
    .replace(/\/\*[\s\S]*?\*\//g, preserveLength)
    .replace(/--.*$/gm, preserveLength);
}

function extractTableBlocks(sql: string): TableBlock[] {
  const blocks: TableBlock[] = [];
  const source = removeComments(sql);
  const lower = source.toLowerCase();
  let index = 0;

  while (index < lower.length) {
    const createPos = lower.indexOf('create table', index);
    if (createPos < 0) break;

    const afterCreate = source.slice(createPos);
    const nameMatch = afterCreate.match(/^create\s+table\s+(if\s+not\s+exists\s+)?([^\s(]+)\s*\(/i);

    if (!nameMatch) {
      index = createPos + 11;
      continue;
    }

    const rawTableName = nameMatch[2];
    const openParenPos = createPos + nameMatch[0].lastIndexOf('(');

    let depth = 0;
    let closeParenPos = -1;
    let inSingle = false;
    let inDouble = false;

    for (let i = openParenPos; i < source.length; i += 1) {
      const char = source[i];

      if (char === "'" && !inDouble) inSingle = !inSingle;
      if (char === '"' && !inSingle) inDouble = !inDouble;
      if (inSingle || inDouble) continue;

      if (char === '(') depth += 1;
      if (char === ')') {
        depth -= 1;
        if (depth === 0) {
          closeParenPos = i;
          break;
        }
      }
    }

    if (closeParenPos < 0) {
      index = openParenPos + 1;
      continue;
    }

    blocks.push({
      tableName: displayIdentifier(rawTableName),
      body: source.slice(openParenPos + 1, closeParenPos),
      startIndex: createPos,
      bodyStartIndex: openParenPos + 1,
    });

    index = closeParenPos + 1;
  }

  return blocks;
}

function extractAlterTableConstraints(sql: string): AlterTableConstraint[] {
  const source = removeComments(sql);
  const constraints: AlterTableConstraint[] = [];

  const primaryKeyRegex = /alter\s+table\s+([^\s;]+)\s+add\s+(?:constraint\s+(\S+)\s+)?primary\s+key\s*\(([^)]+)\)/gi;
  const foreignKeyRegex = /alter\s+table\s+([^\s;]+)\s+add\s+(?:constraint\s+(\S+)\s+)?foreign\s+key\s*\(([^)]+)\)\s+references\s+([^\s(,;]+)(?:\s*\(([^)]+)\))?/gi;
  const uniqueRegex = /alter\s+table\s+([^\s;]+)\s+add\s+(?:constraint\s+(\S+)\s+)?unique\s*\(([^)]+)\)/gi;

  for (const match of source.matchAll(primaryKeyRegex)) {
    constraints.push({
      tableName: displayIdentifier(match[1]),
      constraintName: match[2],
      type: 'primary',
      sourceColumns: parseColumnIdentifierList(match[3]),
      targetColumns: [],
    });
  }

  for (const match of source.matchAll(foreignKeyRegex)) {
    constraints.push({
      tableName: displayIdentifier(match[1]),
      constraintName: match[2],
      type: 'foreign',
      sourceColumns: parseColumnIdentifierList(match[3]),
      targetTable: displayIdentifier(match[4]),
      targetColumns: match[5] ? parseColumnIdentifierList(match[5]) : [],
    });
  }

  for (const match of source.matchAll(uniqueRegex)) {
    constraints.push({
      tableName: displayIdentifier(match[1]),
      constraintName: match[2],
      type: 'unique',
      sourceColumns: parseColumnIdentifierList(match[3]),
      targetColumns: [],
    });
  }

  return constraints;
}

function extractColumnType(rest: string): string {
  const tokens = rest.trim().split(/\s+/);
  const selected: string[] = [];

  for (const token of tokens) {
    if (CONSTRAINT_TOKENS.includes(token.toLowerCase())) break;
    selected.push(token);
  }

  return selected.join(' ') || 'UNKNOWN';
}

function parseColumnIdentifierList(content: string): string[] {
  return content
    .split(',')
    .map((c) => displayIdentifier(c.trim()))
    .filter(Boolean);
}

function makeRelationshipId(rel: Relationship, idx: number): string {
  return `${rel.sourceTable}.${normalizeIdentifier(rel.sourceColumn)}->${rel.targetTable}.${normalizeIdentifier(rel.targetColumn || 'pk')}-${idx}`;
}

export function parseSqlToModel(sql: string, _dialect: Dialect): ParseResult {
  const tables: TableModel[] = [];
  const relationships: Relationship[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];
  const ambiguousReferences: AmbiguousReference[] = [];
  const blocks = extractTableBlocks(sql);

  for (const block of blocks) {
    const tableKey = normalizeIdentifier(block.tableName);
    const tableLine = countLinesBefore(sql, block.startIndex);
    const segments = splitTopLevelByComma(block.body);
    const columns: ColumnModel[] = [];

    const columnByKey = new Map<string, ColumnModel>();

    for (const segment of segments) {
      const text = segment.text.trim();
      const segmentLower = text.toLowerCase();
      const line = countLinesBefore(sql, block.bodyStartIndex + segment.offset);

      if (/^(constraint\s+\S+\s+)?primary\s+key/i.test(segmentLower)) {
        const pkMatch = text.match(/primary\s+key\s*\(([^)]+)\)/i);
        if (!pkMatch) continue;
        const columnsRef = parseColumnIdentifierList(pkMatch[1]);
        const isSingleColumnPrimaryKey = columnsRef.length === 1;
        for (const colName of columnsRef) {
          const existing = columnByKey.get(normalizeIdentifier(colName));
          if (existing) {
            existing.isPrimary = true;
            existing.isNullable = false;
            if (isSingleColumnPrimaryKey) existing.isUnique = true;
          }
        }
        continue;
      }

      if (/^(constraint\s+\S+\s+)?unique\s*\(/i.test(segmentLower)) {
        const uniqueMatch = text.match(/unique\s*\(([^)]+)\)/i);
        if (!uniqueMatch) continue;
        const columnsRef = parseColumnIdentifierList(uniqueMatch[1]);
        if (columnsRef.length === 1) {
          const existing = columnByKey.get(normalizeIdentifier(columnsRef[0]));
          if (existing) existing.isUnique = true;
        }
        continue;
      }

      if (/^(constraint\s+\S+\s+)?foreign\s+key/i.test(segmentLower)) {
        const fkMatch = text.match(
          /(?:constraint\s+(\S+)\s+)?foreign\s+key\s*\(([^)]+)\)\s+references\s+([^\s(,]+)(?:\s*\(([^)]+)\))?/i,
        );

        if (!fkMatch) continue;

        const [, constraintName, sourceColsRaw, targetTableRaw, targetColsRaw] = fkMatch;
        const sourceCols = parseColumnIdentifierList(sourceColsRaw);
        const targetCols = targetColsRaw ? parseColumnIdentifierList(targetColsRaw) : [];
        const targetTable = normalizeIdentifier(targetTableRaw);

        sourceCols.forEach((sourceCol, idx) => {
          const targetCol = targetCols[idx] ?? targetCols[0] ?? '';
          relationships.push({
            id: `${tableKey}.${normalizeIdentifier(sourceCol)}->${targetTable}.${normalizeIdentifier(targetCol || 'pk')}-fk-${idx}`,
            sourceTable: tableKey,
            sourceColumn: sourceCol,
            targetTable,
            targetColumn: targetCol,
            constraintName,
          });

          const existing = columnByKey.get(normalizeIdentifier(sourceCol));
          if (existing) existing.isForeign = true;
        });
        continue;
      }

      if (segmentLower.startsWith('constraint ') && !segmentLower.includes('foreign key') && !segmentLower.includes('primary key')) {
        continue;
      }

      const columnMatch = text.match(/^(("[^"]+")|[^\s]+)\s+([\s\S]+)$/);
      if (!columnMatch) {
        continue;
      }

      const rawColumnName = displayIdentifier(columnMatch[1]);
      const rest = columnMatch[3];
      const rawType = extractColumnType(rest);

      const column: ColumnModel = {
        name: rawColumnName,
        rawType,
        isPrimary: /\bprimary\s+key\b/i.test(rest),
        isForeign: /\breferences\b/i.test(rest),
        isNullable: !/\bnot\s+null\b/i.test(rest) && !/\bprimary\s+key\b/i.test(rest),
        isUnique: /\bunique\b/i.test(rest) || /\bprimary\s+key\b/i.test(rest),
        line,
      };

      columns.push(column);
      columnByKey.set(normalizeIdentifier(rawColumnName), column);

      const inlineFk = rest.match(/references\s+([^\s(,]+)(?:\s*\(([^)]+)\))?/i);
      if (inlineFk) {
        const targetTable = normalizeIdentifier(inlineFk[1]);
        const targetCols = inlineFk[2] ? parseColumnIdentifierList(inlineFk[2]) : [];

        if (targetCols.length === 0) {
          relationships.push({
            id: `${tableKey}.${normalizeIdentifier(rawColumnName)}->${targetTable}.pk-inline`,
            sourceTable: tableKey,
            sourceColumn: rawColumnName,
            targetTable,
            targetColumn: '',
          });
        } else {
          targetCols.forEach((targetCol, idx) => {
            relationships.push({
              id: `${tableKey}.${normalizeIdentifier(rawColumnName)}->${targetTable}.${normalizeIdentifier(targetCol)}-inline-${idx}`,
              sourceTable: tableKey,
              sourceColumn: rawColumnName,
              targetTable,
              targetColumn: targetCol,
            });
          });
        }
      }
    }

    tables.push({
      id: tableKey,
      key: tableKey,
      name: block.tableName,
      lineStart: tableLine,
      columns,
    });
  }

  const pkColumnsByTable = new Map<string, string[]>();
  const allColumnsByTable = new Map<string, string[]>();

  for (const table of tables) {
    const pkColumns = table.columns.filter((column) => column.isPrimary).map((column) => column.name);
    pkColumnsByTable.set(table.key, pkColumns);
    allColumnsByTable.set(table.key, table.columns.map((column) => column.name));
  }

  const tableKeys = new Set(tables.map((table) => table.key));
  const tableKeysByUnqualified = new Map<string, string[]>();
  const tableByKey = new Map(tables.map((table) => [table.key, table] as const));

  for (const table of tables) {
    const unqualified = unqualifiedIdentifier(table.key);
    const existing = tableKeysByUnqualified.get(unqualified);
    if (existing) existing.push(table.key);
    else tableKeysByUnqualified.set(unqualified, [table.key]);
  }

  const resolveTableReference = (rawName: string): { tableKey: string; ambiguousMatches: string[] } => {
    const normalized = normalizeIdentifier(rawName);
    if (tableKeys.has(normalized)) {
      return { tableKey: normalized, ambiguousMatches: [] };
    }

    const unqualified = unqualifiedIdentifier(rawName);
    const matches = tableKeysByUnqualified.get(unqualified) ?? [];
    if (matches.length === 1) {
      return { tableKey: matches[0], ambiguousMatches: [] };
    }

    return { tableKey: normalized, ambiguousMatches: matches };
  };

  for (const constraint of extractAlterTableConstraints(sql)) {
    const sourceResolution = resolveTableReference(constraint.tableName);
    const sourceTable = tableByKey.get(sourceResolution.tableKey);
    if (!sourceTable) continue;

    const sourceColumnsByKey = new Map(sourceTable.columns.map((column) => [normalizeIdentifier(column.name), column] as const));

    if (constraint.type === 'primary') {
      const isSingleColumnPrimaryKey = constraint.sourceColumns.length === 1;
      for (const columnName of constraint.sourceColumns) {
        const column = sourceColumnsByKey.get(normalizeIdentifier(columnName));
        if (column) {
          column.isPrimary = true;
          column.isNullable = false;
          if (isSingleColumnPrimaryKey) column.isUnique = true;
        }
      }
      continue;
    }

    if (constraint.type === 'unique') {
      if (constraint.sourceColumns.length === 1) {
        const column = sourceColumnsByKey.get(normalizeIdentifier(constraint.sourceColumns[0]));
        if (column) column.isUnique = true;
      }
      continue;
    }

    const targetTable = normalizeIdentifier(constraint.targetTable ?? '');

    constraint.sourceColumns.forEach((sourceCol, idx) => {
      const column = sourceColumnsByKey.get(normalizeIdentifier(sourceCol));
      if (column) column.isForeign = true;

      const targetCol = constraint.targetColumns[idx] ?? constraint.targetColumns[0] ?? '';
      relationships.push({
        id: `${sourceResolution.tableKey}.${normalizeIdentifier(sourceCol)}->${targetTable}.${normalizeIdentifier(targetCol || 'pk')}-alter-fk-${idx}`,
        sourceTable: sourceResolution.tableKey,
        sourceColumn: sourceCol,
        targetTable,
        targetColumn: targetCol,
        constraintName: constraint.constraintName,
      });
    });
  }

  pkColumnsByTable.clear();
  allColumnsByTable.clear();

  for (const table of tables) {
    const pkColumns = table.columns.filter((column) => column.isPrimary).map((column) => column.name);
    pkColumnsByTable.set(table.key, pkColumns);
    allColumnsByTable.set(table.key, table.columns.map((column) => column.name));
  }

  const ambiguousRelationshipIndexes = new Map<number, string[]>();

  const resolvedRelationships = relationships.map((rel, idx) => {
    const targetResolution = resolveTableReference(rel.targetTable);
    const resolvedTargetTable = targetResolution.tableKey;

    if (targetResolution.ambiguousMatches.length > 1) {
      warnings.push(
        `Referencia ambigua: ${rel.sourceTable}.${rel.sourceColumn} referencia "${rel.targetTable}" y coincide con ${targetResolution.ambiguousMatches.join(', ')}. Calificá el esquema para desambiguar.`,
      );
      ambiguousReferences.push({
        sourceTable: rel.sourceTable,
        sourceColumn: rel.sourceColumn,
        targetTableInput: rel.targetTable,
        candidateTargetTables: targetResolution.ambiguousMatches,
      });
      ambiguousRelationshipIndexes.set(idx, targetResolution.ambiguousMatches);
    }

    let resolvedTargetColumn = rel.targetColumn?.trim() ?? '';

    if (!resolvedTargetColumn) {
      const targetPrimaryKeys = pkColumnsByTable.get(resolvedTargetTable) ?? [];

      if (targetPrimaryKeys.length === 1) {
        resolvedTargetColumn = targetPrimaryKeys[0];
      } else if (targetPrimaryKeys.length > 1) {
        const sameNamePrimary = targetPrimaryKeys.find(
          (pkCol) => normalizeIdentifier(pkCol) === normalizeIdentifier(rel.sourceColumn),
        );
        resolvedTargetColumn = sameNamePrimary ?? targetPrimaryKeys[0];
      } else {
        const targetColumns = allColumnsByTable.get(resolvedTargetTable) ?? [];
        const sameNameColumn = targetColumns.find(
          (columnName) => normalizeIdentifier(columnName) === normalizeIdentifier(rel.sourceColumn),
        );
        resolvedTargetColumn = sameNameColumn ?? rel.sourceColumn;
      }
    }

    const resolved: Relationship = {
      ...rel,
      targetTable: resolvedTargetTable,
      targetColumn: resolvedTargetColumn,
    };

    return {
      ...resolved,
      id: makeRelationshipId(resolved, idx),
    };
  });

  for (const [idx, rel] of resolvedRelationships.entries()) {
    const isAmbiguousTarget = ambiguousRelationshipIndexes.has(idx);

    if (!tableKeys.has(rel.targetTable)) {
      if (!isAmbiguousTarget) {
        errors.push(
          `Relación inválida: ${rel.sourceTable}.${rel.sourceColumn} referencia tabla faltante ${rel.targetTable}`,
        );
      }
    }
    if (!tableKeys.has(rel.sourceTable)) {
      errors.push(`Relación inválida: tabla de origen faltante ${rel.sourceTable}`);
    }

    if (tableKeys.has(rel.targetTable)) {
      const targetColumns = allColumnsByTable.get(rel.targetTable) ?? [];
      const hasTarget = targetColumns.some(
        (columnName) => normalizeIdentifier(columnName) === normalizeIdentifier(rel.targetColumn),
      );

      if (!hasTarget) {
        errors.push(
          `Relación inválida: ${rel.sourceTable}.${rel.sourceColumn} referencia columna faltante ${rel.targetTable}.${rel.targetColumn}`,
        );
      }
    }
  }

  return {
    tables,
    relationships: resolvedRelationships,
    errors,
    warnings,
    ambiguousReferences,
  };
}
