/**
 * 3D model builder (Phase 5).
 *
 * Converts the normalized pixel-space floor plan into a meter-space 3D
 * model that the frontend three.js viewer renders directly:
 *
 * - every detected room becomes a floor polygon,
 * - wall runs are extruded vertically (configurable height),
 * - door and window center lines cut openings into their host wall and are
 *   emitted as opening records (the viewer renders a simple leaf/glass box).
 *
 * Dimensions are derived from a configurable PIXELS_PER_METER scale; no real
 * world measurements are inferred.
 */

import type { NormalizedFloorPlan, Opening, Point, WallRun } from './types.js';

/** Default wall height in meters. */
export const WALL_HEIGHT_M = 2.7;
/** Default door leaf height in meters. */
export const DOOR_HEIGHT_M = 2.1;
/** Default window height in meters. */
export const WINDOW_HEIGHT_M = 1.4;
/** Minimum wall segment length (pixels) kept when cutting openings. */
const MIN_WALL_SEGMENT_PX = 12;

export interface ModelPoint {
  x: number;
  y: number;
}

export interface ModelRoom {
  id: string;
  /** Stable internal identifier used for display labels. */
  name: string;
  /** Display hint: generic room, kitchen (recognized region), outside space. */
  labelHint: 'room' | 'kitchen' | 'outside';
  /** 1-based index for generic room labels. */
  labelIndex: number;
  level: number;
  /** Floor polygon in meters (x, z plane). */
  points: ModelPoint[];
  /** Axis-aligned bounds of the floor polygon in meters. */
  x: number;
  y: number;
  width: number;
  depth: number;
  height: number;
  areaM2: number | null;
}

export interface ModelWall {
  id: string;
  level: number;
  from: ModelPoint;
  to: ModelPoint;
  thickness: number;
  height: number;
}

export interface ModelOpening {
  id: string;
  level: number;
  /** Center position in meters (x, z plane). */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Rotation around the vertical axis in radians. */
  rotation: number;
}

export interface FloorPlan3DModel {
  unit: 'm';
  rooms: ModelRoom[];
  walls: ModelWall[];
  doors: ModelOpening[];
  windows: ModelOpening[];
}

interface Axis {
  u: Point;
  length: number;
}

function wallAxis(wall: WallRun): Axis {
  const dx = wall.to.x - wall.from.x;
  const dy = wall.to.y - wall.from.y;
  const length = Math.hypot(dx, dy) || 1;
  return { u: { x: dx / length, y: dy / length }, length };
}

/** Opening t-range along its host wall axis (clamped to the wall extent). */
function openingRangeOnWall(opening: Opening, wall: WallRun): [number, number] | null {
  const axis = wallAxis(wall);
  const t0 = (opening.from.x - wall.from.x) * axis.u.x + (opening.from.y - wall.from.y) * axis.u.y;
  const t1 = (opening.to.x - wall.from.x) * axis.u.x + (opening.to.y - wall.from.y) * axis.u.y;
  const lo = Math.max(0, Math.min(t0, t1));
  const hi = Math.min(axis.length, Math.max(t0, t1));
  if (hi - lo < 1) return null;
  return [lo, hi];
}

/**
 * Splits a wall run into segments, removing the spans covered by openings
 * (doors, entry doors, windows). Returns wall segments in pixel space.
 */
function splitWallAtOpenings(wall: WallRun, openings: Opening[]): Array<{ from: Point; to: Point }> {
  const axis = wallAxis(wall);
  const cuts: Array<[number, number]> = [];
  for (const opening of openings) {
    if (opening.wallId !== wall.id) continue;
    const range = openingRangeOnWall(opening, wall);
    if (range) cuts.push(range);
  }
  cuts.sort((a, b) => a[0] - b[0]);

  const segments: Array<{ from: Point; to: Point }> = [];
  let cursor = 0;
  for (const [t0, t1] of cuts) {
    if (t0 - cursor >= MIN_WALL_SEGMENT_PX) {
      segments.push({
        from: { x: wall.from.x + axis.u.x * cursor, y: wall.from.y + axis.u.y * cursor },
        to: { x: wall.from.x + axis.u.x * t0, y: wall.from.y + axis.u.y * t0 },
      });
    }
    cursor = Math.max(cursor, t1);
  }
  if (axis.length - cursor >= MIN_WALL_SEGMENT_PX) {
    segments.push({
      from: { x: wall.from.x + axis.u.x * cursor, y: wall.from.y + axis.u.y * cursor },
      to: { x: wall.to.x, y: wall.to.y },
    });
  }
  return segments;
}

/**
 * Builds the meter-space 3D model from a normalized floor plan with rooms.
 * The model is centered on the plan bounds so coordinates stay small.
 */
export function buildFloorPlan3DModel(plan: NormalizedFloorPlan): FloorPlan3DModel {
  const scale = plan.options.pixelsPerMeter;
  const cx = (plan.bounds.minX + plan.bounds.maxX) / 2;
  const cy = (plan.bounds.minY + plan.bounds.maxY) / 2;
  const toM = (p: Point): ModelPoint => ({ x: (p.x - cx) / scale, y: (p.y - cy) / scale });

  const rooms: ModelRoom[] = plan.rooms.map((room, i) => {
    const points = room.polygon.map(toM);
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const interiorIndex = plan.rooms.filter((r, j) => !r.exterior && j <= i).length;
    const hint = room.exterior ? 'outside' : room.hint === 'kitchen' ? 'kitchen' : 'room';
    return {
      id: room.id,
      name: room.id,
      labelHint: hint,
      labelIndex: room.exterior ? 1 : interiorIndex,
      level: 0,
      points,
      x: (minX + maxX) / 2,
      y: (minY + maxY) / 2,
      width: maxX - minX,
      depth: maxY - minY,
      height: WALL_HEIGHT_M,
      areaM2: Math.round(room.areaM2 * 10) / 10,
    };
  });

  const walls: ModelWall[] = [];
  const doors: ModelOpening[] = [];
  const windows: ModelOpening[] = [];

  for (const wall of plan.walls) {
    const thickness = Math.max(wall.thickness / scale, 0.1);
    const segments = splitWallAtOpenings(wall, plan.openings);
    for (const segment of segments) {
      walls.push({
        id: `${wall.id}-seg${walls.length}`,
        level: 0,
        from: toM(segment.from),
        to: toM(segment.to),
        thickness,
        height: WALL_HEIGHT_M,
      });
    }
  }

  for (const opening of plan.openings) {
    const mid = toM({ x: (opening.from.x + opening.to.x) / 2, y: (opening.from.y + opening.to.y) / 2 });
    const dx = opening.to.x - opening.from.x;
    const dy = opening.to.y - opening.from.y;
    const record: ModelOpening = {
      id: opening.id,
      level: 0,
      x: mid.x,
      y: mid.y,
      width: Math.max(opening.width / scale, 0.6),
      height: opening.kind === 'window' ? WINDOW_HEIGHT_M : DOOR_HEIGHT_M,
      rotation: Math.atan2(dy, dx),
    };
    if (opening.kind === 'window') {
      record.height = WINDOW_HEIGHT_M;
      windows.push(record);
    } else {
      record.height = DOOR_HEIGHT_M;
      doors.push(record);
    }
  }

  return { unit: 'm', rooms, walls, doors, windows };
}