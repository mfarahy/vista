import type { DocumentAnalysisResult, DocumentRecord } from '../types.js';
import type { DocumentUnderstandingInput, DocumentUnderstandingResult } from './types.js';
import { isImageMime } from './types.js';
import { getLogger } from '../logger.js';

/**
 * Orchestrates the full document pipeline for a single document:
 *
 *   OCR (analysis provider) → understand (AI provider) → persist
 *
 * Kept as a dependency-injected pure pipeline so the route stays thin and the
 * failure behavior can be tested: when the AI step fails, the OCR result is
 * still persisted and the document is not lost.
 *
 * The two stages are exposed individually (`runOcrStep`, `runUnderstandStep`)
 * so the async job processor can report per-step progress while still reusing
 * the exact same persistence/failure semantics as `runDocumentPipeline`.
 */

export interface DocumentPipelineUpdate {
  status?: 'completed' | 'failed';
  documentType?: DocumentRecord['documentType'];
  error?: string | null;
  analysisResult?: DocumentAnalysisResult | null;
  tags?: string[];
  understandingResult?: DocumentRecord['understandingResult'];
  understandingError?: string | null;
}

export interface DocumentPipelineDeps {
  analyze(content: Buffer, mimeType: string): Promise<DocumentAnalysisResult>;
  understand(input: DocumentUnderstandingInput): Promise<DocumentUnderstandingResult>;
  update(documentId: string, patch: DocumentPipelineUpdate): Promise<DocumentRecord | null>;
}

/** Result of the OCR stage: the raw analysis plus the persisted OCR record. */
export interface OcrStepResult {
  ocr: DocumentAnalysisResult;
  withOcr: DocumentRecord;
}

/**
 * Runs the OCR stage and persists its result. On OCR failure the document is
 * marked `failed` and the (failed) record is returned; when the persisted
 * update returns null, null is returned.
 */
export async function runOcrStep(
  record: DocumentRecord,
  content: Buffer,
  mimeType: string,
  deps: DocumentPipelineDeps,
): Promise<OcrStepResult | DocumentRecord | null> {
  let ocr: DocumentAnalysisResult;
  try {
    ocr = await deps.analyze(content, mimeType);
  } catch {
    getLogger().warn(
      { documentId: record.id },
      'Document analysis failed for document {documentId}',
    );
    return deps.update(record.id, {
      status: 'failed',
      error: 'Das Dokument konnte nicht analysiert werden.',
    });
  }

  const withOcr = await deps.update(record.id, {
    status: 'completed',
    documentType: ocr.documentType ?? null,
    analysisResult: ocr,
    understandingResult: null,
    understandingError: null,
  });
  if (!withOcr) return null;
  return { ocr, withOcr };
}

/**
 * Runs the AI understanding stage on top of an already-completed OCR result.
 * When the AI step fails, the OCR result is preserved and the document stays
 * `completed`, exactly like the combined pipeline.
 */
export async function runUnderstandStep(
  withOcr: DocumentRecord,
  ocr: DocumentAnalysisResult,
  content: Buffer,
  mimeType: string,
  deps: DocumentPipelineDeps,
): Promise<DocumentRecord | null> {
  try {
    const understanding = await deps.understand({
      documentId: withOcr.id,
      filename: withOcr.filename,
      mimeType,
      text: ocr.text,
      pages: ocr.pages,
      image: isImageMime(mimeType) ? { content, mimeType } : null,
    });
    return deps.update(withOcr.id, {
      status: 'completed',
      documentType: understanding.documentType,
      tags: understanding.tags,
      understandingResult: understanding,
      understandingError: null,
    });
  } catch {
    getLogger().warn(
      { documentId: withOcr.id },
      'Document understanding failed for document {documentId}; preserving OCR result',
    );
    return deps.update(withOcr.id, {
      status: 'completed',
      documentType: withOcr.documentType ?? null,
      understandingResult: null,
      understandingError: 'The AI could not understand this document. The OCR result was preserved.',
    });
  }
}

export async function runDocumentPipeline(
  record: DocumentRecord,
  content: Buffer,
  mimeType: string,
  deps: DocumentPipelineDeps,
): Promise<DocumentRecord | null> {
  const step = await runOcrStep(record, content, mimeType, deps);
  if (!step) return null;
  if ('ocr' in step) {
    return runUnderstandStep(step.withOcr, step.ocr, content, mimeType, deps);
  }
  return step as DocumentRecord;
}
