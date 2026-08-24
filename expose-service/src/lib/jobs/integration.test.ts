import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { connect, StringCodec } from 'nats';
import { createJobEvent } from './event.js';

const run = process.env.RUN_JOB_INTEGRATION === '1';
const skipReason = !run ? 'Set RUN_JOB_INTEGRATION=1 to enable job integration tests' : false;

const prefix = `vista.jobs.test.${Date.now()}`;
process.env.NATS_SUBJECT_PREFIX = prefix;

const { publishJob, closeNats } = await import('./publisher.js');

describe('job NATS publishing (integration)', { skip: skipReason }, () => {
  it('publishes a job event to the per-type subject', async () => {
    const nc = await connect({ servers: process.env.NATS_URL || 'nats://localhost:4222' });
    const received: string[] = [];
    const sub = nc.subscribe(`${prefix}.>`);
    void (async () => {
      for await (const msg of sub) received.push(StringCodec().decode(msg.data));
    })();
    await nc.flush();

    const event = createJobEvent({ jobId: 'it-publish', jobType: 'test-job', payload: { x: 1 } });
    await publishJob(event);

    await new Promise((resolve) => setTimeout(resolve, 300));
    assert.equal(received.length, 1);
    const parsed = JSON.parse(received[0]) as { jobId: string; jobType: string };
    assert.equal(parsed.jobId, 'it-publish');
    assert.equal(parsed.jobType, 'test-job');

    await nc.drain();
    await closeNats();
  });
});

describe('job status persistence (integration)', { skip: skipReason }, () => {
  it('persists queued then advances to processing and completed', async () => {
    const { jobStore, closePrisma } = await import('./store.js');

    const created = await jobStore.create({ type: 'test-job', payload: { n: 1 } });
    assert.equal(created.status, 'queued');

    await jobStore.updateStatus(created.id, {
      status: 'processing',
      progress: 10,
      currentStep: 'working',
    });
    await jobStore.updateStatus(created.id, { status: 'completed', progress: 100 });

    const record = await jobStore.get(created.id);
    assert.equal(record?.status, 'completed');
    assert.equal(record?.progress, 100);
    assert.equal(record?.currentStep, 'working');

    await closePrisma();
  });
});
