import { Router } from 'express';
import { getParam, sendError, asyncHandler } from '../lib/http.js';
import {
  createDefaultDocumentProcessor,
  type DocumentProcessor,
} from '../lib/document-processor.js';

/**
 * Internal endpoints consumed by job-processor's `document-processing`
 * handler. They expose the individual pipeline stages (OCR, understanding) so
 * the worker can report meaningful progress. These are intentionally not part
 * of the public client API; in production the worker reaches them via its
 * `API_BASE_URL` and the NATS-triggered workflow.
 */
export interface InternalRouterOptions {
  processor?: DocumentProcessor;
}

export function internalRouter(options: InternalRouterOptions = {}): Router {
  const router = Router();
  const processor = options.processor ?? createDefaultDocumentProcessor();

  router.post(
    '/api/internal/documents/:documentId/ocr',
    asyncHandler(async (req, res) => {
      const record = await processor.ocr(getParam(req, 'documentId'));
      if (!record) return sendError(res, 404, 'Nicht gefunden');
      res.json({ record });
    }),
  );

  router.post(
    '/api/internal/documents/:documentId/understand',
    asyncHandler(async (req, res) => {
      const record = await processor.understand(getParam(req, 'documentId'));
      if (!record) return sendError(res, 404, 'Nicht gefunden');
      res.json({ record });
    }),
  );

  return router;
}
