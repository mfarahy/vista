import { Router } from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { brokerProfileSchema } from '../lib/broker-profile.js';
import { getBrokerProfile, saveBrokerProfile, uploadPath } from '../lib/store.js';
import { upload, isAllowedImageMime, MAX_IMAGE_BYTES } from '../lib/upload.js';
import { sendError, errorMessage, asyncHandler } from '../lib/http.js';
import { getLogger } from '../lib/logger.js';

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '');
}

/**
 * Broker Profile routes (MVP). The profile is the single source of truth for
 * broker information across all Exposés:
 *
 *   GET /api/broker-profile   → the persisted profile (seeded from legacy
 *                               per-property agent data when nothing is saved)
 *   PUT /api/broker-profile   → upsert, validated with Zod
 *   POST /api/broker-profile/image → stores one photo/logo file under
 *                               /uploads/broker/ and returns its URL
 */
export function brokerProfileRouter(): Router {
  const router = Router();

  router.get(
    '/api/broker-profile',
    asyncHandler(async (_req, res) => {
      res.json(await getBrokerProfile());
    }),
  );

  router.put(
    '/api/broker-profile',
    asyncHandler(async (req, res) => {
      try {
        const profile = brokerProfileSchema.parse(req.body);
        res.json(await saveBrokerProfile(profile));
      } catch (error) {
        sendError(res, 400, errorMessage(error, 'Ungültiges Broker-Profil'));
      }
    }),
  );

  router.post(
    '/api/broker-profile/image',
    upload.array('files'),
    asyncHandler(async (req, res) => {
      const files = Array.isArray(req.files) ? req.files : [];
      if (!files.length) return sendError(res, 400, 'Keine Datei gefunden');
      const file = files[0];
      if (!isAllowedImageMime(file.mimetype))
        return sendError(res, 400, 'Nur JPG, PNG und WEBP werden unterstützt');
      if (file.size > MAX_IMAGE_BYTES)
        return sendError(res, 400, 'Bilder dürfen maximal 15 MB groß sein');

      const brokerDir = path.join(uploadPath, 'broker');
      await fs.mkdir(brokerDir, { recursive: true });
      const name = `${randomUUID()}-${sanitizeFileName(file.originalname)}`;
      await fs.writeFile(path.join(brokerDir, name), file.buffer);
      getLogger().info({ url: `/uploads/broker/${name}` }, 'Stored broker profile image');
      res.status(201).json({ url: `/uploads/broker/${name}` });
    }),
  );

  return router;
}