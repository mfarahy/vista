import { GEOMETRY_VERSION, type Door, type Point2D, type Room, type VistaGeometry, type Wall, type Window } from '../models/geometry';
import type { RawModelResult, RawPoint, RawPolygon } from './types';

/**
 * Converts the model's raw output into the canonical `VistaGeometry` schema.
 *
 * The adapter is the *only* place model-specific structures are translated.
 * Mapping rules:
 *
 * - walls        → centerline wall segments (already derived by the model
 *                  post-processing); thickness and type are kept as-is.
 * - rooms        → floor regions enclosed by walls (`floor_regions`).
 * - doors/windows→ openings are *snapped* onto the nearest wall segment
 *                  (position = fraction along the wall, width = opening
 *                  extent along the wall). Only openings within
 *                  `MAX_OPENING_WALL_DISTANCE` of a wall survive; the rest
 *                  are genuinely dropped — the model's opening detections
 *                  are noisy and this is a feasibility-phase heuristic.
 * - stairs       → the model has no stair class; the array stays empty and
 *                  the limitation is documented (nothing is invented).
 * - confidence   → entity-level confidence is carried over from the model's
 *                  own softmax probabilities; the overall `confidence` is the
 *                  area/entity-weighted mean. Never fabricated.
 */

/** Max source-pixel distance an opening centroid may be from its host wall. */
const MAX_OPENING_WALL_DISTANCE = 24;
const DEFAULT_SWING: Door['swing'] = 'left';

function pointLength(p: Point2D): number {
  return Math.hypot(p.x, p.y);
}

function distancePointToSegment(p: Point2D, a: Point2D, b: Point2D): { distance: number; t: number } {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const lengthSq = abx * abx + aby * aby;
  if (lengthSq === 0) {
    return { distance: Math.hypot(p.x - a.x, p.y - a.y), t: 0 };
  }
  const t = Math.min(1, Math.max(0, ((p.x - a.x) * abx + (p.y - a.y) * aby) / lengthSq));
  const px = a.x + t * abx;
  const py = a.y + t * aby;
  return { distance: Math.hypot(p.x - px, p.y - py), t };
}

function polygonCentroid(poly: RawPolygon): Point2D {
  const pts = poly.outer;
  let x = 0;
  let y = 0;
  for (const [px, py] of pts) {
    x += px;
    y += py;
  }
  return { x: x / pts.length, y: y / pts.length };
}

function extentAlongWall(poly: RawPolygon, wall: Wall): number {
  const dir = { x: wall.end.x - wall.start.x, y: wall.end.y - wall.start.y };
  const len = pointLength(dir) || 1;
  const u = { x: dir.x / len, y: dir.y / len };
  let minProj = Infinity;
  let maxProj = -Infinity;
  for (const [x, y] of poly.outer) {
    const proj = (x - wall.start.x) * u.x + (y - wall.start.y) * u.y;
    minProj = Math.min(minProj, proj);
    maxProj = Math.max(maxProj, proj);
  }
  return (maxProj - minProj) / len;
}

type SnappedOpening = {
  wallId: string;
  position: number;
  width: number;
  confidence: number;
} | null;

function snapOpeningToWall(poly: RawPolygon, walls: Wall[]): SnappedOpening {
  const centroid = polygonCentroid(poly);
  let best: { distance: number; t: number; wall: Wall } | null = null;
  for (const wall of walls) {
    const { distance, t } = distancePointToSegment(centroid, wall.start, wall.end);
    if (best === null || distance < best.distance) {
      best = { distance, t, wall };
    }
  }
  if (!best || best.distance > MAX_OPENING_WALL_DISTANCE) return null;
  return {
    wallId: best.wall.id,
    position: best.t,
    width: extentAlongWall(poly, best.wall),
    confidence: poly.confidence,
  };
}

function wallsBoundingRoom(roomPolygon: Point2D[], walls: Wall[]): string[] {
  const edges: { a: Point2D; b: Point2D }[] = [];
  for (let i = 0; i < roomPolygon.length; i += 1) {
    edges.push({ a: roomPolygon[i], b: roomPolygon[(i + 1) % roomPolygon.length] });
  }
  const ids: string[] = [];
  for (const wall of walls) {
    const mid = { x: (wall.start.x + wall.end.x) / 2, y: (wall.start.y + wall.end.y) / 2 };
    const tolerance = wall.thickness / 2 + 8;
    let touching = false;
    for (const edge of edges) {
      if (distancePointToSegment(mid, edge.a, edge.b).distance <= tolerance) {
        touching = true;
        break;
      }
    }
    if (touching) ids.push(wall.id);
  }
  return ids;
}

function rawPointsToPoints(points: RawPoint[]): Point2D[] {
  return points.map(([x, y]) => ({ x, y }));
}

export function rawResultToVistaGeometry(raw: RawModelResult): VistaGeometry {
  const source = { width: raw.input.width, height: raw.input.height };

  const walls: Wall[] = raw.walls.map((segment, i) => ({
    id: `ai-wall-${i}`,
    start: { x: segment.start[0], y: segment.start[1] },
    end: { x: segment.end[0], y: segment.end[1] },
    thickness: Math.max(1, Math.round(segment.thickness)),
    type: segment.type,
    confidence: segment.confidence,
  }));

  const rooms: Room[] = raw.floor_regions.map((region, i) => {
    const polygon = rawPointsToPoints(region.outer);
    return {
      id: `ai-room-${i}`,
      name: null,
      polygon,
      wallIds: wallsBoundingRoom(polygon, walls),
      confidence: region.confidence,
    };
  });

  const doors: Door[] = [];
  for (const poly of raw.polygons.door) {
    const snapped = snapOpeningToWall(poly, walls);
    if (!snapped) continue;
    doors.push({ id: `ai-door-${doors.length}`, ...snapped, swing: DEFAULT_SWING });
  }

  const windows: Window[] = [];
  for (const poly of raw.polygons.window) {
    const snapped = snapOpeningToWall(poly, walls);
    if (!snapped) continue;
    windows.push({ id: `ai-window-${windows.length}`, ...snapped });
  }

  const confidences: number[] = [
    ...walls.map((w) => w.confidence ?? 0),
    ...rooms.map((r) => r.confidence ?? 0),
    ...doors.map((d) => d.confidence ?? 0),
    ...windows.map((w) => w.confidence ?? 0),
  ].filter((c) => Number.isFinite(c) && c > 0);

  return {
    version: GEOMETRY_VERSION,
    units: 'px',
    source,
    walls,
    rooms,
    doors,
    windows,
    stairs: [],
    scale: null,
    confidence:
      confidences.length > 0 ? confidences.reduce((a, b) => a + b, 0) / confidences.length : undefined,
  };
}