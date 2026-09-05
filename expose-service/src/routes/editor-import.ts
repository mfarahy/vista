import { Router, type Response } from 'express';
import { asyncHandler } from '../lib/http.js';
import { getLogger } from '../lib/logger.js';
import { upload, isAllowedImageMime, MAX_IMAGE_BYTES } from '../lib/upload.js';
import {
  analyzeFloorplanRaster2Seq,
  type FloorplanImageInput,
  type RasterPredictResponse,
} from '../lib/raster2seq.js';

/**
 * Editor image import (Phase 4 of the Floor Plan Editor).
 *
 * `POST /api/editor/floorplan-from-image` accepts a single floor-plan image
 * (multipart field `image`, JPG/PNG/WEBP, ≤ 15 MB) and forwards it to the
 * existing local Raster2Seq service through the shared
 * `analyzeFloorplanRaster2Seq` client (`RASTER_AI_URL`, draft + VLM
 * refinement pipeline). The raw analysis JSON is returned verbatim as
 * `{ result }`; converting it into the canonical Vista FloorPlan model is
 * the frontend adapter's job (`lib/floorplan/raster2seq-adapter.ts`).
 *
 * This route is a thin server-side boundary: the browser never talks to the
 * local Raster2Seq service directly and never sees its configuration. No
 * image bytes are persisted and no editor state lives here.
 */

export type EditorImportErrorCode =
  | 'INVALID_IMAGE'
  | 'RASTER2SEQ_NOT_CONFIGURED'
  | 'RASTER2SEQ_UNAVAILABLE'
  | 'RASTER2SEQ_TIMEOUT'
  | 'RASTER2SEQ_FAILED'
  | 'ANALYSIS_FAILED';

export function editorImportErrorCode(message: string): EditorImportErrorCode {
  if (message.includes('RASTER_AI_URL missing')) return 'RASTER2SEQ_NOT_CONFIGURED';
  if (message.includes('timed out')) return 'RASTER2SEQ_TIMEOUT';
  if (message.includes('not available at')) return 'RASTER2SEQ_UNAVAILABLE';
  if (message.includes('Raster2Seq')) return 'RASTER2SEQ_FAILED';
  return 'ANALYSIS_FAILED';
}

function editorImportErrorStatus(code: EditorImportErrorCode): number {
  switch (code) {
    case 'RASTER2SEQ_NOT_CONFIGURED':
    case 'RASTER2SEQ_UNAVAILABLE':
      return 503;
    case 'RASTER2SEQ_TIMEOUT':
      return 504;
    case 'RASTER2SEQ_FAILED':
    case 'ANALYSIS_FAILED':
      return 502;
    default:
      return 500;
  }
}

export interface EditorImportRouterOptions {
  /** Injectable Raster2Seq analyzer for tests; defaults to the shared client. */
  analyze?: (image: FloorplanImageInput) => Promise<RasterPredictResponse>;
}

export function editorImportRouter(options: EditorImportRouterOptions = {}): Router {
  const router = Router();
  const analyze = options.analyze ?? analyzeFloorplanRaster2Seq;

  const sendApiError = (res: Response, status: number, code: EditorImportErrorCode, message: string) =>
    res.status(status).json({ error: message, code });

  router.post(
    '/api/editor/floorplan-from-image',
    upload.single('image'),
    asyncHandler(async (req, res) => {
      const file = (req as unknown as { file?: Express.Multer.File }).file;
      if (!file) return sendApiError(res, 400, 'INVALID_IMAGE', 'Eine Bilddatei ist erforderlich');
      if (!isAllowedImageMime(file.mimetype))
        return sendApiError(res, 400, 'INVALID_IMAGE', 'Nur JPG, PNG und WEBP werden unterstützt');
      if (file.size > MAX_IMAGE_BYTES)
        return sendApiError(res, 400, 'INVALID_IMAGE', 'Bilder dürfen maximal 15 MB groß sein');
      if (file.size === 0)
        return sendApiError(res, 400, 'INVALID_IMAGE', 'Die Bilddatei ist leer');

      const log = getLogger();
      try {
        const result = await analyze({
          buffer: file.buffer,
          mimeType: file.mimetype,
          filename: file.originalname || 'floorplan.png',
        });
        log.info(
          {
            mimeType: file.mimetype,
            size: file.size,
            requestId: result.request_id,
            roomCount: result.room_count,
            refinedRoomCount: result.refined_room_count,
          },
          'Editor image import analyzed',
        );
        res.json({ result });
      } catch (error) {
        const message =
          error instanceof Error && error.message ? error.message : 'Raster2Seq inference failed';
        const code = editorImportErrorCode(message);
        log.error({ err: error, code }, 'Editor image import failed');
        res.status(editorImportErrorStatus(code)).json({ error: message, code });
      }
    }),
  );

  return router;
}
