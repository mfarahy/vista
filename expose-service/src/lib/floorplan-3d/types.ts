import type { FloorPlan3DModel } from './schema.js';

/**
 * Floor plan 3D generation boundary.
 *
 * The application layer only knows this interface: it receives the original
 * 2D floor plan and gets back the standardized 3D model. OpenAI is the only
 * implementation for the MVP; the interface is kept small so a MeltFlexAI
 * provider can be added later without touching the service or the routes.
 */

export type FloorPlan3DStatus = 'pending' | 'completed' | 'failed';

export interface FloorPlan3DInput {
  /** Raw bytes of the original 2D floor plan image. */
  imageBuffer: Buffer;
  mimeType: string;
  /** Optional property context that helps the model interpret the plan. */
  property?: {
    address?: string | null;
    livingAreaM2?: number | null;
    totalRooms?: number | null;
  };
}

export interface FloorPlan3DProvider {
  /** Stable provider identifier persisted with the record, e.g. `openai`. */
  readonly name: string;
  generate(input: FloorPlan3DInput): Promise<FloorPlan3DModel>;
}

/**
 * Persisted generation record on the property. Kept minimal: status, the
 * source 2D plan, the provider, and the resulting model or error. A completed
 * model is reused without calling the provider again.
 */
export interface FloorPlan3DRecord {
  status: FloorPlan3DStatus;
  provider: string;
  /** PropertyImage id of the 2D floor plan the model was generated from. */
  sourceImageId: string;
  /** Generated 3D model; only set when status is `completed`. */
  model: FloorPlan3DModel | null;
  /** Generation error message; only set when status is `failed`. */
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export function floorPlan3DPendingRecord(
  provider: string,
  sourceImageId: string,
): FloorPlan3DRecord {
  const now = new Date().toISOString();
  return {
    status: 'pending',
    provider,
    sourceImageId,
    model: null,
    error: null,
    createdAt: now,
    updatedAt: now,
  };
}

export function floorPlan3DCompletedRecord(
  pending: FloorPlan3DRecord,
  model: FloorPlan3DModel,
): FloorPlan3DRecord {
  return { ...pending, status: 'completed', model, updatedAt: new Date().toISOString() };
}

export function floorPlan3DFailedRecord(
  pending: FloorPlan3DRecord,
  error: string,
): FloorPlan3DRecord {
  return { ...pending, status: 'failed', error, updatedAt: new Date().toISOString() };
}