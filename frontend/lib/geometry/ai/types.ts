/**
 * Types for the "raw model output" produced by the geometry-ai service.
 *
 * These structures describe the *model output*, not the `VistaGeometry`
 * schema. Only the AI adapter (`geometry-adapter.ts`) reads them; React
 * components never see them.
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

export type GeometryAiMeta = {
  modelId: string;
  epoch: number | null;
  license: string;
  inferenceMs: number;
};

export type GeometryAiResponse = {
  geometry: import('../models/geometry').VistaGeometry;
  meta: GeometryAiMeta;
};