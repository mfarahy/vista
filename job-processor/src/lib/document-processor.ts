import { getDocument, updateDocument } from './store.js';
import { getLogger } from './logger.js';
import {
  runOcrStep,
  runUnderstandStep,
  type DocumentPipelineDeps,
} from './document-understanding/pipeline.js';
import { createDocumentAnalysisProvider } from './document-analysis/index.js';
import { createDocumentUnderstandingProvider } from './document-understanding/index.js';
import type { DocumentStorage } from './document-storage.js';
import { createDocumentStorage } from './document-storage.js';
import type { DocumentRecord } from './types.js';
import type { DocumentAnalysisProvider } from './document-analysis/types.js';
import type { DocumentUnderstandingProvider } from './document-understanding/types.js';

/**
 * Executes the document-processing workflow for a stored document. The two
 * pipeline stages (OCR, then understanding) are exposed separately so the
 * async job processor can report per-step progress. All business logic is
 * delegated to the dependency-injected document pipeline; nothing is duplicated
 * here.
 */
export interface DocumentProcessor {
  ocr(documentId: string): Promise<DocumentRecord | null>;
  understand(documentId: string): Promise<DocumentRecord | null>;
}

export interface DocumentProcessorDeps {
  storage: DocumentStorage;
  analysis?: DocumentAnalysisProvider;
  understanding?: DocumentUnderstandingProvider;
}

export function createDocumentProcessor(deps: DocumentProcessorDeps): DocumentProcessor {
  // Providers are created lazily so constructing the processor (e.g. when the
  // app boots) never throws about missing credentials.
  let analysis = deps.analysis;
  let understanding = deps.understanding;

  function analysisProvider(): DocumentAnalysisProvider {
    analysis ??= createDocumentAnalysisProvider();
    return analysis;
  }

  function understandingProvider(): DocumentUnderstandingProvider {
    understanding ??= createDocumentUnderstandingProvider();
    return understanding;
  }

  function pipelineDepsFor(record: DocumentRecord): DocumentPipelineDeps {
    return {
      analyze: (content, mimeType) =>
        analysisProvider().analyzeDocument({
          documentId: record.id,
          filename: record.filename,
          mimeType,
          content,
        }),
      understand: (input) => understandingProvider().analyzeDocument(input),
      update: (documentId, patch) => updateDocument(documentId, patch),
    };
  }

  return {
    async ocr(documentId) {
      const record = await getDocument(documentId);
      if (!record) return null;
      const file = await deps.storage.get(documentId);
      if (!file) {
        getLogger().warn({ documentId }, 'Document file missing for {documentId}');
        return updateDocument(documentId, {
          status: 'failed',
          error: 'Die Dokumentdatei fehlt.',
        });
      }
      const step = await runOcrStep(record, file.content, record.mimeType, pipelineDepsFor(record));
      if (!step) return null;
      return 'ocr' in step ? step.withOcr : (step as DocumentRecord);
    },

    async understand(documentId) {
      const record = await getDocument(documentId);
      if (!record) return null;
      const ocr = record.analysisResult;
      if (!ocr || !ocr.text) {
        getLogger().warn({ documentId }, 'No OCR result to understand for {documentId}');
        return updateDocument(documentId, {
          status: 'failed',
          error: 'Das Dokument konnte nicht verstanden werden (kein OCR-Ergebnis).',
        });
      }
      const file = await deps.storage.get(documentId);
      if (!file) {
        getLogger().warn({ documentId }, 'Document file missing for {documentId}');
        return updateDocument(documentId, {
          status: 'failed',
          error: 'Die Dokumentdatei fehlt.',
        });
      }
      return runUnderstandStep(record, ocr, file.content, record.mimeType, pipelineDepsFor(record));
    },
  };
}

/** Default processor wiring real providers + configured storage. */
export function createDefaultDocumentProcessor(): DocumentProcessor {
  return createDocumentProcessor({
    storage: createDocumentStorage(),
  });
}
