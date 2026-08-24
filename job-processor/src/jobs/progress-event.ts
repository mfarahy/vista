import { z } from 'zod';

/**
 * Progress/status event published to NATS whenever a job advances. Consumed by
 * expose-service, which forwards it to subscribed SSE clients. Mirrors the
 * schema in expose-service's `src/lib/jobs/progress-event.ts`.
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

/** Builds a validated progress event, defaulting `updatedAt` to now. */
export function createJobProgressEvent(
  input: {
    jobId: string;
    status: JobProgressEvent['status'];
    progress?: number;
    currentStep?: string;
    message?: string;
    error?: string;
  },
  updatedAt: string = new Date().toISOString(),
): JobProgressEvent {
  return JOB_PROGRESS_SCHEMA.parse({ ...input, updatedAt });
}

/** Parses and validates an inbound NATS progress event body. */
export function parseJobProgress(data: unknown): JobProgressEvent {
  return JOB_PROGRESS_SCHEMA.parse(data);
}
