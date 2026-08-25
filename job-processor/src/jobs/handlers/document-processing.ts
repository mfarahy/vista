import type { JobHandler } from '../dispatcher.js';
import { errorMessage } from '../../lib/error.js';
import { createDefaultDocumentProcessor } from '../../lib/document-processor.js';
import type { DocumentProcessor } from '../../lib/document-processor.js';

export interface DocumentProcessingPayload {
  propertyId?: string;
  /** Batch of document ids to process (preferred form). */
  documentIds?: string[];
  /** Single document id (alternative form). */
  documentId?: string;
}

/**
 * Handler for the `document-processing` job type. expose-service uploads the
 * document bytes to object storage (R2) and persists a pending document record;
 * this handler performs the heavy work locally: for each document it reads the
 * record, downloads the file directly from storage, runs OCR, then the AI
 * understanding stage, and writes the results back to the shared Document
 * table. No HTTP call into expose-service is needed. A failing document is
 * logged and contained so it never crashes the worker; the job always ends
 * completed (partial failures) or failed (every document failed / malformed
 * payload) via the consumer.
 */
export function makeDocumentProcessingHandler(processor: DocumentProcessor): JobHandler {
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
    const failureReasons: string[] = [];

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
        const ocr = await processor.ocr(documentId);
        if (!ocr) {
          ctx.log.warn(
            { jobId: ctx.job.jobId, documentId, durationMs: Date.now() - ocrStartedAt },
            'Document %s not found for OCR; skipping understanding',
            documentId,
          );
          failed += 1;
          failureReasons.push('Document not found');
          continue;
        }
        if (ocr.status === 'failed') {
          ctx.log.warn(
            { jobId: ctx.job.jobId, documentId, durationMs: Date.now() - ocrStartedAt, error: ocr.error },
            'OCR failed for document %s after %sms; skipping understanding',
            documentId,
            Date.now() - ocrStartedAt,
          );
          failed += 1;
          failureReasons.push(typeof ocr.error === 'string' && ocr.error ? ocr.error : 'OCR failed');
          continue;
        }
        ctx.log.info(
          { jobId: ctx.job.jobId, documentId, durationMs: Date.now() - ocrStartedAt, progress: understandProgress },
          'OCR completed for document %s in %sms; starting understanding',
          documentId,
          Date.now() - ocrStartedAt,
        );

        await ctx.update({
          progress: understandProgress,
          currentStep: 'understanding',
          message: `Understanding document ${index + 1} of ${total}`,
        });
        const understandStartedAt = Date.now();
        await processor.understand(documentId);
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
        failureReasons.push(errorMessage(error, 'document processing failed'));
      }
    }

    if (failed === total) {
      const firstReason =
        failureReasons.find((reason) => reason && reason !== 'OCR failed') ??
        failureReasons[0];
      const message =
        failureReasons.length > 0
          ? `All ${total} document(s) failed to process: ${firstReason}`
          : `All ${total} document(s) failed to process`;
      ctx.log.error(
        { jobId: ctx.job.jobId, total, failed, failureReasons },
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

/** Default handler wired to the local document pipeline (runs directly in the worker). */
export const documentProcessingHandler: JobHandler = makeDocumentProcessingHandler(
  createDefaultDocumentProcessor(),
);