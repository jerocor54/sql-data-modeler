import { useEffect, useMemo } from 'react';
import { create } from 'zustand';

interface TableTransientState {
  activeColumnNames: Set<string>;
  ambiguousColumnNames: Set<string>;
  focusedAmbiguousColumnNames: Set<string>;
  isAmbiguousTable: boolean;
  isFocusedAmbiguousTable: boolean;
}

interface DiagramCanvasTransientSnapshot {
  highlightedEdgeIds: Set<string>;
  tableStates: Record<string, TableTransientState>;
}

interface DiagramCanvasTransientStore extends DiagramCanvasTransientSnapshot {
  setSnapshot: (snapshot: DiagramCanvasTransientSnapshot) => void;
}

interface SyncDiagramCanvasTransientStateInput {
  activeColumns: Set<string>;
  ambiguousColumns: Set<string>;
  ambiguousTableKeys: Set<string>;
  focusedAmbiguousColumns: Set<string>;
  focusedAmbiguousTables: Set<string>;
  highlightedEdgeIds: Set<string>;
}

const EMPTY_COLUMN_SET = new Set<string>();
const EMPTY_TABLE_TRANSIENT_STATE: TableTransientState = {
  activeColumnNames: EMPTY_COLUMN_SET,
  ambiguousColumnNames: EMPTY_COLUMN_SET,
  focusedAmbiguousColumnNames: EMPTY_COLUMN_SET,
  isAmbiguousTable: false,
  isFocusedAmbiguousTable: false,
};

function isSetEqual(left: Set<string>, right: Set<string>): boolean {
  if (left === right) return true;
  if (left.size !== right.size) return false;

  for (const value of left) {
    if (!right.has(value)) return false;
  }

  return true;
}

function isTableTransientStateEqual(left: TableTransientState, right: TableTransientState): boolean {
  return (
    left.isAmbiguousTable === right.isAmbiguousTable &&
    left.isFocusedAmbiguousTable === right.isFocusedAmbiguousTable &&
    isSetEqual(left.activeColumnNames, right.activeColumnNames) &&
    isSetEqual(left.ambiguousColumnNames, right.ambiguousColumnNames) &&
    isSetEqual(left.focusedAmbiguousColumnNames, right.focusedAmbiguousColumnNames)
  );
}

function groupColumnKeysByTable(columnKeys: Set<string>): Map<string, Set<string>> {
  const grouped = new Map<string, Set<string>>();

  for (const key of columnKeys) {
    const separatorIndex = key.indexOf('.');
    if (separatorIndex <= 0) continue;

    const tableKey = key.slice(0, separatorIndex);
    const columnName = key.slice(separatorIndex + 1);
    const existing = grouped.get(tableKey);

    if (existing) {
      existing.add(columnName);
      continue;
    }

    grouped.set(tableKey, new Set([columnName]));
  }

  return grouped;
}

function buildTransientSnapshot({
  activeColumns,
  ambiguousColumns,
  ambiguousTableKeys,
  focusedAmbiguousColumns,
  focusedAmbiguousTables,
  highlightedEdgeIds,
}: SyncDiagramCanvasTransientStateInput): DiagramCanvasTransientSnapshot {
  const activeColumnsByTable = groupColumnKeysByTable(activeColumns);
  const ambiguousColumnsByTable = groupColumnKeysByTable(ambiguousColumns);
  const focusedAmbiguousColumnsByTable = groupColumnKeysByTable(focusedAmbiguousColumns);
  const tableKeys = new Set<string>([
    ...activeColumnsByTable.keys(),
    ...ambiguousColumnsByTable.keys(),
    ...focusedAmbiguousColumnsByTable.keys(),
    ...ambiguousTableKeys,
    ...focusedAmbiguousTables,
  ]);

  const tableStates = Object.fromEntries(
    Array.from(tableKeys, (tableKey) => [
      tableKey,
      {
        activeColumnNames: activeColumnsByTable.get(tableKey) ?? EMPTY_COLUMN_SET,
        ambiguousColumnNames: ambiguousColumnsByTable.get(tableKey) ?? EMPTY_COLUMN_SET,
        focusedAmbiguousColumnNames: focusedAmbiguousColumnsByTable.get(tableKey) ?? EMPTY_COLUMN_SET,
        isAmbiguousTable: ambiguousTableKeys.has(tableKey),
        isFocusedAmbiguousTable: focusedAmbiguousTables.has(tableKey),
      } satisfies TableTransientState,
    ]),
  );

  return {
    highlightedEdgeIds,
    tableStates,
  };
}

const useDiagramCanvasTransientStore = create<DiagramCanvasTransientStore>((set) => ({
  highlightedEdgeIds: EMPTY_COLUMN_SET,
  tableStates: {},
  setSnapshot: (snapshot) => {
    set((current) => {
      const nextTableStates: Record<string, TableTransientState> = {};
      let tableStatesChanged = Object.keys(current.tableStates).length !== Object.keys(snapshot.tableStates).length;

      for (const [tableKey, nextTableState] of Object.entries(snapshot.tableStates)) {
        const previousTableState = current.tableStates[tableKey];

        if (previousTableState && isTableTransientStateEqual(previousTableState, nextTableState)) {
          nextTableStates[tableKey] = previousTableState;
          continue;
        }

        tableStatesChanged = true;
        nextTableStates[tableKey] = nextTableState;
      }

      const nextHighlightedEdgeIds = isSetEqual(current.highlightedEdgeIds, snapshot.highlightedEdgeIds)
        ? current.highlightedEdgeIds
        : snapshot.highlightedEdgeIds;

      if (!tableStatesChanged && nextHighlightedEdgeIds === current.highlightedEdgeIds) return current;

      return {
        highlightedEdgeIds: nextHighlightedEdgeIds,
        tableStates: tableStatesChanged ? nextTableStates : current.tableStates,
      };
    });
  },
}));

export function useSyncDiagramCanvasTransientState(input: SyncDiagramCanvasTransientStateInput) {
  const setSnapshot = useDiagramCanvasTransientStore((state) => state.setSnapshot);
  const snapshot = useMemo(
    () => buildTransientSnapshot(input),
    [
      input.activeColumns,
      input.ambiguousColumns,
      input.ambiguousTableKeys,
      input.focusedAmbiguousColumns,
      input.focusedAmbiguousTables,
      input.highlightedEdgeIds,
    ],
  );

  useEffect(() => {
    setSnapshot(snapshot);
  }, [setSnapshot, snapshot]);
}

export function useDiagramTableTransientState(tableKey: string): TableTransientState {
  return useDiagramCanvasTransientStore((state) => state.tableStates[tableKey] ?? EMPTY_TABLE_TRANSIENT_STATE);
}

export function useDiagramEdgeHighlighted(edgeId: string): boolean {
  return useDiagramCanvasTransientStore((state) => state.highlightedEdgeIds.has(edgeId));
}
