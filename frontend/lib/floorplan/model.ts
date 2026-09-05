/**
 * Phase 1 floor-plan semantic model.
 *
 * Coordinates are real-world meters (y-down, matching screen orientation;
 * distances are unaffected). Nothing is stored as pixels or screenshots.
 */

export type Vec2 = { x: number; y: number };

export type Wall = {
  id: string;
  start: Vec2;
  end: Vec2;
  /** Wall thickness in meters. */
  thickness: number;
};

export type FloorPlan = {
  walls: Wall[];
};

export const DEFAULT_WALL_THICKNESS_M = 0.2;
export const MIN_WALL_LENGTH_M = 0.05;
export const MIN_WALL_THICKNESS_M = 0.05;
export const MAX_WALL_THICKNESS_M = 1;

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

export function emptyFloorPlan(): FloorPlan {
  return { walls: [] };
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
