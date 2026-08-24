import type { JobHandler } from '../dispatcher.js';

interface TestJobPayload {
  /** When truthy, the handler throws so the processor marks the job failed. */
  fail?: boolean;
  /** Optional message echoed into the completed/failed status. */
  message?: string;
  /** Simulated asynchronous work duration in ms (defaults to 0). */
  delayMs?: number;
}

function stripSensitive(input: TestJobPayload): Record<string, unknown> {
  const { message: _message, ...rest } = input;
  return rest;
}

/**
 * Example handler for the `test-job` type. Demonstrates the lifecycle: report
 * progress via ctx.update, then complete successfully, or throw (when
 * `payload.fail`) to exercise the failure path. Throwing must never crash the
 * worker — the consumer catches it and marks the job failed.
 */
export const testJobHandler: JobHandler = async (ctx) => {
  const payload = (ctx.job.payload ?? {}) as TestJobPayload;
  const { jobId } = ctx.job;

  ctx.log.info(
    { jobId, jobType: ctx.job.jobType, payload: stripSensitive(payload) },
    'Running %s for job %s',
    ctx.job.jobType,
    jobId,
  );

  await ctx.update({ progress: 25, currentStep: 'starting' });
  ctx.log.debug({ jobId, progress: 25, currentStep: 'starting' }, 'Job %s step: starting', jobId);

  if (payload.delayMs && payload.delayMs > 0) {
    ctx.log.debug({ jobId, delayMs: payload.delayMs }, 'Job %s sleeping for %sms', jobId, payload.delayMs);
    await new Promise((resolve) => setTimeout(resolve, payload.delayMs));
  }

  await ctx.update({ progress: 75, currentStep: 'working' });
  ctx.log.debug({ jobId, progress: 75, currentStep: 'working' }, 'Job %s step: working', jobId);

  if (payload.fail) {
    const message = payload.message || 'test-job failed';
    ctx.log.warn({ jobId, message }, 'Job %s failing as requested: %s', jobId, message);
    throw new Error(message);
  }

  const message = payload.message || 'test-job completed';
  await ctx.update({ progress: 100, currentStep: 'done', message });
  ctx.log.info({ jobId, progress: 100, currentStep: 'done' }, 'Job %s finished successfully', jobId);
  return { message };
};