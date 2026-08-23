import { Router } from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Flux2FlexEditInput } from '@fal-ai/client/endpoints';
import { floorplanTo3D } from '../external-services/floorplan.js';
import { uploadPath } from '../lib/store.js';
import { upload, isAllowedImageMime, MAX_IMAGE_BYTES } from '../lib/upload.js';
import { sendError, errorMessage, asyncHandler } from '../lib/http.js';
import { getLogger } from '../lib/logger.js';

export const floorplanRouter = Router();

function optionalNumber(value: unknown): number | undefined {
  return typeof value === 'string' && value.trim() !== '' ? Number(value) : undefined;
}

floorplanRouter.post(
  '/api/floorplan/to3d',
  upload.single('image'),
  asyncHandler(async (req, res) => {
    const file = req.file;
    if (!file) return sendError(res, 400, 'Eine Bilddatei ist erforderlich');
    if (!isAllowedImageMime(file.mimetype))
      return sendError(res, 400, 'Nur JPG, PNG und WEBP werden unterstützt');
    if (file.size > MAX_IMAGE_BYTES)
      return sendError(res, 400, 'Bilder dürfen maximal 15 MB groß sein');

    const body = req.body || {};
    try {
      const result = await floorplanTo3D({
        imageBuffer: file.buffer,
        mimeType: file.mimetype,
        systemPrompt: typeof body.systemPrompt === 'string' ? body.systemPrompt : undefined,
        userPrompt: typeof body.userPrompt === 'string' ? body.userPrompt : undefined,
        imageSize:
          typeof body.imageSize === 'string' && body.imageSize
            ? (body.imageSize as Flux2FlexEditInput['image_size'])
            : undefined,
        guidanceScale: optionalNumber(body.guidanceScale),
        numInferenceSteps: optionalNumber(body.numInferenceSteps),
        seed: optionalNumber(body.seed),
      });

      await fs.mkdir(uploadPath, { recursive: true });
      const name = `floorplan-3d-${randomUUID()}.png`;
      const download = await fetch(result.imageUrl);
      if (!download.ok)
        throw new Error(`Failed to download generated image (HTTP ${download.status})`);
      await fs.writeFile(path.join(uploadPath, name), Buffer.from(await download.arrayBuffer()));

      res.json({ url: `/uploads/${name}`, falUrl: result.imageUrl, seed: result.seed });
    } catch (error) {
      getLogger().error({ err: error }, 'Floor plan conversion failed');
      sendError(res, 502, errorMessage(error, 'Die Umwandlung des Grundrisses konnte nicht abgeschlossen werden.'));
    }
  }),
);
