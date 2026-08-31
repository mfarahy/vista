/**
 * Floor-plan reconstruction pipeline (2D recognition JSON → 3D model).
 *
 * Recognition JSON
 *   → normalizeGeometry()   clean walls, openings, bounds (pixel space)
 *   → detectRooms()         enclosed room polygons from the wall mask
 *   → buildFloorPlan3DModel() meter-space 3D model with wall openings
 *   → renderDebugSvg()      optional 2D debug view
 */

import { normalizeGeometry } from './normalize.js';
import { detectRooms } from './rooms.js';
import { buildFloorPlan3DModel, type FloorPlan3DModel } from './model3d.js';
import { renderDebugSvg } from './svg.js';
import type { DetectedRoom, NormalizedFloorPlan, RecognitionGeometry, WallRun } from './types.js';

export type { NormalizedFloorPlan, RecognitionGeometry, WallRun, Opening, DetectedRoom } from './types.js';
export { normalizeGeometry } from './normalize.js';
export { detectRooms } from './rooms.js';
export { buildFloorPlan3DModel, WALL_HEIGHT_M, DOOR_HEIGHT_M, WINDOW_HEIGHT_M } from './model3d.js';
export { renderDebugSvg } from './svg.js';

export interface FloorPlanPipelineResult {
  /** Normalized pixel-space geometry (walls, openings, rooms). */
  normalized: NormalizedFloorPlan;
  /** Detected rooms (same objects as `normalized.rooms`). */
  rooms: DetectedRoom[];
  /** Meter-space 3D model for the frontend viewer. */
  model3d: FloorPlan3DModel;
  /** 2D debug SVG of the processed geometry. */
  debugSvg: string;
}

/** Compact debug payload stored on the job for the frontend 2D/3D view. */
export interface PipelineDebugResult {
  normalized: Omit<NormalizedFloorPlan, 'regions' | 'walls'> & {
    walls: Array<Omit<WallRun, 'polygon'>>;
  };
  rooms: DetectedRoom[];
  model3d: FloorPlan3DModel;
}

/**
 * Runs the full reconstruction pipeline on raw recognition geometry.
 * Never throws for degenerate input; empty geometry yields an empty model.
 */
export function runFloorplanPipeline(
  geometry: RecognitionGeometry,
  options: { pixelsPerMeter?: number } = {},
): FloorPlanPipelineResult {
  const pixelsPerMeter = options.pixelsPerMeter ?? 50;
  const normalized = normalizeGeometry(geometry, pixelsPerMeter);
  detectRooms(normalized);
  const model3d = buildFloorPlan3DModel(normalized);
  const debugSvg = renderDebugSvg(normalized);
  return { normalized, rooms: normalized.rooms, model3d, debugSvg };
}

/**
 * Compact, JSON-serializable view of the pipeline result used as the job
 * payload for the frontend 2D/3D debug page. Raw recognition regions and
 * wall source polygons are dropped (already stored as `result.geometry`).
 */
export function pipelineDebugPayload(result: FloorPlanPipelineResult): PipelineDebugResult {
  const { regions: _regions, walls, ...rest } = result.normalized;
  return {
    normalized: { ...rest, walls: walls.map(({ polygon: _polygon, ...wall }) => wall) },
    rooms: result.rooms,
    model3d: result.model3d,
  };
}