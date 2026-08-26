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