/**
 * Raster2Seq import geometry: letterbox inversion + conservative wall cleanup.
 *
 * The Raster2Seq model predicts polygons in its 256x256 padded model-input
 * coordinate space. The model input is produced by the upstream
 * `ResizeAndPad` transform (`raster2seq-local/raster2seq/datasets/transforms.py`):
 *
 *   scale    = min(target / h, target / w)          (aspect-preserving)
 *   new_h    = int(h * scale), new_w = int(w * scale) (truncation!)
 *   top      = (target - new_h) // 2                 (extra pixel -> bottom)
 *   left     = (target - new_w) // 2                 (extra pixel -> right)
 *
 * This module inverts that transform exactly (same float64 arithmetic, same
 * truncation, same asymmetric padding) so model coordinates map back to
 * original-image pixels before Vista applies its display/editing scale.
 *
 * The wall cleanup below is intentionally conservative: it only removes
 * obvious prediction noise (exact duplicates, collinear sub-segments, ~1px
 * corner jitter, sub-2-degree skew). When uncertain it preserves geometry
 * rather than merging legitimate architecture.
 *
 * Pure functions only. No DOM, no React. All units documented per function.
 */

import { MIN_WALL_LENGTH_M, type Vec2, type Wall } from './model';

/** Edge length of the square Raster2Seq model input. */
export const RASTER2SEQ_IMAGE_SIZE = 256;

/**
 * Exact inversion parameters of one `ResizeAndPad` application.
 * `scale` maps original-image pixels to resized (pre-pad) pixels.
 */
export type LetterboxTransform = {
  scale: number;
  resizedW: number;
  resizedH: number;
  padLeft: number;
  padTop: number;
  targetSize: number;
};

/**
 * Reproduce the upstream `ResizeAndPad` mathematics for a source image of
 * `sourceWidth` x `sourceHeight` pixels. Returns null for invalid dimensions.
 * Python `int()` truncates toward zero; dimensions are positive so
 * `Math.floor` is identical (both runtimes use float64 arithmetic).
 */
export function letterboxTransformFor(
  sourceWidth: number,
  sourceHeight: number,
  targetSize: number = RASTER2SEQ_IMAGE_SIZE,
): LetterboxTransform | null {
  if (
    !Number.isFinite(sourceWidth) ||
    !Number.isFinite(sourceHeight) ||
    !Number.isFinite(targetSize) ||
    sourceWidth <= 0 ||
    sourceHeight <= 0 ||
    targetSize <= 0
  ) {
    return null;
  }
  const scale = Math.min(targetSize / sourceHeight, targetSize / sourceWidth);
  const resizedW = Math.floor(sourceWidth * scale);
  const resizedH = Math.floor(sourceHeight * scale);
  const padLeft = Math.floor((targetSize - resizedW) / 2);
  const padTop = Math.floor((targetSize - resizedH) / 2);
  return { scale, resizedW, resizedH, padLeft, padTop, targetSize };
}

/**
 * Model-input coordinate (256x256 padded space) -> original-image pixel.
 * Conceptually: remove padding, then divide by the resize scale.
 */
export function modelToSourcePoint(point: Vec2, transform: LetterboxTransform): Vec2 {
  return {
    x: (point.x - transform.padLeft) / transform.scale,
    y: (point.y - transform.padTop) / transform.scale,
  };
}

/** Original-image pixel -> model-input coordinate (forward direction). */
export function sourceToModelPoint(point: Vec2, transform: LetterboxTransform): Vec2 {
  return {
    x: point.x * transform.scale + transform.padLeft,
    y: point.y * transform.scale + transform.padTop,
  };
}

/** Deviation of at most this from 0/90/180/270 degrees snaps to orthogonal. */
export const RASTER2SEQ_ORTHO_TOLERANCE_DEG = 2;
/**
 * Endpoints within this distance (meters) are treated as one intended corner.
 * ~1 model pixel at the 0.05 m/px display scale; 2px+ gaps are preserved.
 */
export const RASTER2SEQ_ENDPOINT_CLUSTER_M = 0.06;
/** Walls on parallel lines within this distance may share one line. */
export const RASTER2SEQ_COLLINEAR_PERP_M = 0.06;
/** Collinear segments with at most this gap along the line merge into one. */
export const RASTER2SEQ_COLLINEAR_GAP_M = 0.06;
/** Direction difference within this still counts as the same line. */
export const RASTER2SEQ_COLLINEAR_ANGLE_DEG = 1;

export type CleanupDiagnostics = {
  duplicatesRemoved: number;
  wallsOrthogonalized: number;
  endpointClustersMerged: number;
  collinearMerged: number;
  tinyWallsDropped: number;
};

function roundMm(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function wallLengthM(wall: Pick<Wall, 'start' | 'end'>): number {
  return Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y);
}

function sortWalls<T extends Pick<Wall, 'start' | 'end'>>(walls: T[]): T[] {
  return [...walls].sort((w1, w2) => {
    const a1 = Math.min(w1.start.x, w1.end.x);
    const a2 = Math.min(w2.start.x, w2.end.x);
    if (a1 !== a2) return a1 - a2;
    const b1 = Math.min(w1.start.y, w1.end.y);
    const b2 = Math.min(w2.start.y, w2.end.y);
    if (b1 !== b2) return b1 - b2;
    const c1 = Math.max(w1.start.x, w1.end.x);
    const c2 = Math.max(w2.start.x, w2.end.x);
    if (c1 !== c2) return c1 - c2;
    return Math.max(w1.start.y, w1.end.y) - Math.max(w2.start.y, w2.end.y);
  });
}

function exactKey(wall: Pick<Wall, 'start' | 'end'>): string {
  const ka = `${wall.start.x.toFixed(3)}|${wall.start.y.toFixed(3)}`;
  const kb = `${wall.end.x.toFixed(3)}|${wall.end.y.toFixed(3)}`;
  return ka < kb ? `${ka}~${kb}` : `${kb}~${ka}`;
}

/**
 * Remove exact duplicate walls (either endpoint order). Keeps the first wall
 * of each duplicate set in input order.
 */
export function dedupeWalls<T extends Wall>(walls: T[]): { walls: T[]; removed: number } {
  const seen = new Set<string>();
  const kept: T[] = [];
  for (const wall of walls) {
    const key = exactKey(wall);
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push(wall);
  }
  return { walls: kept, removed: walls.length - kept.length };
}

/**
 * Snap walls that are very close to horizontal/vertical to exactly
 * horizontal/vertical (mid-line position, so the shift is minimal).
 * Meaningful diagonals (>= tolerance) are preserved untouched.
 */
export function orthogonalizeWalls<T extends Wall>(
  walls: T[],
  toleranceDeg: number = RASTER2SEQ_ORTHO_TOLERANCE_DEG,
): { walls: T[]; orthogonalized: number } {
  let orthogonalized = 0;
  const out = walls.map((wall) => {
    const dx = wall.end.x - wall.start.x;
    const dy = wall.end.y - wall.start.y;
    if (Math.hypot(dx, dy) < 1e-9) return wall;
    const direction = ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 180;
    const devHorizontal = Math.min(direction, 180 - direction);
    const devVertical = Math.abs(direction - 90);
    if (devHorizontal <= toleranceDeg) {
      const y = roundMm((wall.start.y + wall.end.y) / 2);
      if (wall.start.y === y && wall.end.y === y) return wall;
      orthogonalized += 1;
      return { ...wall, start: { ...wall.start, y }, end: { ...wall.end, y } };
    }
    if (devVertical <= toleranceDeg) {
      const x = roundMm((wall.start.x + wall.end.x) / 2);
      if (wall.start.x === x && wall.end.x === x) return wall;
      orthogonalized += 1;
      return { ...wall, start: { ...wall.start, x }, end: { ...wall.end, x } };
    }
    return wall;
  });
  return { walls: out, orthogonalized };
}

/**
 * Endpoints of near-parallel walls are never clustered: parallel jitter
 * (duplicate observations of one shared edge) belongs to the collinear
 * merge, and distinct parallel corners (steps, double walls) must survive.
 */
export const RASTER2SEQ_PARALLEL_EXCLUSION_DEG = 2;

function wallAngleBetween(
  a: Pick<Wall, 'start' | 'end'>,
  b: Pick<Wall, 'start' | 'end'>,
): number {
  const dxa = a.end.x - a.start.x;
  const dya = a.end.y - a.start.y;
  const dxb = b.end.x - b.start.x;
  const dyb = b.end.y - b.start.y;
  const la = Math.hypot(dxa, dya);
  const lb = Math.hypot(dxb, dyb);
  if (la < 1e-9 || lb < 1e-9) return 0;
  let angle = Math.acos(
    Math.min(1, Math.max(-1, (dxa * dxb + dya * dyb) / (la * lb))),
  );
  if (angle > Math.PI / 2) angle = Math.PI - angle;
  return (angle * 180) / Math.PI;
}

/**
 * Cluster nearby endpoints so connected walls share exact coordinates.
 * Conservative: endpoints of near-parallel walls are excluded (see above),
 * and a cluster whose diameter exceeds twice the tolerance is left
 * untouched, so staircase runs of jittered joints are preserved instead of
 * being collapsed into a single point.
 */
export function clusterWallEndpoints<T extends Wall>(
  walls: T[],
  toleranceM: number = RASTER2SEQ_ENDPOINT_CLUSTER_M,
): { walls: T[]; clustersMerged: number } {
  const points: Vec2[] = [];
  const owners: number[] = [];
  walls.forEach((wall, wallIndex) => {
    points.push(wall.start, wall.end);
    owners.push(wallIndex, wallIndex);
  });
  if (points.length === 0) return { walls: [...walls], clustersMerged: 0 };

  const parent = points.map((_, index) => index);
  const find = (i: number): number => {
    let root = i;
    while (parent[root] !== root) root = parent[root];
    parent[i] = root;
    return root;
  };
  const union = (a: number, b: number) => {
    parent[find(a)] = find(b);
  };
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      if (Math.hypot(points[i].x - points[j].x, points[i].y - points[j].y) > toleranceM) continue;
      // Same-wall endpoints collapse tiny walls (dropped later); endpoints
      // of distinct near-parallel walls must not pull each other sideways.
      if (
        owners[i] !== owners[j] &&
        wallAngleBetween(walls[owners[i]], walls[owners[j]]) <= RASTER2SEQ_PARALLEL_EXCLUSION_DEG
      ) {
        continue;
      }
      union(i, j);
    }
  }
  const groups = new Map<number, number[]>();
  for (let i = 0; i < points.length; i++) {
    const root = find(i);
    const group = groups.get(root) ?? [];
    group.push(i);
    groups.set(root, group);
  }
  const snapped = points.map((p) => ({ ...p }));
  let clustersMerged = 0;
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    let diameter = 0;
    for (let a = 0; a < group.length; a++) {
      for (let b = a + 1; b < group.length; b++) {
        diameter = Math.max(
          diameter,
          Math.hypot(points[group[a]].x - points[group[b]].x, points[group[a]].y - points[group[b]].y),
        );
      }
    }
    if (diameter > toleranceM * 2) continue;
    // Anchor to the lexicographically smallest OBSERVED coordinate: no
    // invented midpoints (they fall off the prediction grid and destabilize
    // room detection), and the choice is independent of input order.
    const anchor = group
      .map((index) => points[index])
      .sort((p, q) => (p.x !== q.x ? p.x - q.x : p.y - q.y))[0];
    const fixed = { x: roundMm(anchor.x), y: roundMm(anchor.y) };
    for (const index of group) snapped[index] = { ...fixed };
    clustersMerged += 1;
  }
  const out = walls.map((wall, wi) => ({
    ...wall,
    start: snapped[wi * 2],
    end: snapped[wi * 2 + 1],
  }));
  return { walls: out, clustersMerged };
}

/**
 * Merge collinear overlapping (or nearly touching) wall segments into single
 * walls. Legitimate parallel walls (line offset above the tolerance) are
 * preserved. Merged walls reuse the longest contributor's line and id for
 * traceability.
 */
export function mergeCollinearWalls<T extends Wall>(
  walls: T[],
  perpTolM: number = RASTER2SEQ_COLLINEAR_PERP_M,
  gapTolM: number = RASTER2SEQ_COLLINEAR_GAP_M,
  angleTolDeg: number = RASTER2SEQ_COLLINEAR_ANGLE_DEG,
): { walls: T[]; merged: number } {
  if (walls.length < 2) return { walls: [...walls], merged: 0 };
  const dirs = walls.map((wall) => {
    const dx = wall.end.x - wall.start.x;
    const dy = wall.end.y - wall.start.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-9) return { ux: 0, uy: 0, offset: 0 };
    const ux = dx / len;
    const uy = dy / len;
    return { ux, uy, offset: -uy * wall.start.x + ux * wall.start.y };
  });
  const parent = walls.map((_, index) => index);
  const find = (i: number): number => {
    let root = i;
    while (parent[root] !== root) root = parent[root];
    parent[i] = root;
    return root;
  };
  const angleTol = (angleTolDeg * Math.PI) / 180;
  for (let i = 0; i < walls.length; i++) {
    if (wallLengthM(walls[i]) < 1e-9) continue;
    for (let j = i + 1; j < walls.length; j++) {
      if (wallLengthM(walls[j]) < 1e-9) continue;
      const a = dirs[i];
      const b = dirs[j];
      let angle = Math.acos(Math.min(1, Math.max(-1, a.ux * b.ux + a.uy * b.uy)));
      if (angle > Math.PI / 2) angle = Math.PI - angle;
      if (angle > angleTol) continue;
      // Offsets are stored against each wall's own direction, so walls on
      // the same line with opposite directions report negated offsets.
      const lineGap = Math.min(Math.abs(a.offset - b.offset), Math.abs(a.offset + b.offset));
      if (lineGap > perpTolM) continue;
      parent[find(i)] = find(j);
    }
  }
  const groups = new Map<number, number[]>();
  for (let i = 0; i < walls.length; i++) {
    const root = find(i);
    const group = groups.get(root) ?? [];
    group.push(i);
    groups.set(root, group);
  }
  const out: T[] = [];
  let merged = 0;
  for (const members of groups.values()) {
    if (members.length === 1) {
      out.push(walls[members[0]]);
      continue;
    }
    // Canonical line: reuse the longest contributor's line exactly (order-
    // independent tie-breaks). Averaging would invent fractional line
    // positions off the prediction grid and destabilize room detection;
    // snapping the shorter segments onto the dominant line never does.
    const ordered = [...members].sort((a, b) => {
      const diff = wallLengthM(walls[b]) - wallLengthM(walls[a]);
      if (diff !== 0) return diff;
      const ka = exactKey(walls[a]);
      const kb = exactKey(walls[b]);
      if (ka !== kb) return ka < kb ? -1 : 1;
      return walls[a].id < walls[b].id ? -1 : walls[a].id > walls[b].id ? 1 : 0;
    });
    const ref = dirs[ordered[0]];
    let ux = ref.ux;
    let uy = ref.uy;
    if (ux < 0 || (ux === 0 && uy < 0)) {
      ux = -ux;
      uy = -uy;
    }
    const refSign = ref.ux * ux + ref.uy * uy >= 0 ? 1 : -1;
    const offset = ref.offset * refSign;
    // Normal form: normal n = (-uy, ux), point(t) = n * offset + d * t.
    const nx = -uy;
    const ny = ux;
    const intervals = members.map((index) => {
      const t0 = walls[index].start.x * ux + walls[index].start.y * uy;
      const t1 = walls[index].end.x * ux + walls[index].end.y * uy;
      return { from: Math.min(t0, t1), to: Math.max(t0, t1), index };
    });
    intervals.sort((a, b) => a.from - b.from);
    const mergedIntervals: Array<{ from: number; to: number; members: number[] }> = [];
    for (const interval of intervals) {
      const last = mergedIntervals[mergedIntervals.length - 1];
      if (last && interval.from <= last.to + gapTolM) {
        last.to = Math.max(last.to, interval.to);
        last.members.push(interval.index);
      } else {
        mergedIntervals.push({ from: interval.from, to: interval.to, members: [interval.index] });
      }
    }
    for (const interval of mergedIntervals) {
      // Order-independent contributor: longest wall, then geometry key,
      // then wall id (all order-independent comparisons).
      const first =
        walls[
          [...interval.members].sort((a, b) => {
            const diff = wallLengthM(walls[b]) - wallLengthM(walls[a]);
            if (diff !== 0) return diff;
            const ka = exactKey(walls[a]);
            const kb = exactKey(walls[b]);
            if (ka !== kb) return ka < kb ? -1 : 1;
            return walls[a].id < walls[b].id ? -1 : walls[a].id > walls[b].id ? 1 : 0;
          })[0]
        ];
      const p0 = { x: roundMm(nx * offset + ux * interval.from), y: roundMm(ny * offset + uy * interval.from) };
      const p1 = { x: roundMm(nx * offset + ux * interval.to), y: roundMm(ny * offset + uy * interval.to) };
      if (Math.hypot(p1.x - p0.x, p1.y - p0.y) < 1e-9) continue;
      out.push({ ...first, start: p0, end: p1 });
    }
    merged += members.length - mergedIntervals.length;
  }
  return { walls: sortWalls(out), merged };
}

/**
 * Full conservative cleanup pipeline for imported walls (meter space):
 * dedupe -> orthogonalize -> cluster endpoints -> merge collinear ->
 * cluster again -> dedupe -> drop tiny walls.
 */
export function cleanupImportedWalls<T extends Wall>(
  walls: T[],
  opts?: {
    orthoToleranceDeg?: number;
    endpointToleranceM?: number;
    collinearPerpM?: number;
    collinearGapM?: number;
  },
): { walls: T[]; diagnostics: CleanupDiagnostics } {
  const orthoTol = opts?.orthoToleranceDeg ?? RASTER2SEQ_ORTHO_TOLERANCE_DEG;
  const endTol = opts?.endpointToleranceM ?? RASTER2SEQ_ENDPOINT_CLUSTER_M;
  const perpTol = opts?.collinearPerpM ?? RASTER2SEQ_COLLINEAR_PERP_M;
  const gapTol = opts?.collinearGapM ?? RASTER2SEQ_COLLINEAR_GAP_M;

  const diagnostics: CleanupDiagnostics = {
    duplicatesRemoved: 0,
    wallsOrthogonalized: 0,
    endpointClustersMerged: 0,
    collinearMerged: 0,
    tinyWallsDropped: 0,
  };
  let working = [...walls];

  const deduped = dedupeWalls(working);
  working = deduped.walls;
  diagnostics.duplicatesRemoved += deduped.removed;

  const ortho = orthogonalizeWalls(working, orthoTol);
  working = ortho.walls;
  diagnostics.wallsOrthogonalized += ortho.orthogonalized;

  const clustered = clusterWallEndpoints(working, endTol);
  working = clustered.walls;
  diagnostics.endpointClustersMerged += clustered.clustersMerged;

  const merged = mergeCollinearWalls(working, perpTol, gapTol);
  working = merged.walls;
  diagnostics.collinearMerged += merged.merged;

  const reclustered = clusterWallEndpoints(working, endTol);
  working = reclustered.walls;
  diagnostics.endpointClustersMerged += reclustered.clustersMerged;

  const rededuped = dedupeWalls(working);
  working = rededuped.walls;
  diagnostics.duplicatesRemoved += rededuped.removed;

  const before = working.length;
  working = working.filter((wall) => wallLengthM(wall) >= MIN_WALL_LENGTH_M);
  diagnostics.tinyWallsDropped = before - working.length;

  return { walls: sortWalls(working), diagnostics };
}
