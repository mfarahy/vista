// 360 viewer preview — static floor-plan data.
// Typed port of the former standalone prototype's `floorplan.js`.
//
// A very small, hand-sized floor plan: three square rooms, one centered on
// each panorama position from `panoramas.ts`. This is intentionally NOT a
// floor-plan editor or a general geometry engine — rooms are simple
// axis-aligned squares, just enough to demonstrate the spatial data model.
//
// Room centers reuse the exact panorama positions, so the 360 panoramas and
// the window overlay all agree on where each room is (see `coordinates.ts`
// for how positions map between views).

import { panoramaById, type PanoramaId, type PanoramaPosition } from './panoramas';

const ROOM_SIZE = 6; // meters, square room side length

export type Room = {
  id: PanoramaId;
  size: number;
  center: PanoramaPosition;
};

export type WallSegment = { x1: number; y1: number; x2: number; y2: number };

export type FloorWindow = {
  id: string;
  roomId: PanoramaId;
  wallIndex: number;
  offsetM: number;
  widthM: number;
  sillM: number;
  heightM: number;
};

export const ROOMS: Room[] = (
  [{ id: 'living-room' }, { id: 'kitchen' }, { id: 'bedroom' }] as const
).map((room) => ({
  ...room,
  size: ROOM_SIZE,
  center: panoramaById(room.id)!.position,
}));

export function roomById(id: string | undefined): Room | undefined {
  return ROOMS.find((r) => r.id === id);
}

// The four wall segments (as { x1, y1, x2, y2 }) bounding a square room.
export function roomWalls(room: Room): WallSegment[] {
  const half = room.size / 2;
  const { x, y } = room.center;
  const corners = [
    { x: x - half, y: y - half },
    { x: x + half, y: y - half },
    { x: x + half, y: y + half },
    { x: x - half, y: y + half },
  ];
  return corners.map((corner, i) => {
    const next = corners[(i + 1) % corners.length];
    return { x1: corner.x, y1: corner.y, x2: next.x, y2: next.y };
  });
}

// Real window geometry.
//
// One test window in the Living Room, defined entirely in the canonical
// floor-plan `{ x, y }` coordinate system (meters). The window belongs to a
// specific wall of its room (index into `roomWalls(room)`), with a
// configurable width, a configurable horizontal offset from the wall
// midpoint along the wall direction, and configurable vertical dimensions
// (sill height + height) for the minimal 3D representation.
//
// Living Room layout reminder (center 0,0, size 6): wall 0 = north
// (y = -3, yaw -90°), wall 1 = east (x = 3, yaw 0°), wall 2 = south
// (y = 3, yaw 90°), wall 3 = west (x = -3, yaw 180°). The window sits on the
// north wall, centered, far from both doorways (yaws 0° and 60°), so
// alignment is visually unambiguous.
export const WINDOWS: FloorWindow[] = [
  {
    id: 'living-room-window',
    roomId: 'living-room',
    wallIndex: 0,
    offsetM: 0,
    widthM: 1.8,
    sillM: 0.9,
    heightM: 1.2,
  },
];

export function windowById(id: string | undefined): FloorWindow | undefined {
  return WINDOWS.find((w) => w.id === id);
}
