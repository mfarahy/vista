/**
 * Deterministic, conservative extraction of geometric primitives from RAW
 * wall polygons.
 *
 * Design rules (learned from earlier failed attempts — do not regress):
 * - Never pair polygon sides to infer wall centerlines or thickness.
 * - Never invent missing geometry (wall continuation, spans, corners).
 * - Extract only straight runs and corners that are actually present in the
 *   RAW polygon boundary, with explicit, configurable thresholds.
 * - One RAW polygon may produce many primitives.
 * - When evidence is ambiguous, keep the value unavailable (`null`) instead
 *   of guessing.
 */

import {
  angleDiffDeg,
  boundingBox,
  distance,
  indexFarthestFromCentroid,
  midpoint,
  perpendicularDistance,
  projectedOverlap,
  rotatePolygon,
  segmentAngleDeg,
  simplifyChain,
} from './geometry';
import type {
  Point,
  PrimitiveExtractionThresholds,
  WallPrimitive,
} from './types';

export type ExtractionOptions = {
  thresholds: PrimitiveExtractionThresholds;
};

/** A boundary point carrying its raw-polygon vertex index for traceability. */
type Vertex = { x: number; y: number; rawIndex: number };

/** A merged straight portion of the polygon boundary. */
type MergedRun = {
  from: Point;
  to: Point;
  fromRawIndex: number;
  toRawIndex: number;
  lengthPx: number;
  angleDeg: number;
  maxDeviationPx: number;
  boundaryOrder: number;
  vertices: Point[];
};

type CornerCandidate = {
  vertex: Point;
  vertexAngleDeg: number;
  boundaryOrder: number;
};

export const DEFAULT_EXTRACTION_THRESHOLDS: PrimitiveExtractionThresholds = {
  cleanEpsPx: 1.5,
  simplifyEpsPx: 2.5,
  collinearMergeEpsDeg: 3.5,
  minRunLengthPx: 18,
  axisAlignedEpsDeg: 4,
  cornerLegMinPx: 6,
  cornerMinAngleDeg: 40,
  parallelEpsDeg: 5,
  perpendicularEpsDeg: 5,
  sameAxisOffsetPx: 4,
  closeParallelPx: 30,
  endpointProximityPx: 12,
  thicknessMinPx: 3,
  thicknessMaxPx: 30,
  thicknessMinOverlapRatio: 0.6,
  thicknessAngleEpsDeg: 4,
  thicknessAmbiguityMarginPx: 1,
};

/**
 * Extracts wall primitives from one RAW wall polygon.
 *
 * @param sourceObjectId e.g. `wall-3`
 * @param rawPolygon     the RAW polygon as `[[x, y], …]`
 * @param sourcePolygonIndex index of the polygon inside `raw.wall`
 * @param options        thresholds (see `DEFAULT_EXTRACTION_THRESHOLDS`)
 */
export function extractWallPrimitives(
  sourceObjectId: string,
  rawPolygon: number[][],
  sourcePolygonIndex: number,
  options?: Partial<ExtractionOptions>,
): WallPrimitive[] {
  const thresholds: PrimitiveExtractionThresholds = {
    ...DEFAULT_EXTRACTION_THRESHOLDS,
    ...(options?.thresholds ?? {}),
  };

  const vertices = cleanVertices(rawPolygon, thresholds.cleanEpsPx);
  if (vertices.length < 4) return [];

  const simplified = simplifyBoundary(vertices, thresholds.simplifyEpsPx);
  if (simplified.length < 4) return [];

  const runs = mergeBoundaryRuns(simplified, thresholds);
  if (runs.length === 0) return [];

  const corners = detectCorners(runs, thresholds);

  const runPrimitives = runs
    .filter((r) => r.lengthPx >= thresholds.minRunLengthPx)
    .sort((a, b) => b.lengthPx - a.lengthPx || a.boundaryOrder - b.boundaryOrder)
    .map((r, i) =>
      buildRunPrimitive(sourceObjectId, sourcePolygonIndex, r, i, rawPolygon.length, thresholds),
    );

  const cornerPrimitives = corners.map((c, i) =>
    buildCornerPrimitive(sourceObjectId, sourcePolygonIndex, c, i, rawPolygon.length, thresholds),
  );

  const primitives = [...runPrimitives, ...cornerPrimitives];
  applyThicknessEvidence(primitives, thresholds);
  return primitives;
}

// ---------------------------------------------------------------------------
// Boundary cleaning & simplification
// ---------------------------------------------------------------------------

function cleanVertices(rawPolygon: number[][], cleanEpsPx: number): Vertex[] {
  const points: Vertex[] = rawPolygon.map(([x, y], i) => ({ x, y, rawIndex: i }));
  const cleaned: Vertex[] = [];
  for (const p of points) {
    const prev = cleaned[cleaned.length - 1];
    if (!prev || distance(prev, p) >= cleanEpsPx) cleaned.push(p);
  }
  const first = cleaned[0];
  const last = cleaned[cleaned.length - 1];
  if (first && last && distance(first, last) < cleanEpsPx) cleaned.pop();
  return cleaned;
}

/**
 * RDP simplification of the closed polygon. The chain is rotated so the
 * implicit closing edge starts at the vertex farthest from the centroid —
 * this keeps the closing edge from being artificially flattened.
 */
function simplifyBoundary(vertices: Vertex[], simplifyEpsPx: number): Vertex[] {
  const start = indexFarthestFromCentroid(vertices);
  const rotated = rotatePolygon(vertices, start);
  const { points, indices } = simplifyChain(
    rotated,
    rotated.map((v) => v.rawIndex),
    simplifyEpsPx,
  );
  const simplified: Vertex[] = points.map((p, i) => ({ x: p.x, y: p.y, rawIndex: indices[i] }));
  // RDP keeps the chain endpoints; the polygon closing vertex may now coincide
  // with the first point — deduplicate.
  if (simplified.length >= 2 && distance(simplified[0], simplified[simplified.length - 1]) < 1e-6) {
    simplified.pop();
  }
  return simplified;
}

// ---------------------------------------------------------------------------
// Boundary run merging
// ---------------------------------------------------------------------------

function mergeBoundaryRuns(
  vertices: Vertex[],
  thresholds: PrimitiveExtractionThresholds,
): MergedRun[] {
  const n = vertices.length;
  const runs: MergedRun[] = [];
  let current: {
    from: Vertex;
    to: Vertex;
    vertices: Vertex[];
  } | null = null;

  const closeRun = () => {
    if (!current) return;
    const { from, to, vertices: consumed } = current;
    const lengthPx = distance(from, to);
    if (lengthPx < 1e-6) {
      current = null;
      return;
    }
    const angleDeg = segmentAngleDeg(from, to);
    let maxDeviationPx = 0;
    for (const v of consumed) {
      const d = perpendicularDistance(v, from, angleDeg);
      if (d > maxDeviationPx) maxDeviationPx = d;
    }
    runs.push({
      from: { x: from.x, y: from.y },
      to: { x: to.x, y: to.y },
      fromRawIndex: from.rawIndex,
      toRawIndex: to.rawIndex,
      lengthPx,
      angleDeg,
      maxDeviationPx,
      boundaryOrder: runs.length,
      vertices: consumed.map((v) => ({ x: v.x, y: v.y })),
    });
    current = null;
  };

  for (let i = 0; i < n; i++) {
    const a = vertices[i];
    const b = vertices[(i + 1) % n];
    if (distance(a, b) < 1e-6) continue;
    if (!current) {
      current = { from: a, to: b, vertices: [a, b] };
      continue;
    }
    const runAngle = segmentAngleDeg(current.from, current.to);
    const edgeAngle = segmentAngleDeg(a, b);
    if (angleDiffDeg(runAngle, edgeAngle) <= thresholds.collinearMergeEpsDeg) {
      current.to = b;
      current.vertices.push(b);
    } else {
      closeRun();
      current = { from: a, to: b, vertices: [a, b] };
    }
  }
  closeRun();

  // Cyclic merge: the boundary is a closed loop, so the first and last runs
  // may be two pieces of the same straight side split at the start vertex.
  if (runs.length >= 2) {
    const first = runs[0];
    const last = runs[runs.length - 1];
    if (angleDiffDeg(first.angleDeg, last.angleDeg) <= thresholds.collinearMergeEpsDeg) {
      const deviation = perpendicularDistance(last.from, first.from, first.angleDeg);
      const tolerance = Math.max(1.5, thresholds.simplifyEpsPx);
      if (deviation <= tolerance) {
        const mergedFrom = last.from;
        const mergedTo = first.to;
        const lengthPx = distance(mergedFrom, mergedTo);
        if (lengthPx >= 1e-6) {
          const angleDeg = segmentAngleDeg(mergedFrom, mergedTo);
          const maxDeviationPx = Math.max(
            last.maxDeviationPx,
            first.maxDeviationPx,
            perpendicularDistance(first.from, mergedFrom, angleDeg),
          );
          runs[0] = {
            from: mergedFrom,
            to: mergedTo,
            fromRawIndex: last.fromRawIndex,
            toRawIndex: first.toRawIndex,
            lengthPx,
            angleDeg,
            maxDeviationPx,
            boundaryOrder: 0,
            vertices: [...last.vertices, ...first.vertices],
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

// ---------------------------------------------------------------------------
// Corners
// ---------------------------------------------------------------------------

/**
 * Detects boundary corners between meaningful runs. Tiny transition edges
 * (shorter than `cornerLegMinPx`) between the two legs are skipped — they are
 * recognition jitter at the corner, not geometry of their own.
 */
function detectCorners(runs: MergedRun[], thresholds: PrimitiveExtractionThresholds): CornerCandidate[] {
  const corners: CornerCandidate[] = [];
  const m = runs.length;
  if (m < 3) return corners;

  for (let i = 0; i < m; i++) {
    const legA = runs[i];
    const skipped: MergedRun[] = [];
    let k = (i + 1) % m;
    let legB = runs[k];
    while (legB.lengthPx < thresholds.cornerLegMinPx && skipped.length < 3 && k !== i) {
      skipped.push(legB);
      k = (k + 1) % m;
      legB = runs[k];
    }
    if (legB === legA) continue;
    if (legA.lengthPx < thresholds.cornerLegMinPx || legB.lengthPx < thresholds.cornerLegMinPx) continue;

    const interiorAngle = angleDiffDeg(legA.angleDeg, legB.angleDeg);
    if (interiorAngle < thresholds.cornerMinAngleDeg) continue;
    // Both legs tiny = contour noise, not an architectural corner.
    if (legA.lengthPx < thresholds.minRunLengthPx && legB.lengthPx < thresholds.minRunLengthPx) continue;

    const vertex =
      skipped.length > 0
        ? midpoint(skipped[0].from, skipped[skipped.length - 1].to)
        : legA.to;

    corners.push({
      vertex,
      vertexAngleDeg: interiorAngle,
      boundaryOrder: corners.length,
    });
  }

  // Deduplicate corners that are nearly coincident (e.g. after RDP both sides
  // of a notch collapse onto the same vertex).
  const unique: CornerCandidate[] = [];
  for (const c of corners) {
    const dup = unique.some((u) => distance(u.vertex, c.vertex) < 2);
    if (!dup) unique.push(c);
  }
  return unique;
}

// ---------------------------------------------------------------------------
// Primitive construction
// ---------------------------------------------------------------------------

function orientationOf(angleDeg: number, thresholds: PrimitiveExtractionThresholds): WallPrimitive['orientation'] {
  const eps = thresholds.axisAlignedEpsDeg;
  if (angleDeg <= eps || angleDeg >= 180 - eps) return 'horizontal';
  if (Math.abs(angleDeg - 90) <= eps) return 'vertical';
  return 'diagonal';
}

function confidenceOf(
  lengthPx: number,
  orientation: WallPrimitive['orientation'],
  straightnessPx: number,
): { confidence: number; quality: WallPrimitive['quality'] } {
  let confidence = 0.4;
  if (orientation !== 'diagonal') confidence += 0.15;
  if (lengthPx >= 40) confidence += 0.15;
  if (lengthPx >= 80) confidence += 0.15;
  if (straightnessPx <= 2) confidence += 0.1;
  if (lengthPx >= 240) confidence += 0.05;
  confidence = Math.min(1, Math.max(0, confidence));
  const quality: WallPrimitive['quality'] = confidence >= 0.75 ? 'high' : confidence >= 0.55 ? 'medium' : 'low';
  return { confidence, quality };
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

function buildRunPrimitive(
  sourceObjectId: string,
  sourcePolygonIndex: number,
  run: MergedRun,
  index: number,
  rawVertexCount: number,
  thresholds: PrimitiveExtractionThresholds,
): WallPrimitive {
  const orientation = orientationOf(run.angleDeg, thresholds);
  const { confidence, quality } = confidenceOf(run.lengthPx, orientation, run.maxDeviationPx);
  const primitiveId = `${sourceObjectId}:s${index}`;
  return {
    primitiveId,
    sourceObjectId,
    sourceCategory: 'wall',
    sourcePolygonIndex,
    kind: 'run',
    from: run.from,
    to: run.to,
    lengthPx: round(run.lengthPx),
    angleDeg: round(run.angleDeg),
    vertexAngleDeg: null,
    orientation,
    midpoint: midpoint(run.from, run.to),
    boundingBox: boundingBox([run.from, run.to]),
    quality,
    confidence: round(confidence),
    straightnessPx: round(run.maxDeviationPx),
    uncertain: orientation === 'diagonal' || quality === 'low',
    estimatedThicknessPx: null,
    thickness: {
      estimatedThicknessPx: null,
      confidence: 0,
      reason: 'no_parallel_boundaries',
      partnerIds: [],
      offsetPx: null,
    },
    sourceVertexIndices: vertexRangeIndices(run.fromRawIndex, run.toRawIndex, rawVertexCount),
    boundaryOrder: run.boundaryOrder,
  };
}

function buildCornerPrimitive(
  sourceObjectId: string,
  sourcePolygonIndex: number,
  corner: CornerCandidate,
  index: number,
  _rawVertexCount: number,
  _thresholds: PrimitiveExtractionThresholds,
): WallPrimitive {
  const primitiveId = `${sourceObjectId}:c${index}`;
  // Corners have no reliable direction; keep the axis orientation of the
  // vertex legs unavailable rather than inventing one.
  return {
    primitiveId,
    sourceObjectId,
    sourceCategory: 'wall',
    sourcePolygonIndex,
    kind: 'corner',
    from: corner.vertex,
    to: corner.vertex,
    lengthPx: 0,
    angleDeg: 0,
    vertexAngleDeg: round(corner.vertexAngleDeg),
    orientation: 'diagonal',
    midpoint: corner.vertex,
    boundingBox: {
      minX: corner.vertex.x,
      minY: corner.vertex.y,
      maxX: corner.vertex.x,
      maxY: corner.vertex.y,
    },
    quality: 'medium',
    confidence: 0.6,
    straightnessPx: null,
    uncertain: false,
    estimatedThicknessPx: null,
    thickness: {
      estimatedThicknessPx: null,
      confidence: 0,
      reason: 'no_parallel_boundaries',
      partnerIds: [],
      offsetPx: null,
    },
    sourceVertexIndices: [],
    boundaryOrder: corner.boundaryOrder,
  };
}

// ---------------------------------------------------------------------------
// Thickness evidence — expose, don't solve
// ---------------------------------------------------------------------------

/**
 * Computes thickness evidence for every run by pairing it with an
 * approximately parallel run from the SAME source polygon (two sides of the
 * same wall ribbon). Conservative:
 * - offset must be within [thicknessMinPx, thicknessMaxPx]
 * - projected overlap must cover ≥ thicknessMinOverlapRatio of the shorter run
 * - two similar candidates ⇒ `ambiguous_parallel_boundaries` and null
 *
 * Never forces a value. `estimatedThicknessPx = null` is a valid outcome.
 */
function applyThicknessEvidence(
  primitives: WallPrimitive[],
  thresholds: PrimitiveExtractionThresholds,
): void {
  const runs = primitives.filter((p) => p.kind === 'run');
  for (const run of runs) {
    const candidates: Array<{ partner: WallPrimitive; offsetPx: number; overlapRatio: number }> = [];
    for (const other of runs) {
      if (other === run) continue;
      if (other.sourceObjectId !== run.sourceObjectId) continue;
      if (angleDiffDeg(run.angleDeg, other.angleDeg) > thresholds.thicknessAngleEpsDeg) continue;
      const offsetPx = perpendicularDistance(other.from, run.from, run.angleDeg);
      if (offsetPx < thresholds.thicknessMinPx || offsetPx > thresholds.thicknessMaxPx) continue;
      const overlapPx = projectedOverlap(run.from, run.to, other.from, other.to, run.angleDeg);
      const shorter = Math.min(run.lengthPx, other.lengthPx);
      if (shorter <= 0) continue;
      const overlapRatio = overlapPx / shorter;
      if (overlapRatio < thresholds.thicknessMinOverlapRatio) continue;
      candidates.push({ partner: other, offsetPx, overlapRatio });
    }
    if (candidates.length === 0) {
      run.thickness = {
        estimatedThicknessPx: null,
        confidence: 0,
        reason: 'no_parallel_boundaries',
        partnerIds: [],
        offsetPx: null,
      };
      run.estimatedThicknessPx = null;
      continue;
    }
    candidates.sort((a, b) => a.offsetPx - b.offsetPx);

    // Deduplicate candidates that are pieces of the SAME parallel boundary
    // line (identical offset + direction, e.g. two y-segments of one wall
    // side separated by a door notch). Keep the segment with more overlap.
    const distinct: typeof candidates = [];
    for (const candidate of candidates) {
      const existing = distinct.find(
        (c) =>
          Math.abs(c.offsetPx - candidate.offsetPx) < 1 &&
          angleDiffDeg(run.angleDeg, candidate.partner.angleDeg) < 1,
      );
      if (existing) {
        if (candidate.overlapRatio > existing.overlapRatio) {
          distinct[distinct.indexOf(existing)] = candidate;
        }
        continue;
      }
      distinct.push(candidate);
    }

    const best = distinct[0];
    const second = distinct[1];
    const ambiguous =
      second !== undefined &&
      second.offsetPx - best.offsetPx <= thresholds.thicknessAmbiguityMarginPx &&
      second.overlapRatio >= thresholds.thicknessMinOverlapRatio;

    if (ambiguous) {
      run.thickness = {
        estimatedThicknessPx: null,
        confidence: 0.3,
        reason: 'ambiguous_parallel_boundaries',
        partnerIds: [best.partner.primitiveId, second.partner.primitiveId],
        offsetPx: round(best.offsetPx),
      };
      run.estimatedThicknessPx = null;
      continue;
    }

    const overlapRatio = best.overlapRatio;
    const confidence = Math.min(1, 0.55 + overlapRatio * 0.3 + (best.offsetPx >= 4 ? 0.1 : 0));
    run.thickness = {
      estimatedThicknessPx: round(best.offsetPx),
      confidence: round(confidence),
      reason: 'reliable_parallel_boundaries',
      partnerIds: [best.partner.primitiveId],
      offsetPx: round(best.offsetPx),
    };
    run.estimatedThicknessPx = round(best.offsetPx);
  }
}

function round(value: number, digits = 2): number {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}