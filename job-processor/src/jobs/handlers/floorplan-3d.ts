import { z } from 'zod';
import type { JobRunContext } from '../dispatcher.js';
import { createDocumentStorage } from '../../lib/document-storage.js';
import { getPrisma } from '../../lib/db.js';
import { resolveProvider, buildGlbFromGeometry, type FloorPlanProvider } from '../../lib/floorplan-providers/index.js';
import type { MeltFlexError } from '../../lib/meltflex-provider.js';

const PayloadSchema = z.object({
  assetId: z.string().min(1),
  r2Key: z.string().optional(),
  mimeType: z.string().optional(),
  fileName: z.string().optional(),
  provider: z.string().optional(),
});

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : String(error);
}

export interface Floorplan3DHandlerDeps {
  storage?: ReturnType<typeof createDocumentStorage>;
  prisma?: ReturnType<typeof getPrisma>;
  /** Override provider resolution. Pass null to force "no provider" error. Pass undefined to use default resolution. */
  providerOverride?: FloorPlanProvider | null;
}

export function makeFloorplan3DHandler(deps: Floorplan3DHandlerDeps = {}) {
  const storageFactory = deps.storage ? () => deps.storage! : createDocumentStorage;
  const prismaFactory = deps.prisma ? () => deps.prisma! : getPrisma;

  return async function floorplan3DHandler(ctx: JobRunContext): Promise<{ message?: string }> {
    const { jobId } = ctx.job;
    const log = ctx.log;
    const payload = PayloadSchema.parse(ctx.job.payload ?? {});

    log.info(
      { jobId, assetId: payload.assetId, provider: payload.provider ?? '(default)' },
      'Floorplan 3D job {jobId} started for asset {assetId}',
    );

    await ctx.update({ currentStep: 'loading_image', message: 'Loading floor plan image', progress: 10 });

    const storage = storageFactory();
    const file = await storage.get(payload.assetId);
    if (!file) {
      log.error(
        { jobId, assetId: payload.assetId, r2Key: payload.r2Key },
        'Floor plan asset {assetId} NOT FOUND in storage — check R2 key {r2Key}',
      );
      throw new Error(`Floor plan asset ${payload.assetId} not found in storage`);
    }
    const mimeType = payload.mimeType || file.mimeType || 'image/png';
    log.info(
      {
        jobId,
        assetId: payload.assetId,
        bytes: file.content.length,
        mimeType,
      },
      'Resolved floor plan image {assetId} from storage — {bytes} bytes, mimeType={mimeType}',
    );

    // Resolve the provider
    const provider = deps.providerOverride !== undefined ? deps.providerOverride : resolveProvider(payload.provider);
    if (!provider) {
      const providerName = payload.provider ?? '(default)';
      log.error({ jobId, assetId: payload.assetId, provider: providerName }, 'No available provider for {provider}');
      throw new Error(`Provider "${providerName}" is not configured or unavailable`);
    }

    log.info({ jobId, assetId: payload.assetId, provider: provider.name }, 'Using provider {provider} for {assetId}');

    await ctx.update({ currentStep: 'calling_provider', message: 'Converting floor plan to 3D', progress: 40 });

    // Build accessible image URL
    const signedUrl = storage.getSignedUrl ? await storage.getSignedUrl(payload.assetId, 900).catch(() => null) : null;
    const imageUrl = signedUrl
      ?? `${process.env.PUBLIC_API_BASE_URL || process.env.API_BASE_URL || ''}/api/floorplan3d/image/${encodeURIComponent(payload.assetId)}`;

    const startedAt = performance.now();

    // Call the provider
    const result = await provider.process(
      {
        assetId: payload.assetId,
        imageUrl,
        mimeType,
        imageBuffer: file.content,
      },
      log,
    );

    const durationMs = Math.round(performance.now() - startedAt);

    log.info(
      {
        jobId,
        assetId: payload.assetId,
        provider: provider.name,
        resultType: result.type,
        durationMs,
      },
      'Provider {provider} completed for {assetId} — type={resultType}, duration={durationMs}ms',
    );

    await ctx.update({ currentStep: 'storing_result', message: 'Saving 3D model', progress: 80 });

    let storedModelUrl: string | null = null;
    let storedBase64: string | null = null;
    let format = 'glb';

    if (result.type === 'geometry') {
      // Convert geometry to GLB using the internal builder
      log.info({ jobId, assetId: payload.assetId }, 'Converting geometry to GLB via Vista 3D builder');
      const glbBuffer = buildGlbFromGeometry(result.geometry);

      const resultAssetId = `floorplan-result-${jobId}`;
      await storage.put(resultAssetId, glbBuffer, 'model/gltf-binary');
      storedModelUrl = `/api/floorplan3d/result/${jobId}/file`;
      format = 'glb';

      log.info(
        { jobId, resultAssetId, bytes: glbBuffer.length },
        'Stored geometry-derived GLB to R2 as {resultAssetId} ({bytes} bytes)',
      );
    } else {
      // Direct-3D result (e.g., MeltFlex GLB)
      storedModelUrl = result.modelUrl ?? null;
      storedBase64 = result.modelBase64 ?? null;
      format = result.format ?? 'glb';

      if (result.creditsUsed !== undefined && result.creditsUsed !== null) {
        log.info({ jobId, creditsUsed: result.creditsUsed }, 'Provider consumed {creditsUsed} credits');
      }

      // If only base64 was returned, persist GLB to R2
      if (!storedModelUrl && storedBase64) {
        log.info({ jobId, modelBase64Length: storedBase64.length }, 'Converting base64 GLB to R2 storage');
        try {
          const glbBytes = Buffer.from(storedBase64, 'base64');
          const glbMagic = glbBytes.length >= 4 ? glbBytes.subarray(0, 4).toString() : 'too short';
          if (glbBytes.length < 12 || glbMagic !== 'glTF') {
            log.warn(
              { jobId, glbBytes: glbBytes.length, glbMagic },
              'GLB base64 does not start with glTF magic header',
            );
          }
          const resultAssetId = `floorplan-result-${jobId}`;
          await storage.put(resultAssetId, glbBytes, 'model/gltf-binary');
          storedModelUrl = `/api/floorplan3d/result/${jobId}/file`;
          storedBase64 = null; // Clear to avoid storing large payload twice
          log.info({ jobId, resultAssetId, bytes: glbBytes.length }, 'Stored base64 GLB to R2 as {resultAssetId}');
        } catch (error) {
          log.error({ jobId, err: error }, 'Failed to persist base64 GLB to storage');
          throw new Error(`Failed to store GLB result: ${errorMessage(error)}`);
        }
      }
    }

    // Persist result on job row
    const prisma = prismaFactory();
    try {
      const existing = await prisma.job.findUnique({ where: { id: jobId } });
      const payloadWithResult = {
        ...(existing?.payload as Record<string, unknown> | null ?? {}),
        result: {
          modelUrl: storedModelUrl,
          modelBase64: storedBase64,
          format,
          provider: provider.name,
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
      log.info({ jobId, modelUrl: storedModelUrl, provider: provider.name }, 'Persisted GLB result for {jobId}');
    } catch (error) {
      log.warn({ jobId, err: error }, 'Failed to persist result payload for {jobId}');
    }

    await ctx.update({ progress: 100, currentStep: 'done', message: storedModelUrl ?? 'Completed' });
    log.info(
      { jobId, assetId: payload.assetId, provider: provider.name, durationMs },
      'Floorplan 3D job {jobId} completed via {provider} in {durationMs}ms',
    );

    return { message: storedModelUrl ?? undefined };
  };
}

export const floorplan3DHandler = makeFloorplan3DHandler();
