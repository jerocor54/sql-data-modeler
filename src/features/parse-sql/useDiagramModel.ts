import { useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';

import type {
  AmbiguousReference,
  ColumnModel,
  Dialect,
  ParseResult,
  Position,
  Relationship,
  RelationshipCardinality,
  TableModel,
} from '../../types/erd';
import { createWorkerJobId } from '../../lib/workers/jobProtocol';
import type { DiagramBenchmarkRunMeta } from '../performance/diagramPerformance';
import ParseSqlWorker from './parseSql.worker?worker';
import { PARSE_SQL_WORKER_KIND, type ParseSqlWorkerRequest, type ParseSqlWorkerResponse } from './parseSqlWorkerProtocol';

export interface DiagramSearchResult {
  id: string;
  kind: 'table' | 'column';
  tableKey: string;
  tableName: string;
  schemaName?: string;
  entityName: string;
  columnName?: string;
  label: string;
  matchText: string;
}

interface UseDiagramModelInput {
  benchmarkRunRevision: number;
  createParseRun: (input: { meta: DiagramBenchmarkRunMeta }) => number;
  dialect: Dialect;
  diagramSearch: string;
  finishParse: (runId: number, parsed: ParseResult) => void;
  pendingBenchmarkMetaRef: MutableRefObject<DiagramBenchmarkRunMeta | null>;
  sqlText: string;
  tablePositions: Record<string, Position>;
}

interface DiagramModelState {
  parseRunId: number | null;
  parsed: ParseResult;
  status: 'pending' | 'ready';
}

const EMPTY_PARSE_RESULT: ParseResult = {
  tables: [],
  relationships: [],
  errors: [],
  warnings: [],
  ambiguousReferences: [],
};

function normalize(value: string): string {
  return value.toLowerCase();
}

function splitQualifiedName(value: string): { schemaName?: string; entityName: string } {
  const parts = value.split('.').filter(Boolean);
  if (parts.length <= 1) return { entityName: value };

  return {
    schemaName: parts.slice(0, -1).join('.'),
    entityName: parts[parts.length - 1],
  };
}

function findTableColumn(table: TableModel | undefined, columnName: string): ColumnModel | undefined {
  if (!table) return undefined;
  const columnKey = normalize(columnName);
  return table.columns.find((column) => normalize(column.name) === columnKey);
}

export function deriveRelationshipCardinality(
  relationship: Relationship,
  tableMap: Map<string, TableModel>,
): RelationshipCardinality {
  const sourceTable = tableMap.get(relationship.sourceTable);
  const sourceColumn = findTableColumn(sourceTable, relationship.sourceColumn);

  return {
    source: {
      min: 0,
      max: sourceColumn?.isUnique ? 'one' : 'many',
    },
    target: {
      min: sourceColumn?.isNullable === false ? 1 : 0,
      max: 'one',
    },
  };
}

export function useDiagramModel({
  benchmarkRunRevision,
  createParseRun,
  dialect,
  diagramSearch,
  finishParse,
  pendingBenchmarkMetaRef,
  sqlText,
  tablePositions,
}: UseDiagramModelInput) {
  const activeJobIdRef = useRef<string | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const [state, setState] = useState<DiagramModelState>({
    parseRunId: null,
    parsed: EMPTY_PARSE_RESULT,
    status: 'pending',
  });

  useEffect(() => {
    workerRef.current?.terminate();
    setState((current) => (current.status === 'pending' ? current : { ...current, status: 'pending' }));

    const meta = pendingBenchmarkMetaRef.current ?? { trigger: 'editor-change' };
    pendingBenchmarkMetaRef.current = null;
    const parseRunId = createParseRun({ meta });
    const jobId = createWorkerJobId(PARSE_SQL_WORKER_KIND, benchmarkRunRevision);
    const worker = new ParseSqlWorker();
    workerRef.current = worker;
    activeJobIdRef.current = jobId;

    worker.onmessage = (event: MessageEvent<ParseSqlWorkerResponse>) => {
      const response = event.data;

      if (response.jobId !== activeJobIdRef.current || response.kind !== PARSE_SQL_WORKER_KIND) return;

      if (response.status === 'success') {
        finishParse(parseRunId, response.result);
        setState({
          parseRunId,
          parsed: response.result,
          status: 'ready',
        });
        return;
      }

      const parsed: ParseResult = {
        ...EMPTY_PARSE_RESULT,
        errors: [response.error.message],
      };

      finishParse(parseRunId, parsed);
      setState({
        parseRunId,
        parsed,
        status: 'ready',
      });
    };

    worker.onerror = () => {
      if (jobId !== activeJobIdRef.current) return;

      const parsed: ParseResult = {
        ...EMPTY_PARSE_RESULT,
        errors: ['Unexpected parser worker failure.'],
      };

      finishParse(parseRunId, parsed);
      setState({
        parseRunId,
        parsed,
        status: 'ready',
      });
    };

    const request: ParseSqlWorkerRequest = {
      kind: PARSE_SQL_WORKER_KIND,
      jobId,
      payload: {
        dialect,
        sqlText,
      },
    };

    worker.postMessage(request);

    return () => {
      if (workerRef.current === worker) workerRef.current = null;
      worker.terminate();
    };
  }, [benchmarkRunRevision, createParseRun, dialect, finishParse, pendingBenchmarkMetaRef, sqlText]);

  const { parsed } = state;

  const tableMap = useMemo(() => new Map(parsed.tables.map((table) => [table.key, table] as const)), [parsed.tables]);

  const ambiguousColumns = useMemo(() => {
    const columns = new Set<string>();
    for (const warning of parsed.ambiguousReferences) {
      columns.add(`${warning.sourceTable}.${normalize(warning.sourceColumn)}`);
    }
    return columns;
  }, [parsed.ambiguousReferences]);

  const ambiguousTableKeys = useMemo(() => {
    const tableKeys = new Set<string>();
    for (const warning of parsed.ambiguousReferences) {
      tableKeys.add(warning.sourceTable);
      for (const candidate of warning.candidateTargetTables) tableKeys.add(candidate);
    }
    return tableKeys;
  }, [parsed.ambiguousReferences]);

  const hasManualLayout = useMemo(
    () => parsed.tables.some((table) => Boolean(tablePositions[table.key])),
    [parsed.tables, tablePositions],
  );

  const diagramSearchResults = useMemo(() => {
    const query = normalize(diagramSearch.trim());
    if (!query) return [] as DiagramSearchResult[];

    const scoredResults: Array<DiagramSearchResult & { score: number }> = [];

    for (const table of parsed.tables) {
      const { schemaName, entityName } = splitQualifiedName(table.name);
      const tableName = normalize(table.name);
      const tableKey = normalize(table.key);
      const tableMatchIndex = Math.min(
        tableName.includes(query) ? tableName.indexOf(query) : Number.POSITIVE_INFINITY,
        tableKey.includes(query) ? tableKey.indexOf(query) : Number.POSITIVE_INFINITY,
      );

      if (tableMatchIndex !== Number.POSITIVE_INFINITY) {
        scoredResults.push({
          id: `table:${table.key}`,
          kind: 'table',
          tableKey: table.key,
          tableName: table.name,
          schemaName,
          entityName,
          label: table.name,
          matchText: 'Tabla',
          score: tableMatchIndex,
        });
      }

      for (const column of table.columns) {
        const columnName = normalize(column.name);
        const columnMatchIndex = columnName.includes(query) ? columnName.indexOf(query) : Number.POSITIVE_INFINITY;
        if (columnMatchIndex === Number.POSITIVE_INFINITY) continue;

        scoredResults.push({
          id: `column:${table.key}:${column.name}`,
          kind: 'column',
          tableKey: table.key,
          tableName: table.name,
          schemaName,
          entityName,
          columnName: column.name,
          label: `${table.name}.${column.name}`,
          matchText: 'Propiedad',
          score: 100 + columnMatchIndex,
        });
      }
    }

    return scoredResults
      .sort((left, right) => left.score - right.score || left.label.localeCompare(right.label))
      .slice(0, 12)
      .map(({ score: _score, ...result }) => result);
  }, [diagramSearch, parsed.tables]);

  return {
    ambiguousColumns,
    ambiguousReferences: parsed.ambiguousReferences as AmbiguousReference[],
    ambiguousTableKeys,
    diagramSearchResults,
    hasManualLayout,
    isReady: state.status === 'ready',
    parseRunId: state.parseRunId,
    parsed,
    tableMap,
  };
}
