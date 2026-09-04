import type { RasterPredictResponse } from './raster2seq.js';

/**
 * Derived floor-boundary geometry for the Vista 360 MVP.
 *
 * The raw Raster2Seq analysis is stored verbatim in the database and is never
 * modified here. This module produces a *separate*, minimal representation of
 * the floor-to-wall boundary — a single closed polygon in normalized
 * coordinates (0..1) — that the 360 viewer projects as the phase-1 overlay.
 *
 * Normalized coordinates keep the geometry resolution-independent: the camera
 * position is stored normalized too, so both stay valid at any render size.
 * Later phases can add walls/doors/windows as further derived layers without
 * touching the raw analysis.
 *
 * Phase 1 keeps the extraction deliberately simple: the floor boundary is the
 * convex hull of all interior room polygon vertices (the Raster2Seq room
 * polygons already mark the floor regions; their outer hull approximates the
 * wall footprint). AI matching / automatic alignment is explicitly out of
 * scope for this MVP.
 */

export type NormalizedPolygon = number[][];

const OUTDOOR_CATEGORY_ID = 0;

/** True when a refined room type denotes exterior/outside space. */
function isOutdoorRoomType(roomType: string): boolean {
  return /outdoor|outside|exterior/i.test(roomType ?? '');
}

/** Collects finite `[x, y]` vertices from the analysis, excluding outdoor spaces. */
function collectInteriorVertices(analysis: RasterPredictResponse): number[][] {
  const vertices: number[][] = [];
  const refined = Array.isArray(analysis.refined_spaces) ? analysis.refined_spaces : [];
  if (refined.length > 0) {
    for (const space of refined) {
      if (isOutdoorRoomType(space.room_type ?? '')) continue;
      appendPolygonVertices(vertices, space.polygon);
    }
    return vertices;
  }
  const draft = Array.isArray(analysis.spaces) ? analysis.spaces : [];
  for (const space of draft) {
    if (space.category_id === OUTDOOR_CATEGORY_ID) continue;
    appendPolygonVertices(vertices, space.polygon);
  }
  return vertices;
}

function appendPolygonVertices(vertices: number[][], polygon: number[][] | undefined): void {
  if (!Array.isArray(polygon)) return;
  for (const point of polygon) {
    if (!Array.isArray(point) || point.length < 2) continue;
    const x = Number(point[0]);
    const y = Number(point[1]);
    if (Number.isFinite(x) && Number.isFinite(y)) vertices.push([x, y]);
  }
}

/**
 * Extracts the floor-boundary polygon from a raw Raster2Seq analysis, or
 * `null` when there is not enough geometry. The result is a closed polygon of
 * `[x, y]` pairs normalized into the unit square.
 */
export function floorBoundaryFromAnalysis(
  analysis: RasterPredictResponse,
): NormalizedPolygon | null {
  const vertices = collectInteriorVertices(analysis);
  if (vertices.length < 3) return null;
  const hull = convexHull(vertices);
  if (!hull || hull.length < 3) return null;
  return normalizeToUnitSquare(hull);
}

/** Normalizes a polygon into the [0,1]×[0,1] unit square (its own bounding box). */
function normalizeToUnitSquare(polygon: number[][]): number[][] {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of polygon) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const width = maxX - minX || 1;
  const height = maxY - minY || 1;
  return polygon.map(([x, y]) => [(x - minX) / width, (y - minY) / height]);
}

/** Convex hull (Andrew's monotone chain) of the given points. */
export function convexHull(points: number[][]): number[][] | null {
  if (points.length < 3) return null;
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: number[], a: number[], b: number[]) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

  const lower: number[][] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
      lower.pop();
    }
    lower.push(p);
  }

  const upper: number[][] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
      upper.pop();
    }
    upper.push(p);
  }

  lower.pop();
  upper.pop();
  const hull = lower.concat(upper);
  return hull.length >= 3 ? hull : null;
}
