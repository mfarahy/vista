import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { upload, isAllowedImageMime, MAX_IMAGE_BYTES } from '../lib/upload.js';
import { sendError, asyncHandler, getParam } from '../lib/http.js';
import { getLogger } from '../lib/logger.js';
import { createMediaStorage, type MediaStorage } from '../lib/media-storage.js';
import { v360Store, type V360Store } from '../lib/v360-store.js';
import { analyzeFloorplanRaster2Seq, type RasterPredictResponse } from '../lib/raster2seq.js';
import { floorBoundaryFromAnalysis } from '../lib/v360-geometry.js';

/**
 * Vista 360 floorplan-to-panorama MVP routes.
 *
 * Workflow:
 *   1. POST /api/v360/floorplans               upload + store the floor plan in R2
 *   2. POST /api/v360/floorplans/:id/analyze   run Raster2Seq (GPU), store the raw result (retryable)
 *   3. PUT  /api/v360/floorplans/:id/camera    persist the normalized camera position + yaw
 *   4. POST /api/v360/floorplans/:id/panoramas upload + store the 360 panorama
 *
 * Files are served through the API (`/file`) so the behaviour is identical
 * for the local and R2 storage providers. Errors carry a stable `code` the
 * frontend maps to localized messages.
 */

const MIME_EXTENSION: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export type V360ErrorCode =
  | 'INVALID_IMAGE'
  | 'UPLOAD_FAILED'
  | 'STORAGE_FAILED'
  | 'NOT_FOUND'
  | 'RASTER2SEQ_NOT_CONFIGURED'
  | 'RASTER2SEQ_UNAVAILABLE'
  | 'RASTER2SEQ_TIMEOUT'
  | 'RASTER2SEQ_FAILED'
  | 'INVALID_CAMERA'
  | 'ANALYSIS_FAILED';

export function v360ErrorCode(message: string): V360ErrorCode {
  if (message.includes('RASTER_AI_URL missing')) return 'RASTER2SEQ_NOT_CONFIGURED';
  if (message.includes('timed out')) return 'RASTER2SEQ_TIMEOUT';
  if (message.includes('not available at')) return 'RASTER2SEQ_UNAVAILABLE';
  if (message.includes('Raster2Seq')) return 'RASTER2SEQ_FAILED';
  return 'ANALYSIS_FAILED';
}

function v360ErrorStatus(code: V360ErrorCode): number {
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

export interface V360RouterOptions {
  /** Injectable media storage for tests; defaults to the configured provider. */
  storage?: MediaStorage;
  /** Injectable record store for tests; defaults to the shared Prisma store. */
  store?: V360Store;
  /** Injectable Raster2Seq analyzer for tests; defaults to the GPU client. */
  analyze?: (image: { buffer: Buffer; mimeType: string; filename: string }) => Promise<unknown>;
}

export function v360Router(options: V360RouterOptions = {}): Router {
  const router = Router();
  const storage = options.storage ?? createMediaStorage();
  const store = options.store ?? v360Store;
  const analyze = options.analyze ?? analyzeFloorplanRaster2Seq;

  const fileUrl = (kind: 'floorplans' | 'panoramas', id: string) => `/api/v360/${kind}/${id}/file`;

  const sendApiError = (
    res: Parameters<typeof sendError>[0],
    status: number,
    code: V360ErrorCode,
    message: string,
  ) => res.status(status).json({ error: message, code });

  // ── Step 1: upload a 2D floor plan ───────────────────────────────────────
  router.post(
    '/api/v360/floorplans',
    upload.single('image'),
    asyncHandler(async (req, res) => {
      const file = (req as unknown as { file?: Express.Multer.File }).file;
      if (!file) return sendError(res, 400, 'Eine Bilddatei ist erforderlich');
      if (!isAllowedImageMime(file.mimetype))
        return sendApiError(res, 400, 'INVALID_IMAGE', 'Nur JPG, PNG und WEBP werden unterstützt');
      if (file.size > MAX_IMAGE_BYTES)
        return sendApiError(res, 400, 'INVALID_IMAGE', 'Bilder dürfen maximal 15 MB groß sein');
      if (file.size === 0) return sendApiError(res, 400, 'INVALID_IMAGE', 'Die Bilddatei ist leer');

      const id = randomUUID();
      const extension = MIME_EXTENSION[file.mimetype] ?? 'img';
      const key = `floorplans/${id}/original.${extension}`;
      const log = getLogger();

      try {
        await storage.put(key, file.buffer, file.mimetype);
      } catch (error) {
        log.error(
          { err: error, floorplanId: id, key },
          'Failed to store floorplan {floorplanId} at {key}',
        );
        return sendApiError(
          res,
          500,
          'UPLOAD_FAILED',
          'Der Grundriss konnte nicht gespeichert werden.',
        );
      }

      const width = parseInt((req.body?.width as string | undefined) ?? '', 10);
      const height = parseInt((req.body?.height as string | undefined) ?? '', 10);
      const propertyId =
        typeof req.body?.propertyId === 'string' && req.body.propertyId
          ? req.body.propertyId
          : null;

      const floorplan = await store.createFloorplan({
        id,
        originalKey: key,
        imageUrl: fileUrl('floorplans', id),
        mimeType: file.mimetype,
        size: file.size,
        width: Number.isFinite(width) ? width : null,
        height: Number.isFinite(height) ? height : null,
        ...(propertyId ? { propertyId } : {}),
      });

      log.info(
        { floorplanId: id, key, mimeType: file.mimetype, size: file.size, propertyId },
        'Floorplan {floorplanId} uploaded to storage at {key}',
      );

      res.status(201).json({ floorplan });
    }),
  );

  // ── Step 2: analyze the floor plan with Raster2Seq (GPU) ──────────────
  router.post(
    '/api/v360/floorplans/:id/analyze',
    asyncHandler(async (req, res) => {
      const id = getParam(req, 'id');
      const log = getLogger();
      const existing = await store.getFloorplan(id);
      if (!existing) return sendApiError(res, 404, 'NOT_FOUND', 'Nicht gefunden');

      const file = await storage.get(existing.originalKey);
      if (!file) {
        log.error(
          { floorplanId: id, key: existing.originalKey },
          'Floorplan original missing from storage',
        );
        return sendApiError(
          res,
          500,
          'STORAGE_FAILED',
          'Der Grundriss konnte nicht geladen werden.',
        );
      }

      await store.updateFloorplan(id, { status: 'analyzing', error: null });

      try {
        const raw = (await analyze({
          buffer: file.content,
          mimeType: existing.mimeType,
          filename: existing.originalKey,
        })) as RasterPredictResponse;
        const boundary = floorBoundaryFromAnalysis(raw);
        if (!boundary) {
          throw new Error('The Raster2Seq analysis contained no usable floor geometry');
        }
        const floorplan = await store.updateFloorplan(id, {
          status: 'analyzed',
          analysisResult: raw as never,
          floorBoundary: boundary,
          error: null,
        });
        log.info(
          { floorplanId: id, boundaryPoints: boundary.length },
          'Floorplan {floorplanId} analyzed ({boundaryPoints} boundary points)',
        );
        res.json({ floorplan });
      } catch (error) {
        const message =
          error instanceof Error && error.message ? error.message : 'Raster2Seq inference failed';
        const code = v360ErrorCode(message);
        log.error({ err: error, floorplanId: id, code }, 'Floorplan {floorplanId} analysis failed');
        const floorplan = await store.updateFloorplan(id, { status: 'failed', error: message });
        res.status(v360ErrorStatus(code)).json({ floorplan, error: message, code });
      }
    }),
  );

  // ── Read a floor plan (+ panoramas) ───────────────────────────────────────
  router.get(
    '/api/v360/floorplans/:id',
    asyncHandler(async (req, res) => {
      const floorplan = await store.getFloorplan(getParam(req, 'id'));
      if (!floorplan) return sendApiError(res, 404, 'NOT_FOUND', 'Nicht gefunden');
      res.json({ floorplan });
    }),
  );

  // ── Step 3: persist the normalized camera position + yaw ──────────────────
  router.put(
    '/api/v360/floorplans/:id/camera',
    asyncHandler(async (req, res) => {
      const id = getParam(req, 'id');
      const existing = await store.getFloorplan(id);
      if (!existing) return sendApiError(res, 404, 'NOT_FOUND', 'Nicht gefunden');

      const { cameraX, cameraY, cameraYaw } = (req.body ?? {}) as Record<string, unknown>;
      const nx = Number(cameraX);
      const ny = Number(cameraY);
      const yaw = cameraYaw === undefined ? null : Number(cameraYaw);
      if (!Number.isFinite(nx) || !Number.isFinite(ny) || nx < 0 || nx > 1 || ny < 0 || ny > 1) {
        return sendApiError(res, 400, 'INVALID_CAMERA', 'Die Kameraposition ist ungültig.');
      }
      if (yaw !== null && !Number.isFinite(yaw)) {
        return sendApiError(res, 400, 'INVALID_CAMERA', 'Die Blickrichtung ist ungültig.');
      }

      const floorplan = await store.updateFloorplan(id, {
        cameraX: nx,
        cameraY: ny,
        cameraYaw: yaw,
      });
      res.json({ floorplan });
    }),
  );

  // ── Step 4: upload a 360 panorama ─────────────────────────────────────────
  router.post(
    '/api/v360/floorplans/:id/panoramas',
    upload.single('image'),
    asyncHandler(async (req, res) => {
      const id = getParam(req, 'id');
      const floorplan = await store.getFloorplan(id);
      if (!floorplan) return sendApiError(res, 404, 'NOT_FOUND', 'Nicht gefunden');

      const file = (req as unknown as { file?: Express.Multer.File }).file;
      if (!file) return sendError(res, 400, 'Eine Bilddatei ist erforderlich');
      if (!isAllowedImageMime(file.mimetype))
        return sendApiError(res, 400, 'INVALID_IMAGE', 'Nur JPG, PNG und WEBP werden unterstützt');
      if (file.size > MAX_IMAGE_BYTES)
        return sendApiError(res, 400, 'INVALID_IMAGE', 'Bilder dürfen maximal 15 MB groß sein');
      if (file.size === 0) return sendApiError(res, 400, 'INVALID_IMAGE', 'Die Bilddatei ist leer');

      const panoramaId = randomUUID();
      const extension = MIME_EXTENSION[file.mimetype] ?? 'img';
      const key = `panoramas/${panoramaId}/original.${extension}`;
      const log = getLogger();

      try {
        await storage.put(key, file.buffer, file.mimetype);
      } catch (error) {
        log.error(
          { err: error, panoramaId, key },
          'Failed to store panorama {panoramaId} at {key}',
        );
        return sendApiError(
          res,
          500,
          'UPLOAD_FAILED',
          'Das Panorama konnte nicht gespeichert werden.',
        );
      }

      const panorama = await store.createPanorama({
        id: panoramaId,
        floorplanId: id,
        originalKey: key,
        imageUrl: fileUrl('panoramas', panoramaId),
        mimeType: file.mimetype,
        size: file.size,
        cameraX: floorplan.cameraX,
        cameraY: floorplan.cameraY,
        cameraYaw: floorplan.cameraYaw,
      });

      log.info(
        { panoramaId, floorplanId: id, key, mimeType: file.mimetype, size: file.size },
        'Panorama {panoramaId} uploaded to storage at {key}',
      );

      res.status(201).json({ panorama });
    }),
  );

  // ── Read a panorama ───────────────────────────────────────────────────────
  router.get(
    '/api/v360/panoramas/:id',
    asyncHandler(async (req, res) => {
      const panorama = await store.getPanorama(getParam(req, 'id'));
      if (!panorama) return sendApiError(res, 404, 'NOT_FOUND', 'Nicht gefunden');
      res.json({ panorama });
    }),
  );

  // ── Serve stored bytes (floor plan original + panorama) ───────────────────
  router.get(
    '/api/v360/floorplans/:id/file',
    asyncHandler(async (req, res) => {
      const floorplan = await store.getFloorplan(getParam(req, 'id'));
      if (!floorplan) return sendApiError(res, 404, 'NOT_FOUND', 'Nicht gefunden');
      const file = await storage.get(floorplan.originalKey);
      if (!file) return sendApiError(res, 404, 'NOT_FOUND', 'Nicht gefunden');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.type(floorplan.mimeType).send(file.content);
    }),
  );

  router.get(
    '/api/v360/panoramas/:id/file',
    asyncHandler(async (req, res) => {
      const panorama = await store.getPanorama(getParam(req, 'id'));
      if (!panorama) return sendApiError(res, 404, 'NOT_FOUND', 'Nicht gefunden');
      const file = await storage.get(panorama.originalKey);
      if (!file) return sendApiError(res, 404, 'NOT_FOUND', 'Nicht gefunden');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.type(panorama.mimeType).send(file.content);
    }),
  );

  return router;
}
