/**
 * Geometry primitives for VLM geometry interpretation (POC).
 *
 * Deterministic, dependency-free extraction of straight wall runs from RAW
 * wall polygons. This is the server-side counterpart of
 * `frontend/lib/geometry-primitives` — intentionally a small port so the VLM
 * request can be built without importing frontend code.
 *
 * Design rules (same as the frontend layer — do not regress):
 * - Never pair polygon sides to infer wall centerlines.
 * - Never invent missing geometry (continuations, spans, corners).
 * - Extract only straight runs actually present in the RAW polygon boundary.
 * - One RAW polygon may produce many primitives.
 * - Primitive IDs are stable and match the frontend convention:
 *   `wall-3:s0`, `wall-3:s1`, … (runs, longest first).
 *
 * The VLM receives these primitives as INPUT and returns
 * `geometryRelationships` (relationships between existing primitives). It
 * must NEVER invent coordinates or geometry — see `prompt.ts`.
 */

export type VlmPoint = { x: number; y: number };

export type VlmPrimitiveOrientation = 'horizontal' | 'vertical' | 'diagonal';

export interface VlmPrimitive {
  primitiveId: string;
  sourceObjectId: string;
  /** Primitive kind — currently only wall runs are sent to the VLM. */
  type: 'run';
  start: VlmPoint;
  end: VlmPoint;
  lengthPx: number;
  angleDeg: number;
  orientation: VlmPrimitiveOrientation;
  /** Measured thickness evidence in pixels, or null when ambiguous/missing. */
  thicknessPx: number | null;
  /** Raw polygon vertex indices consumed by this primitive (traceability). */
  sourceVertexIndices: number[];
}

export interface VlmPrimitivesInput {
  wall?: number[][][];
  [key: string]: unknown;
}

const CLEAN_EPS_PX = 1.5;
const SIMPLIFY_EPS_PX = 2.5;
const COLLINEAR_MERGE_EPS_DEG = 3.5;
const MIN_RUN_LENGTH_PX = 18;
const AXIS_ALIGNED_EPS_DEG = 4;
const THICKNESS_MIN_PX = 3;
const THICKNESS_MAX_PX = 30;
const THICKNESS_MIN_OVERLAP_RATIO = 0.6;
const THICKNESS_ANGLE_EPS_DEG = 4;

/** Hard cap so the VLM prompt stays bounded on pathological inputs. */
export const MAX_VLM_PRIMITIVES = 200;

type Vertex = { x: number; y: number; rawIndex: number };

type MergedRun = {
  from: Vertex;
  to: Vertex;
  fromRawIndex: number;
  toRawIndex: number;
  lengthPx: number;
  angleDeg: number;
  boundaryOrder: number;
};

function distance(a: VlmPoint, b: VlmPoint): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** Canonical angle of a→b in degrees, mapped into [0, 180). */
function segmentAngleDeg(a: VlmPoint, b: VlmPoint): number {
  let angle = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
  if (angle < 0) angle += 180;
  if (angle >= 180) angle -= 180;
  return angle;
}

function angleDiffDeg(a: number, b: number): number {
  const d = Math.abs(a - b) % 180;
  return Math.min(d, 180 - d);
}

function perpendicularDistance(p: VlmPoint, q: VlmPoint, angleDeg: number): number {
  const rad = (angleDeg * Math.PI) / 180;
  const nx = -Math.sin(rad);
  const ny = Math.cos(rad);
  return Math.abs((p.x - q.x) * nx + (p.y - q.y) * ny);
}

function axisCoordinate(p: VlmPoint, q: VlmPoint, angleDeg: number): number {
  const rad = (angleDeg * Math.PI) / 180;
  return (p.x - q.x) * Math.cos(rad) + (p.y - q.y) * Math.sin(rad);
}

function projectedOverlap(
  aFrom: VlmPoint,
  aTo: VlmPoint,
  bFrom: VlmPoint,
  bTo: VlmPoint,
  angleDeg: number,
): number {
  const q = aFrom;
  const aMin = Math.min(axisCoordinate(aFrom, q, angleDeg), axisCoordinate(aTo, q, angleDeg));
  const aMax = Math.max(axisCoordinate(aFrom, q, angleDeg), axisCoordinate(aTo, q, angleDeg));
  const bMin = Math.min(axisCoordinate(bFrom, q, angleDeg), axisCoordinate(bTo, q, angleDeg));
  const bMax = Math.max(axisCoordinate(bFrom, q, angleDeg), axisCoordinate(bTo, q, angleDeg));
  return Math.max(0, Math.min(aMax, bMax) - Math.max(aMin, bMin));
}

function pointToSegmentDistance(p: VlmPoint, a: VlmPoint, b: VlmPoint): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return distance(p, a);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return distance(p, { x: a.x + t * dx, y: a.y + t * dy });
}

function indexFarthestFromCentroid(points: Vertex[]): number {
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

function orientationOf(angleDeg: number): VlmPrimitiveOrientation {
  if (angleDeg <= AXIS_ALIGNED_EPS_DEG || angleDeg >= 180 - AXIS_ALIGNED_EPS_DEG) return 'horizontal';
  if (Math.abs(angleDeg - 90) <= AXIS_ALIGNED_EPS_DEG) return 'vertical';
  return 'diagonal';
}

function round(value: number, digits = 2): number {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}

function cleanVertices(rawPolygon: number[][]): Vertex[] {
  const cleaned: Vertex[] = [];
  rawPolygon.forEach(([x, y], i) => {
    const p = { x, y, rawIndex: i };
    const prev = cleaned[cleaned.length - 1];
    if (!prev || distance(prev, p) >= CLEAN_EPS_PX) cleaned.push(p);
  });
  const first = cleaned[0];
  const last = cleaned[cleaned.length - 1];
  if (first && last && cleaned.length > 1 && distance(first, last) < CLEAN_EPS_PX) cleaned.pop();
  return cleaned;
}

/** RDP simplification of the closed polygon as an open chain. */
function simplifyBoundary(vertices: Vertex[]): Vertex[] {
  if (vertices.length <= 2) return vertices.slice();
  const start = indexFarthestFromCentroid(vertices);
  const rotated = vertices.slice(start).concat(vertices.slice(0, start));
  const kept = new Uint8Array(rotated.length);
  kept[0] = 1;
  kept[rotated.length - 1] = 1;
  const stack: Array<[number, number]> = [[0, rotated.length - 1]];
  while (stack.length > 0) {
    const [s, e] = stack.pop()!;
    let maxDist = 0;
    let maxIdx = -1;
    for (let i = s + 1; i < e; i++) {
      const d = pointToSegmentDistance(rotated[i], rotated[s], rotated[e]);
      if (d > maxDist) {
        maxDist = d;
        maxIdx = i;
      }
    }
    if (maxDist > SIMPLIFY_EPS_PX && maxIdx > 0) {
      kept[maxIdx] = 1;
      stack.push([s, maxIdx], [maxIdx, e]);
    }
  }
  const out: Vertex[] = [];
  for (let i = 0; i < rotated.length; i++) {
    if (kept[i]) out.push(rotated[i]);
  }
  if (out.length >= 2 && distance(out[0], out[out.length - 1]) < 1e-6) out.pop();
  return out;
}

function mergeBoundaryRuns(vertices: Vertex[]): MergedRun[] {
  const n = vertices.length;
  const runs: MergedRun[] = [];
  let current: { from: Vertex; to: Vertex } | null = null;

  const closeRun = () => {
    if (!current) return;
    const { from, to } = current;
    const lengthPx = distance(from, to);
    if (lengthPx >= 1e-6) {
      runs.push({
        from,
        to,
        fromRawIndex: from.rawIndex,
        toRawIndex: to.rawIndex,
        lengthPx,
        angleDeg: segmentAngleDeg(from, to),
        boundaryOrder: runs.length,
      });
    }
    current = null;
  };

  for (let i = 0; i < n; i++) {
    const a = vertices[i];
    const b = vertices[(i + 1) % n];
    if (distance(a, b) < 1e-6) continue;
    if (!current) {
      current = { from: a, to: b };
      continue;
    }
    const runAngle = segmentAngleDeg(current.from, current.to);
    const edgeAngle = segmentAngleDeg(a, b);
    if (angleDiffDeg(runAngle, edgeAngle) <= COLLINEAR_MERGE_EPS_DEG) {
      current.to = b;
    } else {
      closeRun();
      current = { from: a, to: b };
    }
  }
  closeRun();

  // Cyclic merge: first/last runs may be one straight side split at the start vertex.
  if (runs.length >= 2) {
    const first = runs[0];
    const last = runs[runs.length - 1];
    if (angleDiffDeg(first.angleDeg, last.angleDeg) <= COLLINEAR_MERGE_EPS_DEG) {
      const deviation = perpendicularDistance(last.from, first.from, first.angleDeg);
      if (deviation <= Math.max(1.5, SIMPLIFY_EPS_PX)) {
        const mergedFrom = last.from;
        const mergedTo = first.to;
        if (distance(mergedFrom, mergedTo) >= 1e-6) {
          runs[0] = {
            from: mergedFrom,
            to: mergedTo,
            fromRawIndex: last.fromRawIndex,
            toRawIndex: first.toRawIndex,
            lengthPx: distance(mergedFrom, mergedTo),
            angleDeg: segmentAngleDeg(mergedFrom, mergedTo),
            boundaryOrder: 0,
          };
          runs.pop();
        }
      }
    }
  }
  runs.forEach((r, i) => {
    r.boundaryOrder = i;
  });
  return runs;
}

function vertexRangeIndices(fromRawIndex: number, toRawIndex: number, n: number): number[] {
  const indices: number[] = [];
  let i = fromRawIndex;
  while (true) {
    indices.push(i);
    if (i === toRawIndex) break;
    i = (i + 1) % n;
    if (indices.length > n) break;
  }
  return indices;
}

function thicknessForRun(
  run: MergedRun,
  siblings: MergedRun[],
): number | null {
  let best: { offsetPx: number; overlapRatio: number } | null = null;
  for (const other of siblings) {
    if (other === run) continue;
    if (angleDiffDeg(run.angleDeg, other.angleDeg) > THICKNESS_ANGLE_EPS_DEG) continue;
    const offsetPx = perpendicularDistance(other.from, run.from, run.angleDeg);
    if (offsetPx < THICKNESS_MIN_PX || offsetPx > THICKNESS_MAX_PX) continue;
    const overlapPx = projectedOverlap(run.from, run.to, other.from, other.to, run.angleDeg);
    const shorter = Math.min(run.lengthPx, other.lengthPx);
    if (shorter <= 0) continue;
    const overlapRatio = overlapPx / shorter;
    if (overlapRatio < THICKNESS_MIN_OVERLAP_RATIO) continue;
    if (!best || offsetPx < best.offsetPx) best = { offsetPx, overlapRatio };
  }
  return best ? round(best.offsetPx) : null;
}

/**
 * Extracts VLM-facing wall-run primitives from RAW recognition geometry.
 * IDs (`wall-i:sN`, longest run first per RAW object) match the frontend
 * extractor so client- and server-computed sets are interchangeable.
 */
export function extractVlmPrimitives(raw: VlmPrimitivesInput): VlmPrimitive[] {
  const out: VlmPrimitive[] = [];
  (raw.wall ?? []).forEach((polygon, index) => {
    if (!Array.isArray(polygon) || polygon.length < 4) return;
    const sourceObjectId = `wall-${index}`;
    const vertices = cleanVertices(polygon);
    if (vertices.length < 4) return;
    const simplified = simplifyBoundary(vertices);
    if (simplified.length < 4) return;
    const runs = mergeBoundaryRuns(simplified).filter((r) => r.lengthPx >= MIN_RUN_LENGTH_PX);
    if (runs.length === 0) return;
    const sorted = [...runs].sort((a, b) => b.lengthPx - a.lengthPx || a.boundaryOrder - b.boundaryOrder);
    sorted.forEach((run, i) => {
      const angleDeg = round(run.angleDeg);
      out.push({
        primitiveId: `${sourceObjectId}:s${i}`,
        sourceObjectId,
        type: 'run',
        start: { x: round(run.from.x), y: round(run.from.y) },
        end: { x: round(run.to.x), y: round(run.to.y) },
        lengthPx: round(run.lengthPx),
        angleDeg,
        orientation: orientationOf(run.angleDeg),
        thicknessPx: thicknessForRun(run, runs),
        sourceVertexIndices: vertexRangeIndices(run.fromRawIndex, run.toRawIndex, polygon.length),
      });
    });
  });
  return out.slice(0, MAX_VLM_PRIMITIVES);
}

/** Validates/normalizes a client-supplied primitive list (POC input contract). */
export function normalizeVlmPrimitives(input: unknown): VlmPrimitive[] | null {
  if (!Array.isArray(input)) return null;
  const out: VlmPrimitive[] = [];
  for (const item of input.slice(0, MAX_VLM_PRIMITIVES)) {
    if (typeof item !== 'object' || item === null) return null;
    const p = item as Record<string, unknown>;
    if (
      typeof p.primitiveId !== 'string' ||
      typeof p.sourceObjectId !== 'string' ||
      typeof p.start !== 'object' ||
      typeof p.end !== 'object' ||
      typeof p.lengthPx !== 'number' ||
      typeof p.angleDeg !== 'number' ||
      typeof p.orientation !== 'string'
    ) {
      return null;
    }
    const start = p.start as { x?: unknown; y?: unknown };
    const end = p.end as { x?: unknown; y?: unknown };
    if (typeof start.x !== 'number' || typeof start.y !== 'number') return null;
    if (typeof end.x !== 'number' || typeof end.y !== 'number') return null;
    if (!['horizontal', 'vertical', 'diagonal'].includes(p.orientation as string)) return null;
    out.push({
      primitiveId: p.primitiveId,
      sourceObjectId: p.sourceObjectId,
      type: 'run',
      start: { x: start.x, y: start.y },
      end: { x: end.x, y: end.y },
      lengthPx: p.lengthPx,
      angleDeg: p.angleDeg,
      orientation: p.orientation as VlmPrimitiveOrientation,
      thicknessPx: typeof p.thicknessPx === 'number' ? p.thicknessPx : null,
      sourceVertexIndices: Array.isArray(p.sourceVertexIndices)
        ? (p.sourceVertexIndices as unknown[]).filter((v): v is number => typeof v === 'number')
        : [],
    });
  }
  return out;
}

/** Builds the ID set used to validate `geometryRelationships` references. */
export function buildPrimitiveIdSet(primitives: VlmPrimitive[]): Set<string> {
  return new Set(primitives.map((p) => p.primitiveId));
}

/**
 * Serializes primitives for the VLM user message. Compact line format keeps
 * the prompt bounded; full float precision is unnecessary for reasoning.
 */
export function serializePrimitivesForVlm(primitives: VlmPrimitive[]): string {
  return primitives
    .map((p) => {
      const thickness = p.thicknessPx === null ? 'null' : String(p.thicknessPx);
      const verts = p.sourceVertexIndices.length > 0 ? p.sourceVertexIndices.join(',') : '—';
      return (
        `${p.primitiveId} src=${p.sourceObjectId} ` +
        `start=(${p.start.x},${p.start.y}) end=(${p.end.x},${p.end.y}) ` +
        `len=${p.lengthPx}px ang=${p.angleDeg}deg ori=${p.orientation} ` +
        `thick=${thickness}px verts=[${verts}]`
      );
    })
    .join('\n');
}
