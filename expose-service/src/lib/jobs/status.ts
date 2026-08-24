/**
 * Job lifecycle statuses. `queued` originates in expose-service when the job
 * is persisted and published; `job-processor` moves it through `processing`
 * to `completed` or `failed`.
 */
export const JOB_STATUSES = ['queued', 'processing', 'completed', 'failed'] as const;

export type JobStatus = (typeof JOB_STATUSES)[number];

export function isJobStatus(value: unknown): value is JobStatus {
  return typeof value === 'string' && (JOB_STATUSES as readonly string[]).includes(value);
}
