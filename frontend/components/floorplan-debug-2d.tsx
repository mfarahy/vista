'use client';
import { useI18n } from '@/lib/i18n';

/**
 * Client-side 2D debug view of the processed floor-plan geometry.
 * Renders the normalized walls, openings, detected rooms and recognized
 * kitchen regions as an SVG with distinct styles per category, using the
 * same y-up orientation as the 3D view.
 */

export type DebugPoint = { x: number; y: number };

export type DebugWall = {
  id: string;
  from: DebugPoint;
  to: DebugPoint;
  thickness: number;
  length: number;
  exterior: boolean;
};

export type DebugOpening = {
  id: string;
  kind: 'door' | 'entry_door' | 'window';
  from: DebugPoint;
  to: DebugPoint;
  width: number;
  wallId: string | null;
  roomIds: string[];
};

export type DebugRoom = {
  id: string;
  polygon: DebugPoint[];
  area: number;
  areaM2: number;
  exterior: boolean;
  hint: 'kitchen' | null;
};

export type DebugNormalized = {
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  walls: DebugWall[];
  openings: DebugOpening[];
  rooms: DebugRoom[];
  kitchenRegions: DebugPoint[][];
};

const ROOM_COLORS = [
  '#f9e7b3',
  '#cfe3cf',
  '#c9daf0',
  '#e3d3ec',
  '#f2d1cf',
  '#d6eadf',
  '#f0d9e8',
  '#dce4c9',
];
const OUTSIDE_COLOR = '#e8e8e0';
const WALL_COLOR = '#5a5650';
const DOOR_COLOR = '#1f6fb2';
const ENTRY_DOOR_COLOR = '#0f4c81';
const WINDOW_COLOR = '#2fa8c9';
const KITCHEN_COLOR = '#9a6b2f';

function pointsAttr(points: DebugPoint[]): string {
  return points.map((p) => `${p.x.toFixed(1)},${(-p.y).toFixed(1)}`).join(' ');
}

export function FloorplanDebug2D({ normalized }: { normalized: DebugNormalized }) {
  const { t } = useI18n();
  const b = normalized.bounds;
  const pad = 24;
  const width = b.maxX - b.minX + pad * 2;
  const height = b.maxY - b.minY + pad * 2;

  let roomIndex = 0;
  const rooms = normalized.rooms
    .filter((room) => !room.exterior)
    .map((room) => {
      roomIndex += 1;
      return { room, index: roomIndex };
    });

  const roomLabel = (room: DebugRoom, index: number): string => {
    const area = room.areaM2.toFixed(1);
    if (room.hint === 'kitchen') return t('floorplanDebug.roomLabel', { name: t('floorplanDebug.roomKitchen'), area });
    return t('floorplanDebug.roomLabel', { name: t('floorplanDebug.roomName', { number: index }), area });
  };

  const legendItems: Array<[string, string]> = [
    [WALL_COLOR, t('floorplanDebug.legendWalls')],
    [DOOR_COLOR, t('floorplanDebug.legendDoors')],
    [ENTRY_DOOR_COLOR, t('floorplanDebug.legendEntryDoors')],
    [WINDOW_COLOR, t('floorplanDebug.legendWindows')],
    [ROOM_COLORS[0], t('floorplanDebug.legendRooms')],
    [KITCHEN_COLOR, t('floorplanDebug.legendKitchenRegion')],
    [OUTSIDE_COLOR, t('floorplanDebug.legendOutside')],
  ];

  return (
    <svg
      role="img"
      aria-label={t('floorplanDebug.ariaLabel')}
      viewBox={`0 0 ${width} ${height}`}
      className="h-auto w-full"
      fontFamily="system-ui, sans-serif"
    >
      <rect x="0" y="0" width={width} height={height} fill="#fafaf8" />
      <g transform={`translate(${pad},${pad})`}>
        {normalized.rooms
          .filter((room) => room.exterior)
          .map((room) => (
            <polygon
              key={room.id}
              points={pointsAttr(room.polygon)}
              fill={OUTSIDE_COLOR}
              stroke="#b8b4ac"
              strokeWidth="1"
            />
          ))}
        {rooms.map(({ room, index }) => {
          const centroid = { x: 0, y: 0 };
          for (const p of room.polygon) {
            centroid.x += p.x;
            centroid.y += p.y;
          }
          centroid.x /= room.polygon.length;
          centroid.y /= room.polygon.length;
          return (
            <g key={room.id}>
              <polygon
                points={pointsAttr(room.polygon)}
                fill={ROOM_COLORS[(index - 1) % ROOM_COLORS.length]}
                stroke="#8a867e"
                strokeWidth="1"
              />
              <text
                x={centroid.x}
                y={-centroid.y}
                fontSize="12"
                fontWeight="600"
                fill="#444"
                textAnchor="middle"
              >
                {roomLabel(room, index)}
              </text>
            </g>
          );
        })}
        {normalized.kitchenRegions.map((region, i) => (
          <polygon
            key={`kitchen-${i}`}
            points={pointsAttr(region)}
            fill="none"
            stroke={KITCHEN_COLOR}
            strokeWidth="2"
            strokeDasharray="6 4"
          />
        ))}
        {normalized.walls.map((wall) => (
          <line
            key={wall.id}
            x1={wall.from.x}
            y1={-wall.from.y}
            x2={wall.to.x}
            y2={-wall.to.y}
            stroke={WALL_COLOR}
            strokeWidth={Math.max(wall.thickness, 2)}
            strokeLinecap="round"
          />
        ))}
        {normalized.openings.map((opening) => {
          const color =
            opening.kind === 'window'
              ? WINDOW_COLOR
              : opening.kind === 'entry_door'
                ? ENTRY_DOOR_COLOR
                : DOOR_COLOR;
          return (
            <g key={opening.id}>
              <line
                x1={opening.from.x}
                y1={-opening.from.y}
                x2={opening.to.x}
                y2={-opening.to.y}
                stroke={color}
                strokeWidth={opening.kind === 'window' ? 4 : 3}
                strokeLinecap="round"
              />
              {opening.kind !== 'window' && (
                <circle
                  cx={(opening.from.x + opening.to.x) / 2}
                  cy={-(opening.from.y + opening.to.y) / 2}
                  r="2.5"
                  fill={color}
                />
              )}
            </g>
          );
        })}
      </g>
      <g className="floorplan-debug-legend">
        {legendItems.map(([color, label], i) => (
          <g key={label}>
            <rect x="12" y={12 + i * 16} width="12" height="12" rx="2" fill={color} stroke="#888" strokeWidth="0.5" />
            <text x="30" y={22 + i * 16} fontSize="11" fill="#333">
              {label}
            </text>
          </g>
        ))}
      </g>
    </svg>
  );
}