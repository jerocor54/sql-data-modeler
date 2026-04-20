import type { Position } from '../types/erd';

type Direction = 'none' | 'horizontal' | 'vertical';

interface RouterNeighbor {
  to: number;
  distance: number;
  direction: Exclude<Direction, 'none'>;
}

export interface RouterRect {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

interface RouterOptions {
  outerPadding?: number;
  turnPenalty?: number;
  segmentPenalty?: number;
  reverseDirectionPenalty?: number;
  sharedSegmentPenalty?: number;
  nearbySegmentPenalty?: number;
  nearbySegmentDistance?: number;
  outerLanePenalty?: number;
  centerLanePenalty?: number;
  minCorridorSpan?: number;
}

interface CorridorBand {
  start: number;
  end: number;
  span: number;
  center: number;
  halfSpan: number;
  guideLanes: number[];
}

interface RouterGraph {
  points: Position[];
  neighbors: RouterNeighbor[][];
  indexByKey: Map<string, number>;
  verticalLanePenaltyByX: Map<number, number>;
  horizontalLanePenaltyByY: Map<number, number>;
  bounds: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
  };
}

export interface OrthogonalSegment {
  orientation: 'horizontal' | 'vertical';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

interface LineJumpOptions {
  radius?: number;
  arcHeight?: number;
  endpointClearance?: number;
  crossingEndpointClearance?: number;
}

interface CornerPathOptions {
  cornerSize?: number;
  curveStrength?: number;
  mode?: 'straight' | 'curved';
}

const SNAP_PRECISION = 10;
const EPSILON = 0.001;
const CORRIDOR_LANE_SPACING = 72;
const CORRIDOR_EDGE_INSET = 28;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

class MinHeap<T extends { priority: number }> {
  private items: T[] = [];

  push(item: T): void {
    this.items.push(item);
    this.bubbleUp(this.items.length - 1);
  }

  pop(): T | undefined {
    if (this.items.length === 0) return undefined;
    if (this.items.length === 1) return this.items.pop();

    const top = this.items[0];
    const end = this.items.pop();
    if (end) {
      this.items[0] = end;
      this.bubbleDown(0);
    }
    return top;
  }

  get size(): number {
    return this.items.length;
  }

  private bubbleUp(index: number): void {
    let current = index;
    while (current > 0) {
      const parent = Math.floor((current - 1) / 2);
      if (this.items[parent].priority <= this.items[current].priority) break;
      [this.items[parent], this.items[current]] = [this.items[current], this.items[parent]];
      current = parent;
    }
  }

  private bubbleDown(index: number): void {
    let current = index;

    while (true) {
      const left = current * 2 + 1;
      const right = current * 2 + 2;
      let smallest = current;

      if (left < this.items.length && this.items[left].priority < this.items[smallest].priority) {
        smallest = left;
      }
      if (right < this.items.length && this.items[right].priority < this.items[smallest].priority) {
        smallest = right;
      }

      if (smallest === current) break;
      [this.items[current], this.items[smallest]] = [this.items[smallest], this.items[current]];
      current = smallest;
    }
  }
}

function snap(value: number): number {
  return Math.round(value * SNAP_PRECISION) / SNAP_PRECISION;
}

function pointKey(point: Position): string {
  return `${snap(point.x)}|${snap(point.y)}`;
}

function stateKey(index: number, direction: Direction): string {
  return `${index}:${direction}`;
}

function parseStateKey(value: string): { index: number; direction: Direction } {
  const [indexRaw, directionRaw] = value.split(':');
  const direction =
    directionRaw === 'horizontal' || directionRaw === 'vertical' || directionRaw === 'none' ? directionRaw : 'none';
  return {
    index: Number(indexRaw),
    direction,
  };
}

function isPointInsideRect(point: Position, rect: RouterRect): boolean {
  return point.x > rect.left + EPSILON && point.x < rect.right - EPSILON && point.y > rect.top + EPSILON && point.y < rect.bottom - EPSILON;
}

function isSegmentClear(from: Position, to: Position, obstacles: RouterRect[]): boolean {
  if (Math.abs(from.x - to.x) <= EPSILON && Math.abs(from.y - to.y) <= EPSILON) return true;

  if (Math.abs(from.y - to.y) <= EPSILON) {
    const y = from.y;
    const minX = Math.min(from.x, to.x) + EPSILON;
    const maxX = Math.max(from.x, to.x) - EPSILON;

    for (const rect of obstacles) {
      const intersectsY = y > rect.top + EPSILON && y < rect.bottom - EPSILON;
      const intersectsX = maxX > rect.left + EPSILON && minX < rect.right - EPSILON;
      if (intersectsY && intersectsX) return false;
    }
    return true;
  }

  if (Math.abs(from.x - to.x) <= EPSILON) {
    const x = from.x;
    const minY = Math.min(from.y, to.y) + EPSILON;
    const maxY = Math.max(from.y, to.y) - EPSILON;

    for (const rect of obstacles) {
      const intersectsX = x > rect.left + EPSILON && x < rect.right - EPSILON;
      const intersectsY = maxY > rect.top + EPSILON && minY < rect.bottom - EPSILON;
      if (intersectsX && intersectsY) return false;
    }
    return true;
  }

  return false;
}

function estimateDistance(a: Position, b: Position): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function getUniqueSorted(values: number[]): number[] {
  return Array.from(new Set(values.map((value) => snap(value)))).sort((a, b) => a - b);
}

function buildCorridorGuideLanes(start: number, end: number, center: number): number[] {
  const span = end - start;
  const edgeInset = clamp(span * 0.14, 20, CORRIDOR_EDGE_INSET);
  const guideStart = start + edgeInset;
  const guideEnd = end - edgeInset;

  if (guideEnd <= guideStart + EPSILON) return [snap(center)];

  const guideLanes = new Set<number>([snap(center)]);
  const usableSpan = guideEnd - guideStart;

  if (usableSpan >= CORRIDOR_LANE_SPACING + 24) {
    const shoulderOffset = clamp(usableSpan * 0.24, 28, CORRIDOR_LANE_SPACING);
    const before = center - shoulderOffset;
    const after = center + shoulderOffset;

    if (before >= guideStart - EPSILON) guideLanes.add(snap(before));
    if (after <= guideEnd + EPSILON) guideLanes.add(snap(after));
  }

  return Array.from(guideLanes).sort((left, right) => left - right);
}

interface FreeAxisBand {
  min: number;
  max: number;
  center: number;
}

function getHorizontalFreeBand(segment: OrthogonalSegment, obstacles: RouterRect[]): FreeAxisBand | null {
  const minX = Math.min(segment.x1, segment.x2) + EPSILON;
  const maxX = Math.max(segment.x1, segment.x2) - EPSILON;
  let lowerBound = Number.NEGATIVE_INFINITY;
  let upperBound = Number.POSITIVE_INFINITY;

  for (const obstacle of obstacles) {
    const overlapsX = maxX > obstacle.left + EPSILON && minX < obstacle.right - EPSILON;
    if (!overlapsX) continue;

    if (obstacle.bottom <= segment.y1 + EPSILON) {
      lowerBound = Math.max(lowerBound, obstacle.bottom);
      continue;
    }

    if (obstacle.top >= segment.y1 - EPSILON) {
      upperBound = Math.min(upperBound, obstacle.top);
    }
  }

  if (!Number.isFinite(lowerBound) || !Number.isFinite(upperBound)) return null;
  if (upperBound - lowerBound <= EPSILON) return null;

  return {
    min: lowerBound,
    max: upperBound,
    center: snap((lowerBound + upperBound) / 2),
  };
}

function getVerticalFreeBand(segment: OrthogonalSegment, obstacles: RouterRect[]): FreeAxisBand | null {
  const minY = Math.min(segment.y1, segment.y2) + EPSILON;
  const maxY = Math.max(segment.y1, segment.y2) - EPSILON;
  let lowerBound = Number.NEGATIVE_INFINITY;
  let upperBound = Number.POSITIVE_INFINITY;

  for (const obstacle of obstacles) {
    const overlapsY = maxY > obstacle.top + EPSILON && minY < obstacle.bottom - EPSILON;
    if (!overlapsY) continue;

    if (obstacle.right <= segment.x1 + EPSILON) {
      lowerBound = Math.max(lowerBound, obstacle.right);
      continue;
    }

    if (obstacle.left >= segment.x1 - EPSILON) {
      upperBound = Math.min(upperBound, obstacle.left);
    }
  }

  if (!Number.isFinite(lowerBound) || !Number.isFinite(upperBound)) return null;
  if (upperBound - lowerBound <= EPSILON) return null;

  return {
    min: lowerBound,
    max: upperBound,
    center: snap((lowerBound + upperBound) / 2),
  };
}

function centerPathSegmentsInLocalCorridors(points: Position[], obstacles: RouterRect[]): Position[] {
  if (points.length < 6) return points;

  let centered = points.map((point) => ({ ...point }));
  let changed = true;
  let guard = 0;

  while (changed && guard < 4) {
    changed = false;
    guard += 1;

    for (let index = 2; index < centered.length - 3; index += 1) {
      const start = centered[index];
      const end = centered[index + 1];
      const previous = centered[index - 1];
      const next = centered[index + 2];
      const segment = normalizeSegment(start, end);

      if (!segment) continue;

      if (segment.orientation === 'horizontal') {
        const previousIsVertical = Math.abs(previous.x - start.x) <= EPSILON;
        const nextIsVertical = Math.abs(end.x - next.x) <= EPSILON;
        if (!previousIsVertical || !nextIsVertical) continue;

        const band = getHorizontalFreeBand(segment, obstacles);
        if (!band || Math.abs(start.y - band.center) <= EPSILON) continue;

        const candidate = centered.map((point) => ({ ...point }));
        candidate[index].y = band.center;
        candidate[index + 1].y = band.center;

        if (
          isSegmentClear(candidate[index - 1], candidate[index], obstacles) &&
          isSegmentClear(candidate[index], candidate[index + 1], obstacles) &&
          isSegmentClear(candidate[index + 1], candidate[index + 2], obstacles)
        ) {
          centered = simplifyOrthogonalPoints(candidate);
          changed = true;
          break;
        }

        continue;
      }

      const previousIsHorizontal = Math.abs(previous.y - start.y) <= EPSILON;
      const nextIsHorizontal = Math.abs(end.y - next.y) <= EPSILON;
      if (!previousIsHorizontal || !nextIsHorizontal) continue;

      const band = getVerticalFreeBand(segment, obstacles);
      if (!band || Math.abs(start.x - band.center) <= EPSILON) continue;

      const candidate = centered.map((point) => ({ ...point }));
      candidate[index].x = band.center;
      candidate[index + 1].x = band.center;

      if (
        isSegmentClear(candidate[index - 1], candidate[index], obstacles) &&
        isSegmentClear(candidate[index], candidate[index + 1], obstacles) &&
        isSegmentClear(candidate[index + 1], candidate[index + 2], obstacles)
      ) {
        centered = simplifyOrthogonalPoints(candidate);
        changed = true;
        break;
      }
    }
  }

  return centered;
}

function buildCorridorBands(values: number[], minCorridorSpan: number): CorridorBand[] {
  const sorted = getUniqueSorted(values);
  const bands: CorridorBand[] = [];

  for (let index = 0; index < sorted.length - 1; index += 1) {
    const start = sorted[index];
    const end = sorted[index + 1];
    const span = end - start;

    if (span < minCorridorSpan - EPSILON) continue;

    bands.push({
      start,
      end,
      span,
      center: snap(start + span / 2),
      halfSpan: span / 2,
      guideLanes: buildCorridorGuideLanes(start, end, start + span / 2),
    });
  }

  return bands;
}

function addCorridorCenters(values: Set<number>, bands: CorridorBand[]): void {
  for (const band of bands) {
    for (const lane of band.guideLanes) {
      values.add(snap(lane));
    }
  }
}

function getNearestGuideLaneDistance(value: number, guideLanes: number[]): number {
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const lane of guideLanes) {
    const distance = Math.abs(value - lane);
    if (distance < bestDistance) bestDistance = distance;
  }

  return Number.isFinite(bestDistance) ? bestDistance : 0;
}

function getGuideLaneReach(band: CorridorBand): number {
  if (band.guideLanes.length <= 1) return Math.max(14, band.halfSpan * 0.4);

  let closestGap = Number.POSITIVE_INFINITY;
  for (let index = 0; index < band.guideLanes.length - 1; index += 1) {
    closestGap = Math.min(closestGap, band.guideLanes[index + 1] - band.guideLanes[index]);
  }

  return Math.max(14, (Number.isFinite(closestGap) ? closestGap : band.span) * 0.42);
}

function getLaneCenterPenalty(value: number, bands: CorridorBand[], maxPenalty: number): number {
  if (bands.length === 0 || maxPenalty <= EPSILON) return 0;

  let bestPenalty = Number.POSITIVE_INFINITY;

  for (const band of bands) {
    if (value < band.start - EPSILON || value > band.end + EPSILON) continue;
    if (band.halfSpan <= EPSILON || band.guideLanes.length === 0) continue;

    const nearestGuideDistance = getNearestGuideLaneDistance(value, band.guideLanes);
    const normalizedDistance = Math.min(1, nearestGuideDistance / getGuideLaneReach(band));
    const clearCorridorStrength = clamp((band.span - 96) / 120, 0, 1.85);
    const basePenalty = normalizedDistance * maxPenalty * (1.12 + clearCorridorStrength * 0.24);
    const edgeThreshold = band.guideLanes.length > 1 ? 0.56 : 0.62;
    const distanceFromCenter = Math.abs(value - band.center);
    const edgeNormalizedDistance = Math.min(1, distanceFromCenter / band.halfSpan);
    const edgeProximity =
      edgeNormalizedDistance <= edgeThreshold ? 0 : (edgeNormalizedDistance - edgeThreshold) / (1 - edgeThreshold);
    const edgePenalty = edgeProximity * maxPenalty * (0.7 + clearCorridorStrength * 0.65);
    const penalty = Math.min(maxPenalty * (1.75 + clearCorridorStrength * 0.4), basePenalty + edgePenalty);
    if (penalty < bestPenalty) bestPenalty = penalty;
  }

  return Number.isFinite(bestPenalty) ? bestPenalty : 0;
}

function buildLanePenaltyMap(values: number[], bands: CorridorBand[], maxPenalty: number): Map<number, number> {
  const penalties = new Map<number, number>();

  for (const value of values) {
    penalties.set(value, getLaneCenterPenalty(value, bands, maxPenalty));
  }

  return penalties;
}

function getRangeOverlap(startA: number, endA: number, startB: number, endB: number): number {
  return Math.max(0, Math.min(Math.max(startA, endA), Math.max(startB, endB)) - Math.max(Math.min(startA, endA), Math.min(startB, endB)));
}

function isAxisAligned(from: Position, to: Position): boolean {
  return Math.abs(from.x - to.x) <= EPSILON || Math.abs(from.y - to.y) <= EPSILON;
}

function buildShortcut(
  start: Position,
  end: Position,
  obstacles: RouterRect[],
): Position[] | null {
  if (isAxisAligned(start, end)) {
    return isSegmentClear(start, end, obstacles) ? [] : null;
  }

  const cornerA = { x: start.x, y: end.y };
  if (isSegmentClear(start, cornerA, obstacles) && isSegmentClear(cornerA, end, obstacles)) {
    return [cornerA];
  }

  const cornerB = { x: end.x, y: start.y };
  if (isSegmentClear(start, cornerB, obstacles) && isSegmentClear(cornerB, end, obstacles)) {
    return [cornerB];
  }

  return null;
}

function simplifyOrthogonalPoints(points: Position[]): Position[] {
  if (points.length <= 2) return points;

  const simplified: Position[] = [points[0]];

  for (let i = 1; i < points.length - 1; i += 1) {
    const prev = simplified[simplified.length - 1];
    const current = points[i];
    const next = points[i + 1];

    const sameX = Math.abs(prev.x - current.x) <= EPSILON && Math.abs(current.x - next.x) <= EPSILON;
    const sameY = Math.abs(prev.y - current.y) <= EPSILON && Math.abs(current.y - next.y) <= EPSILON;

    if (!sameX && !sameY) simplified.push(current);
  }

  simplified.push(points[points.length - 1]);

  return simplified;
}

function buildRouterGraph(
  obstacles: RouterRect[],
  pins: Position[],
  outerPadding: number,
  centerLanePenalty: number,
  minCorridorSpan: number,
): RouterGraph {
  const xSet = new Set<number>();
  const ySet = new Set<number>();
  const obstacleXs: number[] = [];
  const obstacleYs: number[] = [];

  for (const pin of pins) {
    xSet.add(snap(pin.x));
    ySet.add(snap(pin.y));
  }

  for (const obstacle of obstacles) {
    xSet.add(snap(obstacle.left));
    xSet.add(snap(obstacle.right));
    ySet.add(snap(obstacle.top));
    ySet.add(snap(obstacle.bottom));
    obstacleXs.push(obstacle.left, obstacle.right);
    obstacleYs.push(obstacle.top, obstacle.bottom);
  }

  const xCorridorBands = buildCorridorBands(obstacleXs, minCorridorSpan);
  const yCorridorBands = buildCorridorBands(obstacleYs, minCorridorSpan);
  addCorridorCenters(xSet, xCorridorBands);
  addCorridorCenters(ySet, yCorridorBands);

  const allX = Array.from(xSet);
  const allY = Array.from(ySet);

  const minX = Math.min(...allX);
  const maxX = Math.max(...allX);
  const minY = Math.min(...allY);
  const maxY = Math.max(...allY);

  xSet.add(snap(minX - outerPadding));
  xSet.add(snap(maxX + outerPadding));
  ySet.add(snap(minY - outerPadding));
  ySet.add(snap(maxY + outerPadding));

  const xs = Array.from(xSet).sort((a, b) => a - b);
  const ys = Array.from(ySet).sort((a, b) => a - b);
  const verticalLanePenaltyByX = buildLanePenaltyMap(xs, xCorridorBands, centerLanePenalty);
  const horizontalLanePenaltyByY = buildLanePenaltyMap(ys, yCorridorBands, centerLanePenalty);

  const points: Position[] = [];
  const indexByKey = new Map<string, number>();

  for (const y of ys) {
    for (const x of xs) {
      const point = { x, y };
      if (obstacles.some((obstacle) => isPointInsideRect(point, obstacle))) continue;

      const key = pointKey(point);
      indexByKey.set(key, points.length);
      points.push(point);
    }
  }

  const neighbors: RouterNeighbor[][] = Array.from({ length: points.length }, () => []);

  for (const y of ys) {
    let previousIndex: number | null = null;

    for (const x of xs) {
      const key = `${x}|${y}`;
      const currentIndex = indexByKey.get(key);
      if (currentIndex === undefined) continue;

      if (previousIndex !== null) {
        const from = points[previousIndex];
        const to = points[currentIndex];
        if (isSegmentClear(from, to, obstacles)) {
          const distance = Math.abs(to.x - from.x);
          neighbors[previousIndex].push({ to: currentIndex, distance, direction: 'horizontal' });
          neighbors[currentIndex].push({ to: previousIndex, distance, direction: 'horizontal' });
        }
      }

      previousIndex = currentIndex;
    }
  }

  for (const x of xs) {
    let previousIndex: number | null = null;

    for (const y of ys) {
      const key = `${x}|${y}`;
      const currentIndex = indexByKey.get(key);
      if (currentIndex === undefined) continue;

      if (previousIndex !== null) {
        const from = points[previousIndex];
        const to = points[currentIndex];
        if (isSegmentClear(from, to, obstacles)) {
          const distance = Math.abs(to.y - from.y);
          neighbors[previousIndex].push({ to: currentIndex, distance, direction: 'vertical' });
          neighbors[currentIndex].push({ to: previousIndex, distance, direction: 'vertical' });
        }
      }

      previousIndex = currentIndex;
    }
  }

  return {
    points,
    neighbors,
    indexByKey,
    verticalLanePenaltyByX,
    horizontalLanePenaltyByY,
    bounds: {
      minX: snap(minX - outerPadding),
      maxX: snap(maxX + outerPadding),
      minY: snap(minY - outerPadding),
      maxY: snap(maxY + outerPadding),
    },
  };
}

function reconstructPath(points: Position[], parentByState: Map<string, string | null>, terminalState: string): Position[] {
  const ordered: Position[] = [];
  let currentState: string | null = terminalState;

  while (currentState) {
    const { index } = parseStateKey(currentState);
    const point = points[index];
    if (!point) break;

    if (ordered.length === 0 || point.x !== ordered[ordered.length - 1].x || point.y !== ordered[ordered.length - 1].y) {
      ordered.push(point);
    }

    currentState = parentByState.get(currentState) ?? null;
  }

  ordered.reverse();
  return simplifyOrthogonalPoints(ordered);
}

export function createOrthogonalRouter(
  obstacles: RouterRect[],
  pins: Position[],
  options: RouterOptions = {},
): {
  route: (start: Position, end: Position, reservedSegments?: OrthogonalSegment[]) => Position[] | null;
} {
  const outerPadding = options.outerPadding ?? 180;
  const turnPenalty = options.turnPenalty ?? 36;
  const segmentPenalty = options.segmentPenalty ?? 16;
  const reverseDirectionPenalty = options.reverseDirectionPenalty ?? 80;
  const sharedSegmentPenalty = options.sharedSegmentPenalty ?? 96;
  const nearbySegmentPenalty = options.nearbySegmentPenalty ?? 44;
  const nearbySegmentDistance = options.nearbySegmentDistance ?? 18;
  const outerLanePenalty = options.outerLanePenalty ?? 180;
  const centerLanePenalty = options.centerLanePenalty ?? 24;
  const minCorridorSpan = options.minCorridorSpan ?? 48;
  const graph = buildRouterGraph(obstacles, pins, outerPadding, centerLanePenalty, minCorridorSpan);

  const route = (start: Position, end: Position, reservedSegments: OrthogonalSegment[] = []): Position[] | null => {
    const startIndex = graph.indexByKey.get(pointKey(start));
    const endIndex = graph.indexByKey.get(pointKey(end));

    if (startIndex === undefined || endIndex === undefined) return null;

    const queue = new MinHeap<{ state: string; index: number; direction: Direction; gCost: number; priority: number }>();
    const bestCostByState = new Map<string, number>();
    const parentByState = new Map<string, string | null>();

    const startState = stateKey(startIndex, 'none');
    bestCostByState.set(startState, 0);
    parentByState.set(startState, null);
    queue.push({
      state: startState,
      index: startIndex,
      direction: 'none',
      gCost: 0,
      priority: estimateDistance(graph.points[startIndex], graph.points[endIndex]),
    });

    while (queue.size > 0) {
      const current = queue.pop();
      if (!current) break;

      const currentBest = bestCostByState.get(current.state);
      if (currentBest === undefined || current.gCost > currentBest + EPSILON) continue;

      if (current.index === endIndex) {
        return reconstructPath(graph.points, parentByState, current.state);
      }

      for (const neighbor of graph.neighbors[current.index]) {
        const nextDirection: Direction = neighbor.direction;
        const turnCost = current.direction !== 'none' && current.direction !== nextDirection ? turnPenalty : 0;
        const segmentCost = current.direction === 'none' ? 0 : segmentPenalty;
        const candidateSegment = normalizeSegment(graph.points[current.index], graph.points[neighbor.to]);
        const centerBiasPenalty = candidateSegment
          ? candidateSegment.orientation === 'horizontal'
            ? graph.horizontalLanePenaltyByY.get(snap(candidateSegment.y1)) ?? 0
            : graph.verticalLanePenaltyByX.get(snap(candidateSegment.x1)) ?? 0
          : 0;
        let reusePenalty = 0;
        let reversePenalty = 0;

        if (neighbor.direction === 'horizontal') {
          const targetDeltaX = graph.points[endIndex].x - graph.points[current.index].x;
          const moveDeltaX = graph.points[neighbor.to].x - graph.points[current.index].x;
          if (Math.abs(targetDeltaX) > EPSILON && Math.sign(targetDeltaX) !== Math.sign(moveDeltaX)) {
            reversePenalty = reverseDirectionPenalty;
          }
        } else {
          const targetDeltaY = graph.points[endIndex].y - graph.points[current.index].y;
          const moveDeltaY = graph.points[neighbor.to].y - graph.points[current.index].y;
          if (Math.abs(targetDeltaY) > EPSILON && Math.sign(targetDeltaY) !== Math.sign(moveDeltaY)) {
            reversePenalty = reverseDirectionPenalty;
          }
        }

        if (candidateSegment) {
          const usesOuterLane =
            (candidateSegment.orientation === 'horizontal' &&
              (Math.abs(candidateSegment.y1 - graph.bounds.minY) <= EPSILON ||
                Math.abs(candidateSegment.y1 - graph.bounds.maxY) <= EPSILON)) ||
            (candidateSegment.orientation === 'vertical' &&
              (Math.abs(candidateSegment.x1 - graph.bounds.minX) <= EPSILON ||
                Math.abs(candidateSegment.x1 - graph.bounds.maxX) <= EPSILON));

          if (usesOuterLane) {
            reusePenalty += outerLanePenalty;
          }

          for (const segment of reservedSegments) {
            if (candidateSegment.orientation !== segment.orientation) continue;

            if (candidateSegment.orientation === 'horizontal') {
              const overlap = getRangeOverlap(candidateSegment.x1, candidateSegment.x2, segment.x1, segment.x2);
              if (overlap <= EPSILON) continue;

              const laneDistance = Math.abs(candidateSegment.y1 - segment.y1);
              if (laneDistance <= EPSILON) {
                reusePenalty += sharedSegmentPenalty + overlap * 0.45;
              } else if (laneDistance <= nearbySegmentDistance) {
                reusePenalty += nearbySegmentPenalty + overlap * 0.18;
              }
              continue;
            }

            const overlap = getRangeOverlap(candidateSegment.y1, candidateSegment.y2, segment.y1, segment.y2);
            if (overlap <= EPSILON) continue;

            const laneDistance = Math.abs(candidateSegment.x1 - segment.x1);
            if (laneDistance <= EPSILON) {
              reusePenalty += sharedSegmentPenalty + overlap * 0.45;
            } else if (laneDistance <= nearbySegmentDistance) {
              reusePenalty += nearbySegmentPenalty + overlap * 0.18;
            }
          }
        }

        const nextGCost = current.gCost + neighbor.distance + turnCost + segmentCost + centerBiasPenalty + reusePenalty + reversePenalty;
        const nextState = stateKey(neighbor.to, nextDirection);
        const knownCost = bestCostByState.get(nextState);

        if (knownCost !== undefined && nextGCost >= knownCost - EPSILON) continue;

        bestCostByState.set(nextState, nextGCost);
        parentByState.set(nextState, current.state);

        const heuristic = estimateDistance(graph.points[neighbor.to], graph.points[endIndex]);
        queue.push({
          state: nextState,
          index: neighbor.to,
          direction: nextDirection,
          gCost: nextGCost,
          priority: nextGCost + heuristic,
        });
      }
    }

    return null;
  };

  return { route };
}

export function pointsToSvgPath(points: Position[]): string {
  if (points.length === 0) return '';

  const [start, ...rest] = points;
  let path = `M ${start.x} ${start.y}`;

  for (const point of rest) {
    path += ` L ${point.x} ${point.y}`;
  }

  return path;
}

function normalizeSegment(from: Position, to: Position): OrthogonalSegment | null {
  if (Math.abs(from.y - to.y) <= EPSILON) {
    return {
      orientation: 'horizontal',
      x1: Math.min(from.x, to.x),
      x2: Math.max(from.x, to.x),
      y1: from.y,
      y2: to.y,
    };
  }

  if (Math.abs(from.x - to.x) <= EPSILON) {
    return {
      orientation: 'vertical',
      x1: from.x,
      x2: to.x,
      y1: Math.min(from.y, to.y),
      y2: Math.max(from.y, to.y),
    };
  }

  return null;
}

export function getOrthogonalSegments(points: Position[]): OrthogonalSegment[] {
  const segments: OrthogonalSegment[] = [];

  for (let i = 0; i < points.length - 1; i += 1) {
    const segment = normalizeSegment(points[i], points[i + 1]);
    if (!segment) continue;
    const length = segment.orientation === 'horizontal' ? Math.abs(segment.x2 - segment.x1) : Math.abs(segment.y2 - segment.y1);
    if (length <= EPSILON) continue;
    segments.push(segment);
  }

  return segments;
}

export function optimizeOrthogonalPath(points: Position[], obstacles: RouterRect[]): Position[] {
  if (points.length <= 2) return points;

  let optimized = simplifyOrthogonalPoints(points);
  let changed = true;
  let guard = 0;

  while (changed && guard < 12) {
    changed = false;
    guard += 1;

    outer: for (let i = 1; i < optimized.length - 3; i += 1) {
      for (let j = optimized.length - 2; j >= i + 2; j -= 1) {
        const start = optimized[i];
        const end = optimized[j];
        const shortcut = buildShortcut(start, end, obstacles);
        if (!shortcut) continue;

        optimized = [
          ...optimized.slice(0, i + 1),
          ...shortcut,
          ...optimized.slice(j),
        ];
        optimized = simplifyOrthogonalPoints(optimized);
        changed = true;
        break outer;
      }
    }
  }

  return simplifyOrthogonalPoints(centerPathSegmentsInLocalCorridors(optimized, obstacles));
}

function formatCoordinate(value: number): string {
  return Number.isInteger(value) ? `${value}` : `${Math.round(value * 100) / 100}`;
}

function hasEnoughClearanceFromSegmentEnds(
  intersection: number,
  segmentStart: number,
  segmentEnd: number,
  clearance: number,
): boolean {
  return intersection > segmentStart + clearance && intersection < segmentEnd - clearance;
}

function movePointTowards(start: Position, end: Position, distance: number): Position {
  if (Math.abs(start.x - end.x) <= EPSILON && Math.abs(start.y - end.y) <= EPSILON) return start;

  if (Math.abs(start.x - end.x) <= EPSILON) {
    return {
      x: start.x,
      y: start.y + Math.sign(end.y - start.y) * distance,
    };
  }

  return {
    x: start.x + Math.sign(end.x - start.x) * distance,
    y: start.y,
  };
}

function movePointAwayFrom(start: Position, from: Position, distance: number): Position {
  if (Math.abs(start.x - from.x) <= EPSILON && Math.abs(start.y - from.y) <= EPSILON) return start;

  if (Math.abs(start.x - from.x) <= EPSILON) {
    return {
      x: start.x,
      y: start.y + Math.sign(start.y - from.y) * distance,
    };
  }

  return {
    x: start.x + Math.sign(start.x - from.x) * distance,
    y: start.y,
  };
}

export function pointsToCornerPath(points: Position[], options: CornerPathOptions = {}): string {
  if (points.length === 0) return '';
  if (points.length < 3) return pointsToSvgPath(points);

  const cornerSize = options.cornerSize ?? 28;
  const curveStrength = options.curveStrength ?? 1.65;
  const mode = options.mode ?? 'straight';
  let path = `M ${formatCoordinate(points[0].x)} ${formatCoordinate(points[0].y)}`;

  for (let i = 1; i < points.length - 1; i += 1) {
    const previous = points[i - 1];
    const current = points[i];
    const next = points[i + 1];

    const isCorner =
      !(Math.abs(previous.x - current.x) <= EPSILON && Math.abs(current.x - next.x) <= EPSILON) &&
      !(Math.abs(previous.y - current.y) <= EPSILON && Math.abs(current.y - next.y) <= EPSILON);

    if (!isCorner) {
      path += ` L ${formatCoordinate(current.x)} ${formatCoordinate(current.y)}`;
      continue;
    }

    const incomingLength = estimateDistance(previous, current);
    const outgoingLength = estimateDistance(current, next);
    const appliedCornerSize = Math.min(cornerSize, incomingLength * 0.72, outgoingLength * 0.72);
    const cornerStart = movePointTowards(current, previous, appliedCornerSize);
    const cornerEnd = movePointTowards(current, next, appliedCornerSize);

    path += ` L ${formatCoordinate(cornerStart.x)} ${formatCoordinate(cornerStart.y)}`;

    if (mode === 'curved') {
      const controlDistance = Math.max(appliedCornerSize * curveStrength, 14);
      const controlStart = movePointAwayFrom(cornerStart, previous, controlDistance);
      const controlEnd = movePointAwayFrom(cornerEnd, next, controlDistance);
      path += ` C ${formatCoordinate(controlStart.x)} ${formatCoordinate(controlStart.y)} ${formatCoordinate(controlEnd.x)} ${formatCoordinate(controlEnd.y)} ${formatCoordinate(cornerEnd.x)} ${formatCoordinate(cornerEnd.y)}`;
    } else {
      path += ` L ${formatCoordinate(cornerEnd.x)} ${formatCoordinate(cornerEnd.y)}`;
    }
  }

  path += ` L ${formatCoordinate(points[points.length - 1].x)} ${formatCoordinate(points[points.length - 1].y)}`;

  return path;
}

export function pointsToSvgPathWithLineJumps(
  points: Position[],
  crossingSegments: OrthogonalSegment[],
  options: LineJumpOptions = {},
): string {
  if (points.length === 0) return '';

  const radius = options.radius ?? 5;
  const arcHeight = options.arcHeight ?? 7;
  const endpointClearance = options.endpointClearance ?? 12;
  const crossingEndpointClearance =
    options.crossingEndpointClearance ?? Math.max(endpointClearance, radius * 2, arcHeight + 2);

  let path = `M ${formatCoordinate(points[0].x)} ${formatCoordinate(points[0].y)}`;

  for (let i = 0; i < points.length - 1; i += 1) {
    const from = points[i];
    const to = points[i + 1];

    if (Math.abs(from.y - to.y) <= EPSILON) {
      const y = from.y;
      const minX = Math.min(from.x, to.x);
      const maxX = Math.max(from.x, to.x);
      const direction = to.x >= from.x ? 1 : -1;

      const intersections = crossingSegments
        .filter((segment) => segment.orientation === 'vertical')
        .map((segment) => ({
          x: segment.x1,
          yTop: Math.min(segment.y1, segment.y2),
          yBottom: Math.max(segment.y1, segment.y2),
        }))
        .filter((candidate) => {
          const awayFromEnds =
            candidate.x > minX + endpointClearance &&
            candidate.x < maxX - endpointClearance;
          if (!awayFromEnds) return false;

          const crosses = y > candidate.yTop + EPSILON && y < candidate.yBottom - EPSILON;
          if (!crosses) return false;

          return hasEnoughClearanceFromSegmentEnds(
            y,
            candidate.yTop,
            candidate.yBottom,
            crossingEndpointClearance,
          );
        })
        .sort((a, b) => (direction === 1 ? a.x - b.x : b.x - a.x));

      let cursorX = from.x;

      for (const intersection of intersections) {
        const bumpStartX = intersection.x - direction * radius;
        const bumpEndX = intersection.x + direction * radius;

        if (direction === 1) {
          if (bumpStartX <= cursorX + EPSILON || bumpEndX >= to.x - EPSILON) continue;
        } else {
          if (bumpStartX >= cursorX - EPSILON || bumpEndX <= to.x + EPSILON) continue;
        }

        path += ` L ${formatCoordinate(bumpStartX)} ${formatCoordinate(y)}`;
        path += ` Q ${formatCoordinate(intersection.x)} ${formatCoordinate(y - arcHeight)} ${formatCoordinate(bumpEndX)} ${formatCoordinate(y)}`;
        cursorX = bumpEndX;
      }

      path += ` L ${formatCoordinate(to.x)} ${formatCoordinate(to.y)}`;
      continue;
    }

    if (Math.abs(from.x - to.x) <= EPSILON) {
      const x = from.x;
      const minY = Math.min(from.y, to.y);
      const maxY = Math.max(from.y, to.y);
      const direction = to.y >= from.y ? 1 : -1;

      const intersections = crossingSegments
        .filter((segment) => segment.orientation === 'horizontal')
        .map((segment) => ({
          y: segment.y1,
          xLeft: Math.min(segment.x1, segment.x2),
          xRight: Math.max(segment.x1, segment.x2),
        }))
        .filter((candidate) => {
          const awayFromEnds =
            candidate.y > minY + endpointClearance &&
            candidate.y < maxY - endpointClearance;
          if (!awayFromEnds) return false;

          const crosses = x > candidate.xLeft + EPSILON && x < candidate.xRight - EPSILON;
          if (!crosses) return false;

          return hasEnoughClearanceFromSegmentEnds(
            x,
            candidate.xLeft,
            candidate.xRight,
            crossingEndpointClearance,
          );
        })
        .sort((a, b) => (direction === 1 ? a.y - b.y : b.y - a.y));

      let cursorY = from.y;

      for (const intersection of intersections) {
        const bumpStartY = intersection.y - direction * radius;
        const bumpEndY = intersection.y + direction * radius;

        if (direction === 1) {
          if (bumpStartY <= cursorY + EPSILON || bumpEndY >= to.y - EPSILON) continue;
        } else {
          if (bumpStartY >= cursorY - EPSILON || bumpEndY <= to.y + EPSILON) continue;
        }

        path += ` L ${formatCoordinate(x)} ${formatCoordinate(bumpStartY)}`;
        path += ` Q ${formatCoordinate(x + arcHeight)} ${formatCoordinate(intersection.y)} ${formatCoordinate(x)} ${formatCoordinate(bumpEndY)}`;
        cursorY = bumpEndY;
      }

      path += ` L ${formatCoordinate(to.x)} ${formatCoordinate(to.y)}`;
      continue;
    }

    path += ` L ${formatCoordinate(to.x)} ${formatCoordinate(to.y)}`;
  }

  return path;
}

export function getPolylineMidpoint(points: Position[]): Position {
  if (points.length === 0) return { x: 0, y: 0 };
  if (points.length === 1) return points[0];

  let totalLength = 0;

  for (let i = 0; i < points.length - 1; i += 1) {
    totalLength += estimateDistance(points[i], points[i + 1]);
  }

  if (totalLength <= EPSILON) return points[0];

  const half = totalLength / 2;
  let accumulated = 0;

  for (let i = 0; i < points.length - 1; i += 1) {
    const segmentLength = estimateDistance(points[i], points[i + 1]);
    if (accumulated + segmentLength >= half) {
      const remaining = half - accumulated;
      const ratio = segmentLength <= EPSILON ? 0 : remaining / segmentLength;
      return {
        x: points[i].x + (points[i + 1].x - points[i].x) * ratio,
        y: points[i].y + (points[i + 1].y - points[i].y) * ratio,
      };
    }
    accumulated += segmentLength;
  }

  return points[points.length - 1];
}
