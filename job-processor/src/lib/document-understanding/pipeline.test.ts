import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { DocumentAnalysisResult, DocumentRecord } from '../types.js';
import type { DocumentUnderstandingInput, DocumentUnderstandingResult } from './types.js';
import {
  runDocumentPipeline,
  type DocumentPipelineDeps,
  type DocumentPipelineUpdate,
} from './pipeline.js';

function makeRecord(overrides: Partial<DocumentRecord> = {}): DocumentRecord {
  return {
    id: 'doc-1',
    propertyId: 'prop-1',
    filename: 'grundriss.pdf',
    mimeType: 'application/pdf',
    size: 100,
    url: '/uploads/x.pdf',
    status: 'pending',
    documentType: null,
    error: null,
    analysisResult: null,
    tags: [],
    understandingResult: null,
    understandingError: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeOcr(text: string): DocumentAnalysisResult {
  return { text, documentType: 'grundriss', fields: [], pages: [] };
}

function makeUnderstanding(): DocumentUnderstandingResult {
  return {
    documentType: 'grundriss',
    tags: ['floor-plan', 'rooms'],
    summary: 'Floor plan',
    keepInLibrary: true,
    wizardFields: [{ field: 'rooms', value: 5, evidence: '5 Zimmer' }],
    additionalInformation: [],
  };
}

describe('runDocumentPipeline', () => {
  it('persists OCR and understanding on success', async () => {
    const patches: DocumentPipelineUpdate[] = [];
    const deps: DocumentPipelineDeps = {
      analyze: async () => makeOcr('Grundriss, 5 Zimmer'),
      understand: async () => makeUnderstanding(),
      update: async (_id, patch) => {
        patches.push(patch);
        return makeRecord(patch as Partial<DocumentRecord>);
      },
    };

    await runDocumentPipeline(makeRecord(), Buffer.from('x'), 'application/pdf', deps);

    assert.equal(patches.length, 2);
    assert.equal(patches[0].status, 'completed');
    assert.ok(patches[0].analysisResult);
    const finalPatch = patches[1];
    assert.equal(finalPatch.status, 'completed');
    assert.equal(finalPatch.documentType, 'grundriss');
    assert.deepEqual(finalPatch.tags, ['floor-plan', 'rooms']);
  });

  it('persists OCR and preserves the document when the AI step fails', async () => {
    const patches: DocumentPipelineUpdate[] = [];
    const deps: DocumentPipelineDeps = {
      analyze: async () => makeOcr('Grundriss, 5 Zimmer'),
      understand: async () => {
        throw new Error('OpenAI unreachable');
      },
      update: async (_id, patch) => {
        patches.push(patch);
        return makeRecord(patch as Partial<DocumentRecord>);
      },
    };

    const result = await runDocumentPipeline(
      makeRecord(),
      Buffer.from('x'),
      'application/pdf',
      deps,
    );

    assert.equal(patches.length, 2);
    assert.ok(patches[0].analysisResult, 'OCR result must be preserved');
    const finalPatch = patches[1];
    assert.equal(finalPatch.status, 'completed');
    assert.equal(finalPatch.understandingResult, null);
    assert.match(finalPatch.understandingError as string, /OCR result was preserved/);
    assert.ok(result);
  });

  it('marks the document failed when OCR itself fails', async () => {
    const patches: DocumentPipelineUpdate[] = [];
    const deps: DocumentPipelineDeps = {
      analyze: async () => {
        throw new Error('Google API unreachable');
      },
      understand: async () => makeUnderstanding(),
      update: async (_id, patch) => {
        patches.push(patch);
        return makeRecord(patch as Partial<DocumentRecord>);
      },
    };

    await runDocumentPipeline(makeRecord(), Buffer.from('x'), 'application/pdf', deps);

    assert.equal(patches.length, 1);
    assert.equal(patches[0].status, 'failed');
  });

  it('passes the actual image bytes to the AI for image documents', async () => {
    let received: DocumentUnderstandingInput | undefined;
    const deps: DocumentPipelineDeps = {
      analyze: async () => makeOcr(''),
      understand: async (input) => {
        received = input;
        return makeUnderstanding();
      },
      update: async (_id, patch) => makeRecord(patch as Partial<DocumentRecord>),
    };

    const image = Buffer.from('fake-image-bytes');
    await runDocumentPipeline(
      makeRecord({ filename: 'kitchen.jpg', mimeType: 'image/jpeg' }),
      image,
      'image/jpeg',
      deps,
    );

    assert.ok(received, 'the AI must be called');
    assert.equal(received.mimeType, 'image/jpeg');
    assert.ok(received.image, 'image content must be provided for image documents');
    assert.equal(received.image?.content.toString(), 'fake-image-bytes');
    assert.equal(received.image?.mimeType, 'image/jpeg');
  });

  it('does not pass image bytes for PDF documents', async () => {
    let received: DocumentUnderstandingInput | undefined;
    const deps: DocumentPipelineDeps = {
      analyze: async () => makeOcr('Grundriss, 5 Zimmer'),
      understand: async (input) => {
        received = input;
        return makeUnderstanding();
      },
      update: async (_id, patch) => makeRecord(patch as Partial<DocumentRecord>),
    };

    await runDocumentPipeline(
      makeRecord({ filename: 'grundriss.pdf', mimeType: 'application/pdf' }),
      Buffer.from('x'),
      'application/pdf',
      deps,
    );

    assert.ok(received);
    assert.equal(received.image, null);
    assert.equal(received.text, 'Grundriss, 5 Zimmer');
  });

  it('still analyzes an image when OCR produced no text', async () => {
    const patches: DocumentPipelineUpdate[] = [];
    const deps: DocumentPipelineDeps = {
      analyze: async () => makeOcr(''),
      understand: async (input) => {
        assert.equal(input.text, '');
        assert.ok(input.image, 'image must reach the AI even with empty OCR');
        return makeUnderstanding();
      },
      update: async (_id, patch) => {
        patches.push(patch);
        return makeRecord(patch as Partial<DocumentRecord>);
      },
    };

    const result = await runDocumentPipeline(
      makeRecord({ filename: 'kitchen.jpg', mimeType: 'image/jpeg' }),
      Buffer.from('fake-image-bytes'),
      'image/jpeg',
      deps,
    );

    assert.ok(result);
    assert.equal(result.status, 'completed');
    assert.equal(result.documentType, 'grundriss');
    assert.equal(result.understandingError, null);
  });
});
