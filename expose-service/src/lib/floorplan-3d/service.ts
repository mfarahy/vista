import fs from 'node:fs/promises';
import path from 'node:path';
import type { PropertyImage } from '../types.js';
import type { FloorPlan3DProvider, FloorPlan3DRecord } from './types.js';
import {
  floorPlan3DCompletedRecord,
  floorPlan3DFailedRecord,
  floorPlan3DPendingRecord,
} from './types.js';
import { createFloorPlan3DProvider, floorPlan3DProviderName } from './index.js';
import { saveFloorPlan3D, uploadPath } from '../store.js';
import { getLogger } from '../logger.js';

/**
 * Small orchestration service for floor plan 3D generation.
 *
 * Generation is automatic and asynchronous: it starts with a persisted
 * `pending` record, runs the provider in the background, and ends with a
 * persisted `completed` (model) or `failed` (error) record. The caller never
 * awaits the provider call, so a slow or failing generation can never block
 * the property or Expose flow — the original 2D floor plan stays the
 * fallback until a completed model exists.
 *
 * The function never throws to the caller: generation failures and even
 * persistence failures are logged and recorded on the property where
 * possible. A module-level in-flight guard prevents duplicate provider calls
 * for the same property (e.g. a manual trigger racing an upload-triggered
 * run).
 */

export interface GenerateFloorPlan3DDeps {
  provider?: FloorPlan3DProvider;
  /** Reads the source floor plan file; defaults to the uploads directory. */
  readImage?: (image: PropertyImage) => Promise<Buffer>;
  persist?: (propertyId: string, record: FloorPlan3DRecord) => Promise<unknown>;
}

const inFlight = new Set<string>();

async function readImageFile(image: PropertyImage): Promise<Buffer> {
  if (!image.url.startsWith('/uploads/')) {
    throw new Error(`Floor plan image has an unsupported URL: ${image.url}`);
  }
  return fs.readFile(path.join(uploadPath, path.basename(image.url)));
}

/**
 * Generates the 3D floor plan model from the given 2D floor plan image and
 * persists the result. Never throws to the caller: failures are recorded on
 * the property record so the Expose can keep using the 2D plan.
 *
 * When a generation for the property is already running, the call is a no-op.
 */
export async function generateFloorPlan3D(
  propertyId: string,
  image: PropertyImage,
  deps: GenerateFloorPlan3DDeps = {},
): Promise<void> {
  if (inFlight.has(propertyId)) return;
  inFlight.add(propertyId);
  try {
    await runGeneration(propertyId, image, deps);
  } finally {
    inFlight.delete(propertyId);
  }
}

async function runGeneration(
  propertyId: string,
  image: PropertyImage,
  deps: GenerateFloorPlan3DDeps,
): Promise<void> {
  const log = getLogger();
  const readImage = deps.readImage ?? readImageFile;
  const persist = deps.persist ?? ((id, record) => saveFloorPlan3D(id, record));
  const providerName = deps.provider?.name ?? floorPlan3DProviderName();
  const pending = floorPlan3DPendingRecord(providerName, image.id);

  await safePersist(log, persist, propertyId, pending, 'pending');
  log.info(
    { propertyId, floorPlanId: image.id, provider: providerName },
    'Floor plan 3D generation started for property {propertyId}',
  );

  try {
    const provider = deps.provider ?? createFloorPlan3DProvider();
    const buffer = await readImage(image);
    const model = await provider.generate({
      imageBuffer: buffer,
      mimeType: image.mimeType,
    });
    // For MeltFlex the GLB artefacts are stored in the module-level cache
    let extras: Record<string, unknown> | undefined;
    if (provider.name === 'meltflex') {
      const { consumeMeltFlexResult } = await import('./meltflex-provider.js');
      const result = consumeMeltFlexResult();
      if (result) {
        extras = {
          modelUrl: result.modelUrl ?? null,
          modelBase64: result.model ?? null,
          format: result.format ?? 'glb',
          creditsUsed: result.creditsUsed ?? null,
        };
      }
    }
    await safePersist(
      log,
      persist,
      propertyId,
      floorPlan3DCompletedRecord(pending, model, extras as Parameters<typeof floorPlan3DCompletedRecord>[2]),
      'completed',
    );
    log.info(
      { propertyId, floorPlanId: image.id, provider: providerName },
      'Floor plan 3D generation completed for property {propertyId}',
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await safePersist(log, persist, propertyId, floorPlan3DFailedRecord(pending, message), 'failed');
    log.error(
      {
        err: error,
        propertyId,
        floorPlanId: image.id,
        provider: providerName,
      },
      'Floor plan 3D generation failed for property {propertyId}',
    );
  }
}

async function safePersist(
  log: ReturnType<typeof getLogger>,
  persist: (propertyId: string, record: FloorPlan3DRecord) => Promise<unknown>,
  propertyId: string,
  record: FloorPlan3DRecord,
  status: FloorPlan3DRecord['status'],
): Promise<void> {
  try {
    await persist(propertyId, record);
  } catch (error) {
    log.error(
      { err: error, propertyId, status },
      'Failed to persist floor plan 3D {status} record for property {propertyId}',
    );
  }
}