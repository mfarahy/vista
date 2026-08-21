import type { DocumentProcessorServiceClient } from '@google-cloud/documentai';
import { readFile } from 'node:fs/promises';
import type {
  DocumentAnalysisInput,
  DocumentAnalysisResult,
  DocumentAnalysisProvider,
  DocumentPage,
} from './types.js';
import { detectDocumentType, extractFields } from './extract.js';

/**
 * Minimal view of the Google Document AI response used for normalization. The
 * real SDK types stay inside this provider and are never exposed to the rest
 * of the application.
 */
interface RawDocumentLike {
  text?: string;
  pages?: Array<{
    pageNumber?: number;
    paragraphs?: Array<{
      layout?: {
        textAnchor?: { textSegments?: Array<{ startIndex?: number; endIndex?: number }> };
      };
    }>;
  }>;
  entities?: Array<{ type?: string; mentionText?: string; confidence?: number }>;
}

export interface ProcessDocumentInput {
  content: Buffer;
  mimeType: string;
}

export type ProcessDocumentFn = (input: ProcessDocumentInput) => Promise<unknown>;

function pageText(
  document: RawDocumentLike,
  page: NonNullable<RawDocumentLike['pages']>[number],
): string {
  const segments: string[] = [];
  for (const paragraph of page.paragraphs ?? []) {
    for (const segment of paragraph.layout?.textAnchor?.textSegments ?? []) {
      const start = segment.startIndex ?? 0;
      const end = segment.endIndex ?? document.text?.length ?? 0;
      segments.push(document.text?.slice(start, end) ?? '');
    }
  }
  return segments.join('\n');
}

/**
 * Converts the raw Google Document AI response into the application's internal
 * model. Kept as a pure function so it can be tested with a fake response.
 */
export function normalizeDocumentAIResponse(
  raw: unknown,
  sourceDocumentId: string,
): DocumentAnalysisResult {
  const response = (raw ?? {}) as { document?: RawDocumentLike };
  const document = response.document ?? {};
  const text = document.text?.trim() ?? '';

  const pages: DocumentPage[] = (document.pages ?? []).map((page) => ({
    pageNumber: page.pageNumber ?? 0,
    text: pageText(document, page),
  }));

  const documentType = text ? detectDocumentType(text) : 'other';
  const fields = extractFields(text, sourceDocumentId);

  const entities = (document.entities ?? [])
    .filter((entity) => entity.type && entity.mentionText)
    .map((entity) => ({
      type: entity.type,
      mentionText: entity.mentionText,
      confidence: entity.confidence ?? null,
    }));

  return {
    text,
    documentType,
    pages,
    fields,
    metadata: entities.length ? { raw: { entities } } : undefined,
  };
}

/**
 * Loads explicit Google credentials when GOOGLE_DOCUMENT_AI_CREDENTIALS is
 * set. The value can be a path to a service-account JSON file or the JSON
 * itself. When unset, the client falls back to Application Default
 * Credentials (gcloud / GOOGLE_APPLICATION_CREDENTIALS).
 */
export async function loadGoogleAuthOptions(): Promise<{
  projectId?: string;
  credentials?: { client_email: string; private_key: string };
}> {
  const raw = process.env.GOOGLE_DOCUMENT_AI_CREDENTIALS;
  if (!raw) return {};
  let contents = raw;
  if (!raw.trim().startsWith('{')) {
    try {
      contents = await readFile(raw, 'utf8');
    } catch {
      throw new Error(`Could not read the Google Document AI credentials file "${raw}".`);
    }
  }
  let parsed: { client_email?: string; private_key?: string; project_id?: string };
  try {
    parsed = JSON.parse(contents);
  } catch {
    throw new Error(
      'GOOGLE_DOCUMENT_AI_CREDENTIALS must be a path to a service-account JSON file or inline JSON.',
    );
  }
  if (!parsed.client_email || !parsed.private_key) {
    throw new Error('The Google Document AI credentials must contain client_email and private_key.');
  }
  return {
    projectId: parsed.project_id,
    credentials: { client_email: parsed.client_email, private_key: parsed.private_key },
  };
}

/**
 * Default processing function that talks to the real Google Document AI API.
 * Uses explicit credentials from GOOGLE_DOCUMENT_AI_CREDENTIALS when provided,
 * otherwise falls back to Application Default Credentials. Kept behind a
 * function so tests can inject a fake and no Google call is ever made from
 * unit tests.
 */
async function defaultProcessFn(input: ProcessDocumentInput): Promise<unknown> {
  const { DocumentProcessorServiceClient } = await import('@google-cloud/documentai');
  const projectId = process.env.GOOGLE_DOCUMENT_AI_PROJECT_ID;
  const location = process.env.GOOGLE_DOCUMENT_AI_LOCATION;
  const processorId = process.env.GOOGLE_DOCUMENT_AI_PROCESSOR_ID;
  if (!projectId || !location || !processorId) {
    throw new Error('Google Document AI configuration is incomplete.');
  }

  const client: DocumentProcessorServiceClient = new DocumentProcessorServiceClient(
    await loadGoogleAuthOptions(),
  );
  const name = `projects/${projectId}/locations/${location}/processors/${processorId}`;
  const [result] = await client.processDocument({
    name,
    rawDocument: { content: input.content, mimeType: input.mimeType },
  });
  return result;
}

export class GoogleDocumentAIProvider implements DocumentAnalysisProvider {
  private readonly processFn: ProcessDocumentFn;

  constructor(processFn: ProcessDocumentFn = defaultProcessFn) {
    this.processFn = processFn;
  }

  async analyzeDocument(input: DocumentAnalysisInput): Promise<DocumentAnalysisResult> {
    const raw = await this.processFn({ content: input.content, mimeType: input.mimeType });
    return normalizeDocumentAIResponse(raw, input.documentId);
  }
}
