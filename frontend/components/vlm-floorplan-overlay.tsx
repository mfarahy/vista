'use client';

import { RAW_COLORS, type RawGeometry, type LayerVisibility } from './raw-floorplan-overlay';

// ---- VLM types (mirrors backend zod schema) ----

export type WallRelationship = {
  wallIds: string[];
  relationship: 'same_continuous_wall' | 'separate_walls' | 'corner' | 'T_junction' | 'uncertain';
  confidence: number;
  reason?: string;
};

export type OpeningAssociation = {
  objectId: string;
  type: 'door' | 'entry_door' | 'window';
  hostWallIds: string[];
  relationship: 'interrupts_wall' | 'adjacent' | 'uncertain';
  confidence: number;
};

export type WallConnection = {
  wallIds: [string, string];
  relationship: 'corner' | 'T_junction' | 'intersection' | 'collinear' | 'uncertain';
  confidence: number;
  reason?: string;
};

export type RoomHypothesis = {
  id: string;
  type: 'living' | 'kitchen' | 'hallway' | 'bathroom' | 'entrance' | 'utility' | 'bedroom' | 'terrace' | 'outside' | 'unknown';
  boundaryObjects: string[];
  confidence: number;
  reason?: string;
};

export type Artifact = {
  objectId: string;
  classification: 'likely_false_positive' | 'suspicious' | 'likely_missing_wall';
  confidence: number;
  reason?: string;
};

export type VlmAnalysis = {
  wallRelationships: WallRelationship[];
  openings: OpeningAssociation[];
  wallConnections: WallConnection[];
  rooms: RoomHypothesis[];
  artifacts: Artifact[];
};

export type VlmVisibility = {
  wallRelationships: boolean;
  openingAssociations: boolean;
  wallConnections: boolean;
  rooms: boolean;
  artifacts: boolean;
};

export const VLM_COLORS = {
  same_continuous_wall: '#43a047',
  separate_walls: '#e53935',
  corner: '#fb8c00',
  T_junction: '#1e88e5',
  uncertain: '#757575',
  intersection: '#8e24aa',
  collinear: '#2e7d32',
  opening: '#00acc1',
  room: '#7cb342',
  artifact: '#d81b60',
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
}) {
  if (!imageWidth || !imageHeight) return null;
  const viewBox = `0 0 ${imageWidth} ${imageHeight}`;

  return (
    <div className="relative w-full overflow-hidden rounded-xl border bg-white">
      <div className="relative w-full" style={{ aspectRatio: `${imageWidth}/${imageHeight}` }}>
        {showImage && imageUrl ? (
          <img src={imageUrl} alt="Floorplan source" className="absolute inset-0 h-full w-full object-contain" draggable={false} />
        ) : (
          <div className="absolute inset-0 bg-white" />
        )}
        <svg viewBox={viewBox} preserveAspectRatio="xMidYMid meet" className="absolute inset-0 h-full w-full" style={{ pointerEvents: 'none' }}>
          <defs>
            <marker id="vlm-arrow" viewBox="0 0 10 10" refX={8} refY={5} markerWidth={6} markerHeight={6} orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill={VLM_COLORS.opening} />
            </marker>
          </defs>

          {/* RAW polygons — hidden when hideRaw (VLM only mode) */}
          {!hideRaw && (
            <>
              {visibility.wall &&
                raw.wall.map((poly, i) => (
                  <polygon key={`wall-${i}`} points={polygonPoints(poly)} fill={RAW_COLORS.wall} fillOpacity={0.28} stroke={RAW_COLORS.wall} strokeWidth={2} strokeOpacity={0.9} />
                ))}
              {visibility.door &&
                raw.door.map((poly, i) => (
                  <polygon key={`door-${i}`} points={polygonPoints(poly)} fill={RAW_COLORS.door} fillOpacity={0.28} stroke={RAW_COLORS.door} strokeWidth={2} />
                ))}
              {visibility.entry_door &&
                raw.entry_door.map((poly, i) => (
                  <polygon key={`entry_door-${i}`} points={polygonPoints(poly)} fill={RAW_COLORS.entry_door} fillOpacity={0.32} stroke={RAW_COLORS.entry_door} strokeWidth={2} />
                ))}
              {visibility.window &&
                raw.window.map((poly, i) => (
                  <polygon key={`window-${i}`} points={polygonPoints(poly)} fill={RAW_COLORS.window} fillOpacity={0.28} stroke={RAW_COLORS.window} strokeWidth={2} />
                ))}
              {visibility.kitchen &&
                raw.kitchen.map((poly, i) => (
                  <polygon key={`kitchen-${i}`} points={polygonPoints(poly)} fill={RAW_COLORS.kitchen} fillOpacity={0.24} stroke={RAW_COLORS.kitchen} strokeWidth={2} strokeDasharray="6 4" />
                ))}
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
              {/* Artifacts — highlight polygons */}
              {vlmVisibility.artifacts &&
                vlmAnalysis.artifacts.map((a, idx) => {
                  const poly = getPolygonForId(a.objectId, raw);
                  if (!poly) return null;
                  const c = centroid(poly);
                  const isFalsePositive = a.classification === 'likely_false_positive';
                  return (
                    <g key={`artifact-${idx}`}>
                      <polygon points={polygonPoints(poly)} fill={VLM_COLORS.artifact} fillOpacity={0.18} stroke={VLM_COLORS.artifact} strokeWidth={3} strokeDasharray={isFalsePositive ? '6 3' : undefined} strokeOpacity={0.95} />
                      <circle cx={c.x} cy={c.y} r={10} fill={VLM_COLORS.artifact} stroke="#fff" strokeWidth={2} />
                      <text x={c.x} y={c.y} fontSize={10} fill="#fff" textAnchor="middle" dominantBaseline="central" fontWeight={700}>!</text>
                      {(showVlmIds || showConfidence) && (
                        <text x={c.x} y={c.y + 16} fontSize={8} fill={VLM_COLORS.artifact} textAnchor="middle" paintOrder="stroke" stroke="#fff" strokeWidth={3} fontWeight={600}>
                          {showVlmIds ? a.objectId : ''}{showVlmIds && showConfidence ? ' ' : ''}{showConfidence ? `${Math.round(a.confidence * 100)}%` : ''}
                        </text>
                      )}
                    </g>
                  );
                })}

              {/* Rooms — dashed boundary connecting centroids */}
              {vlmVisibility.rooms &&
                vlmAnalysis.rooms.map((room, idx) => {
                  const centroids = room.boundaryObjects.map((id) => getCentroidForId(id, raw)).filter(Boolean) as { x: number; y: number }[];
                  if (centroids.length === 0) return null;
                  const color = roomColor(room.type);
                  // For single or two points, draw lines; for >=3 draw closed polygon
                  const points = centroids.map((c) => `${c.x},${c.y}`).join(' ');
                  const labelPos = centroids.reduce((acc, c) => ({ x: acc.x + c.x, y: acc.y + c.y }), { x: 0, y: 0 });
                  labelPos.x /= centroids.length;
                  labelPos.y /= centroids.length;
                  return (
                    <g key={`room-${idx}`}>
                      {centroids.length >= 3 ? (
                        <polygon points={points} fill={color} fillOpacity={0.14} stroke={color} strokeWidth={2.5} strokeDasharray="8 4" strokeOpacity={0.85} />
                      ) : centroids.length === 2 ? (
                        <line x1={centroids[0].x} y1={centroids[0].y} x2={centroids[1].x} y2={centroids[1].y} stroke={color} strokeWidth={2.5} strokeDasharray="8 4" />
                      ) : (
                        <circle cx={centroids[0].x} cy={centroids[0].y} r={8} fill={color} fillOpacity={0.3} stroke={color} strokeWidth={2} />
                      )}
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
                      {/* dots at centroids */}
                      {centroids.map((c, j) => (
                        <circle key={`room-dot-${idx}-${j}`} cx={c.x} cy={c.y} r={3} fill={color} stroke="#fff" strokeWidth={1} />
                      ))}
                    </g>
                  );
                })}

              {/* Wall relationships — lines between wall centroids */}
              {vlmVisibility.wallRelationships &&
                vlmAnalysis.wallRelationships.map((rel, idx) => {
                  const cents = rel.wallIds.map((id) => getCentroidForId(id, raw)).filter(Boolean) as { x: number; y: number }[];
                  if (cents.length < 2) return null;
                  const col = VLM_COLORS[rel.relationship] ?? VLM_COLORS.uncertain;
                  return (
                    <g key={`wr-${idx}`}>
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

              {/* Wall connections — corner/T etc */}
              {vlmVisibility.wallConnections &&
                vlmAnalysis.wallConnections.map((conn, idx) => {
                  const a = getCentroidForId(conn.wallIds[0], raw);
                  const b = getCentroidForId(conn.wallIds[1], raw);
                  if (!a || !b) return null;
                  const col = VLM_COLORS[conn.relationship as keyof typeof VLM_COLORS] ?? VLM_COLORS.uncertain;
                  const mid = midpoint(a, b);
                  return (
                    <g key={`wc-${idx}`}>
                      <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={col} strokeWidth={2.5} strokeDasharray={conn.relationship === 'corner' ? undefined : '6 3'} strokeOpacity={0.9} />
                      <circle cx={a.x} cy={a.y} r={4} fill={col} stroke="#fff" strokeWidth={1.2} />
                      <circle cx={b.x} cy={b.y} r={4} fill={col} stroke="#fff" strokeWidth={1.2} />
                      <circle cx={mid.x} cy={mid.y} r={6} fill={col} stroke="#fff" strokeWidth={1.5} />
                      {(showVlmIds || showConfidence) && (
                        <text x={mid.x} y={mid.y - 10} fontSize={7} fill="#111" textAnchor="middle" paintOrder="stroke" stroke="#fff" strokeWidth={3} fontWeight={600}>
                          {showVlmIds ? conn.relationship : ''}{showVlmIds && showConfidence ? ' · ' : ''}{showConfidence ? `${Math.round(conn.confidence * 100)}%` : ''}
                        </text>
                      )}
                    </g>
                  );
                })}

              {/* Opening associations — connector from opening to host walls */}
              {vlmVisibility.openingAssociations &&
                vlmAnalysis.openings.map((op, idx) => {
                  const opCent = getCentroidForId(op.objectId, raw);
                  if (!opCent) return null;
                  return (
                    <g key={`op-${idx}`}>
                      {op.hostWallIds.map((wid, j) => {
                        const wCent = getCentroidForId(wid, raw);
                        if (!wCent) return null;
                        const mid = midpoint(opCent, wCent);
                        return (
                          <g key={`op-seg-${idx}-${j}`}>
                            <line x1={opCent.x} y1={opCent.y} x2={wCent.x} y2={wCent.y} stroke={VLM_COLORS.opening} strokeWidth={2} strokeDasharray="6 3" strokeOpacity={0.85} markerEnd="url(#vlm-arrow)" />
                            <circle cx={opCent.x} cy={opCent.y} r={4} fill={VLM_COLORS.opening} stroke="#fff" strokeWidth={1.5} />
                            {(showVlmIds || showConfidence) && j === 0 && (
                              <text x={mid.x} y={mid.y - 6} fontSize={7} fill={VLM_COLORS.opening} textAnchor="middle" paintOrder="stroke" stroke="#fff" strokeWidth={3} fontWeight={600}>
                                {showVlmIds ? `${op.objectId}→${wid}` : ''}{showVlmIds && showConfidence ? ' · ' : ''}{showConfidence ? `${Math.round(op.confidence * 100)}%` : ''}
                              </text>
                            )}
                          </g>
                        );
                      })}
                      {/* opening label */}
                      {showVlmIds && op.hostWallIds.length > 1 && (
                        <text x={opCent.x} y={opCent.y + 14} fontSize={7} fill={VLM_COLORS.opening} textAnchor="middle" paintOrder="stroke" stroke="#fff" strokeWidth={3} fontWeight={600}>
                          {op.objectId} ({Math.round(op.confidence * 100)}% {showConfidence ? '' : ''})
                        </text>
                      )}
                    </g>
                  );
                })}
            </>
          )}
        </svg>
      </div>
    </div>
  );
}
