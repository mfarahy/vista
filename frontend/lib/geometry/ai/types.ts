/**
 * Types for the document produced by the geometry-ai service.
 *
 * These structures describe the *model output* (raw) and its deterministic
 * post-processing (normalized), not the `VistaGeometry` schema. Only the AI
 * adapter (`geometry-adapter.ts`) reads them; React components never see them.
 */

export type RawPoint = [number, number];

export type RawPolygon = {
  outer: RawPoint[];
  holes: RawPoint[][];
  confidence: number;
  area_mask_px: number;
};

export type RawWallSegment = {
  start: RawPoint;
  end: RawPoint;
  thickness: number;
  type: 'exterior' | 'interior';
  confidence: number;
  length_mask_px: number;
};

/** The untouched UNet post-processing output (Phase 2 schema). */
export type RawExtraction = {
  schema: string;
  counts: Record<string, number>;
  polygons: {
    floor: RawPolygon[];
    wall: RawPolygon[];
    door: RawPolygon[];
    window: RawPolygon[];
  };
  floor_regions: RawPolygon[];
  walls: RawWallSegment[];
};

/** Result of the deterministic Phase 3 normalization layer. */
export type NormalizedWall = {
  id: string;
  start: RawPoint;
  end: RawPoint;
  thickness: number;
  type: 'exterior' | 'interior';
  confidence: number;
  /** True when deterministic post-processing moved an endpoint. */
  snapped: boolean;
};

export type NormalizedRoom = {
  id: string;
  polygon: RawPoint[];
  area_px: number;
  wall_ids: string[];
  confidence: number | null;
  /** Always true: rooms are derived from wall topology, not model output. */
  derived: boolean;
  validation: {
    closed: boolean;
    simple: boolean;
    min_dim_px: number;
  };
};

export type NormalizedOpening = {
  id: string;
  wall_id: string;
  /** Fractional position (0..1) of the opening centre along its host wall. */
  position: number;
  width: number;
  confidence: number;
  /** True when the opening had to be moved onto its wall. */
  corrected: boolean;
};

export type NormalizedExtraction = {
  schema: string;
  walls: NormalizedWall[];
  rooms: NormalizedRoom[];
  doors: NormalizedOpening[];
  windows: NormalizedOpening[];
  counts: { walls: number; rooms: number; doors: number; windows: number };
  notes: Record<string, unknown>;
  candidates?: CandidatesExtraction;
  refinement?: { provider: string } | null;
};

/** Room candidate status in the Phase 4 debug representation. */
export type RoomCandidateStatus = 'accepted' | 'rejected';

/** Opening candidate status in the Phase 4 debug representation. */
export type OpeningCandidateStatus = 'valid' | 'uncertain' | 'invalid';

export type RoomCandidate = {
  id: string;
  polygon: RawPoint[];
  area_px: number;
  min_dim_px: number;
  status: RoomCandidateStatus;
  /** Decisive rejection reason, or "valid" when accepted. */
  reason: string;
  wall_ids: string[];
  confidence: number | null;
};

export type OpeningCandidate = {
  id: string;
  kind: 'door' | 'window';
  polygon: RawPoint[];
  confidence: number;
  status: OpeningCandidateStatus;
  /** Machine-readable codes explaining an uncertainty/invalidation. */
  reasons: string[];
  nearest_wall_index: number | null;
  nearest_wall_id: string | null;
  distance_to_wall_px: number | null;
  extent_along_px: number | null;
  extent_perp_px: number | null;
};

/**
 * Phase 4 debug representation. Every candidate the pipeline considered is
 * preserved here — accepted, ambiguous and rejected alike — with the reasons
 * behind its final classification. Rejected candidates do not enter
 * `VistaGeometry` but stay available for inspection and AI refinement.
 */
export type CandidatesExtraction = {
  schema: string;
  rooms: RoomCandidate[];
  openings: { door: OpeningCandidate[]; window: OpeningCandidate[] };
  ambiguous_opening_ids: string[];
  invalid_opening_ids: string[];
  selected_room_ids: string[];
};

export type RawModelResult = {
  schema: string;
  model: {
    id: string;
    artifact: string;
    license: string;
    epoch: number | null;
    checkpoint: string;
  };
  input: { width: number; height: number };
  canvas_size: [number, number];
  content_rect: [number, number, number, number];
  classes: string[];
  timing_ms: Record<string, number>;
  raw: RawExtraction;
  normalized: NormalizedExtraction;
};

export type GeometryAiMeta = {
  modelId: string;
  epoch: number | null;
  license: string;
  inferenceMs: number;
};

export type GeometryAiResponse = {
  /** Normalized `VistaGeometry` (primary). */
  geometry: import('../models/geometry').VistaGeometry;
  /** Raw model-derived `VistaGeometry` for the debug comparison mode. */
  rawGeometry: import('../models/geometry').VistaGeometry;
  meta: GeometryAiMeta;
};