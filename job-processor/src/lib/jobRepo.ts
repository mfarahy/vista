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
      getLogger().debug(
        {
          jobId: id,
          status: update.status,
          progress: update.progress,
          currentStep: update.currentStep,
        },
        'Persisted status %s for job %s',
        update.status,
        id,
      );
    } catch (error) {
      getLogger().warn(
        { jobId: id, err: error, status: update.status },
        'Failed to persist status %s for job %s',
        update.status,
        id,
      );
    }
  },

  processing(id: string): Promise<void> {
    getLogger().info({ jobId: id, status: 'processing' }, 'Marking job %s as processing', id);
    return this.setStatus(id, { status: 'processing', currentStep: 'received' });
  },

  completed(id: string, message?: string): Promise<void> {
    getLogger().info(
      { jobId: id, status: 'completed', progress: COMPLETED_PROGRESS, message },
      'Marking job %s as completed (progress %s)',
      id,
      COMPLETED_PROGRESS,
    );
    return this.setStatus(id, {
      status: 'completed',
      progress: COMPLETED_PROGRESS,
      message,
    });
  },

  failed(id: string, error: string): Promise<void> {
    getLogger().error(
      { jobId: id, status: 'failed', error },
      'Marking job %s as failed: %s',
      id,
      error,
    );
    return this.setStatus(id, { status: 'failed', error });
  },
};