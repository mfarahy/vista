'use client';

import { RAW_COLORS, type RawGeometry, type LayerVisibility } from './raw-floorplan-overlay';

// ---- VLM types (mirrors backend zod schema) ----

export type GeometryHintType = 'same_continuous_wall' | 'parallel_walls' | 'same_axis' | 'extend_to_intersection' | 'merge_walls';

export type GeometryHint = {
  type: GeometryHintType;
  objectIds: string[];
  confidence: number;
  reason: string | null;
};

export type GeometryHintsVisibility = {
  sameContinuousWall: boolean;
  parallelWalls: boolean;
  sameAxis: boolean;
  extendToIntersection: boolean;
  mergeWalls: boolean;
};

export const GEOMETRY_HINT_TYPES: GeometryHintType[] = ['same_continuous_wall', 'parallel_walls', 'same_axis', 'extend_to_intersection', 'merge_walls'];

export function geometryHintLabel(t: GeometryHintType): string {
  switch (t) {
    case 'same_continuous_wall': return 'Same continuous wall';
    case 'parallel_walls': return 'Parallel walls';
    case 'same_axis': return 'Same axis';
    case 'extend_to_intersection': return 'Extend to intersection';
    case 'merge_walls': return 'Merge walls';
  }
}

export const GEOMETRY_HINT_COLORS: Record<GeometryHintType, string> = {
  same_continuous_wall: '#2e7d32',
  parallel_walls: '#1565c0',
  same_axis: '#00695c',
  extend_to_intersection: '#ef6c00',
  merge_walls: '#6a1b9a',
};

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
  geometryHints?: GeometryHint[];
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
  geometryVisibility,
  showGeometryHints,
  geometryOnlyMode,
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
  geometryVisibility?: GeometryHintsVisibility;
  showGeometryHints?: boolean;
  geometryOnlyMode?: boolean;
}) {
  if (!imageWidth || !imageHeight) return null;
  const viewBox = `0 0 ${imageWidth} ${imageHeight}`;
  const highlights = highlightedIds ?? [];
  const isInteractive = Boolean(onSelectObject);
  const geometryReferencedIds = geometryOnlyMode && vlmAnalysis?.geometryHints
    ? new Set((vlmAnalysis.geometryHints ?? []).flatMap((h) => h.objectIds))
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
          {vlmAnalysis && (vlmAnalysis.geometryHints?.length ?? 0) > 0 && (showGeometryHints ?? true) && (
            <>
              {(vlmAnalysis.geometryHints ?? [])
                .filter((h) => {
                  const gv = geometryVisibility;
                  if (!gv) return true;
                  switch (h.type) {
                    case 'same_continuous_wall': return gv.sameContinuousWall;
                    case 'parallel_walls': return gv.parallelWalls;
                    case 'same_axis': return gv.sameAxis;
                    case 'extend_to_intersection': return gv.extendToIntersection;
                    case 'merge_walls': return gv.mergeWalls;
                    default: return true;
                  }
                })
                .map((hint, idx) => {
                  const cents = hint.objectIds.map((id) => getCentroidForId(id, raw)).filter(Boolean) as { x: number; y: number }[];
                  if (cents.length < 2) return null;
                  const col = GEOMETRY_HINT_COLORS[hint.type] ?? '#757575';
                  const lowConf = hint.confidence < 0.75;
                  return (
                    <g key={`gh-${idx}`}>
                      {hint.objectIds.map((id) => {
                        const poly = getPolygonForId(id, raw);
                        if (!poly) return null;
                        return <polygon key={`gh-poly-${idx}-${id}`} points={polygonPoints(poly)} fill={col} fillOpacity={lowConf ? 0.10 : 0.18} stroke={col} strokeWidth={lowConf ? 2.5 : 3.5} strokeOpacity={lowConf ? 0.6 : 0.95} strokeDasharray={hint.type === 'extend_to_intersection' ? '10 6' : hint.type === 'merge_walls' ? '6 3' : hint.type === 'same_axis' ? '8 4' : hint.type === 'parallel_walls' ? '4 4' : '10 5'} />;
                      })}
                      {(() => {
                        if (hint.type === 'merge_walls') {
                          // for merge: connect all to first centroid
                          const first = cents[0];
                          return cents.slice(1).map((c, j) => {
                            const mid = midpoint(first, c);
                            return (
                              <g key={`gh-merge-${idx}-${j}`}>
                                <line x1={first.x} y1={first.y} x2={c.x} y2={c.y} stroke={col} strokeWidth={2.5} strokeDasharray="6 3" strokeOpacity={0.85} />
                                {(showVlmIds || showConfidence) && j === 0 && (
                                  <text x={mid.x} y={mid.y - 6} fontSize={7} fill={col} textAnchor="middle" paintOrder="stroke" stroke="#fff" strokeWidth={3} fontWeight={600}>
                                    {showVlmIds ? geometryHintLabel(hint.type) : ''}{showVlmIds && showConfidence ? ' · ' : ''}{showConfidence ? `${Math.round(hint.confidence * 100)}%` : ''}
                                  </text>
                                )}
                              </g>
                            );
                          });
                        }
                        if (hint.type === 'extend_to_intersection' && cents.length >= 2) {
                          const src = cents[0];
                          const tgt = cents[1];
                          const mid = midpoint(src, tgt);
                          return (
                            <g key={`gh-ext-${idx}`}>
                              <line x1={src.x} y1={src.y} x2={tgt.x} y2={tgt.y} stroke={col} strokeWidth={2.5} strokeDasharray="10 6" strokeOpacity={0.9} markerEnd="url(#vlm-arrow)" />
                              <circle cx={src.x} cy={src.y} r={5} fill={col} stroke="#fff" strokeWidth={1.5} />
                              <circle cx={tgt.x} cy={tgt.y} r={5} fill={col} stroke="#fff" strokeWidth={1.5} />
                              {lowConf && <circle cx={mid.x} cy={mid.y} r={8} fill="none" stroke={col} strokeWidth={1} strokeDasharray="3 3" opacity={0.5} />}
                              {(showVlmIds || showConfidence) && (
                                <text x={mid.x} y={mid.y - 8} fontSize={7} fill={col} textAnchor="middle" paintOrder="stroke" stroke="#fff" strokeWidth={3} fontWeight={600}>
                                  {showVlmIds ? `${hint.objectIds[0]} → ${hint.objectIds[1]}` : ''}{showVlmIds && showConfidence ? ' · ' : ''}{showConfidence ? `${Math.round(hint.confidence * 100)}%` : ''}
                                </text>
                              )}
                            </g>
                          );
                        }
                        // default: chain centroids sequentially
                        return cents.slice(1).map((c, j) => {
                          const prev = cents[j];
                          const mid = midpoint(prev, c);
                          // same_axis: draw axis line extended slightly
                          const isAxis = hint.type === 'same_axis';
                          return (
                            <g key={`gh-seg-${idx}-${j}`}>
                              <line x1={prev.x} y1={prev.y} x2={c.x} y2={c.y} stroke={col} strokeWidth={isAxis ? 3 : 2.5} strokeDasharray={isAxis ? '8 4' : hint.type === 'parallel_walls' ? '4 4' : '10 5'} strokeOpacity={0.9} />
                              {isAxis && (
                                <>
                                  <line x1={prev.x} y1={prev.y} x2={prev.x + (c.x - prev.x) * 0.15} y2={prev.y + (c.y - prev.y) * 0.15} stroke={col} strokeWidth={5} strokeOpacity={0.25} />
                                  <line x1={c.x} y1={c.y} x2={c.x + (prev.x - c.x) * 0.15} y2={c.y + (prev.y - c.y) * 0.15} stroke={col} strokeWidth={5} strokeOpacity={0.25} />
                                </>
                              )}
                              <circle cx={prev.x} cy={prev.y} r={4} fill={col} stroke="#fff" strokeWidth={1.2} />
                              {j === cents.length - 2 && <circle cx={c.x} cy={c.y} r={4} fill={col} stroke="#fff" strokeWidth={1.2} />}
                              {(showVlmIds || showConfidence) && j === 0 && (
                                <text x={mid.x} y={mid.y - 6} fontSize={7} fill={col} textAnchor="middle" paintOrder="stroke" stroke="#fff" strokeWidth={3} fontWeight={600}>
                                  {showVlmIds ? geometryHintLabel(hint.type) : ''}{showVlmIds && showConfidence ? ' · ' : ''}{showConfidence ? `${Math.round(hint.confidence * 100)}%` : ''}
                                </text>
                              )}
                            </g>
                          );
                        });
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
