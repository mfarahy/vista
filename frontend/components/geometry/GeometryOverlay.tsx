'use client';

import type { Door, VistaGeometry, Wall, Window } from '@/lib/geometry/models/geometry';

/**
 * Renders `VistaGeometry` as an SVG layer over a floor-plan image.
 *
 * The overlay uses the image's natural pixel dimensions as its coordinate
 * space via an explicit `viewBox`, and is absolutely positioned to exactly
 * cover the displayed `<img>`. Because both the image and the SVG share the
 * same aspect ratio, the geometry stays aligned however the container is
 * resized.
 */

export const WALL_EXTERIOR = 'var(--foreground)';
export const WALL_INTERIOR = 'var(--muted-foreground)';
export const ROOM_FILL = 'color-mix(in oklab, var(--primary) 12%, transparent)';
export const ROOM_STROKE = 'var(--primary)';
export const DOOR_COLOR = 'var(--amber-600)';
export const WINDOW_COLOR = 'var(--sky-600)';

export function pointAlongWall(wall: Wall, fraction: number) {
  return {
    x: wall.start.x + (wall.end.x - wall.start.x) * fraction,
    y: wall.start.y + (wall.end.y - wall.start.y) * fraction,
  };
}

function wallAngle(wall: Wall) {
  return Math.atan2(wall.end.y - wall.start.y, wall.end.x - wall.start.x);
}

export function DoorMark({ door, wall }: { door: Door; wall: Wall }) {
  const hinge = pointAlongWall(wall, door.position - door.width / 2 / Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y));
  const leafEnd = pointAlongWall(wall, door.position + door.width / 2 / Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y));
  const angle = wallAngle(wall);
  const radius = Math.hypot(leafEnd.x - hinge.x, leafEnd.y - hinge.y);
  const arcStart = angle + Math.PI / 2;
  const arcEnd = angle + Math.PI;
  const large = Math.abs(arcEnd - arcStart) > Math.PI ? 1 : 0;
  const arcEndPoint = {
    x: hinge.x + radius * Math.cos(arcEnd),
    y: hinge.y + radius * Math.sin(arcEnd),
  };
  const sweep = 1;
  return (
    <g data-geometry="door" aria-label="door">
      <line
        x1={hinge.x}
        y1={hinge.y}
        x2={arcEndPoint.x}
        y2={arcEndPoint.y}
        stroke={DOOR_COLOR}
        strokeWidth={Math.max(2, wall.thickness * 0.35)}
        strokeLinecap="round"
      />
      <path
        d={`M ${hinge.x} ${hinge.y} A ${radius} ${radius} 0 ${large} ${sweep} ${arcEndPoint.x} ${arcEndPoint.y}`}
        fill="none"
        stroke={DOOR_COLOR}
        strokeWidth={Math.max(1.5, wall.thickness * 0.25)}
      />
    </g>
  );
}

export function WindowMark({ window, wall }: { window: Window; wall: Wall }) {
  const length = Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y);
  const start = pointAlongWall(wall, window.position - window.width / 2 / length);
  const end = pointAlongWall(wall, window.position + window.width / 2 / length);
  return (
    <line
      data-geometry="window"
      x1={start.x}
      y1={start.y}
      x2={end.x}
      y2={end.y}
      stroke={WINDOW_COLOR}
      strokeWidth={Math.max(2, wall.thickness * 0.5)}
      strokeLinecap="square"
      opacity={0.9}
    />
  );
}

export function GeometryOverlay({ geometry }: { geometry: VistaGeometry }) {
  const { width, height } = geometry.source;
  const wallById = new Map(geometry.walls.map((wall) => [wall.id, wall]));

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
      aria-hidden="true"
    >
      {geometry.rooms.map((room) => (
        <polygon
          key={room.id}
          data-geometry="room"
          points={room.polygon.map(({ x, y }) => `${x},${y}`).join(' ')}
          fill={ROOM_FILL}
          stroke={ROOM_STROKE}
          strokeWidth={Math.max(1, width * 0.001)}
          strokeLinejoin="round"
        />
      ))}
      {geometry.walls.map((wall) => (
        <line
          key={wall.id}
          data-geometry="wall"
          x1={wall.start.x}
          y1={wall.start.y}
          x2={wall.end.x}
          y2={wall.end.y}
          stroke={wall.type === 'exterior' ? WALL_EXTERIOR : WALL_INTERIOR}
          strokeWidth={wall.thickness}
          strokeLinecap="square"
          opacity={wall.type === 'exterior' ? 1 : 0.75}
        />
      ))}
      {geometry.doors.map((door) => {
        const wall = wallById.get(door.wallId);
        if (!wall) return null;
        return <DoorMark key={door.id} door={door} wall={wall} />;
      })}
      {geometry.windows.map((window) => {
        const wall = wallById.get(window.wallId);
        if (!wall) return null;
        return <WindowMark key={window.id} window={window} wall={wall} />;
      })}
    </svg>
  );
}
