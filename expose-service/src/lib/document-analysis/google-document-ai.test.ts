import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  GoogleDocumentAIProvider,
  loadGoogleAuthOptions,
  normalizeDocumentAIResponse,
} from './google-document-ai.js';

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

describe('loadGoogleAuthOptions', () => {
  const original = process.env.GOOGLE_DOCUMENT_AI_CREDENTIALS;
  afterEach(() => {
    process.env.GOOGLE_DOCUMENT_AI_CREDENTIALS = original;
  });

  it('returns empty options when no credentials are configured', async () => {
    process.env.GOOGLE_DOCUMENT_AI_CREDENTIALS = '';
    assert.deepEqual(await loadGoogleAuthOptions(), {});
  });

  it('parses inline JSON credentials', async () => {
    process.env.GOOGLE_DOCUMENT_AI_CREDENTIALS = JSON.stringify({
      type: 'service_account',
      project_id: 'vista-506118',
      client_email: 'docai@vista-506118.iam.gserviceaccount.com',
      private_key: '-----BEGIN PRIVATE KEY-----\nABC\n-----END PRIVATE KEY-----\n',
    });
    const options = await loadGoogleAuthOptions();
    assert.equal(options.projectId, 'vista-506118');
    assert.equal(options.credentials?.client_email, 'docai@vista-506118.iam.gserviceaccount.com');
    assert.match(options.credentials?.private_key ?? '', /BEGIN PRIVATE KEY/);
  });

  it('reads credentials from a JSON file path', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'vista-docai-'));
    const filePath = path.join(dir, 'service-account.json');
    try {
      await writeFile(
        filePath,
        JSON.stringify({
          type: 'service_account',
          client_email: 'docai@example.com',
          private_key: '-----BEGIN PRIVATE KEY-----\nABC\n-----END PRIVATE KEY-----\n',
        }),
      );
      process.env.GOOGLE_DOCUMENT_AI_CREDENTIALS = filePath;
      const options = await loadGoogleAuthOptions();
      assert.equal(options.credentials?.client_email, 'docai@example.com');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('rejects when the credentials file cannot be read', async () => {
    process.env.GOOGLE_DOCUMENT_AI_CREDENTIALS = 'C:/does/not/exist.json';
    await assert.rejects(() => loadGoogleAuthOptions(), /could not read/i);
  });

  it('rejects malformed credentials', async () => {
    process.env.GOOGLE_DOCUMENT_AI_CREDENTIALS = '{not-json';
    await assert.rejects(() => loadGoogleAuthOptions(), /inline JSON/i);
  });

  it('rejects credentials without a private key', async () => {
    process.env.GOOGLE_DOCUMENT_AI_CREDENTIALS = JSON.stringify({ client_email: 'a@b.c' });
    await assert.rejects(() => loadGoogleAuthOptions(), /private_key/i);
  });
});
