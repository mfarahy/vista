/**
 * Phase 2 floor-plan semantic model.
 *
 * Coordinates are real-world meters (y-down, matching screen orientation;
 * distances are unaffected). Nothing is stored as pixels or screenshots.
 *
 * Doors and windows never store absolute canvas coordinates. They reference
 * their host wall (`wallId`) plus a fractional position (`centerT`, 0..1)
 * measured from the wall start. Absolute screen positions are always derived,
 * so openings follow automatically when a wall moves or is resized.
 */

export type Vec2 = { x: number; y: number };

export type Wall = {
  id: string;
  start: Vec2;
  end: Vec2;
  /** Wall thickness in meters. */
  thickness: number;
};

/** Hinge side convention: 'left' hinges at the opening start, 'right' at the opening end. */
export type DoorSwing = 'left' | 'right';

export type Door = {
  id: string;
  wallId: string;
  /** Fractional center of the opening along the wall (0 = wall start, 1 = wall end). */
  centerT: number;
  /** Opening width in meters. */
  width: number;
  swing: DoorSwing;
};

export type Window = {
  id: string;
  wallId: string;
  /** Fractional center of the opening along the wall (0 = wall start, 1 = wall end). */
  centerT: number;
  /** Opening width in meters. */
  width: number;
};

export type Room = {
  /**
   * Stable id derived from the detected boundary (`room-<hash of wall ids>`).
   * User renames survive re-detection because the signature is geometry-based.
   */
  id: string;
  /** User-assigned name. Empty string means "auto" (UI shows a localized default). */
  name: string;
  /** Closed boundary polygon in meters, ordered. */
  polygon: Vec2[];
  /** Calculated area in square meters. */
  areaM2: number;
  /** Ids of the walls forming the boundary. */
  wallIds: string[];
};

export type FloorPlan = {
  walls: Wall[];
  doors: Door[];
  windows: Window[];
  rooms: Room[];
};

export const DEFAULT_WALL_THICKNESS_M = 0.2;
export const MIN_WALL_LENGTH_M = 0.05;
export const MIN_WALL_THICKNESS_M = 0.05;
export const MAX_WALL_THICKNESS_M = 1;

export const DEFAULT_DOOR_WIDTH_M = 0.9;
export const MIN_OPENING_WIDTH_M = 0.4;
export const MAX_OPENING_WIDTH_M = 3;
export const DEFAULT_WINDOW_WIDTH_M = 1.2;
/** Room faces smaller than this are treated as slivers, not rooms. */
export const MIN_ROOM_AREA_M2 = 0.3;

export function createId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `wall-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
}

export function createWall(start: Vec2, end: Vec2, thickness: number = DEFAULT_WALL_THICKNESS_M): Wall {
  return { id: createId(), start: { ...start }, end: { ...end }, thickness };
}

export function wallLength(wall: Pick<Wall, 'start' | 'end'>): number {
  return Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y);
}

export function isValidWall(
  wall: Pick<Wall, 'start' | 'end'>,
  minLength: number = MIN_WALL_LENGTH_M,
): boolean {
  return Number.isFinite(wall.start.x) && Number.isFinite(wall.start.y) &&
    Number.isFinite(wall.end.x) && Number.isFinite(wall.end.y) &&
    wallLength(wall) >= minLength;
}

export function clampThickness(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_WALL_THICKNESS_M;
  return Math.min(MAX_WALL_THICKNESS_M, Math.max(MIN_WALL_THICKNESS_M, value));
}

export function clampOpeningWidth(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_DOOR_WIDTH_M;
  return Math.min(MAX_OPENING_WIDTH_M, Math.max(MIN_OPENING_WIDTH_M, value));
}

/** Clamp a fractional wall position to 0..1. */
export function clampT(value: number): number {
  if (!Number.isFinite(value)) return 0.5;
  return Math.min(1, Math.max(0, value));
}

export function createDoor(
  wallId: string,
  centerT: number = 0.5,
  width: number = DEFAULT_DOOR_WIDTH_M,
  swing: DoorSwing = 'left',
): Door {
  return { id: createId(), wallId, centerT: clampT(centerT), width: clampOpeningWidth(width), swing };
}

export function createWindow(
  wallId: string,
  centerT: number = 0.5,
  width: number = DEFAULT_WINDOW_WIDTH_M,
): Window {
  return { id: createId(), wallId, centerT: clampT(centerT), width: clampOpeningWidth(width) };
}

export function emptyFloorPlan(): FloorPlan {
  return { walls: [], doors: [], windows: [], rooms: [] };
}

export function wallsBoundingBox(walls: Wall[]): { minX: number; minY: number; maxX: number; maxY: number } | null {
  if (walls.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const wall of walls) {
    minX = Math.min(minX, wall.start.x, wall.end.x);
    minY = Math.min(minY, wall.start.y, wall.end.y);
    maxX = Math.max(maxX, wall.start.x, wall.end.x);
    maxY = Math.max(maxY, wall.start.y, wall.end.y);
  }
  return { minX, minY, maxX, maxY };
}
