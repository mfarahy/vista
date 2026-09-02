import { Router } from 'express';
import { sendError, asyncHandler } from '../lib/http.js';
import { getLogger, trackExternalCall } from '../lib/logger.js';
import { upload, isAllowedImageMime, MAX_IMAGE_BYTES } from '../lib/upload.js';
import { VlmFloorplanProvider } from '../lib/vlm-floorplan/openai-provider.js';
import { validateVlmAnalysis } from '../lib/vlm-floorplan/schema.js';

const DEFAULT_RECOGNITION_URL = 'http://localhost:5000/predictions';
const DEFAULT_TIMEOUT_MS = 120_000;

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
      try {
        const provider = new VlmFloorplanProvider();
        const result = await provider.analyze({
          imageBuffer: file.buffer,
          mimeType: file.mimetype,
          raw,
          annotatedImageBuffer: annotatedFile?.buffer,
          annotatedMimeType: annotatedFile?.mimetype,
        });

        // Validate/filter IDs against raw geometry
        const { analysis: filtered, warnings } = validateVlmAnalysis(
          result.analysis,
          raw as unknown as Record<string, unknown>,
        );
        if (warnings.length) {
          log.warn({ warnings }, 'VLM analysis contained invalid IDs filtered out');
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
            warnings: warnings.length,
          },
          'VLM floorplan analysis completed',
        );

        res.json({
          analysis: filtered,
          model: result.model,
          durationMs: result.durationMs ?? durationMs,
          warnings,
          rawResponse: result.rawResponse,
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
