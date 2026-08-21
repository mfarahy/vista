import type { DocumentPage, DocumentType } from '../types.js';

/**
 * The document-understanding layer runs on top of the OCR result produced by
 * the analysis provider (Google Document AI). It classifies the document,
 * assigns tags and extracts structured property information that can prefill
 * the wizard.
 *
 * Providers are kept behind this small interface so the AI provider (currently
 * OpenAI) can be replaced later without touching the wizard or the routes.
 */

/**
 * MIME types that are treated as image documents. The actual image bytes are
 * passed to the AI provider so it can understand what the image shows, even
 * when OCR produces little or no text. HEIC stays unsupported on purpose.
 */
export const IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export function isImageMime(mimeType: string): boolean {
  return IMAGE_MIME_TYPES.has(mimeType);
}

export interface DocumentUnderstandingInput {
  documentId: string;
  filename: string;
  mimeType: string;
  /** Normalized OCR text produced by the analysis provider. */
  text: string;
  /** Page-level OCR text, when the analysis provider produced it. */
  pages?: DocumentPage[];
  /** Actual image bytes for image documents, so the AI can see the image. */
  image?: { content: Buffer; mimeType: string } | null;
}

/** A field that maps directly onto a wizard field. Keys follow the existing
 * wizard field names (street, houseNumber, livingArea, rooms, …). */
export interface UnderstandingWizardField {
  field: string;
  value: string | number | boolean | null;
  /** Short snippet from the document that supports this value, or null. */
  evidence: string | null;
}

/** Additional structured information not (yet) mapped to a wizard field. */
export interface UnderstandingAdditionalInfo {
  key: string;
  value: string | number | boolean | null;
  evidence: string | null;
}

export interface DocumentUnderstandingResult {
  /** Exactly one primary document type. */
  documentType: DocumentType;
  /** A small set of meaningful tags describing purpose/content. */
  tags: string[];
  /** A short human-readable summary of what the document is and contains. */
  summary: string;
  /** Whether this document should be kept in the property document library. */
  keepInLibrary: boolean;
  /** Wizard fields that can be prefilled, with evidence. */
  wizardFields: UnderstandingWizardField[];
  /** Additional structured information not mapped to a wizard field. */
  additionalInformation: UnderstandingAdditionalInfo[];
}

export interface DocumentUnderstandingProvider {
  analyzeDocument(input: DocumentUnderstandingInput): Promise<DocumentUnderstandingResult>;
}
