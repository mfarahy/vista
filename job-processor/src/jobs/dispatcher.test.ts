import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { JobDispatcher, type JobRunContext } from './dispatcher.js';
import { testJobHandler } from './handlers/test-job.js';
import { getLogger } from '../lib/logger.js';

function context(
  overrides: Partial<JobRunContext['job']> = {},
): JobRunContext {
  return {
    job: {
      jobId: 'job-1',
      jobType: 'test-job',
      payload: {},
      metadata: undefined,
      ...overrides,
    },
    update: async () => undefined,
    log: getLogger(),
  };
}

describe('JobDispatcher', () => {
  it('routes a job to its handler by jobType', async () => {
    const dispatcher = new JobDispatcher().register('test-job', testJobHandler);
    const seen: string[] = [];

    dispatcher.register('other', async (ctx) => {
      seen.push(ctx.job.jobType);
      return { message: 'done' };
    });

    await dispatcher.dispatch(context({ jobType: 'other' }));
    assert.deepEqual(seen, ['other']);
  });

  it('throws for an unknown job type so the consumer can mark it failed', async () => {
    const dispatcher = new JobDispatcher().register('test-job', testJobHandler);
    await assert.rejects(
      () => dispatcher.dispatch(context({ jobType: 'missing-job' })),
      /No handler registered for job type "missing-job"/,
    );
  });

  it('reports registered types', () => {
    const dispatcher = new JobDispatcher().register('test-job', testJobHandler);
    assert.ok(dispatcher.has('test-job'));
    assert.deepEqual(dispatcher.list(), ['test-job']);
  });
});
