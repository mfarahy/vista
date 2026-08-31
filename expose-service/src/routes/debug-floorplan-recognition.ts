import { Router } from 'express';
import { sendError, asyncHandler } from '../lib/http.js';
import { getLogger, trackExternalCall } from '../lib/logger.js';
import { upload, isAllowedImageMime, MAX_IMAGE_BYTES } from '../lib/upload.js';

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
        log.error({ err: error, durationMs }, 'Debug floorplan recognition failed');
        return sendError(res, 502, error instanceof Error ? error.message : 'Recognition failed');
      } finally {
        clearTimeout(timer);
      }
    }),
  );

  return router;
}
