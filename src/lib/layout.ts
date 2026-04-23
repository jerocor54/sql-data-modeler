import dagre from 'dagre';
import type { Position } from '../types/erd';
import type { LayoutGraphRelationship, LayoutGraphTable } from './layoutGraph';
import { TABLE_NODE_WIDTH } from './diagramGeometry';

const MIN_HORIZONTAL_GAP = 72;
const MIN_VERTICAL_GAP = 56;

function isPersistedLayoutCrowded(tables: LayoutGraphTable[], persistedPositions: Record<string, Position>): boolean {
  const positionedTables = tables.filter((table) => persistedPositions[table.key]);
  if (positionedTables.length < 2) return false;

  for (let i = 0; i < positionedTables.length; i += 1) {
    const first = positionedTables[i];
    const firstPos = persistedPositions[first.key];
    const firstHeight = first.height;

    for (let j = i + 1; j < positionedTables.length; j += 1) {
      const second = positionedTables[j];
      const secondPos = persistedPositions[second.key];
      const secondHeight = second.height;

      const overlapX = firstPos.x < secondPos.x + TABLE_NODE_WIDTH && firstPos.x + TABLE_NODE_WIDTH > secondPos.x;
      const overlapY = firstPos.y < secondPos.y + secondHeight && firstPos.y + firstHeight > secondPos.y;

      if (overlapX && overlapY) return true;

      const horizontalGap = overlapX
        ? 0
        : Math.max(secondPos.x - (firstPos.x + TABLE_NODE_WIDTH), firstPos.x - (secondPos.x + TABLE_NODE_WIDTH));
      const verticalGap = overlapY
        ? 0
        : Math.max(secondPos.y - (firstPos.y + firstHeight), firstPos.y - (secondPos.y + secondHeight));

      if (horizontalGap < MIN_HORIZONTAL_GAP && verticalGap < MIN_VERTICAL_GAP) {
        return true;
      }
    }
  }

  return false;
}

export function createAutoLayout(
  tables: LayoutGraphTable[],
  relationships: LayoutGraphRelationship[],
  persistedPositions: Record<string, Position>,
): Record<string, Position> {
  const graph = new dagre.graphlib.Graph();
  graph.setGraph({
    rankdir: 'LR',
    ranksep: 128,
    nodesep: 76,
    edgesep: 42,
    marginx: 44,
    marginy: 44,
    acyclicer: 'greedy',
    ranker: 'network-simplex',
  });
  graph.setDefaultEdgeLabel(() => ({}));

  for (const table of tables) {
    graph.setNode(table.key, {
      width: TABLE_NODE_WIDTH,
      height: table.height,
    });
  }

  for (const rel of relationships) {
    if (graph.hasNode(rel.sourceTable) && graph.hasNode(rel.targetTable)) {
      graph.setEdge(rel.sourceTable, rel.targetTable);
    }
  }

  dagre.layout(graph);

  const positions: Record<string, Position> = {};
  const canUsePersistedLayout = !isPersistedLayoutCrowded(tables, persistedPositions);

  for (const table of tables) {
    if (canUsePersistedLayout && persistedPositions[table.key]) {
      positions[table.key] = persistedPositions[table.key];
      continue;
    }

    const node = graph.node(table.key);
    if (node) {
      positions[table.key] = {
        x: node.x - TABLE_NODE_WIDTH / 2,
        y: node.y - table.height / 2,
      };
    } else {
      positions[table.key] = { x: 120, y: 120 };
    }
  }

  return positions;
}
