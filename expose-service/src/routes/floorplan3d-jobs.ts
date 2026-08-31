import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { upload, isAllowedImageMime, MAX_IMAGE_BYTES } from '../lib/upload.js';
import { sendError, asyncHandler, getParam } from '../lib/http.js';
import { getLogger } from '../lib/logger.js';
import { createDocumentStorage, type DocumentStorage } from '../lib/document-storage.js';
import { jobStore } from '../lib/jobs/store.js';
import { publishJob } from '../lib/jobs/publisher.js';
import { createJobEvent } from '../lib/jobs/event.js';
import type { JobDeps } from './jobs.js';

export const FLOORPLAN_3D_JOB_TYPE = 'floorplan-3d';

export interface Floorplan3DJobPayload {
  assetId: string;
  r2Key: string;
  mimeType: string;
  fileName: string;
  provider?: string;
}

export interface Floorplan3DJobsRouterOptions {
  jobs?: JobDeps;
  storage?: DocumentStorage;
}

const defaultJobs: JobDeps = {
  repo: {
    create: (input) => jobStore.create(input),
    get: (id) => jobStore.get(id),
  },
  publish: (event) => publishJob(event),
};

/** Allowed provider names. Matches the FloorPlanProviderName union. */
const ALLOWED_PROVIDERS = new Set(['floorplan-recognition', 'meltflex']);

export function floorplan3DJobsRouter(options: Floorplan3DJobsRouterOptions = {}): Router {
  const router = Router();
  const jobs = options.jobs ?? defaultJobs;
  const storage = options.storage ?? createDocumentStorage();

  // POST /api/floorplan3d/jobs — upload floor plan, store in R2, enqueue job
  router.post(
    '/api/floorplan3d/jobs',
    upload.single('image'),
    asyncHandler(async (req, res) => {
      const file = (req as unknown as { file?: Express.Multer.File }).file;
      if (!file) return sendError(res, 400, 'Eine Bilddatei ist erforderlich');
      if (!isAllowedImageMime(file.mimetype)) return sendError(res, 400, 'Nur JPG, PNG und WEBP werden unterstützt');
      if (file.size > MAX_IMAGE_BYTES) return sendError(res, 400, 'Bilder dürfen maximal 15 MB groß sein');
      if (file.size === 0) return sendError(res, 400, 'Die Bilddatei ist leer');

      // Optional provider selection from form field or query param
      const rawProvider = (req.body?.provider as string | undefined)
        ?? (req.query?.provider as string | undefined);
      const provider = rawProvider && ALLOWED_PROVIDERS.has(rawProvider) ? rawProvider : undefined;

      const assetId = randomUUID();
      const r2Key = `documents/${assetId}`;
      const log = getLogger();

      try {
        await storage.put(assetId, file.buffer, file.mimetype);
      } catch (error) {
        log.error({ err: error, assetId }, 'Failed to upload floor plan {assetId} to storage');
        return sendError(res, 500, 'Der Upload konnte nicht gespeichert werden.');
      }

      log.info({ assetId, r2Key, mimeType: file.mimetype, size: file.size, provider }, 'Floor plan asset {assetId} uploaded to R2 at {r2Key}');

      const payload: Floorplan3DJobPayload = {
        assetId,
        r2Key,
        mimeType: file.mimetype,
        fileName: file.originalname,
        ...(provider ? { provider } : {}),
      };

      const record = await jobs.repo.create({ type: FLOORPLAN_3D_JOB_TYPE, payload });
      const event = createJobEvent({ jobId: record.id, jobType: FLOORPLAN_3D_JOB_TYPE, payload });
      await jobs.publish(event);

      log.info({ jobId: record.id, assetId, r2Key, provider }, 'Published {jobType} job {jobId} for asset {assetId}');

      res.status(201).json({
        jobId: record.id,
        status: 'queued',
        type: FLOORPLAN_3D_JOB_TYPE,
        assetId,
        provider: provider ?? '(default)',
      });
    }),
  );

  // GET /api/floorplan3d/image/:assetId — serve original floor plan for AI providers (temporary access)
  // No auth for providers; restricted to UUID-like keys and only R2 objects we created.
  router.get(
    '/api/floorplan3d/image/:assetId',
    asyncHandler(async (req, res) => {
      const assetId = getParam(req, 'assetId');
      const log = getLogger();
      const startAt = Date.now();
      const ua = req.headers['user-agent'] ?? 'unknown';
      const ip = req.ip ?? req.socket.remoteAddress ?? 'unknown';
      if (!/^[0-9a-f-]{10,}$/i.test(assetId)) {
        log.warn({ assetId, ua, ip }, 'Floorplan image request rejected: invalid assetId format {assetId}');
        return sendError(res, 404, 'Nicht gefunden');
      }
      const file = await storage.get(assetId);
      const durationMs = Date.now() - startAt;
      if (!file) {
        log.warn({ assetId, ua, ip, durationMs }, 'Floorplan image not found {assetId} for UA {ua} after {durationMs}ms');
        return sendError(res, 404, 'Nicht gefunden');
      }
      const contentType = file.mimeType || 'image/png';
      log.info({ assetId, ua, ip, bytes: file.content.length, contentType, durationMs }, 'Serving floorplan image {assetId} ({bytes} bytes, {contentType}) to {ua} in {durationMs}ms');
      res.setHeader('Cache-Control', 'public, max-age=60');
      res.type(contentType).send(file.content);
    }),
  );

  // GET /api/floorplan3d/result/:jobId/file — serve generated GLB if we stored base64 fallback
  router.get(
    '/api/floorplan3d/result/:jobId/file',
    asyncHandler(async (req, res) => {
      const jobId = getParam(req, 'jobId');
      const log = getLogger();
      const startAt = Date.now();
      const resultAssetId = `floorplan-result-${jobId}`;
      const file = await storage.get(resultAssetId);
      const durationMs = Date.now() - startAt;
      if (!file) {
        log.warn({ jobId, resultAssetId, durationMs }, 'GLB result not found {resultAssetId} after {durationMs}ms');
        return sendError(res, 404, 'Nicht gefunden');
      }
      log.info({ jobId, resultAssetId, bytes: file.content.length, durationMs }, 'Serving GLB result {resultAssetId} ({bytes} bytes) in {durationMs}ms');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.type('model/gltf-binary').send(file.content);
    }),
  );

  return router;
}
