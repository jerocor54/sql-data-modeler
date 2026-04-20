import { TABLE_NODE_WIDTH } from './diagramGeometry';
import type { Position } from '../types/erd';

export type EdgeSide = 'left' | 'right' | 'top' | 'bottom';

export const EDGE_HANDLE_IDS = {
  source: {
    left: 'source-left',
    right: 'source-right',
    top: 'source-top',
    bottom: 'source-bottom',
  },
  target: {
    left: 'target-left',
    right: 'target-right',
    top: 'target-top',
    bottom: 'target-bottom',
  },
} as const;

const DEFAULT_TABLE_HEIGHT = 168;

const SIDE_VECTORS: Record<EdgeSide, Position> = {
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
  top: { x: 0, y: -1 },
  bottom: { x: 0, y: 1 },
};

export interface ResolveHandlePairOptions {
  sourceWidth?: number;
  sourceHeight?: number;
  targetWidth?: number;
  targetHeight?: number;
  sourceSideCounts?: Partial<Record<EdgeSide, number>>;
  targetSideCounts?: Partial<Record<EdgeSide, number>>;
  sameSidePenalty?: number;
  loadPenalty?: number;
  reversePenalty?: number;
  axisPenalty?: number;
  tightGapPenalty?: number;
  axisDominancePenalty?: number;
  mixedOrientationPenalty?: number;
  axisDominanceThreshold?: number;
}

function isHorizontalSide(side: EdgeSide): boolean {
  return side === 'left' || side === 'right';
}

function getAxisGap(distance: number, sourceSpan: number, targetSpan: number): number {
  return Math.max(0, Math.abs(distance) - (sourceSpan + targetSpan) / 2);
}

function getTightGapPenalty(side: EdgeSide, horizontalGap: number, verticalGap: number, unitPenalty: number): number {
  const relevantGap = isHorizontalSide(side) ? horizontalGap : verticalGap;
  const shortfall = Math.max(0, 36 - relevantGap);
  return shortfall <= 0 ? 0 : (shortfall / 36) * unitPenalty;
}

function getAnchor(center: Position, side: EdgeSide, width: number, height: number): Position {
  if (side === 'left') return { x: center.x - width / 2, y: center.y };
  if (side === 'right') return { x: center.x + width / 2, y: center.y };
  if (side === 'top') return { x: center.x, y: center.y - height / 2 };
  return { x: center.x, y: center.y + height / 2 };
}

function getLoadPenalty(side: EdgeSide, counts?: Partial<Record<EdgeSide, number>>, unitPenalty = 32): number {
  const count = counts?.[side] ?? 0;
  return count <= 0 ? 0 : count * unitPenalty + Math.max(0, count - 1) * unitPenalty * 0.65;
}

export function resolveHandlePair(sourceCenter: Position, targetCenter: Position, options: ResolveHandlePairOptions = {}): {
  sourceHandle: string;
  targetHandle: string;
  sourceSide: EdgeSide;
  targetSide: EdgeSide;
  axis: 'horizontal' | 'vertical';
} {
  const dx = targetCenter.x - sourceCenter.x;
  const dy = targetCenter.y - sourceCenter.y;

  const sourceWidth = options.sourceWidth ?? TABLE_NODE_WIDTH;
  const targetWidth = options.targetWidth ?? TABLE_NODE_WIDTH;
  const sourceHeight = options.sourceHeight ?? DEFAULT_TABLE_HEIGHT;
  const targetHeight = options.targetHeight ?? DEFAULT_TABLE_HEIGHT;
  const sameSidePenalty = options.sameSidePenalty ?? 26;
  const loadPenalty = options.loadPenalty ?? 34;
  const reversePenalty = options.reversePenalty ?? 108;
  const axisPenalty = options.axisPenalty ?? 18;
  const tightGapPenalty = options.tightGapPenalty ?? 28;
  const axisDominancePenalty = options.axisDominancePenalty ?? 46;
  const mixedOrientationPenalty = options.mixedOrientationPenalty ?? 12;
  const axisDominanceThreshold = options.axisDominanceThreshold ?? 52;
  const horizontalGap = getAxisGap(dx, sourceWidth, targetWidth);
  const verticalGap = getAxisGap(dy, sourceHeight, targetHeight);

  const sourceSides: EdgeSide[] = ['left', 'right', 'top', 'bottom'];
  const targetSides: EdgeSide[] = ['left', 'right', 'top', 'bottom'];

  let best:
    | {
        sourceSide: EdgeSide;
        targetSide: EdgeSide;
        axis: 'horizontal' | 'vertical';
        score: number;
      }
    | undefined;

  for (const sourceSide of sourceSides) {
    const sourceAnchor = getAnchor(sourceCenter, sourceSide, sourceWidth, sourceHeight);
    const sourceVector = SIDE_VECTORS[sourceSide];
    const sourceDirectionPenalty =
      sourceVector.x * dx + sourceVector.y * dy > 0
        ? 0
        : reversePenalty + Math.min(Math.abs(dx) + Math.abs(dy), 240) * 0.12;

    for (const targetSide of targetSides) {
      const targetAnchor = getAnchor(targetCenter, targetSide, targetWidth, targetHeight);
      const targetVector = SIDE_VECTORS[targetSide];
      const targetDirectionPenalty =
        targetVector.x * -dx + targetVector.y * -dy > 0
          ? 0
          : reversePenalty + Math.min(Math.abs(dx) + Math.abs(dy), 240) * 0.12;
      const manhattan = Math.abs(targetAnchor.x - sourceAnchor.x) + Math.abs(targetAnchor.y - sourceAnchor.y);
      const axis = Math.abs(targetAnchor.x - sourceAnchor.x) >= Math.abs(targetAnchor.y - sourceAnchor.y) ? 'horizontal' : 'vertical';
      const sourceIsHorizontal = isHorizontalSide(sourceSide);
      const targetIsHorizontal = isHorizontalSide(targetSide);
      const mixedAxisPenalty =
        axis === 'horizontal'
          ? (sourceSide === 'top' || sourceSide === 'bottom' ? axisPenalty : 0) +
            (targetSide === 'top' || targetSide === 'bottom' ? axisPenalty : 0)
          : (sourceSide === 'left' || sourceSide === 'right' ? axisPenalty : 0) +
            (targetSide === 'left' || targetSide === 'right' ? axisPenalty : 0);
      const narrowExitPenalty =
        getTightGapPenalty(sourceSide, horizontalGap, verticalGap, tightGapPenalty) +
        getTightGapPenalty(targetSide, horizontalGap, verticalGap, tightGapPenalty);
      const dominantAxisPenalty =
        horizontalGap - verticalGap > axisDominanceThreshold
          ? (sourceIsHorizontal ? 0 : axisDominancePenalty) + (targetIsHorizontal ? 0 : axisDominancePenalty)
          : verticalGap - horizontalGap > axisDominanceThreshold
            ? (sourceIsHorizontal ? axisDominancePenalty : 0) + (targetIsHorizontal ? axisDominancePenalty : 0)
            : 0;
      const orientationPenalty = sourceIsHorizontal === targetIsHorizontal ? 0 : mixedOrientationPenalty;
      const sideCrowdingPenalty =
        getLoadPenalty(sourceSide, options.sourceSideCounts, loadPenalty) +
        getLoadPenalty(targetSide, options.targetSideCounts, loadPenalty);
      const parallelSameSidePenalty = sourceSide === targetSide ? sameSidePenalty : 0;
      const score =
        manhattan +
        sourceDirectionPenalty +
        targetDirectionPenalty +
        mixedAxisPenalty +
        narrowExitPenalty +
        dominantAxisPenalty +
        orientationPenalty +
        sideCrowdingPenalty +
        parallelSameSidePenalty;

      if (!best || score < best.score) {
        best = { sourceSide, targetSide, axis, score };
      }
    }
  }

  const resolved = best ?? {
    sourceSide: dx >= 0 ? 'right' : 'left',
    targetSide: dx >= 0 ? 'left' : 'right',
    axis: 'horizontal' as const,
    score: 0,
  };

  return {
    sourceHandle: EDGE_HANDLE_IDS.source[resolved.sourceSide],
    targetHandle: EDGE_HANDLE_IDS.target[resolved.targetSide],
    sourceSide: resolved.sourceSide,
    targetSide: resolved.targetSide,
    axis: resolved.axis,
  };
}
