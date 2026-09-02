/**
 * Minimal dependency-free computational-geometry helpers for the geometry
 * primitives POC. All angles are in degrees; canonical run angles are in
 * [0, 180). Image coordinates are y-down.
 */

import type { BoundingBox, Point } from './types';

export function distance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** Canonical angle of the segment a→b in degrees, mapped into [0, 180). */
export function segmentAngleDeg(a: Point, b: Point): number {
  let angle = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
  if (angle < 0) angle += 180;
  if (angle >= 180) angle -= 180;
  return angle;
}

/**
 * Smallest angular distance between two canonical angles in [0, 180).
 * Result is in [0, 90].
 */
export function angleDiffDeg(a: number, b: number): number {
  const d = Math.abs(a - b) % 180;
  return Math.min(d, 180 - d);
}

export function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

export function boundingBox(points: Point[]): BoundingBox {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

/** Unit direction of a canonical angle in degrees. */
export function directionOf(angleDeg: number): Point {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: Math.cos(rad), y: Math.sin(rad) };
}

/**
 * Perpendicular distance of point `p` from the infinite line through `q`
 * with the given canonical angle.
 */
export function perpendicularDistance(p: Point, q: Point, angleDeg: number): number {
  const rad = (angleDeg * Math.PI) / 180;
  const nx = -Math.sin(rad);
  const ny = Math.cos(rad);
  return Math.abs((p.x - q.x) * nx + (p.y - q.y) * ny);
}

/** Projection of point `p` onto the infinite line through `q` at `angleDeg`. */
export function projectOnLine(p: Point, q: Point, angleDeg: number): Point {
  const d = directionOf(angleDeg);
  const t = (p.x - q.x) * d.x + (p.y - q.y) * d.y;
  return { x: q.x + t * d.x, y: q.y + t * d.y };
}

/**
 * Signed projection coordinate `t` of `p` onto the line through `q` at
 * `angleDeg` — used for overlap computations.
 */
export function axisCoordinate(p: Point, q: Point, angleDeg: number): number {
  const d = directionOf(angleDeg);
  return (p.x - q.x) * d.x + (p.y - q.y) * d.y;
}

/**
 * Overlap length between two segments measured along their shared direction.
 * `angleDeg` must be within the parallel tolerance of both runs.
 * Returns 0 when the projected intervals do not overlap.
 */
export function projectedOverlap(
  aFrom: Point,
  aTo: Point,
  bFrom: Point,
  bTo: Point,
  angleDeg: number,
): number {
  const q = aFrom;
  const a0 = axisCoordinate(aFrom, q, angleDeg);
  const a1 = axisCoordinate(aTo, q, angleDeg);
  const b0 = axisCoordinate(bFrom, q, angleDeg);
  const b1 = axisCoordinate(bTo, q, angleDeg);
  const aMin = Math.min(a0, a1);
  const aMax = Math.max(a0, a1);
  const bMin = Math.min(b0, b1);
  const bMax = Math.max(b0, b1);
  return Math.max(0, Math.min(aMax, bMax) - Math.max(aMin, bMin));
}

/** Smallest distance between any endpoint of segment A and any endpoint of segment B. */
export function minEndpointDistance(aFrom: Point, aTo: Point, bFrom: Point, bTo: Point): number {
  return Math.min(
    distance(aFrom, bFrom),
    distance(aFrom, bTo),
    distance(aTo, bFrom),
    distance(aTo, bTo),
  );
}

/**
 * Proper segment-segment intersection. Returns the intersection point or
 * null when the segments do not intersect (collinear/parallel included).
 */
export function segmentIntersection(
  aFrom: Point,
  aTo: Point,
  bFrom: Point,
  bTo: Point,
): Point | null {
  const dax = aTo.x - aFrom.x;
  const day = aTo.y - aFrom.y;
  const dbx = bTo.x - bFrom.x;
  const dby = bTo.y - bFrom.y;
  const denom = dax * dby - day * dbx;
  if (Math.abs(denom) < 1e-9) return null;
  const dx = bFrom.x - aFrom.x;
  const dy = bFrom.y - aFrom.y;
  const t = (dx * dby - dy * dbx) / denom;
  const s = (dx * day - dy * dax) / denom;
  if (t < 0 || t > 1 || s < 0 || s > 1) return null;
  return { x: aFrom.x + t * dax, y: aFrom.y + t * day };
}

/** Deduplicates consecutive points closer than `minDist` (polygon-clean). */
export function cleanPolygon(points: Point[], minDist: number): Point[] {
  const out: Point[] = [];
  for (const p of points) {
    const prev = out[out.length - 1];
    if (!prev || distance(prev, p) >= minDist) out.push(p);
  }
  const first = out[0];
  const last = out[out.length - 1];
  if (first && last && distance(first, last) < minDist) out.pop();
  return out;
}

/**
 * Ramer–Douglas–Peucker simplification of an OPEN chain with a fixed first
 * point. Keeps the raw-vertex indices of surviving points.
 */
export function simplifyChain(
  points: Point[],
  indices: number[],
  epsilon: number,
): { points: Point[]; indices: number[] } {
  if (points.length <= 2) return { points: points.slice(), indices: indices.slice() };
  const kept = new Uint8Array(points.length);
  kept[0] = 1;
  kept[points.length - 1] = 1;

  const stack: Array<[number, number]> = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [start, end] = stack.pop()!;
    let maxDist = 0;
    let maxIdx = -1;
    for (let i = start + 1; i < end; i++) {
      const d = pointToSegmentDistance(points[i], points[start], points[end]);
      if (d > maxDist) {
        maxDist = d;
        maxIdx = i;
      }
    }
    if (maxDist > epsilon && maxIdx > 0) {
      kept[maxIdx] = 1;
      stack.push([start, maxIdx], [maxIdx, end]);
    }
  }

  const outPoints: Point[] = [];
  const outIndices: number[] = [];
  for (let i = 0; i < points.length; i++) {
    if (kept[i]) {
      outPoints.push(points[i]);
      outIndices.push(indices[i]);
    }
  }
  return { points: outPoints, indices: outIndices };
}

function pointToSegmentDistance(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return distance(p, a);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return distance(p, { x: a.x + t * dx, y: a.y + t * dy });
}

/** Index of the point farthest from the polygon centroid (RDP anchor choice). */
export function indexFarthestFromCentroid(points: Point[]): number {
  let cx = 0;
  let cy = 0;
  for (const p of points) {
    cx += p.x;
    cy += p.y;
  }
  cx /= points.length;
  cy /= points.length;
  let best = 0;
  let bestDist = -1;
  for (let i = 0; i < points.length; i++) {
    const d = distance(points[i], { x: cx, y: cy });
    if (d > bestDist) {
      bestDist = d;
      best = i;
    }
  }
  return best;
}

/** Rotates a polygon so that `startIndex` becomes index 0. */
export function rotatePolygon<T>(points: T[], startIndex: number): T[] {
  if (startIndex === 0) return points;
  return points.slice(startIndex).concat(points.slice(0, startIndex));
}