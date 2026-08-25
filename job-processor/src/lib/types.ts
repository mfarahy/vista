import type { DocumentUnderstandingResult } from './document-understanding/types.js';

/**
 * Document-related wire types used by the document-processing pipeline. Mirrors
 * the document section of expose-service's `lib/types.ts` (the two services
 * share the same `Document` table and API contract, but are separate packages).
 */

export type DocumentStatus = 'pending' | 'processing' | 'completed' | 'failed';

export type DocumentType =
  | 'grundbuchauszug'
  | 'grundriss'
  | 'energieausweis'
  | 'expose'
  | 'lageplan'
  | 'wohnflaechenberechnung'
  | 'bauplan'
  | 'kaufvertrag'
  | 'mietvertrag'
  | 'teilungserklaerung'
  | 'property_photo'
  | 'other';

export interface DocumentPage {
  pageNumber: number;
  text: string;
}

export interface ExtractedField {
  field: string;
  value: string | number | boolean | null;
  sourceDocumentId: string;
  evidence?: string | null;
  confidence?: number | null;
}

export interface DocumentAnalysisResult {
  text: string;
  documentType?: DocumentType;
  pages?: DocumentPage[];
  fields: ExtractedField[];
  metadata?: Record<string, unknown>;
}

export interface DocumentRecord {
  id: string;
  propertyId: string;
  filename: string;
  mimeType: string;
  size: number;
  url: string;
  status: DocumentStatus;
  documentType?: DocumentType | null;
  error?: string | null;
  analysisResult?: DocumentAnalysisResult | null;
  tags?: string[];
  understandingResult?: DocumentUnderstandingResult | null;
  understandingError?: string | null;
  createdAt: string;
  updatedAt: string;
}