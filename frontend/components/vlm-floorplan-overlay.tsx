'use client';

import type { ReactNode } from 'react';
import { RAW_COLORS, type RawGeometry, type LayerVisibility } from './raw-floorplan-overlay';

// ---- Geometry constraints (mirrors backend zod schema) ----
//
// The VLM proposes deterministic, actionable relationships between existing RAW
// recognition objects — never coordinates or replacement geometry. For
// directional types the ORDER of objectIds is significant (source → target):
// - continue_wall: [source, target] — wall continues from source toward target
// - extend_wall: [source, target] — source is extended to reach target
// - opening_interrupts_wall: [opening, hostWall]

export type GeometryConstraintType =
  | 'merge_walls'
  | 'continue_wall'
  | 'extend_wall'
  | 'remove_object'
  | 'parallel_walls'
  | 'perpendicular_walls'
  | 'same_axis'
  | 'wall_corner'
  | 'wall_t_junction'
  | 'opening_interrupts_wall';

export type GeometryConstraint = {
  type: GeometryConstraintType;
  objectIds: string[];
  confidence: number;
  reason: string | null;
};

export type GeometryConstraintsVisibility = {
  mergeWalls: boolean;
  continueWall: boolean;
  extendWall: boolean;
  removeObject: boolean;
  parallelWalls: boolean;
  perpendicularWalls: boolean;
  sameAxis: boolean;
  wallCorner: boolean;
  wallTJunction: boolean;
  openingInterruptsWall: boolean;
};

export const defaultConstraintsVisibility: GeometryConstraintsVisibility = {
  mergeWalls: true,
  continueWall: true,
  extendWall: true,
  removeObject: true,
  parallelWalls: true,
  perpendicularWalls: true,
  sameAxis: true,
  wallCorner: true,
  wallTJunction: true,
  openingInterruptsWall: true,
};

export const GEOMETRY_CONSTRAINT_TYPES: GeometryConstraintType[] = [
  'merge_walls',
  'continue_wall',
  'extend_wall',
  'remove_object',
  'parallel_walls',
  'perpendicular_walls',
  'same_axis',
  'wall_corner',
  'wall_t_junction',
  'opening_interrupts_wall',
];

export function geometryConstraintLabel(type: GeometryConstraintType): string {
  switch (type) {
    case 'merge_walls': return 'Merge walls';
    case 'continue_wall': return 'Continue wall';
    case 'extend_wall': return 'Extend wall';
    case 'remove_object': return 'Remove object';
    case 'parallel_walls': return 'Parallel walls';
    case 'perpendicular_walls': return 'Perpendicular walls';
    case 'same_axis': return 'Same axis';
    case 'wall_corner': return 'Wall corner';
    case 'wall_t_junction': return 'Wall T-junction';
    case 'opening_interrupts_wall': return 'Opening interrupts wall';
  }
}

export const GEOMETRY_CONSTRAINT_COLORS: Record<GeometryConstraintType, string> = {
  merge_walls: '#6a1b9a',
  continue_wall: '#2e7d32',
  extend_wall: '#ef6c00',
  remove_object: '#c62828',
  parallel_walls: '#1565c0',
  perpendicular_walls: '#7b1fa2',
  same_axis: '#00695c',
  wall_corner: '#f9a825',
  wall_t_junction: '#1e88e5',
  opening_interrupts_wall: '#00acc1',
};

/** Confidence below this threshold is rendered as "low confidence". */
export const LOW_CONFIDENCE_THRESHOLD = 0.75;

export function isLowConfidenceConstraint(confidence: number): boolean {
  return confidence < LOW_CONFIDENCE_THRESHOLD;
}

/** Stable key for React lists / selection identity. */
export function constraintKey(constraint: GeometryConstraint): string {
  return `${constraint.type}|${constraint.objectIds.join('|')}`;
}

export function sortConstraintsByConfidence(constraints: GeometryConstraint[]): GeometryConstraint[] {
  return [...constraints].sort((a, b) => b.confidence - a.confidence);
}

export type ConstraintSummary = {
  total: number;
  mergeWalls: number;
  continueWall: number;
  extendWall: number;
  removeObject: number;
  parallelPerpendicular: number;
  corners: number;
  tJunctions: number;
  openingInterruptions: number;
};

export function summarizeConstraints(constraints: GeometryConstraint[]): ConstraintSummary {
  const summary: ConstraintSummary = {
    total: constraints.length,
    mergeWalls: 0,
    continueWall: 0,
    extendWall: 0,
    removeObject: 0,
    parallelPerpendicular: 0,
    corners: 0,
    tJunctions: 0,
    openingInterruptions: 0,
  };
  for (const c of constraints) {
    switch (c.type) {
      case 'merge_walls': summary.mergeWalls += 1; break;
      case 'continue_wall': summary.continueWall += 1; break;
      case 'extend_wall': summary.extendWall += 1; break;
      case 'remove_object': summary.removeObject += 1; break;
      case 'parallel_walls':
      case 'perpendicular_walls': summary.parallelPerpendicular += 1; break;
      case 'wall_corner': summary.corners += 1; break;
      case 'wall_t_junction': summary.tJunctions += 1; break;
      case 'opening_interrupts_wall': summary.openingInterruptions += 1; break;
    }
  }
  return summary;
}

export function filterConstraintsByVisibility(
  constraints: GeometryConstraint[],
  visibility: GeometryConstraintsVisibility,
): GeometryConstraint[] {
  return constraints.filter((c) => {
    switch (c.type) {
      case 'merge_walls': return visibility.mergeWalls;
      case 'continue_wall': return visibility.continueWall;
      case 'extend_wall': return visibility.extendWall;
      case 'remove_object': return visibility.removeObject;
      case 'parallel_walls': return visibility.parallelWalls;
      case 'perpendicular_walls': return visibility.perpendicularWalls;
      case 'same_axis': return visibility.sameAxis;
      case 'wall_corner': return visibility.wallCorner;
      case 'wall_t_junction': return visibility.wallTJunction;
      case 'opening_interrupts_wall': return visibility.openingInterruptsWall;
      default: return true;
    }
  });
}

export type WallRelationship = {
  wallIds: string[];
  relationship:
    | 'same_continuous_wall'
    | 'separate_walls'
    | 'collinear'
    | 'perpendicular'
    | 'corner'
    | 'T_junction'
    | 'extension_of'
    | 'uncertain';
  confidence: number;
  reason: string | null;
};

export type OpeningAssociation = {
  objectId: string;
  type: 'door' | 'entry_door' | 'window';
  hostWallIds: string[];
  relationship: 'interrupts_wall' | 'adjacent' | 'uncertain';
  confidence: number;
  reason: string | null;
};

export type ObjectClassification = {
  objectId: string;
  classification: 'valid' | 'suspicious' | 'likely_false_positive' | 'uncertain';
  confidence: number;
  reason: string | null;
};

export type RoomHypothesis = {
  id: string;
  type: 'living' | 'kitchen' | 'hallway' | 'bathroom' | 'entrance' | 'utility' | 'bedroom' | 'terrace' | 'outside' | 'unknown';
  boundaryWalls: string[];
  openings: string[];
  // deprecated fallback
  boundaryObjects?: string[];
  confidence: number;
  reason: string | null;
};

export type TopologySummary = {
  continuousWalls: string[][];
  corners: string[][];
  tJunctions: string[][];
  falsePositives: string[];
};

export type VlmAnalysis = {
  wallRelationships: WallRelationship[];
  openings: OpeningAssociation[];
  objectClassifications: ObjectClassification[];
  rooms: RoomHypothesis[];
  topologySummary: TopologySummary;
  geometryConstraints?: GeometryConstraint[];
};

export type VlmVisibility = {
  wallRelationships: boolean;
  openingAssociations: boolean;
  objectClassifications: boolean;
  rooms: boolean;
};

export const VLM_COLORS = {
  same_continuous_wall: '#43a047',
  separate_walls: '#e53935',
  corner: '#fb8c00',
  T_junction: '#1e88e5',
  uncertain: '#757575',
  collinear: '#2e7d32',
  perpendicular: '#7b1fa2',
  extension_of: '#00897b',
  opening: '#00acc1',
  room: '#7cb342',
  classification_valid: '#2e7d32',
  classification_suspicious: '#f9a825',
  classification_likely_false_positive: '#d81b60',
  classification_uncertain: '#757575',
  highlight: '#ffeb3b',
};

// ---- helpers ----

function polygonPoints(polygon: number[][]): string {
  return polygon.map(([x, y]) => `${x},${y}`).join(' ');
}

function centroid(polygon: number[][]): { x: number; y: number } {
  let x = 0;
  let y = 0;
  for (const [px, py] of polygon) {
    x += px;
    y += py;
  }
  return { x: x / polygon.length, y: y / polygon.length };
}

const RAW_CATEGORIES = [
  'entry_door_center_line',
  'window_center_line',
  'door_center_line',
  'entry_door',
  'window',
  'kitchen',
  'wall',
  'door',
] as const;

function parseObjectId(objectId: string): { category: string; index: number } | null {
  for (const cat of RAW_CATEGORIES) {
    const prefix = `${cat}-`;
    if (objectId.startsWith(prefix)) {
      const idxStr = objectId.slice(prefix.length);
      if (!idxStr || !/^\d+$/.test(idxStr)) continue;
      const idx = Number(idxStr);
      if (Number.isInteger(idx) && idx >= 0) return { category: cat, index: idx };
    }
  }
  return null;
}

function getPolygonForId(id: string, raw: RawGeometry): number[][] | null {
  const parsed = parseObjectId(id);
  if (!parsed) return null;
  const arr = (raw as unknown as Record<string, number[][][]>)[parsed.category];
  if (!Array.isArray(arr)) return null;
  if (parsed.index >= arr.length) return null;
  return arr[parsed.index] ?? null;
}

function getCentroidForId(id: string, raw: RawGeometry): { x: number; y: number } | null {
  const poly = getPolygonForId(id, raw);
  if (!poly || poly.length === 0) return null;
  return centroid(poly);
}

function midpoint(a: { x: number; y: number }, b: { x: number; y: number }): { x: number; y: number } {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function polygonBounds(poly: number[][]): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of poly) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return { minX, minY, maxX, maxY };
}

function roomColor(type: RoomHypothesis['type']): string {
  switch (type) {
    case 'living': return '#aed581';
    case 'kitchen': return '#ffb74d';
    case 'hallway': return '#64b5f6';
    case 'bathroom': return '#ba68c8';
    case 'entrance': return '#ffd54f';
    case 'utility': return '#90a4ae';
    case 'bedroom': return '#81d4fa';
    case 'terrace': return '#b0bec5';
    case 'outside': return '#cfd8dc';
    default: return '#bdbdbd';
  }
}

function classificationColor(cls: ObjectClassification['classification']): string {
  switch (cls) {
    case 'valid': return VLM_COLORS.classification_valid;
    case 'suspicious': return VLM_COLORS.classification_suspicious;
    case 'likely_false_positive': return VLM_COLORS.classification_likely_false_positive;
    default: return VLM_COLORS.classification_uncertain;
  }
}

// ---- Combined overlay ----

export function VlmFloorplanOverlay({
  imageUrl,
  imageWidth,
  imageHeight,
  raw,
  visibility,
  showIds,
  showImage,
  vlmAnalysis,
  vlmVisibility,
  showVlmIds,
  showConfidence,
  hideRaw,
  topologyOnly,
  highlightedIds,
  onSelectObject,
  selectedId,
  constraintsVisibility,
  showConstraints,
  geometryOnlyMode,
  onSelectConstraint,
  selectedConstraintId,
}: {
  imageUrl: string | null;
  imageWidth: number;
  imageHeight: number;
  raw: RawGeometry;
  visibility: LayerVisibility;
  showIds: boolean;
  showImage: boolean;
  vlmAnalysis: VlmAnalysis | null;
  vlmVisibility: VlmVisibility;
  showVlmIds: boolean;
  showConfidence: boolean;
  hideRaw: boolean;
  topologyOnly?: boolean;
  highlightedIds?: string[];
  onSelectObject?: (id: string | null) => void;
  selectedId?: string | null;
  constraintsVisibility?: GeometryConstraintsVisibility;
  showConstraints?: boolean;
  geometryOnlyMode?: boolean;
  onSelectConstraint?: (key: string | null) => void;
  selectedConstraintId?: string | null;
}) {
  if (!imageWidth || !imageHeight) return null;
  const viewBox = `0 0 ${imageWidth} ${imageHeight}`;
  const highlights = highlightedIds ?? [];
  const isInteractive = Boolean(onSelectObject);
  const geometryReferencedIds = geometryOnlyMode && vlmAnalysis?.geometryConstraints
    ? new Set((vlmAnalysis.geometryConstraints ?? []).flatMap((h) => h.objectIds))
    : null;
  const isGeometryReferenced = (id: string) => !geometryReferencedIds || geometryReferencedIds.has(id);

  return (
    <div className="relative w-full overflow-hidden rounded-xl border bg-white">
      <div className="relative w-full" style={{ aspectRatio: `${imageWidth}/${imageHeight}` }}>
        {showImage && imageUrl ? (
          <img src={imageUrl} alt="Floorplan source" className="absolute inset-0 h-full w-full object-contain" draggable={false} />
        ) : (
          <div className="absolute inset-0 bg-white" />
        )}
        <svg viewBox={viewBox} preserveAspectRatio="xMidYMid meet" className="absolute inset-0 h-full w-full" style={{ pointerEvents: isInteractive ? 'auto' : 'none' }}>
          <defs>
            <marker id="vlm-arrow" viewBox="0 0 10 10" refX={8} refY={5} markerWidth={6} markerHeight={6} orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill={VLM_COLORS.opening} />
            </marker>
            <marker id="gc-arrow" viewBox="0 0 10 10" refX={8} refY={5} markerWidth={6} markerHeight={6} orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#111" />
            </marker>
          </defs>

          {/* Clickable RAW polygons — inspector (geometry-only mode: only hint-referenced IDs) */}
          {!hideRaw && (
            <>
              {visibility.wall &&
                raw.wall.map((poly, i) => {
                  const id = `wall-${i}`;
                  if (!isGeometryReferenced(id)) return null;
                  const isSelected = selectedId === id;
                  return (
                    <polygon
                      key={`wall-${i}`}
                      points={polygonPoints(poly)}
                      fill={RAW_COLORS.wall}
                      fillOpacity={isSelected ? 0.5 : 0.28}
                      stroke={RAW_COLORS.wall}
                      strokeWidth={isSelected ? 3.5 : 2}
                      strokeOpacity={0.9}
                      style={{ cursor: isInteractive ? 'pointer' : undefined, pointerEvents: isInteractive ? 'auto' : 'none' }}
                      onClick={() => onSelectObject?.(isSelected ? null : id)}
                    />
                  );
                })}
              {visibility.door &&
                raw.door.map((poly, i) => {
                  const id = `door-${i}`;
                  if (!isGeometryReferenced(id)) return null;
                  const isSelected = selectedId === id;
                  return (
                    <polygon
                      key={`door-${i}`}
                      points={polygonPoints(poly)}
                      fill={RAW_COLORS.door}
                      fillOpacity={isSelected ? 0.5 : 0.28}
                      stroke={RAW_COLORS.door}
                      strokeWidth={isSelected ? 3.5 : 2}
                      style={{ cursor: isInteractive ? 'pointer' : undefined, pointerEvents: isInteractive ? 'auto' : 'none' }}
                      onClick={() => onSelectObject?.(isSelected ? null : id)}
                    />
                  );
                })}
              {visibility.entry_door &&
                raw.entry_door.map((poly, i) => {
                  const id = `entry_door-${i}`;
                  if (!isGeometryReferenced(id)) return null;
                  const isSelected = selectedId === id;
                  return (
                    <polygon
                      key={`entry_door-${i}`}
                      points={polygonPoints(poly)}
                      fill={RAW_COLORS.entry_door}
                      fillOpacity={isSelected ? 0.5 : 0.32}
                      stroke={RAW_COLORS.entry_door}
                      strokeWidth={isSelected ? 3.5 : 2}
                      style={{ cursor: isInteractive ? 'pointer' : undefined, pointerEvents: isInteractive ? 'auto' : 'none' }}
                      onClick={() => onSelectObject?.(isSelected ? null : id)}
                    />
                  );
                })}
              {visibility.window &&
                raw.window.map((poly, i) => {
                  const id = `window-${i}`;
                  if (!isGeometryReferenced(id)) return null;
                  const isSelected = selectedId === id;
                  return (
                    <polygon
                      key={`window-${i}`}
                      points={polygonPoints(poly)}
                      fill={RAW_COLORS.window}
                      fillOpacity={isSelected ? 0.5 : 0.28}
                      stroke={RAW_COLORS.window}
                      strokeWidth={isSelected ? 3.5 : 2}
                      style={{ cursor: isInteractive ? 'pointer' : undefined, pointerEvents: isInteractive ? 'auto' : 'none' }}
                      onClick={() => onSelectObject?.(isSelected ? null : id)}
                    />
                  );
                })}
              {visibility.kitchen &&
                raw.kitchen.map((poly, i) => {
                  const id = `kitchen-${i}`;
                  if (!isGeometryReferenced(id)) return null;
                  const isSelected = selectedId === id;
                  return (
                    <polygon
                      key={`kitchen-${i}`}
                      points={polygonPoints(poly)}
                      fill={RAW_COLORS.kitchen}
                      fillOpacity={isSelected ? 0.45 : 0.24}
                      stroke={RAW_COLORS.kitchen}
                      strokeWidth={isSelected ? 3.5 : 2}
                      strokeDasharray="6 4"
                      style={{ cursor: isInteractive ? 'pointer' : undefined, pointerEvents: isInteractive ? 'auto' : 'none' }}
                      onClick={() => onSelectObject?.(isSelected ? null : id)}
                    />
                  );
                })}
              {visibility.door_center_line &&
                raw.door_center_line.map((poly, i) => {
                  if (poly.length < 2) return null;
                  const [a, b] = poly;
                  return <line key={`dcl-${i}`} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={RAW_COLORS.door_center_line} strokeWidth={2} strokeDasharray="8 4" strokeLinecap="round" />;
                })}
              {visibility.entry_door_center_line &&
                raw.entry_door_center_line.map((poly, i) => {
                  if (poly.length < 2) return null;
                  const [a, b] = poly;
                  return <line key={`edcl-${i}`} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={RAW_COLORS.entry_door_center_line} strokeWidth={2.5} strokeDasharray="8 4" strokeLinecap="round" />;
                })}
              {visibility.window_center_line &&
                raw.window_center_line.map((poly, i) => {
                  if (poly.length < 2) return null;
                  const [a, b] = poly;
                  return <line key={`wcl-${i}`} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={RAW_COLORS.window_center_line} strokeWidth={2} strokeDasharray="8 4" strokeLinecap="round" />;
                })}
              {showIds && (
                <>
                  {visibility.wall && raw.wall.map((poly, i) => { const c = centroid(poly); return <text key={`wall-id-${i}`} x={c.x} y={c.y} fontSize={9} fill="#000" textAnchor="middle" paintOrder="stroke" stroke="#fff" strokeWidth={3} strokeLinejoin="round">wall-{i}</text>; })}
                  {visibility.door && raw.door.map((poly, i) => { const c = centroid(poly); return <text key={`door-id-${i}`} x={c.x} y={c.y} fontSize={9} fill="#000" textAnchor="middle" paintOrder="stroke" stroke="#fff" strokeWidth={3} strokeLinejoin="round">door-{i}</text>; })}
                  {visibility.entry_door && raw.entry_door.map((poly, i) => { const c = centroid(poly); return <text key={`ed-id-${i}`} x={c.x} y={c.y} fontSize={9} fill="#000" textAnchor="middle" paintOrder="stroke" stroke="#fff" strokeWidth={3} strokeLinejoin="round">entry_door-{i}</text>; })}
                  {visibility.window && raw.window.map((poly, i) => { const c = centroid(poly); return <text key={`win-id-${i}`} x={c.x} y={c.y} fontSize={8} fill="#000" textAnchor="middle" paintOrder="stroke" stroke="#fff" strokeWidth={3} strokeLinejoin="round">window-{i}</text>; })}
                  {visibility.kitchen && raw.kitchen.map((poly, i) => { const c = centroid(poly); return <text key={`kit-id-${i}`} x={c.x} y={c.y} fontSize={9} fill="#000" textAnchor="middle" paintOrder="stroke" stroke="#fff" strokeWidth={3} strokeLinejoin="round">kitchen-{i}</text>; })}
                </>
              )}
            </>
          )}

          {/* VLM layers */}
          {vlmAnalysis && (
            <>
              {/* Object classifications — highlight object polygons (hidden in geometry-only mode) */}
              {!geometryOnlyMode && vlmVisibility.objectClassifications &&
                vlmAnalysis.objectClassifications
                  .filter((c) => c.classification !== 'valid')
                  .map((c, idx) => {
                    const poly = getPolygonForId(c.objectId, raw);
                    if (!poly) return null;
                    const col = classificationColor(c.classification);
                    const isFalsePositive = c.classification === 'likely_false_positive';
                    const isUncertain = c.classification === 'uncertain';
                    const cc = centroid(poly);
                    return (
                      <g key={`cls-${idx}`}>
                        <polygon points={polygonPoints(poly)} fill={col} fillOpacity={0.14} stroke={col} strokeWidth={3} strokeDasharray={isFalsePositive || isUncertain ? '6 3' : undefined} strokeOpacity={0.95} />
                        {isFalsePositive && (
                          <>
                            <circle cx={cc.x} cy={cc.y} r={10} fill={col} stroke="#fff" strokeWidth={2} />
                            <text x={cc.x} y={cc.y} fontSize={10} fill="#fff" textAnchor="middle" dominantBaseline="central" fontWeight={700}>!</text>
                          </>
                        )}
                        {(showVlmIds || showConfidence) && (
                          <text x={cc.x} y={cc.y + 16} fontSize={8} fill={col} textAnchor="middle" paintOrder="stroke" stroke="#fff" strokeWidth={3} fontWeight={600}>
                            {showVlmIds ? c.objectId : ''}{showVlmIds && showConfidence ? ' ' : ''}{showConfidence ? `${Math.round(c.confidence * 100)}%` : ''}
                          </text>
                        )}
                      </g>
                    );
                  })}

              {/* Rooms — boundaryWalls/openings are REFERENCES to RAW objects only. In topologyOnly mode the
                  reconstructed centroid polygon outline is suppressed; room is shown as labels + wall refs. Hidden in geometry-only mode. */}
              {!geometryOnlyMode && vlmVisibility.rooms &&
                vlmAnalysis.rooms.map((room, idx) => {
                  const wallIds = (room.boundaryWalls ?? room.boundaryObjects ?? []) as string[];
                  const openingIds = (room.openings ?? []) as string[];
                  const centroids = wallIds.map((id) => getCentroidForId(id, raw)).filter(Boolean) as { x: number; y: number }[];
                  if (centroids.length === 0) return null;
                  const color = roomColor(room.type);
                  const points = centroids.map((c) => `${c.x},${c.y}`).join(' ');
                  const labelPos = centroids.reduce((acc, c) => ({ x: acc.x + c.x, y: acc.y + c.y }), { x: 0, y: 0 });
                  labelPos.x /= centroids.length;
                  labelPos.y /= centroids.length;
                  return (
                    <g key={`room-${idx}`}>
                      {/* highlight actual wall polygons (references only) */}
                      {wallIds.map((id) => {
                        const poly = getPolygonForId(id, raw);
                        if (!poly) return null;
                        return <polygon key={`room-wall-${idx}-${id}`} points={polygonPoints(poly)} fill={color} fillOpacity={0.10} stroke={color} strokeWidth={2} strokeOpacity={0.7} />;
                      })}
                      {/* highlight openings */}
                      {openingIds.map((id) => {
                        const poly = getPolygonForId(id, raw);
                        if (!poly) return null;
                        return <polygon key={`room-op-${idx}-${id}`} points={polygonPoints(poly)} fill={color} fillOpacity={0.06} stroke={color} strokeWidth={1.5} strokeDasharray="4 3" strokeOpacity={0.6} />;
                      })}
                      {/* reconstructed room outline — hidden in topology-only mode */}
                      {!topologyOnly &&
                        (centroids.length >= 3 ? (
                          <polygon points={points} fill={color} fillOpacity={0.14} stroke={color} strokeWidth={2.5} strokeDasharray="8 4" strokeOpacity={0.85} />
                        ) : centroids.length === 2 ? (
                          <line x1={centroids[0].x} y1={centroids[0].y} x2={centroids[1].x} y2={centroids[1].y} stroke={color} strokeWidth={2.5} strokeDasharray="8 4" />
                        ) : (
                          <circle cx={centroids[0].x} cy={centroids[0].y} r={8} fill={color} fillOpacity={0.3} stroke={color} strokeWidth={2} />
                        ))}
                      {/* room label */}
                      <g>
                        <rect x={labelPos.x - 38} y={labelPos.y - 10} width={76} height={16} rx={3} fill="#fff" stroke={color} strokeWidth={1.2} opacity={0.92} />
                        <text x={labelPos.x} y={labelPos.y} fontSize={7.5} fill="#111" textAnchor="middle" dominantBaseline="central" fontWeight={600}>
                          {room.id} · {room.type}
                        </text>
                        {showConfidence && (
                          <text x={labelPos.x} y={labelPos.y + 13} fontSize={7} fill="#333" textAnchor="middle" paintOrder="stroke" stroke="#fff" strokeWidth={2}>
                            {Math.round(room.confidence * 100)}%
                          </text>
                        )}
                      </g>
                      {!topologyOnly &&
                        centroids.map((c, j) => (
                          <circle key={`room-dot-${idx}-${j}`} cx={c.x} cy={c.y} r={3} fill={color} stroke="#fff" strokeWidth={1} />
                        ))}
                    </g>
                  );
                })}

              {/* Wall relationships — highlight actual wall polygons + connector between centroids (hidden in geometry-only) */}
              {!geometryOnlyMode && vlmVisibility.wallRelationships &&
                vlmAnalysis.wallRelationships.map((rel, idx) => {
                  const cents = rel.wallIds.map((id) => getCentroidForId(id, raw)).filter(Boolean) as { x: number; y: number }[];
                  if (cents.length < 2) return null;
                  const col = VLM_COLORS[rel.relationship] ?? VLM_COLORS.uncertain;
                  const isUncertain = rel.relationship === 'uncertain';
                  return (
                    <g key={`wr-${idx}`}>
                      {rel.wallIds.map((id) => {
                        const poly = getPolygonForId(id, raw);
                        if (!poly) return null;
                        return <polygon key={`wr-poly-${idx}-${id}`} points={polygonPoints(poly)} fill={col} fillOpacity={isUncertain ? 0.08 : 0.14} stroke={col} strokeWidth={3} strokeOpacity={isUncertain ? 0.5 : 0.95} strokeDasharray={isUncertain ? '4 3' : undefined} />;
                      })}
                      {cents.slice(1).map((c, j) => {
                        const prev = cents[j];
                        const mid = midpoint(prev, c);
                        return (
                          <g key={`wr-seg-${idx}-${j}`}>
                            <line x1={prev.x} y1={prev.y} x2={c.x} y2={c.y} stroke={col} strokeWidth={3} strokeDasharray={rel.relationship === 'same_continuous_wall' ? '10 5' : '4 4'} strokeOpacity={0.9} />
                            <circle cx={prev.x} cy={prev.y} r={5} fill={col} stroke="#fff" strokeWidth={1.5} />
                            {j === cents.length - 2 && <circle cx={c.x} cy={c.y} r={5} fill={col} stroke="#fff" strokeWidth={1.5} />}
                            {(showVlmIds || showConfidence) && (
                              <text x={mid.x} y={mid.y - 6} fontSize={7} fill="#111" textAnchor="middle" paintOrder="stroke" stroke="#fff" strokeWidth={3} fontWeight={600}>
                                {showVlmIds ? rel.relationship.replace(/_/g, ' ') : ''}{showVlmIds && showConfidence ? ' · ' : ''}{showConfidence ? `${Math.round(rel.confidence * 100)}%` : ''}
                              </text>
                            )}
                          </g>
                        );
                      })}
                    </g>
                  );
                })}

              {/* Opening associations — highlight opening + host wall polygons + connector */}
              {vlmVisibility.openingAssociations &&
                !geometryOnlyMode &&
                vlmAnalysis.openings.map((op, idx) => {
                  const opPoly = getPolygonForId(op.objectId, raw);
                  const opCent = getCentroidForId(op.objectId, raw);
                  if (!opCent) return null;
                  const isUncertain = op.relationship === 'uncertain';
                  return (
                    <g key={`op-${idx}`}>
                      {opPoly && <polygon points={polygonPoints(opPoly)} fill={VLM_COLORS.opening} fillOpacity={0.14} stroke={VLM_COLORS.opening} strokeWidth={2.5} strokeOpacity={0.95} strokeDasharray={isUncertain ? '4 3' : undefined} />}
                      {op.hostWallIds.map((wid) => {
                        const wPoly = getPolygonForId(wid, raw);
                        if (!wPoly) return null;
                        return <polygon key={`op-host-${idx}-${wid}`} points={polygonPoints(wPoly)} fill={VLM_COLORS.opening} fillOpacity={0.07} stroke={VLM_COLORS.opening} strokeWidth={2} strokeOpacity={0.6} strokeDasharray="6 4" />;
                      })}
                      {op.hostWallIds.map((wid, j) => {
                        const wCent = getCentroidForId(wid, raw);
                        if (!wCent) return null;
                        const mid = midpoint(opCent, wCent);
                        return (
                          <g key={`op-seg-${idx}-${j}`}>
                            <line x1={opCent.x} y1={opCent.y} x2={wCent.x} y2={wCent.y} stroke={VLM_COLORS.opening} strokeWidth={2} strokeDasharray={isUncertain ? '4 3' : '6 3'} strokeOpacity={0.85} markerEnd="url(#vlm-arrow)" />
                            <circle cx={opCent.x} cy={opCent.y} r={4} fill={VLM_COLORS.opening} stroke="#fff" strokeWidth={1.5} />
                            {(showVlmIds || showConfidence) && j === 0 && (
                              <text x={mid.x} y={mid.y - 6} fontSize={7} fill={VLM_COLORS.opening} textAnchor="middle" paintOrder="stroke" stroke="#fff" strokeWidth={3} fontWeight={600}>
                                {showVlmIds ? `${op.objectId}→${wid}` : ''}{showVlmIds && showConfidence ? ' · ' : ''}{showConfidence ? `${Math.round(op.confidence * 100)}%` : ''}
                              </text>
                            )}
                          </g>
                        );
                      })}
                      {showVlmIds && op.hostWallIds.length > 1 && (
                        <text x={opCent.x} y={opCent.y + 14} fontSize={7} fill={VLM_COLORS.opening} textAnchor="middle" paintOrder="stroke" stroke="#fff" strokeWidth={3} fontWeight={600}>
                          {op.objectId} ({Math.round(op.confidence * 100)}%)
                        </text>
                      )}
                    </g>
                  );
                })}
              {/* Object classifications & rooms hidden in geometryOnly mode */}
              {geometryOnlyMode ? null : (
                <>
                  {/* placeholder — already rendered above, this branch just hides rooms/classifications */}
                </>
              )}
            </>
          )}
          {/* Geometry Constraints layer — VLM-proposed relationships drawn on top of RAW geometry.
              Every constraint is clickable (details panel lives in the page). No new geometry is created. */}
          {vlmAnalysis && (vlmAnalysis.geometryConstraints?.length ?? 0) > 0 && (showConstraints ?? true) && (
            <>
              {filterConstraintsByVisibility(
                vlmAnalysis.geometryConstraints ?? [],
                constraintsVisibility ?? defaultConstraintsVisibility,
              ).map((c) => {
                const key = constraintKey(c);
                const cents = c.objectIds.map((id) => getCentroidForId(id, raw)).filter(Boolean) as { x: number; y: number }[];
                const col = GEOMETRY_CONSTRAINT_COLORS[c.type] ?? '#757575';
                const lowConf = isLowConfidenceConstraint(c.confidence);
                const selected = selectedConstraintId === key;
                const cLabel = (() => {
                  const parts: string[] = [];
                  if (showVlmIds) parts.push(geometryConstraintLabel(c.type));
                  if (showConfidence) parts.push(`${Math.round(c.confidence * 100)}%`);
                  return parts.join(' · ');
                })();
                const dashFor = (polyIdx: number): string | undefined => {
                  if (c.type === 'remove_object') return '3 2';
                  if (c.type === 'opening_interrupts_wall') return polyIdx === 0 ? '4 3' : '6 4';
                  if (c.type === 'extend_wall') return polyIdx === 1 ? undefined : '10 6';
                  if (c.type === 'merge_walls') return '6 3';
                  if (c.type === 'same_axis') return '8 4';
                  if (c.type === 'parallel_walls' || c.type === 'perpendicular_walls') return '4 4';
                  if (c.type === 'continue_wall') return '10 5';
                  return '5 4';
                };
                const label = (pos: { x: number; y: number }, dy = -8): ReactNode =>
                  (showVlmIds || showConfidence) ? (
                    <text x={pos.x} y={pos.y + dy} fontSize={7} fill={col} textAnchor="middle" paintOrder="stroke" stroke="#fff" strokeWidth={3} fontWeight={700}>
                      {cLabel}
                    </text>
                  ) : null;
                return (
                  <g
                    key={`gc-${key}`}
                    style={{ cursor: 'pointer', pointerEvents: 'auto' }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectConstraint?.(selected ? null : key);
                    }}
                  >
                    {/* highlight referenced RAW polygons */}
                    {c.objectIds.map((id, i) => {
                      const poly = getPolygonForId(id, raw);
                      if (!poly) return null;
                      const polyCol = c.type === 'remove_object' ? '#c62828' : c.type === 'opening_interrupts_wall' && i === 0 ? '#e53935' : col;
                      return (
                        <polygon
                          key={`gc-poly-${key}-${i}`}
                          points={polygonPoints(poly)}
                          fill={polyCol}
                          fillOpacity={lowConf ? 0.10 : selected ? 0.30 : 0.18}
                          stroke={polyCol}
                          strokeWidth={selected ? 5 : lowConf ? 2.5 : 3.5}
                          strokeOpacity={lowConf ? 0.6 : 0.95}
                          strokeDasharray={dashFor(i)}
                        />
                      );
                    })}

                    {/* per-type connector visuals */}
                    {(() => {
                      if (c.type === 'remove_object') {
                        // cross out the RAW object (no new geometry — marker only)
                        return cents.map((cc, i) => {
                          const poly = getPolygonForId(c.objectIds[i], raw);
                          const b = poly ? polygonBounds(poly) : null;
                          const r = b ? Math.min(Math.max(b.maxX - b.minX, b.maxY - b.minY) * 0.22, 22) : 12;
                          return (
                            <g key={`gc-x-${key}-${i}`}>
                              <line x1={cc.x - r} y1={cc.y - r} x2={cc.x + r} y2={cc.y + r} stroke="#c62828" strokeWidth={4} strokeLinecap="round" />
                              <line x1={cc.x - r} y1={cc.y + r} x2={cc.x + r} y2={cc.y - r} stroke="#c62828" strokeWidth={4} strokeLinecap="round" />
                              <circle cx={cc.x} cy={cc.y} r={r + 6} fill="none" stroke="#c62828" strokeWidth={2} strokeDasharray="4 3" opacity={0.7} />
                              {label(cc, 0)}
                            </g>
                          );
                        });
                      }
                      if (cents.length < 2) return null;
                      const first = cents[0];
                      if (c.type === 'merge_walls') {
                        return cents.slice(1).map((cc, j) => {
                          const mid = midpoint(first, cc);
                          return (
                            <g key={`gc-merge-${key}-${j}`}>
                              <line x1={first.x} y1={first.y} x2={cc.x} y2={cc.y} stroke={col} strokeWidth={2.5} strokeDasharray="6 3" strokeOpacity={0.9} />
                              <circle cx={first.x} cy={first.y} r={5} fill={col} stroke="#fff" strokeWidth={1.5} />
                              <circle cx={cc.x} cy={cc.y} r={5} fill={col} stroke="#fff" strokeWidth={1.5} />
                              {j === 0 && label(mid)}
                            </g>
                          );
                        });
                      }
                      if (c.type === 'continue_wall') {
                        const tgt = cents[1];
                        const mid = midpoint(first, tgt);
                        return (
                          <g key={`gc-continue-${key}`}>
                            <line x1={first.x} y1={first.y} x2={tgt.x} y2={tgt.y} stroke={col} strokeWidth={3} strokeDasharray="10 5" strokeOpacity={0.9} markerEnd="url(#gc-arrow)" />
                            <circle cx={first.x} cy={first.y} r={5} fill={col} stroke="#fff" strokeWidth={1.5} />
                            <circle cx={tgt.x} cy={tgt.y} r={5} fill={col} stroke="#fff" strokeWidth={1.5} />
                            {label(mid)}
                          </g>
                        );
                      }
                      if (c.type === 'extend_wall') {
                        const tgt = cents[1];
                        const mid = midpoint(first, tgt);
                        const dx = tgt.x - first.x;
                        const dy = tgt.y - first.y;
                        const len = Math.hypot(dx, dy) || 1;
                        const ex = first.x - (dx / len) * 18;
                        const ey = first.y - (dy / len) * 18;
                        return (
                          <g key={`gc-extend-${key}`}>
                            {/* extension-direction indicator: source edge points toward target */}
                            <line x1={ex} y1={ey} x2={first.x} y2={first.y} stroke={col} strokeWidth={4} strokeOpacity={0.55} markerEnd="url(#gc-arrow)" />
                            <line x1={first.x} y1={first.y} x2={tgt.x} y2={tgt.y} stroke={col} strokeWidth={2.5} strokeDasharray="10 6" strokeOpacity={0.9} markerEnd="url(#gc-arrow)" />
                            <circle cx={first.x} cy={first.y} r={5} fill={col} stroke="#fff" strokeWidth={1.5} />
                            <circle cx={tgt.x} cy={tgt.y} r={6} fill={col} stroke="#fff" strokeWidth={2} />
                            {label(mid, -10)}
                          </g>
                        );
                      }
                      if (c.type === 'parallel_walls') {
                        const tgt = cents[1];
                        const mid = midpoint(first, tgt);
                        return (
                          <g key={`gc-parallel-${key}`}>
                            <line x1={first.x} y1={first.y} x2={tgt.x} y2={tgt.y} stroke={col} strokeWidth={2.5} strokeDasharray="4 4" strokeOpacity={0.9} />
                            <circle cx={first.x} cy={first.y} r={4} fill={col} stroke="#fff" strokeWidth={1.2} />
                            <circle cx={tgt.x} cy={tgt.y} r={4} fill={col} stroke="#fff" strokeWidth={1.2} />
                            {label(mid)}
                          </g>
                        );
                      }
                      if (c.type === 'perpendicular_walls') {
                        const tgt = cents[1];
                        const mid = midpoint(first, tgt);
                        return (
                          <g key={`gc-perp-${key}`}>
                            <line x1={first.x} y1={first.y} x2={tgt.x} y2={tgt.y} stroke={col} strokeWidth={2.5} strokeDasharray="4 4" strokeOpacity={0.9} />
                            <circle cx={first.x} cy={first.y} r={4} fill={col} stroke="#fff" strokeWidth={1.2} />
                            <circle cx={tgt.x} cy={tgt.y} r={4} fill={col} stroke="#fff" strokeWidth={1.2} />
                            {/* small right-angle marker near the relationship */}
                            <path d={`M ${mid.x - 9} ${mid.y} L ${mid.x - 9} ${mid.y + 9} L ${mid.x} ${mid.y + 9}`} fill="none" stroke={col} strokeWidth={2.5} />
                            {label(mid, -12)}
                          </g>
                        );
                      }
                      if (c.type === 'same_axis') {
                        const tgt = cents[1];
                        const mid = midpoint(first, tgt);
                        const dx = tgt.x - first.x;
                        const dy = tgt.y - first.y;
                        const len = Math.hypot(dx, dy) || 1;
                        const ex1 = first.x - (dx / len) * 24;
                        const ey1 = first.y - (dy / len) * 24;
                        const ex2 = tgt.x + (dx / len) * 24;
                        const ey2 = tgt.y + (dy / len) * 24;
                        return (
                          <g key={`gc-axis-${key}`}>
                            <line x1={ex1} y1={ey1} x2={ex2} y2={ey2} stroke={col} strokeWidth={3} strokeDasharray="8 4" strokeOpacity={0.9} />
                            <circle cx={first.x} cy={first.y} r={4} fill={col} stroke="#fff" strokeWidth={1.2} />
                            <circle cx={tgt.x} cy={tgt.y} r={4} fill={col} stroke="#fff" strokeWidth={1.2} />
                            {label(mid, -10)}
                          </g>
                        );
                      }
                      if (c.type === 'wall_corner' || c.type === 'wall_t_junction') {
                        const tgt = cents[1];
                        const mid = midpoint(first, tgt);
                        const marker =
                          c.type === 'wall_corner' ? (
                            <path d={`M ${mid.x - 10} ${mid.y + 6} L ${mid.x - 10} ${mid.y - 6} L ${mid.x + 6} ${mid.y - 6}`} fill="none" stroke={col} strokeWidth={3} strokeLinecap="round" />
                          ) : (
                            <path d={`M ${mid.x - 8} ${mid.y + 8} L ${mid.x - 8} ${mid.y - 8} L ${mid.x + 8} ${mid.y - 8}`} fill="none" stroke={col} strokeWidth={3} strokeLinecap="round" />
                          );
                        return (
                          <g key={`gc-junction-${key}`}>
                            <line x1={first.x} y1={first.y} x2={mid.x} y2={mid.y} stroke={col} strokeWidth={2} strokeDasharray="5 4" strokeOpacity={0.7} />
                            <line x1={tgt.x} y1={tgt.y} x2={mid.x} y2={mid.y} stroke={col} strokeWidth={2} strokeDasharray="5 4" strokeOpacity={0.7} />
                            <circle cx={mid.x} cy={mid.y} r={10} fill={col} fillOpacity={0.15} stroke={col} strokeWidth={2.5} strokeDasharray="4 3" />
                            {marker}
                            {label(mid, -16)}
                          </g>
                        );
                      }
                      if (c.type === 'opening_interrupts_wall') {
                        const opening = first;
                        const host = cents[1];
                        const mid = midpoint(opening, host);
                        return (
                          <g key={`gc-opening-${key}`}>
                            <line x1={opening.x} y1={opening.y} x2={host.x} y2={host.y} stroke={col} strokeWidth={2.5} strokeDasharray="6 3" strokeOpacity={0.9} markerEnd="url(#gc-arrow)" />
                            <circle cx={opening.x} cy={opening.y} r={5} fill={col} stroke="#fff" strokeWidth={1.5} />
                            <circle cx={host.x} cy={host.y} r={5} fill={col} stroke="#fff" strokeWidth={1.5} />
                            {label(mid)}
                          </g>
                        );
                      }
                      return null;
                    })()}

                    {/* invisible click target covering the whole constraint bbox (on top, transparent) */}
                    {(() => {
                      const polys = c.objectIds.map((id) => getPolygonForId(id, raw)).filter(Boolean) as number[][][];
                      if (polys.length === 0) return null;
                      let minX = Infinity;
                      let minY = Infinity;
                      let maxX = -Infinity;
                      let maxY = -Infinity;
                      for (const p of polys) {
                        const b = polygonBounds(p);
                        if (b.minX < minX) minX = b.minX;
                        if (b.minY < minY) minY = b.minY;
                        if (b.maxX > maxX) maxX = b.maxX;
                        if (b.maxY > maxY) maxY = b.maxY;
                      }
                      const pad = 8;
                      return (
                        <rect
                          x={minX - pad}
                          y={minY - pad}
                          width={maxX - minX + pad * 2}
                          height={maxY - minY + pad * 2}
                          fill="transparent"
                          style={{ pointerEvents: 'auto' }}
                        />
                      );
                    })()}
                  </g>
                );
              })}
            </>
          )}
          {/* Hide classifications/rooms/wallRelationships/openings in geometry-only mode: overlay already handles geometry pass */}
          {geometryOnlyMode && vlmAnalysis && (
            <g opacity={0} pointerEvents="none">
              {/* suppress duplicate rendering — geometry pass already rendered */}
            </g>
          )}

          {/* Clickable topology highlights — raw polygons only, no new geometry */}
          {highlights.length > 0 && (
            <g>
              {highlights.map((id) => {
                const poly = getPolygonForId(id, raw);
                if (!poly) return null;
                return (
                  <polygon
                    key={`hl-${id}`}
                    points={polygonPoints(poly)}
                    fill={VLM_COLORS.highlight}
                    fillOpacity={0.28}
                    stroke={VLM_COLORS.highlight}
                    strokeWidth={4}
                    strokeOpacity={0.95}
                  />
                );
              })}
            </g>
          )}
        </svg>
      </div>
    </div>
  );
}
