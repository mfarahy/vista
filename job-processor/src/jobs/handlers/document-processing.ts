import type { JobHandler } from '../dispatcher.js';
import { loadConfig } from '../../config.js';
import {
  createHttpDocumentProcessingClient,
  type DocumentProcessingClient,
} from './document-processing-client.js';

export interface DocumentProcessingPayload {
  propertyId?: string;
  /** Batch of document ids to process (preferred form). */
  documentIds?: string[];
  /** Single document id (alternative form). */
  documentId?: string;
}

/**
 * Handler for the `document-processing` job type. It drives the existing
 * document pipeline (OCR → understanding) per document through an injectable
 * client, reporting meaningful progress between the two stages. A failing
 * document is logged and contained so it never crashes the worker; the job
 * always ends completed (partial failures) or failed (every document failed /
 * malformed payload) via the consumer.
 */
export function makeDocumentProcessingHandler(
  client: DocumentProcessingClient,
): JobHandler {
  return async (ctx) => {
    const payload = (ctx.job.payload ?? {}) as DocumentProcessingPayload;
    const documentIds =
      Array.isArray(payload.documentIds) && payload.documentIds.length > 0
        ? payload.documentIds
        : typeof payload.documentId === 'string'
          ? [payload.documentId]
          : [];

    if (documentIds.length === 0) {
      throw new Error('document-processing: payload must provide documentIds or documentId');
    }

    const total = documentIds.length;
    let failed = 0;

    for (let index = 0; index < total; index += 1) {
      const documentId = documentIds[index];
      const ocrProgress = Math.round((index / total) * 100);
      const understandProgress = Math.round(((index + 1) / total) * 100);

      ctx.log.info({ documentId, index: index + 1, total }, 'Processing document {index}/{total}');
      await ctx.update({
        progress: ocrProgress,
        currentStep: 'ocr',
        message: `Analyzing document ${index + 1} of ${total}`,
      });

      try {
        const ocr = await client.ocr(documentId);
        if (ocr.record.status === 'failed') {
          ctx.log.warn({ documentId }, 'OCR failed for document {documentId}; skipping understanding');
          failed += 1;
          continue;
        }

        await ctx.update({
          progress: understandProgress,
          currentStep: 'understanding',
          message: `Understanding document ${index + 1} of ${total}`,
        });
        await client.understand(documentId);
      } catch (error) {
        ctx.log.error({ err: error, documentId }, 'Document processing failed for {documentId}');
        failed += 1;
      }
    }

    if (failed === total) {
      throw new Error(`All ${total} document(s) failed to process`);
    }

    const message =
      failed > 0
        ? `Processed ${total - failed} of ${total} document(s) (${failed} failed)`
        : `Processed ${total} document(s)`;
    await ctx.update({ progress: 100, currentStep: 'done', message });
    ctx.log.info({ total, failed }, 'Finished document-processing job');
    return { message };
  };
}

/** Default handler wired to the HTTP client (expose-service worker API). */
export const documentProcessingHandler: JobHandler = makeDocumentProcessingHandler(
  createHttpDocumentProcessingClient(loadConfig().exposeServiceUrl),
);
