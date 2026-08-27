'use client';

import { type PointerEvent as ReactPointerEvent, useCallback } from 'react';
import type {
  Point2D,
  Room,
  Stair,
  VistaGeometry,
  Wall,
} from '@/lib/geometry/models/geometry';
import type { GeometryDebug } from '@/lib/geometry/geometry-debug';
import type {
  FusedExtraction,
  RoomCandidate,
  SemanticDocument,
  SemanticSpace,
} from '@/lib/geometry/ai/types';
import {
  type GeometryDebugLayers,
  type InspectedEntity,
  type InspectedRow,
  ROOM_CANDIDATE_TONE,
} from './geometry-debug';
import { openingCandidateTone } from './geometry-debug';
import { DoorMark, WindowMark } from './GeometryOverlay';

/**
 * Developer debug overlay for the AI geometry pipeline.
 *
 * Renders the original image layers on the same SVG coordinate space as the
 * base output — raw AI geometry, normalized geometry, fused geometry (Phase 6:
 * room names/types, semantic opening matches, stairs), the validated VLM
 * semantic reading itself (space anchors, unresolved rooms, furniture), and
 * the candidate layers can be toggled independently and overlap. Clicking an
 * entity produces a fully described `InspectedEntity` the side inspector
 * renders. This is a debugging tool, not an editor.
 */

const RAW_WALL_COLOR = 'var(--rose-500)';
const RAW_ROOM_STROKE = 'var(--sky-500)';
const RAW_ROOM_FILL = 'color-mix(in oklab, var(--sky-500) 10%, transparent)';
const NORMALIZED_ROOM_FILL = 'color-mix(in oklab, var(--primary) 12%, transparent)';
const NORMALIZED_ROOM_STROKE = 'var(--primary)';
const FUSED_ROOM_FILL = 'color-mix(in oklab, var(--emerald-600) 14%, transparent)';
const FUSED_ROOM_STROKE = 'var(--emerald-600)';
const FUSED_WALL_COLOR = 'var(--emerald-700)';
const SEMANTIC_MARK = 'var(--violet-600)';
const UNRESOLVED_MARK = 'var(--destructive)';
const FURNITURE_MARK = 'var(--muted-foreground)';
const STAIR_COLOR = 'var(--fuchsia-600)';

type OpeningCandidateLike = {
  id: string;
  status: 'valid' | 'uncertain' | 'invalid';
  nearest_wall_id: string | null;
  distance_to_wall_px: number | null;
  extent_along_px: number | null;
  extent_perp_px: number | null;
  confidence: number;
  reasons?: string[];
};

function row(labelKey: string, value?: string, valueKey?: string): InspectedRow {
  return { labelKey, value, valueKey };
}

function roomArea(polygon: Point2D[]): number {
  let area = 0;
  for (let i = 0; i < polygon.length; i += 1) {
    const { x, y } = polygon[i];
    const { x: x2, y: y2 } = polygon[(i + 1) % polygon.length];
    area += x * y2 - x2 * y;
  }
  return Math.abs(area) / 2;
}

function polygonCentroid(polygon: Point2D[]): Point2D {
  let x = 0;
  let y = 0;
  for (const p of polygon) {
    x += p.x;
    y += p.y;
  }
  return { x: x / polygon.length, y: y / polygon.length };
}

function planBounds(geometry: VistaGeometry): { x: number; y: number; w: number; h: number } {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const wall of geometry.walls) {
    xs.push(wall.start.x, wall.end.x);
    ys.push(wall.start.y, wall.end.y);
  }
  for (const room of geometry.rooms) {
    for (const p of room.polygon) {
      xs.push(p.x);
      ys.push(p.y);
    }
  }
  if (xs.length === 0) return { x: 0, y: 0, w: geometry.source.width, h: geometry.source.height };
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return { x: minX, y: minY, w: Math.max(...xs) - minX, h: Math.max(...ys) - minY };
}

/** Compass-word → plan-fraction anchor for the semantic layer marks. */
function semanticAnchor(
  text: string | null | undefined,
  bounds: { x: number; y: number; w: number; h: number },
): Point2D | null {
  if (!text) return null;
  const low = text.toLowerCase();
  let x = 0.5;
  let y = 0.5;
  if (/\b(left|west)\b/.test(low)) x = 0.25;
  if (/\b(right|east)\b/.test(low)) x = 0.75;
  if (/\b(top|upper|north)\b/.test(low)) y = 0.25;
  if (/\b(bottom|lower|south)\b/.test(low)) y = 0.75;
  if (/\b(centre|center|middle|central)\b/.test(low) && /\b(left|right)\b/.test(low)) {
    x = /\bright\b/.test(low) ? 0.65 : 0.35;
  }
  return { x: bounds.x + x * bounds.w, y: bounds.y + y * bounds.h };
}

export function GeometryDebugOverlay({
  geometry,
  raw,
  fused,
  debug,
  layers,
  selectedKey,
  onSelect,
}: {
  geometry: VistaGeometry;
  raw: VistaGeometry | null;
  fused: VistaGeometry | null;
  debug: GeometryDebug | null;
  layers: GeometryDebugLayers;
  selectedKey: string | null;
  onSelect: (entity: InspectedEntity | null) => void;
}) {
  const { width, height } = geometry.source;

  const rawById = useCallback(
    (walls: Wall[] | undefined, id: string) => walls?.find((w) => w.id === id),
    [],
  );
  const normWallsById = useCallback(
    (id: string) => geometry.walls.find((w) => w.id === id),
    [geometry.walls],
  );
  const fusedWallsById = useCallback(
    (id: string) => fused?.walls.find((w) => w.id === id),
    [fused?.walls],
  );

  const candidates = debug?.candidates ?? null;
  const doorCandidates = candidates?.openings.door ?? [];
  const windowCandidates = candidates?.openings.window ?? [];
  const fusedDoc: FusedExtraction | null = debug?.fused ?? null;
  const semantic: SemanticDocument | null = debug?.semantic ?? null;

  // Emitted normalized openings map back to their (valid) candidate so the
  // inspector can show wall distance / status without the model structures.
  const validDoorCandidates = doorCandidates.filter((c) => c.status === 'valid');
  const validWindowCandidates = windowCandidates.filter((c) => c.status === 'valid');
  const acceptedRoomCandidates = (candidates?.rooms ?? []).filter((r) => r.status === 'accepted');

  function emit<El extends Element>(
    handler: (e: ReactPointerEvent<El>) => void,
  ): (e: ReactPointerEvent<El>) => void {
    return (e) => {
      e.stopPropagation();
      handler(e);
    };
  }

  function openKey(prefix: string, id: string) {
    return `${prefix}:${id}`;
  }

  function select(entity: InspectedEntity) {
    onSelect(entity);
  }

  function openingDescriptor(opening: {
    id: string;
    kind: 'door' | 'window';
    confidence?: number;
    position?: number;
    width?: number;
    wallId?: string;
    corrected?: boolean;
  }): InspectedEntity {
    const key = openKey(opening.kind, opening.id);
    return {
      key,
      typeKey: opening.kind === 'door' ? 'geometry.entity.door' : 'geometry.entity.window',
      id: opening.id,
      sourceKey: 'geometry.debug.source.normalized',
      confidence: opening.confidence,
      rows: [
        row('geometry.inspector.nearestWall', opening.wallId),
        row('geometry.inspector.width', opening.width != null ? `${Math.round(opening.width)}px` : undefined),
        row('geometry.inspector.position', opening.position != null ? opening.position.toFixed(3) : undefined),
        row('geometry.inspector.corrected', undefined, opening.corrected ? 'common.yes' : 'common.no'),
      ],
      status: { statusKey: 'geometry.debug.status.valid', tone: 'valid' },
    };
  }

  function openingCandidateDescriptor(c: OpeningCandidateLike, kind: 'door' | 'window'): InspectedEntity {
    const rows: InspectedRow[] = [
      row('geometry.inspector.nearestWall', c.nearest_wall_id ?? undefined),
      row(
        'geometry.inspector.distanceToWall',
        c.distance_to_wall_px != null ? `${Math.round(c.distance_to_wall_px * 10) / 10}px` : undefined,
      ),
      row('geometry.inspector.width', c.extent_along_px != null ? `${Math.round(c.extent_along_px)}px` : undefined),
      row('geometry.inspector.perpendicular', c.extent_perp_px != null ? `${Math.round(c.extent_perp_px)}px` : undefined),
    ];
    if (c.reasons && c.reasons.length > 0 && c.status !== 'valid') {
      rows.push(row('geometry.inspector.reason', c.reasons.join(', ')));
    }
    return {
      key: `candidate:${c.id}`,
      typeKey: kind === 'door' ? 'geometry.entity.door' : 'geometry.entity.window',
      id: c.id,
      sourceKey: 'geometry.debug.source.candidate',
      confidence: c.confidence,
      rows,
      status: { statusKey: `geometry.debug.status.${c.status}`, tone: c.status },
    };
  }

  function roomDescriptor(room: Room, source: 'raw' | 'normalized' | 'candidate'): InspectedEntity {
    const rows: InspectedRow[] = [row('geometry.inspector.area', `${Math.round(roomArea(room.polygon))} px²`)];
    if (source === 'normalized') {
      rows.push(row('geometry.inspector.derived', undefined, 'common.yes'));
    }
    const candidate = source === 'normalized' ? acceptedRoomCandidates[roomIndex(room.id)] : undefined;
    if (candidate) {
      rows.push(row('geometry.inspector.minDimension', `${Math.round(candidate.min_dim_px)}px`));
    }
    return {
      key: `${source}:${room.id}`,
      typeKey: 'geometry.entity.room',
      id: room.id,
      sourceKey:
        source === 'raw'
          ? 'geometry.debug.source.ai'
          : source === 'candidate'
            ? 'geometry.debug.source.candidate'
            : 'geometry.debug.source.derived',
      confidence: room.confidence,
      rows,
      status:
        source === 'normalized'
          ? { statusKey: 'geometry.debug.status.accepted', tone: 'valid' }
          : null,
    };
  }

  function roomIndex(roomId: string): number {
    const m = /room-(\d+)/.exec(roomId);
    return m ? Number(m[1]) : -1;
  }

  function roomCandidateDescriptor(c: RoomCandidate): InspectedEntity {
    return {
      key: `roomcand:${c.id}`,
      typeKey: 'geometry.entity.room',
      id: c.id,
      sourceKey: 'geometry.debug.source.candidate',
      confidence: c.confidence ?? undefined,
      rows: [
        row('geometry.inspector.area', `${Math.round(c.area_px)} px²`),
        row('geometry.inspector.minDimension', `${Math.round(c.min_dim_px)}px`),
        row('geometry.inspector.wallCount', `${c.wall_ids.length}`),
      ],
      status:
        c.status === 'accepted'
          ? { statusKey: 'geometry.debug.status.accepted', tone: 'valid' }
          : { statusKey: 'geometry.debug.status.rejected', tone: 'invalid' },
    };
  }

  function wallDescriptor(wall: Wall, source: 'raw' | 'normalized'): InspectedEntity {
    return {
      key: `${source}:${wall.id}`,
      typeKey: 'geometry.entity.wall',
      id: wall.id,
      sourceKey: source === 'raw' ? 'geometry.debug.source.ai' : 'geometry.debug.source.normalized',
      confidence: wall.confidence,
      rows: [
        row('geometry.inspector.thickness', `${Math.round(wall.thickness)}px`),
        row('geometry.inspector.wallType', undefined, `geometry.debug.wallType.${wall.type}`),
      ],
      status: null,
    };
  }

  function fusedRoomDescriptor(room: Room): InspectedEntity {
    const fusedRecord = fusedDoc?.rooms.find((r) => r.id === room.id);
    const rows: InspectedRow[] = [
      row('geometry.inspector.area', `${Math.round(roomArea(room.polygon))} px²`),
    ];
    if (room.name) rows.push(row('geometry.debug.fusion.rows.name', room.name));
    if (room.type) rows.push(row('geometry.debug.fusion.rows.type', room.type));
    if (fusedRecord?.relative_location) {
      rows.push(row('geometry.debug.fusion.rows.location', fusedRecord.relative_location));
    }
    if (fusedRecord?.match_reason) {
      rows.push(row('geometry.debug.fusion.rows.matchReason', fusedRecord.match_reason));
    }
    return {
      key: `fused:${room.id}`,
      typeKey: 'geometry.entity.room',
      id: room.id,
      sourceKey: 'geometry.debug.source.fused',
      confidence: room.confidence,
      rows,
      status: room.name
        ? { statusKey: 'geometry.debug.status.fused', tone: 'valid' }
        : null,
    };
  }

  function fusedOpeningDescriptor(
    opening: { id: string; kind: 'door' | 'window'; wallId: string; position: number; width: number; confidence?: number },
    matched: { connects?: string | null; space?: string | null; type?: string | null; matchReason?: string } | null,
  ): InspectedEntity {
    const rows: InspectedRow[] = [
      row('geometry.inspector.nearestWall', opening.wallId),
      row('geometry.inspector.width', `${Math.round(opening.width)}px`),
      row('geometry.inspector.position', opening.position.toFixed(3)),
    ];
    if (matched) {
      if (matched.connects) rows.push(row('geometry.debug.fusion.rows.connects', matched.connects));
      if (matched.space) rows.push(row('geometry.debug.fusion.rows.space', matched.space));
      if (matched.type) rows.push(row('geometry.debug.fusion.rows.type', matched.type));
      if (matched.matchReason) rows.push(row('geometry.debug.fusion.rows.matchReason', matched.matchReason));
    }
    return {
      key: `fused${opening.kind}:${opening.id}`,
      typeKey: opening.kind === 'door' ? 'geometry.entity.door' : 'geometry.entity.window',
      id: opening.id,
      sourceKey: matched ? 'geometry.debug.source.fused' : 'geometry.debug.source.normalized',
      confidence: opening.confidence,
      rows,
      status: matched
        ? { statusKey: 'geometry.debug.status.fused', tone: 'valid' }
        : { statusKey: 'geometry.debug.status.geometricOnly', tone: 'valid' },
    };
  }

  function stairDescriptor(stair: Stair, fusedStair: FusedExtraction['stairs'][number] | undefined): InspectedEntity {
    const rows: InspectedRow[] = [];
    if (stair.direction) rows.push(row('geometry.debug.fusion.rows.direction', stair.direction));
    if (stair.regionId) rows.push(row('geometry.debug.fusion.rows.region', `${stair.regionId}${fusedStair?.region_label ? ` (${fusedStair.region_label})` : ''}`));
    if (fusedStair?.relative_location) rows.push(row('geometry.debug.fusion.rows.location', fusedStair.relative_location));
    rows.push(row('geometry.inspector.position', `${Math.round(stair.position.x)}, ${Math.round(stair.position.y)}`));
    return {
      key: `stair:${stair.id}`,
      typeKey: 'geometry.entity.stair',
      id: stair.id,
      sourceKey: 'geometry.debug.source.semantic',
      rows,
      status: { statusKey: 'geometry.debug.status.semantic', tone: 'valid' },
    };
  }

  function semanticSpaceDescriptor(space: SemanticSpace, index: number, unresolved: boolean): InspectedEntity {
    return {
      key: unresolved ? `unresolved:${index}` : `semantic:${index}`,
      typeKey: 'geometry.entity.room',
      id: space.label ?? `space-${index}`,
      sourceKey: unresolved
        ? 'geometry.debug.source.semanticUnresolved'
        : 'geometry.debug.source.semantic',
      rows: [
        row('geometry.debug.fusion.rows.type', space.type),
        row('geometry.debug.fusion.rows.location', space.relative_location ?? '—'),
      ],
      status: unresolved
        ? { statusKey: 'geometry.debug.status.unresolved', tone: 'invalid' }
        : { statusKey: 'geometry.debug.status.semantic', tone: 'valid' },
    };
  }

  function handleBackgroundClick(e: ReactPointerEvent<SVGSVGElement>) {
    if (e.target === e.currentTarget) {
      onSelect(null);
    }
  }

  const bounds = planBounds(geometry);
  const semanticMarks = (semantic?.spaces ?? []).map((space, i) => ({
    space,
    index: i,
    anchor: semanticAnchor(space.relative_location, bounds),
  }));

  const svg = (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="pointer-events-auto absolute inset-0 h-full w-full overflow-visible"
      aria-label="geometry-debug-overlay"
      onClick={handleBackgroundClick}
    >
      {/* Background click target clears the selection. */}
      <rect x={0} y={0} width={width} height={height} fill="transparent" />

      {layers.raw && raw && (
        <g data-debug-layer="raw">
          {raw.rooms.map((room) => (
            <polygon
              key={room.id}
              points={room.polygon.map(({ x, y }) => `${x},${y}`).join(' ')}
              fill={RAW_ROOM_FILL}
              stroke={RAW_ROOM_STROKE}
              strokeWidth={1}
              strokeDasharray="4 4"
              strokeLinejoin="round"
              onClick={emit(() => select(roomDescriptor(room, 'raw')))}
              aria-label={room.id}
            />
          ))}
          {raw.walls.map((wall) => (
            <line
              key={wall.id}
              x1={wall.start.x}
              y1={wall.start.y}
              x2={wall.end.x}
              y2={wall.end.y}
              stroke={RAW_WALL_COLOR}
              strokeWidth={Math.max(1.5, wall.thickness * 0.6)}
              opacity={0.8}
              onClick={emit(() => select(wallDescriptor(wall, 'raw')))}
              aria-label={wall.id}
            />
          ))}
          {raw.windows.map((window, i) => {
            const host = rawById(raw.walls, window.wallId);
            if (!host) return null;
            const cand = windowCandidates[i];
            return (
              <g key={window.id}>
                <WindowMark window={window} wall={host} />
                {cand && (
                  <polygon
                    points={cand.polygon.map(([x, y]) => `${x},${y}`).join(' ')}
                    fill="transparent"
                    stroke="transparent"
                    onClick={emit(() => select(openingCandidateDescriptor(cand, 'window')))}
                  />
                )}
              </g>
            );
          })}
          {raw.doors.map((door, i) => {
            const host = rawById(raw.walls, door.wallId);
            if (!host) return null;
            const cand = doorCandidates[i];
            return (
              <g key={door.id}>
                <DoorMark door={door} wall={host} />
                {cand && (
                  <polygon
                    points={cand.polygon.map(([x, y]) => `${x},${y}`).join(' ')}
                    fill="transparent"
                    stroke="transparent"
                    onClick={emit(() => select(openingCandidateDescriptor(cand, 'door')))}
                  />
                )}
              </g>
            );
          })}
        </g>
      )}

      {layers.fused && fused && (
        <g data-debug-layer="fused">
          {fused.rooms.map((room) => (
            <g key={room.id}>
              <polygon
                points={room.polygon.map(({ x, y }) => `${x},${y}`).join(' ')}
                fill={FUSED_ROOM_FILL}
                stroke={FUSED_ROOM_STROKE}
                strokeWidth={selectedKey === `fused:${room.id}` ? 3 : Math.max(1, width * 0.001)}
                strokeDasharray={room.name ? undefined : '5 4'}
                strokeLinejoin="round"
                onClick={emit(() => select(fusedRoomDescriptor(room)))}
                aria-label={room.id}
              />
              {room.name && (
                <text
                  x={polygonCentroid(room.polygon).x}
                  y={polygonCentroid(room.polygon).y - 6}
                  textAnchor="middle"
                  fontSize={Math.max(11, width * 0.012)}
                  fontWeight={600}
                  fill={FUSED_ROOM_STROKE}
                  pointerEvents="none"
                >
                  {room.name}
                </text>
              )}
              {room.type && (
                <text
                  x={polygonCentroid(room.polygon).x}
                  y={polygonCentroid(room.polygon).y + 12}
                  textAnchor="middle"
                  fontSize={Math.max(9, width * 0.009)}
                  fill="var(--muted-foreground)"
                  pointerEvents="none"
                >
                  {room.type}
                </text>
              )}
            </g>
          ))}
          {fused.walls.map((wall) => (
            <line
              key={wall.id}
              x1={wall.start.x}
              y1={wall.start.y}
              x2={wall.end.x}
              y2={wall.end.y}
              stroke={FUSED_WALL_COLOR}
              strokeWidth={Math.max(1.5, wall.thickness * 0.4)}
              opacity={0.55}
              pointerEvents="none"
            />
          ))}
          {fused.doors.map((door, i) => {
            const host = fusedWallsById(door.wallId);
            if (!host) return null;
            const matched = fusedDoc?.doors[i];
            return (
              <g key={door.id}>
                <DoorMark door={{ ...door, width: Math.max(door.width, 8), swing: 'left' }} wall={host} />
                <line
                  x1={host.start.x}
                  y1={host.start.y}
                  x2={host.end.x}
                  y2={host.end.y}
                  stroke="transparent"
                  strokeWidth={Math.max(12, host.thickness * 2)}
                  onClick={emit(() =>
                    select(
                      fusedOpeningDescriptor(
                        { id: door.id, kind: 'door', wallId: door.wallId, position: door.position, width: door.width, confidence: door.confidence },
                        matched?.semantic_match === false
                          ? null
                          : { connects: matched?.connects ?? null, type: matched?.semantic_type ?? null, matchReason: matched?.match_reason },
                      ),
                    ),
                  )}
                />
              </g>
            );
          })}
          {fused.windows.map((window, i) => {
            const host = fusedWallsById(window.wallId);
            if (!host) return null;
            const matched = fusedDoc?.windows[i];
            return (
              <g key={window.id}>
                <WindowMark window={{ ...window, width: Math.max(window.width, 8) }} wall={host} />
                <line
                  x1={host.start.x}
                  y1={host.start.y}
                  x2={host.end.x}
                  y2={host.end.y}
                  stroke="transparent"
                  strokeWidth={Math.max(12, host.thickness * 2)}
                  onClick={emit(() =>
                    select(
                      fusedOpeningDescriptor(
                        { id: window.id, kind: 'window', wallId: window.wallId, position: window.position, width: window.width, confidence: window.confidence },
                        matched?.semantic_match === false
                          ? null
                          : { space: matched?.space ?? null, matchReason: matched?.match_reason },
                      ),
                    ),
                  )}
                />
              </g>
            );
          })}
          {fused.stairs.map((stair, i) => {
            const fusedStair = fusedDoc?.stairs[i];
            return (
              <g
                key={stair.id}
                onClick={emit(() => select(stairDescriptor(stair, fusedStair)))}
                aria-label={stair.id}
                style={{ cursor: 'pointer' }}
              >
                <circle cx={stair.position.x} cy={stair.position.y} r={Math.max(7, width * 0.008)} fill="transparent" stroke={STAIR_COLOR} strokeWidth={2.5} />
                <line x1={stair.position.x - 7} y1={stair.position.y - 7} x2={stair.position.x + 7} y2={stair.position.y + 7} stroke={STAIR_COLOR} strokeWidth={2.5} />
                <line x1={stair.position.x - 7} y1={stair.position.y + 7} x2={stair.position.x + 7} y2={stair.position.y - 7} stroke={STAIR_COLOR} strokeWidth={2.5} />
                <text x={stair.position.x + 10} y={stair.position.y + 4} fontSize={Math.max(10, width * 0.01)} fill={STAIR_COLOR} pointerEvents="none">
                  {stair.direction ?? 'stairs'}
                </text>
              </g>
            );
          })}
        </g>
      )}

      {layers.vlmSemantic && semantic && (
        <g data-debug-layer="vlm-semantic">
          {semanticMarks.map(({ space, index, anchor }) => {
            if (!anchor) return null;
            const isUnresolved = (fusedDoc?.unresolved.spaces ?? []).some(
              (u) => u.label === space.label && u.relative_location === space.relative_location,
            );
            const mark = isUnresolved ? UNRESOLVED_MARK : SEMANTIC_MARK;
            return (
              <g
                key={`semantic-${index}`}
                onClick={emit(() => select(semanticSpaceDescriptor(space, index, isUnresolved)))}
                aria-label={space.label ?? `space-${index}`}
                style={{ cursor: 'pointer' }}
              >
                <circle cx={anchor.x} cy={anchor.y} r={Math.max(6, width * 0.006)} fill="transparent" stroke={mark} strokeWidth={2} />
                <line x1={anchor.x - 8} y1={anchor.y} x2={anchor.x + 8} y2={anchor.y} stroke={mark} strokeWidth={1.5} />
                <line x1={anchor.x} y1={anchor.y - 8} x2={anchor.x} y2={anchor.y + 8} stroke={mark} strokeWidth={1.5} />
                <text
                  x={anchor.x + 10}
                  y={anchor.y - 4}
                  fontSize={Math.max(10, width * 0.01)}
                  fontWeight={isUnresolved ? 700 : 500}
                  fill={mark}
                  pointerEvents="none"
                >
                  {space.label ?? `(${space.type})`}
                </text>
              </g>
            );
          })}
          {(semantic.furniture ?? []).map((f, i) => {
            const host = fused?.rooms.find((r) => r.name === f.space) ?? fused?.rooms[0];
            if (!host || !f.space) return null;
            const at = polygonCentroid(host.polygon);
            return (
              <g key={`furniture-${i}`} pointerEvents="none">
                <rect x={at.x - 8} y={at.y + 14} width={16} height={16} rx={2} fill="transparent" stroke={FURNITURE_MARK} strokeWidth={1.5} strokeDasharray="3 2" />
                <text x={at.x + 10} y={at.y + 27} fontSize={Math.max(9, width * 0.008)} fill={FURNITURE_MARK} pointerEvents="none">
                  {f.item ?? 'furniture'}
                </text>
              </g>
            );
          })}
        </g>
      )}

      {layers.roomCandidates && (
        <g data-debug-layer="room-candidates">
          {(candidates?.rooms ?? []).map((c) => (
            <polygon
              key={c.id}
              points={c.polygon.map(([x, y]) => `${x},${y}`).join(' ')}
              fill={ROOM_CANDIDATE_TONE[c.status]}
              fillOpacity={c.status === 'accepted' ? 0.14 : 0.08}
              stroke={ROOM_CANDIDATE_TONE[c.status]}
              strokeWidth={selectedKey === `roomcand:${c.id}` ? 3 : 1.5}
              strokeDasharray={c.status === 'rejected' ? '6 3' : undefined}
              strokeLinejoin="round"
              onClick={emit(() => select(roomCandidateDescriptor(c)))}
              aria-label={c.id}
            />
          ))}
        </g>
      )}

      {layers.normalized && (
        <g data-debug-layer="normalized">
          {geometry.rooms.map((room) => (
            <polygon
              key={room.id}
              points={room.polygon.map(({ x, y }) => `${x},${y}`).join(' ')}
              fill={selectedKey === `normalized:${room.id}` ? 'color-mix(in oklab, var(--primary) 22%, transparent)' : NORMALIZED_ROOM_FILL}
              stroke={NORMALIZED_ROOM_STROKE}
              strokeWidth={selectedKey === `normalized:${room.id}` ? 3 : Math.max(1, width * 0.001)}
              strokeLinejoin="round"
              onClick={emit(() => select(roomDescriptor(room, 'normalized')))}
              aria-label={room.id}
            />
          ))}
          {geometry.walls.map((wall) => (
            <line
              key={wall.id}
              x1={wall.start.x}
              y1={wall.start.y}
              x2={wall.end.x}
              y2={wall.end.y}
              stroke={wall.type === 'exterior' ? 'var(--foreground)' : 'var(--muted-foreground)'}
              strokeWidth={selectedKey === `normalized:${wall.id}` ? wall.thickness + 6 : wall.thickness}
              strokeLinecap="square"
              opacity={selectedKey === `normalized:${wall.id}` ? 1 : wall.type === 'exterior' ? 1 : 0.75}
              onClick={emit(() => select(wallDescriptor(wall, 'normalized')))}
              aria-label={wall.id}
            />
          ))}
          {geometry.windows.map((window, i) => {
            const host = normWallsById(window.wallId);
            if (!host) return null;
            const cand = validWindowCandidates[i];
            return (
              <g key={window.id}>
                <WindowMark window={window} wall={host} />
                <polygon
                  points={cand?.polygon?.map(([x, y]) => `${x},${y}`).join(' ') ?? ''}
                  fill="transparent"
                  stroke="transparent"
                  onClick={emit(() =>
                    select(cand ? openingCandidateDescriptor(cand, 'window') : openingDescriptor({ id: window.id, kind: 'window', confidence: window.confidence })),
                  )}
                />
              </g>
            );
          })}
          {geometry.doors.map((door, i) => {
            const host = normWallsById(door.wallId);
            if (!host) return null;
            const cand = validDoorCandidates[i];
            return (
              <g key={door.id}>
                <DoorMark door={door} wall={host} />
                <polygon
                  points={cand?.polygon?.map(([x, y]) => `${x},${y}`).join(' ') ?? ''}
                  fill="transparent"
                  stroke="transparent"
                  onClick={emit(() =>
                    select(cand ? openingCandidateDescriptor(cand, 'door') : openingDescriptor({ id: door.id, kind: 'door', confidence: door.confidence, position: door.position, width: door.width, wallId: door.wallId, corrected: false })),
                  )}
                />
              </g>
            );
          })}
        </g>
      )}

      {layers.openingCandidates && (
        <g data-debug-layer="opening-candidates">
          {[...doorCandidates, ...windowCandidates].map((c) => (
            <polygon
              key={c.id}
              points={c.polygon.map(([x, y]) => `${x},${y}`).join(' ')}
              fill={openingCandidateTone(c.status)}
              fillOpacity={c.status === 'valid' ? 0.28 : c.status === 'uncertain' ? 0.24 : 0.16}
              stroke={openingCandidateTone(c.status)}
              strokeWidth={selectedKey === `candidate:${c.id}` ? 3 : 1.5}
              strokeDasharray={c.status === 'invalid' ? '5 3' : undefined}
              onClick={emit(() => select(openingCandidateDescriptor(c, c.kind)))}
              aria-label={c.id}
            />
          ))}
        </g>
      )}

      {selectedKey && (
        <g data-debug-layer="selection">
          <rect x={0} y={0} width={width} height={height} fill="transparent" />
        </g>
      )}
    </svg>
  );

  return svg;
}