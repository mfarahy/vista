import type { Logger } from 'pino';
import type { JobEvent } from './event.js';

/** Minimal progress/status a handler can report back to the consumer. */
export interface JobHandlerResult {
  message?: string;
}

export interface JobRunContext {
  job: Pick<JobEvent, 'jobId' | 'jobType' | 'payload' | 'metadata'>;
  /** Persists an incremental status update (currentStep/progress/message). */
  update: (patch: {
    progress?: number;
    currentStep?: string;
    message?: string;
  }) => Promise<void>;
  log: Logger;
}

export type JobHandler = (ctx: JobRunContext) => Promise<JobHandlerResult> | JobHandlerResult;

/**
 * Dispatches a job to its handler based on `jobType`. A job with no registered
 * handler throws so the consumer can mark it failed without crashing.
 */
export class JobDispatcher {
  private readonly handlers = new Map<string, JobHandler>();

  register(type: string, handler: JobHandler): this {
    this.handlers.set(type, handler);
    return this;
  }

  has(type: string): boolean {
    return this.handlers.has(type);
  }

  list(): string[] {
    return [...this.handlers.keys()];
  }

  async dispatch(ctx: JobRunContext): Promise<JobHandlerResult> {
    const handler = this.handlers.get(ctx.job.jobType);
    if (!handler) {
      throw new Error(`No handler registered for job type "${ctx.job.jobType}"`);
    }
    return handler(ctx);
  }
}
