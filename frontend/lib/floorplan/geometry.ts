/**
 * Pure geometry + snapping helpers for the Phase 1 wall editor.
 * All units are meters (world coordinates). No React, no DOM.
 */
import { MIN_WALL_LENGTH_M, type Vec2, type Wall } from './model';

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
