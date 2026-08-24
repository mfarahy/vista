import type { JobHandler } from '../dispatcher.js';

interface TestJobPayload {
  /** When truthy, the handler throws so the processor marks the job failed. */
  fail?: boolean;
  /** Optional message echoed into the completed/failed status. */
  message?: string;
  /** Simulated asynchronous work duration in ms (defaults to 0). */
  delayMs?: number;
}

/**
 * Example handler for the `test-job` type. Demonstrates the lifecycle: report
 * progress via ctx.update, then complete successfully, or throw (when
 * `payload.fail`) to exercise the failure path. Throwing must never crash the
 * worker — the consumer catches it and marks the job failed.
 */
export const testJobHandler: JobHandler = async (ctx) => {
  const payload = (ctx.job.payload ?? {}) as TestJobPayload;
  ctx.log.info({ jobId: ctx.job.jobId, payload }, 'Running test-job {jobId}');

  await ctx.update({ progress: 25, currentStep: 'starting' });

  if (payload.delayMs && payload.delayMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, payload.delayMs));
  }

  await ctx.update({ progress: 75, currentStep: 'working' });

  if (payload.fail) {
    throw new Error(payload.message || 'test-job failed');
  }

  const message = payload.message || 'test-job completed';
  await ctx.update({ progress: 100, currentStep: 'done', message });
  ctx.log.info({ jobId: ctx.job.jobId }, 'test-job {jobId} finished successfully');
  return { message };
};
