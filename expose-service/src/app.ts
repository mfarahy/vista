import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { uploadPath } from './lib/store.js';
import { errorHandler } from './lib/http.js';
import { requestLogger } from './lib/logger.js';
import { systemRouter } from './routes/system.js';
import { addressRouter } from './routes/address.js';
import { propertiesRouter } from './routes/properties.js';
import { floorplanRouter } from './routes/floorplan.js';
import { documentsRouter } from './routes/documents.js';
import type { RenderPdfFunction } from './services/pdf.js';

export interface CreateAppOptions {
  /** Injectable PDF renderer for tests; defaults to the Playwright renderer. */
  renderPdf?: RenderPdfFunction;
}

export function createApp(options: CreateAppOptions = {}): express.Express {
  const app = express();

  app.use(requestLogger());
  app.use(
    cors({
      origin: process.env.CORS_ORIGIN || true,
      credentials: true,
      exposedHeaders: ['Content-Disposition'],
    }),
  );
  app.use(express.json({ limit: '20mb', type: ['application/json', 'application/*+json'] }));
  app.use('/uploads', express.static(uploadPath));
  app.use('/demo', express.static(path.join(process.cwd(), 'public', 'demo')));

  app.use(systemRouter);
  app.use(addressRouter);
  app.use(propertiesRouter(options));
  app.use(floorplanRouter);
  app.use(documentsRouter);

  app.use(errorHandler);
  return app;
}
