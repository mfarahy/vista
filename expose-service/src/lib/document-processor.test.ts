import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dataDir = mkdtempSync(path.join(tmpdir(), 'vista-proc-'));
process.env.DATA_DIR = dataDir;
process.env.UPLOAD_DIR = path.join(dataDir, 'uploads');

const { createDocumentProcessor } = await import('./document-processor.js');
const { createDocument, getDocument } = await import('./store.js');
import type { DocumentStorage, ReadableFile } from './document-storage.js';
import type { DocumentAnalysisProvider } from './document-analysis/types.js';
import type { DocumentUnderstandingProvider } from './document-understanding/types.js';

class InMemoryStorage implements DocumentStorage {
  readonly objects = new Map<string, { content: Buffer; mimeType: string }>();
  put(documentId: string, content: Buffer, mimeType: string): Promise<void> {
    this.objects.set(documentId, { content, mimeType });
    return Promise.resolve();
  }
  async get(documentId: string): Promise<ReadableFile | null> {
    return this.objects.get(documentId) ?? null;
  }
  delete(documentId: string): Promise<void> {
    this.objects.delete(documentId);
    return Promise.resolve();
  }
}

function makeAnalysis(content?: string): DocumentAnalysisProvider {
  return {
    analyzeDocument: async () => ({
      text: content ?? 'Grundriss, 5 Zimmer',
      documentType: 'grundriss' as const,
      fields: [],
      pages: [],
    }),
  };
}

function makeUnderstanding(): DocumentUnderstandingProvider {
  return {
    analyzeDocument: async () => ({
      documentType: 'grundriss' as const,
      tags: ['floor-plan'],
      summary: 'Floor plan',
      keepInLibrary: true,
      wizardFields: [],
      additionalInformation: [],
    }),
  };
}

async function seedDocument(propertyId: string, content: Buffer): Promise<string> {
  const record = await createDocument(propertyId, {
    filename: 'grundriss.pdf',
    mimeType: 'application/pdf',
    size: content.length,
    url: '',
  });
  return record.id;
}

describe('createDocumentProcessor', () => {
  const storage = new InMemoryStorage();
  const propertyId = 'prop-1';

  after(() => rmSync(dataDir, { recursive: true, force: true }));

  it('ocr persists the analysis result as completed', async () => {
    const id = await seedDocument(propertyId, Buffer.from('pdf'));
    storage.put(id, Buffer.from('pdf'), 'application/pdf');
    const processor = createDocumentProcessor({
      storage,
      analysis: makeAnalysis('OCR TEXT HERE'),
      understanding: makeUnderstanding(),
    });

    const result = await processor.ocr(id);
    assert.equal(result?.status, 'completed');
    assert.equal(result?.analysisResult?.text, 'OCR TEXT HERE');

    const persisted = await getDocument(id);
    assert.equal(persisted?.status, 'completed');
    assert.equal(persisted?.analysisResult?.text, 'OCR TEXT HERE');
  });

  it('understand adds the AI result on top of OCR', async () => {
    const id = await seedDocument(propertyId, Buffer.from('pdf'));
    storage.put(id, Buffer.from('pdf'), 'application/pdf');
    const processor = createDocumentProcessor({
      storage,
      analysis: makeAnalysis('Grundriss, 5 Zimmer'),
      understanding: makeUnderstanding(),
    });

    await processor.ocr(id);
    const result = await processor.understand(id);

    assert.equal(result?.status, 'completed');
    assert.deepEqual(result?.tags, ['floor-plan']);
    assert.equal(result?.understandingResult?.summary, 'Floor plan');
  });

  it('marks the document failed when OCR throws', async () => {
    const id = await seedDocument(propertyId, Buffer.from('pdf'));
    storage.put(id, Buffer.from('pdf'), 'application/pdf');
    const processor = createDocumentProcessor({
      storage,
      analysis: {
        analyzeDocument: async () => {
          throw new Error('Google API unreachable');
        },
      },
      understanding: makeUnderstanding(),
    });

    const result = await processor.ocr(id);
    assert.equal(result?.status, 'failed');
    assert.ok(result?.error);
  });

  it('preserves OCR when understanding fails', async () => {
    const id = await seedDocument(propertyId, Buffer.from('pdf'));
    storage.put(id, Buffer.from('pdf'), 'application/pdf');
    const processor = createDocumentProcessor({
      storage,
      analysis: makeAnalysis('Grundriss, 5 Zimmer'),
      understanding: {
        analyzeDocument: async () => {
          throw new Error('OpenAI unreachable');
        },
      },
    });

    await processor.ocr(id);
    const result = await processor.understand(id);
    assert.equal(result?.status, 'completed');
    assert.ok(result?.analysisResult, 'OCR must be preserved');
    assert.equal(result?.understandingResult, null);
    assert.match(result?.understandingError ?? '', /preserved/);
  });

  it('marks the document failed when the file is missing', async () => {
    const id = await seedDocument(propertyId, Buffer.from('pdf'));
    const processor = createDocumentProcessor({
      storage,
      analysis: makeAnalysis(),
      understanding: makeUnderstanding(),
    });
    const result = await processor.ocr(id);
    assert.equal(result?.status, 'failed');
  });
});
