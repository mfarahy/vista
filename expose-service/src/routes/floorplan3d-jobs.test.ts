import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { createApp } from '../app.js';
import { createJobEvent } from '../lib/jobs/event.js';
import type { JobDeps } from './jobs.js';
import type { JobRecord } from '../lib/jobs/store.js';
import type { DocumentStorage } from '../lib/document-storage.js';

function makeRecord(id: string): JobRecord {
  return {
    id,
    type: 'floorplan-3d',
    status: 'queued',
    progress: 0,
    currentStep: null,
    message: null,
    error: null,
    payload: {},
    metadata: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe('POST /api/floorplan3d/jobs', () => {
  let server: Server;
  let baseUrl: string;
  const published: Array<ReturnType<typeof createJobEvent>> = [];
  const stored = new Map<string, { content: Buffer; mimeType: string }>();
  const jobStore = new Map<string, JobRecord>();

  const storage: DocumentStorage = {
    put: async (id, content, mime) => {
      stored.set(id, { content, mimeType: mime });
    },
    get: async (id) => {
      const v = stored.get(id);
      return v ? { content: v.content, mimeType: v.mimeType } : null;
    },
    delete: async (id) => {
      stored.delete(id);
    },
  };

  const jobs: JobDeps = {
    repo: {
      create: async (input) => {
        const id = `job-${jobStore.size + 1}`;
        const rec = makeRecord(id);
        rec.type = input.type;
        rec.payload = (input.payload ?? {}) as never;
        jobStore.set(id, rec);
        return rec;
      },
      get: async (id) => jobStore.get(id) ?? null,
    },
    publish: async (event) => {
      published.push(event);
    },
  };

  before(async () => {
    const app = createApp({ jobs, documentStorage: storage });
    server = app.listen(0);
    await new Promise<void>((r) => server.once('listening', r));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  after(async () => {
    await new Promise<void>((r, rej) => server.close((e) => (e ? rej(e) : r())));
  });

  it('accepts valid floor plan, uploads to R2, publishes event with asset refs not base64', async () => {
    const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const blob = new Blob([pngHeader], { type: 'image/png' });
    const form = new FormData();
    form.append('image', blob, 'plan.png');

    const res = await fetch(`${baseUrl}/api/floorplan3d/jobs`, { method: 'POST', body: form as unknown as any });
    assert.equal(res.status, 201);
    const body = (await res.json()) as { jobId: string; assetId: string; status: string };
    assert.ok(body.jobId);
    assert.ok(body.assetId);
    assert.equal(body.status, 'queued');

    // storage has asset
    const storedFile = stored.get(body.assetId);
    assert.ok(storedFile, 'asset must be stored in R2');
    assert.equal(storedFile!.mimeType, 'image/png');

    // event contains refs, not base64
    assert.equal(published.length, 1);
    const ev = published[0] as unknown as { payload: Record<string, unknown> };
    assert.equal(ev.payload.assetId, body.assetId);
    assert.ok(!(JSON.stringify(ev.payload).includes('base64')), 'event must not contain large base64');
    assert.equal((ev as unknown as { jobType: string }).jobType, 'floorplan-3d');

    // image endpoint serves file
    const imgRes = await fetch(`${baseUrl}/api/floorplan3d/image/${body.assetId}`);
    assert.equal(imgRes.status, 200);
    assert.equal(imgRes.headers.get('content-type'), 'image/png');
  });

  it('rejects unsupported mime', async () => {
    const blob = new Blob([Buffer.from('hello')], { type: 'application/pdf' });
    const form = new FormData();
    form.append('image', blob, 'doc.pdf');
    const res = await fetch(`${baseUrl}/api/floorplan3d/jobs`, { method: 'POST', body: form as unknown as any });
    assert.equal(res.status, 400);
  });

  it('rejects empty file', async () => {
    const blob = new Blob([], { type: 'image/png' });
    const form = new FormData();
    form.append('image', blob, 'empty.png');
    const res = await fetch(`${baseUrl}/api/floorplan3d/jobs`, { method: 'POST', body: form as unknown as any });
    assert.equal(res.status, 400);
  });
});
