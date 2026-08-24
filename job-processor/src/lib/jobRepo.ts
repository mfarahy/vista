import type { JobStatus } from '@prisma/client';
import { getPrisma } from './db.js';
import { getLogger } from './logger.js';

export interface JobStatusUpdate {
  status: JobStatus;
  progress?: number;
  currentStep?: string;
  message?: string;
  error?: string;
}

/** Normally capped at 100; failures may surface the error message instead. */
const COMPLETED_PROGRESS = 100;

/**
 * Persists job status transitions to the shared `Job` table. Safe to call even
 * when the row is missing (e.g. an event from a different producer) — the
 * processor logs and moves on rather than crashing.
 */
export const jobRepo = {
  async setStatus(id: string, update: JobStatusUpdate): Promise<void> {
    const prisma = getPrisma();
    const data: Record<string, unknown> = { status: update.status };
    if (update.progress !== undefined) data.progress = update.progress;
    if (update.currentStep !== undefined) data.currentStep = update.currentStep;
    if (update.message !== undefined) data.message = update.message;
    if (update.error !== undefined) data.error = update.error;
    try {
      await prisma.job.update({ where: { id }, data });
    } catch (error) {
      getLogger().warn({ jobId: id, err: error }, 'Failed to persist status for job {jobId}');
    }
  },

  processing(id: string): Promise<void> {
    return this.setStatus(id, { status: 'processing', currentStep: 'received' });
  },

  completed(id: string, message?: string): Promise<void> {
    getLogger().info({ jobId: id }, 'Marking job {jobId} completed');
    return this.setStatus(id, {
      status: 'completed',
      progress: COMPLETED_PROGRESS,
      message,
    });
  },

  failed(id: string, error: string): Promise<void> {
    getLogger().error({ jobId: id, error }, 'Marking job {jobId} failed');
    return this.setStatus(id, { status: 'failed', error });
  },
};
