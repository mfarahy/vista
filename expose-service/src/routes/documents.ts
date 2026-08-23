import { Router } from 'express';
import path from 'node:path';
import fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

import { upload, ALLOWED_DOCUMENT_MIMES, MAX_DOCUMENT_BYTES } from '../lib/upload.js';
import {
  uploadPath,
  listDocuments,
  getDocument,
  createDocument,
  updateDocument,
  removeDocument,
} from '../lib/store.js';
import { getParam, sendError, asyncHandler, loadProperty } from '../lib/http.js';
import { getLogger } from '../lib/logger.js';
import { createDocumentAnalysisProvider } from '../lib/document-analysis/index.js';
import { createDocumentUnderstandingProvider } from '../lib/document-understanding/index.js';
import { runDocumentPipeline } from '../lib/document-understanding/pipeline.js';
import { DOCUMENT_ANALYSIS_CONCURRENCY, mapWithConcurrency } from '../lib/concurrency.js';
import type { DocumentRecord } from '../lib/types.js';

export const documentsRouter = Router();

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '');
}

async function analyzeRecord(record: DocumentRecord, content: Buffer, mimeType: string) {
  const analysisProvider = createDocumentAnalysisProvider();
  const understandingProvider = createDocumentUnderstandingProvider();
  return runDocumentPipeline(record, content, mimeType, {
    analyze: (buffer, type) =>
      analysisProvider.analyzeDocument({
        documentId: record.id,
        filename: record.filename,
        mimeType: type,
        content: buffer,
      }),
    understand: (input) => understandingProvider.analyzeDocument(input),
    update: (documentId, patch) => updateDocument(documentId, patch),
  });
}

documentsRouter.get(
  '/api/properties/:id/documents',
  asyncHandler(async (req, res) => {
    const property = await loadProperty(req, res);
    if (!property) return;
    res.json(await listDocuments(property.id));
  }),
);

documentsRouter.post(
  '/api/properties/:id/documents',
  upload.array('files'),
  asyncHandler(async (req, res) => {
    const property = await loadProperty(req, res);
    if (!property) return;

    const files = Array.isArray(req.files) ? req.files : [];
    if (!files.length) return sendError(res, 400, 'Keine Dokumente gefunden');
    for (const file of files) {
      if (!ALLOWED_DOCUMENT_MIMES.has(file.mimetype))
        return sendError(res, 400, 'Nur PDF, JPG, PNG und WEBP werden unterstützt');
      if (file.size > MAX_DOCUMENT_BYTES)
        return sendError(res, 400, 'Dokumente dürfen maximal 25 MB groß sein');
    }

    await fs.mkdir(uploadPath, { recursive: true });

    // Persist every file and create the document records first (serialized),
    // then run the expensive OCR + AI analyses with bounded concurrency. The
    // per-document pipeline isolates failures, so one failed document never
    // cancels the others. Result order follows the upload order.
    const records = new Array<DocumentRecord>(files.length);
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      const name = `${randomUUID()}-${sanitizeFileName(file.originalname)}`;
      await fs.writeFile(path.join(uploadPath, name), file.buffer);
      records[index] = await createDocument(property.id, {
        filename: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        url: `/uploads/${name}`,
      });
    }
    const results = await mapWithConcurrency(
      files,
      DOCUMENT_ANALYSIS_CONCURRENCY,
      async (file, index) => {
        try {
          return (
            (await analyzeRecord(records[index], file.buffer, file.mimetype)) ?? records[index]
          );
        } catch (error) {
          getLogger().error(
            { err: error, documentId: records[index].id },
            'Document analysis crashed for document {documentId}',
          );
          return (
            (await updateDocument(records[index].id, {
              status: 'failed',
              error: 'Das Dokument konnte nicht analysiert werden.',
            })) ?? records[index]
          );
        }
      },
    );
    res.status(201).json(results);
  }),
);

documentsRouter.get(
  '/api/properties/:id/documents/:documentId',
  asyncHandler(async (req, res) => {
    const property = await loadProperty(req, res);
    if (!property) return;
    const document = await getDocument(getParam(req, 'documentId'));
    if (!document || document.propertyId !== property.id) return sendError(res, 404, 'Nicht gefunden');
    res.json(document);
  }),
);

documentsRouter.post(
  '/api/properties/:id/documents/:documentId/analyze',
  asyncHandler(async (req, res) => {
    const property = await loadProperty(req, res);
    if (!property) return;
    const document = await getDocument(getParam(req, 'documentId'));
    if (!document || document.propertyId !== property.id) return sendError(res, 404, 'Nicht gefunden');

    const filePath = path.join(uploadPath, path.basename(document.url));
    let content: Buffer;
    try {
      content = await fs.readFile(filePath);
    } catch {
      return sendError(res, 422, 'Die Dokumentdatei fehlt.');
    }
    const updated = await analyzeRecord(document, content, document.mimeType);
    res.json(updated);
  }),
);

documentsRouter.delete(
  '/api/properties/:id/documents/:documentId',
  asyncHandler(async (req, res) => {
    const property = await loadProperty(req, res);
    if (!property) return;
    const document = await getDocument(getParam(req, 'documentId'));
    if (!document || document.propertyId !== property.id) return sendError(res, 404, 'Nicht gefunden');
    await removeDocument(document.id);
    await fs.rm(path.join(uploadPath, path.basename(document.url)), { force: true });
    res.json({ ok: true });
  }),
);
