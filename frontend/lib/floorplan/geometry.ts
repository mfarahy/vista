/**
 * Pure geometry + snapping helpers for the floor plan editor.
 * All units are meters (world coordinates). No React, no DOM.
 */
import { MIN_WALL_LENGTH_M, clampT, type Vec2, type Wall } from './model';

export type SnapKind = 'endpoint' | 'horizontal' | 'vertical' | 'angle' | null;

export type SnapResult = {
  point: Vec2;
  kind: SnapKind;
  /** Id of the wall whose endpoint was used, when kind === 'endpoint'. */
  sourceWallId?: string;
};

export const ANGLE_SNAP_STEP_DEG = 15;
export const ANGLE_SNAP_TOLERANCE_DEG = 4;
export const ORTHO_LOCK_TOLERANCE_RATIO = 0.08;

export function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function distancePointToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return distance(p, a);
  const t = Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

export function collectEndpoints(walls: Wall[]): Array<{ point: Vec2; wallId: string }> {
  const points: Array<{ point: Vec2; wallId: string }> = [];
  for (const wall of walls) {
    points.push({ point: wall.start, wallId: wall.id });
    points.push({ point: wall.end, wallId: wall.id });
  }
  return points;
}

export function nearestEndpoint(
  raw: Vec2,
  walls: Wall[],
  toleranceM: number,
  ignoreWallId?: string,
): { point: Vec2; wallId: string } | null {
  let best: { point: Vec2; wallId: string } | null = null;
  let bestDist = toleranceM;
  for (const wall of walls) {
    if (ignoreWallId && wall.id === ignoreWallId) continue;
    for (const candidate of [wall.start, wall.end]) {
      const d = distance(raw, candidate);
      if (d <= bestDist) {
        bestDist = d;
        best = { point: candidate, wallId: wall.id };
      }
    }
  }
  return best;
}

function snapAngleFromStart(start: Vec2, raw: Vec2): { point: Vec2; kind: SnapKind } {
  const dx = raw.x - start.x;
  const dy = raw.y - start.y;
  const length = Math.hypot(dx, dy);
  if (length < MIN_WALL_LENGTH_M) return { point: { ...raw }, kind: null };
  const angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
  const snappedStep = Math.round(angleDeg / ANGLE_SNAP_STEP_DEG) * ANGLE_SNAP_STEP_DEG;
  const diff = Math.abs(angleDeg - snappedStep);
  if (diff > ANGLE_SNAP_TOLERANCE_DEG && diff < 360 - ANGLE_SNAP_TOLERANCE_DEG) {
    // Light ortho assistance: lock to horizontal/vertical when nearly aligned.
    if (Math.abs(dy) <= Math.abs(dx) * ORTHO_LOCK_TOLERANCE_RATIO) {
      return { point: { x: raw.x, y: start.y }, kind: 'horizontal' };
    }
    if (Math.abs(dx) <= Math.abs(dy) * ORTHO_LOCK_TOLERANCE_RATIO) {
      return { point: { x: start.x, y: raw.y }, kind: 'vertical' };
    }
    return { point: { ...raw }, kind: null };
  }
  const snappedRad = (snappedStep * Math.PI) / 180;
  const point = {
    x: start.x + Math.cos(snappedRad) * length,
    y: start.y + Math.sin(snappedRad) * length,
  };
  const normalized = ((snappedStep % 180) + 180) % 180;
  let kind: SnapKind = 'angle';
  if (normalized < ANGLE_SNAP_TOLERANCE_DEG || normalized > 180 - ANGLE_SNAP_TOLERANCE_DEG) {
    kind = 'horizontal';
    point.y = start.y;
  } else if (Math.abs(normalized - 90) < ANGLE_SNAP_TOLERANCE_DEG) {
    kind = 'vertical';
    point.x = start.x;
  }
  return { point, kind };
}

/**
 * Snap a cursor point in world coordinates.
 * Priority: existing wall endpoints > angle/ortho relative to the pending
 * wall start > raw position.
 */
export function snapPoint(
  raw: Vec2,
  walls: Wall[],
  toleranceM: number,
  pendingStart: Vec2 | null,
): SnapResult {
  const endpoint = nearestEndpoint(raw, walls, toleranceM);
  if (endpoint) {
    return { point: { ...endpoint.point }, kind: 'endpoint', sourceWallId: endpoint.wallId };
  }
  if (pendingStart) {
    const snapped = snapAngleFromStart(pendingStart, raw);
    return { point: snapped.point, kind: snapped.kind };
  }
  return { point: { ...raw }, kind: null };
}

/** Pixels-to-world snap tolerance: 12 screen px, clamped to a sane world range. */
export function snapToleranceForScale(scalePxPerM: number): number {
  if (!Number.isFinite(scalePxPerM) || scalePxPerM <= 0) return 0.2;
  return Math.min(0.5, Math.max(0.05, 12 / scalePxPerM));
}

export function formatLengthM(lengthM: number): string {
  if (!Number.isFinite(lengthM)) return '—';
  return `${lengthM.toFixed(2)} m`;
}

export function formatAreaM2(areaM2: number): string {
  if (!Number.isFinite(areaM2)) return '—';
  return `${areaM2.toFixed(1)} m²`;
}

/** Absolute point at fractional position t along a wall. */
export function wallPointAt(wall: Pick<Wall, 'start' | 'end'>, t: number): Vec2 {
  const c = clampT(t);
  return {
    x: wall.start.x + (wall.end.x - wall.start.x) * c,
    y: wall.start.y + (wall.end.y - wall.start.y) * c,
  };
}

/** Unit tangent of a wall (zero vector for degenerate walls). */
export function wallTangent(wall: Pick<Wall, 'start' | 'end'>): Vec2 {
  const dx = wall.end.x - wall.start.x;
  const dy = wall.end.y - wall.start.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-9) return { x: 0, y: 0 };
  return { x: dx / len, y: dy / len };
}

/** Unit normal of a wall (tangent rotated +90°). */
export function wallNormal(wall: Pick<Wall, 'start' | 'end'>): Vec2 {
  const t = wallTangent(wall);
  return { x: -t.y, y: t.x };
}

/**
 * Project a world point onto a wall segment.
 * Returns the fractional position t (0..1) and the distance in meters.
 */
export function projectPointToWall(
  point: Vec2,
  wall: Pick<Wall, 'start' | 'end'>,
): { t: number; distance: number } {
  const dx = wall.end.x - wall.start.x;
  const dy = wall.end.y - wall.start.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-12) return { t: 0, distance: distance(point, wall.start) };
  const rawT = ((point.x - wall.start.x) * dx + (point.y - wall.start.y) * dy) / lenSq;
  const t = clampT(rawT);
  const closest = { x: wall.start.x + t * dx, y: wall.start.y + t * dy };
  return { t, distance: distance(point, closest) };
}

/**
 * Find the nearest wall to a world point within a tolerance.
 * Returns the wall plus the fractional hit position, or null.
 */
export function nearestWall(
  point: Vec2,
  walls: Wall[],
  toleranceM: number,
): { wall: Wall; t: number; distance: number } | null {
  let best: { wall: Wall; t: number; distance: number } | null = null;
  for (const wall of walls) {
    const projected = projectPointToWall(point, wall);
    if (projected.distance <= toleranceM && (!best || projected.distance < best.distance)) {
      best = { wall, t: projected.t, distance: projected.distance };
    }
  }
  return best;
}

/**
 * Absolute endpoints of an opening (door/window) of a given width centered
 * at fractional position t. The opening is clamped so it always fits on the
 * wall: very wide openings on short walls shrink to the wall length.
 */
export function openingEndpoints(
  wall: Pick<Wall, 'start' | 'end'>,
  centerT: number,
  widthM: number,
): { p1: Vec2; p2: Vec2; width: number } {
  const dx = wall.end.x - wall.start.x;
  const dy = wall.end.y - wall.start.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-9) {
    return { p1: { ...wall.start }, p2: { ...wall.end }, width: 0 };
  }
  const width = Math.min(Math.max(widthM, 0), len);
  const halfT = width / 2 / len;
  // Clamp the center so the opening never overhangs the wall ends.
  const t = Math.min(1 - halfT, Math.max(halfT, clampT(centerT)));
  return {
    p1: { x: wall.start.x + (t - halfT) * dx, y: wall.start.y + (t - halfT) * dy },
    p2: { x: wall.start.x + (t + halfT) * dx, y: wall.start.y + (t + halfT) * dy },
    width,
  };
}

/**
 * Visible wall segments with door/window gaps subtracted.
 *
 * Render-only helper: the model (rooms, validation, 3D) keeps working with
 * full walls, but the canvas draws the wall body as segments so openings
 * read as real gaps instead of paint over a continuous wall. Intervals reuse
 * `openingEndpoints`, so gaps always match the rendered door/window
 * overlays — including the clamped fit on short walls.
 */
export function wallGapSegments(
  wall: Pick<Wall, 'start' | 'end'>,
  openings: Array<{ centerT: number; width: number }>,
): Array<{ start: Vec2; end: Vec2 }> {
  const at = (t: number): Vec2 => wallPointAt(wall, t);
  if (openings.length === 0) return [{ start: at(0), end: at(1) }];
  const intervals: Array<{ from: number; to: number }> = [];
  for (const opening of openings) {
    const { p1, p2 } = openingEndpoints(wall, opening.centerT, opening.width);
    const t1 = projectPointToWall(p1, wall).t;
    const t2 = projectPointToWall(p2, wall).t;
    const from = Math.min(t1, t2);
    const to = Math.max(t1, t2);
    if (to - from > 1e-9) intervals.push({ from, to });
  }
  intervals.sort((a, b) => a.from - b.from);
  const merged: Array<{ from: number; to: number }> = [];
  for (const interval of intervals) {
    const last = merged[merged.length - 1];
    if (last && interval.from <= last.to + 1e-9) {
      last.to = Math.max(last.to, interval.to);
    } else {
      merged.push({ ...interval });
    }
  }
  const segments: Array<{ start: Vec2; end: Vec2 }> = [];
  let cursor = 0;
  for (const gap of merged) {
    if (gap.from > cursor + 1e-9) segments.push({ start: at(cursor), end: at(gap.from) });
    cursor = Math.max(cursor, gap.to);
  }
  if (cursor < 1 - 1e-9) segments.push({ start: at(cursor), end: at(1) });
  return segments;
}

/**
 * Clamp an opening center so an opening of the given width fits on the wall.
 * Openings wider than the wall collapse to the wall center.
 */
export function clampOpeningT(
  wall: Pick<Wall, 'start' | 'end'>,
  centerT: number,
  widthM: number,
): number {
  const len = distance(wall.start, wall.end);
  if (len < 1e-9) return 0.5;
  const halfT = Math.min(widthM, len) / 2 / len;
  if (halfT >= 0.5) return 0.5;
  return Math.min(1 - halfT, Math.max(halfT, clampT(centerT)));
}

/** Shoelace area of an ordered polygon (absolute value, m²). */
export function polygonArea(polygon: Vec2[]): number {
  if (polygon.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

export function polygonCentroid(polygon: Vec2[]): Vec2 {
  if (polygon.length === 0) return { x: 0, y: 0 };
  let cx = 0;
  let cy = 0;
  for (const p of polygon) {
    cx += p.x;
    cy += p.y;
  }
  return { x: cx / polygon.length, y: cy / polygon.length };
}

/** Ray-cast point-in-polygon test (works for simple polygons). */
export function pointInPolygon(point: Vec2, polygon: Vec2[]): boolean {
  if (polygon.length < 3) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    if (a.y === b.y) continue;
    const intersects = a.y > point.y !== b.y > point.y;
    if (!intersects) continue;
    const xAt = a.x + ((point.y - a.y) * (b.x - a.x)) / (b.y - a.y);
    if (point.x < xAt) inside = !inside;
  }
  return inside;
}

/**
 * Strict containment: inside the polygon and not on its boundary.
 * Used for room minimality so rooms sharing a wall edge do not count as
 * containing each other's centroids.
 */
export function pointStrictlyInPolygon(point: Vec2, polygon: Vec2[], eps = 1e-6): boolean {
  if (!pointInPolygon(point, polygon)) return false;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    if (distancePointToSegment(point, a, b) <= eps) return false;
  }
  return true;
}

/**
 * Move one endpoint of a wall to a new position. Returns the updated wall,
 * or null when the result would be a degenerate wall.
 */
export function setWallEndpoint(
  wall: Wall,
  which: 'start' | 'end',
  point: Vec2,
): Wall | null {
  const next: Wall = {
    ...wall,
    start: which === 'start' ? { ...point } : { ...wall.start },
    end: which === 'end' ? { ...point } : { ...wall.end },
  };
  if (distance(next.start, next.end) < MIN_WALL_LENGTH_M) return null;
  return next;
}

/**
 * Resize a wall to an exact length, keeping the start fixed and moving the
 * end along the current direction. Returns null for invalid lengths or
 * degenerate walls.
 */
export function setWallLength(wall: Wall, lengthM: number): Wall | null {
  if (!Number.isFinite(lengthM) || lengthM < MIN_WALL_LENGTH_M) return null;
  const tangent = wallTangent(wall);
  if (Math.hypot(tangent.x, tangent.y) < 1e-9) return null;
  return {
    ...wall,
    end: {
      x: wall.start.x + tangent.x * lengthM,
      y: wall.start.y + tangent.y * lengthM,
    },
  };
}

/** Translate a wall by a delta vector. */
export function translateWall(wall: Wall, delta: Vec2): Wall {
  return {
    ...wall,
    start: { x: wall.start.x + delta.x, y: wall.start.y + delta.y },
    end: { x: wall.end.x + delta.x, y: wall.end.y + delta.y },
  };
}

/** Parse a user-typed dimension ("4.25", "4,25 m") into meters, or null. */
export function parseLengthM(input: string): number | null {
  const normalized = input.trim().toLowerCase().replace(',', '.').replace(/m²|m\b/g, '').trim();
  if (!/^\d*\.?\d+$/.test(normalized)) return null;
  const value = Number(normalized);
  if (!Number.isFinite(value) || value < 0) return null;
  return value;
}
