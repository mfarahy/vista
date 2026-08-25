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
import { brokerProfileRouter } from './routes/broker-profile.js';
import { jobsRouter, type JobDeps } from './routes/jobs.js';
import type { DocumentStorage } from './lib/document-storage.js';
import type { DocumentRecordStore } from './lib/document-record-store.js';
import type { RenderPdfFunction } from './services/pdf.js';

export interface CreateAppOptions {
  /** Injectable PDF renderer for tests; defaults to the Playwright renderer. */
  renderPdf?: RenderPdfFunction;
  /** Injectable job repository/publisher for tests; defaults to Prisma + NATS. */
  jobs?: JobDeps;
  /** Injectable document-file storage for tests; defaults to the configured provider. */
  documentStorage?: DocumentStorage;
  /** Injectable document-record store for tests; defaults to the shared Prisma store. */
  documentRecordStore?: DocumentRecordStore;
}

/**
 * Reads the CORS allowlist from `CORS_ORIGIN`. Multiple origins may be
 * separated by commas; a leading `www.` is normalized away so requests from
 * `https://example.com` and `https://www.example.com` are accepted
 * interchangeably. An unset or blank variable yields an empty allowlist,
 * which the `cors` middleware interprets as "reflect any origin" (dev mode,
 * matching the previous `process.env.CORS_ORIGIN || true` behavior).
 */
function resolveAllowedOrigins(): string[] {
  return (process.env.CORS_ORIGIN || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
    .map(canonicalOrigin);
}

/** Normalizes an origin to `scheme://host` for comparison, ignoring path, case, and `www.`. */
function canonicalOrigin(origin: string): string {
  try {
    const url = new URL(origin);
    const host = url.host.toLowerCase().replace(/^www\./, '');
    return `${url.protocol}//${host}`;
  } catch {
    return origin.trim().toLowerCase();
  }
}

export function createApp(options: CreateAppOptions = {}): express.Express {
  const app = express();

  const allowedOrigins = resolveAllowedOrigins();

  app.use(requestLogger());
  app.use(
    cors({
      origin(origin, callback) {
        // Server-to-server and same-origin requests carry no Origin header and
        // do not need CORS headers.
        if (!origin) return callback(null, false);
        // No explicit allowlist configured (dev): reflect any origin.
        if (allowedOrigins.length === 0) return callback(null, true);
        if (allowedOrigins.includes(canonicalOrigin(origin))) return callback(null, origin);
        return callback(new Error('Origin not allowed by CORS'));
      },
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
  app.use(
    documentsRouter({
      jobs: options.jobs,
      storage: options.documentStorage,
      recordStore: options.documentRecordStore,
    }),
  );
  app.use(brokerProfileRouter());
  app.use(jobsRouter(options.jobs));

  app.use(errorHandler);
  return app;
}
