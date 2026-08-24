import { z } from 'zod';

/**
 * Wire event published to NATS when a job is enqueued and consumed by
 * `job-processor`. Field naming (`jobId`, `jobType`) is intentionally kept
 * close to the transport so the protocol stays explicit.
 */
export const JOB_EVENT_SCHEMA = z.object({
  jobId: z.string().min(1),
  jobType: z.string().min(1),
  payload: z.unknown().optional().default({}),
  createdAt: z.string().datetime(),
  /**
   * Optional, arbitrary metadata (e.g. `{ requesterId, traceId }`).
   * Never stores secrets.
   */
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type JobEvent = z.infer<typeof JOB_EVENT_SCHEMA>;

export function createJobEvent(
  input: {
    jobId: string;
    jobType: string;
    payload?: unknown;
    metadata?: Record<string, unknown>;
  },
  createdAt: string = new Date().toISOString(),
): JobEvent {
  return JOB_EVENT_SCHEMA.parse({
    jobId: input.jobId,
    jobType: input.jobType,
    payload: input.payload,
    createdAt,
    metadata: input.metadata,
  });
}

/** Parses and validates an inbound NATS message body into a `JobEvent`. */
export function parseJobEvent(data: unknown): JobEvent {
  return JOB_EVENT_SCHEMA.parse(data);
}
