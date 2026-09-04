import { Router } from 'express';
import { sendError, asyncHandler } from '../lib/http.js';
import { getLogger, trackExternalCall } from '../lib/logger.js';
import { upload, isAllowedImageMime, MAX_IMAGE_BYTES } from '../lib/upload.js';
import { VlmFloorplanProvider } from '../lib/vlm-floorplan/openai-provider.js';
import { validateVlmAnalysis } from '../lib/vlm-floorplan/schema.js';
import {
  buildPrimitiveIdSet,
  extractVlmPrimitives,
  normalizeVlmPrimitives,
} from '../lib/vlm-floorplan/geometry-primitives.js';

const DEFAULT_RECOGNITION_URL = 'http://localhost:5000/predictions';
const DEFAULT_TIMEOUT_MS = 120_000;

/** GPU inference via RunPod needs a longer budget than the local Docker model. */
const RUNPOD_TIMEOUT_MS = 300_000;

/** Empty wall/door/window geometry kept for backward compatibility. */
const EMPTY_RAW_GEOMETRY: RawFloorplanRecognitionResponse = {
  wall: [],
  door: [],
  entry_door: [],
  window: [],
  kitchen: [],
  door_center_line: [],
  entry_door_center_line: [],
  window_center_line: [],
};

export interface RunpodRefinedSpace {
  id: string;
  room_type: string;
  area: number | null;
  polygon: number[][];
  graph?: string[];
}

export interface RunpodDraftSpace {
  id: number | string;
  label?: string;
  category_id?: number;
  polygon: number[][];
}

interface RunpodPredictResponse {
  status?: string;
  stage?: string;
  refinement?: string;
  request_id?: string;
  model?: { checkpoint_key?: string; semantic_classes?: number; device?: string };
  room_count?: number;
  spaces?: RunpodDraftSpace[];
  floorplan_png_base64?: string;
  inference_ms?: number;
  vlm_model?: string;
  refine_ms?: number;
  refined_room_count?: number;
  refined_total_area?: number | null;
  refined_spaces?: RunpodRefinedSpace[];
  refined_floorplan_png_base64?: string;
}

/** Base URL without query string — safe to log (no secrets in this integration). */
export function runpodBaseUrl(): string | null {
  const raw = (process.env.RASTER_AI_URL ?? '').trim().replace(/\/+$/, '');
  return raw.length > 0 ? raw : null;
}

export function runpodPredictUrl(): string | null {
  const base = runpodBaseUrl();
  return base ? `${base}/predict?refine=vlm` : null;
}

/** Validate a base64 PNG: decodable, non-empty, PNG magic header. */
export function toPngDataUrl(base64: unknown): string | null {
  if (typeof base64 !== 'string' || base64.length === 0) return null;
  let bytes: Buffer;
  try {
    bytes = Buffer.from(base64, 'base64');
  } catch {
    return null;
  }
  if (bytes.length < 8) return null;
  if (bytes[0] !== 0x89 || bytes[1] !== 0x50 || bytes[2] !== 0x4e || bytes[3] !== 0x47) return null;
  return `data:image/png;base64,${base64}`;
}

export interface RawFloorplanRecognitionResponse {
  wall: number[][][];
  door: number[][][];
  entry_door: number[][][];
  window: number[][][];
  kitchen: number[][][];
  door_center_line: number[][][];
  entry_door_center_line: number[][][];
  window_center_line: number[][][];
  [key: string]: unknown;
}

function parseRecognitionOutput(output: string): RawFloorplanRecognitionResponse {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(output) as Record<string, unknown>;
  } catch {
    throw new Error('Floorplan recognition output is not valid JSON');
  }
  return {
    wall: (parsed.wall as number[][][]) ?? [],
    door: (parsed.door as number[][][]) ?? [],
    entry_door: (parsed.entry_door as number[][][]) ?? [],
    window: (parsed.window as number[][][]) ?? [],
    kitchen: (parsed.kitchen as number[][][]) ?? [],
    door_center_line: (parsed.door_center_line as number[][][]) ?? [],
    entry_door_center_line: (parsed.entry_door_center_line as number[][][]) ?? [],
    window_center_line: (parsed.window_center_line as number[][][]) ?? [],
    ...parsed,
  } as RawFloorplanRecognitionResponse;
}

/** Normalize RunPod draft spaces (CubiCasa5k) — passthrough with type guards. */
function normalizeDraftSpaces(spaces: unknown): RunpodDraftSpace[] {
  if (!Array.isArray(spaces)) return [];
  return spaces
    .filter((s): s is Record<string, unknown> => typeof s === 'object' && s !== null)
    .map((s) => ({
      id: (typeof s.id === 'number' || typeof s.id === 'string' ? s.id : -1) as number | string,
      label: typeof s.label === 'string' ? s.label : undefined,
      category_id: typeof s.category_id === 'number' ? s.category_id : undefined,
      polygon: Array.isArray(s.polygon) ? (s.polygon as number[][]) : [],
    }));
}

/** Normalize RunPod refined spaces (VLM) — passthrough with type guards. */
function normalizeRefinedSpaces(spaces: unknown): RunpodRefinedSpace[] {
  if (!Array.isArray(spaces)) return [];
  return spaces
    .filter((s): s is Record<string, unknown> => typeof s === 'object' && s !== null)
    .map((s) => ({
      id: typeof s.id === 'string' ? s.id : String(s.id ?? ''),
      room_type: typeof s.room_type === 'string' ? s.room_type : 'Unknown',
      area: typeof s.area === 'number' ? s.area : null,
      polygon: Array.isArray(s.polygon) ? (s.polygon as number[][]) : [],
      graph: Array.isArray(s.graph) ? (s.graph as string[]) : undefined,
    }));
}

export function debugFloorplanRecognitionRouter(): Router {
  const router = Router();

  // VLM architectural reasoning endpoint — must be registered before the generic recognition route
  router.post(
    '/api/debug/floorplan-recognition/vlm-analysis',
    upload.fields([
      { name: 'image', maxCount: 1 },
      { name: 'annotatedImage', maxCount: 1 },
    ]),
    asyncHandler(async (req, res) => {
      const files = (req as unknown as { files?: Record<string, Express.Multer.File[]> }).files;
      const file = files?.image?.[0] ?? (req as unknown as { file?: Express.Multer.File }).file;
      const annotatedFile = files?.annotatedImage?.[0];
      const body = (req as unknown as { body?: Record<string, unknown> }).body ?? {};
      const rawField = body.raw as unknown;
      const primitivesField = body.primitives as unknown;

      if (!file) return sendError(res, 400, 'Eine Bilddatei ist erforderlich');
      if (!isAllowedImageMime(file.mimetype)) return sendError(res, 400, 'Nur JPG, PNG und WEBP werden unterstützt');
      if (file.size > MAX_IMAGE_BYTES) return sendError(res, 400, 'Bilder dürfen maximal 15 MB groß sein');
      if (file.size === 0) return sendError(res, 400, 'Die Bilddatei ist leer');
      if (annotatedFile) {
        if (!isAllowedImageMime(annotatedFile.mimetype) && annotatedFile.mimetype !== 'image/png') return sendError(res, 400, 'Annotated image must be JPG/PNG/WEBP');
        if (annotatedFile.size > MAX_IMAGE_BYTES) return sendError(res, 400, 'Annotated image too large');
      }
      if (!rawField || typeof rawField !== 'string') return sendError(res, 400, 'RAW recognition JSON (field "raw") is required');

      let raw: RawFloorplanRecognitionResponse;
      try {
        const parsed = JSON.parse(rawField) as Record<string, unknown>;
        raw = {
          wall: (parsed.wall as number[][][]) ?? [],
          door: (parsed.door as number[][][]) ?? [],
          entry_door: (parsed.entry_door as number[][][]) ?? [],
          window: (parsed.window as number[][][]) ?? [],
          kitchen: (parsed.kitchen as number[][][]) ?? [],
          door_center_line: (parsed.door_center_line as number[][][]) ?? [],
          entry_door_center_line: (parsed.entry_door_center_line as number[][][]) ?? [],
          window_center_line: (parsed.window_center_line as number[][][]) ?? [],
          ...parsed,
        } as RawFloorplanRecognitionResponse;
      } catch {
        return sendError(res, 400, 'RAW recognition JSON is not valid JSON');
      }

      if (!process.env.OPENAI_API_KEY) {
        return sendError(res, 503, 'VLM is not configured (OPENAI_API_KEY missing)');
      }

      const log = getLogger();
      const startedAt = performance.now();

      // Geometry primitives (VLM geometry-interpretation POC input): prefer a
      // client-supplied list (computed with the same stable IDs), otherwise
      // extract deterministically server-side. The VLM only receives
      // relationships input — it never calculates geometry.
      let primitives = extractVlmPrimitives(raw);
      if (typeof primitivesField === 'string' && primitivesField.length > 0) {
        try {
          const normalized = normalizeVlmPrimitives(JSON.parse(primitivesField));
          if (normalized) primitives = normalized;
          else log.warn('VLM request contained malformed primitives — falling back to server extraction');
        } catch {
          log.warn('VLM request primitives field is not valid JSON — falling back to server extraction');
        }
      }
      const primitiveIds = buildPrimitiveIdSet(primitives);
      try {
        const provider = new VlmFloorplanProvider();
        const result = await provider.analyze({
          imageBuffer: file.buffer,
          mimeType: file.mimetype,
          raw,
          annotatedImageBuffer: annotatedFile?.buffer,
          annotatedMimeType: annotatedFile?.mimetype,
          primitives,
        });

        // Validate/filter IDs against raw geometry + known primitives
        const { analysis: filtered, warnings } = validateVlmAnalysis(
          result.analysis,
          raw as unknown as Record<string, unknown>,
          primitiveIds,
        );
        const normalizationWarnings = result.normalizationWarnings ?? [];
        const allWarnings = [...normalizationWarnings, ...warnings];
        if (allWarnings.length) {
          log.warn({ warnings: allWarnings }, 'VLM analysis contained invalid IDs filtered out');
        }

        const durationMs = Math.round(performance.now() - startedAt);
        log.info(
          {
            model: result.model,
            durationMs,
            wallRelationships: filtered.wallRelationships.length,
            openings: filtered.openings.length,
            rooms: filtered.rooms.length,
            objectClassifications: filtered.objectClassifications.length,
            geometryConstraints: (filtered as unknown as { geometryConstraints?: unknown[] }).geometryConstraints?.length ?? 0,
            geometryRelationships: filtered.geometryRelationships.length,
            primitives: primitives.length,
            warnings: allWarnings.length,
          },
          'VLM floorplan analysis completed',
        );

        res.json({
          analysis: filtered,
          model: result.model,
          durationMs: result.durationMs ?? durationMs,
          warnings: allWarnings,
          rawResponse: result.rawResponse,
          primitives: { count: primitives.length, ids: primitives.map((p) => p.primitiveId) },
        });
      } catch (error) {
        const durationMs = Math.round(performance.now() - startedAt);
        const err = error as Error & { rawContent?: string; rawResponse?: unknown };
        log.error({ err: error, durationMs }, 'VLM floorplan analysis failed');

        // Surface raw content for debugging if JSON parsing failed
        if (err.rawContent) {
          return res.status(502).json({
            error: err.message,
            rawContent: err.rawContent,
            rawResponse: err.rawResponse,
            durationMs,
          });
        }
        return sendError(res, 502, err instanceof Error ? err.message : 'VLM analysis failed');
      }
    }),
  );

  router.post(
    '/api/debug/floorplan-recognition',
    upload.single('image'),
    asyncHandler(async (req, res) => {
      const file = (req as unknown as { file?: Express.Multer.File }).file;
      if (!file) return sendError(res, 400, 'Eine Bilddatei ist erforderlich');
      if (!isAllowedImageMime(file.mimetype)) return sendError(res, 400, 'Nur JPG, PNG und WEBP werden unterstützt');
      if (file.size > MAX_IMAGE_BYTES) return sendError(res, 400, 'Bilder dürfen maximal 15 MB groß sein');
      if (file.size === 0) return sendError(res, 400, 'Die Bilddatei ist leer');

      const runpodUrl = runpodPredictUrl();
      if (runpodUrl) {
        // ── RunPod path: CubiCasa5k + VLM refinement (OpenAI key stays on RunPod) ──
        const log = getLogger();
        const startedAt = performance.now();
        const endpointForLog = runpodBaseUrl() ?? '(runpod)';
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), RUNPOD_TIMEOUT_MS);
        try {
          const form = new FormData();
          form.append(
            'file',
            new Blob([new Uint8Array(file.buffer)], { type: file.mimetype }),
            file.originalname || 'floorplan.jpg',
          );
          const response = await trackExternalCall(
            { service: 'runpod', operation: 'predict-vlm', props: { via: 'debug-endpoint' } },
            () => fetch(runpodUrl, { method: 'POST', body: form, signal: controller.signal }),
          );
          const durationMs = Math.round(performance.now() - startedAt);
          if (!response.ok) {
            const text = await response.text().catch(() => '');
            log.warn(
              { httpStatus: response.status, responseBody: text.slice(0, 1000), durationMs, endpoint: endpointForLog },
              'RunPod floorplan inference non-OK',
            );
            return sendError(res, 502, `RunPod inference failed with status ${response.status}`);
          }
          let json: RunpodPredictResponse;
          try {
            json = (await response.json()) as RunpodPredictResponse;
          } catch {
            log.warn({ durationMs, endpoint: endpointForLog }, 'RunPod floorplan inference returned malformed JSON');
            return sendError(res, 502, 'RunPod returned an invalid response');
          }
          if (json.status !== 'ok') {
            log.warn({ status: json.status, durationMs, endpoint: endpointForLog }, 'RunPod floorplan inference failed');
            return sendError(res, 502, 'RunPod inference failed');
          }
          const draftImageDataUrl = toPngDataUrl(json.floorplan_png_base64);
          const refinedImageDataUrl = toPngDataUrl(json.refined_floorplan_png_base64);
          if (!draftImageDataUrl || !refinedImageDataUrl) {
            log.warn(
              {
                requestId: json.request_id,
                hasDraft: Boolean(json.floorplan_png_base64),
                hasRefined: Boolean(json.refined_floorplan_png_base64),
                durationMs,
                endpoint: endpointForLog,
              },
              'RunPod floorplan inference returned invalid image data',
            );
            return sendError(res, 502, 'RunPod returned invalid image data');
          }
          const draftSpaces = normalizeDraftSpaces(json.spaces);
          const refinedSpaces = normalizeRefinedSpaces(json.refined_spaces);
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
            'RunPod floorplan inference completed — request={requestId}, stage={stage}, rooms={roomCount}, refined={refinedRoomCount}, inference={inferenceMs}ms, refine={refineMs}ms, total={durationMs}ms',
          );
          return res.json({
            raw: { ...EMPTY_RAW_GEOMETRY },
            durationMs,
            imageInfo: { mimeType: file.mimetype, bytes: file.size, fileName: file.originalname },
            provider: 'runpod',
            requestId: json.request_id ?? null,
            stage: json.stage ?? null,
            refinement: json.refinement ?? null,
            roomCount: json.room_count ?? draftSpaces.length,
            spaces: draftSpaces,
            draftImageDataUrl,
            inferenceMs: json.inference_ms ?? null,
            vlmModel: json.vlm_model ?? null,
            refineMs: json.refine_ms ?? null,
            refinedRoomCount: json.refined_room_count ?? refinedSpaces.length,
            refinedTotalArea: json.refined_total_area ?? null,
            refinedSpaces,
            refinedImageDataUrl,
          });
        } catch (error) {
          const durationMs = Math.round(performance.now() - startedAt);
          if (error instanceof Error && error.name === 'AbortError') {
            log.error({ durationMs, endpoint: endpointForLog, timeoutMs: RUNPOD_TIMEOUT_MS }, 'RunPod floorplan inference timed out');
            return sendError(res, 504, `RunPod inference timed out after ${durationMs}ms`);
          }
          const cause = (error as { cause?: unknown })?.cause;
          const causeMessage = cause instanceof Error ? cause.message : typeof cause === 'string' ? cause : '';
          const errorString = String(error);
          const isConnectionIssue =
            (error instanceof TypeError && errorString.includes('fetch failed')) ||
            causeMessage.includes('ECONNREFUSED') ||
            causeMessage.includes('ENOTFOUND') ||
            (error as { code?: string })?.code === 'ECONNREFUSED';
          if (isConnectionIssue) {
            log.error({ err: error, durationMs, endpoint: endpointForLog }, 'RunPod floorplan inference unavailable');
            return sendError(res, 503, `RunPod inference service is not available at ${endpointForLog}`);
          }
          log.error({ err: error, durationMs, endpoint: endpointForLog }, 'RunPod floorplan inference failed');
          return sendError(res, 502, 'RunPod inference failed');
        } finally {
          clearTimeout(timer);
        }
      }

      const apiUrl = process.env.FLOORPLAN_RECOGNITION_URL ?? DEFAULT_RECOGNITION_URL;
      const timeoutMs = DEFAULT_TIMEOUT_MS;
      const log = getLogger();
      const startedAt = performance.now();

      const imagePayload = `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
      const body = JSON.stringify({ input: { image: imagePayload } });

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await trackExternalCall(
          { service: 'floorplan-recognition', operation: 'predict-debug', props: { via: 'debug-endpoint' } },
          () =>
            fetch(apiUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body,
              signal: controller.signal,
            }),
        );

        const durationMs = Math.round(performance.now() - startedAt);

        if (!response.ok) {
          const text = await response.text().catch(() => '');
          log.warn({ httpStatus: response.status, responseBody: text.slice(0, 1000), durationMs }, 'Debug floorplan recognition non-OK');
          return sendError(res, 502, `Floorplan recognition failed with status ${response.status}: ${text.slice(0, 500)}`);
        }

        const json = (await response.json()) as { output?: string; status?: string; error?: string };

        if (json.status === 'failed' || json.error) {
          return sendError(res, 502, `Floorplan recognition failed: ${json.error ?? 'unknown error'}`);
        }
        if (!json.output) {
          return sendError(res, 502, 'Floorplan recognition returned no output');
        }

        let raw: RawFloorplanRecognitionResponse;
        try {
          raw = parseRecognitionOutput(json.output);
        } catch (e) {
          return sendError(res, 502, e instanceof Error ? e.message : 'Invalid recognition output');
        }

        log.info(
          {
            walls: raw.wall.length,
            doors: raw.door.length,
            entryDoors: raw.entry_door.length,
            windows: raw.window.length,
            durationMs,
          },
          'Debug floorplan recognition completed',
        );

        res.json({
          raw,
          durationMs,
          imageInfo: {
            mimeType: file.mimetype,
            bytes: file.size,
            fileName: file.originalname,
          },
        });
      } catch (error) {
        const durationMs = Math.round(performance.now() - startedAt);
        if (error instanceof Error && error.name === 'AbortError') {
          return sendError(res, 504, `Floorplan recognition timed out after ${durationMs}ms`);
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
          apiUrl.includes('${') ||
          apiUrl.includes('$');
        if (isInvalidUrl) {
          log.error(
            { err: error, durationMs, apiUrl },
            'Debug floorplan recognition failed — invalid URL (misconfiguration)',
          );
          return sendError(
            res,
            503,
            `Floorplan recognition service is misconfigured (invalid URL: ${apiUrl}). Check FLOORPLAN_RECOGNITION_URL env var — expected like http://floorplan-recognition:5000/predictions. For local testing: docker compose --profile floorplan up floorplan-recognition — or use "Load fixture".`,
          );
        }
        const isConnectionRefused =
          (error instanceof TypeError && errorMessage.includes('fetch failed')) ||
          causeMessage.includes('ECONNREFUSED') ||
          (error as { code?: string })?.code === 'ECONNREFUSED' ||
          (cause as { code?: string } | undefined)?.code === 'ECONNREFUSED' ||
          errorString.includes('ECONNREFUSED');

        if (isConnectionRefused) {
          log.error(
            { err: error, durationMs, apiUrl },
            'Debug floorplan recognition failed — service not available (ECONNREFUSED)',
          );
          return sendError(
            res,
            503,
            `Floorplan recognition service is not available at ${apiUrl} (ECONNREFUSED). The model may not be running. For local testing start it via: docker compose --profile floorplan up floorplan-recognition  —  or use "Load fixture" to test the pipeline without the model.`,
          );
        }
        log.error({ err: error, durationMs, apiUrl }, 'Debug floorplan recognition failed');
        const message = error instanceof Error && errorMessage && errorMessage !== 'fetch failed: ' && errorMessage.trim() !== 'fetch failed'
          ? errorMessage
          : `Floorplan recognition failed — service not reachable at ${apiUrl}`;
        return sendError(res, 502, message);
      } finally {
        clearTimeout(timer);
      }
    }),
  );

  return router;
}
