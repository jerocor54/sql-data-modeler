import { resolveHandlePair, type EdgeSide } from './edgeRouting';
import { getTableNodeHeight, TABLE_NODE_WIDTH } from './diagramGeometry';
import { createAutoLayout } from './layout';
import type { Position, RelationGroupingMode, Relationship, TableModel } from '../types/erd';

type ElkConstructor = new () => {
  layout: (graph: unknown) => Promise<unknown>;
};

type ElkPortSide = EdgeSide;

interface ElkChildNode {
  id: string;
  x?: number;
  y?: number;
}

interface ElkEdgeSection {
  startPoint?: Position;
  bendPoints?: Position[];
  endPoint?: Position;
  outgoingShape?: string;
  incomingShape?: string;
}

interface ElkEdgeResult {
  id: string;
  sources?: string[];
  targets?: string[];
  sections?: ElkEdgeSection[];
}

interface ParsedElkLayout {
  children?: ElkChildNode[];
  edges?: ElkEdgeResult[];
}

interface EdgeDockingPlan {
  sourceSide: ElkPortSide;
  targetSide: ElkPortSide;
  sourcePortId: string;
  targetPortId: string;
  sourceBundleId?: string;
  targetBundleId?: string;
}

interface DockingCandidate {
  relationship: Relationship;
  sourceCenter: Position;
  targetCenter: Position;
  sourceHeight: number;
  targetHeight: number;
  priority: number;
}

export interface ElkEdgePath {
  id: string;
  sourceHandle?: string;
  targetHandle?: string;
  points: Position[];
}

export interface ElkLayoutResult {
  positions: Record<string, Position>;
  edgePaths: Record<string, ElkEdgePath>;
}

export interface LayoutPreferences {
  relationGrouping?: RelationGroupingMode;
}

interface LayerPlacementItem {
  key: string;
  height: number;
  x: number;
  y: number;
}

interface LayerCluster {
  centerX: number;
  items: LayerPlacementItem[];
}

interface PackedLayerItem {
  key: string;
  height: number;
  y: number;
  centerY: number;
}

interface PackedLayerPlacement {
  layerIndex: number;
  originalCenterY: number;
  packedCenterY: number;
  nextX: number;
  packedItems: PackedLayerItem[];
}

interface LayerConnection {
  sourceLayerIndex: number;
  targetLayerIndex: number;
  sourceOffsetY: number;
  targetOffsetY: number;
  weight: number;
}

interface LayerRelaxationStats {
  crossEdgeCount: number;
  adjacentEdgeCount: number;
}

let elkLoaderPromise: Promise<InstanceType<ElkConstructor>> | null = null;

const POSITION_GRID = 12;
const LAYER_CLUSTER_THRESHOLD = 42;
const DEFAULT_HORIZONTAL_CORRIDOR = 180;
const DEFAULT_VERTICAL_CORRIDOR = 84;
const LAYER_CENTER_ALIGNMENT_BLEND = 0.32;
const LAYER_CENTER_RELAXATION_ITERATIONS = 18;
const ISOLATED_TABLE_HORIZONTAL_GAP = 96;
const ISOLATED_TABLE_VERTICAL_GAP = 72;
const ISOLATED_TABLE_COLUMN_HEIGHT_PADDING = 144;

async function getElkInstance(): Promise<InstanceType<ElkConstructor>> {
  if (!elkLoaderPromise) {
    elkLoaderPromise = import('elkjs/lib/elk.bundled.js').then((module) => {
      const ELK = module.default as ElkConstructor;
      return new ELK();
    });
  }

  return elkLoaderPromise;
}

function parseLayout(layout: unknown): ParsedElkLayout {
  return layout as ParsedElkLayout;
}

function portId(tableKey: string, side: ElkPortSide, edgeId: string, role: 'source' | 'target'): string {
  return `${tableKey}::${side}::${role}::${edgeId}`;
}

function parsePortSide(value?: string): ElkPortSide | null {
  if (!value) return null;
  const parts = value.split('::');
  const side = parts[1] ?? parts[parts.length - 1];
  if (side === 'left' || side === 'right' || side === 'top' || side === 'bottom') return side;
  return null;
}

function sideToSourceHandle(side: ElkPortSide): string {
  return `source-${side}`;
}

function sideToTargetHandle(side: ElkPortSide): string {
  return `target-${side}`;
}

function normalizePoints(section: ElkEdgeSection): Position[] {
  const points: Position[] = [];
  if (section.startPoint) points.push(section.startPoint);
  if (section.bendPoints?.length) points.push(...section.bendPoints);
  if (section.endPoint) points.push(section.endPoint);

  return points.filter((point, index, arr) => {
    if (index === 0) return true;
    const previous = arr[index - 1];
    return Math.abs(previous.x - point.x) > 0.01 || Math.abs(previous.y - point.y) > 0.01;
  });
}

function getPositionsFromChildren(children?: ElkChildNode[]): Record<string, Position> {
  const positions: Record<string, Position> = {};

  for (const child of children ?? []) {
    positions[child.id] = {
      x: child.x ?? 0,
      y: child.y ?? 0,
    };
  }

  return positions;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function snapToGrid(value: number, grid = POSITION_GRID): number {
  return Math.round(value / grid) * grid;
}

function median(values: number[], fallback: number): number {
  if (values.length === 0) return fallback;

  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);

  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

function blendTowards(value: number, target: number, weight: number): number {
  return value + (target - value) * weight;
}

interface LayoutBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  width: number;
  height: number;
  centerY: number;
}

function getAnchorSpread(values: Array<{ value: number }>): number {
  if (values.length <= 1) return 0;

  let min = values[0].value;
  let max = values[0].value;

  for (const entry of values) {
    if (entry.value < min) min = entry.value;
    if (entry.value > max) max = entry.value;
  }

  return max - min;
}

function clusterLayers(items: LayerPlacementItem[]): LayerCluster[] {
  const ordered = [...items].sort((left, right) => left.x - right.x || left.y - right.y || left.key.localeCompare(right.key));
  const layers: LayerCluster[] = [];

  for (const item of ordered) {
    const current = layers[layers.length - 1];
    if (!current || Math.abs(item.x - current.centerX) > LAYER_CLUSTER_THRESHOLD) {
      layers.push({
        centerX: item.x,
        items: [item],
      });
      continue;
    }

    current.items.push(item);
    current.centerX = current.items.reduce((sum, entry) => sum + entry.x, 0) / current.items.length;
  }

  return layers;
}

function getLayoutBounds(tables: TableModel[], positions: Record<string, Position>): LayoutBounds | null {
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const table of tables) {
    const position = positions[table.key];
    if (!position) continue;

    const tableHeight = getTableNodeHeight(table);
    minX = Math.min(minX, position.x);
    maxX = Math.max(maxX, position.x + TABLE_NODE_WIDTH);
    minY = Math.min(minY, position.y);
    maxY = Math.max(maxY, position.y + tableHeight);
  }

  if (!Number.isFinite(minX) || !Number.isFinite(maxX) || !Number.isFinite(minY) || !Number.isFinite(maxY)) {
    return null;
  }

  return {
    minX,
    maxX,
    minY,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
    centerY: (minY + maxY) / 2,
  };
}

function compactIsolatedTables(
  tables: TableModel[],
  relationships: Relationship[],
  rawPositions: Record<string, Position>,
): Record<string, Position> {
  if (tables.length <= 1) return rawPositions;

  const degreeByKey = new Map<string, number>(tables.map((table) => [table.key, 0]));
  for (const relationship of relationships) {
    degreeByKey.set(relationship.sourceTable, (degreeByKey.get(relationship.sourceTable) ?? 0) + 1);
    degreeByKey.set(relationship.targetTable, (degreeByKey.get(relationship.targetTable) ?? 0) + 1);
  }

  const isolatedTables = tables
    .filter((table) => (degreeByKey.get(table.key) ?? 0) === 0 && rawPositions[table.key])
    .sort((left, right) => {
      const leftPosition = rawPositions[left.key];
      const rightPosition = rawPositions[right.key];
      return leftPosition.y - rightPosition.y || leftPosition.x - rightPosition.x || left.name.localeCompare(right.name);
    });

  if (isolatedTables.length === 0) return rawPositions;

  const nextPositions: Record<string, Position> = { ...rawPositions };
  const connectedTables = tables.filter((table) => (degreeByKey.get(table.key) ?? 0) > 0 && rawPositions[table.key]);

  if (connectedTables.length === 0) {
    const columns = Math.max(1, Math.ceil(Math.sqrt(isolatedTables.length)));
    const startX = snapToGrid(Math.min(...isolatedTables.map((table) => rawPositions[table.key].x)));
    const startY = snapToGrid(Math.min(...isolatedTables.map((table) => rawPositions[table.key].y)));
    const rowHeights = new Map<number, number>();

    isolatedTables.forEach((table, index) => {
      const rowIndex = Math.floor(index / columns);
      rowHeights.set(rowIndex, Math.max(rowHeights.get(rowIndex) ?? 0, getTableNodeHeight(table)));
    });

    const rowY = new Map<number, number>();
    let nextRowY = startY;
    const totalRows = Math.ceil(isolatedTables.length / columns);

    for (let rowIndex = 0; rowIndex < totalRows; rowIndex += 1) {
      rowY.set(rowIndex, nextRowY);
      nextRowY += (rowHeights.get(rowIndex) ?? 0) + ISOLATED_TABLE_VERTICAL_GAP;
    }

    isolatedTables.forEach((table, index) => {
      const columnIndex = index % columns;
      const rowIndex = Math.floor(index / columns);
      nextPositions[table.key] = {
        x: startX + columnIndex * (TABLE_NODE_WIDTH + ISOLATED_TABLE_HORIZONTAL_GAP),
        y: rowY.get(rowIndex) ?? startY,
      };
    });

    return nextPositions;
  }

  const connectedBounds = getLayoutBounds(connectedTables, rawPositions);
  if (!connectedBounds) return rawPositions;

  const maxColumnHeight = Math.max(connectedBounds.height + ISOLATED_TABLE_COLUMN_HEIGHT_PADDING, 420);
  const columns: Array<{ tables: TableModel[]; totalHeight: number }> = [];

  for (const table of isolatedTables) {
    const tableHeight = getTableNodeHeight(table);
    const currentColumn = columns[columns.length - 1];
    const nextHeight = currentColumn ? currentColumn.totalHeight + ISOLATED_TABLE_VERTICAL_GAP + tableHeight : tableHeight;

    if (!currentColumn || (currentColumn.tables.length > 0 && nextHeight > maxColumnHeight)) {
      columns.push({ tables: [table], totalHeight: tableHeight });
      continue;
    }

    currentColumn.tables.push(table);
    currentColumn.totalHeight = nextHeight;
  }

  let nextColumnX = snapToGrid(connectedBounds.maxX + ISOLATED_TABLE_HORIZONTAL_GAP);

  for (const column of columns) {
    let nextTableY = snapToGrid(connectedBounds.centerY - column.totalHeight / 2);

    for (const table of column.tables) {
      nextPositions[table.key] = {
        x: nextColumnX,
        y: nextTableY,
      };
      nextTableY += getTableNodeHeight(table) + ISOLATED_TABLE_VERTICAL_GAP;
    }

    nextColumnX += TABLE_NODE_WIDTH + ISOLATED_TABLE_HORIZONTAL_GAP;
  }

  return nextPositions;
}

function regularizeLayeredPositions(
  tables: TableModel[],
  relationships: Relationship[],
  rawPositions: Record<string, Position>,
): Record<string, Position> {
  const layerItems = tables
    .map((table) => {
      const position = rawPositions[table.key];
      if (!position) return null;

      return {
        key: table.key,
        height: getTableNodeHeight(table),
        x: position.x,
        y: position.y,
      } satisfies LayerPlacementItem;
    })
    .filter((item): item is LayerPlacementItem => Boolean(item));

  if (layerItems.length <= 1) return rawPositions;

  const layers = clusterLayers(layerItems);
  if (layers.length === 0) return rawPositions;

  const horizontalCorridors: number[] = [];
  for (let index = 0; index < layers.length - 1; index += 1) {
    const currentRight = Math.max(...layers[index].items.map((item) => item.x + TABLE_NODE_WIDTH));
    const nextLeft = Math.min(...layers[index + 1].items.map((item) => item.x));
    const gap = nextLeft - currentRight;
    if (gap > 0) horizontalCorridors.push(gap);
  }

  const verticalCorridors: number[] = [];
  for (const layer of layers) {
    const orderedByY = [...layer.items].sort((left, right) => left.y - right.y || left.key.localeCompare(right.key));
    for (let index = 0; index < orderedByY.length - 1; index += 1) {
      const current = orderedByY[index];
      const next = orderedByY[index + 1];
      const gap = next.y - (current.y + current.height);
      if (gap > 0) verticalCorridors.push(gap);
    }
  }

  const horizontalCorridor = snapToGrid(clamp(median(horizontalCorridors, DEFAULT_HORIZONTAL_CORRIDOR), 144, 220));
  const verticalCorridor = snapToGrid(clamp(median(verticalCorridors, DEFAULT_VERTICAL_CORRIDOR) * 0.88, 60, 104));
  const baseX = snapToGrid(Math.min(...layers.map((layer) => Math.min(...layer.items.map((item) => item.x)))));
  const globalCenterY = median(
    layers.map((layer) => {
      const layerTop = Math.min(...layer.items.map((item) => item.y));
      const layerBottom = Math.max(...layer.items.map((item) => item.y + item.height));
      return (layerTop + layerBottom) / 2;
    }),
    layerItems.reduce((sum, item) => sum + item.y + item.height / 2, 0) / Math.max(layerItems.length, 1),
  );
  const regularizedPositions: Record<string, Position> = { ...rawPositions };
  const layerIndexByKey = new Map<string, number>();
  const packedLayers: PackedLayerPlacement[] = layers.map((layer, layerIndex) => {
    const orderedByY = [...layer.items].sort((left, right) => left.y - right.y || left.key.localeCompare(right.key));
    const originalTop = Math.min(...orderedByY.map((item) => item.y));
    const originalBottom = Math.max(...orderedByY.map((item) => item.y + item.height));
    const originalCenterY = (originalTop + originalBottom) / 2;
    const nextX = baseX + layerIndex * (TABLE_NODE_WIDTH + horizontalCorridor);

    let packedY = originalTop;
    const packedItems = orderedByY.map((item) => {
      const nextItem = {
        key: item.key,
        height: item.height,
        y: packedY,
        centerY: packedY + item.height / 2,
      } satisfies PackedLayerItem;
      packedY += item.height + verticalCorridor;
      return nextItem;
    });

    const packedTop = packedItems[0]?.y ?? originalTop;
    const packedBottom = packedItems.length > 0 ? packedItems[packedItems.length - 1].y + packedItems[packedItems.length - 1].height : originalBottom;
    const packedCenterY = (packedTop + packedBottom) / 2;

    for (const item of orderedByY) layerIndexByKey.set(item.key, layerIndex);

    return {
      layerIndex,
      originalCenterY,
      packedCenterY,
      nextX,
      packedItems,
    };
  });
  const packedItemsByKey = new Map(
    packedLayers.flatMap((layer) => layer.packedItems.map((item) => [item.key, item] as const)),
  );
  const layerConnections: LayerConnection[] = [];
  const layerRelaxationStats = new Map<number, LayerRelaxationStats>(
    packedLayers.map((layer) => [layer.layerIndex, { crossEdgeCount: 0, adjacentEdgeCount: 0 }] as const),
  );
  const layerAdjacency = new Map<number, Set<number>>(packedLayers.map((layer) => [layer.layerIndex, new Set<number>()] as const));

  const getLayerDistanceWeight = (distance: number): number => {
    if (distance <= 1) return 1;
    return 1 / distance ** 1.35;
  };

  const getWeightedAverage = (
    values: Array<{ value: number; weight: number }>,
    fallback: number,
  ): number => {
    if (values.length === 0) return fallback;

    const totalWeight = values.reduce((sum, entry) => sum + entry.weight, 0);
    if (totalWeight <= 0) return fallback;

    return values.reduce((sum, entry) => sum + entry.value * entry.weight, 0) / totalWeight;
  };

  for (const relationship of relationships) {
    const sourceLayerIndex = layerIndexByKey.get(relationship.sourceTable);
    const targetLayerIndex = layerIndexByKey.get(relationship.targetTable);

    if (sourceLayerIndex === undefined || targetLayerIndex === undefined || sourceLayerIndex === targetLayerIndex) continue;

    const sourcePackedItem = packedItemsByKey.get(relationship.sourceTable);
    const targetPackedItem = packedItemsByKey.get(relationship.targetTable);
    if (!sourcePackedItem || !targetPackedItem) continue;

    const sourceLayer = packedLayers[sourceLayerIndex];
    const targetLayer = packedLayers[targetLayerIndex];
    if (!sourceLayer || !targetLayer) continue;

    const layerDistance = Math.abs(targetLayerIndex - sourceLayerIndex);
    const connectionWeight = layerDistance === 1 ? 2.4 : getLayerDistanceWeight(layerDistance) * 1.25;

    layerConnections.push({
      sourceLayerIndex,
      targetLayerIndex,
      sourceOffsetY: sourcePackedItem.centerY - sourceLayer.packedCenterY,
      targetOffsetY: targetPackedItem.centerY - targetLayer.packedCenterY,
      weight: connectionWeight,
    });

    const sourceStats = layerRelaxationStats.get(sourceLayerIndex);
    const targetStats = layerRelaxationStats.get(targetLayerIndex);
    if (sourceStats) {
      sourceStats.crossEdgeCount += 1;
      if (layerDistance === 1) sourceStats.adjacentEdgeCount += 1;
    }
    if (targetStats) {
      targetStats.crossEdgeCount += 1;
      if (layerDistance === 1) targetStats.adjacentEdgeCount += 1;
    }

    layerAdjacency.get(sourceLayerIndex)?.add(targetLayerIndex);
    layerAdjacency.get(targetLayerIndex)?.add(sourceLayerIndex);
  }

  const componentCenterYByLayer = new Map<number, number>();
  const visitedLayers = new Set<number>();

  for (const layer of packedLayers) {
    if (visitedLayers.has(layer.layerIndex)) continue;

    const queue = [layer.layerIndex];
    const component: number[] = [];
    visitedLayers.add(layer.layerIndex);

    while (queue.length > 0) {
      const current = queue.shift();
      if (current === undefined) continue;
      component.push(current);

      for (const neighbor of layerAdjacency.get(current) ?? []) {
        if (visitedLayers.has(neighbor)) continue;
        visitedLayers.add(neighbor);
        queue.push(neighbor);
      }
    }

    const weightedCenter = getWeightedAverage(
      component.map((layerIndex) => ({
        value: packedLayers[layerIndex]?.originalCenterY ?? globalCenterY,
        weight: 1 + (layerRelaxationStats.get(layerIndex)?.crossEdgeCount ?? 0) * 0.45,
      })),
      globalCenterY,
    );

    for (const layerIndex of component) componentCenterYByLayer.set(layerIndex, weightedCenter);
  }

  const currentLayerCenters = new Map<number, number>(
    packedLayers.map((layer) => [layer.layerIndex, layer.originalCenterY] as const),
  );

  for (let iteration = 0; iteration < LAYER_CENTER_RELAXATION_ITERATIONS; iteration += 1) {
    const nextLayerCenters = new Map(currentLayerCenters);

    for (const layer of packedLayers) {
      const edgeAnchors: Array<{ value: number; weight: number }> = [];

      for (const connection of layerConnections) {
        if (connection.sourceLayerIndex === layer.layerIndex) {
          const neighborLayerCenterY = currentLayerCenters.get(connection.targetLayerIndex);
          if (neighborLayerCenterY === undefined) continue;

          edgeAnchors.push({
            value: neighborLayerCenterY + connection.targetOffsetY - connection.sourceOffsetY,
            weight: connection.weight,
          });
        } else if (connection.targetLayerIndex === layer.layerIndex) {
          const neighborLayerCenterY = currentLayerCenters.get(connection.sourceLayerIndex);
          if (neighborLayerCenterY === undefined) continue;

          edgeAnchors.push({
            value: neighborLayerCenterY + connection.sourceOffsetY - connection.targetOffsetY,
            weight: connection.weight,
          });
        }
      }

      const componentCenterY = componentCenterYByLayer.get(layer.layerIndex) ?? globalCenterY;
      const relaxationStats = layerRelaxationStats.get(layer.layerIndex) ?? { crossEdgeCount: 0, adjacentEdgeCount: 0 };
      const neighborLayerCount = layerAdjacency.get(layer.layerIndex)?.size ?? 0;
      const anchorSpread = getAnchorSpread(edgeAnchors);
      const isSparseLeafLayer =
        layer.packedItems.length <= 2 &&
        neighborLayerCount === 1 &&
        relaxationStats.crossEdgeCount <= 2 &&
        edgeAnchors.length > 0 &&
        anchorSpread <= verticalCorridor * 1.15;
      const componentWeight = edgeAnchors.length === 0
        ? 1
        : isSparseLeafLayer
          ? clamp(0.08 + relaxationStats.crossEdgeCount * 0.02, 0.08, 0.16)
          : 0.22 + relaxationStats.crossEdgeCount * 0.04;
      const desiredCenterY = getWeightedAverage(
        edgeAnchors.length > 0
          ? [...edgeAnchors, { value: componentCenterY, weight: componentWeight }]
          : [{ value: componentCenterY, weight: 1 }],
        componentCenterY,
      );
      const dynamicShiftLimit =
        verticalCorridor *
        clamp(
          1.3 +
            relaxationStats.adjacentEdgeCount * 0.34 +
            Math.sqrt(relaxationStats.crossEdgeCount) * 0.18 +
            (isSparseLeafLayer ? 1.15 : 0),
          1.3,
          5.9,
        );
      const boundedCenterY = clamp(
        desiredCenterY,
        layer.originalCenterY - dynamicShiftLimit,
        layer.originalCenterY + dynamicShiftLimit,
      );
      const relaxationBlend = edgeAnchors.length === 0
        ? LAYER_CENTER_ALIGNMENT_BLEND
        : clamp(0.48 + relaxationStats.adjacentEdgeCount * 0.05 + (isSparseLeafLayer ? 0.08 : 0), 0.48, 0.88);

      nextLayerCenters.set(
        layer.layerIndex,
        blendTowards(currentLayerCenters.get(layer.layerIndex) ?? layer.originalCenterY, boundedCenterY, relaxationBlend),
      );
    }

    currentLayerCenters.clear();
    for (const [layerIndex, centerY] of nextLayerCenters) currentLayerCenters.set(layerIndex, centerY);
  }

  packedLayers.forEach((layer) => {
    const alignedCenterY = currentLayerCenters.get(layer.layerIndex) ?? layer.originalCenterY;
    const offsetY = alignedCenterY - layer.packedCenterY;

    for (const item of layer.packedItems) {
      regularizedPositions[item.key] = {
        x: layer.nextX,
        y: snapToGrid(item.y + offsetY),
      };
    }
  });

  return regularizedPositions;
}

function formatPadding(horizontal: number, vertical: number): string {
  const x = Math.round(horizontal);
  const y = Math.round(vertical);
  return `[top=${y},left=${x},bottom=${y},right=${x}]`;
}

function buildGraphStats(tables: TableModel[], relationships: Relationship[]) {
  const indegree = new Map<string, number>();
  const outdegree = new Map<string, number>();
  const totalDegree = new Map<string, number>();
  const neighbors = new Map<string, Set<string>>();

  for (const table of tables) {
    indegree.set(table.key, 0);
    outdegree.set(table.key, 0);
    totalDegree.set(table.key, 0);
    neighbors.set(table.key, new Set());
  }

  for (const rel of relationships) {
    outdegree.set(rel.sourceTable, (outdegree.get(rel.sourceTable) ?? 0) + 1);
    indegree.set(rel.targetTable, (indegree.get(rel.targetTable) ?? 0) + 1);
    totalDegree.set(rel.sourceTable, (totalDegree.get(rel.sourceTable) ?? 0) + 1);
    totalDegree.set(rel.targetTable, (totalDegree.get(rel.targetTable) ?? 0) + 1);
    neighbors.get(rel.sourceTable)?.add(rel.targetTable);
    neighbors.get(rel.targetTable)?.add(rel.sourceTable);
  }

  const hubs = new Set<string>();
  for (const table of tables) {
    const incoming = indegree.get(table.key) ?? 0;
    const outgoing = outdegree.get(table.key) ?? 0;
    const degree = totalDegree.get(table.key) ?? 0;
    if (degree >= 4 || (degree >= 3 && incoming > 0 && outgoing > 0)) hubs.add(table.key);
  }

  return { indegree, outdegree, totalDegree, neighbors, hubs };
}

function buildLayoutProfile(
  tables: TableModel[],
  relationships: Relationship[],
  groupingMode: RelationGroupingMode = 'separate',
) {
  const { hubs, totalDegree } = buildGraphStats(tables, relationships);
  const averageHeight =
    tables.length === 0 ? 0 : tables.reduce((sum, table) => sum + getTableNodeHeight(table), 0) / tables.length;
  const maxDegree = Math.max(0, ...Array.from(totalDegree.values()));
  const edgeDensity = relationships.length / Math.max(tables.length, 1);
  const densityPressure = clamp((edgeDensity - 0.9) / 1.8, 0, 1);
  const hubPressure = clamp((maxDegree - 2) / 5, 0, 1);
  const hubCountPressure = clamp((hubs.size - 1) / 4, 0, 1);
  const heightPressure = clamp((averageHeight - 220) / 240, 0, 1);
  const pressure = clamp(Math.max(densityPressure, hubPressure * 0.92, hubCountPressure * 0.82), 0, 1);

  const firstPassNodeNode = clamp(72 + averageHeight * 0.04 + pressure * 12, 72, 112);
  const firstPassEdgeNode = clamp(44 + heightPressure * 6 + pressure * 7, 44, 76);
  const firstPassEdgeEdge = clamp(16 + pressure * 8, 16, 28);
  const firstPassBetweenLayers = clamp(118 + pressure * 28 + heightPressure * 14, 118, 176);
  const firstPassEdgeNodeBetweenLayers = clamp(74 + pressure * 18 + heightPressure * 8, 74, 118);
  const firstPassPaddingX = clamp(42 + pressure * 10, 42, 72);
  const firstPassPaddingY = clamp(38 + pressure * 8 + heightPressure * 6, 38, 66);

  const bundlingFactor = groupingMode === 'bundled' ? 1 : 0;
  const secondPassNodeNode = clamp(firstPassNodeNode + 4 + bundlingFactor * 4, 78, 122);
  const secondPassEdgeNode = clamp(firstPassEdgeNode + 6 + bundlingFactor * 6, 50, 88);
  const secondPassEdgeEdge = clamp(firstPassEdgeEdge + 6 + bundlingFactor * 5, 22, 38);
  const secondPassPortPort = bundlingFactor ? 18 : 14;
  const secondPassBetweenLayers = clamp(firstPassBetweenLayers + 8 + bundlingFactor * 12, 130, 196);
  const secondPassEdgeNodeBetweenLayers = clamp(firstPassEdgeNodeBetweenLayers + 8 + bundlingFactor * 10, 88, 142);
  const secondPassPaddingX = clamp(firstPassPaddingX + 6 + bundlingFactor * 10, 48, 92);
  const secondPassPaddingY = clamp(firstPassPaddingY + 6 + bundlingFactor * 8, 44, 78);

  return {
    firstPass: {
      nodeNode: `${Math.round(firstPassNodeNode)}`,
      edgeNode: `${Math.round(firstPassEdgeNode)}`,
      edgeEdge: `${Math.round(firstPassEdgeEdge)}`,
      edgeEdgeBetweenLayers: `${Math.round(firstPassEdgeEdge + 14 + pressure * 6)}`,
      nodeNodeBetweenLayers: `${Math.round(firstPassBetweenLayers)}`,
      edgeNodeBetweenLayers: `${Math.round(firstPassEdgeNodeBetweenLayers)}`,
      padding: formatPadding(firstPassPaddingX, firstPassPaddingY),
    },
    secondPass: {
      nodeNode: `${Math.round(secondPassNodeNode)}`,
      edgeNode: `${Math.round(secondPassEdgeNode)}`,
      edgeEdge: `${Math.round(secondPassEdgeEdge)}`,
      edgeEdgeBetweenLayers: `${Math.round(secondPassEdgeEdge + 14 + bundlingFactor * 4 + pressure * 6)}`,
      portPort: `${secondPassPortPort}`,
      nodeNodeBetweenLayers: `${Math.round(secondPassBetweenLayers)}`,
      edgeNodeBetweenLayers: `${Math.round(secondPassEdgeNodeBetweenLayers)}`,
      padding: formatPadding(secondPassPaddingX, secondPassPaddingY),
    },
  };
}

function buildTableOrder(tables: TableModel[], relationships: Relationship[]): TableModel[] {
  const { indegree, outdegree, totalDegree, neighbors, hubs } = buildGraphStats(tables, relationships);
  const visited = new Set<string>();
  const componentSize = new Map<string, number>();

  for (const table of tables) {
    if (visited.has(table.key)) continue;

    const queue = [table.key];
    const component: string[] = [];
    visited.add(table.key);

    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) continue;
      component.push(current);

      for (const neighbor of neighbors.get(current) ?? []) {
        if (visited.has(neighbor)) continue;
        visited.add(neighbor);
        queue.push(neighbor);
      }
    }

    for (const key of component) componentSize.set(key, component.length);
  }

  return [...tables].sort((a, b) => {
    const componentDelta = (componentSize.get(b.key) ?? 0) - (componentSize.get(a.key) ?? 0);
    if (componentDelta !== 0) return componentDelta;

    const aHub = hubs.has(a.key) ? 1 : 0;
    const bHub = hubs.has(b.key) ? 1 : 0;
    if (bHub !== aHub) return bHub - aHub;

    const aDegree = totalDegree.get(a.key) ?? 0;
    const bDegree = totalDegree.get(b.key) ?? 0;
    if (bDegree !== aDegree) return bDegree - aDegree;

    const aIsHub = (indegree.get(a.key) ?? 0) > 0 && (outdegree.get(a.key) ?? 0) > 0 ? 1 : 0;
    const bIsHub = (indegree.get(b.key) ?? 0) > 0 && (outdegree.get(b.key) ?? 0) > 0 ? 1 : 0;
    if (bIsHub !== aIsHub) return bIsHub - aIsHub;

    return a.name.localeCompare(b.name);
  });
}

function buildFirstPassGraph(tables: TableModel[], relationships: Relationship[]) {
  const orderedTables = buildTableOrder(tables, relationships);
  const profile = buildLayoutProfile(tables, relationships);

  return {
    id: 'erd-root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'RIGHT',
      'elk.edgeRouting': 'ORTHOGONAL',
      'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
      'elk.layered.nodePlacement.favorStraightEdges': 'true',
      'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
      'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
      'elk.spacing.nodeNode': profile.firstPass.nodeNode,
      'elk.spacing.edgeNode': profile.firstPass.edgeNode,
      'elk.spacing.edgeEdge': profile.firstPass.edgeEdge,
      'elk.layered.spacing.edgeEdgeBetweenLayers': profile.firstPass.edgeEdgeBetweenLayers,
      'elk.layered.spacing.nodeNodeBetweenLayers': profile.firstPass.nodeNodeBetweenLayers,
      'elk.layered.spacing.edgeNodeBetweenLayers': profile.firstPass.edgeNodeBetweenLayers,
      'elk.padding': profile.firstPass.padding,
    },
    children: orderedTables.map((table) => ({
      id: table.key,
      width: TABLE_NODE_WIDTH,
      height: getTableNodeHeight(table),
    })),
    edges: relationships.map((rel) => ({
      id: rel.id,
      sources: [rel.sourceTable],
      targets: [rel.targetTable],
    })),
  };
}

function buildBundleKey(groupingMode: RelationGroupingMode, side: ElkPortSide, role: 'source' | 'target', items: Array<{ sortValue: number }>): string | null {
  if (groupingMode !== 'bundled' || role !== 'target' || items.length <= 1) return null;

  const average = items.reduce((sum, item) => sum + item.sortValue, 0) / items.length;
  return `${side}-${Math.round(average / 64)}`;
}

function partitionItemsForPorts<T extends { sortValue: number }>(items: T[]): T[][] {
  if (items.length <= 1) return [items];

  const maxBundleSize = 3;
  const maxSpan = 84;
  const clusters: T[][] = [];
  let current: T[] = [];

  for (const item of items) {
    const first = current[0];
    const exceedsSpan = first ? item.sortValue - first.sortValue > maxSpan : false;
    const exceedsSize = current.length >= maxBundleSize;

    if (current.length > 0 && (exceedsSpan || exceedsSize)) {
      clusters.push(current);
      current = [];
    }

    current.push(item);
  }

  if (current.length > 0) clusters.push(current);
  return clusters;
}

function buildDockingPlan(
  tables: TableModel[],
  relationships: Relationship[],
  positions: Record<string, Position>,
  preferences: LayoutPreferences,
): Record<string, EdgeDockingPlan> {
  const tablesByKey = new Map(tables.map((table) => [table.key, table] as const));
  const dockingPlan: Record<string, EdgeDockingPlan> = {};
  const nodeSideBuckets = new Map<string, Array<{ edgeId: string; role: 'source' | 'target'; side: ElkPortSide; sortValue: number }>>();
  const groupingMode = preferences.relationGrouping ?? 'separate';
  const sideCounts = new Map<string, Partial<Record<ElkPortSide, number>>>();
  const candidates: DockingCandidate[] = [];

  const getSideCountRecord = (tableKey: string): Partial<Record<ElkPortSide, number>> => {
    const existing = sideCounts.get(tableKey);
    if (existing) return existing;

    const created: Partial<Record<ElkPortSide, number>> = {};
    sideCounts.set(tableKey, created);
    return created;
  };

  const incrementSideCount = (tableKey: string, side: ElkPortSide, delta: 1 | -1) => {
    const counts = getSideCountRecord(tableKey);
    const next = (counts[side] ?? 0) + delta;

    if (next <= 0) {
      delete counts[side];
      return;
    }

    counts[side] = next;
  };

  for (const rel of relationships) {
    const sourceTable = tablesByKey.get(rel.sourceTable);
    const targetTable = tablesByKey.get(rel.targetTable);
    const sourcePosition = positions[rel.sourceTable];
    const targetPosition = positions[rel.targetTable];
    if (!sourceTable || !targetTable || !sourcePosition || !targetPosition) continue;

    const sourceHeight = getTableNodeHeight(sourceTable);
    const targetHeight = getTableNodeHeight(targetTable);
    const sourceCenter = {
      x: sourcePosition.x + TABLE_NODE_WIDTH / 2,
      y: sourcePosition.y + sourceHeight / 2,
    };
    const targetCenter = {
      x: targetPosition.x + TABLE_NODE_WIDTH / 2,
      y: targetPosition.y + targetHeight / 2,
    };
    const horizontalGap = Math.max(0, Math.abs(targetCenter.x - sourceCenter.x) - TABLE_NODE_WIDTH);
    const verticalGap = Math.max(0, Math.abs(targetCenter.y - sourceCenter.y) - (sourceHeight + targetHeight) / 2);

    candidates.push({
      relationship: rel,
      sourceCenter,
      targetCenter,
      sourceHeight,
      targetHeight,
      priority: Math.abs(horizontalGap - verticalGap) + Math.max(horizontalGap, verticalGap) * 0.08,
    });
  }

  const orderedCandidates = [...candidates].sort(
    (left, right) => right.priority - left.priority || left.relationship.id.localeCompare(right.relationship.id),
  );

  const resolveCandidate = (candidate: DockingCandidate) =>
    resolveHandlePair(candidate.sourceCenter, candidate.targetCenter, {
      sourceHeight: candidate.sourceHeight,
      targetHeight: candidate.targetHeight,
      sourceSideCounts: getSideCountRecord(candidate.relationship.sourceTable),
      targetSideCounts: getSideCountRecord(candidate.relationship.targetTable),
      loadPenalty: 46,
      sameSidePenalty: 22,
      reversePenalty: 104,
      axisPenalty: 14,
      tightGapPenalty: 36,
      axisDominancePenalty: 56,
      mixedOrientationPenalty: 10,
      axisDominanceThreshold: 42,
    });

  for (const candidate of orderedCandidates) {
    const rel = candidate.relationship;
    const handlePair = resolveCandidate(candidate);

    dockingPlan[rel.id] = {
      sourceSide: handlePair.sourceSide,
      targetSide: handlePair.targetSide,
      sourcePortId: '',
      targetPortId: '',
    };

    incrementSideCount(rel.sourceTable, handlePair.sourceSide, 1);
    incrementSideCount(rel.targetTable, handlePair.targetSide, 1);
  }

  for (let pass = 0; pass < 3; pass += 1) {
    let changed = false;

    for (const candidate of orderedCandidates) {
      const rel = candidate.relationship;
      const current = dockingPlan[rel.id];
      if (!current) continue;

      incrementSideCount(rel.sourceTable, current.sourceSide, -1);
      incrementSideCount(rel.targetTable, current.targetSide, -1);

      const nextHandlePair = resolveCandidate(candidate);
      incrementSideCount(rel.sourceTable, nextHandlePair.sourceSide, 1);
      incrementSideCount(rel.targetTable, nextHandlePair.targetSide, 1);

      dockingPlan[rel.id] = {
        ...current,
        sourceSide: nextHandlePair.sourceSide,
        targetSide: nextHandlePair.targetSide,
      };

      if (nextHandlePair.sourceSide !== current.sourceSide || nextHandlePair.targetSide !== current.targetSide) {
        changed = true;
      }
    }

    if (!changed) break;
  }

  for (const candidate of candidates) {
    const rel = candidate.relationship;
    const plan = dockingPlan[rel.id];
    if (!plan) continue;

    const sourceIsHorizontal = plan.sourceSide === 'left' || plan.sourceSide === 'right';
    const targetIsHorizontal = plan.targetSide === 'left' || plan.targetSide === 'right';
    const axis =
      sourceIsHorizontal === targetIsHorizontal
        ? sourceIsHorizontal
          ? 'horizontal'
          : 'vertical'
        : Math.abs(candidate.targetCenter.x - candidate.sourceCenter.x) >= Math.abs(candidate.targetCenter.y - candidate.sourceCenter.y)
          ? 'horizontal'
          : 'vertical';
    const sourceBucketKey = `${rel.sourceTable}::${plan.sourceSide}`;
    const targetBucketKey = `${rel.targetTable}::${plan.targetSide}`;
    const sourceSortValue = axis === 'horizontal' ? candidate.targetCenter.y : candidate.targetCenter.x;
    const targetSortValue = axis === 'horizontal' ? candidate.sourceCenter.y : candidate.sourceCenter.x;

    if (!nodeSideBuckets.has(sourceBucketKey)) nodeSideBuckets.set(sourceBucketKey, []);
    if (!nodeSideBuckets.has(targetBucketKey)) nodeSideBuckets.set(targetBucketKey, []);

    nodeSideBuckets.get(sourceBucketKey)?.push({ edgeId: rel.id, role: 'source', side: plan.sourceSide, sortValue: sourceSortValue });
    nodeSideBuckets.get(targetBucketKey)?.push({ edgeId: rel.id, role: 'target', side: plan.targetSide, sortValue: targetSortValue });
  }

  for (const [bucketKey, items] of nodeSideBuckets) {
    const [tableKey, side] = bucketKey.split('::') as [string, ElkPortSide];
    const orderedItems = [...items].sort((a, b) => a.sortValue - b.sortValue || a.edgeId.localeCompare(b.edgeId));
    const partitions = partitionItemsForPorts(orderedItems);

    for (const partition of partitions) {
      const role = partition[0]?.role;
      if (!role) continue;

      const bundleKey = buildBundleKey(groupingMode, side, role, partition);

      for (const item of partition) {
        const id = portId(tableKey, side, bundleKey ?? item.edgeId, item.role);
        if (item.role === 'source') {
          dockingPlan[item.edgeId].sourcePortId = id;
          dockingPlan[item.edgeId].sourceBundleId = bundleKey ?? undefined;
        } else {
          dockingPlan[item.edgeId].targetPortId = id;
          dockingPlan[item.edgeId].targetBundleId = bundleKey ?? undefined;
        }
      }
    }
  }

  return dockingPlan;
}

function buildSecondPassGraph(
  tables: TableModel[],
  relationships: Relationship[],
  dockingPlan: Record<string, EdgeDockingPlan>,
  preferences: LayoutPreferences,
) {
  const orderedTables = buildTableOrder(tables, relationships);
  const portsByNode = new Map<string, Array<{ id: string; side: ElkPortSide }>>();
  const groupingMode = preferences.relationGrouping ?? 'separate';
  const profile = buildLayoutProfile(tables, relationships, groupingMode);

  for (const rel of relationships) {
    const plan = dockingPlan[rel.id];
    if (!plan) continue;
    if (!portsByNode.has(rel.sourceTable)) portsByNode.set(rel.sourceTable, []);
    if (!portsByNode.has(rel.targetTable)) portsByNode.set(rel.targetTable, []);

    portsByNode.get(rel.sourceTable)?.push({ id: plan.sourcePortId, side: plan.sourceSide });
    portsByNode.get(rel.targetTable)?.push({ id: plan.targetPortId, side: plan.targetSide });
  }

  return {
    id: 'erd-root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'RIGHT',
      'elk.edgeRouting': 'ORTHOGONAL',
      'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
      'elk.layered.nodePlacement.favorStraightEdges': 'true',
      'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
      'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
      'elk.layered.considerModelOrder.portModelOrder': 'true',
      'elk.spacing.nodeNode': profile.secondPass.nodeNode,
      'elk.spacing.edgeNode': profile.secondPass.edgeNode,
      'elk.spacing.edgeEdge': profile.secondPass.edgeEdge,
      'elk.layered.spacing.edgeEdgeBetweenLayers': profile.secondPass.edgeEdgeBetweenLayers,
      'elk.spacing.portPort': profile.secondPass.portPort,
      'elk.layered.spacing.nodeNodeBetweenLayers': profile.secondPass.nodeNodeBetweenLayers,
      'elk.layered.spacing.edgeNodeBetweenLayers': profile.secondPass.edgeNodeBetweenLayers,
      'elk.padding': profile.secondPass.padding,
    },
    children: orderedTables.map((table) => ({
      id: table.key,
      width: TABLE_NODE_WIDTH,
      height: getTableNodeHeight(table),
      layoutOptions: {
        'elk.portConstraints': 'FIXED_SIDE',
      },
      ports: Array.from(new Map((portsByNode.get(table.key) ?? []).map((port) => [port.id, port])).values()).map((port) => ({
        id: port.id,
        width: 10,
        height: 10,
        layoutOptions: {
          'elk.port.side': port.side.toUpperCase(),
        },
      })),
    })),
    edges: relationships
      .map((rel) => {
        const plan = dockingPlan[rel.id];
        if (!plan?.sourcePortId || !plan?.targetPortId) return null;

        return {
          id: rel.id,
          sources: [plan.sourcePortId],
          targets: [plan.targetPortId],
        };
      })
      .filter((edge): edge is NonNullable<typeof edge> => Boolean(edge)),
  };
}

function edgePathsFromLayout(layout: ParsedElkLayout): Record<string, ElkEdgePath> {
  const edgePaths: Record<string, ElkEdgePath> = {};

  for (const edge of layout.edges ?? []) {
    const section = edge.sections?.[0];
    if (!section) continue;

    const points = normalizePoints(section);
    const sourceSide = parsePortSide(edge.sources?.[0] ?? section.outgoingShape) ?? 'right';
    const targetSide = parsePortSide(edge.targets?.[0] ?? section.incomingShape) ?? 'left';

    edgePaths[edge.id] = {
      id: edge.id,
      sourceHandle: sideToSourceHandle(sourceSide),
      targetHandle: sideToTargetHandle(targetSide),
      points,
    };
  }

  return edgePaths;
}

function getAnchorPoint(center: Position, side: ElkPortSide, tableHeight: number, laneOffset = 0): Position {
  const safeInset = 24;

  if (side === 'left') {
    return { x: center.x - TABLE_NODE_WIDTH / 2, y: Math.max(center.y - tableHeight / 2 + safeInset, Math.min(center.y + laneOffset, center.y + tableHeight / 2 - safeInset)) };
  }
  if (side === 'right') {
    return { x: center.x + TABLE_NODE_WIDTH / 2, y: Math.max(center.y - tableHeight / 2 + safeInset, Math.min(center.y + laneOffset, center.y + tableHeight / 2 - safeInset)) };
  }
  if (side === 'top') {
    return { x: Math.max(center.x - TABLE_NODE_WIDTH / 2 + safeInset, Math.min(center.x + laneOffset, center.x + TABLE_NODE_WIDTH / 2 - safeInset)), y: center.y - tableHeight / 2 };
  }

  return { x: Math.max(center.x - TABLE_NODE_WIDTH / 2 + safeInset, Math.min(center.x + laneOffset, center.x + TABLE_NODE_WIDTH / 2 - safeInset)), y: center.y + tableHeight / 2 };
}

function createFallbackEdgePaths(
  tables: TableModel[],
  relationships: Relationship[],
  positions: Record<string, Position>,
  preferences: LayoutPreferences = {},
): Record<string, ElkEdgePath> {
  const tablesByKey = new Map(tables.map((table) => [table.key, table] as const));
  const edgePaths: Record<string, ElkEdgePath> = {};
  const sideCounts = new Map<string, number>();
  const groupingMode = preferences.relationGrouping ?? 'separate';

  for (const rel of relationships) {
    const sourceTable = tablesByKey.get(rel.sourceTable);
    const targetTable = tablesByKey.get(rel.targetTable);
    const sourcePos = positions[rel.sourceTable];
    const targetPos = positions[rel.targetTable];
    if (!sourceTable || !targetTable || !sourcePos || !targetPos) continue;

    const sourceCenter = {
      x: sourcePos.x + TABLE_NODE_WIDTH / 2,
      y: sourcePos.y + getTableNodeHeight(sourceTable) / 2,
    };
    const targetCenter = {
      x: targetPos.x + TABLE_NODE_WIDTH / 2,
      y: targetPos.y + getTableNodeHeight(targetTable) / 2,
    };
    const sourceSideCounts = {
      left: sideCounts.get(`${rel.sourceTable}::left`) ?? 0,
      right: sideCounts.get(`${rel.sourceTable}::right`) ?? 0,
      top: sideCounts.get(`${rel.sourceTable}::top`) ?? 0,
      bottom: sideCounts.get(`${rel.sourceTable}::bottom`) ?? 0,
    };
    const targetSideCounts = {
      left: sideCounts.get(`${rel.targetTable}::left`) ?? 0,
      right: sideCounts.get(`${rel.targetTable}::right`) ?? 0,
      top: sideCounts.get(`${rel.targetTable}::top`) ?? 0,
      bottom: sideCounts.get(`${rel.targetTable}::bottom`) ?? 0,
    };
    const handlePair = resolveHandlePair(sourceCenter, targetCenter, {
      sourceHeight: getTableNodeHeight(sourceTable),
      targetHeight: getTableNodeHeight(targetTable),
      sourceSideCounts,
      targetSideCounts,
      loadPenalty: 36,
      sameSidePenalty: 18,
    });
    const sourceSide = handlePair.sourceSide;
    const targetSide = handlePair.targetSide;
    const sourceSideKey = `${rel.sourceTable}::${sourceSide}`;
    const targetSideKey = `${rel.targetTable}::${targetSide}`;
    const sourceIndex = sideCounts.get(sourceSideKey) ?? 0;
    const targetIndex = sideCounts.get(targetSideKey) ?? 0;
    sideCounts.set(sourceSideKey, sourceIndex + 1);
    sideCounts.set(targetSideKey, targetIndex + 1);

    const sourceLaneOffset = (sourceIndex % 5) * 12 - 24;
    const targetLaneOffset = groupingMode === 'bundled' ? 0 : (targetIndex % 5) * 12 - 24;
    const sourceAnchor = getAnchorPoint(sourceCenter, sourceSide, getTableNodeHeight(sourceTable), sourceLaneOffset);
    const targetAnchor = getAnchorPoint(targetCenter, targetSide, getTableNodeHeight(targetTable), targetLaneOffset);
    const midX = sourceAnchor.x + (targetAnchor.x - sourceAnchor.x) / 2;
    const midY = sourceAnchor.y + (targetAnchor.y - sourceAnchor.y) / 2;

    const points =
      handlePair.axis === 'horizontal'
        ? [sourceAnchor, { x: midX, y: sourceAnchor.y }, { x: midX, y: targetAnchor.y }, targetAnchor]
        : [sourceAnchor, { x: sourceAnchor.x, y: midY }, { x: targetAnchor.x, y: midY }, targetAnchor];

    edgePaths[rel.id] = {
      id: rel.id,
      sourceHandle: sideToSourceHandle(sourceSide),
      targetHandle: sideToTargetHandle(targetSide),
      points,
    };
  }

  return edgePaths;
}

export async function createElkLayout(
  tables: TableModel[],
  relationships: Relationship[],
  preferences: LayoutPreferences = {},
): Promise<ElkLayoutResult> {
  const elk = await getElkInstance();
  const firstPass = parseLayout(await elk.layout(buildFirstPassGraph(tables, relationships) as never));
  const firstPassPositions = getPositionsFromChildren(firstPass.children);
  const dockingPlan = buildDockingPlan(tables, relationships, firstPassPositions, preferences);
  const secondPass = parseLayout(await elk.layout(buildSecondPassGraph(tables, relationships, dockingPlan, preferences) as never));

  const regularizedPositions = regularizeLayeredPositions(tables, relationships, getPositionsFromChildren(secondPass.children));

  return {
    positions: compactIsolatedTables(tables, relationships, regularizedPositions),
    edgePaths: edgePathsFromLayout(secondPass),
  };
}

export function createFallbackLayout(
  tables: TableModel[],
  relationships: Relationship[],
  persistedPositions: Record<string, Position>,
  preferences: LayoutPreferences = {},
): ElkLayoutResult {
  const regularizedPositions = regularizeLayeredPositions(tables, relationships, createAutoLayout(tables, relationships, persistedPositions));
  const positions = compactIsolatedTables(tables, relationships, regularizedPositions);

  return {
    positions,
    edgePaths: createFallbackEdgePaths(tables, relationships, positions, preferences),
  };
}
