import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { GoogleDocumentAIProvider, normalizeDocumentAIResponse } from './google-document-ai.js';

function makeInput(
  overrides: Partial<Parameters<GoogleDocumentAIProvider['analyzeDocument']>[0]> = {},
) {
  return {
    documentId: 'doc-1',
    filename: 'grundriss.pdf',
    mimeType: 'application/pdf',
    content: Buffer.from('fake'),
    ...overrides,
  };
}

describe('normalizeDocumentAIResponse', () => {
  it('maps a Google response to our internal model', () => {
    const raw = {
      document: {
        text: 'Grundriss, 3 Zimmer, Wohnfläche 92 m², Musterstraße 5, 45127 Essen',
        pages: [
          {
            pageNumber: 1,
            paragraphs: [
              {
                layout: {
                  textAnchor: { textSegments: [{ startIndex: 0, endIndex: 10 }] },
                },
              },
            ],
          },
        ],
        entities: [{ type: 'Zimmer', mentionText: '3', confidence: 0.98 }],
      },
    };

    const result = normalizeDocumentAIResponse(raw, 'doc-1');

    assert.equal(result.documentType, 'grundriss');
    assert.equal(result.text.includes('Grundriss'), true);
    assert.equal(result.pages![0].pageNumber, 1);
    assert.ok(result.fields.some((field) => field.field === 'rooms' && field.value === 3));
    const rawEntities = result.metadata?.raw as { entities?: unknown[] } | undefined;
    assert.equal(rawEntities?.entities?.length, 1);
  });

  it('returns other for an invalid document with no text', () => {
    const result = normalizeDocumentAIResponse({ document: {} }, 'doc-1');
    assert.equal(result.documentType, 'other');
    assert.equal(result.text, '');
    assert.equal(result.fields.length, 0);
  });

  it('handles a missing document gracefully', () => {
    const result = normalizeDocumentAIResponse(null, 'doc-1');
    assert.equal(result.documentType, 'other');
  });
});

describe('GoogleDocumentAIProvider', () => {
  it('analyzes a document through the injected processing function', async () => {
    const provider = new GoogleDocumentAIProvider(async () => ({
      document: { text: 'Wohnfläche 80 m², 3 Zimmer' },
    }));
    const result = await provider.analyzeDocument(makeInput());
    assert.equal(result.documentType, 'other');
    assert.ok(result.fields.some((field) => field.field === 'livingArea' && field.value === 80));
  });

  it('rejects when the Google API fails', async () => {
    const provider = new GoogleDocumentAIProvider(async () => {
      throw new Error('Google API unreachable');
    });
    await assert.rejects(() => provider.analyzeDocument(makeInput()), /Google API unreachable/);
  });

  it('rejects for an unsupported file type rejected by the API', async () => {
    const provider = new GoogleDocumentAIProvider(async () => {
      throw new Error('Unsupported file type: application/x-unknown');
    });
    await assert.rejects(
      () => provider.analyzeDocument(makeInput({ mimeType: 'application/x-unknown' })),
      /Unsupported file type/,
    );
  });
});
