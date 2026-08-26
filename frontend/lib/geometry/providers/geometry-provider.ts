import type { VistaGeometry } from '../models/geometry';
import type { GeometryDebug } from '../geometry-debug';

/**
 * Input to a geometry provider: the source floor plan image, its natural
 * pixel dimensions (the coordinate reference frame) and, for AI extraction,
 * the raster data itself (`data`). Deterministic providers such as the mock
 * only need the dimensions and ignore `data`.
 */
export type FloorPlanImage = {
  width: number;
  height: number;
  data?: Blob;
};

/**
 * Result of an extraction. `geometry` is always the primary Vista geometry the
 * UI renders. `rawGeometry` is an optional *debug* variant (the untouched AI
 * output translated to `VistaGeometry`) that lets the geometry playground
 * compare AI raw vs normalized output. `debug` carries the Phase 4 candidate
 * representation (accepted / ambiguous / rejected candidates with reasons)
 * for the developer inspect tools. React only ever consumes `VistaGeometry`
 * as final geometry — the debug data never replaces it.
 */
export type GeometryExtraction = {
  geometry: VistaGeometry;
  rawGeometry?: VistaGeometry;
  debug?: GeometryDebug;
};

/**
 * Provider kind — used only for labeling in the UI ("Mock" vs "AI").
 * The UI itself never inspects model-specific structures.
 */
export type GeometryProviderType = 'mock' | 'ai';

/**
 * The extraction boundary between raw floor-plan imagery and the normalized
 * `VistaGeometry` model. The UI only ever consumes `VistaGeometry`; an AI
 * extraction pipeline is dropped in behind this same interface without any
 * UI changes. Extraction may be asynchronous (network + model inference), so
 * every provider returns a promise.
 */
export interface GeometryProvider {
  readonly type: GeometryProviderType;
  /**
   * Produces a normalized `VistaGeometry` for the given source image.
   */
  extract(image: FloorPlanImage): Promise<GeometryExtraction>;
}