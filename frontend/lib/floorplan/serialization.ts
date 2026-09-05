/**
 * Phase 3 canonical FloorPlan serialization.
 *
 * FloorPlan JSON is the contract between the manual editor and (later)
 * Raster2Seq. It is semantic, small, deterministic, and independent from
 * React, SVG and UI state: only version, units, walls, doors, windows,
 * rooms and optional metadata are persisted — never screen coordinates,
 * zoom, canvas size, selection or preview geometry.
 *
 * No DOM, no React.
 */
import {
  FLOORPLAN_SCHEMA_VERSION,
  FLOORPLAN_UNITS,
  type Door,
  type FloorPlan,
  type Room,
  type Vec2,
  type Wall,
  type Window,
} from './model';
import { validateFloorPlan, type FloorPlanIssue } from './validation';
import { detectRooms } from './rooms';

/** A legacy/foreign plan shape accepted on input (missing version/units). */
export type LooseFloorPlan = Omit<FloorPlan, 'version' | 'units'> &
  Partial<Pick<FloorPlan, 'version' | 'units'>>;

export type ImportResult =
  | { ok: true; plan: FloorPlan }
  | { ok: false; kind: 'parse' | 'validation'; errors: FloorPlanIssue[] };

function sortById<T extends { id: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

function canonicalVec(p: Vec2): Vec2 {
  return { x: p.x, y: p.y };
}

function canonicalWall(wall: Wall): Wall {
  return { id: wall.id, start: canonicalVec(wall.start), end: canonicalVec(wall.end), thickness: wall.thickness };
}

function canonicalDoor(door: Door): Door {
  return { id: door.id, wallId: door.wallId, centerT: door.centerT, width: door.width, swing: door.swing };
}

function canonicalWindow(window: Window): Window {
  return { id: window.id, wallId: window.wallId, centerT: window.centerT, width: window.width };
}

function canonicalRoom(room: Room): Room {
  return {
    id: room.id,
    name: room.name,
    polygon: canonicalRing(room.polygon),
    areaM2: room.areaM2,
    wallIds: [...room.wallIds].sort(),
  };
}

/**
 * Canonical boundary ring: rotate to the lexicographically smallest
 * vertex and enforce a stable winding. Room detection may traverse the
 * same ring from a different start/direction depending on wall order;
 * the canonical form keeps exports byte-stable across round-trips.
 */
function canonicalRing(polygon: Vec2[]): Vec2[] {
  const pts = polygon.map(canonicalVec);
  if (pts.length < 3) return pts;
  let start = 0;
  for (let i = 1; i < pts.length; i++) {
    if (pts[i].x < pts[start].x || (pts[i].x === pts[start].x && pts[i].y < pts[start].y)) start = i;
  }
  const rotated = pts.map((_, i) => pts[(start + i) % pts.length]);
  const second = rotated[1];
  const last = rotated[rotated.length - 1];
  if (second.x > last.x || (second.x === last.x && second.y > last.y)) {
    return [rotated[0], ...rotated.slice(1).reverse()];
  }
  return rotated;
}

/**
 * Build the deterministic canonical object: fixed key order, entities
 * sorted by id. `JSON.stringify` of this object is stable for equal plans.
 */
export function toCanonicalObject(plan: FloorPlan): FloorPlan {
  const canonical: FloorPlan = {
    version: FLOORPLAN_SCHEMA_VERSION,
    units: FLOORPLAN_UNITS,
    walls: sortById(plan.walls).map(canonicalWall),
    doors: sortById(plan.doors).map(canonicalDoor),
    windows: sortById(plan.windows).map(canonicalWindow),
    rooms: sortById(plan.rooms).map(canonicalRoom),
  };
  if (plan.metadata && Object.keys(plan.metadata).length > 0) {
    canonical.metadata = { ...plan.metadata };
  }
  return canonical;
}

/** FloorPlan → JSON string (deterministic, canonical data only). */
export function serializeFloorPlan(plan: FloorPlan): string {
  return JSON.stringify(toCanonicalObject(plan), null, 2);
}

/** Parse JSON text into an unknown value, mapped to a structured issue. */
function parseJsonText(text: string): { value: unknown } | { issue: FloorPlanIssue } {
  try {
    return { value: JSON.parse(text) as unknown };
  } catch {
    return {
      issue: {
        code: 'malformed-json',
        path: '$',
        message: 'File is not valid JSON.',
      },
    };
  }
}

/**
 * Normalize a parsed value into a FloorPlan: fill defaults for legacy
 * plans (missing version/units/metadata), drop unknown top-level keys,
 * and re-derive rooms so stored derived data can never go stale
 * (imported room names survive via id matching).
 *
 * Callers must run `validateFloorPlan` first; normalization coerces
 * shapes but never invents geometry.
 */
export function normalizeFloorPlan(value: unknown): FloorPlan {
  const raw = (typeof value === 'object' && value !== null ? value : {}) as Record<string, unknown>;
  const asArray = (v: unknown): Record<string, unknown>[] =>
    Array.isArray(v) ? v.filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null) : [];
  const num = (v: unknown): number => (typeof v === 'number' ? v : Number.NaN);
  const str = (v: unknown): string => (typeof v === 'string' ? v : '');
  const vec = (v: unknown): Vec2 => {
    const p = (typeof v === 'object' && v !== null ? v : {}) as Record<string, unknown>;
    return { x: num(p.x), y: num(p.y) };
  };
  const walls: Wall[] = asArray(raw.walls).map((w) => ({
    id: str(w.id),
    start: vec(w.start),
    end: vec(w.end),
    thickness: num(w.thickness),
  }));
  const doors: Door[] = asArray(raw.doors).map((d) => ({
    id: str(d.id),
    wallId: str(d.wallId),
    centerT: num(d.centerT),
    width: num(d.width),
    swing: d.swing === 'right' ? 'right' : 'left',
  }));
  const windows: Window[] = asArray(raw.windows).map((w) => ({
    id: str(w.id),
    wallId: str(w.wallId),
    centerT: num(w.centerT),
    width: num(w.width),
  }));
  const previousRooms = asArray(raw.rooms).map(
    (r): Room => ({
      id: str(r.id),
      name: typeof r.name === 'string' ? r.name : '',
      polygon: Array.isArray(r.polygon) ? r.polygon.map(vec) : [],
      areaM2: num(r.areaM2),
      wallIds: Array.isArray(r.wallIds) ? r.wallIds.filter((id): id is string => typeof id === 'string') : [],
    }),
  );
  const base: FloorPlan = {
    version: FLOORPLAN_SCHEMA_VERSION,
    units: FLOORPLAN_UNITS,
    walls,
    doors,
    windows,
    rooms: [],
  };
  const meta = raw.metadata;
  if (typeof meta === 'object' && meta !== null) {
    const m = meta as Record<string, unknown>;
    const clean: NonNullable<FloorPlan['metadata']> = {};
    if (typeof m.name === 'string') clean.name = m.name;
    if (typeof m.createdAt === 'string') clean.createdAt = m.createdAt;
    if (typeof m.updatedAt === 'string') clean.updatedAt = m.updatedAt;
    if (Object.keys(clean).length > 0) base.metadata = clean;
  }
  // Re-derive rooms from wall geometry; user names survive by boundary id.
  base.rooms = detectRooms(base.walls, previousRooms);
  return base;
}

/**
 * JSON text → validated FloorPlan. Never throws: failures are returned
 * as structured issues so the UI can show a concise localized error
 * while keeping the current plan untouched.
 */
export function importFloorPlanJson(text: string): ImportResult {
  const parsed = parseJsonText(text);
  if ('issue' in parsed) return { ok: false, kind: 'parse', errors: [parsed.issue] };
  const validation = validateFloorPlan(parsed.value);
  if (!validation.valid) return { ok: false, kind: 'validation', errors: validation.errors };
  const plan = normalizeFloorPlan(parsed.value);
  return { ok: true, plan: toCanonicalObject(plan) };
}

/** Export filename for a plan download, e.g. `floorplan-2026-09-05-1200.json`. */
export function exportFileName(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
  return `floorplan-${stamp}.json`;
}
