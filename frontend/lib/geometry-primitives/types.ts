/**
 * Geometric primitives — an intermediate representation between RAW
 * recognition polygons and architectural interpretation.
 *
 * Responsibilities:
 * - RAW recognition stays: "what the recognition model detected".
 * - Geometry primitives stay: "what deterministic geometry can safely be
 *   extracted from those detections".
 * - VLM / solver stay: "what architectural relationships are likely".
 *
 * This module deliberately does NOT infer wall centerlines, thickness,
 * openings, rooms, continuations or the exterior shell. It exposes the
 * straight runs and corners that are actually present in the RAW polygon
 * boundary and lets later stages interpret them.
 */

export type Point = { x: number; y: number };

export type BoundingBox = { minX: number; minY: number; maxX: number; maxY: number };

/**
 * Minimal structural subset of the RAW recognition response used by the
 * extractor — only the wall polygons are consumed. Structurally compatible
 * with the full `RawGeometry` from the recognition overlay.
 */
export type RawGeometryLike = {
  wall?: number[][][];
  [key: string]: unknown;
};

/** Image-space orientation of a straight run (y-down coordinates). */
export type PrimitiveOrientation = 'horizontal' | 'vertical' | 'diagonal';

export type PrimitiveQuality = 'high' | 'medium' | 'low';

export type PrimitiveKind = 'run' | 'corner';

/** Why thickness evidence exists (or not) — never a forced value. */
export type ThicknessReason =
  | 'reliable_parallel_boundaries'
  | 'ambiguous_parallel_boundaries'
  | 'no_parallel_boundaries';

export type ThicknessEvidence = {
  /** Measured wall-thickness evidence in pixels, or null when ambiguous/missing. */
  estimatedThicknessPx: number | null;
  /** 0..1 — confidence in the measurement. 0 when no evidence exists. */
  confidence: number;
  /** Human/debug explanation key. */
  reason: ThicknessReason;
  /** Primitives used as parallel-boundary evidence (same source polygon). */
  partnerIds: string[];
  /** Perpendicular distance to the best parallel boundary, or null. */
  offsetPx: number | null;
};

/**
 * A wall primitive extracted from a RAW wall polygon.
 *
 * IDs are stable: `wall-3:s0`, `wall-3:s1`, … (runs, longest first) and
 * `wall-3:c0`, `wall-3:c1`, … (corners, boundary order). One RAW polygon
 * MUST be allowed to produce multiple primitives.
 */
export type WallPrimitive = {
  primitiveId: string;
  sourceObjectId: string;
  sourceCategory: 'wall';
  /** Index of the source polygon inside `raw.wall`. */
  sourcePolygonIndex: number;
  kind: PrimitiveKind;
  from: Point;
  to: Point;
  /** Euclidean length of the run in pixels; 0 for corners. */
  lengthPx: number;
  /** Canonical angle in degrees in [0, 180). Corners: direction of the longest leg. */
  angleDeg: number;
  /** Corner-only: interior angle between the two incident legs. */
  vertexAngleDeg: number | null;
  orientation: PrimitiveOrientation;
  midpoint: Point;
  boundingBox: BoundingBox;
  quality: PrimitiveQuality;
  /** 0..1 — derived from length, axis alignment and straightness. */
  confidence: number;
  /** Max perpendicular deviation (px) of merged boundary vertices from the from→to line. */
  straightnessPx: number | null;
  /** True when the run is diagonal or otherwise cannot be trusted as a wall run. */
  uncertain: boolean;
  /** Convenience accessor for `thickness.estimatedThicknessPx`. */
  estimatedThicknessPx: number | null;
  thickness: ThicknessEvidence;
  /**
   * Raw polygon vertex indices (0-based, into the original RAW polygon,
   * contiguous range) consumed by this primitive — traceability back to the
   * recognition output. May wrap around the polygon end.
   */
  sourceVertexIndices: number[];
  /** Boundary-walk order used as a deterministic tie-breaker for IDs. */
  boundaryOrder: number;
};

export type PrimitiveRelationshipType =
  | 'parallel'
  | 'perpendicular'
  | 'same_axis'
  | 'close_parallel'
  | 'endpoint_proximity'
  | 'intersection'
  | 'overlap'
  | 'offset';

export type PrimitiveRelationship = {
  /** First primitive id (deterministic: lower boundary order first). */
  a: string;
  /** Second primitive id. */
  b: string;
  type: PrimitiveRelationshipType;
  /** Measured value: angle diff (deg), distance (px), overlap (px), … */
  value: number;
  unit: 'px' | 'deg';
  /** Intersection point when type === 'intersection'. */
  at?: Point;
};

/**
 * All extraction thresholds. Conservative by design — when geometry is
 * ambiguous we keep it unavailable instead of guessing.
 */
export type PrimitiveExtractionThresholds = {
  /** Deduplicate consecutive boundary points closer than this (px). */
  cleanEpsPx: number;
  /** RDP simplification epsilon — only tiny numerical noise is removed. */
  simplifyEpsPx: number;
  /** Max angle deviation (deg) for merging consecutive boundary edges into one run. */
  collinearMergeEpsDeg: number;
  /** Runs shorter than this (px) are dropped as contour noise. */
  minRunLengthPx: number;
  /** Max deviation (deg) from 0/90/180 before a run is "diagonal". */
  axisAlignedEpsDeg: number;
  /** Minimum leg length (px) for a boundary corner to be preserved. */
  cornerLegMinPx: number;
  /** Minimum interior angle (deg) between two legs to form a corner. */
  cornerMinAngleDeg: number;
  /** Angle tolerance (deg) for parallel relationship. */
  parallelEpsDeg: number;
  /** Angle tolerance (deg) for perpendicular relationship. */
  perpendicularEpsDeg: number;
  /** Perpendicular offset tolerance (px) for same-axis relationship. */
  sameAxisOffsetPx: number;
  /** Perpendicular offset tolerance (px) for close-parallel relationship. */
  closeParallelPx: number;
  /** Endpoint distance tolerance (px) for endpoint-proximity relationship. */
  endpointProximityPx: number;
  /** Minimum offset (px) for a thickness pairing to be plausible. */
  thicknessMinPx: number;
  /** Maximum offset (px) for a thickness pairing to be plausible. */
  thicknessMaxPx: number;
  /** Required projected overlap ratio (of the shorter run) for a pairing. */
  thicknessMinOverlapRatio: number;
  /** Angle tolerance (deg) for thickness pairings. */
  thicknessAngleEpsDeg: number;
  /** Offset margin (px): two similar candidates ⇒ ambiguous thickness. */
  thicknessAmbiguityMarginPx: number;
};

export type PrimitiveSummary = {
  rawWallCount: number;
  /** Runs + corners. */
  totalPrimitives: number;
  runs: number;
  corners: number;
  horizontal: number;
  vertical: number;
  diagonal: number;
  /** Runs whose orientation is diagonal (not reliably axis-aligned). */
  noReliableOrientation: number;
  /** Runs with a non-null thickness estimate. */
  withThicknessEvidence: number;
  /** Low-quality or thickness-ambiguous primitives. */
  ambiguous: number;
  lowQuality: number;
};

export type GeometryPrimitivesResult = {
  primitives: WallPrimitive[];
  relationships: PrimitiveRelationship[];
  summary: PrimitiveSummary;
  thresholds: PrimitiveExtractionThresholds;
};