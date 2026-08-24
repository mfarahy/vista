import { Router } from 'express';

import { upload } from '../lib/upload.js';
import {
  listDocuments,
  getDocument,
  createDocument,
  updateDocument,
  removeDocument,
} from '../lib/store.js';
import { getParam, sendError, asyncHandler, loadProperty } from '../lib/http.js';
import { getLogger } from '../lib/logger.js';
import type { DocumentRecord } from '../lib/types.js';
import { validateDocuments } from '../services/document-upload.js';
import { createDocumentStorage, type DocumentStorage } from '../lib/document-storage.js';
import { createJobEvent } from '../lib/jobs/event.js';
import { jobStore } from '../lib/jobs/store.js';
import { publishJob } from '../lib/jobs/publisher.js';
import type { JobDeps } from './jobs.js';

const defaultJobDeps: JobDeps = {
  repo: {
    create: (input) => jobStore.create(input),
    get: (id) => jobStore.get(id),
  },
  publish: (event) => publishJob(event),
};

export interface DocumentsRouterOptions {
  /** Injectable job repository/publisher for tests; defaults to Prisma + NATS. */
  jobs?: JobDeps;
  /** Injectable document-file storage for tests; defaults to the configured provider. */
  storage?: DocumentStorage;
}

/**
 * Enqueues a document-processing job for the given documents: persists the job
 * as `queued`, publishes a `document-processing` event to NATS, and returns the
 * jobId immediately. All document processing is now asynchronous (executed by
 * job-processor), never inline within the request.
 */
async function enqueueDocumentProcessing(
  jobs: JobDeps,
  propertyId: string,
  documentIds: string[],
): Promise<{ jobId: string; status: 'queued'; type: string }> {
  const payload = { propertyId, documentIds };
  const record = await jobs.repo.create({ type: 'document-processing', payload });
  const event = createJobEvent({
    jobId: record.id,
    jobType: 'document-processing',
    payload,
  });
  await jobs.publish(event);
  getLogger().info(
    { jobId: record.id, propertyId, count: documentIds.length },
    'Enqueued document-processing job {jobId} for {count} documents of property {propertyId}',
  );
  return { jobId: record.id, status: 'queued', type: 'document-processing' };
}

export function documentsRouter(options: DocumentsRouterOptions = {}): Router {
  const router = Router();
  const jobs = options.jobs ?? defaultJobDeps;
  const storage = options.storage ?? createDocumentStorage();

  router.get(
    '/api/properties/:id/documents',
    asyncHandler(async (req, res) => {
      const property = await loadProperty(req, res);
      if (!property) return;
      res.json(await listDocuments(property.id));
    }),
  );

  router.post(
    '/api/properties/:id/documents',
    upload.array('files'),
    asyncHandler(async (req, res) => {
      const property = await loadProperty(req, res);
      if (!property) return;

      const files = Array.isArray(req.files) ? req.files : [];
      const validation = validateDocuments(files);
      if (!validation.ok) return sendError(res, 400, validation.error);

      // Persist every file to storage and create the document records first,
      // then enqueue a single async processing job. The heavy OCR + AI work is
      // now delegated to job-processor, so this request returns the jobId
      // immediately instead of blocking on analysis.
      const documentIds: string[] = [];
      for (const file of files) {
        const record = await createDocument(property.id, {
          filename: file.originalname,
          mimeType: file.mimetype,
          size: file.size,
          url: '',
        });
        await storage.put(record.id, file.buffer, file.mimetype);
        await updateDocument(record.id, { url: `/api/documents/${record.id}/file` });
        documentIds.push(record.id);
      }

      const result = await enqueueDocumentProcessing(jobs, property.id, documentIds);
      res.status(201).json(result);
    }),
  );

  router.get(
    '/api/properties/:id/documents/:documentId',
    asyncHandler(async (req, res) => {
      const property = await loadProperty(req, res);
      if (!property) return;
      const document = await getDocument(getParam(req, 'documentId'));
      if (!document || document.propertyId !== property.id) return sendError(res, 404, 'Nicht gefunden');
      res.json(document);
    }),
  );

  router.get(
    '/api/documents/:documentId/file',
    asyncHandler(async (req, res) => {
      const document = await getDocument(getParam(req, 'documentId'));
      if (!document) return sendError(res, 404, 'Nicht gefunden');
      const file = await storage.get(document.id);
      if (!file) return sendError(res, 404, 'Nicht gefunden');
      res.type(document.mimeType).send(file.content);
    }),
  );

  router.post(
    '/api/properties/:id/documents/:documentId/analyze',
    asyncHandler(async (req, res) => {
      const property = await loadProperty(req, res);
      if (!property) return;
      const document = await getDocument(getParam(req, 'documentId'));
      if (!document || document.propertyId !== property.id) return sendError(res, 404, 'Nicht gefunden');
      const result = await enqueueDocumentProcessing(jobs, property.id, [document.id]);
      res.json(result);
    }),
  );

  router.delete(
    '/api/properties/:id/documents/:documentId',
    asyncHandler(async (req, res) => {
      const property = await loadProperty(req, res);
      if (!property) return;
      const document = await getDocument(getParam(req, 'documentId'));
      if (!document || document.propertyId !== property.id) return sendError(res, 404, 'Nicht gefunden');
      await removeDocument(document.id);
      await storage.delete(document.id);
      res.json({ ok: true });
    }),
  );

  return router;
}

export type { DocumentRecord };
