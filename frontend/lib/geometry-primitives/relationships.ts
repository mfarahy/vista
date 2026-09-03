/**
 * Pairwise geometric relationships between wall primitives.
 *
 * These are measured geometric facts, not architectural interpretations:
 * two primitives may be parallel, close, overlapping, … — whether they are
 * the same architectural wall is a VLM/solver decision.
 */

import {
  angleDiffDeg,
  minEndpointDistance,
  perpendicularDistance,
  projectedOverlap,
  segmentIntersection,
} from './geometry';
import type {
  PrimitiveExtractionThresholds,
  PrimitiveRelationship,
  WallPrimitive,
} from './types';

/**
 * Computes all pairwise relationships between run primitives.
 * Corners (zero-length) are excluded — they carry no direction.
 */
export function computeRelationships(
  primitives: WallPrimitive[],
  thresholds: PrimitiveExtractionThresholds,
): PrimitiveRelationship[] {
  const runs = primitives.filter((p) => p.kind === 'run');
  const relationships: PrimitiveRelationship[] = [];

  for (let i = 0; i < runs.length; i++) {
    for (let j = i + 1; j < runs.length; j++) {
      const a = runs[i];
      const b = runs[j];
      // Deterministic ordering: source object, then boundary order.
      const [first, second] =
        a.sourceObjectId < b.sourceObjectId ||
        (a.sourceObjectId === b.sourceObjectId && a.boundaryOrder < b.boundaryOrder)
          ? [a, b]
          : [b, a];

      const angDiff = angleDiffDeg(a.angleDeg, b.angleDeg);
      const offsetPx = perpendicularDistance(b.from, a.from, a.angleDeg);

      if (angDiff <= thresholds.parallelEpsDeg) {
        relationships.push({
          a: first.primitiveId,
          b: second.primitiveId,
          type: 'parallel',
          value: round(angDiff),
          unit: 'deg',
        });
        relationships.push({
          a: first.primitiveId,
          b: second.primitiveId,
          type: 'offset',
          value: round(offsetPx),
          unit: 'px',
        });
        if (offsetPx <= thresholds.sameAxisOffsetPx) {
          relationships.push({
            a: first.primitiveId,
            b: second.primitiveId,
            type: 'same_axis',
            value: round(offsetPx),
            unit: 'px',
          });
        }
        if (offsetPx <= thresholds.closeParallelPx) {
          relationships.push({
            a: first.primitiveId,
            b: second.primitiveId,
            type: 'close_parallel',
            value: round(offsetPx),
            unit: 'px',
          });
        }
        const overlapPx = projectedOverlap(a.from, a.to, b.from, b.to, a.angleDeg);
        if (overlapPx > 0) {
          relationships.push({
            a: first.primitiveId,
            b: second.primitiveId,
            type: 'overlap',
            value: round(overlapPx),
            unit: 'px',
          });
        }
      } else if (Math.abs(angDiff - 90) <= thresholds.perpendicularEpsDeg) {
        relationships.push({
          a: first.primitiveId,
          b: second.primitiveId,
          type: 'perpendicular',
          value: round(angDiff),
          unit: 'deg',
        });
      }

      const endDist = minEndpointDistance(a.from, a.to, b.from, b.to);
      if (endDist <= thresholds.endpointProximityPx) {
        relationships.push({
          a: first.primitiveId,
          b: second.primitiveId,
          type: 'endpoint_proximity',
          value: round(endDist),
          unit: 'px',
        });
      }

      const inter = segmentIntersection(a.from, a.to, b.from, b.to);
      if (inter) {
        relationships.push({
          a: first.primitiveId,
          b: second.primitiveId,
          type: 'intersection',
          value: round(endDist),
          unit: 'px',
          at: inter,
        });
      }
    }
  }

  return relationships;
}

function round(value: number, digits = 2): number {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}