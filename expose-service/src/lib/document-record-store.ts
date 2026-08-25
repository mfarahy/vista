import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { getPrisma } from './jobs/store.js';
import { getLogger } from './logger.js';
import type {
  DocumentAnalysisResult,
  DocumentRecord,
  DocumentStatus,
  DocumentType,
} from './types.js';
import type { DocumentUnderstandingResult } from './document-understanding/types.js';

/**
 * Prisma-backed store for property-document records. expose-service creates and
 * reads records (upload, listing, file serving); job-processor reads them and
 * writes processing results back. Both services operate on the same shared
 * `Document` table, so no HTTP round-trip through this service is needed for
 * the async document pipeline. File bytes are NOT stored here; they live in the
 * swappable object storage keyed by document id.
 */

export type DocumentRecordPatch = {
  url?: string;
  status?: DocumentStatus;
  documentType?: DocumentType | null;
  error?: string | null;
  analysisResult?: DocumentAnalysisResult | null;
  tags?: string[];
  understandingResult?: DocumentUnderstandingResult | null;
  understandingError?: string | null;
};

/** The document-record operations the API routes depend on (injectable). */
export interface DocumentRecordStore {
  list(propertyId: string): Promise<DocumentRecord[]>;
  get(documentId: string): Promise<DocumentRecord | null>;
  create(
    propertyId: string,
    input: { filename: string; mimeType: string; size: number; url: string },
  ): Promise<DocumentRecord>;
  update(documentId: string, patch: DocumentRecordPatch): Promise<DocumentRecord | null>;
  remove(documentId: string): Promise<DocumentRecord | null>;
}

/** Maps a persisted Document row back into the API's DocumentRecord shape. */
function rowToRecord(row: {
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
}): DocumentRecord {
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

export const documentRecordStore = {
  async list(propertyId: string): Promise<DocumentRecord[]> {
    const rows = await getPrisma().document.findMany({
      where: { propertyId },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(rowToRecord);
  },

  async get(documentId: string): Promise<DocumentRecord | null> {
    const row = await getPrisma().document.findUnique({ where: { id: documentId } });
    return row ? rowToRecord(row) : null;
  },

  async create(
    propertyId: string,
    input: { filename: string; mimeType: string; size: number; url: string },
  ): Promise<DocumentRecord> {
    const id = randomUUID();
    await getPrisma().document.create({
      data: {
        id,
        propertyId,
        filename: input.filename,
        mimeType: input.mimeType,
        size: input.size,
        url: input.url,
        status: 'pending',
        tags: [],
      },
    });
    const row = await getPrisma().document.findUniqueOrThrow({ where: { id } });
    getLogger().info(
      { documentId: id, propertyId, fileName: input.filename },
      'Created document {documentId} for property {propertyId}',
    );
    return rowToRecord(row);
  },

  async update(documentId: string, patch: DocumentRecordPatch): Promise<DocumentRecord | null> {
    const data: Prisma.DocumentUpdateInput = {};
    if (patch.url !== undefined) data.url = patch.url;
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
      return rowToRecord(row);
    } catch {
      getLogger().warn({ documentId }, 'updateDocument not found for {documentId}');
      return null;
    }
  },

  async remove(documentId: string): Promise<DocumentRecord | null> {
    const existing = await this.get(documentId);
    if (!existing) {
      getLogger().warn({ documentId }, 'removeDocument not found for {documentId}');
      return null;
    }
    await getPrisma().document.delete({ where: { id: documentId } });
    getLogger().info({ documentId, fileName: existing.filename }, 'Removed document {documentId}');
    return existing;
  },
};