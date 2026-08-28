import { z } from 'zod';
import type { JobRunContext } from '../dispatcher.js';
import { createDocumentStorage } from '../../lib/document-storage.js';
import { callMeltFlex, callMeltFlexViaUrl, MeltFlexError } from '../../lib/meltflex-provider.js';
import { getPrisma } from '../../lib/db.js';

const PayloadSchema = z.object({
  assetId: z.string().min(1),
  r2Key: z.string().optional(),
  mimeType: z.string().optional(),
  fileName: z.string().optional(),
});

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : String(error);
}

export interface Floorplan3DHandlerDeps {
  storage?: ReturnType<typeof createDocumentStorage>;
  callMeltFlex?: typeof callMeltFlex;
  callMeltFlexViaUrl?: typeof callMeltFlexViaUrl;
  prisma?: ReturnType<typeof getPrisma>;
}

export function makeFloorplan3DHandler(deps: Floorplan3DHandlerDeps = {}) {
  const storageFactory = deps.storage ? () => deps.storage! : createDocumentStorage;
  const meltFlex = deps.callMeltFlex ?? callMeltFlex;
  const meltFlexUrl = deps.callMeltFlexViaUrl ?? callMeltFlexViaUrl;
  const prismaFactory = deps.prisma ? () => deps.prisma! : getPrisma;

  return async function floorplan3DHandler(ctx: JobRunContext): Promise<{ message?: string }> {
    const { jobId } = ctx.job;
    const log = ctx.log;
    const payload = PayloadSchema.parse(ctx.job.payload ?? {});

    log.info({ jobId, assetId: payload.assetId }, 'Floorplan 3D job {jobId} started for asset {assetId}');

    await ctx.update({ currentStep: 'loading_image', message: 'Loading floor plan image', progress: 10 });

    const storage = storageFactory();
  const file = await storage.get(payload.assetId);
  if (!file) {
    throw new Error(`Floor plan asset ${payload.assetId} not found in storage`);
  }
  const mimeType = payload.mimeType || file.mimeType || 'image/png';
  log.info({ jobId, assetId: payload.assetId, bytes: file.content.length, mimeType }, 'Resolved floor plan image {assetId} from R2: {bytes} bytes');

  await ctx.update({ currentStep: 'calling_meltflex', message: 'Converting floor plan to 3D', progress: 40 });

  let result: Awaited<ReturnType<typeof meltFlex>>;
  // Prefer signed URL when R2 is configured, otherwise fall back to base64
  const signedUrl = storage.getSignedUrl ? await storage.getSignedUrl(payload.assetId, 900).catch(() => null) : null;
  const useSignedUrl = typeof signedUrl === 'string' && signedUrl.length > 0;

  if (useSignedUrl) {
    log.info({ jobId, assetId: payload.assetId, signedUrlLength: signedUrl!.length }, 'Using signed URL for MeltFlex imageUrl (expires in 15m)');
    try {
      result = await meltFlexUrl(signedUrl!);
    } catch (error) {
      if (error instanceof MeltFlexError && error.status === 400) {
        log.warn({ jobId, err: error }, 'MeltFlex rejected imageUrl, retrying with base64 fallback');
        result = await meltFlex(file.content, mimeType);
      } else {
        throw error;
      }
    }
  } else {
    const baseUrl = process.env.PUBLIC_API_BASE_URL || process.env.API_BASE_URL || process.env.EXPOSE_SERVICE_URL || '';
    let imageUrl: string | null = null;
    if (baseUrl) {
      imageUrl = `${baseUrl.replace(/\/$/, '')}/api/floorplan3d/image/${encodeURIComponent(payload.assetId)}`;
      log.info({ jobId, imageUrl }, 'Trying public image URL for MeltFlex: {imageUrl}');
      try {
        result = await meltFlexUrl(imageUrl);
      } catch (error) {
        log.warn({ jobId, err: error }, 'Public imageUrl failed, falling back to base64');
        result = await meltFlex(file.content, mimeType);
      }
    } else {
      log.info({ jobId }, 'No signed URL / public URL available — using base64 image payload');
      result = await meltFlex(file.content, mimeType);
    }
  }

  log.info(
    { jobId, hasModelUrl: Boolean(result.modelUrl), hasModelBase64: Boolean(result.model), format: result.format, creditsUsed: result.creditsUsed },
    'MeltFlex request completed for {jobId}: url={hasModelUrl} format={format}',
  );

  await ctx.update({ currentStep: 'storing_result', message: 'Saving 3D model', progress: 80 });

  let storedModelUrl: string | null = result.modelUrl ?? null;
  let storedBase64: string | null = result.model ?? null;

  // If only base64 was returned, persist GLB to R2 so frontend can load via URL instead of inline base64
  if (!storedModelUrl && storedBase64) {
    try {
      const glbBytes = Buffer.from(storedBase64, 'base64');
      // Basic GLB validation: magic header "glTF"
      if (glbBytes.length < 12 || glbBytes.subarray(0, 4).toString() !== 'glTF') {
        log.warn({ jobId, glbBytes: glbBytes.length }, 'GLB base64 does not start with glTF magic — storing anyway');
      }
      const resultAssetId = `floorplan-result-${jobId}`;
      await storage.put(resultAssetId, glbBytes, 'model/gltf-binary');
      storedModelUrl = `/api/floorplan3d/result/${jobId}/file`;
      log.info({ jobId, resultAssetId, bytes: glbBytes.length }, 'Stored base64 GLB to R2 as {resultAssetId} ({bytes} bytes)');
      // Clear base64 to avoid storing large payload twice in DB
      storedBase64 = null;
    } catch (error) {
      log.error({ jobId, err: error }, 'Failed to persist base64 GLB to storage');
      throw new Error(`Failed to store GLB result: ${errorMessage(error)}`);
    }
  }

  // Persist result on job row so frontend can load it via GET /api/jobs/:id
  const prisma = prismaFactory();
  try {
    const existing = await prisma.job.findUnique({ where: { id: jobId } });
    const payloadWithResult = {
      ...(existing?.payload as Record<string, unknown> | null ?? {}),
      result: {
        modelUrl: storedModelUrl,
        modelBase64: storedBase64,
        format: result.format ?? 'glb',
        creditsUsed: result.creditsUsed ?? null,
        assetId: payload.assetId,
      },
    };
    await prisma.job.update({
      where: { id: jobId },
      data: {
        payload: payloadWithResult as never,
        message: storedModelUrl ?? '3D model generated',
      },
    });
    log.info({ jobId, modelUrl: storedModelUrl, hasBase64: Boolean(storedBase64) }, 'Persisted GLB result for {jobId}');
  } catch (error) {
    log.warn({ jobId, err: error }, 'Failed to persist result payload for {jobId}');
  }

  await ctx.update({ progress: 100, currentStep: 'done', message: storedModelUrl ?? 'Completed' });
  log.info({ jobId, assetId: payload.assetId }, 'Floorplan 3D job {jobId} completed — cleanup done (preserving original asset)');

  return { message: storedModelUrl ?? undefined };
  };
}

export const floorplan3DHandler = makeFloorplan3DHandler();

// Transient errors should be retried if the infrastructure supports it; currently the
// consumer marks jobs failed without retry, so we surface the classification in the log.
export function isTransientMeltFlexError(error: unknown): boolean {
  if (error instanceof MeltFlexError) {
    return [429, 502, 503].includes(error.status);
  }
  return false;
}
