/**
 * Pure FloorPlan operations for Phase 2.
 *
 * Every mutating helper takes a FloorPlan, returns a new FloorPlan, and
 * re-runs room detection (preserving user-assigned room names). The React
 * editor hook delegates to these so the logic stays unit-testable without
 * React. No DOM, no React.
 */
import {
  FLOORPLAN_SCHEMA_VERSION,
  FLOORPLAN_UNITS,
  MIN_WALL_LENGTH_M,
  clampOpeningWidth,
  clampT,
  type Door,
  type DoorSwing,
  type FloorPlan,
  type Room,
  type Vec2,
  type Wall,
  type Window,
} from './model';
import { detectRooms } from './rooms';
import { pointInPolygon, polygonCentroid, setWallEndpoint, setWallLength, translateWall, wallPointAt } from './geometry';

/** Endpoints are shared when they coincide (snapping stores exact copies). */
export const COINCIDENT_EPS_M = 1e-6;

export function samePoint(a: Vec2, b: Vec2, eps = COINCIDENT_EPS_M): boolean {
  return Math.hypot(b.x - a.x, b.y - a.y) <= eps;
}

export function clonePlan(plan: FloorPlan): FloorPlan {
  return {
    version: plan.version ?? FLOORPLAN_SCHEMA_VERSION,
    units: plan.units ?? FLOORPLAN_UNITS,
    ...(plan.metadata ? { metadata: { ...plan.metadata } } : {}),
    walls: plan.walls.map((wall) => ({ ...wall, start: { ...wall.start }, end: { ...wall.end } })),
    doors: plan.doors.map((door) => ({ ...door })),
    windows: plan.windows.map((window) => ({ ...window })),
    rooms: plan.rooms.map((room) => ({
      ...room,
      polygon: room.polygon.map((p) => ({ ...p })),
      wallIds: [...room.wallIds],
    })),
  };
}

export function withRooms(plan: FloorPlan, previousRooms: Room[] = plan.rooms): FloorPlan {
  const detected = detectRooms(plan.walls, previousRooms);
  const named = carryRoomNames(previousRooms, detected);
  if (named.length > 0) return { ...plan, rooms: named };
  // No closed rooms: keep imported fallback polygons (no wall references)
  // so an import without closed geometry does not lose its room information.
  // They are replaced automatically once real detection finds rooms.
  const fallbacks = previousRooms.filter((room) => room.wallIds.length === 0 && room.polygon.length >= 3);
  return {
    ...plan,
    rooms: fallbacks.map((room) => ({ ...room, polygon: room.polygon.map((p) => ({ ...p })), wallIds: [] })),
  };
}

/**
 * Deterministic room-name carryover for re-detection.
 *
 * `detectRooms` already preserves names when the boundary signature (wall
 * ids) is unchanged. When walls are added, deleted or split, signatures
 * change; an unnamed room then inherits the name of the smallest named
 * previous room containing its centroid (same rule the Raster2Seq adapter
 * uses for import labels). Ambiguity resolves deterministically by area,
 * then by previous order. Duplicate names are possible and acceptable.
 */
function carryRoomNames(previousRooms: Room[], detected: Room[]): Room[] {
  return detected.map((room) => {
    if (room.name) return room;
    const center = polygonCentroid(room.polygon);
    let best: Room | null = null;
    for (const previous of previousRooms) {
      if (!previous.name) continue;
      if (!pointInPolygon(center, previous.polygon)) continue;
      if (!best || previous.areaM2 < best.areaM2) best = previous;
    }
    return best ? { ...room, name: best.name } : room;
  });
}

function findWall(plan: FloorPlan, wallId: string): Wall | null {
  return plan.walls.find((wall) => wall.id === wallId) ?? null;
}

// --- Walls ---------------------------------------------------------------

export function planAddWall(plan: FloorPlan, wall: Wall): FloorPlan {
  return withRooms({ ...plan, walls: [...plan.walls, wall] });
}

export function planDeleteWalls(plan: FloorPlan, wallIds: string[]): FloorPlan {
  if (wallIds.length === 0) return plan;
  const ids = new Set(wallIds);
  return withRooms({
    ...plan,
    walls: plan.walls.filter((wall) => !ids.has(wall.id)),
    doors: plan.doors.filter((door) => !ids.has(door.wallId)),
    windows: plan.windows.filter((window) => !ids.has(window.wallId)),
  });
}

/**
 * Drag one wall endpoint to a new position. Every wall endpoint coincident
 * with the dragged endpoint moves along, preserving connected geometry.
 * Returns null when the dragged wall would become degenerate.
 */
export function planSetWallEndpoint(
  plan: FloorPlan,
  wallId: string,
  which: 'start' | 'end',
  point: Vec2,
): FloorPlan | null {
  const wall = findWall(plan, wallId);
  if (!wall) return null;
  const moved = setWallEndpoint(wall, which, point);
  if (!moved) return null;
  const anchor = which === 'start' ? wall.start : wall.end;
  const walls = plan.walls.map((candidate) => {
    if (candidate.id === wallId) return moved;
    const startShared = samePoint(candidate.start, anchor);
    const endShared = samePoint(candidate.end, anchor);
    if (!startShared && !endShared) return candidate;
    const next = { ...candidate, start: { ...candidate.start }, end: { ...candidate.end } };
    if (startShared) next.start = { ...point };
    if (endShared) next.end = { ...point };
    // Never collapse a connected wall below the minimum length.
    if (Math.hypot(next.end.x - next.start.x, next.end.y - next.start.y) < MIN_WALL_LENGTH_M) {
      return candidate;
    }
    return next;
  });
  return withRooms({ ...plan, walls });
}

/**
 * Move a whole wall by a delta. Connected walls sharing an endpoint stretch
 * along (their shared endpoint follows by the same delta). Openings stay
 * attached via their fractional position and follow automatically.
 */
export function planMoveWall(plan: FloorPlan, wallId: string, delta: Vec2): FloorPlan | null {
  const wall = findWall(plan, wallId);
  if (!wall) return null;
  const moved = translateWall(wall, delta);
  const anchors = [wall.start, wall.end];
  const walls = plan.walls.map((candidate) => {
    if (candidate.id === wallId) return moved;
    const next = { ...candidate, start: { ...candidate.start }, end: { ...candidate.end } };
    let touched = false;
    for (const anchor of anchors) {
      if (samePoint(next.start, anchor)) {
        next.start = { x: next.start.x + delta.x, y: next.start.y + delta.y };
        touched = true;
      }
      if (samePoint(next.end, anchor)) {
        next.end = { x: next.end.x + delta.x, y: next.end.y + delta.y };
        touched = true;
      }
    }
    if (touched && Math.hypot(next.end.x - next.start.x, next.end.y - next.start.y) < MIN_WALL_LENGTH_M) {
      return candidate;
    }
    return next;
  });
  return withRooms({ ...plan, walls });
}

/**
 * Resize a wall to an exact length, keeping its start fixed. Connected walls
 * sharing the old end follow to the new end so corners stay closed.
 */
export function planSetWallLength(
  plan: FloorPlan,
  wallId: string,
  lengthM: number,
): FloorPlan | null {
  const wall = findWall(plan, wallId);
  if (!wall) return null;
  const resized = setWallLength(wall, lengthM);
  if (!resized) return null;
  const walls = plan.walls.map((candidate) => {
    if (candidate.id === wallId) return resized;
    const next = { ...candidate, start: { ...candidate.start }, end: { ...candidate.end } };
    let changed = false;
    if (samePoint(next.start, wall.end)) {
      next.start = { ...resized.end };
      changed = true;
    }
    if (samePoint(next.end, wall.end)) {
      next.end = { ...resized.end };
      changed = true;
    }
    if (changed && Math.hypot(next.end.x - next.start.x, next.end.y - next.start.y) < MIN_WALL_LENGTH_M) {
      return candidate;
    }
    return next;
  });
  return withRooms({ ...plan, walls });
}

export type SplitWallResult = { plan: FloorPlan; walls: [Wall, Wall] };

function uniqueSplitId(plan: FloorPlan, base: string): string {
  const taken = new Set(plan.walls.map((wall) => wall.id));
  let candidate = base;
  let counter = 2;
  while (taken.has(candidate)) {
    candidate = `${base}-${counter}`;
    counter += 1;
  }
  return candidate;
}

/**
 * Split a wall into two segments at fractional position `t`.
 *
 * New ids derive deterministically from the original (`<id>-a`, `<id>-b`).
 * Openings attached to the wall are reassigned by their absolute center:
 * each keeps its width (and a door its swing) and lands on the segment
 * containing its center, with its fractional position rescaled. An opening
 * straddling the split point is assigned by center and clamped visually,
 * exactly like an oversized opening on a short wall.
 * Returns null when either segment would be below the minimum length.
 */
export function planSplitWall(plan: FloorPlan, wallId: string, t: number): SplitWallResult | null {
  const wall = findWall(plan, wallId);
  if (!wall) return null;
  if (!Number.isFinite(t)) return null;
  const len = Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y);
  if (len < MIN_WALL_LENGTH_M * 2) return null;
  const tc = clampT(t);
  const lenA = tc * len;
  const lenB = len - lenA;
  if (lenA < MIN_WALL_LENGTH_M || lenB < MIN_WALL_LENGTH_M) return null;
  const cut = wallPointAt(wall, tc);
  const idA = uniqueSplitId(plan, `${wallId}-a`);
  const idB = uniqueSplitId({ ...plan, walls: [...plan.walls, { ...wall, id: idA }] }, `${wallId}-b`);
  const wallA: Wall = { id: idA, start: { ...wall.start }, end: { ...cut }, thickness: wall.thickness };
  const wallB: Wall = { id: idB, start: { ...cut }, end: { ...wall.end }, thickness: wall.thickness };
  const doors = plan.doors.map((door) => {
    if (door.wallId !== wallId) return door;
    const dist = clampT(door.centerT) * len;
    return dist <= lenA
      ? { ...door, wallId: idA, centerT: clampT(lenA > 1e-9 ? dist / lenA : 0.5) }
      : { ...door, wallId: idB, centerT: clampT(lenB > 1e-9 ? (dist - lenA) / lenB : 0.5) };
  });
  const windows = plan.windows.map((window) => {
    if (window.wallId !== wallId) return window;
    const dist = clampT(window.centerT) * len;
    return dist <= lenA
      ? { ...window, wallId: idA, centerT: clampT(lenA > 1e-9 ? dist / lenA : 0.5) }
      : { ...window, wallId: idB, centerT: clampT(lenB > 1e-9 ? (dist - lenA) / lenB : 0.5) };
  });
  const walls = plan.walls.flatMap((candidate) => (candidate.id === wallId ? [wallA, wallB] : [candidate]));
  return { plan: withRooms({ ...plan, walls, doors, windows }), walls: [wallA, wallB] };
}

export function planSetWallThickness(
  plan: FloorPlan,
  wallIds: string[],
  thickness: number,
): FloorPlan {
  if (wallIds.length === 0) return plan;
  const ids = new Set(wallIds);
  return {
    ...plan,
    walls: plan.walls.map((wall) => (ids.has(wall.id) ? { ...wall, thickness } : wall)),
  };
}

// --- Doors & windows ------------------------------------------------------

export function planAddDoor(
  plan: FloorPlan,
  wallId: string,
  centerT: number,
  width?: number,
  swing?: DoorSwing,
): { plan: FloorPlan; door: Door } | null {
  const wall = findWall(plan, wallId);
  if (!wall) return null;
  const door: Door = {
    id: `door-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`,
    wallId,
    centerT: clampT(centerT),
    width: clampOpeningWidth(width ?? 0.9),
    swing: swing ?? 'left',
  };
  // The stored center is clamped on render via openingEndpoints so the
  // opening always fits, even on short walls.
  return { plan: { ...plan, doors: [...plan.doors, door] }, door };
}

export function planAddWindow(
  plan: FloorPlan,
  wallId: string,
  centerT: number,
  width?: number,
): { plan: FloorPlan; window: Window } | null {
  const wall = findWall(plan, wallId);
  if (!wall) return null;
  const window: Window = {
    id: `window-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`,
    wallId,
    centerT: clampT(centerT),
    width: clampOpeningWidth(width ?? 1.2),
  };
  return { plan: { ...plan, windows: [...plan.windows, window] }, window };
}

export function planMoveDoor(plan: FloorPlan, doorId: string, centerT: number): FloorPlan | null {
  const door = plan.doors.find((d) => d.id === doorId);
  if (!door) return null;
  const wall = findWall(plan, door.wallId);
  if (!wall) return null;
  const next: Door = { ...door, centerT: clampT(centerT) };
  return { ...plan, doors: plan.doors.map((d) => (d.id === doorId ? next : d)) };
}

export function planMoveWindow(plan: FloorPlan, windowId: string, centerT: number): FloorPlan | null {
  const window = plan.windows.find((w) => w.id === windowId);
  if (!window) return null;
  if (!findWall(plan, window.wallId)) return null;
  return {
    ...plan,
    windows: plan.windows.map((w) => (w.id === windowId ? { ...w, centerT: clampT(centerT) } : w)),
  };
}

export function planSetDoorWidth(plan: FloorPlan, doorId: string, width: number): FloorPlan | null {
  if (!plan.doors.some((d) => d.id === doorId)) return null;
  return {
    ...plan,
    doors: plan.doors.map((d) => (d.id === doorId ? { ...d, width: clampOpeningWidth(width) } : d)),
  };
}

export function planSetWindowWidth(
  plan: FloorPlan,
  windowId: string,
  width: number,
): FloorPlan | null {
  if (!plan.windows.some((w) => w.id === windowId)) return null;
  return {
    ...plan,
    windows: plan.windows.map((w) =>
      w.id === windowId ? { ...w, width: clampOpeningWidth(width) } : w,
    ),
  };
}

export function planSetDoorSwing(plan: FloorPlan, doorId: string, swing: DoorSwing): FloorPlan | null {
  if (!plan.doors.some((d) => d.id === doorId)) return null;
  return {
    ...plan,
    doors: plan.doors.map((d) => (d.id === doorId ? { ...d, swing } : d)),
  };
}

export function planDeleteOpenings(
  plan: FloorPlan,
  doorIds: string[],
  windowIds: string[],
): FloorPlan {
  if (doorIds.length === 0 && windowIds.length === 0) return plan;
  const doors = new Set(doorIds);
  const windows = new Set(windowIds);
  return {
    ...plan,
    doors: plan.doors.filter((d) => !doors.has(d.id)),
    windows: plan.windows.filter((w) => !windows.has(w.id)),
  };
}

// --- Rooms ----------------------------------------------------------------

export function planRenameRoom(plan: FloorPlan, roomId: string, name: string): FloorPlan | null {
  if (!plan.rooms.some((room) => room.id === roomId)) return null;
  return {
    ...plan,
    rooms: plan.rooms.map((room) => (room.id === roomId ? { ...room, name } : room)),
  };
}

// --- History (pure, unit-tested; the hook keeps the live stacks) -----------

export function pushHistory<T>(past: T[], snapshot: T, limit: number): T[] {
  const next = [...past, snapshot];
  return next.length > limit ? next.slice(next.length - limit) : next;
}

export function undoStep<T>(past: T[], future: T[], current: T): {
  past: T[];
  future: T[];
  current: T;
} | null {
  if (past.length === 0) return null;
  const previous = past[past.length - 1];
  return { past: past.slice(0, -1), future: [...future, current], current: previous };
}

export function redoStep<T>(past: T[], future: T[], current: T): {
  past: T[];
  future: T[];
  current: T;
} | null {
  if (future.length === 0) return null;
  const next = future[future.length - 1];
  return { past: [...past, current], future: future.slice(0, -1), current: next };
}
