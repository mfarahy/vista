'use client';

import { type PointerEvent as ReactPointerEvent, useCallback } from 'react';
import type {
  Point2D,
  Room,
  VistaGeometry,
  Wall,
} from '@/lib/geometry/models/geometry';
import type { GeometryDebug } from '@/lib/geometry/geometry-debug';
import type { RoomCandidate } from '@/lib/geometry/ai/types';
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
 * base output — raw AI geometry, normalized geometry, room candidates and
 * opening candidates can be toggled independently and overlap. Clicking an
 * entity produces a fully described `InspectedEntity` the side inspector
 * renders. This is a debugging tool, not an editor.
 */

const RAW_WALL_COLOR = 'var(--rose-500)';
const RAW_ROOM_STROKE = 'var(--sky-500)';
const RAW_ROOM_FILL = 'color-mix(in oklab, var(--sky-500) 10%, transparent)';
const NORMALIZED_ROOM_FILL = 'color-mix(in oklab, var(--primary) 12%, transparent)';
const NORMALIZED_ROOM_STROKE = 'var(--primary)';

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

export function GeometryDebugOverlay({
  geometry,
  raw,
  debug,
  layers,
  selectedKey,
  onSelect,
}: {
  geometry: VistaGeometry;
  raw: VistaGeometry | null;
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

  const candidates = debug?.candidates ?? null;
  const doorCandidates = candidates?.openings.door ?? [];
  const windowCandidates = candidates?.openings.window ?? [];

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

  function roomArea(polygon: Point2D[]): number {
    let area = 0;
    for (let i = 0; i < polygon.length; i += 1) {
      const { x, y } = polygon[i];
      const { x: x2, y: y2 } = polygon[(i + 1) % polygon.length];
      area += x * y2 - x2 * y;
    }
    return Math.abs(area) / 2;
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

  function handleBackgroundClick(e: ReactPointerEvent<SVGSVGElement>) {
    if (e.target === e.currentTarget) {
      onSelect(null);
    }
  }

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