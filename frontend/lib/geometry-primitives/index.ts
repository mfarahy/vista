/**
 * Geometry primitives — public entry point.
 *
 * Converts RAW recognition output into an inspectable, deterministic
 * geometric primitive representation WITHOUT architectural interpretation.
 *
 * Pipeline: RAW recognition polygons → geometric primitives → VLM reasoning
 * → deterministic geometry solver. This module implements only the middle
 * "geometric primitives" layer.
 */

import {
  DEFAULT_EXTRACTION_THRESHOLDS,
  extractWallPrimitives,
  type ExtractionOptions,
} from './extract';
import { computeRelationships } from './relationships';
import type {
  GeometryPrimitivesResult,
  PrimitiveExtractionThresholds,
  PrimitiveSummary,
  RawGeometryLike,
  WallPrimitive,
} from './types';

export type { GeometryPrimitivesResult, PrimitiveSummary, WallPrimitive } from './types';
export {
  DEFAULT_EXTRACTION_THRESHOLDS,
  extractWallPrimitives,
  type ExtractionOptions,
} from './extract';
export { computeRelationships } from './relationships';
export * from './geometry';
export type {
  BoundingBox,
  Point,
  PrimitiveKind,
  PrimitiveOrientation,
  PrimitiveQuality,
  PrimitiveRelationship,
  PrimitiveRelationshipType,
  ThicknessEvidence,
  ThicknessReason,
} from './types';

/**
 * Extracts geometry primitives from RAW recognition output.
 *
 * @param raw RAW recognition geometry (the `raw.wall` category is used).
 * @param options optional threshold overrides (POC defaults are conservative).
 */
export function extractGeometryPrimitives(
  raw: RawGeometryLike,
  options?: Partial<ExtractionOptions>,
): GeometryPrimitivesResult {
  const thresholds: PrimitiveExtractionThresholds = {
    ...DEFAULT_EXTRACTION_THRESHOLDS,
    ...(options?.thresholds ?? {}),
  };

  const primitives: WallPrimitive[] = [];
  (raw.wall ?? []).forEach((polygon, index) => {
    primitives.push(...extractWallPrimitives(`wall-${index}`, polygon, index, { thresholds }));
  });

  const relationships = computeRelationships(primitives, thresholds);
  const summary = summarizePrimitives(primitives);

  return { primitives, relationships, summary, thresholds };
}

/** Builds the visual diagnostic summary shown at the top of the primitives section. */
export function summarizePrimitives(primitives: WallPrimitive[]): PrimitiveSummary {
  const runs = primitives.filter((p) => p.kind === 'run');
  const corners = primitives.filter((p) => p.kind === 'corner');
  const rawWallCount = new Set(primitives.map((p) => p.sourceObjectId)).size;

  const horizontal = runs.filter((r) => r.orientation === 'horizontal').length;
  const vertical = runs.filter((r) => r.orientation === 'vertical').length;
  const diagonal = runs.filter((r) => r.orientation === 'diagonal').length;

  return {
    rawWallCount,
    totalPrimitives: primitives.length,
    runs: runs.length,
    corners: corners.length,
    horizontal,
    vertical,
    diagonal,
    noReliableOrientation: diagonal,
    withThicknessEvidence: runs.filter((r) => r.estimatedThicknessPx !== null).length,
    lowQuality: runs.filter((r) => r.quality === 'low').length,
    ambiguous:
      runs.filter(
        (r) =>
          r.quality === 'low' || r.thickness.reason === 'ambiguous_parallel_boundaries',
      ).length,
  };
}