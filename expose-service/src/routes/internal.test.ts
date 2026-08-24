import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import express from 'express';
import { internalRouter } from './internal.js';
import type { DocumentProcessor } from '../lib/document-processor.js';
import type { DocumentRecord } from '../lib/types.js';

function makeRecord(overrides: Partial<DocumentRecord> = {}): DocumentRecord {
  return {
    id: 'doc-1',
    propertyId: 'prop-1',
    filename: 'a.pdf',
    mimeType: 'application/pdf',
    size: 10,
    url: '/api/documents/doc-1/file',
    status: 'completed',
    documentType: 'grundriss',
    error: null,
    analysisResult: { text: 'Grundriss', fields: [], pages: [] },
    tags: [],
    understandingResult: null,
    understandingError: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('internal document-processing router', () => {
  let server: Server;
  let baseUrl: string;
  const calls: string[] = [];

  const processor: DocumentProcessor = {
    ocr: async (documentId) => {
      calls.push(`ocr:${documentId}`);
      return makeRecord({ id: documentId });
    },
    understand: async (documentId) => {
      calls.push(`understand:${documentId}`);
      return makeRecord({ id: documentId });
    },
  };

  before(async () => {
    const app = express();
    app.use(express.json());
    app.use(internalRouter({ processor }));
    server = app.listen(0);
    await new Promise<void>((resolve) => server.once('listening', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  after(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  });

  it('POST ocr invokes the OCR step and returns the record', async () => {
    const response = await fetch(`${baseUrl}/api/internal/documents/doc-123/ocr`, {
      method: 'POST',
    });
    assert.equal(response.status, 200);
    const body = (await response.json()) as { record: DocumentRecord };
    assert.equal(body.record.id, 'doc-123');
    assert.deepEqual(calls, ['ocr:doc-123']);
  });

  it('POST understand invokes the understanding step and returns the record', async () => {
    const response = await fetch(`${baseUrl}/api/internal/documents/doc-456/understand`, {
      method: 'POST',
    });
    assert.equal(response.status, 200);
    const body = (await response.json()) as { record: DocumentRecord };
    assert.equal(body.record.id, 'doc-456');
    assert.deepEqual(calls[calls.length - 1], 'understand:doc-456');
  });
});
