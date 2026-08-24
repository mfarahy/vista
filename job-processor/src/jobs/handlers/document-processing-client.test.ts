import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { createHttpDocumentProcessingClient } from './document-processing-client.js';

describe('createHttpDocumentProcessingClient', () => {
  const hits: string[] = [];
  let server: http.Server;
  let baseUrl: string;

  before(async () => {
    server = http.createServer((req, res) => {
      hits.push(`${req.method} ${req.url}`);
      if (req.url?.includes('missing-doc')) {
        res.statusCode = 404;
        res.end();
        return;
      }
      if (req.url?.includes('/ocr')) {
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ record: { id: 'doc-1', status: 'completed' } }));
      } else if (req.url?.includes('/understand')) {
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ record: { id: 'doc-1', status: 'completed' } }));
      } else {
        res.statusCode = 404;
        res.end();
      }
    });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('calls the ocr endpoint and returns the record', async () => {
    const client = createHttpDocumentProcessingClient(baseUrl);
    const result = await client.ocr('doc-1');
    assert.equal(result.record.id, 'doc-1');
    assert.equal(result.record.status, 'completed');
    assert.ok(hits.some((hit) => hit === 'POST /api/internal/documents/doc-1/ocr'));
  });

  it('calls the understand endpoint', async () => {
    const client = createHttpDocumentProcessingClient(baseUrl);
    await client.understand('doc-1');
    assert.ok(hits.some((hit) => hit === 'POST /api/internal/documents/doc-1/understand'));
  });

  it('throws a descriptive error on a non-2xx response', async () => {
    const client = createHttpDocumentProcessingClient(baseUrl);
    await assert.rejects(() => client.ocr('missing-doc'), /HTTP 404/);
  });
});
