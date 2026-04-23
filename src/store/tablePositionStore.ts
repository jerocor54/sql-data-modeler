import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';

import type { Position } from '../types/erd';

export interface TablePositionState {
  tablePositions: Record<string, Position>;
  setTablePosition: (tableKey: string, position: Position) => void;
  resetTablePositions: () => void;
  replaceTablePositions: (tablePositions: Record<string, Position>) => void;
}

function arePositionsEqual(left?: Position, right?: Position): boolean {
  return left?.x === right?.x && left?.y === right?.y;
}

function areTablePositionMapsEqual(left: Record<string, Position>, right: Record<string, Position>): boolean {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);

  if (leftKeys.length !== rightKeys.length) return false;

  return leftKeys.every((key) => arePositionsEqual(left[key], right[key]));
}

export const useTablePositionStore = create<TablePositionState>()((set) => ({
  tablePositions: {},
  setTablePosition: (tableKey, position) =>
    set((state) => {
      const current = state.tablePositions[tableKey];
      if (arePositionsEqual(current, position)) return state;

      return {
        tablePositions: {
          ...state.tablePositions,
          [tableKey]: position,
        },
      };
    }),
  resetTablePositions: () =>
    set((state) => {
      if (Object.keys(state.tablePositions).length === 0) return state;
      return { tablePositions: {} };
    }),
  replaceTablePositions: (tablePositions) =>
    set((state) => {
      if (areTablePositionMapsEqual(state.tablePositions, tablePositions)) return state;
      return { tablePositions };
    }),
}));

export function useTablePositionStoreState() {
  return useTablePositionStore(
    useShallow((state) => ({
      tablePositions: state.tablePositions,
      setTablePosition: state.setTablePosition,
      resetTablePositions: state.resetTablePositions,
      replaceTablePositions: state.replaceTablePositions,
    })),
  );
}
