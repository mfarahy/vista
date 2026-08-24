import { ALLOWED_DOCUMENT_MIMES, MAX_DOCUMENT_BYTES } from '../lib/upload.js';

export interface UploadedDocument {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

export type DocumentValidationResult = { ok: true } | { ok: false; error: string };

/**
 * Validates an uploaded document batch (MIME + size). Extracted from the route
 * so the behaviour is unit-testable and the route stays thin.
 */
export function validateDocuments(files: UploadedDocument[]): DocumentValidationResult {
  if (!files.length) return { ok: false, error: 'Keine Dokumente gefunden' };
  for (const file of files) {
    if (!ALLOWED_DOCUMENT_MIMES.has(file.mimetype)) {
      return { ok: false, error: 'Nur PDF, JPG, PNG und WEBP werden unterstützt' };
    }
    if (file.size > MAX_DOCUMENT_BYTES) {
      return { ok: false, error: 'Dokumente dürfen maximal 25 MB groß sein' };
    }
  }
  return { ok: true };
}
