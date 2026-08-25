import { Prisma } from '@prisma/client';
import path from 'node:path';
import { getPrisma } from './db.js';
import { getLogger } from './logger.js';
import type {
  DocumentAnalysisResult,
  DocumentRecord,
  DocumentStatus,
  DocumentType,
} from './types.js';
import type { DocumentUnderstandingResult } from './document-understanding/types.js';

/**
 * Document-record access for the worker. Lets the document-processing pipeline
 * read and update the shared `Document` table (same rows expose-service writes
 * on upload and the frontend reads). File bytes are not stored here; the
 * pipeline downloads them directly from the configured object storage (R2).
 */

export const uploadPath = process.env.UPLOAD_DIR
  ? path.resolve(process.env.UPLOAD_DIR)
  : path.join(process.cwd(), 'public', 'uploads');

export type DocumentPatch = {
  status?: DocumentStatus;
  documentType?: DocumentType | null;
  error?: string | null;
  analysisResult?: DocumentAnalysisResult | null;
  tags?: string[];
  understandingResult?: DocumentUnderstandingResult | null;
  understandingError?: string | null;
};

interface DocumentRow {
  id: string;
  propertyId: string;
  filename: string;
  mimeType: string;
  size: number;
  url: string;
  status: string;
  documentType: string | null;
  error: string | null;
  analysisResult: Prisma.JsonValue | null;
  tags: string[];
  understandingResult: Prisma.JsonValue | null;
  understandingError: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function rowToRecord(row: DocumentRow): DocumentRecord {
  return {
    id: row.id,
    propertyId: row.propertyId,
    filename: row.filename,
    mimeType: row.mimeType,
    size: row.size,
    url: row.url,
    status: row.status as DocumentStatus,
    documentType: (row.documentType as DocumentType | null) ?? null,
    error: row.error,
    analysisResult: row.analysisResult as DocumentAnalysisResult | null,
    tags: row.tags ?? [],
    understandingResult: row.understandingResult as DocumentUnderstandingResult | null,
    understandingError: row.understandingError,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function getDocument(documentId: string): Promise<DocumentRecord | null> {
  const row = await getPrisma().document.findUnique({ where: { id: documentId } });
  return row ? rowToRecord(row) : null;
}

export async function updateDocument(
  documentId: string,
  patch: DocumentPatch,
): Promise<DocumentRecord | null> {
  const data: Prisma.DocumentUpdateInput = {};
  if (patch.status !== undefined) data.status = patch.status;
  if (patch.documentType !== undefined) data.documentType = patch.documentType;
  if (patch.error !== undefined) data.error = patch.error;
  if (patch.analysisResult !== undefined)
    data.analysisResult = patch.analysisResult as unknown as Prisma.InputJsonValue;
  if (patch.tags !== undefined) data.tags = patch.tags;
  if (patch.understandingResult !== undefined)
    data.understandingResult = patch.understandingResult as unknown as Prisma.InputJsonValue;
  if (patch.understandingError !== undefined) data.understandingError = patch.understandingError;
  try {
    const row = await getPrisma().document.update({ where: { id: documentId }, data });
    getLogger().info(
      { documentId, status: row.status, documentType: row.documentType ?? 'unknown' },
      'Updated document {documentId}',
    );
    return rowToRecord(row as DocumentRow);
  } catch {
    getLogger().warn({ documentId }, 'updateDocument not found for {documentId}');
    return null;
  }
}