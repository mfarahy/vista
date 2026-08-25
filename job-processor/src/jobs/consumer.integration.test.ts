import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { connect, StringCodec } from 'nats';
import { randomUUID } from 'node:crypto';
import { startConsumer } from './consumer.js';
import { createDefaultDispatcher } from './registry.js';
import { getPrisma, disconnectPrisma } from '../lib/db.js';

const run = process.env.RUN_JOB_INTEGRATION === '1';
const skipReason = !run ? 'Set RUN_JOB_INTEGRATION=1 to enable consumer integration tests' : false;
const natsUrl = process.env.NATS_URL || 'nats://localhost:4222';
const collision = Date.now();
const subscriptionSubject = `jp.integration.${collision}.>`;
const baseSubject = `jp.integration.${collision}`;
const progressSubject = 'vista.progress.>';

describe('job consumer (integration)', { skip: skipReason }, () => {
  let nc: Awaited<ReturnType<typeof connect>>;

  before(async () => {
    nc = await connect({ servers: natsUrl });
    await startConsumer({
      nc,
      dispatcher: createDefaultDispatcher(),
      subscriptionSubject,
    });
    await nc.flush();
  });

  after(async () => {
    if (nc && !nc.isClosed()) await nc.drain();
    await disconnectPrisma();
  });

  async function seedQueued(payload: unknown): Promise<string> {
    const id = randomUUID();
    await getPrisma().job.create({
      data: { id, type: 'test-job', status: 'queued', payload: payload as never },
    });
    return id;
  }

  function publishTestJob(id: string, payload: unknown): void {
    nc.publish(
      `${baseSubject}.test-job`,
      StringCodec().encode(
        JSON.stringify({
          jobId: id,
          jobType: 'test-job',
          payload,
          createdAt: new Date().toISOString(),
        }),
      ),
    );
  }

  /** Collects NATS progress events for a job until it reaches a terminal state. */
  function waitForProgress(jobId: string, timeoutMs = 4000): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      const sub = nc.subscribe(progressSubject);
      const timer = setTimeout(() => {
        sub.unsubscribe();
        reject(new Error(`No terminal progress event for ${jobId}`));
      }, timeoutMs);
      void (async () => {
        for await (const msg of sub) {
          let event: Record<string, unknown>;
          try {
            event = JSON.parse(StringCodec().decode(msg.data)) as Record<string, unknown>;
          } catch {
            continue;
          }
          if (event.jobId === jobId && (event.status === 'completed' || event.status === 'failed')) {
            clearTimeout(timer);
            await sub.unsubscribe();
            resolve(event);
            return;
          }
        }
      })();
    });
  }

  it('consumes a job and marks it completed (successful execution)', async () => {
    const id = await seedQueued({ message: 'done ok' });
    const progress = waitForProgress(id);
    publishTestJob(id, { message: 'done ok' });
    await nc.flush();
    await waitForStatus(id, 'completed');

    const record = await getPrisma().job.findUnique({ where: { id } });
    assert.equal(record?.status, 'completed');
    assert.equal(record?.progress, 100);

    const event = await progress;
    assert.equal(event.status, 'completed');
    assert.equal(event.progress, 100);
  });

  it('marks a failing job as failed and publishes a failed progress event with the error', async () => {
    const id = await seedQueued({ fail: true });
    const progress = waitForProgress(id);
    publishTestJob(id, { fail: true, message: 'boom' });
    await nc.flush();
    await waitForStatus(id, 'failed');

    const record = await getPrisma().job.findUnique({ where: { id } });
    assert.equal(record?.status, 'failed');
    assert.ok(record?.error);

    const event = await progress;
    assert.equal(event.status, 'failed');
    assert.equal(event.error, 'boom');
  });

  it('marks an unhandled job type as failed', async () => {
    const id = randomUUID();
    await getPrisma().job.create({
      data: { id, type: 'unknown-job', status: 'queued', payload: {} as never },
    });
    nc.publish(
      `${baseSubject}.unknown-job`,
      StringCodec().encode(
        JSON.stringify({
          jobId: id,
          jobType: 'unknown-job',
          payload: {},
          createdAt: new Date().toISOString(),
        }),
      ),
    );
    await nc.flush();
    await waitForStatus(id, 'failed');
  });

  it('does not crash on a malformed message', async () => {
    nc.publish(`${baseSubject}.test-job`, StringCodec().encode('not-json{'));
    await nc.flush();

    // A subsequent valid job proves the worker survived the bad message.
    const id = await seedQueued({});
    publishTestJob(id, {});
    await nc.flush();
    await waitForStatus(id, 'completed');
  });
});

async function waitForStatus(id: string, expected: string, timeoutMs = 4000): Promise<string> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const record = await getPrisma().job.findUnique({ where: { id } });
    if (record?.status === expected) return record.status;
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  throw new Error(`Job ${id} did not reach status ${expected} within timeout`);
}
