import { z } from 'zod';

/**
 * Progress/status event received from NATS when a job advances. Published by
 * job-processor and forwarded to subscribed SSE clients. Mirrors the schema in
 * job-processor's `src/jobs/progress-event.ts`.
 */
export const JOB_PROGRESS_SCHEMA = z.object({
  jobId: z.string().min(1),
  status: z.enum(['queued', 'processing', 'completed', 'failed']),
  progress: z.number().int().min(0).max(100).optional().default(0),
  currentStep: z.string().optional(),
  message: z.string().optional(),
  updatedAt: z.string().datetime(),
  error: z.string().optional(),
});

export type JobProgressEvent = z.infer<typeof JOB_PROGRESS_SCHEMA>;

/** Parses and validates an inbound NATS progress event body. */
export function parseJobProgress(data: unknown): JobProgressEvent {
  return JOB_PROGRESS_SCHEMA.parse(data);
}
