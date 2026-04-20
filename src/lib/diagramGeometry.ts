import type { TableModel } from '../types/erd';

export const TABLE_NODE_WIDTH = 300;

export function getTableNodeHeight(table: TableModel): number {
  return 56 + table.columns.length * 28;
}
