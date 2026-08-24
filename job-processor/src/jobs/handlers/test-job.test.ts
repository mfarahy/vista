import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { testJobHandler } from './test-job.js';
import { getLogger } from '../../lib/logger.js';

function context(payload: unknown, onUpdate: (patch: unknown) => void) {
  return {
    job: { jobId: 'job-1', jobType: 'test-job', payload, metadata: undefined },
    update: async (patch: unknown) => onUpdate(patch),
    log: getLogger(),
  };
}

describe('test-job handler', () => {
  it('completes successfully and reports progress', async () => {
    const updates: Array<Record<string, unknown>> = [];
    const result = await testJobHandler(
      context({ message: 'all good' }, (patch) => updates.push(patch as Record<string, unknown>)),
    );
    assert.deepEqual(result, { message: 'all good' });

    const progress = updates.map((u) => u.progress);
    assert.deepEqual(progress, [25, 75, 100]);
    assert.equal(updates[updates.length - 1].currentStep, 'done');
    assert.equal(updates[updates.length - 1].message, 'all good');
  });

  it('throws when payload.fail is set (exercises the failure path)', async () => {
    const run = Promise.resolve().then(() =>
      testJobHandler(context({ fail: true, message: 'boom' }, () => undefined)),
    );
    await assert.rejects(run, /boom/);
  });
});
