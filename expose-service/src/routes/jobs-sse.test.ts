import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { createApp } from '../app.js';
import type { JobRecord } from '../lib/jobs/store.js';
import type { JobDeps } from './jobs.js';
import type { JobProgressEvent } from '../lib/jobs/progress-event.js';

/** A controllable fake SSE listener registry for a single test app. */
class FakeProgress {
  readonly listeners = new Map<string, Set<(event: JobProgressEvent) => void>>();

  subscribe(jobId: string, listener: (event: JobProgressEvent) => void): () => void {
    let set = this.listeners.get(jobId);
    if (!set) {
      set = new Set();
      this.listeners.set(jobId, set);
    }
    set.add(listener);
    return () => set.delete(listener);
  }

  emit(jobId: string, event: Partial<JobProgressEvent> & { jobId: string }): void {
    const set = this.listeners.get(jobId);
    if (!set) return;
    for (const listener of [...set]) listener({ ...event } as JobProgressEvent);
  }
}

function makeRecord(partial: Partial<JobRecord>): JobRecord {
  const now = new Date();
  return {
    id: 'job-1',
    type: 'document-processing',
    status: 'queued',
    progress: 0,
    currentStep: null,
    message: null,
    error: null,
    payload: {},
    metadata: null,
    createdAt: now,
    updatedAt: now,
    ...partial,
  };
}

const store = new Map<string, JobRecord>([
  [
    'active',
    makeRecord({ id: 'active', status: 'queued', progress: 0, currentStep: 'received', message: 'Waiting' }),
  ],
  [
    'done',
    makeRecord({ id: 'done', status: 'completed', progress: 100, currentStep: 'done', message: 'All done' }),
  ],
  [
    'broken',
    makeRecord({ id: 'broken', status: 'failed', progress: 40, error: 'boom' }),
  ],
]);

describe('GET /api/jobs/:id/events (SSE)', () => {
  let server: Server;
  let baseUrl: string;
  const progress = new FakeProgress();

  const jobs: JobDeps = {
    repo: {
      create: async () => makeRecord({}),
      get: async (id: string) => store.get(id) ?? null,
    },
    publish: async () => undefined,
    subscribeProgress: (jobId, listener) => progress.subscribe(jobId, listener),
  };

  before(async () => {
    const app = createApp({ jobs });
    server = app.listen(0);
    await new Promise<void>((resolve) => server.once('listening', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  after(async () => {
    server.closeAllConnections?.();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  });

  it('opens an SSE stream and sends the current job state on connect', async () => {
    const response = await fetch(`${baseUrl}/api/jobs/active/events`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type')?.includes('text/event-stream'), true);

    const reader = response.body!.getReader();
    const first = await readNextEvent(reader);
    reader.cancel();

    const payload = parseSseData(first);
    assert.equal(payload.jobId, 'active');
    assert.equal(payload.status, 'queued');
    assert.equal(payload.progress, 0);
    assert.equal(payload.currentStep, 'received');
  });

  it('forwards live progress events to the client', async () => {
    const response = await fetch(`${baseUrl}/api/jobs/active/events`);
    const reader = response.body!.getReader();
    await readNextEvent(reader); // initial state

    progress.emit('active', { jobId: 'active', status: 'processing', progress: 42, currentStep: 'ocr', message: 'Analyzing doc 1' });

    const event = parseSseData(await readNextEvent(reader));
    assert.equal(event.status, 'processing');
    assert.equal(event.progress, 42);
    assert.equal(event.currentStep, 'ocr');
    assert.equal(event.message, 'Analyzing doc 1');
    reader.cancel();
  });

  it('closes the connection after a completed event', async () => {
    const response = await fetch(`${baseUrl}/api/jobs/active/events`);
    const reader = response.body!.getReader();
    await readNextEvent(reader); // initial

    progress.emit('active', { jobId: 'active', status: 'processing', progress: 100 });
    progress.emit('active', { jobId: 'active', status: 'completed', progress: 100, currentStep: 'done', message: 'Done' });

    const complete = parseSseData(await readNextEvent(reader));
    assert.equal(complete.status, 'processing');

    const terminal = parseSseData(await readNextEvent(reader));
    assert.equal(terminal.status, 'completed');

    // Stream should now be closed (no further data).
    const done = await reader.read();
    assert.equal(done.done, true);
  });

  it('returns the final state and closes for an already-completed job', async () => {
    const response = await fetch(`${baseUrl}/api/jobs/done/events`);
    const reader = response.body!.getReader();
    const first = parseSseData(await readNextEvent(reader));
    assert.equal(first.status, 'completed');
    assert.equal(first.progress, 100);

    const done = await reader.read();
    assert.equal(done.done, true);
  });

  it('returns the failed state and error for an already-failed job', async () => {
    const response = await fetch(`${baseUrl}/api/jobs/broken/events`);
    const reader = response.body!.getReader();
    const first = parseSseData(await readNextEvent(reader));
    assert.equal(first.status, 'failed');
    assert.equal(first.error, 'boom');

    const done = await reader.read();
    assert.equal(done.done, true);
  });

  it('returns 404 for an unknown job', async () => {
    const response = await fetch(`${baseUrl}/api/jobs/unknown/events`);
    assert.equal(response.status, 404);
  });
});

/** Reads the next single SSE event, accumulating partial chunks across calls. */
let pendingBuffer = '';

async function readNextEvent(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  timeoutMs = 3000,
): Promise<string> {
  const started = Date.now();
  let buffer = pendingBuffer;
  pendingBuffer = '';
  while (Date.now() - started < timeoutMs) {
    if (buffer.includes('\n\n')) {
      const boundary = buffer.indexOf('\n\n');
      const event = buffer.slice(0, boundary);
      pendingBuffer = buffer.slice(boundary + 2);
      return event;
    }
    const { value, done } = await reader.read();
    if (value) buffer += new TextDecoder().decode(value);
    if (done) return buffer;
  }
  throw new Error('Timed out waiting for SSE event');
}

function parseSseData(chunk: string): Record<string, unknown> {
  const line = chunk.split('\n').find((l) => l.startsWith('data: '));
  assert.ok(line, `no data line in chunk: ${JSON.stringify(chunk)}`);
  return JSON.parse(line.slice('data: '.length));
}
