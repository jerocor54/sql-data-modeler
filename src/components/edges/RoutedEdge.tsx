import type { CSSProperties } from 'react';
import { BaseEdge, EdgeLabelRenderer, type EdgeProps } from '@xyflow/react';
import type { RelationshipCardinality, RelationshipEndpointCardinality } from '../../types/erd';

interface RoutedEdgeData {
  path?: string;
  points?: Array<{ x: number; y: number }>;
  labelX?: number;
  labelY?: number;
  showLabel?: boolean;
  cardinality?: RelationshipCardinality;
}

interface MarkerPathShape {
  kind: 'path';
  d: string;
}

interface MarkerCircleShape {
  kind: 'circle';
  cx: number;
  cy: number;
  r: number;
}

type MarkerShape = MarkerPathShape | MarkerCircleShape;

interface CardinalityLegendMarkProps {
  cardinality: RelationshipEndpointCardinality;
  width?: number;
  height?: number;
  strokeWidth?: number;
}

function normalizeVector(vector: { x: number; y: number }): { x: number; y: number } | null {
  const magnitude = Math.hypot(vector.x, vector.y);
  if (magnitude <= 0.001) return null;

  return {
    x: vector.x / magnitude,
    y: vector.y / magnitude,
  };
}

function getEndpointDirection(
  points: Array<{ x: number; y: number }>,
  endpoint: 'start' | 'end',
): { point: { x: number; y: number }; bodyDirection: { x: number; y: number } } | null {
  if (points.length < 2) return null;

  if (endpoint === 'start') {
    const point = points[0];
    for (let index = 1; index < points.length; index += 1) {
      const direction = normalizeVector({ x: points[index].x - point.x, y: points[index].y - point.y });
      if (direction) return { point, bodyDirection: direction };
    }
    return null;
  }

  const point = points[points.length - 1];
  for (let index = points.length - 2; index >= 0; index -= 1) {
    const direction = normalizeVector({ x: points[index].x - point.x, y: points[index].y - point.y });
    if (direction) return { point, bodyDirection: direction };
  }

  return null;
}

function translatePoint(origin: { x: number; y: number }, direction: { x: number; y: number }, distance: number): { x: number; y: number } {
  return {
    x: origin.x + direction.x * distance,
    y: origin.y + direction.y * distance,
  };
}

function buildBarPath(
  center: { x: number; y: number },
  perpendicular: { x: number; y: number },
  halfLength: number,
): string {
  const left = {
    x: center.x + perpendicular.x * halfLength,
    y: center.y + perpendicular.y * halfLength,
  };
  const right = {
    x: center.x - perpendicular.x * halfLength,
    y: center.y - perpendicular.y * halfLength,
  };

  return `M ${left.x} ${left.y} L ${right.x} ${right.y}`;
}

function buildCrowFootPath(
  point: { x: number; y: number },
  bodyDirection: { x: number; y: number },
  perpendicular: { x: number; y: number },
  strokeWidth: number,
): string {
  const stemLength = 8 + strokeWidth * 1.8;
  const sideInset = strokeWidth * 0.75;
  const spread = 7 + strokeWidth * 1.5;
  const base = translatePoint(point, bodyDirection, stemLength);
  const leftTip = {
    x: point.x + bodyDirection.x * sideInset + perpendicular.x * spread,
    y: point.y + bodyDirection.y * sideInset + perpendicular.y * spread,
  };
  const rightTip = {
    x: point.x + bodyDirection.x * sideInset - perpendicular.x * spread,
    y: point.y + bodyDirection.y * sideInset - perpendicular.y * spread,
  };

  return `M ${base.x} ${base.y} L ${point.x} ${point.y} M ${base.x} ${base.y} L ${leftTip.x} ${leftTip.y} M ${base.x} ${base.y} L ${rightTip.x} ${rightTip.y}`;
}

function buildEndpointMarker(
  points: Array<{ x: number; y: number }>,
  endpoint: 'start' | 'end',
  cardinality: RelationshipEndpointCardinality,
  strokeWidth: number,
): MarkerShape[] | null {
  const endpointDirection = getEndpointDirection(points, endpoint);
  if (!endpointDirection) return null;

  const { point, bodyDirection } = endpointDirection;
  const perpendicular = { x: -bodyDirection.y, y: bodyDirection.x };
  const barHalfLength = 6 + strokeWidth * 1.45;
  const barNearOffset = 5 + strokeWidth * 0.9;
  const barFarOffset = 12 + strokeWidth * 1.5;
  const circleRadius = 4.5 + strokeWidth * 0.35;
  const circleAfterBarOffset = barFarOffset + circleRadius + strokeWidth * 0.85;
  const circleAfterCrowFootOffset = 18 + strokeWidth * 2.2;
  const shapes: MarkerShape[] = [];

  if (cardinality.max === 'many') {
    shapes.push({ kind: 'path', d: buildCrowFootPath(point, bodyDirection, perpendicular, strokeWidth) });

    if (cardinality.min === 0) {
      const center = translatePoint(point, bodyDirection, circleAfterCrowFootOffset);
      shapes.push({ kind: 'circle', cx: center.x, cy: center.y, r: circleRadius });
    } else {
      const center = translatePoint(point, bodyDirection, barFarOffset);
      shapes.push({ kind: 'path', d: buildBarPath(center, perpendicular, barHalfLength) });
    }

    return shapes;
  }

  const nearBarCenter = translatePoint(point, bodyDirection, barNearOffset);
  shapes.push({ kind: 'path', d: buildBarPath(nearBarCenter, perpendicular, barHalfLength) });

  if (cardinality.min === 0) {
    const center = translatePoint(point, bodyDirection, circleAfterBarOffset);
    shapes.push({ kind: 'circle', cx: center.x, cy: center.y, r: circleRadius });
  } else {
    const farBarCenter = translatePoint(point, bodyDirection, barFarOffset);
    shapes.push({ kind: 'path', d: buildBarPath(farBarCenter, perpendicular, barHalfLength) });
  }

  return shapes;
}

function renderMarkerShapes(idPrefix: string, shapes: MarkerShape[], style: CSSProperties) {
  return shapes.map((shape, index) =>
    shape.kind === 'path' ? (
      <path key={`${idPrefix}-path-${index}`} d={shape.d} style={style} fill="none" />
    ) : (
      <circle key={`${idPrefix}-circle-${index}`} cx={shape.cx} cy={shape.cy} r={shape.r} style={style} fill="none" />
    ),
  );
}

export function CardinalityLegendMark({
  cardinality,
  width = 52,
  height = 20,
  strokeWidth = 1.6,
}: CardinalityLegendMarkProps) {
  const points = [
    { x: 6, y: height / 2 },
    { x: width - 8, y: height / 2 },
  ];
  const markerShapes = buildEndpointMarker(points, 'end', cardinality, strokeWidth) ?? [];
  const lineStyle: CSSProperties = {
    stroke: 'currentColor',
    strokeWidth,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  };

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <path d={`M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`} fill="none" style={lineStyle} />
      {renderMarkerShapes(`legend-${cardinality.min}-${cardinality.max}`, markerShapes, lineStyle)}
    </svg>
  );
}

export default function RoutedEdge(props: EdgeProps) {
  const data = (props.data ?? {}) as RoutedEdgeData;
  const edgePath = data.path ?? `M ${props.sourceX} ${props.sourceY} L ${props.targetX} ${props.targetY}`;
  const edgePoints = data.points ?? [
    { x: props.sourceX, y: props.sourceY },
    { x: props.targetX, y: props.targetY },
  ];
  const labelX = data.labelX ?? (props.sourceX + props.targetX) / 2;
  const labelY = data.labelY ?? (props.sourceY + props.targetY) / 2;
  const shouldRenderLabel = data.showLabel && typeof props.label === 'string' && props.label.length > 0;
  const edgeStyle = (props.style ?? {}) as CSSProperties;
  const strokeWidth = typeof edgeStyle.strokeWidth === 'number' ? edgeStyle.strokeWidth : 2;
  const cardinality =
    data.cardinality ?? {
      source: { min: 0, max: 'many' },
      target: { min: 0, max: 'many' },
    };
  const startMarkerShapes = buildEndpointMarker(edgePoints, 'start', cardinality.source, strokeWidth) ?? [];
  const endMarkerShapes = buildEndpointMarker(edgePoints, 'end', cardinality.target, strokeWidth) ?? [];
  const backgroundStyle: CSSProperties = {
    stroke: 'var(--bg)',
    strokeWidth: strokeWidth + 4,
    strokeLinecap: edgeStyle.strokeLinecap ?? 'round',
    strokeLinejoin: 'round',
    filter: 'none',
    opacity: 1,
  };
  const foregroundStyle: CSSProperties = {
    ...edgeStyle,
    strokeLinejoin: 'round',
  };
  const capForegroundStyle: CSSProperties = {
    ...foregroundStyle,
    strokeLinecap: 'round',
    strokeDasharray: undefined,
    strokeDashoffset: undefined,
  };

  return (
    <>
      <BaseEdge
        id={`${props.id}-underlay`}
        path={edgePath}
        style={backgroundStyle}
        interactionWidth={props.interactionWidth}
      />
      <BaseEdge
        id={props.id}
        path={edgePath}
        style={foregroundStyle}
        interactionWidth={props.interactionWidth}
      />
      {renderMarkerShapes(`${props.id}-start-bg`, startMarkerShapes, backgroundStyle)}
      {renderMarkerShapes(`${props.id}-end-bg`, endMarkerShapes, backgroundStyle)}
      {renderMarkerShapes(`${props.id}-start-fg`, startMarkerShapes, capForegroundStyle)}
      {renderMarkerShapes(`${props.id}-end-fg`, endMarkerShapes, capForegroundStyle)}

      {shouldRenderLabel && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: 'none',
              fontSize: 11,
              fontWeight: 600,
              color: '#67e8f9',
              background: 'color-mix(in srgb, var(--surface) 92%, transparent)',
              border: '1px solid color-mix(in srgb, var(--border) 80%, transparent)',
              borderRadius: 6,
              padding: '2px 8px',
              whiteSpace: 'nowrap',
              zIndex: 4,
            }}
            className="nodrag nopan"
          >
            {props.label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
