import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// The store resolves DATA_DIR/UPLOAD_DIR at import time, so they must be set
// before importing the app. Each test file runs in its own process.
const dataDir = mkdtempSync(path.join(tmpdir(), 'vista-docs-'));
process.env.DATA_DIR = dataDir;
process.env.UPLOAD_DIR = path.join(dataDir, 'uploads');

const { createApp } = await import('../app.js');
import type { JobEvent } from '../lib/jobs/event.js';
import type { JobRecord } from '../lib/jobs/store.js';
import type { DocumentStorage, ReadableFile } from '../lib/document-storage.js';

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

function jobRecord(id: string, type: string, payload: unknown): JobRecord {
  return {
    id,
    type,
    status: 'queued',
    progress: 0,
    currentStep: null,
    message: null,
    error: null,
    payload: (payload ?? {}) as never,
    metadata: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe('POST /api/properties/:id/documents (async)', () => {
  let server: Server;
  let baseUrl: string;
  const storage = new InMemoryStorage();
  const stored = new Map<string, ReturnType<typeof jobRecord>>();
  const published: JobEvent[] = [];
  let propertyId = '';

  const jobs = {
    repo: {
      create: async (input: { type: string; payload?: unknown }) => {
        const record = jobRecord(`job-${stored.size + 1}`, input.type, input.payload);
        stored.set(record.id, record);
        return record;
      },
      get: async (id: string) => stored.get(id) ?? null,
    },
    publish: async (event: JobEvent) => {
      published.push(event);
    },
  };

  before(async () => {
    server = createApp({ jobs, documentStorage: storage }).listen(0);
    await new Promise<void>((resolve) => server.once('listening', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const created = await fetch(`${baseUrl}/api/properties`, { method: 'POST' }).then((r) =>
      r.json(),
    );
    propertyId = (created as { id: string }).id;
  });

  after(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    rmSync(dataDir, { recursive: true, force: true });
  });

  it('stores files, enqueues a document-processing job as queued, publishes to NATS, and returns the jobId', async () => {
    const form = new FormData();
    form.append('files', new Blob([Buffer.from('fake pdf bytes')], { type: 'application/pdf' }), 'a.pdf');
    form.append('files', new Blob([Buffer.from('fake jpg')], { type: 'image/jpeg' }), 'b.jpg');

    const response = await fetch(`${baseUrl}/api/properties/${propertyId}/documents`, {
      method: 'POST',
      body: form,
    });

    assert.equal(response.status, 201);
    const body = (await response.json()) as { jobId: string; status: string; type: string };
    assert.equal(body.status, 'queued');
    assert.equal(body.type, 'document-processing');
    assert.ok(body.jobId);

    assert.equal(stored.get(body.jobId)?.status, 'queued');

    assert.equal(published.length, 1);
    const event = published[0];
    assert.equal(event.jobType, 'document-processing');
    assert.equal(event.jobId, body.jobId);
    const payload = event.payload as { propertyId: string; documentIds: string[] };
    assert.equal(payload.propertyId, propertyId);
    assert.equal(payload.documentIds.length, 2);

    assert.equal(storage.objects.size, 2);
  });

  it('creates the document records as pending', async () => {
    const list = (await fetch(`${baseUrl}/api/properties/${propertyId}/documents`).then((r) =>
      r.json(),
    )) as Array<{ status: string; url: string }>;
    assert.equal(list.length, 2);
    for (const document of list) {
      assert.equal(document.status, 'pending');
      assert.match(document.url, /^\/api\/documents\/.+\/file$/);
    }
  });

  it('analyze endpoint enqueues a job for a single existing document', async () => {
    const list = (await fetch(`${baseUrl}/api/properties/${propertyId}/documents`).then((r) =>
      r.json(),
    )) as Array<{ id: string }>;
    const documentId = list[0].id;
    const before = published.length;

    const response = await fetch(
      `${baseUrl}/api/properties/${propertyId}/documents/${documentId}/analyze`,
      { method: 'POST' },
    );
    assert.equal(response.status, 200);
    const body = (await response.json()) as { jobId: string; type: string };
    assert.equal(body.type, 'document-processing');

    const event = published[before];
    assert.equal(event.jobType, 'document-processing');
    assert.deepEqual((event.payload as { documentIds: string[] }).documentIds, [documentId]);
  });

  it('serves the stored file bytes via GET /api/documents/:id/file', async () => {
    const list = (await fetch(`${baseUrl}/api/properties/${propertyId}/documents`).then((r) =>
      r.json(),
    )) as Array<{ id: string; mimeType: string }>;
    const documentId = list[0].id;
    const response = await fetch(`${baseUrl}/api/documents/${documentId}/file`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'application/pdf');
    assert.equal(await response.text(), 'fake pdf bytes');
  });
});
