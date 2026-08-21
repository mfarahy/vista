import type { DocumentAnalysisResult, DocumentPage, DocumentType } from '../types.js';

export type { DocumentAnalysisResult, DocumentPage, DocumentType };

export interface DocumentAnalysisInput {
  documentId: string;
  filename: string;
  mimeType: string;
  content: Buffer;
}

/**
 * Provider abstraction for analyzing a property document. The rest of the
 * application depends on this interface and never on a concrete provider such
 * as Google Document AI, so additional providers can be added later without
 * touching the wizard or the business logic.
 */
export interface DocumentAnalysisProvider {
  analyzeDocument(input: DocumentAnalysisInput): Promise<DocumentAnalysisResult>;
}
