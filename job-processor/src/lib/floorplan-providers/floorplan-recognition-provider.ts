import type { Logger } from 'pino';
import { trackExternalCall } from '../logger.js';
import type {
  FloorPlanProvider,
  FloorPlanProviderInput,
  FloorPlanProviderResult,
  FloorPlanGeometry,
} from './types.js';

/** Default Docker-model endpoint for floorplan-recognition. */
const DEFAULT_RECOGNITION_URL = 'http://localhost:5000/predictions';
const DEFAULT_TIMEOUT_MS = 120_000;

/**
 * Provider that calls the ton731/floorplan-recognition Docker model.
 *
 * The model receives a floor-plan image and returns structured geometry:
 * walls, doors, entry doors, windows, kitchen area, and center lines.
 * Vista's 3D builder then converts this geometry to GLB.
 */
export class FloorplanRecognitionProvider implements FloorPlanProvider {
  readonly name = 'floorplan-recognition' as const;

  private readonly apiUrl: string;
  private readonly timeoutMs: number;

  constructor(opts: { apiUrl?: string; timeoutMs?: number } = {}) {
    this.apiUrl = opts.apiUrl ?? process.env.FLOORPLAN_RECOGNITION_URL ?? DEFAULT_RECOGNITION_URL;
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  isAvailable(): boolean {
    return Boolean(this.apiUrl);
  }

  async process(
    input: FloorPlanProviderInput,
    log: Logger,
  ): Promise<FloorPlanProviderResult> {
    log.info(
      {
        provider: this.name,
        assetId: input.assetId,
        apiUrl: this.apiUrl,
        imageUrlLength: input.imageUrl.length,
        timeoutMs: this.timeoutMs,
      },
      'Floorplan recognition provider starting — assetId={assetId}',
    );

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const startedAt = performance.now();

    try {
      // Always prefer an inline data-URL when the image buffer is available.
      // This avoids the need for the Docker model to HTTP-fetch the image,
      // which fails when the expose-service is not reachable (dev, local storage).
      const imagePayload = input.imageBuffer.length > 0
        ? `data:${input.mimeType};base64,${input.imageBuffer.toString('base64')}`
        : input.imageUrl;

      const body = JSON.stringify({ input: { image: imagePayload } });

      const response = await trackExternalCall(
        {
          service: 'floorplan-recognition',
          operation: 'predict',
          props: { assetId: input.assetId },
        },
        () =>
          fetch(this.apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body,
            signal: controller.signal,
          }),
      );

      const durationMs = Math.round(performance.now() - startedAt);

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        log.warn(
          {
            provider: this.name,
            assetId: input.assetId,
            httpStatus: response.status,
            responseBody: text.slice(0, 1000),
            durationMs,
          },
          'Floorplan recognition non-OK response — status={httpStatus}, duration={durationMs}ms',
        );
        throw new Error(`Floorplan recognition failed with status ${response.status}: ${text.slice(0, 500)}`);
      }

      const json = (await response.json()) as {
        output?: string;
        status?: string;
        error?: string;
      };

      log.info(
        {
          provider: this.name,
          assetId: input.assetId,
          status: json.status,
          hasOutput: Boolean(json.output),
          output: json.output,
          durationMs,
        },
        'Floorplan recognition response received — status={status}, duration={durationMs}ms',
      );

      if (json.status === 'failed' || json.error) {
        throw new Error(`Floorplan recognition failed: ${json.error ?? 'unknown error'}`);
      }

      if (!json.output) {
        throw new Error('Floorplan recognition returned no output');
      }

      const geometry = parseRecognitionOutput(json.output, log);

      log.info(
        {
          provider: this.name,
          assetId: input.assetId,
          wallSegments: geometry.wall?.length ?? 0,
          doors: geometry.door?.length ?? 0,
          entryDoors: geometry.entry_door?.length ?? 0,
          windows: geometry.window?.length ?? 0,
          durationMs,
        },
        'Floorplan recognition completed — walls={wallSegments}, doors={doors}, windows={windows}, duration={durationMs}ms',
      );

      return { type: 'geometry', geometry };
    } catch (error) {
      const durationMs = Math.round(performance.now() - startedAt);
      if (error instanceof Error && error.name === 'AbortError') {
        log.error(
          { provider: this.name, assetId: input.assetId, timeoutMs: this.timeoutMs, durationMs },
          'Floorplan recognition timed out after {durationMs}ms',
        );
        throw new Error(`Floorplan recognition timed out after ${durationMs}ms`);
      }
      const cause = (error as { cause?: unknown })?.cause;
      const causeMessage =
        cause instanceof Error ? cause.message : typeof cause === 'string' ? cause : '';
      const errorString = String(error);
      const errorMessage = error instanceof Error ? error.message : errorString;
      const isInvalidUrl =
        errorString.includes('Failed to parse URL') ||
        errorMessage.includes('Failed to parse URL') ||
        errorMessage.includes('Invalid URL') ||
        this.apiUrl.includes('${') ||
        this.apiUrl.includes('$');
      if (isInvalidUrl) {
        log.error(
          { provider: this.name, assetId: input.assetId, durationMs, apiUrl: this.apiUrl, err: error },
          'Floorplan recognition service misconfigured — invalid URL',
        );
        throw new Error(
          `Floorplan recognition service is misconfigured (invalid URL: ${this.apiUrl}). Check FLOORPLAN_RECOGNITION_URL — expected like http://floorplan-recognition:5000/predictions`,
        );
      }
      const isConnectionRefused =
        (error instanceof TypeError && String(errorMessage).includes('fetch failed')) ||
        causeMessage.includes('ECONNREFUSED') ||
        (error as { code?: string })?.code === 'ECONNREFUSED' ||
        (cause as { code?: string } | undefined)?.code === 'ECONNREFUSED' ||
        errorString.includes('ECONNREFUSED');
      if (isConnectionRefused) {
        log.error(
          { provider: this.name, assetId: input.assetId, durationMs, apiUrl: this.apiUrl, err: error },
          'Floorplan recognition service not available (ECONNREFUSED) — is the model running?',
        );
        const msg = `Floorplan recognition service is not available at ${this.apiUrl} (ECONNREFUSED). The model may not be running. For local dev run: docker compose --profile floorplan up floorplan-recognition`;
        throw new Error(msg);
      }
      log.error(
        { provider: this.name, assetId: input.assetId, durationMs, apiUrl: this.apiUrl, err: error },
        'Floorplan recognition failed after {durationMs}ms',
      );
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
}

/**
 * Parse the recognition model output. The model returns a JSON string
 * containing structured geometry. The output field may be a JSON string
 * that needs parsing, or a pre-parsed object.
 */
function parseRecognitionOutput(output: string, log: Logger): FloorPlanGeometry {
  let parsed: Record<string, unknown>;

  try {
    parsed = JSON.parse(output) as Record<string, unknown>;
  } catch {
    // If it's not valid JSON, it might be the raw output format
    log.warn({ outputPreview: output.slice(0, 200) }, 'Floorplan recognition output is not valid JSON, attempting direct parse');
    throw new Error('Floorplan recognition output is not valid JSON');
  }

  const geometry: FloorPlanGeometry = {
    wall: (parsed.wall as number[][][]) ?? [],
    door: (parsed.door as number[][][]) ?? [],
    entry_door: (parsed.entry_door as number[][][]) ?? [],
    window: (parsed.window as number[][][]) ?? [],
    kitchen: (parsed.kitchen as number[][][]) ?? [],
    door_center_line: (parsed.door_center_line as number[][][]) ?? [],
    entry_door_center_line: (parsed.entry_door_center_line as number[][][]) ?? [],
    window_center_line: (parsed.window_center_line as number[][][]) ?? [],
  };

  return geometry;
}
