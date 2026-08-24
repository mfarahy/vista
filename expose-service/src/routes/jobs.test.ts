import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { createApp } from '../app.js';
import type { JobRecord } from '../lib/jobs/store.js';
import type { JobDeps } from './jobs.js';
import { createJobEvent, parseJobEvent } from '../lib/jobs/event.js';

describe('POST /api/jobs', () => {
  let server: Server;
  let baseUrl: string;
  const published: Array<{ subject: string; event: ReturnType<typeof createJobEvent> }> = [];

  function makeRecord(id: string): JobRecord {
    return {
      id,
      type: 'test-job',
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

  const stored = new Map<string, JobRecord>();
  const jobs: JobDeps = {
    repo: {
      create: async (input: { type: string; payload?: unknown }) => {
        const record = makeRecord(`job-${stored.size + 1}`);
        record.type = input.type;
        record.payload = (input.payload ?? {}) as never;
        stored.set(record.id, record);
        return record;
      },
      get: async (id: string) => stored.get(id) ?? null,
    } satisfies JobDeps['repo'],
    publish: async (event: ReturnType<typeof createJobEvent>) => {
      published.push({ subject: `vista.jobs.${event.jobType}`, event });
    },
  };

  before(async () => {
    const app = createApp({ jobs });
    server = app.listen(0);
    await new Promise<void>((resolve) => server.once('listening', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  after(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  });

  it('creates a job, persists it as queued, publishes to NATS, and returns the jobId', async () => {
    const response = await fetch(`${baseUrl}/api/jobs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'test-job', payload: { hello: 'world' } }),
    });
    assert.equal(response.status, 201);
    const body = (await response.json()) as { jobId: string; status: string; type: string };
    assert.equal(body.status, 'queued');
    assert.equal(body.type, 'test-job');
    assert.ok(body.jobId);

    assert.equal(stored.get(body.jobId)?.status, 'queued');

    assert.equal(published.length, 1);
    assert.equal(published[0].subject, 'vista.jobs.test-job');
    assert.equal(published[0].event.jobId, body.jobId);
    assert.deepEqual(published[0].event.payload, { hello: 'world' });
  });

  it('rejects a request missing the type', async () => {
    const response = await fetch(`${baseUrl}/api/jobs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.equal(response.status, 400);
  });

  it('returns the persisted job via GET /api/jobs/:id', async () => {
    const created = (await fetch(`${baseUrl}/api/jobs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'test-job' }),
    }).then((r) => r.json())) as { jobId: string };
    const response = await fetch(`${baseUrl}/api/jobs/${created.jobId}`);
    assert.equal(response.status, 200);
    const record = (await response.json()) as JobRecord;
    assert.equal(record.id, created.jobId);
    assert.equal(record.status, 'queued');
  });

  it('returns 404 for an unknown job', async () => {
    const response = await fetch(`${baseUrl}/api/jobs/does-not-exist`);
    assert.equal(response.status, 404);
  });
});

describe('job event model', () => {
  it('creates a valid event with the required fields', () => {
    const event = createJobEvent({ jobId: 'abc', jobType: 'test-job', payload: { n: 1 } }, '2026-01-01T00:00:00.000Z');
    assert.equal(event.jobId, 'abc');
    assert.equal(event.jobType, 'test-job');
    assert.deepEqual(event.payload, { n: 1 });
    assert.equal(event.createdAt, '2026-01-01T00:00:00.000Z');
    assert.equal(event.metadata, undefined);
  });

  it('round-trips through parseJobEvent', () => {
    const event = createJobEvent({
      jobId: 'abc',
      jobType: 'test-job',
      payload: { n: 2 },
      metadata: { requesterId: 'u1' },
    });
    const parsed = parseJobEvent(JSON.parse(JSON.stringify(event)));
    assert.deepEqual(parsed, event);
  });

  it('rejects an event missing jobId', () => {
    assert.throws(() =>
      parseJobEvent({ jobType: 'test-job', createdAt: '2026-01-01T00:00:00.000Z' }),
    );
  });
});
