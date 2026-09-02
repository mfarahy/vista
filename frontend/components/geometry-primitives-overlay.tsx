'use client';

import { useI18n } from '@/lib/i18n';
import type {
  GeometryPrimitivesResult,
  WallPrimitive,
} from '@/lib/geometry-primitives';
import { RAW_COLORS } from './raw-floorplan-overlay';

export const PRIMITIVE_COLORS = {
  horizontal: '#0d9488',
  vertical: '#7c3aed',
  diagonal: '#f59e0b',
  corner: '#0f172a',
  selected: '#facc15',
  sourcePolygon: RAW_COLORS.wall,
  labelHalo: '#ffffff',
} as const;

function polygonPoints(polygon: number[][]): string {
  return polygon.map(([x, y]) => `${x},${y}`).join(' ');
}

function formatDeg(deg: number): string {
  return `${deg.toFixed(1)}°`;
}

/**
 * Overlay layer for geometry primitives. Uses exactly the same coordinate
 * system as the RAW recognition overlay (SVG viewBox = image dimensions).
 *
 * - standalone: renders the image + its own bordered container
 * - overlaid: renders only the transparent SVG layer, meant to be stacked
 *   inside the existing recognition overlay wrapper
 */
export function GeometryPrimitivesOverlay({
  imageUrl,
  imageWidth,
  imageHeight,
  result,
  raw,
  showLabels,
  showMeasurements,
  showSourcePolygons,
  showImage,
  overlaid = false,
  selectedId,
  onSelect,
}: {
  imageUrl: string | null;
  imageWidth: number;
  imageHeight: number;
  result: GeometryPrimitivesResult;
  raw?: number[][][];
  showLabels: boolean;
  showMeasurements: boolean;
  showSourcePolygons: boolean;
  showImage: boolean;
  overlaid?: boolean;
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
}) {
  const { t } = useI18n();
  if (!imageWidth || !imageHeight) return null;
  const viewBox = `0 0 ${imageWidth} ${imageHeight}`;

  const renderRun = (p: WallPrimitive) => {
    if (p.kind !== 'run') return null;
    const isSelected = selectedId === p.primitiveId;
    const color = PRIMITIVE_COLORS[p.orientation];
    const uncertain = p.uncertain;
    const showThisLabel = showLabels || isSelected;
    const labelX = (p.from.x + p.to.x) / 2;
    const labelY = (p.from.y + p.to.y) / 2;
    const labelOffsetX = p.orientation === 'vertical' ? 12 : 0;
    const labelOffsetY = p.orientation === 'horizontal' ? -10 : 10;
    const opacity = isSelected ? 1 : uncertain ? 0.55 : 0.9;
    return (
      <g
        key={p.primitiveId}
        onClick={() => onSelect?.(isSelected ? null : p.primitiveId)}
        style={{ cursor: 'pointer', pointerEvents: 'auto' }}
      >
        {/* invisible hit target for easy clicking */}
        <line
          x1={p.from.x}
          y1={p.from.y}
          x2={p.to.x}
          y2={p.to.y}
          stroke="transparent"
          strokeWidth={14}
        />
        <line
          x1={p.from.x}
          y1={p.from.y}
          x2={p.to.x}
          y2={p.to.y}
          stroke={isSelected ? PRIMITIVE_COLORS.selected : color}
          strokeWidth={isSelected ? 7 : 3.5}
          strokeLinecap="round"
          strokeDasharray={uncertain ? '8 5' : undefined}
          opacity={opacity}
        />
        {/* endpoint dots */}
        <circle cx={p.from.x} cy={p.from.y} r={2.5} fill={isSelected ? PRIMITIVE_COLORS.selected : color} stroke="#fff" strokeWidth={1} />
        <circle cx={p.to.x} cy={p.to.y} r={2.5} fill={isSelected ? PRIMITIVE_COLORS.selected : color} stroke="#fff" strokeWidth={1} />
        {(showThisLabel || showMeasurements) && (
          <g transform={`translate(${labelX + labelOffsetX}, ${labelY + labelOffsetY})`}>
            <text x={0} y={0} fontSize={11} fontWeight={700} fill="#111" textAnchor="middle" paintOrder="stroke" stroke={PRIMITIVE_COLORS.labelHalo} strokeWidth={3} strokeLinejoin="round">
              {p.primitiveId}
            </text>
            {showMeasurements && (
              <>
                <text x={0} y={13} fontSize={9} fill="#333" textAnchor="middle" paintOrder="stroke" stroke={PRIMITIVE_COLORS.labelHalo} strokeWidth={3}>
                  {t('geometryPrimitives.labelLength', { px: String(Math.round(p.lengthPx)) })} · {t('geometryPrimitives.labelAngle', { deg: formatDeg(p.angleDeg) })}
                </text>
                <text x={0} y={24} fontSize={9} fill="#555" textAnchor="middle" paintOrder="stroke" stroke={PRIMITIVE_COLORS.labelHalo} strokeWidth={3}>
                  {t('geometryPrimitives.labelParent', { id: p.sourceObjectId })}
                  {p.estimatedThicknessPx !== null ? ` · ${t('geometryPrimitives.labelThickness', { px: String(Math.round(p.estimatedThicknessPx)) })}` : ''}
                </text>
              </>
            )}
          </g>
        )}
      </g>
    );
  };

  const renderCorner = (p: WallPrimitive) => {
    if (p.kind !== 'corner') return null;
    const isSelected = selectedId === p.primitiveId;
    return (
      <g
        key={p.primitiveId}
        onClick={() => onSelect?.(isSelected ? null : p.primitiveId)}
        style={{ cursor: 'pointer', pointerEvents: 'auto' }}
      >
        <circle cx={p.from.x} cy={p.from.y} r={isSelected ? 9 : 6} fill="transparent" />
        <circle
          cx={p.from.x}
          cy={p.from.y}
          r={isSelected ? 5 : 3.5}
          fill={isSelected ? PRIMITIVE_COLORS.selected : PRIMITIVE_COLORS.corner}
          stroke="#fff"
          strokeWidth={1.5}
        />
        {(showLabels || isSelected) && (
          <text
            x={p.from.x + 7}
            y={p.from.y + 12}
            fontSize={9}
            fontWeight={600}
            fill="#111"
            paintOrder="stroke"
            stroke={PRIMITIVE_COLORS.labelHalo}
            strokeWidth={3}
          >
            {p.primitiveId}
          </text>
        )}
      </g>
    );
  };

  const container = overlaid ? 'absolute inset-0' : 'relative w-full overflow-hidden rounded-xl border bg-white';

  return (
    <div className={container}>
      <div className="relative w-full" style={{ aspectRatio: `${imageWidth}/${imageHeight}` }}>
        {showImage && imageUrl ? (
          <img src={imageUrl} alt="Floorplan source" className="absolute inset-0 h-full w-full object-contain" draggable={false} />
        ) : showImage ? (
          <div className="absolute inset-0 bg-white" />
        ) : null}
        <svg
          viewBox={viewBox}
          preserveAspectRatio="xMidYMid meet"
          className="absolute inset-0 h-full w-full"
          style={{ pointerEvents: 'none' }}
        >
          {/* faint source polygon outlines for traceability */}
          {showSourcePolygons &&
            (raw ?? []).map((poly, i) => (
              <polygon
                key={`gp-src-${i}`}
                points={polygonPoints(poly)}
                fill={PRIMITIVE_COLORS.sourcePolygon}
                fillOpacity={0.04}
                stroke={PRIMITIVE_COLORS.sourcePolygon}
                strokeWidth={1}
                strokeOpacity={0.35}
                strokeDasharray="2 3"
              />
            ))}
          {result.primitives.map(renderRun)}
          {result.primitives.map(renderCorner)}
        </svg>
      </div>
    </div>
  );
}