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
  /** Phase 6: the validated VLM semantic document (optional). */
  semantic?: SemanticDocument | null;
  /** Phase 6: the deterministic fusion document (optional). */
  fused?: FusedExtraction | null;
  /**
   * Phase 7: the fused document extended by the deterministic recovery layer
   * (only present when fusion ran and recovery executed). Resolved entities
   * are appended to `fused`/`recovered` arrays; `recovery` holds the debug
   * surface and the still-unresolved observations.
   */
  recovered?: FusedExtraction | null;
};

// ---------------------------------------------------------------------------
// Phase 5 semantic document (the validated VLM reading, re-used verbatim)
// ---------------------------------------------------------------------------

export type SemanticSpace = {
  label: string | null;
  type: string;
  enclosed: boolean;
  usable: boolean;
  relative_location: string | null;
};

export type SemanticDoor = {
  count: number;
  type: string;
  connects: string | null;
  relative_location: string | null;
};

export type SemanticWindow = {
  count: number;
  space: string | null;
  wall: string | null;
  relative_location: string | null;
};

export type SemanticStairs = {
  present: boolean;
  relative_location: string | null;
  direction: 'up' | 'down' | null;
};

export type SemanticFurniture = {
  item: string | null;
  space: string | null;
};

export type SemanticDocument = {
  schema?: string;
  spaces: SemanticSpace[];
  doors: SemanticDoor[];
  windows: SemanticWindow[];
  stairs: SemanticStairs;
  dimensions: { value: string | null; unit: string }[];
  annotations: { text: string | null; kind: string }[];
  furniture: SemanticFurniture[];
};

// ---------------------------------------------------------------------------
// Phase 6 fused document (`vista-geometry-fused-v1`)
// ---------------------------------------------------------------------------

export type FusedRoom = {
  id: string;
  polygon: RawPoint[];
  area_px?: number;
  wall_ids?: string[];
  confidence: number | null;
  derived: boolean;
  name: string | null;
  type: string;
  relative_location?: string | null;
  provenance: { geometric: string | null; semantic: string | null };
  match_reason?: string;
};

export type FusedWall = {
  id: string;
  start: RawPoint;
  end: RawPoint;
  thickness: number;
  type: 'exterior' | 'interior' | 'unknown';
  confidence: number;
  provenance: { geometric: string | null; semantic: string | null };
  type_evidence: string[];
};

export type FusedOpening = {
  candidate_id: string;
  wall_id: string;
  position: number;
  width: number;
  confidence: number | null;
  corrected: boolean;
  /** Present only when a semantic observation selected this candidate. */
  semantic_match?: boolean;
  connects?: string | null;
  semantic_type?: string | null;
  space?: string | null;
  match_reason?: string;
  score?: number;
  provenance: { geometric: string | null; semantic: string | null };
  /** Phase 7: set true on entities re-derived by the recovery layer. */
  recovery?: boolean;
  /** Phase 7: evidence level of a recovered opening (high/medium/low). */
  evidence_level?: 'high' | 'medium' | 'low';
};

export type FusedStair = {
  anchor: [number, number];
  direction: 'up' | 'down' | null;
  relative_location: string | null;
  confidence: null;
  geometric: boolean;
  provenance: { geometric: null; semantic: string };
  region_id?: string | null;
  region_label?: string | null;
  /** Phase 7: recovery provenance/region for a recovered stair. */
  recovery?: boolean;
  evidence_level?: 'high' | 'medium' | 'low';
  recovered_reason?: string;
  region?: {
    center: [number, number];
    extent_x: [number, number];
    extent_y: [number, number];
    orientation: 'horizontal' | 'vertical';
  };
};

export type FusedUnresolved = {
  spaces: { label: string | null; type: string; relative_location: string | null; reason: string }[];
  doors: { connects: string | null; relative_location: string | null; reason: string }[];
  windows: { space: string | null; wall: string | null; relative_location: string | null; reason: string }[];
};

export type FusedExtraction = {
  schema: string;
  counts: {
    walls: number;
    rooms: number;
    doors: number;
    windows: number;
    stairs: number;
    unresolved_spaces: number;
    unresolved_doors: number;
    unresolved_windows: number;
  };
  walls: FusedWall[];
  rooms: FusedRoom[];
  doors: FusedOpening[];
  windows: FusedOpening[];
  stairs: FusedStair[];
  dimensions: { value: string | null; unit: string; source: string }[];
  furniture: SemanticFurniture[];
  unresolved: FusedUnresolved;
  suppressed_openings: {
    candidate_id: string;
    kind: 'door' | 'window';
    space: string | null;
    reason: string;
  }[];
  debug: {
    schema: string;
    room_matches: {
      space_index: number;
      space_label: string | null;
      candidate_id: string;
      score: number;
      contained: boolean;
      anchor_distance_px: number;
      reason: string;
    }[];
    door_matches: {
      semantic_index: number;
      connects: string | null;
      candidate_id: string;
      wall_id: string;
      score: number;
      factors: string[];
    }[];
    window_matches: {
      semantic_index: number;
      space: string | null;
      wall: string | null;
      candidate_id: string;
      wall_id: string;
      score: number;
      factors: string[];
    }[];
    thresholds: { door: number; window: number };
    stairs_hint: { x: number; y: number } | null;
  };
  notes: Record<string, unknown>;
  /**
   * Phase 7: the recovery surface. When present, resolved entities were
   * appended to the arrays above (marked `recovery` in provenance) and the
   * still-unresolved observations carry `recovery_reason`.
   */
  recovery?: RecoveryExtraction | null;
};

// ---------------------------------------------------------------------------
// Phase 7 recovery document (`vista-geometry-recovery-v1`)
// ---------------------------------------------------------------------------

export type RecoveredWindow = {
  candidate_id: string;
  wall_id: string;
  position: number;
  width: number;
  confidence: null;
  corrected: boolean;
  semantic_match: boolean;
  recovery: boolean;
  space?: string | null;
  wall?: string | null;
  semantic_index?: number;
  evidence_level: 'high' | 'medium' | 'low';
  recovered_reason: string;
  provenance: { geometric: 'image_recovery'; semantic: 'vlm'; recovery: true };
};

export type RecoveredDoor = {
  candidate_id: string;
  wall_id: string;
  position: number;
  width: number;
  confidence: null;
  corrected: boolean;
  semantic_match: boolean;
  recovery: boolean;
  semantic_type?: string;
  connects?: string | null;
  swing?: string;
  evidence_level: 'high' | 'medium' | 'low';
  recovered_reason: string;
  provenance: { geometric: 'image_recovery'; semantic: 'vlm'; recovery: true };
};

export type RecoveredStair = {
  anchor: [number, number];
  direction: 'up' | 'down' | null;
  geometric: boolean;
  region?: {
    center: [number, number];
    extent_x: [number, number];
    extent_y: [number, number];
    orientation: 'horizontal' | 'vertical';
  };
  evidence_level: 'high' | 'medium' | 'low';
  recovered_reason: string;
  provenance: { geometric: 'image_recovery'; semantic: 'vlm'; recovery: true };
};

export type RecoveryExtraction = {
  schema: string;
  counts: {
    recovered_windows: number;
    recovered_doors: number;
    recovered_rooms: number;
    recovered_stairs: number;
    unresolved_windows: number;
    unresolved_doors: number;
    unresolved_spaces: number;
  };
  windows: RecoveredWindow[];
  doors: RecoveredDoor[];
  rooms: unknown[];
  stairs: RecoveredStair[];
  unresolved: {
    windows: { space: string | null; recovery_reason: string }[];
    doors: { connects: string | null; recovery_reason: string }[];
    spaces: { label: string | null; recovery_reason: string }[];
  };
  notes: Record<string, unknown>;
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