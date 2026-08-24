import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { connect, StringCodec } from 'nats';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

const run = process.env.RUN_JOB_INTEGRATION === '1';
const skipReason = !run ? 'Set RUN_JOB_INTEGRATION=1 to enable job integration tests' : false;
const natsUrl = process.env.NATS_URL || 'nats://localhost:4222';
const prefix = `vista.progress.test.${Date.now()}`;
process.env.NATS_PROGRESS_SUBJECT_PREFIX = prefix;

describe('NATS progress event -> SSE delivery (integration)', { skip: skipReason }, () => {
  let nc: Awaited<ReturnType<typeof connect>>;
  let server: Server;
  let baseUrl: string;
  const jobId = 'it-progress';

  before(async () => {
    nc = await connect({ servers: natsUrl });

    const now = new Date();
    const queued = {
      id: jobId,
      type: 'document-processing',
      status: 'queued' as const,
      progress: 0,
      currentStep: 'received',
      message: 'Waiting',
      error: null,
      payload: {},
      metadata: null,
      createdAt: now,
      updatedAt: now,
    };
    const { createApp } = await import('../app.js');
    const app = createApp({
      jobs: {
        repo: { create: async () => ({ id: 'x' }), get: async () => queued },
        publish: async () => undefined,
      },
    });
    server = app.listen(0);
    await new Promise<void>((resolve) => server.once('listening', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  after(async () => {
    const { resetProgressBus } = await import('./progress-bus.js');
    server.closeAllConnections?.();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    if (nc && !nc.isClosed()) await nc.drain();
    resetProgressBus();
  });

  it('delivers a NATS progress event to an SSE client and closes on completion', async () => {
    const response = await fetch(`${baseUrl}/api/jobs/${jobId}/events`);
    assert.equal(response.status, 200);
    const reader = response.body!.getReader();

    const initial = parseSseData(await readNextEvent(reader));
    assert.equal(initial.status, 'queued');

    nc.publish(
      `${prefix}.${jobId}`,
      StringCodec().encode(
        JSON.stringify({
          jobId,
          status: 'processing',
          progress: 50,
          currentStep: 'ocr',
          message: 'Working',
          updatedAt: new Date().toISOString(),
        }),
      ),
    );
    await nc.flush();
    const progressEvent = parseSseData(await readNextEvent(reader));
    assert.equal(progressEvent.status, 'processing');
    assert.equal(progressEvent.progress, 50);
    assert.equal(progressEvent.currentStep, 'ocr');

    nc.publish(
      `${prefix}.${jobId}`,
      StringCodec().encode(
        JSON.stringify({
          jobId,
          status: 'completed',
          progress: 100,
          currentStep: 'done',
          updatedAt: new Date().toISOString(),
        }),
      ),
    );
    await nc.flush();
    const completed = parseSseData(await readNextEvent(reader));
    assert.equal(completed.status, 'completed');
    assert.equal(completed.progress, 100);

    // The finished event closes the stream.
    const end = await reader.read();
    assert.equal(end.done, true);
    reader.cancel();
  });
});

let pendingBuffer = '';

async function readNextEvent(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  timeoutMs = 5000,
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
