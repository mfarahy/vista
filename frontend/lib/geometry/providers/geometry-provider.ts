import type { VistaGeometry } from '../models/geometry';

/**
 * Input to a geometry provider: the source floor plan image and its natural
 * pixel dimensions, which providers use as the coordinate reference frame.
 */
export type FloorPlanImage = {
  width: number;
  height: number;
};

/**
 * The extraction boundary between raw floor-plan imagery and the normalized
 * `VistaGeometry` model. The UI only ever consumes `VistaGeometry`; a future AI
 * extraction model can be dropped in behind this same interface without any UI
 * changes.
 */
export interface GeometryProvider {
  /**
   * Produces a normalized `VistaGeometry` for the given source image.
   * Deterministic for the current mock implementation.
   */
  extract(image: FloorPlanImage): VistaGeometry;
}
