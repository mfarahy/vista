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

export async function runDocumentPipeline(
  record: DocumentRecord,
  content: Buffer,
  mimeType: string,
  deps: DocumentPipelineDeps,
): Promise<DocumentRecord | null> {
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

  try {
    const understanding = await deps.understand({
      documentId: record.id,
      filename: record.filename,
      mimeType,
      text: ocr.text,
      pages: ocr.pages,
      image: isImageMime(mimeType) ? { content, mimeType } : null,
    });
    return deps.update(record.id, {
      status: 'completed',
      documentType: understanding.documentType,
      tags: understanding.tags,
      understandingResult: understanding,
      understandingError: null,
    });
  } catch {
    getLogger().warn(
      { documentId: record.id },
      'Document understanding failed for document {documentId}; preserving OCR result',
    );
    return deps.update(record.id, {
      status: 'completed',
      documentType: withOcr.documentType ?? null,
      understandingResult: null,
      understandingError: 'The AI could not understand this document. The OCR result was preserved.',
    });
  }
}
