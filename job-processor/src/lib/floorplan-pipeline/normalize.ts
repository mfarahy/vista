/**
 * Wall preprocessing and normalization (Phase 4).
 *
 * The recognition model returns noisy wall *polygons*: thick ribbons that
 * trace wall outlines, sometimes L/U shaped, sometimes with notches at door
 * and window openings, plus stray small fragments. This module turns them
 * into clean centerline wall runs with an inferred thickness, extracts the
 * openings from their center lines, and associates openings with walls.
 */

import {
  cleanPolygon,
  distance,
  polygonArea,
  polygonBounds,
} from './geometry.js';
import type { Bounds, NormalizedFloorPlan, Opening, OpeningKind, Point, RecognitionGeometry, WallRun } from './types.js';

/** Smallest wall polygon (square pixels) that is kept. */
const MIN_POLYGON_AREA = 150;
/** Shortest wall run (pixels) that is kept. */
const MIN_WALL_LENGTH = 14;
/** Angle tolerance (degrees) when clustering polygon edges into sides. */
const SIDE_ANGLE_EPS = 5;
/** Perpendicular distance tolerance (pixels) when clustering edges into a side. */
const SIDE_OFFSET_EPS = 4;
/** Angle tolerance (degrees) when pairing parallel sides into a run. */
const PAIR_ANGLE_EPS = 3;
/** Thickness range (pixels) accepted for a paired wall run. */
const MIN_THICKNESS = 1.5;
const MAX_THICKNESS = 60;
/** Minimum t-overlap (pixels) for two sides to form a run. */
const MIN_OVERLAP = 6;
/** Offset tolerance (pixels) when merging collinear runs. */
const MERGE_OFFSET_EPS = 2.5;
/** Maximum gap (pixels) between collinear runs that are merged. */
const MERGE_GAP = 8;
/** Shortest opening center line (pixels) that is kept. */
const MIN_OPENING_WIDTH = 6;
/** Angle tolerance (degrees) when matching an opening to a wall run. */
const OPENING_ANGLE_EPS = 10;

interface Edge {
  a: Point;
  b: Point;
  angle: number;
  u: Point;
  mid: Point;
}

/** A cluster of collinear polygon edges; one side of a wall ribbon. */
interface Side {
  angle: number;
  u: Point;
  offset: number;
  tMin: number;
  tMax: number;
}

interface RawRun {
  angle: number;
  u: Point;
  offset: number;
  tMin: number;
  tMax: number;
  thickness: number;
  polygon: Point[];
}

function normalizeAngle(angle: number): number {
  let a = angle % Math.PI;
  if (a < 0) a += Math.PI;
  return a;
}

function edgeOf(a: Point, b: Point): Edge | null {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len < 1) return null;
  const u = { x: dx / len, y: dy / len };
  return { a, b, angle: normalizeAngle(Math.atan2(dy, dx)), u, mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
}

function angleDiff(a: number, b: number): number {
  const d = Math.abs(a - b) % Math.PI;
  return Math.min(d, Math.PI - d);
}

/** Perpendicular distance of point p from the line through q with direction u. */
function perpendicularDistance(p: Point, u: Point, q: Point): number {
  const dx = p.x - q.x;
  const dy = p.y - q.y;
  return Math.abs(u.x * dy - u.y * dx);
}

/** Signed offset of p along the normal (-uy, ux) of direction u. */
function signedOffset(p: Point, u: Point): number {
  return p.x * -u.y + p.y * u.x;
}

/** Point on the line given by direction u, normal offset and axis position t. */
function pointOnLine(t: number, u: Point, offset: number): Point {
  return { x: t * u.x + offset * -u.y, y: t * u.y + offset * u.x };
}

/** Clusters the edges of one wall polygon into collinear "sides". */
function clusterSides(polygon: Point[]): Side[] {
  const edges: Edge[] = [];
  for (let i = 0; i < polygon.length; i++) {
    const edge = edgeOf(polygon[i], polygon[(i + 1) % polygon.length]);
    if (edge) edges.push(edge);
  }
  const sides: Side[] = [];
  for (const edge of edges) {
    let target: Side | null = null;
    for (const side of sides) {
      if (angleDiff(side.angle, edge.angle) > (SIDE_ANGLE_EPS * Math.PI) / 180) continue;
      const linePoint = pointOnLine(side.tMin, side.u, side.offset);
      if (perpendicularDistance(edge.mid, side.u, linePoint) > SIDE_OFFSET_EPS) continue;
      target = side;
      break;
    }
    if (!target) {
      const u = canonicalDir({ ...edge.u });
      target = {
        angle: normalizeAngle(Math.atan2(u.y, u.x)),
        u,
        offset: signedOffset(edge.mid, u),
        tMin: Infinity,
        tMax: -Infinity,
      };
      sides.push(target);
    }
    for (const p of [edge.a, edge.b]) {
      const tAxis = p.x * target.u.x + p.y * target.u.y;
      if (tAxis < target.tMin) target.tMin = tAxis;
      if (tAxis > target.tMax) target.tMax = tAxis;
    }
  }
  return sides;
}

/** Canonical direction: u.y >= 0, and u.x >= 0 when horizontal. */
function canonicalDir(u: Point): Point {
  if (u.y < 0 || (u.y === 0 && u.x < 0)) return { x: -u.x, y: -u.y };
  return { ...u };
}

/**
 * Extracts wall runs (centerline + thickness) from one wall polygon by
 * pairing the parallel outline sides of the thick ribbon.
 */
function runsFromPolygon(polygon: Point[]): RawRun[] {
  const sides = clusterSides(polygon);
  const runs: RawRun[] = [];
  const n = sides.length;

  // For every side, remember its best pairing partner: the parallel side
  // with the smallest offset difference and a meaningful t-overlap.
  const best: Array<number | null> = new Array(n).fill(null);
  const bestScore = new Array<number>(n).fill(Infinity);
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = sides[i];
      const b = sides[j];
      if (angleDiff(a.angle, b.angle) > (PAIR_ANGLE_EPS * Math.PI) / 180) continue;
      const thickness = Math.abs(a.offset - b.offset);
      if (thickness < MIN_THICKNESS || thickness > MAX_THICKNESS) continue;
      const overlap = Math.min(a.tMax, b.tMax) - Math.max(a.tMin, b.tMin);
      if (overlap < MIN_OVERLAP) continue;
      const score = thickness - overlap / 1000; // smallest thickness wins, overlap breaks ties
      for (const [x, y] of [[i, j], [j, i]] as const) {
        if (score < bestScore[x]) {
          bestScore[x] = score;
          best[x] = y;
        }
      }
    }
  }

  const used = new Uint8Array(n);
  const pair = (i: number, j: number) => {
    const a = sides[i];
    const b = sides[j];
    const thickness = Math.abs(a.offset - b.offset);
    const tMin = Math.max(a.tMin, b.tMin);
    const tMax = Math.min(a.tMax, b.tMax);
    const u = canonicalDir({ ...a.u });
    runs.push({
      angle: normalizeAngle(Math.atan2(u.y, u.x)),
      u,
      offset: (a.offset + b.offset) / 2,
      tMin,
      tMax,
      thickness,
      polygon,
    });
    used[i] = 1;
    used[j] = 1;
  };

  // Mutual-nearest pairs first (robust against stubs pairing with the
  // wrong side of a wall), then remaining sides with a valid partner.
  for (let i = 0; i < n; i++) {
    const j = best[i];
    if (j === null || used[i] || used[j]) continue;
    if (best[j] !== i) continue;
    pair(i, j);
  }
  for (let i = 0; i < n; i++) {
    const j = best[i];
    if (j === null || used[i] || used[j]) continue;
    pair(i, j);
  }

  // Unpaired sides: keep them as thin runs so no wall outline is lost.
  const paired = runs.map((r) => r.thickness).sort((a, b) => a - b);
  const defaultThickness = paired.length > 0 ? paired[Math.floor(paired.length / 2)] : 3;
  for (let i = 0; i < n; i++) {
    if (used[i]) continue;
    const side = sides[i];
    if (side.tMax - side.tMin < MIN_WALL_LENGTH) continue;
    const u = canonicalDir({ ...side.u });
    runs.push({
      angle: normalizeAngle(Math.atan2(u.y, u.x)),
      u,
      offset: side.offset,
      tMin: side.tMin,
      tMax: side.tMax,
      thickness: defaultThickness,
      polygon,
    });
  }
  return runs;
}

/** Merges collinear, overlapping or near-touching runs into longer runs. */
function mergeRuns(runs: RawRun[]): RawRun[] {
  const sorted = runs.slice().sort((a, b) => a.angle - b.angle);
  const merged: RawRun[] = [];
  for (const run of sorted) {
    let target: RawRun | null = null;
    for (const candidate of merged) {
      if (angleDiff(candidate.angle, run.angle) > (PAIR_ANGLE_EPS * Math.PI) / 180) continue;
      if (Math.abs(candidate.offset - run.offset) > MERGE_OFFSET_EPS) continue;
      const gap = Math.max(candidate.tMin, run.tMin) - Math.min(candidate.tMax, run.tMax);
      if (gap > MERGE_GAP) continue;
      target = candidate;
      break;
    }
    if (!target) {
      merged.push({ ...run, polygon: run.polygon.slice() });
      continue;
    }
    const tMin = Math.min(target.tMin, run.tMin);
    const tMax = Math.max(target.tMax, run.tMax);
    target.offset = (target.offset * (target.tMax - target.tMin) + run.offset * (run.tMax - run.tMin)) / (target.tMax - target.tMin + run.tMax - run.tMin);
    target.tMin = tMin;
    target.tMax = tMax;
    target.thickness = Math.max(target.thickness, run.thickness);
  }
  return merged;
}

function runToWall(run: RawRun, index: number): WallRun {
  return {
    id: `wall-${index}`,
    from: pointOnLine(run.tMin, run.u, run.offset),
    to: pointOnLine(run.tMax, run.u, run.offset),
    thickness: run.thickness,
    length: run.tMax - run.tMin,
    exterior: false,
    polygon: run.polygon,
  };
}

function polygonToPoints(raw: number[][]): Point[] {
  return raw.map(([x, y]) => ({ x, y }));
}

function boundsOf(polygons: Point[][]): Bounds {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const poly of polygons) {
    const b = polygonBounds(poly);
    if (b.minX < minX) minX = b.minX;
    if (b.minY < minY) minY = b.minY;
    if (b.maxX > maxX) maxX = b.maxX;
    if (b.maxY > maxY) maxY = b.maxY;
  }
  if (!isFinite(minX)) {
    minX = 0;
    minY = 0;
    maxX = 1;
    maxY = 1;
  }
  return { minX, minY, maxX, maxY };
}

function associateOpening(from: Point, to: Point, walls: WallRun[]): string | null {
  const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
  const angle = normalizeAngle(Math.atan2(to.y - from.y, to.x - from.x));
  let best: WallRun | null = null;
  let bestScore = Infinity;
  for (const wall of walls) {
    const wallAngle = normalizeAngle(Math.atan2(wall.to.y - wall.from.y, wall.to.x - wall.from.x));
    const parallel = angleDiff(angle, wallAngle) <= (OPENING_ANGLE_EPS * Math.PI) / 180;
    // Line distance (not segment distance): an opening in a wall gap is still
    // collinear with the neighboring wall run it belongs to.
    const dx = wall.to.x - wall.from.x;
    const dy = wall.to.y - wall.from.y;
    const len = Math.hypot(dx, dy) || 1;
    const lineDist = Math.abs(dx * (wall.from.y - mid.y) - dy * (wall.from.x - mid.x)) / len;
    const tolerance = Math.max(wall.thickness, 8) + 6;
    const score = parallel && lineDist <= tolerance ? lineDist : lineDist + 1000;
    if (score < bestScore) {
      bestScore = score;
      best = wall;
    }
  }
  return best ? best.id : null;
}

/**
 * Normalizes raw recognition geometry into the intermediate floor-plan
 * representation: clean wall runs, openings with widths, and bounds.
 * Room detection (`detectRooms`) is applied separately afterwards.
 */
export function normalizeGeometry(geometry: RecognitionGeometry, pixelsPerMeter = 50): NormalizedFloorPlan {
  const wallPolygons = (geometry.wall ?? [])
    .map(polygonToPoints)
    .filter((p) => polygonArea(p) >= MIN_POLYGON_AREA);

  const rawRuns: RawRun[] = [];
  wallPolygons.forEach((polygon) => {
    const cleaned = cleanPolygon(polygon);
    if (cleaned.length < 3) return;
    rawRuns.push(...runsFromPolygon(cleaned));
  });

  const merged = mergeRuns(rawRuns)
    .filter((r) => r.tMax - r.tMin >= MIN_WALL_LENGTH)
    .filter((r) => r.tMax - r.tMin >= r.thickness * 0.5);

  const walls: WallRun[] = merged.map((run, i) => runToWall(run, i));

  const openings: Opening[] = [];
  const centerLines: Array<{ kind: OpeningKind; lines: number[][][] }> = [
    { kind: 'door', lines: geometry.door_center_line ?? [] },
    { kind: 'entry_door', lines: geometry.entry_door_center_line ?? [] },
    { kind: 'window', lines: geometry.window_center_line ?? [] },
  ];

  for (const group of centerLines) {
    group.lines.forEach((raw, i) => {
      const pts = polygonToPoints(raw);
      if (pts.length < 2) return;
      const from = pts[0];
      const to = pts[pts.length - 1];
      const width = distance(from, to);
      if (width < MIN_OPENING_WIDTH) return;
      const wallId = associateOpening(from, to, walls);
      openings.push({
        id: `${group.kind}-${i}`,
        kind: group.kind,
        from,
        to,
        width,
        wallId,
        roomIds: [],
      });
    });
  }

  const allPolygons = [...wallPolygons, ...openings.map((o) => [o.from, o.to])];
  const bounds = boundsOf(allPolygons);

  return {
    units: 'pixel',
    bounds,
    imageSize: null,
    walls,
    openings,
    rooms: [],
    regions: {
      wall: wallPolygons,
      door: (geometry.door ?? []).map(polygonToPoints),
      entry_door: (geometry.entry_door ?? []).map(polygonToPoints),
      window: (geometry.window ?? []).map(polygonToPoints),
    },
    kitchenRegions: (geometry.kitchen ?? []).map(polygonToPoints),
    options: { pixelsPerMeter },
  };
}