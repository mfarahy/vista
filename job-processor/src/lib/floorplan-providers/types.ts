import type { Logger } from 'pino';

/**
 * Supported 2D-to-3D provider identifiers.
 * Add new providers here as they are integrated.
 */
export type FloorPlanProviderName = 'floorplan-recognition' | 'meltflex';

/**
 * Input shared by all providers: a reference to the floor-plan image
 * stored in R2, with an accessible URL for the AI service.
 */
export interface FloorPlanProviderInput {
  /** Unique asset ID (R2 key component). */
  assetId: string;
  /** Accessible URL the provider can fetch the image from (signed or public). */
  imageUrl: string;
  /** MIME type of the source image. */
  mimeType: string;
  /** Raw image bytes (fallback when URL delivery is not supported). */
  imageBuffer: Buffer;
}

/**
 * Structured floor-plan geometry returned by geometry providers
 * (e.g. floorplan-recognition). Direct-3D providers (e.g. MeltFlex)
 * skip this and return GLB directly.
 *
 * Each field is an array of polygons. Each polygon is an array of [x, y] points.
 */
export interface FloorPlanGeometry {
  wall: number[][][];
  door: number[][][];
  entry_door: number[][][];
  window: number[][][];
  kitchen: number[][][];
  door_center_line: number[][][];
  entry_door_center_line: number[][][];
  window_center_line: number[][][];
}

/**
 * Result from a geometry provider: structured floor-plan data
 * that Vista's 3D builder converts to GLB.
 */
export interface GeometryProviderResult {
  type: 'geometry';
  geometry: FloorPlanGeometry;
}

/**
 * Result from a direct-3D provider: ready-to-use GLB data.
 */
export interface Direct3DProviderResult {
  type: 'direct-3d';
  /** URL to the GLB model (if hosted). */
  modelUrl?: string | null;
  /** Base64-encoded GLB model (fallback). */
  modelBase64?: string | null;
  /** Model format, typically 'glb'. */
  format: string;
  /** Credits consumed (optional, for metering). */
  creditsUsed?: number | null;
}

/** Union of all provider result types. */
export type FloorPlanProviderResult = GeometryProviderResult | Direct3DProviderResult;

/**
 * The contract every 2D-to-3D provider must implement.
 *
 * Providers are stateless; all context flows through the input.
 * The handler owns orchestration, storage, and error recovery.
 */
export interface FloorPlanProvider {
  /** Stable identifier persisted with job records. */
  readonly name: FloorPlanProviderName;

  /** Whether the provider is configured and ready to handle requests. */
  isAvailable(): boolean;

  /**
   * Process a floor-plan image and return the provider-specific result.
   * Geometry providers return structured data; direct-3D providers return GLB.
   */
  process(
    input: FloorPlanProviderInput,
    log: Logger,
  ): Promise<FloorPlanProviderResult>;
}
