import { z } from 'zod';

/**
 * Wire event consumed from NATS. Mirrors the schema published by
 * expose-service's `src/lib/jobs/event.ts`.
 */
export const JOB_EVENT_SCHEMA = z.object({
  jobId: z.string().min(1),
  jobType: z.string().min(1),
  payload: z.unknown().optional().default({}),
  createdAt: z.string().datetime(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type JobEvent = z.infer<typeof JOB_EVENT_SCHEMA>;

/**
 * Parses and validates an inbound NATS message body. Throws on malformed
 * input; the consumer catches this per-message so one bad event never stops
 * the worker.
 */
export function parseJobEvent(data: unknown): JobEvent {
  return JOB_EVENT_SCHEMA.parse(data);
}
