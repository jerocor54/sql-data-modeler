import type { TableModel } from '../types/erd';

export const TABLE_NODE_WIDTH = 300;

export function getTableHeightFromColumnCount(columnCount: number): number {
  return 56 + columnCount * 28;
}

export function getTableNodeHeight(table: TableModel): number {
  return getTableHeightFromColumnCount(table.columns.length);
}
