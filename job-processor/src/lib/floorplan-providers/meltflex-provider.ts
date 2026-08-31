import type { Logger } from 'pino';
import { callMeltFlex, callMeltFlexViaUrl, MeltFlexError } from '../meltflex-provider.js';
import type {
  FloorPlanProvider,
  FloorPlanProviderInput,
  FloorPlanProviderResult,
} from './types.js';

/**
 * Provider that delegates to MeltFlexAI for direct 2D-to-3D conversion.
 *
 * MeltFlex returns a GLB model directly — no intermediate geometry step.
 * The handler stores the GLB to R2 and serves it to the frontend.
 */
export class MeltFlexProvider implements FloorPlanProvider {
  readonly name = 'meltflex' as const;

  isAvailable(): boolean {
    return Boolean(process.env.MELTFLEX_API_KEY);
  }

  async process(
    input: FloorPlanProviderInput,
    log: Logger,
  ): Promise<FloorPlanProviderResult> {
    log.info(
      {
        provider: this.name,
        assetId: input.assetId,
        imageUrlLength: input.imageUrl.length,
        imageBytes: input.imageBuffer.length,
      },
      'MeltFlex provider starting — assetId={assetId}',
    );

    const startedAt = performance.now();

    // Prefer imageUrl delivery; fall back to base64 if it fails with fetch errors
    let result: Awaited<ReturnType<typeof callMeltFlex>>;
    try {
      result = await callMeltFlexViaUrl(input.imageUrl);
    } catch (error) {
      const isFetchFailure =
        error instanceof MeltFlexError &&
        (error.status === 400 || (/[45]\d\d/.test(String(error.status)) && /fetch failed/i.test(error.message)));

      if (isFetchFailure) {
        log.warn(
          { provider: this.name, assetId: input.assetId, err: error },
          'MeltFlex imageUrl failed, falling back to base64',
        );
        result = await callMeltFlex(input.imageBuffer, input.mimeType);
      } else {
        throw error;
      }
    }

    const durationMs = Math.round(performance.now() - startedAt);

    log.info(
      {
        provider: this.name,
        assetId: input.assetId,
        hasModelUrl: Boolean(result.modelUrl),
        hasModelBase64: Boolean(result.model),
        format: result.format,
        creditsUsed: result.creditsUsed,
        durationMs,
      },
      'MeltFlex provider completed — duration={durationMs}ms',
    );

    return {
      type: 'direct-3d',
      modelUrl: result.modelUrl ?? null,
      modelBase64: result.model ?? null,
      format: result.format ?? 'glb',
      creditsUsed: result.creditsUsed ?? null,
    };
  }
}
