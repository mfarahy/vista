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

    ctx.log.info(
      { jobId: ctx.job.jobId, documentIds, count: total },
      'Starting document-processing job %s for %s document(s)',
      ctx.job.jobId,
      total,
    );

    for (let index = 0; index < total; index += 1) {
      const documentId = documentIds[index];
      const ocrProgress = Math.round((index / total) * 100);
      const understandProgress = Math.round(((index + 1) / total) * 100);

      ctx.log.info(
        { jobId: ctx.job.jobId, documentId, index: index + 1, total, progress: ocrProgress },
        'Processing document %s (%s/%s): starting OCR',
        documentId,
        index + 1,
        total,
      );
      await ctx.update({
        progress: ocrProgress,
        currentStep: 'ocr',
        message: `Analyzing document ${index + 1} of ${total}`,
      });

      const ocrStartedAt = Date.now();
      try {
        const ocr = await client.ocr(documentId);
        const ocrMs = Date.now() - ocrStartedAt;
        if (ocr.record.status === 'failed') {
          ctx.log.warn(
            { jobId: ctx.job.jobId, documentId, durationMs: ocrMs },
            'OCR failed for document %s after %sms; skipping understanding',
            documentId,
            ocrMs,
          );
          failed += 1;
          continue;
        }
        ctx.log.info(
          { jobId: ctx.job.jobId, documentId, durationMs: ocrMs, progress: understandProgress },
          'OCR completed for document %s in %sms; starting understanding',
          documentId,
          ocrMs,
        );

        await ctx.update({
          progress: understandProgress,
          currentStep: 'understanding',
          message: `Understanding document ${index + 1} of ${total}`,
        });
        const understandStartedAt = Date.now();
        await client.understand(documentId);
        ctx.log.info(
          {
            jobId: ctx.job.jobId,
            documentId,
            durationMs: Date.now() - understandStartedAt,
            progress: understandProgress,
          },
          'Document %s processed successfully',
          documentId,
        );
      } catch (error) {
        ctx.log.error(
          { err: error, jobId: ctx.job.jobId, documentId },
          'Document processing failed for %s',
          documentId,
        );
        failed += 1;
      }
    }

    if (failed === total) {
      const message = `All ${total} document(s) failed to process`;
      ctx.log.error(
        { jobId: ctx.job.jobId, total, failed },
        message,
      );
      throw new Error(message);
    }

    const message =
      failed > 0
        ? `Processed ${total - failed} of ${total} document(s) (${failed} failed)`
        : `Processed ${total} document(s)`;
    ctx.log.info(
      { jobId: ctx.job.jobId, total, failed, progress: 100 },
      'Finished document-processing job %s: %s',
      ctx.job.jobId,
      message,
    );
    await ctx.update({ progress: 100, currentStep: 'done', message });
    return { message };
  };
}

/** Default handler wired to the HTTP client (expose-service worker API). */
export const documentProcessingHandler: JobHandler = makeDocumentProcessingHandler(
  createHttpDocumentProcessingClient(loadConfig().exposeServiceUrl),
);
