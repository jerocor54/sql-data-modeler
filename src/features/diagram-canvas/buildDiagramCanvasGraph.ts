import type { Edge, Node as FlowNode } from '@xyflow/react';

import { getTableNodeHeight, TABLE_NODE_WIDTH } from '../../lib/diagramGeometry';
import { resolveHandlePair } from '../../lib/edgeRouting';
import type { ElkLayoutResult } from '../../lib/elkLayout';
import {
  createOrthogonalRouter,
  getOrthogonalSegments,
  getPolylineMidpoint,
  optimizeOrthogonalPath,
  pointsToCornerPath,
  pointsToSvgPathWithLineJumps,
} from '../../lib/orthogonalRouter';
import type {
  DiagramViewport,
  ParseResult,
  Position,
  RelationGroupingMode,
  RelationLinePattern,
  RelationLineStyle,
  Relationship,
  TableDesignTheme,
  TableModel,
  TableVisualConfig,
  ThemeMode,
  TypeDisplayMode,
} from '../../types/erd';
import type { RoutedEdgeData, TableNodeData } from './diagramCanvasTypes';
import { deriveRelationshipCardinality } from '../parse-sql/useDiagramModel';

const LEGACY_DEFAULT_COLORS = {
  bgColor: '#1E293B',
  textColor: '#E2E8F0',
};

const THEME_TABLE_DEFAULTS: Record<ThemeMode, { bgColor: string; textColor: string }> = {
  light: {
    bgColor: '#FFFFFF',
    textColor: '#0F172A',
  },
  dark: {
    bgColor: '#1E293B',
    textColor: '#E2E8F0',
  },
  deepblue: {
    bgColor: '#152E6B',
    textColor: '#E0ECFF',
  },
};

function resolveTableConfig(theme: ThemeMode, config?: TableVisualConfig): TableVisualConfig {
  const defaults = THEME_TABLE_DEFAULTS[theme];
  if (!config) {
    return {
      ...defaults,
      useThemeDefaults: true,
    };
  }

  const isLegacyDefault =
    config.bgColor === LEGACY_DEFAULT_COLORS.bgColor && config.textColor === LEGACY_DEFAULT_COLORS.textColor;
  const useThemeDefaults = config.useThemeDefaults ?? isLegacyDefault;

  if (useThemeDefaults) {
    return {
      bgColor: defaults.bgColor,
      textColor: defaults.textColor,
      useThemeDefaults: true,
    };
  }

  return {
    bgColor: config.bgColor,
    textColor: config.textColor,
    useThemeDefaults: false,
  };
}

type HandleSide = 'left' | 'right' | 'top' | 'bottom';

const HANDLE_SIDE_VECTORS: Record<HandleSide, { x: number; y: number }> = {
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
  top: { x: 0, y: -1 },
  bottom: { x: 0, y: 1 },
};

interface EndpointPlan {
  anchor: { x: number; y: number };
  lead: { x: number; y: number };
  side: HandleSide;
}

interface TableFrame {
  x: number;
  y: number;
  height: number;
}

const ROUTE_OBSTACLE_CLEARANCE = 28;
const ROUTE_ENDPOINT_LEAD = ROUTE_OBSTACLE_CLEARANCE + 16;
const ROUTER_OUTER_PADDING = 120;
const ROUTER_TURN_PENALTY = 34;
const ROUTER_SEGMENT_PENALTY = 12;
const ROUTER_REVERSE_DIRECTION_PENALTY = 72;
const ROUTER_SHARED_SEGMENT_PENALTY = 52;
const ROUTER_NEARBY_SEGMENT_PENALTY = 22;
const ROUTER_NEARBY_SEGMENT_DISTANCE = 12;
const ROUTER_OUTER_LANE_PENALTY = 220;
const ROUTER_CENTER_LANE_PENALTY = 64;
const ROUTER_MIN_CORRIDOR_SPAN = 36;
const TABLE_BUNDLE_INSET = 24;
const BUNDLE_CLUSTER_SPAN = 72;
const BUNDLE_MAX_GROUP_SIZE = 3;
const ROUTE_EPSILON = 0.001;
function parseHandleSide(handleId?: string): HandleSide | null {
  if (!handleId) return null;
  if (handleId.endsWith('-left')) return 'left';
  if (handleId.endsWith('-right')) return 'right';
  if (handleId.endsWith('-top')) return 'top';
  if (handleId.endsWith('-bottom')) return 'bottom';
  return null;
}

function clampNumber(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function movePointFromSide(point: { x: number; y: number }, side: HandleSide, distance: number): { x: number; y: number } {
  if (side === 'left') return { x: point.x - distance, y: point.y };
  if (side === 'right') return { x: point.x + distance, y: point.y };
  if (side === 'top') return { x: point.x, y: point.y - distance };
  return { x: point.x, y: point.y + distance };
}

function getTableCenter(frame: TableFrame): { x: number; y: number } {
  return {
    x: frame.x + TABLE_NODE_WIDTH / 2,
    y: frame.y + frame.height / 2,
  };
}

function getSideCoordinateBounds(frame: TableFrame, side: HandleSide): { min: number; max: number } {
  if (side === 'left' || side === 'right') {
    return {
      min: frame.y + TABLE_BUNDLE_INSET,
      max: frame.y + frame.height - TABLE_BUNDLE_INSET,
    };
  }

  return {
    min: frame.x + TABLE_BUNDLE_INSET,
    max: frame.x + TABLE_NODE_WIDTH - TABLE_BUNDLE_INSET,
  };
}

function createAnchorOnFrame(frame: TableFrame, side: HandleSide, coordinate: number): { x: number; y: number } {
  const bounds = getSideCoordinateBounds(frame, side);
  const safeCoordinate = clampNumber(coordinate, bounds.min, bounds.max);

  if (side === 'left') return { x: frame.x, y: safeCoordinate };
  if (side === 'right') return { x: frame.x + TABLE_NODE_WIDTH, y: safeCoordinate };
  if (side === 'top') return { x: safeCoordinate, y: frame.y };
  return { x: safeCoordinate, y: frame.y + frame.height };
}

function distributeSideCoordinate(frame: TableFrame, side: HandleSide, index: number, total: number): number {
  const bounds = getSideCoordinateBounds(frame, side);
  if (total <= 1) return (bounds.min + bounds.max) / 2;

  const ratio = (index + 1) / (total + 1);
  return bounds.min + (bounds.max - bounds.min) * ratio;
}

function partitionBundledItems<T extends { sortValue: number }>(items: T[]): T[][] {
  if (items.length <= 1) return [items];

  const clusters: T[][] = [];
  let current: T[] = [];

  for (const item of items) {
    const first = current[0];
    const exceedsSpan = first ? item.sortValue - first.sortValue > BUNDLE_CLUSTER_SPAN : false;
    const exceedsSize = current.length >= BUNDLE_MAX_GROUP_SIZE;

    if (current.length > 0 && (exceedsSpan || exceedsSize)) {
      clusters.push(current);
      current = [];
    }

    current.push(item);
  }

  if (current.length > 0) clusters.push(current);
  return clusters;
}

function buildEndpointPlans(
  relationships: Relationship[],
  edgePaths: ElkLayoutResult['edgePaths'],
  tableFrames: Map<string, TableFrame>,
  endpoint: 'source' | 'target',
  groupingMode: RelationGroupingMode,
): Map<string, EndpointPlan> {
  const buckets = new Map<string, Array<{ edgeId: string; tableKey: string; side: HandleSide; sortValue: number }>>();

  for (const rel of relationships) {
    const ownTableKey = endpoint === 'source' ? rel.sourceTable : rel.targetTable;
    const otherTableKey = endpoint === 'source' ? rel.targetTable : rel.sourceTable;
    const ownFrame = tableFrames.get(ownTableKey);
    const otherFrame = tableFrames.get(otherTableKey);
    if (!ownFrame || !otherFrame) continue;

    const ownCenter = getTableCenter(ownFrame);
    const otherCenter = getTableCenter(otherFrame);
    const pathMeta = edgePaths[rel.id];
    const fallbackPair = resolveHandlePair(
      endpoint === 'source' ? ownCenter : otherCenter,
      endpoint === 'source' ? otherCenter : ownCenter,
    );
    const heuristicSide = endpoint === 'source' ? fallbackPair.sourceSide : fallbackPair.targetSide;
    const pathSide = parseHandleSide(endpoint === 'source' ? pathMeta?.sourceHandle : pathMeta?.targetHandle);
    const side = heuristicSide ?? pathSide;
    const sortValue = side === 'left' || side === 'right' ? otherCenter.y : otherCenter.x;
    const bucketKey = `${ownTableKey}::${side}`;

    if (!buckets.has(bucketKey)) buckets.set(bucketKey, []);
    buckets.get(bucketKey)?.push({
      edgeId: rel.id,
      tableKey: ownTableKey,
      side,
      sortValue,
    });
  }

  const plans = new Map<string, EndpointPlan>();

  for (const items of buckets.values()) {
    items.sort((a, b) => a.sortValue - b.sortValue || a.edgeId.localeCompare(b.edgeId));
    const frame = tableFrames.get(items[0]?.tableKey ?? '');
    if (!frame) continue;

    if (groupingMode === 'bundled') {
      const orderedClusters = partitionBundledItems(items);

      for (const cluster of orderedClusters) {
        const averageCoordinate = cluster.reduce((sum, item) => sum + item.sortValue, 0) / cluster.length;
        const anchor = createAnchorOnFrame(frame, cluster[0].side, averageCoordinate);
        const lead = movePointFromSide(anchor, cluster[0].side, ROUTE_ENDPOINT_LEAD);

        for (const item of cluster) {
          plans.set(item.edgeId, {
            anchor,
            lead,
            side: item.side,
          });
        }
      }

      continue;
    }

    for (const [index, item] of items.entries()) {
      const coordinate = distributeSideCoordinate(frame, item.side, index, items.length);
      const anchor = createAnchorOnFrame(frame, item.side, coordinate);
      const lead = movePointFromSide(anchor, item.side, ROUTE_ENDPOINT_LEAD);

      plans.set(item.edgeId, {
        anchor,
        lead,
        side: item.side,
      });
    }
  }

  return plans;
}

function simplifyOrthogonalPath(points: { x: number; y: number }[]): { x: number; y: number }[] {
  if (points.length <= 2) return points;

  const deduped = points.filter((point, index, list) => {
    if (index === 0) return true;
    const previous = list[index - 1];
    return Math.abs(previous.x - point.x) > 0.001 || Math.abs(previous.y - point.y) > 0.001;
  });

  if (deduped.length <= 2) return deduped;

  const simplified = [deduped[0]];

  for (let i = 1; i < deduped.length - 1; i += 1) {
    const previous = simplified[simplified.length - 1];
    const current = deduped[i];
    const next = deduped[i + 1];
    const sameX = Math.abs(previous.x - current.x) <= 0.001 && Math.abs(current.x - next.x) <= 0.001;
    const sameY = Math.abs(previous.y - current.y) <= 0.001 && Math.abs(current.y - next.y) <= 0.001;

    if (!sameX && !sameY) simplified.push(current);
  }

  simplified.push(deduped[deduped.length - 1]);
  return simplified;
}

function expandRect(
  rect: { left: number; right: number; top: number; bottom: number },
  padding: number,
): { left: number; right: number; top: number; bottom: number } {
  return {
    left: rect.left - padding,
    right: rect.right + padding,
    top: rect.top - padding,
    bottom: rect.bottom + padding,
  };
}

function isOrthogonalSegmentClear(
  from: { x: number; y: number },
  to: { x: number; y: number },
  obstacles: Array<{ left: number; right: number; top: number; bottom: number }>,
): boolean {
  if (Math.abs(from.x - to.x) <= ROUTE_EPSILON && Math.abs(from.y - to.y) <= ROUTE_EPSILON) return true;

  if (Math.abs(from.y - to.y) <= ROUTE_EPSILON) {
    const y = from.y;
    const minX = Math.min(from.x, to.x) + ROUTE_EPSILON;
    const maxX = Math.max(from.x, to.x) - ROUTE_EPSILON;

    for (const rect of obstacles) {
      const intersectsY = y > rect.top + ROUTE_EPSILON && y < rect.bottom - ROUTE_EPSILON;
      const intersectsX = maxX > rect.left + ROUTE_EPSILON && minX < rect.right - ROUTE_EPSILON;
      if (intersectsY && intersectsX) return false;
    }

    return true;
  }

  if (Math.abs(from.x - to.x) <= ROUTE_EPSILON) {
    const x = from.x;
    const minY = Math.min(from.y, to.y) + ROUTE_EPSILON;
    const maxY = Math.max(from.y, to.y) - ROUTE_EPSILON;

    for (const rect of obstacles) {
      const intersectsX = x > rect.left + ROUTE_EPSILON && x < rect.right - ROUTE_EPSILON;
      const intersectsY = maxY > rect.top + ROUTE_EPSILON && minY < rect.bottom - ROUTE_EPSILON;
      if (intersectsX && intersectsY) return false;
    }

    return true;
  }

  return false;
}

function isOrthogonalPathClear(
  points: { x: number; y: number }[],
  obstacles: Array<{ left: number; right: number; top: number; bottom: number }>,
): boolean {
  for (let index = 0; index < points.length - 1; index += 1) {
    if (!isOrthogonalSegmentClear(points[index], points[index + 1], obstacles)) return false;
  }

  return true;
}

function isPointInsideRect(
  point: { x: number; y: number },
  rect: { left: number; right: number; top: number; bottom: number },
): boolean {
  return (
    point.x > rect.left + ROUTE_EPSILON &&
    point.x < rect.right - ROUTE_EPSILON &&
    point.y > rect.top + ROUTE_EPSILON &&
    point.y < rect.bottom - ROUTE_EPSILON
  );
}

function doesSegmentIntersectRect(
  from: { x: number; y: number },
  to: { x: number; y: number },
  rect: { left: number; right: number; top: number; bottom: number },
): boolean {
  const clippedRect = {
    left: rect.left + ROUTE_EPSILON,
    right: rect.right - ROUTE_EPSILON,
    top: rect.top + ROUTE_EPSILON,
    bottom: rect.bottom - ROUTE_EPSILON,
  };

  if (clippedRect.left >= clippedRect.right || clippedRect.top >= clippedRect.bottom) return false;
  if (isPointInsideRect(from, clippedRect) || isPointInsideRect(to, clippedRect)) return true;

  const dx = to.x - from.x;
  const dy = to.y - from.y;
  let tEnter = 0;
  let tExit = 1;
  const bounds: Array<[number, number]> = [
    [-dx, from.x - clippedRect.left],
    [dx, clippedRect.right - from.x],
    [-dy, from.y - clippedRect.top],
    [dy, clippedRect.bottom - from.y],
  ];

  for (const [p, q] of bounds) {
    if (Math.abs(p) <= ROUTE_EPSILON) {
      if (q < 0) return false;
      continue;
    }

    const ratio = q / p;

    if (p < 0) {
      if (ratio > tExit) return false;
      if (ratio > tEnter) tEnter = ratio;
      continue;
    }

    if (ratio < tEnter) return false;
    if (ratio < tExit) tExit = ratio;
  }

  return tEnter < tExit && tExit > ROUTE_EPSILON && tEnter < 1 - ROUTE_EPSILON;
}

function isStraightSegmentClear(
  from: { x: number; y: number },
  to: { x: number; y: number },
  obstacles: Array<{ left: number; right: number; top: number; bottom: number }>,
): boolean {
  for (const obstacle of obstacles) {
    if (doesSegmentIntersectRect(from, to, obstacle)) return false;
  }

  return true;
}

function buildStraightPath(
  sourcePlan: EndpointPlan,
  targetPlan: EndpointPlan,
  obstacles: Array<{ left: number; right: number; top: number; bottom: number }>,
): { x: number; y: number }[] | null {
  const dx = targetPlan.anchor.x - sourcePlan.anchor.x;
  const dy = targetPlan.anchor.y - sourcePlan.anchor.y;
  const alignmentTolerance = 10;
  const isHorizontalStraight =
    Math.abs(dy) <= alignmentTolerance &&
    (sourcePlan.side === 'left' || sourcePlan.side === 'right') &&
    (targetPlan.side === 'left' || targetPlan.side === 'right') &&
    Math.sign(dx || 0) === HANDLE_SIDE_VECTORS[sourcePlan.side].x &&
    Math.sign(-dx || 0) === HANDLE_SIDE_VECTORS[targetPlan.side].x;
  const isVerticalStraight =
    Math.abs(dx) <= alignmentTolerance &&
    (sourcePlan.side === 'top' || sourcePlan.side === 'bottom') &&
    (targetPlan.side === 'top' || targetPlan.side === 'bottom') &&
    Math.sign(dy || 0) === HANDLE_SIDE_VECTORS[sourcePlan.side].y &&
    Math.sign(-dy || 0) === HANDLE_SIDE_VECTORS[targetPlan.side].y;

  if (!isHorizontalStraight && !isVerticalStraight) return null;
  if (!isStraightSegmentClear(sourcePlan.anchor, targetPlan.anchor, obstacles)) return null;

  return [sourcePlan.anchor, targetPlan.anchor];
}

function getOrthogonalPathLength(points: { x: number; y: number }[]): number {
  let total = 0;

  for (let index = 0; index < points.length - 1; index += 1) {
    total += Math.abs(points[index + 1].x - points[index].x) + Math.abs(points[index + 1].y - points[index].y);
  }

  return total;
}

function getOrthogonalTurnCount(points: { x: number; y: number }[]): number {
  let turns = 0;

  for (let index = 1; index < points.length - 1; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const next = points[index + 1];
    const incomingHorizontal = Math.abs(previous.y - current.y) <= ROUTE_EPSILON;
    const outgoingHorizontal = Math.abs(current.y - next.y) <= ROUTE_EPSILON;

    if (incomingHorizontal !== outgoingHorizontal) turns += 1;
  }

  return turns;
}

function scoreOrthogonalCandidate(points: { x: number; y: number }[]): number {
  return getOrthogonalPathLength(points) + getOrthogonalTurnCount(points) * 44;
}

function isSamePoint(left: { x: number; y: number }, right: { x: number; y: number }): boolean {
  return Math.abs(left.x - right.x) <= ROUTE_EPSILON && Math.abs(left.y - right.y) <= ROUTE_EPSILON;
}

function isPointOnOrthogonalSegment(
  point: { x: number; y: number },
  start: { x: number; y: number },
  end: { x: number; y: number },
): boolean {
  if (Math.abs(start.y - end.y) <= ROUTE_EPSILON) {
    return (
      Math.abs(point.y - start.y) <= ROUTE_EPSILON &&
      point.x >= Math.min(start.x, end.x) - ROUTE_EPSILON &&
      point.x <= Math.max(start.x, end.x) + ROUTE_EPSILON
    );
  }

  if (Math.abs(start.x - end.x) <= ROUTE_EPSILON) {
    return (
      Math.abs(point.x - start.x) <= ROUTE_EPSILON &&
      point.y >= Math.min(start.y, end.y) - ROUTE_EPSILON &&
      point.y <= Math.max(start.y, end.y) + ROUTE_EPSILON
    );
  }

  return false;
}

function dedupeAdjacentPoints(points: { x: number; y: number }[]): { x: number; y: number }[] {
  return points.filter((point, index, list) => index === 0 || !isSamePoint(point, list[index - 1]));
}

function preserveEndpointLead(
  points: { x: number; y: number }[],
  anchor: { x: number; y: number },
  lead: { x: number; y: number },
  endpoint: 'start' | 'end',
): { x: number; y: number }[] {
  if (points.length < 2) return points;

  if (endpoint === 'start') {
    if (!isSamePoint(points[0], anchor) || isSamePoint(points[1], lead)) return points;
    if (!isPointOnOrthogonalSegment(lead, points[0], points[1])) return points;
    return dedupeAdjacentPoints([points[0], lead, ...points.slice(1)]);
  }

  const lastIndex = points.length - 1;
  if (!isSamePoint(points[lastIndex], anchor) || isSamePoint(points[lastIndex - 1], lead)) return points;
  if (!isPointOnOrthogonalSegment(lead, points[lastIndex - 1], points[lastIndex])) return points;

  return dedupeAdjacentPoints([...points.slice(0, lastIndex), lead, points[lastIndex]]);
}

function preserveEndpointOwnership(
  points: { x: number; y: number }[],
  sourcePlan?: EndpointPlan,
  targetPlan?: EndpointPlan,
): { x: number; y: number }[] {
  let preserved = points;

  if (sourcePlan) {
    preserved = preserveEndpointLead(preserved, sourcePlan.anchor, sourcePlan.lead, 'start');
  }

  if (targetPlan) {
    preserved = preserveEndpointLead(preserved, targetPlan.anchor, targetPlan.lead, 'end');
  }

  return preserved;
}

function normalizeAcceptedPath(
  candidate: { x: number; y: number }[] | null | undefined,
  expandedObstacles: Array<{ left: number; right: number; top: number; bottom: number }>,
  tableObstacles: Array<{ left: number; right: number; top: number; bottom: number }>,
  sourcePlan?: EndpointPlan,
  targetPlan?: EndpointPlan,
): { x: number; y: number }[] | null {
  if (!candidate || candidate.length < 2) return null;
  const optimizedCandidate = optimizeOrthogonalPath(candidate, expandedObstacles);
  const ownedCandidate = preserveEndpointOwnership(optimizedCandidate, sourcePlan, targetPlan);
  return isOrthogonalPathClear(ownedCandidate, tableObstacles) ? ownedCandidate : null;
}

function buildRoutedOrthogonalPath(
  sourcePlan: EndpointPlan,
  targetPlan: EndpointPlan,
  route: (
    start: { x: number; y: number },
    end: { x: number; y: number },
    reservedSegments?: ReturnType<typeof getOrthogonalSegments>,
  ) => { x: number; y: number }[] | null,
  reservedSegments: ReturnType<typeof getOrthogonalSegments> = [],
): { x: number; y: number }[] | null {
  const routedMiddle = route(sourcePlan.lead, targetPlan.lead, reservedSegments);
  if (!routedMiddle) return null;

  return simplifyOrthogonalPath([sourcePlan.anchor, ...routedMiddle, targetPlan.anchor]);
}

function buildDirectOrthogonalPath(sourcePlan: EndpointPlan, targetPlan: EndpointPlan): { x: number; y: number }[] {
  const horizontalPreference = sourcePlan.side === 'left' || sourcePlan.side === 'right';
  const midX = sourcePlan.lead.x + (targetPlan.lead.x - sourcePlan.lead.x) / 2;
  const midY = sourcePlan.lead.y + (targetPlan.lead.y - sourcePlan.lead.y) / 2;

  const middlePoints = horizontalPreference
    ? [
        { x: midX, y: sourcePlan.lead.y },
        { x: midX, y: targetPlan.lead.y },
      ]
    : [
        { x: sourcePlan.lead.x, y: midY },
        { x: targetPlan.lead.x, y: midY },
      ];

  return simplifyOrthogonalPath([sourcePlan.anchor, sourcePlan.lead, ...middlePoints, targetPlan.lead, targetPlan.anchor]);
}

function buildOuterLaneFallbackPaths(
  sourcePlan: EndpointPlan,
  targetPlan: EndpointPlan,
  obstacles: Array<{ left: number; right: number; top: number; bottom: number }>,
): Array<{ x: number; y: number }[]> {
  if (obstacles.length === 0) return [];

  const localBounds = {
    left: Math.min(sourcePlan.anchor.x, targetPlan.anchor.x) - TABLE_NODE_WIDTH - ROUTE_ENDPOINT_LEAD * 2,
    right: Math.max(sourcePlan.anchor.x, targetPlan.anchor.x) + TABLE_NODE_WIDTH + ROUTE_ENDPOINT_LEAD * 2,
    top: Math.min(sourcePlan.anchor.y, targetPlan.anchor.y) - 240,
    bottom: Math.max(sourcePlan.anchor.y, targetPlan.anchor.y) + 240,
  };
  const relevantObstacles = obstacles.filter(
    (obstacle) =>
      obstacle.right >= localBounds.left &&
      obstacle.left <= localBounds.right &&
      obstacle.bottom >= localBounds.top &&
      obstacle.top <= localBounds.bottom,
  );
  const scopedObstacles = relevantObstacles.length > 0 ? relevantObstacles : obstacles;
  const minX = Math.min(...scopedObstacles.map((obstacle) => obstacle.left)) - ROUTE_ENDPOINT_LEAD;
  const maxX = Math.max(...scopedObstacles.map((obstacle) => obstacle.right)) + ROUTE_ENDPOINT_LEAD;
  const minY = Math.min(...scopedObstacles.map((obstacle) => obstacle.top)) - ROUTE_ENDPOINT_LEAD;
  const maxY = Math.max(...scopedObstacles.map((obstacle) => obstacle.bottom)) + ROUTE_ENDPOINT_LEAD;

  return [
    [sourcePlan.anchor, sourcePlan.lead, { x: minX, y: sourcePlan.lead.y }, { x: minX, y: targetPlan.lead.y }, targetPlan.lead, targetPlan.anchor],
    [sourcePlan.anchor, sourcePlan.lead, { x: maxX, y: sourcePlan.lead.y }, { x: maxX, y: targetPlan.lead.y }, targetPlan.lead, targetPlan.anchor],
    [sourcePlan.anchor, sourcePlan.lead, { x: sourcePlan.lead.x, y: minY }, { x: targetPlan.lead.x, y: minY }, targetPlan.lead, targetPlan.anchor],
    [sourcePlan.anchor, sourcePlan.lead, { x: sourcePlan.lead.x, y: maxY }, { x: targetPlan.lead.x, y: maxY }, targetPlan.lead, targetPlan.anchor],
  ].map((candidate) => simplifyOrthogonalPath(candidate));
}

interface DiagramNodeHandlers {
  onColumnSelect: (tableKey: string, columnName: string, kind: 'pk' | 'fk') => void;
  onGoToSql: (line: number) => void;
  onPreview: (tableKey: string) => void;
  onTableStyleChange: (tableKey: string, patch: Partial<TableVisualConfig>) => void;
}

export interface BuildDiagramCanvasGraphInput extends DiagramNodeHandlers {
  effectiveLineStyle: RelationLineStyle;
  elkLayout: ElkLayoutResult;
  globalTypeMode: TypeDisplayMode;
  hasManualLayout: boolean;
  linePattern: RelationLinePattern;
  parsed: ParseResult;
  relationGrouping: RelationGroupingMode;
  tableConfig: Record<string, TableVisualConfig>;
  tableMap: Map<string, TableModel>;
  tableDesignTheme: TableDesignTheme;
  tablePositions: Record<string, Position | DiagramViewport>;
  theme: ThemeMode;
}

export interface DiagramCanvasGraph {
  edges: Edge[];
  nodes: FlowNode[];
}

interface BuildDiagramCanvasNodesInput extends DiagramNodeHandlers {
  globalTypeMode: TypeDisplayMode;
  parsed: ParseResult;
  resolvedPositions: Record<string, Position | DiagramViewport>;
  tableConfig: Record<string, TableVisualConfig>;
  tableDesignTheme: TableDesignTheme;
  theme: ThemeMode;
}

interface BuildDiagramCanvasEdgesInput {
  effectiveLineStyle: RelationLineStyle;
  elkLayout: ElkLayoutResult;
  globalTypeMode: TypeDisplayMode;
  hasManualLayout: boolean;
  linePattern: RelationLinePattern;
  parsed: ParseResult;
  relationGrouping: RelationGroupingMode;
  resolvedPositions: Record<string, Position | DiagramViewport>;
  routingMode?: 'full' | 'simplified';
  renderRelationshipIds?: ReadonlySet<string>;
  seedEdges?: Edge[];
  tableMap: Map<string, TableModel>;
}

export function resolveDiagramTablePositions(
  parsed: ParseResult,
  elkLayout: ElkLayoutResult,
  tablePositions: Record<string, Position | DiagramViewport>,
): Record<string, Position | DiagramViewport> {
  return Object.fromEntries(
    parsed.tables.map((table) => [table.key, tablePositions[table.key] ?? elkLayout.positions[table.key] ?? { x: 100, y: 100 }]),
  );
}

export function buildDiagramCanvasNodes({
  globalTypeMode,
  onColumnSelect,
  onGoToSql,
  onPreview,
  onTableStyleChange,
  parsed,
  resolvedPositions,
  tableConfig,
  tableDesignTheme,
  theme,
}: BuildDiagramCanvasNodesInput): FlowNode[] {
  return parsed.tables.map((table) => ({
    id: table.key,
    position: resolvedPositions[table.key] ?? { x: 100, y: 100 },
    type: 'tableNode',
    data: {
      table,
      config: resolveTableConfig(theme, tableConfig[table.key]),
      appTheme: theme,
      designTheme: tableDesignTheme,
      typeMode: globalTypeMode,
      onColumnSelect,
      onGoToSql,
      onPreview,
      onTableStyleChange,
    } satisfies TableNodeData,
    draggable: true,
  }));
}

function getSeedCommittedSegments(seedEdges: Edge[] | undefined): ReturnType<typeof getOrthogonalSegments> {
  if (!seedEdges || seedEdges.length === 0) return [];

  return seedEdges.flatMap((edge) => {
    const points = ((edge.data ?? {}) as RoutedEdgeData).points;
    return points && points.length >= 2 ? getOrthogonalSegments(points) : [];
  });
}

export function buildDiagramCanvasEdges({
  effectiveLineStyle,
  elkLayout,
  hasManualLayout,
  linePattern,
  parsed,
  relationGrouping,
  resolvedPositions,
  routingMode = 'full',
  renderRelationshipIds,
  seedEdges,
  tableMap,
}: BuildDiagramCanvasEdgesInput): Edge[] {
  const edges: Edge[] = [];
  const isSimplifiedRouting = routingMode === 'simplified';
  const committedSegments = isSimplifiedRouting ? [] : getSeedCommittedSegments(seedEdges);
  const tableFrames = new Map(
    parsed.tables.map((table) => [
      table.key,
      {
        x: resolvedPositions[table.key]?.x ?? 0,
        y: resolvedPositions[table.key]?.y ?? 0,
        height: getTableNodeHeight(table),
      },
    ] as const),
  );
  const tableObstacleEntries = parsed.tables.map((table) => {
    const frame = tableFrames.get(table.key);
    if (!frame) {
      return [
        table.key,
        {
          left: 0,
          right: TABLE_NODE_WIDTH,
          top: 0,
          bottom: 120,
        },
      ] as const;
    }

    return [
      table.key,
      {
        left: frame.x,
        right: frame.x + TABLE_NODE_WIDTH,
        top: frame.y,
        bottom: frame.y + frame.height,
      },
    ] as const;
  });
  const tableObstacleMap = new Map(tableObstacleEntries);
  const tableObstacles = Array.from(tableObstacleMap.values());
  const expandedObstacleMap = new Map(
    tableObstacleEntries.map(([tableKey, rect]) => [tableKey, expandRect(rect, ROUTE_OBSTACLE_CLEARANCE)] as const),
  );
  const expandedObstacles = Array.from(expandedObstacleMap.values());
  const relationshipsForRouting = [...parsed.relationships].sort((left, right) => {
    const leftSource = tableFrames.get(left.sourceTable);
    const leftTarget = tableFrames.get(left.targetTable);
    const rightSource = tableFrames.get(right.sourceTable);
    const rightTarget = tableFrames.get(right.targetTable);

    const leftDistance =
      leftSource && leftTarget
        ? Math.abs(getTableCenter(leftSource).x - getTableCenter(leftTarget).x) +
          Math.abs(getTableCenter(leftSource).y - getTableCenter(leftTarget).y)
        : Number.MAX_SAFE_INTEGER;
    const rightDistance =
      rightSource && rightTarget
        ? Math.abs(getTableCenter(rightSource).x - getTableCenter(rightTarget).x) +
          Math.abs(getTableCenter(rightSource).y - getTableCenter(rightTarget).y)
        : Number.MAX_SAFE_INTEGER;

    return leftDistance - rightDistance || left.id.localeCompare(right.id);
  });
  const relationshipsToRender = renderRelationshipIds
    ? relationshipsForRouting.filter((relationship) => renderRelationshipIds.has(relationship.id))
    : relationshipsForRouting;
  const endpointRelationships = isSimplifiedRouting ? relationshipsToRender : relationshipsForRouting;
  const baseSourcePlans = buildEndpointPlans(endpointRelationships, elkLayout.edgePaths, tableFrames, 'source', 'separate');
  const baseTargetPlans = buildEndpointPlans(endpointRelationships, elkLayout.edgePaths, tableFrames, 'target', 'separate');
  const targetBundles =
    relationGrouping === 'bundled' && !isSimplifiedRouting
      ? buildEndpointPlans(endpointRelationships, elkLayout.edgePaths, tableFrames, 'target', 'bundled')
      : new Map<string, EndpointPlan>();
  const routingPins = endpointRelationships.flatMap((rel) => {
    const sourcePlan = baseSourcePlans.get(rel.id);
    const targetPlan = targetBundles.get(rel.id) ?? baseTargetPlans.get(rel.id);

    return [
      ...(sourcePlan ? [sourcePlan.anchor, sourcePlan.lead] : []),
      ...(targetPlan ? [targetPlan.lead, targetPlan.anchor] : []),
    ];
  });
  const orthogonalRouter = isSimplifiedRouting
    ? null
    : createOrthogonalRouter(expandedObstacles, routingPins, {
        outerPadding: ROUTER_OUTER_PADDING,
        turnPenalty: ROUTER_TURN_PENALTY,
        segmentPenalty: ROUTER_SEGMENT_PENALTY,
        reverseDirectionPenalty: ROUTER_REVERSE_DIRECTION_PENALTY,
        sharedSegmentPenalty: ROUTER_SHARED_SEGMENT_PENALTY,
        nearbySegmentPenalty: ROUTER_NEARBY_SEGMENT_PENALTY,
        nearbySegmentDistance: ROUTER_NEARBY_SEGMENT_DISTANCE,
        outerLanePenalty: ROUTER_OUTER_LANE_PENALTY,
        centerLanePenalty: ROUTER_CENTER_LANE_PENALTY,
        minCorridorSpan: ROUTER_MIN_CORRIDOR_SPAN,
      });

  for (const rel of relationshipsToRender) {
    const pathMeta = elkLayout.edgePaths[rel.id];
    const sourcePlan = baseSourcePlans.get(rel.id);
    const baseTargetPlan = baseTargetPlans.get(rel.id);
    const bundledTargetPlan = targetBundles.get(rel.id);
    const preferredTargetPlan = bundledTargetPlan ?? baseTargetPlan;

    const sourceFrame = tableFrames.get(rel.sourceTable);
    const targetFrame = tableFrames.get(rel.targetTable);
    const fallbackHandlePair =
      sourceFrame && targetFrame
        ? resolveHandlePair(getTableCenter(sourceFrame), getTableCenter(targetFrame))
        : null;

    let renderedPoints: { x: number; y: number }[] = [];
    let usesStraightRoute = false;

    const acceptCandidatePath = (
      candidate: { x: number; y: number }[] | null | undefined,
      targetPlanOverride?: EndpointPlan,
    ): boolean => {
      if (isSimplifiedRouting) {
        if (!candidate || candidate.length < 2) return false;
        renderedPoints = simplifyOrthogonalPath(candidate);
        usesStraightRoute = false;
        return true;
      }

      const accepted = normalizeAcceptedPath(
        candidate,
        expandedObstacles,
        tableObstacles,
        sourcePlan,
        targetPlanOverride ?? preferredTargetPlan ?? baseTargetPlan,
      );
      if (!accepted) return false;
      renderedPoints = accepted;
      usesStraightRoute = false;
      return true;
    };

    const acceptStraightPath = (candidate: { x: number; y: number }[] | null | undefined): boolean => {
      if (!candidate || candidate.length < 2) return false;
      renderedPoints = candidate;
      usesStraightRoute = true;
      return true;
    };

    const straightObstacles = isSimplifiedRouting
      ? []
      : parsed.tables
          .filter((table) => table.key !== rel.sourceTable && table.key !== rel.targetTable)
          .map((table) => expandedObstacleMap.get(table.key))
          .filter((obstacle): obstacle is { left: number; right: number; top: number; bottom: number } => Boolean(obstacle));

    if (sourcePlan && preferredTargetPlan) {
      acceptStraightPath(buildStraightPath(sourcePlan, preferredTargetPlan, straightObstacles));
    }

    if (renderedPoints.length === 0 && isSimplifiedRouting && sourcePlan && preferredTargetPlan) {
      acceptCandidatePath(buildDirectOrthogonalPath(sourcePlan, preferredTargetPlan), preferredTargetPlan);
    }

    if (!usesStraightRoute && !isSimplifiedRouting && effectiveLineStyle === 'orthogonal' && sourcePlan && baseTargetPlan) {
      const candidatePath = bundledTargetPlan
        ? normalizeAcceptedPath(
            buildRoutedOrthogonalPath(sourcePlan, bundledTargetPlan, orthogonalRouter?.route ?? (() => null), committedSegments),
            expandedObstacles,
            tableObstacles,
            sourcePlan,
            bundledTargetPlan,
          )
        : null;
      const fallbackPath = normalizeAcceptedPath(
        buildRoutedOrthogonalPath(sourcePlan, baseTargetPlan, orthogonalRouter?.route ?? (() => null), committedSegments),
        expandedObstacles,
        tableObstacles,
        sourcePlan,
        baseTargetPlan,
      );

      const preferredCandidate =
        candidatePath && fallbackPath
          ? scoreOrthogonalCandidate(candidatePath) <= scoreOrthogonalCandidate(fallbackPath) + 24
            ? candidatePath
            : fallbackPath
          : candidatePath ?? fallbackPath;

      if (!acceptCandidatePath(preferredCandidate)) {
        const outerLaneCandidates = buildOuterLaneFallbackPaths(sourcePlan, bundledTargetPlan ?? baseTargetPlan, expandedObstacles);

        for (const outerLaneCandidate of outerLaneCandidates) {
          if (acceptCandidatePath(outerLaneCandidate)) break;
        }
      }
    } else if (!hasManualLayout && pathMeta?.points?.length) {
      acceptCandidatePath(pathMeta.points);
    }

    if (renderedPoints.length === 0 && pathMeta?.points?.length) {
      acceptCandidatePath(pathMeta.points);
    }

    if (renderedPoints.length === 0 && sourcePlan && baseTargetPlan) {
      acceptCandidatePath(buildDirectOrthogonalPath(sourcePlan, baseTargetPlan));
    }

    if (renderedPoints.length < 2) continue;

    const relationshipLabel = `${rel.sourceColumn} → ${rel.targetColumn}`;
    const cardinality = deriveRelationshipCardinality(rel, tableMap);

    const commonEdge = {
      id: rel.id,
      source: rel.sourceTable,
      target: rel.targetTable,
      sourceHandle: sourcePlan ? `source-${sourcePlan.side}` : fallbackHandlePair?.sourceHandle ?? pathMeta?.sourceHandle,
      targetHandle: preferredTargetPlan
        ? `target-${preferredTargetPlan.side}`
        : fallbackHandlePair?.targetHandle ?? pathMeta?.targetHandle,
      zIndex: 1,
      style: {
        stroke: '#94a3b8',
        strokeWidth: 2,
        strokeLinecap: linePattern === 'dashed' ? 'butt' : 'round',
        strokeDasharray: linePattern === 'dashed' ? '10 8' : undefined,
        strokeDashoffset: linePattern === 'dashed' ? 0 : undefined,
        strokeOpacity: linePattern === 'dashed' ? 1 : 0.88,
        filter: linePattern === 'dashed' ? undefined : 'drop-shadow(0 0 1px rgba(15, 23, 42, 0.45))',
      },
      interactionWidth: 34,
      animated: false,
    } as const;

    const labelPoint = getPolylineMidpoint(renderedPoints);
    const path =
      effectiveLineStyle === 'orthogonal' && !usesStraightRoute
        ? pointsToSvgPathWithLineJumps(renderedPoints, committedSegments, {
            radius: 8,
            arcHeight: 12,
            endpointClearance: 16,
          })
        : pointsToCornerPath(renderedPoints, {
            mode: 'straight',
            cornerSize: 54,
            curveStrength: 1.2,
          });

    if (effectiveLineStyle === 'orthogonal' && !usesStraightRoute && !isSimplifiedRouting) {
      committedSegments.push(...getOrthogonalSegments(renderedPoints));
    }

    edges.push({
      ...commonEdge,
      type: 'routed',
      label: relationshipLabel,
      data: {
        path,
        points: renderedPoints,
        labelX: labelPoint.x,
        labelY: labelPoint.y,
        showLabel: true,
        deferredRouting: isSimplifiedRouting,
        draggingPreview: false,
        cardinality,
      } satisfies RoutedEdgeData,
    });
  }

  return edges;
}

export function buildDiagramCanvasGraph({
  effectiveLineStyle,
  elkLayout,
  globalTypeMode,
  hasManualLayout,
  linePattern,
  onColumnSelect,
  onGoToSql,
  onPreview,
  onTableStyleChange,
  parsed,
  relationGrouping,
  tableConfig,
  tableMap,
  tableDesignTheme,
  tablePositions,
  theme,
}: BuildDiagramCanvasGraphInput): DiagramCanvasGraph {
  const resolvedPositions = resolveDiagramTablePositions(parsed, elkLayout, tablePositions);
  const nodes = buildDiagramCanvasNodes({
    globalTypeMode,
    onColumnSelect,
    onGoToSql,
    onPreview,
    onTableStyleChange,
    parsed,
    resolvedPositions,
    tableConfig,
    tableDesignTheme,
    theme,
  });
  const edges = buildDiagramCanvasEdges({
    effectiveLineStyle,
    elkLayout,
    globalTypeMode,
    hasManualLayout,
    linePattern,
    parsed,
    relationGrouping,
    resolvedPositions,
    tableMap,
  });

  return {
    edges,
    nodes,
  };
}
