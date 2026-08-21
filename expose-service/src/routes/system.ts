import { Router } from 'express';
import fs from 'node:fs/promises';
import { uploadPath } from '../lib/store.js';
import { asyncHandler } from '../lib/http.js';

export const systemRouter = Router();

systemRouter.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'vista-expose-service' });
});

systemRouter.get(
  '/ready',
  asyncHandler(async (_req, res) => {
    try {
      await fs.access(uploadPath);
      res.json({ status: 'ready', service: 'vista-expose-service' });
    } catch {
      res.status(503).json({ status: 'not-ready', service: 'vista-expose-service' });
    }
  }),
);
