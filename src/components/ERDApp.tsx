import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Background,
  Controls,
  MiniMap,
  PanOnScrollMode,
  ReactFlow,
  type ReactFlowInstance,
  type Viewport,
  addEdge,
  getNodesBounds,
  getViewportForBounds,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type Node as FlowNode,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { toJpeg, toPng, toSvg } from 'html-to-image';
import { DownloadCloud, HelpCircle, Maximize2, Minimize2, Moon, MoreHorizontal, Search, Sparkles, Sun, X } from 'lucide-react';

import { getTableNodeHeight, TABLE_NODE_WIDTH } from '../lib/diagramGeometry';
import { resolveHandlePair } from '../lib/edgeRouting';
import { createElkLayout, createFallbackLayout, type ElkLayoutResult } from '../lib/elkLayout';
import {
  createOrthogonalRouter,
  getOrthogonalSegments,
  optimizeOrthogonalPath,
  pointsToCornerPath,
  getPolylineMidpoint,
  pointsToSvgPathWithLineJumps,
} from '../lib/orthogonalRouter';
import { downloadDataUrl } from '../lib/download';
import { parseSqlToModel } from '../lib/sqlParser';
import { useAppStore } from '../store/appStore';
import type {
  AmbiguousReference,
  ColumnModel,
  DiagramViewport,
  Relationship,
  RelationshipCardinality,
  RelationshipEndpointCardinality,
  RelationGroupingMode,
  RelationLinePattern,
  TableDesignTheme,
  TableModel,
  TableVisualConfig,
  ThemeMode,
  TypeDisplayMode,
  ViewMode,
} from '../types/erd';
import RoutedEdge, { CardinalityLegendMark } from './edges/RoutedEdge';
import SqlEditorPanel from './SqlEditorPanel';
import TableNode from './nodes/TableNode';

const nodeTypes = { tableNode: TableNode };
const edgeTypes = { routed: RoutedEdge };
const ELK_LAYOUT_TIMEOUT_MS = 2500;

type LayoutEngineMode = 'elk' | 'fallback';

interface DiagramSearchResult {
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

const CARDINALITY_MEANINGS: Array<{ token: '0' | '1' | 'N'; label: string }> = [
  { token: '0', label: 'opcional' },
  { token: '1', label: 'obligatorio / uno' },
  { token: 'N', label: 'muchos' },
];

const CARDINALITY_EXAMPLES: Array<{ label: string; cardinality: RelationshipEndpointCardinality }> = [
  { label: '0..1', cardinality: { min: 0, max: 'one' } },
  { label: '1..1', cardinality: { min: 1, max: 'one' } },
  { label: '0..N', cardinality: { min: 0, max: 'many' } },
  { label: '1..N', cardinality: { min: 1, max: 'many' } },
];

function DiagramCardinalityLegend() {
  return (
    <aside
      className="overlay-panel diagram-legend diagram-help-panel"
      aria-label="Leyenda de cardinalidad"
    >
      <div className="diagram-legend__header">
        <span className="overlay-label">Leyenda</span>
        <span className="diagram-legend__title">Cardinalidad</span>
      </div>

      <div className="diagram-legend__tokens" aria-label="Equivalencias básicas">
        {CARDINALITY_MEANINGS.map((item) => (
          <span key={item.token} className="diagram-legend__token-pill">
            <strong>{item.token}</strong>
            <span>{item.label}</span>
          </span>
        ))}
      </div>

      <div className="diagram-legend__examples" aria-label="Ejemplos de combinaciones">
        {CARDINALITY_EXAMPLES.map((item) => (
          <div key={item.label} className="diagram-legend__example">
            <span className="diagram-legend__example-label">{item.label}</span>
            <span className="diagram-legend__example-mark">
              <CardinalityLegendMark cardinality={item.cardinality} />
            </span>
          </div>
        ))}
      </div>
    </aside>
  );
}


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

const EXPORT_MIN_WIDTH = 1400;
const EXPORT_MIN_HEIGHT = 900;
const EXPORT_PADDING = 120;

function formatExportLabel(format: 'svg' | 'png' | 'jpeg'): string {
  if (format === 'svg') return 'SVG';
  if (format === 'png') return 'PNG';
  return 'JPEG';
}

function ensureSvgBackground(dataUrl: string, fillColor: string): string {
  const utfPrefix = 'data:image/svg+xml;charset=utf-8,';
  if (!dataUrl.startsWith(utfPrefix)) return dataUrl;

  try {
    const decoded = decodeURIComponent(dataUrl.slice(utfPrefix.length));
    if (!decoded.startsWith('<svg')) return dataUrl;
    if (decoded.includes('data-sql-bg="true"')) return dataUrl;

    const backgroundRect = `<rect data-sql-bg="true" x="0" y="0" width="100%" height="100%" fill="${fillColor}" />`;
    const withBackground = decoded.replace(/<svg([^>]*)>/, `<svg$1>${backgroundRect}`);
    return `${utfPrefix}${encodeURIComponent(withBackground)}`;
  } catch {
    return dataUrl;
  }
}

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

function deriveRelationshipCardinality(
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

function getHighlightedEdges(
  selected: { table: string; column: string; kind: 'pk' | 'fk' } | null,
  relationships: Relationship[],
): Set<string> {
  if (!selected) return new Set<string>();
  const selectedCol = normalize(selected.column);

  const ids = relationships
    .filter((rel) => {
      if (selected.kind === 'pk') {
        return rel.targetTable === selected.table && normalize(rel.targetColumn) === selectedCol;
      }

      return rel.sourceTable === selected.table && normalize(rel.sourceColumn) === selectedCol;
    })
    .map((rel) => rel.id);

  return new Set(ids);
}

function getActiveColumns(
  selected: { table: string; column: string; kind: 'pk' | 'fk' } | null,
  relationships: Relationship[],
): Set<string> {
  const active = new Set<string>();
  if (!selected) return active;

  const selectedCol = normalize(selected.column);
  active.add(`${selected.table}.${selectedCol}`);

  for (const rel of relationships) {
    if (selected.kind === 'pk' && rel.targetTable === selected.table && normalize(rel.targetColumn) === selectedCol) {
      active.add(`${rel.sourceTable}.${normalize(rel.sourceColumn)}`);
    }
    if (selected.kind === 'fk' && rel.sourceTable === selected.table && normalize(rel.sourceColumn) === selectedCol) {
      active.add(`${rel.targetTable}.${normalize(rel.targetColumn)}`);
    }
  }

  return active;
}

function getActiveColumnsForRelationship(relationshipId: string | null, relationships: Relationship[]): Set<string> {
  const active = new Set<string>();
  if (!relationshipId) return active;

  const relationship = relationships.find((rel) => rel.id === relationshipId);
  if (!relationship) return active;

  active.add(`${relationship.sourceTable}.${normalize(relationship.sourceColumn)}`);
  active.add(`${relationship.targetTable}.${normalize(relationship.targetColumn)}`);

  return active;
}

export default function ERDApp() {
  const {
    sqlText,
    setSqlText,
    theme,
    hasHydrated,
    setTheme,
    globalTypeMode,
    setGlobalTypeMode,
    exportScale,
    setExportScale,
    linePattern,
    setLinePattern,
    relationGrouping,
    setRelationGrouping,
    tableDesignTheme,
    setTableDesignTheme,
    dialect,
    setDialect,
    viewMode,
    setViewMode,
    activeViewTab,
    setActiveViewTab,
    diagramViewport,
    setDiagramViewport,
    panelSplit,
    setPanelSplit,
    tableConfig,
    setTableConfig,
    resetAllTableColorsToTheme,
    tablePositions,
    setTablePosition,
    resetTablePositions,
  } = useAppStore();

  const parsed = useMemo(() => parseSqlToModel(sqlText, dialect), [sqlText, dialect]);
  const tableMap = useMemo(() => new Map(parsed.tables.map((table) => [table.key, table] as const)), [parsed.tables]);
  const effectiveLineStyle = 'orthogonal';

  const [selected, setSelected] = useState<{ table: string; column: string; kind: 'pk' | 'fk' } | null>(null);
  const [selectedRelationshipId, setSelectedRelationshipId] = useState<string | null>(null);
  const [goToLine, setGoToLine] = useState<number | null>(null);
  const [previewTable, setPreviewTable] = useState<string | null>(null);
  const [diagramSearch, setDiagramSearch] = useState('');
  const [isDiagramSearchOpen, setIsDiagramSearchOpen] = useState(false);
  const [isDiagramHelpOpen, setIsDiagramHelpOpen] = useState(false);
  const [activeDiagramSearchIndex, setActiveDiagramSearchIndex] = useState(0);
  const [openDiagramMenu, setOpenDiagramMenu] = useState(false);
  const [exportingFormat, setExportingFormat] = useState<'svg' | 'png' | 'jpeg' | null>(null);
  const [isResizingPanels, setIsResizingPanels] = useState(false);
  const [isDiagramFullscreen, setIsDiagramFullscreen] = useState(false);
  const [elkLayout, setElkLayout] = useState<ElkLayoutResult | null>(null);
  const [layoutMode, setLayoutMode] = useState<LayoutEngineMode>('elk');
  const [layoutWarning, setLayoutWarning] = useState<string>('');
  const [layoutPending, setLayoutPending] = useState(false);
  const [layoutRevision, setLayoutRevision] = useState(0);
  const [focusedAmbiguousTables, setFocusedAmbiguousTables] = useState<Set<string>>(new Set());
  const [focusedAmbiguousColumns, setFocusedAmbiguousColumns] = useState<Set<string>>(new Set());
  const [nodes, setNodes, onNodesChange] = useNodesState<FlowNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const exportRef = useRef<HTMLDivElement>(null);
  const diagramSurfaceRef = useRef<HTMLDivElement>(null);
  const panelsRef = useRef<HTMLElement>(null);
  const diagramMenuRef = useRef<HTMLDivElement>(null);
  const diagramMenuTriggerRef = useRef<HTMLButtonElement>(null);
  const diagramSearchInputRef = useRef<HTMLInputElement>(null);
  const diagramSearchResultsRef = useRef<HTMLDivElement>(null);
  const diagramSearchResultItemRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const reactFlowRef = useRef<ReactFlowInstance<FlowNode, Edge> | null>(null);
  const focusResetTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!hasHydrated) return;
    document.documentElement.dataset.theme = theme;
  }, [hasHydrated, theme]);

  useEffect(() => {
    const onFullscreenChange = () => {
      setIsDiagramFullscreen(document.fullscreenElement === diagramSurfaceRef.current);
    };

    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  useEffect(() => {
    if (!openDiagramMenu) return;

    const closeMenu = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;

      const clickedMenu = diagramMenuRef.current?.contains(target);
      const clickedTrigger = diagramMenuTriggerRef.current?.contains(target);
      if (!clickedMenu && !clickedTrigger) setOpenDiagramMenu(false);
    };

    document.addEventListener('pointerdown', closeMenu);
    return () => document.removeEventListener('pointerdown', closeMenu);
  }, [openDiagramMenu]);

  useEffect(() => {
    if (!isDiagramSearchOpen) return;

    const focusId = window.requestAnimationFrame(() => {
      diagramSearchInputRef.current?.focus();
      diagramSearchInputRef.current?.select();
    });

    return () => window.cancelAnimationFrame(focusId);
  }, [isDiagramSearchOpen]);

  useEffect(() => {
    setActiveDiagramSearchIndex(0);
  }, [diagramSearch]);

  useEffect(() => {
    if (!isResizingPanels) return;

    const onPointerMove = (event: PointerEvent) => {
      if (!panelsRef.current) return;
      const rect = panelsRef.current.getBoundingClientRect();
      const ratio = ((event.clientX - rect.left) / rect.width) * 100;
      setPanelSplit(ratio);
    };

    const onPointerUp = () => setIsResizingPanels(false);

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);

    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, [isResizingPanels, setPanelSplit]);

  const highlightedEdgeIds = useMemo(() => {
    if (selectedRelationshipId) return new Set([selectedRelationshipId]);
    return getHighlightedEdges(selected, parsed.relationships);
  }, [selected, selectedRelationshipId, parsed.relationships]);
  const activeColumns = useMemo(() => {
    if (selectedRelationshipId) return getActiveColumnsForRelationship(selectedRelationshipId, parsed.relationships);
    return getActiveColumns(selected, parsed.relationships);
  }, [selected, selectedRelationshipId, parsed.relationships]);
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
  const fallbackLayout = useMemo(
    () => createFallbackLayout(parsed.tables, parsed.relationships, tablePositions, { relationGrouping }),
    [parsed.tables, parsed.relationships, tablePositions, relationGrouping],
  );
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

  useEffect(() => () => {
    if (focusResetTimerRef.current) window.clearTimeout(focusResetTimerRef.current);
  }, []);

  const focusTablesAndColumns = useCallback((tableKeys: Set<string>, columnKeys: Set<string>) => {
    setFocusedAmbiguousTables(tableKeys);
    setFocusedAmbiguousColumns(columnKeys);

    const focusNodes = nodes.filter((node) => tableKeys.has(node.id));
    if (focusNodes.length > 0) {
      if (viewMode === 'tabs') setActiveViewTab('diagram');
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          void reactFlowRef.current?.fitView({
            nodes: focusNodes,
            duration: 450,
            padding: tableKeys.size === 1 ? 0.5 : 0.35,
            minZoom: 0.12,
            maxZoom: 1.2,
          });
        });
      });
    }

    if (focusResetTimerRef.current) window.clearTimeout(focusResetTimerRef.current);
    focusResetTimerRef.current = window.setTimeout(() => {
      setFocusedAmbiguousTables(new Set());
      setFocusedAmbiguousColumns(new Set());
    }, 5000);
  }, [nodes, setActiveViewTab, viewMode]);

  const focusAmbiguousReference = useCallback((reference: AmbiguousReference) => {
    focusTablesAndColumns(
      new Set<string>([reference.sourceTable, ...reference.candidateTargetTables]),
      new Set<string>([`${reference.sourceTable}.${normalize(reference.sourceColumn)}`]),
    );
  }, [focusTablesAndColumns]);

  const focusDiagramSearchResult = useCallback((result: DiagramSearchResult) => {
    setSelected(null);
    setSelectedRelationshipId(null);
    focusTablesAndColumns(
      new Set<string>([result.tableKey]),
      result.columnName ? new Set<string>([`${result.tableKey}.${normalize(result.columnName)}`]) : new Set<string>(),
    );
  }, [focusTablesAndColumns]);
  const activeDiagramSearchResult = diagramSearchResults[activeDiagramSearchIndex] ?? null;

  useEffect(() => {
    if (activeDiagramSearchIndex < diagramSearchResults.length) return;
    setActiveDiagramSearchIndex(Math.max(0, diagramSearchResults.length - 1));
  }, [activeDiagramSearchIndex, diagramSearchResults.length]);

  useEffect(() => {
    if (!isDiagramSearchOpen || !activeDiagramSearchResult) return;

    const activeItem = diagramSearchResultItemRefs.current[activeDiagramSearchResult.id];
    if (!activeItem) return;

    activeItem.scrollIntoView({ block: 'nearest' });
  }, [activeDiagramSearchResult, isDiagramSearchOpen]);

  useEffect(() => {
    let cancelled = false;

    if (parsed.tables.length === 0) {
      setElkLayout({ positions: {}, edgePaths: {} });
      setLayoutMode('elk');
      setLayoutWarning('');
      setLayoutPending(false);
      return;
    }

    setLayoutPending(true);

    let raceId: number | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      raceId = window.setTimeout(() => reject(new Error('ELK_LAYOUT_TIMEOUT')), ELK_LAYOUT_TIMEOUT_MS);
    });

    void Promise.race([createElkLayout(parsed.tables, parsed.relationships, { relationGrouping }), timeoutPromise])
      .then((layout) => {
        if (cancelled) return;
        setElkLayout(layout as ElkLayoutResult);
        setLayoutMode('elk');
        setLayoutWarning('');
      })
      .catch((error) => {
        if (cancelled) return;
        // eslint-disable-next-line no-console
        console.error('Error generando layout ELK:', error);
        setElkLayout(fallbackLayout);
        setLayoutMode('fallback');
        setLayoutWarning(
          error instanceof Error && error.message === 'ELK_LAYOUT_TIMEOUT'
            ? 'EL layout tardó demasiado; se activó el modo rápido de respaldo.'
            : 'ELK falló en este esquema; se activó el layout de respaldo para mantener la app operativa.',
        );
      })
      .finally(() => {
        if (raceId) window.clearTimeout(raceId);
        if (!cancelled) setLayoutPending(false);
      });

    return () => {
      cancelled = true;
      if (raceId) window.clearTimeout(raceId);
    };
  }, [parsed.tables, parsed.relationships, fallbackLayout, layoutRevision, relationGrouping]);

  useEffect(() => {
    if (!elkLayout) return;

    const resolvedPositions = Object.fromEntries(
      parsed.tables.map((table) => [
        table.key,
        tablePositions[table.key] ?? elkLayout.positions[table.key] ?? { x: 100, y: 100 },
      ]),
    );

    const builtNodes: FlowNode[] = parsed.tables.map((table) => ({
      id: table.key,
      position: resolvedPositions[table.key] ?? { x: 100, y: 100 },
      type: 'tableNode',
      data: {
        table,
        config: resolveTableConfig(theme, tableConfig[table.key]),
        appTheme: theme,
        designTheme: tableDesignTheme,
        typeMode: globalTypeMode,
        activeColumns,
        ambiguousColumns,
        isAmbiguousTable: ambiguousTableKeys.has(table.key),
        focusedAmbiguousColumns,
        isFocusedAmbiguousTable: focusedAmbiguousTables.has(table.key),
        onColumnSelect: (tableKey: string, columnName: string, kind: 'pk' | 'fk') => {
          setSelectedRelationshipId(null);
          setSelected((prev) =>
            prev?.table === tableKey && normalize(prev.column) === normalize(columnName) && prev.kind === kind
              ? null
              : { table: tableKey, column: columnName, kind },
          );
        },
        onGoToSql: (line: number) => {
          setGoToLine(line);
          if (viewMode === 'tabs') setActiveViewTab('editor');
        },
        onPreview: (tableKey: string) => setPreviewTable(tableKey),
        onTableStyleChange: (tableKey: string, patch: Partial<TableVisualConfig>) => setTableConfig(tableKey, patch),
      },
      draggable: true,
    }));

    const builtEdges: Edge[] = [];
    const committedSegments: ReturnType<typeof getOrthogonalSegments> = [];
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
    const baseSourcePlans = buildEndpointPlans(relationshipsForRouting, elkLayout.edgePaths, tableFrames, 'source', 'separate');
    const baseTargetPlans = buildEndpointPlans(relationshipsForRouting, elkLayout.edgePaths, tableFrames, 'target', 'separate');
    const targetBundles =
      relationGrouping === 'bundled'
        ? buildEndpointPlans(relationshipsForRouting, elkLayout.edgePaths, tableFrames, 'target', 'bundled')
        : new Map<string, EndpointPlan>();
    const routingPins = relationshipsForRouting.flatMap((rel) => {
      const sourcePlan = baseSourcePlans.get(rel.id);
      const targetPlan = targetBundles.get(rel.id) ?? baseTargetPlans.get(rel.id);

      return [
        ...(sourcePlan ? [sourcePlan.anchor, sourcePlan.lead] : []),
        ...(targetPlan ? [targetPlan.lead, targetPlan.anchor] : []),
      ];
    });
    const orthogonalRouter = createOrthogonalRouter(expandedObstacles, routingPins, {
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

    for (const rel of relationshipsForRouting) {
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

      const straightObstacles = parsed.tables
        .filter((table) => table.key !== rel.sourceTable && table.key !== rel.targetTable)
        .map((table) => expandedObstacleMap.get(table.key))
        .filter((obstacle): obstacle is { left: number; right: number; top: number; bottom: number } => Boolean(obstacle));

      if (sourcePlan && preferredTargetPlan) {
        acceptStraightPath(buildStraightPath(sourcePlan, preferredTargetPlan, straightObstacles));
      }

      if (!usesStraightRoute && effectiveLineStyle === 'orthogonal' && sourcePlan && baseTargetPlan) {
        const candidatePath = bundledTargetPlan
          ? normalizeAcceptedPath(
              buildRoutedOrthogonalPath(sourcePlan, bundledTargetPlan, orthogonalRouter.route, committedSegments),
              expandedObstacles,
              tableObstacles,
              sourcePlan,
              bundledTargetPlan,
            )
          : null;
        const fallbackPath = normalizeAcceptedPath(
          buildRoutedOrthogonalPath(sourcePlan, baseTargetPlan, orthogonalRouter.route, committedSegments),
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

      const highlighted = highlightedEdgeIds.has(rel.id);
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
        zIndex: highlighted ? 2 : 1,
        style: {
          stroke: highlighted ? '#22d3ee' : '#94a3b8',
          strokeWidth: highlighted ? 3 : 2,
          strokeLinecap: linePattern === 'dashed' ? 'butt' : 'round',
          strokeDasharray: linePattern === 'dashed' ? '10 8' : undefined,
          strokeDashoffset: linePattern === 'dashed' ? 0 : undefined,
          strokeOpacity: linePattern === 'dashed' || highlighted ? 1 : 0.88,
          filter: linePattern === 'dashed' ? undefined : 'drop-shadow(0 0 1px rgba(15, 23, 42, 0.45))',
        },
        interactionWidth: 34,
        animated: highlighted,
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

      if (effectiveLineStyle === 'orthogonal' && !usesStraightRoute) {
        committedSegments.push(...getOrthogonalSegments(renderedPoints));
      }

      builtEdges.push({
        ...commonEdge,
        type: 'routed',
        label: highlighted ? relationshipLabel : undefined,
        data: {
          path,
          points: renderedPoints,
          labelX: labelPoint.x,
          labelY: labelPoint.y,
          showLabel: highlighted,
          cardinality,
        },
      });
    }

    setNodes(builtNodes);
    setEdges(builtEdges);
  }, [
    parsed.tables,
    parsed.relationships,
    elkLayout,
    layoutRevision,
    theme,
    tableDesignTheme,
    globalTypeMode,
    linePattern,
    hasManualLayout,
    tablePositions,
    tableConfig,
    tableMap,
    highlightedEdgeIds,
    activeColumns,
    ambiguousColumns,
    ambiguousTableKeys,
    focusedAmbiguousColumns,
    focusedAmbiguousTables,
    viewMode,
    setEdges,
    setNodes,
    setTableConfig,
  ]);

  const onConnect = useCallback((connection: Connection) => setEdges((eds) => addEdge(connection, eds)), [setEdges]);
  const onEdgeClick = useCallback((_: unknown, edge: Edge) => {
    setSelected(null);
    setSelectedRelationshipId((prev) => (prev === edge.id ? null : edge.id));
  }, []);
  const onPaneClick = useCallback(() => {
    setSelected(null);
    setSelectedRelationshipId(null);
  }, []);

  const toggleDiagramFullscreen = useCallback(async () => {
    if (!diagramSurfaceRef.current) return;

    try {
      if (document.fullscreenElement === diagramSurfaceRef.current) {
        await document.exitFullscreen();
        return;
      }

      await diagramSurfaceRef.current.requestFullscreen();
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('No se pudo cambiar pantalla completa del diagrama:', error);
    }
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;

      const target = event.target as HTMLElement | null;
      const isTypingContext = Boolean(target?.closest('input, textarea, select, [contenteditable="true"], .monaco-editor, .view-lines'));

      if (isTypingContext) return;
      if (event.code !== 'KeyF') return;

      event.preventDefault();
      void toggleDiagramFullscreen();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [toggleDiagramFullscreen]);

  const exportDiagram = useCallback(
    async (format: 'svg' | 'png' | 'jpeg') => {
      if (!exportRef.current) {
        setExportingFormat(null);
        return;
      }

      try {
        const viewportEl = exportRef.current.querySelector('.react-flow__viewport') as HTMLElement | null;
        if (!viewportEl) return;

        const hasNodes = nodes.length > 0;
        const fallbackWidth = Math.max(EXPORT_MIN_WIDTH, exportRef.current.clientWidth);
        const fallbackHeight = Math.max(EXPORT_MIN_HEIGHT, exportRef.current.clientHeight);

        const bounds = hasNodes
          ? getNodesBounds(nodes)
          : {
              x: 0,
              y: 0,
              width: fallbackWidth,
              height: fallbackHeight,
            };

        const width = Math.max(EXPORT_MIN_WIDTH, Math.ceil(Math.max(bounds.width, 1) + EXPORT_PADDING * 2));
        const height = Math.max(EXPORT_MIN_HEIGHT, Math.ceil(Math.max(bounds.height, 1) + EXPORT_PADDING * 2));
        const viewport = getViewportForBounds(bounds, width, height, 0.12, 2, 0.08);
        const backgroundColor = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#0c1636';

        const options = {
          cacheBust: true,
          width,
          height,
          backgroundColor,
          style: {
            width: `${width}px`,
            height: `${height}px`,
            transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
            transformOrigin: '0 0',
            background: backgroundColor,
            backgroundColor,
          },
        };

        if (format === 'svg') {
          const data = await toSvg(viewportEl, options);
          const withBackground = ensureSvgBackground(data, backgroundColor);
          downloadDataUrl('diagram.svg', withBackground);
          return;
        }

        if (format === 'png') {
          const data = await toPng(viewportEl, {
            ...options,
            pixelRatio: exportScale,
          });
          downloadDataUrl('diagram.png', data);
          return;
        }

        const data = await toJpeg(viewportEl, {
          ...options,
          pixelRatio: exportScale,
          quality: 0.95,
        });
        downloadDataUrl('diagram.jpg', data);
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Error exportando diagrama:', error);
      } finally {
        setExportingFormat(null);
      }
    },
    [exportScale, nodes],
  );

  const handleExportDiagram = useCallback(
    (format: 'svg' | 'png' | 'jpeg') => {
      if (exportingFormat) return;

      setExportingFormat(format);

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          void exportDiagram(format);
        });
      });
    },
    [exportDiagram, exportingFormat],
  );

  const previewData = parsed.tables.find((table) => table.key === previewTable) ?? null;
  const hasSavedDiagramViewport = Boolean(diagramViewport);
  const setPersistedViewport = useCallback(
    (viewport: Viewport | DiagramViewport) => {
      setDiagramViewport({
        x: viewport.x,
        y: viewport.y,
        zoom: viewport.zoom,
      });
    },
    [setDiagramViewport],
  );
  const editorPanel = (
    <div style={{ minHeight: 0, display: 'grid', height: '100%' }}>
      <SqlEditorPanel
        sqlText={sqlText}
        onSqlChange={setSqlText}
        onGoToLine={goToLine}
        onGoToLineHandled={() => setGoToLine(null)}
        errors={parsed.errors}
        warnings={parsed.warnings}
        ambiguousReferences={parsed.ambiguousReferences}
        onAmbiguousReferenceSelect={focusAmbiguousReference}
        dialect={dialect}
        onDialectChange={setDialect}
        theme={theme}
        themeReady={hasHydrated}
      />
    </div>
  );
  const diagramPanel = (
    <div style={{ minHeight: 0, display: 'grid', height: '100%' }}>
      <div
        ref={diagramSurfaceRef}
        className="panel-card"
        style={{
          position: 'relative',
          height: '100%',
          padding: 10,
          minHeight: 0,
          display: 'grid',
          gridTemplateRows: '1fr',
          background: 'var(--surface)',
        }}
        >
        <div className="diagram-utility-stack">
          <div className="diagram-utility-toolbar">
            <button
              type="button"
              className="btn btn-icon diagram-utility-btn diagram-search-toggle"
              aria-label={isDiagramSearchOpen ? 'Cerrar buscador del diagrama' : 'Abrir buscador del diagrama'}
              aria-expanded={isDiagramSearchOpen}
              onClick={() => {
                setIsDiagramSearchOpen((open) => {
                  const nextOpen = !open;
                  if (nextOpen) setIsDiagramHelpOpen(false);
                  return nextOpen;
                });
              }}
              title={isDiagramSearchOpen ? 'Cerrar buscador' : 'Buscar en diagrama'}
            >
              {isDiagramSearchOpen ? <X size={15} /> : <Search size={15} />}
            </button>

            <button
              type="button"
              className="btn btn-icon diagram-utility-btn diagram-help-toggle"
              aria-label={isDiagramHelpOpen ? 'Ocultar leyenda de cardinalidad' : 'Mostrar leyenda de cardinalidad'}
              aria-expanded={isDiagramHelpOpen}
              onClick={() => {
                setIsDiagramHelpOpen((open) => {
                  const nextOpen = !open;
                  if (nextOpen) setIsDiagramSearchOpen(false);
                  return nextOpen;
                });
              }}
              title={isDiagramHelpOpen ? 'Ocultar leyenda' : 'Mostrar leyenda'}
            >
              {isDiagramHelpOpen ? <X size={15} /> : <HelpCircle size={15} />}
            </button>
          </div>

          {isDiagramSearchOpen && (
            <div className="overlay-panel diagram-search-panel">
              <div className="diagram-search-panel__header">
                <Search size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                <input
                  ref={diagramSearchInputRef}
                  type="text"
                  value={diagramSearch}
                  onChange={(event) => {
                    setDiagramSearch(event.target.value);
                    setIsDiagramSearchOpen(true);
                  }}
                  onFocus={(event) => {
                    event.currentTarget.select();
                    setIsDiagramSearchOpen(true);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'ArrowDown') {
                      event.preventDefault();
                      if (diagramSearchResults.length > 0) {
                        setActiveDiagramSearchIndex((current) => (current + 1) % diagramSearchResults.length);
                      }
                      return;
                    }

                    if (event.key === 'ArrowUp') {
                      event.preventDefault();
                      if (diagramSearchResults.length > 0) {
                        setActiveDiagramSearchIndex((current) =>
                          current === 0 ? diagramSearchResults.length - 1 : current - 1,
                        );
                      }
                      return;
                    }

                    if (event.key === 'Enter' && activeDiagramSearchResult) {
                      event.preventDefault();
                      focusDiagramSearchResult(activeDiagramSearchResult);
                    }
                  }}
                  placeholder="Buscar tabla o propiedad"
                  className="diagram-search-input"
                />
                {diagramSearch && (
                  <button
                    type="button"
                    className="btn btn-icon btn-ghost"
                    onClick={() => {
                      setDiagramSearch('');
                      setActiveDiagramSearchIndex(0);
                      setFocusedAmbiguousTables(new Set());
                      setFocusedAmbiguousColumns(new Set());
                      diagramSearchInputRef.current?.focus();
                    }}
                    title="Limpiar búsqueda"
                    aria-label="Limpiar búsqueda"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              {diagramSearch.trim() && (
                <div
                  ref={diagramSearchResultsRef}
                  className="diagram-search-results"
                >
                  {diagramSearchResults.length > 0 ? (
                    diagramSearchResults.map((result) => (
                      <button
                        key={result.id}
                        ref={(element) => {
                          diagramSearchResultItemRefs.current[result.id] = element;
                        }}
                        className="btn btn-sm btn-ghost diagram-search-result"
                        onClick={() => focusDiagramSearchResult(result)}
                        style={{
                          background:
                            activeDiagramSearchResult?.id === result.id
                              ? 'color-mix(in srgb, var(--accent) 18%, var(--surface-2))'
                              : undefined,
                          borderColor:
                            activeDiagramSearchResult?.id === result.id
                              ? 'color-mix(in srgb, var(--accent) 50%, var(--border))'
                              : undefined,
                        }}
                        onMouseEnter={() => {
                          const index = diagramSearchResults.findIndex((candidate) => candidate.id === result.id);
                          if (index >= 0) setActiveDiagramSearchIndex(index);
                        }}
                      >
                        <span style={{ minWidth: 0, display: 'grid', gap: 2 }}>
                          <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: 600 }}>{result.label}</span>
                          {(result.schemaName || result.kind === 'column') && (
                            <span style={{ color: 'var(--text-muted)', fontSize: 11, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                              {result.schemaName && <span>Schema: {result.schemaName}</span>}
                              {result.kind === 'column' && <span>Tabla: {result.entityName}</span>}
                            </span>
                          )}
                        </span>
                        <span style={{ color: 'var(--text-muted)', fontSize: 11, flexShrink: 0 }}>{result.matchText}</span>
                      </button>
                    ))
                  ) : (
                    <div style={{ padding: '0.65rem 0.75rem', fontSize: 12, color: 'var(--text-muted)' }}>
                      No encontré tablas ni propiedades con ese nombre.
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {isDiagramHelpOpen && <DiagramCardinalityLegend />}
        </div>

        <button
          className="btn btn-icon overlay-panel"
          onClick={() => void toggleDiagramFullscreen()}
          title={isDiagramFullscreen ? 'Salir de pantalla completa (F)' : 'Pantalla completa (F)'}
          style={{
            position: 'absolute',
            top: 12,
            right: 12,
            zIndex: 8,
            display: 'grid',
            placeItems: 'center',
          }}
        >
          {isDiagramFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
        </button>
        <div ref={exportRef} className="rf-export-target">
          <ReactFlow
            onInit={(instance) => {
              reactFlowRef.current = instance;
              if (diagramViewport) {
                requestAnimationFrame(() => {
                  void instance.setViewport(diagramViewport);
                });
              }
            }}
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            defaultEdgeOptions={{ zIndex: 1 }}
            defaultViewport={diagramViewport ?? undefined}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeDragStop={(_, node) => setTablePosition(node.id, node.position)}
            onEdgeClick={onEdgeClick}
            onPaneClick={onPaneClick}
            onMoveEnd={(_, viewport) => setPersistedViewport(viewport)}
            onConnect={onConnect}
            fitView={!hasSavedDiagramViewport}
            fitViewOptions={{ padding: 0.25 }}
            minZoom={0.08}
            panOnDrag
            panOnScroll
            panOnScrollMode={PanOnScrollMode.Free}
            zoomOnScroll
            zoomOnPinch
          >
            <MiniMap pannable zoomable />
            <Controls />
            <Background gap={16} size={1.2} color="color-mix(in srgb, var(--text-muted) 20%, transparent)" />
          </ReactFlow>
        </div>
      </div>
    </div>
  );

  return (
    <main className="app-root" style={{ height: '100dvh', padding: 14, display: 'grid', gridTemplateRows: 'auto 1fr', gap: 10 }}>
      <header className="panel-card" style={{ padding: 12, display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ display: 'grid', gap: 8, minWidth: 0, flex: '1 1 420px' }}>
          <div style={{ display: 'grid', gap: 2 }}>
            <strong style={{ fontSize: 15, lineHeight: 1.1 }}>SQL Data Modeler</strong>
            <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>PostgreSQL + Oracle · ERD en tiempo real</span>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
            {layoutPending && <span className="status-pill">Reordenando layout…</span>}
            {layoutMode === 'fallback' && layoutWarning && (
              <span
                className="status-pill"
                style={{
                  color: '#f59e0b',
                  borderColor: 'color-mix(in srgb, #f59e0b 35%, var(--border))',
                  background: 'color-mix(in srgb, #f59e0b 10%, transparent)',
                }}
              >
                {layoutWarning}
              </span>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', alignItems: 'center', gap: 10, flex: '0 1 auto' }}>
          {exportingFormat && (
            <span className="status-pill">
              <span className="loader-dot" /> Exportando {formatExportLabel(exportingFormat)}...
            </span>
          )}

          <div
            className="theme-switcher"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: 4,
              borderRadius: 999,
              border: '1px solid var(--border)',
              background: 'color-mix(in srgb, var(--surface-2) 88%, transparent)',
            }}
          >
          <button
            className={`theme-pill ${theme === 'light' ? 'active' : ''}`}
            aria-pressed={theme === 'light'}
            onClick={() => setTheme('light')}
            title="Tema claro"
            style={{
              background: theme === 'light' ? '#ffffff' : 'transparent',
              color: theme === 'light' ? '#0f172a' : 'var(--text-muted)',
            }}
          >
            <Sun size={14} />
          </button>

          <button
            className={`theme-pill ${theme === 'dark' ? 'active' : ''}`}
            aria-pressed={theme === 'dark'}
            onClick={() => setTheme('dark')}
            title="Tema oscuro"
            style={{
              background: theme === 'dark' ? '#111827' : 'transparent',
              color: theme === 'dark' ? '#f8fafc' : 'var(--text-muted)',
            }}
          >
            <Moon size={14} />
          </button>

          <button
            className={`theme-pill ${theme === 'deepblue' ? 'active' : ''}`}
            aria-pressed={theme === 'deepblue'}
            onClick={() => setTheme('deepblue')}
            title="Tema deepblue"
            style={{
              background: theme === 'deepblue' ? '#1d4ed8' : 'transparent',
              color: theme === 'deepblue' ? '#dbeafe' : 'var(--text-muted)',
            }}
          >
            <Sparkles size={14} />
          </button>
        </div>

        <div style={{ position: 'relative' }}>
          <button
            ref={diagramMenuTriggerRef}
            className="btn btn-icon"
            onClick={() => setOpenDiagramMenu((open) => !open)}
            title="Opciones de diagrama"
          >
            <MoreHorizontal size={16} />
          </button>

          {openDiagramMenu && (
            <div
              ref={diagramMenuRef}
              className="overlay-panel"
              style={{
                position: 'absolute',
                top: 'calc(100% + 8px)',
                right: 0,
                width: 320,
                padding: 12,
                zIndex: 90,
                display: 'grid',
                gap: 12,
              }}
            >
              <div className="overlay-section">
                <span className="overlay-label">Vista y estilo</span>

                <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
                  Tipo de vista
                  <select
                    className="select-modern"
                    value={viewMode}
                    onChange={(event) => setViewMode(event.target.value as ViewMode)}
                  >
                    <option value="split">2 paneles</option>
                    <option value="tabs">Pestañas</option>
                  </select>
                </label>

                <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
                  Tipo de dato (global)
                  <select
                    className="select-modern"
                    value={globalTypeMode}
                    onChange={(event) => setGlobalTypeMode(event.target.value as TypeDisplayMode)}
                  >
                    <option value="text">Texto</option>
                    <option value="icon">Ícono</option>
                  </select>
                </label>

                <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
                  Diseño de tablas
                  <select
                    className="select-modern"
                    value={tableDesignTheme}
                    onChange={(event) => setTableDesignTheme(event.target.value as TableDesignTheme)}
                  >
                    <option value="modern">Moderno</option>
                    <option value="dbeaver">DBeaver</option>
                  </select>
                </label>

                <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
                  Diseño visual de línea
                  <select
                    className="select-modern"
                    value={linePattern}
                    onChange={(event) => setLinePattern(event.target.value as RelationLinePattern)}
                  >
                    <option value="solid">Continua</option>
                    <option value="dashed">Punteada</option>
                  </select>
                </label>

                <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
                  Agrupación de relaciones
                  <select
                    className="select-modern"
                    value={relationGrouping}
                    onChange={(event) => {
                      setRelationGrouping(event.target.value as RelationGroupingMode);
                      setLayoutRevision((prev) => prev + 1);
                    }}
                  >
                    <option value="separate">Separadas por relación</option>
                    <option value="bundled">Unión final por tabla</option>
                  </select>
                </label>
              </div>

              <div className="overlay-section">
                <span className="overlay-label">Acciones</span>

                <button className="btn menu-item" onClick={() => {
                  resetTablePositions();
                  setLayoutRevision((prev) => prev + 1);
                  setSelected(null);
                  setSelectedRelationshipId(null);
                  setOpenDiagramMenu(false);
                }}>
                  <Sparkles size={14} /> Auto-organizar tablas
                </button>

                <button className="btn menu-item" onClick={() => {
                  resetAllTableColorsToTheme();
                  setOpenDiagramMenu(false);
                }}>
                  <Sparkles size={14} /> Reset colores al tema
                </button>
              </div>

              <div className="overlay-section">
                <span className="overlay-label">Exportar</span>

                <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
                  Escala export (PNG/JPEG)
                  <select
                    className="select-modern"
                    value={exportScale}
                    onChange={(event) => setExportScale(Number(event.target.value) as 1 | 2 | 3 | 4)}
                  >
                    <option value={1}>1x · rápido</option>
                    <option value={2}>2x · recomendado</option>
                    <option value={3}>3x · alta</option>
                    <option value={4}>4x · ultra</option>
                  </select>
                </label>

                <div className="compact-format-row">
                  {(['svg', 'png', 'jpeg'] as const).map((format) => (
                    <button
                      key={format}
                      className="btn btn-subtle btn-sm compact-format-btn"
                      disabled={Boolean(exportingFormat)}
                      aria-busy={exportingFormat === format}
                      onClick={() => {
                        handleExportDiagram(format);
                        setOpenDiagramMenu(false);
                      }}
                      title={`Exportar ${formatExportLabel(format)}`}
                    >
                      {exportingFormat === format ? <span className="loader-dot" /> : <DownloadCloud size={14} />}
                      {formatExportLabel(format)}
                    </button>
                  ))}
                </div>
               </div>
             </div>
           )}
        </div>
        </div>
      </header>

      {!hasHydrated ? (
        <section
          aria-hidden="true"
          style={{
            height: '100%',
            minHeight: 0,
            borderRadius: 24,
            background: 'color-mix(in srgb, var(--panel) 72%, transparent)',
            border: '1px solid color-mix(in srgb, var(--border) 70%, transparent)',
          }}
        />
      ) : viewMode === 'split' ? (
        <section
          ref={panelsRef}
          style={{
            height: '100%',
            minHeight: 0,
            overflow: 'hidden',
            display: 'grid',
            gridTemplateColumns: `${panelSplit}% 12px minmax(0, 1fr)`,
            alignItems: 'stretch',
          }}
        >
          <div style={{ minHeight: 0, paddingRight: 8, display: 'grid' }}>{editorPanel}</div>

          <div
            role="separator"
            aria-label="Ajustar paneles"
            aria-orientation="vertical"
            title="Arrastrá para redimensionar paneles"
            onPointerDown={(event) => {
              event.preventDefault();
              setIsResizingPanels(true);
            }}
            style={{
              cursor: 'col-resize',
              display: 'grid',
              placeItems: 'center',
              borderRadius: 10,
              background: isResizingPanels ? 'color-mix(in srgb, var(--accent) 26%, transparent)' : 'transparent',
            }}
          >
            <div
              style={{
                width: 4,
                height: 74,
                borderRadius: 999,
                background: 'color-mix(in srgb, var(--text-muted) 46%, transparent)',
              }}
            />
          </div>

          <div style={{ minHeight: 0, paddingLeft: 8, display: 'grid' }}>{diagramPanel}</div>
        </section>
      ) : (
        <section style={{ height: '100%', minHeight: 0, display: 'grid', gridTemplateRows: 'auto 1fr', gap: 10 }}>
          <div className="panel-card" style={{ padding: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <div className="tab-list" role="tablist" aria-label="Vista principal">
            <button
              className="tab-btn"
              role="tab"
              aria-selected={activeViewTab === 'editor'}
              data-active={activeViewTab === 'editor'}
              onClick={() => setActiveViewTab('editor')}
            >
              Editor SQL
            </button>
            <button
              className="tab-btn"
              role="tab"
              aria-selected={activeViewTab === 'diagram'}
              data-active={activeViewTab === 'diagram'}
              onClick={() => setActiveViewTab('diagram')}
            >
              Diagrama
            </button>
            </div>
          </div>

          <div style={{ minHeight: 0, display: 'grid', overflow: 'hidden' }}>
            <div
              style={{
                minHeight: 0,
                height: '100%',
                display: activeViewTab === 'editor' ? 'grid' : 'none',
              }}
            >
              {editorPanel}
            </div>
            <div
              style={{
                minHeight: 0,
                height: '100%',
                display: activeViewTab === 'diagram' ? 'grid' : 'none',
              }}
            >
              {diagramPanel}
            </div>
          </div>
        </section>
      )}

      {previewData && (
        <div
          className="dialog-overlay"
          onClick={() => setPreviewTable(null)}
        >
          <div
            className="panel-card overlay-panel dialog-panel"
            style={{ display: 'grid', gap: 12 }}
            onClick={(event) => event.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
              <div style={{ display: 'grid', gap: 4 }}>
                <span className="overlay-label">Preview</span>
                <strong>Previsualización: {previewData.name}</strong>
              </div>
              <button className="btn btn-sm btn-ghost" onClick={() => setPreviewTable(null)}>
                Cerrar
              </button>
            </div>

            <div style={{ border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden', background: 'color-mix(in srgb, var(--surface) 92%, transparent)' }}>
              {previewData.columns.map((col) => (
                <div
                  key={col.name}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '72px 1fr auto',
                    minHeight: 40,
                    padding: '10px 12px',
                    borderBottom: '1px solid var(--border)',
                    fontSize: 12,
                    gap: 8,
                    alignItems: 'center',
                  }}
                >
                  <strong style={{ color: 'var(--text-muted)', fontSize: 11 }}>{col.isPrimary ? 'PK' : col.isForeign ? 'FK' : 'COL'}</strong>
                  <span>{col.name}</span>
                  <span style={{ color: 'var(--text-muted)' }}>{col.rawType}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
