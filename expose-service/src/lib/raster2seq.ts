import { getLogger, trackExternalCall } from './logger.js';

/**
 * Client for the existing Raster2Seq GPU service.
 *
 * The floor plan image is POSTed as multipart field `file` to the Raster AI
 * proxy (`RASTER_AI_URL/predict?refine=vlm`); the service runs the CubiCasa5k
 * draft + VLM refinement pipeline and returns a JSON body whose `spaces` /
 * `refined_spaces` arrays carry the room polygons. The raw response is
 * returned untouched so callers can persist it verbatim.
 *
 * This mirrors the GPU path of the debug floorplan-recognition route; the
 * URL helpers live here so both consumers share one source of truth.
 */

export interface RasterDraftSpace {
  id: number | string;
  label?: string;
  category_id?: number;
  polygon: number[][];
}

export interface RasterRefinedSpace {
  id: string;
  room_type: string;
  area: number | null;
  polygon: number[][];
  graph?: string[];
}

export interface RasterPredictResponse {
  status?: string;
  stage?: string;
  refinement?: string;
  request_id?: string;
  model?: { checkpoint_key?: string; semantic_classes?: number; device?: string };
  room_count?: number;
  spaces?: RasterDraftSpace[];
  floorplan_png_base64?: string;
  inference_ms?: number;
  vlm_model?: string;
  refine_ms?: number;
  refined_room_count?: number;
  refined_total_area?: number | null;
  refined_spaces?: RasterRefinedSpace[];
  refined_floorplan_png_base64?: string;
}

/** Base URL without query string — safe to log (no secrets in this integration). */
export function rasterAiBaseUrl(): string | null {
  const raw = (process.env.RASTER_AI_URL ?? '').trim().replace(/\/+$/, '');
  return raw.length > 0 ? raw : null;
}

export function rasterAiPredictUrl(): string | null {
  const base = rasterAiBaseUrl();
  return base ? `${base}/predict?refine=vlm` : null;
}

/** GPU inference needs a longer budget than the local Docker model. */
export const RASTER_AI_TIMEOUT_MS = 300_000;

export interface FloorplanImageInput {
  buffer: Buffer;
  mimeType: string;
  filename: string;
}

/**
 * Sends the floor plan to the Raster2Seq GPU service and returns the raw
 * JSON response. Throws a descriptive `Error` on every failure mode (service
 * not configured, unreachable, timeout, invalid/`status != ok` response).
 */
export async function analyzeFloorplanRaster2Seq(
  image: FloorplanImageInput,
): Promise<RasterPredictResponse> {
  const url = rasterAiPredictUrl();
  if (!url) {
    throw new Error('Raster2Seq is not configured (RASTER_AI_URL missing)');
  }

  const log = getLogger();
  const startedAt = performance.now();
  const endpointForLog = rasterAiBaseUrl() ?? '(raster-ai)';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RASTER_AI_TIMEOUT_MS);

  try {
    const form = new FormData();
    form.append(
      'file',
      new Blob([new Uint8Array(image.buffer)], { type: image.mimeType }),
      image.filename || 'floorplan.jpg',
    );

    const response = await trackExternalCall(
      { service: 'raster-ai', operation: 'predict-vlm', props: { via: 'v360-floorplan' } },
      () => fetch(url, { method: 'POST', body: form, signal: controller.signal }),
    );

    const durationMs = Math.round(performance.now() - startedAt);

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      log.warn(
        {
          httpStatus: response.status,
          responseBody: text.slice(0, 1000),
          durationMs,
          endpoint: endpointForLog,
        },
        'Raster2Seq inference non-OK',
      );
      throw new Error(`Raster2Seq inference failed with status ${response.status}`);
    }

    let json: RasterPredictResponse;
    try {
      json = (await response.json()) as RasterPredictResponse;
    } catch {
      log.warn(
        { durationMs, endpoint: endpointForLog },
        'Raster2Seq inference returned malformed JSON',
      );
      throw new Error('Raster2Seq returned an invalid response');
    }

    if (json.status !== 'ok') {
      log.warn(
        { status: json.status, durationMs, endpoint: endpointForLog },
        'Raster2Seq inference failed',
      );
      throw new Error('Raster2Seq inference failed');
    }

    log.info(
      {
        requestId: json.request_id,
        endpoint: endpointForLog,
        stage: json.stage,
        roomCount: json.room_count,
        refinedRoomCount: json.refined_room_count,
        vlmModel: json.vlm_model,
        inferenceMs: json.inference_ms,
        refineMs: json.refine_ms,
        durationMs,
      },
      'Raster2Seq inference completed — request={requestId}, stage={stage}, rooms={roomCount}, refined={refinedRoomCount}, duration={durationMs}ms',
    );

    return json;
  } catch (error) {
    const durationMs = Math.round(performance.now() - startedAt);
    if (error instanceof Error && error.name === 'AbortError') {
      log.error(
        { durationMs, endpoint: endpointForLog, timeoutMs: RASTER_AI_TIMEOUT_MS },
        'Raster2Seq inference timed out after {durationMs}ms',
      );
      throw new Error(`Raster2Seq inference timed out after ${durationMs}ms`);
    }
    const cause = (error as { cause?: unknown })?.cause;
    const causeMessage =
      cause instanceof Error ? cause.message : typeof cause === 'string' ? cause : '';
    const errorString = String(error);
    const isConnectionIssue =
      (error instanceof TypeError && errorString.includes('fetch failed')) ||
      causeMessage.includes('ECONNREFUSED') ||
      causeMessage.includes('ENOTFOUND') ||
      (error as { code?: string })?.code === 'ECONNREFUSED';
    if (isConnectionIssue) {
      log.error(
        { err: error, durationMs, endpoint: endpointForLog },
        'Raster2Seq inference unavailable',
      );
      throw new Error(`Raster2Seq inference service is not available at ${endpointForLog}`);
    }
    log.error(
      { err: error, durationMs, endpoint: endpointForLog },
      'Raster2Seq inference failed',
    );
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
