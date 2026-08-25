import { Router } from 'express';
import type { Response } from 'express';
import { z } from 'zod';
import { getParam } from '../lib/http.js';
import { asyncHandler, sendError } from '../lib/http.js';
import { getLogger } from '../lib/logger.js';
import { createJobEvent } from '../lib/jobs/event.js';
import { jobStore, type JobRecord } from '../lib/jobs/store.js';
import { publishJob } from '../lib/jobs/publisher.js';
import { getJobProgressBus } from '../lib/jobs/progress-bus.js';
import type { JobProgressEvent } from '../lib/jobs/progress-event.js';

const CREATE_JOB_BODY = z.object({
  type: z.string().min(1),
  payload: z.unknown().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

/** Uniform job-progress payload delivered over SSE. */
export interface JobProgressPayload {
  jobId: string;
  status: string;
  progress: number;
  currentStep?: string;
  message?: string;
  updatedAt: string;
  error?: string;
}

/** Maps a persisted job record onto the SSE payload shape. */
export function recordToPayload(record: JobRecord): JobProgressPayload {
  return {
    jobId: record.id,
    status: record.status,
    progress: record.progress ?? 0,
    currentStep: record.currentStep ?? undefined,
    message: record.message ?? undefined,
    updatedAt: record.updatedAt.toISOString(),
    error: record.error ?? undefined,
  };
}

export interface JobDeps {
  repo: {
    create(input: { type: string; payload?: unknown; metadata?: Record<string, unknown> }): Promise<{
      id: string;
    }>;
    get(id: string): Promise<JobRecord | null>;
  };
  publish: (event: ReturnType<typeof createJobEvent>) => Promise<void>;
  /** Registers an SSE listener for a job's progress; returns an unsubscribe fn. */
  subscribeProgress?: (jobId: string, listener: (event: JobProgressEvent) => void) => () => void;
}

const defaultDeps: JobDeps = {
  repo: {
    create: (input) => jobStore.create(input),
    get: (id) => jobStore.get(id),
  },
  publish: (event) => publishJob(event),
  subscribeProgress: (jobId, listener) => getJobProgressBus().subscribe(jobId, listener),
};

const TERMINAL = new Set(['completed', 'failed']);

/** Writes an SSE event of type `job` carrying `data`. */
function writeSse(res: Response, payload: JobProgressPayload): void {
  res.write(`event: job\ndata: ${JSON.stringify(payload)}\n\n`);
}

export function jobsRouter(deps: JobDeps = defaultDeps): Router {
  const router = Router();
  const subscribeProgress = deps.subscribeProgress ?? defaultDeps.subscribeProgress!;

  router.post(
    '/api/jobs',
    asyncHandler(async (req, res) => {
      const parsed = CREATE_JOB_BODY.safeParse(req.body ?? {});
      if (!parsed.success) {
        sendError(res, 400, 'Ungültige Anfrage: type ist erforderlich.');
        return;
      }
      const { type, payload, metadata } = parsed.data;
      const record = await deps.repo.create({ type, payload, metadata });
      const event = createJobEvent({
        jobId: record.id,
        jobType: type,
        payload,
        metadata,
      });
      await deps.publish(event);
      getLogger().info({ jobId: record.id, type }, 'Job {jobId} enqueued and published');
      res.status(201).json({ jobId: record.id, status: 'queued', type });
    }),
  );

  router.get(
    '/api/jobs/:id',
    asyncHandler(async (req, res) => {
      const record = await deps.repo.get(getParam(req, 'id'));
      if (!record) {
        sendError(res, 404, 'Nicht gefunden');
        return;
      }
      res.json(record);
    }),
  );

  // Server-Sent Events stream for a job's progress. Sends the current state on
  // connect, then forwards live updates until the job reaches a terminal state
  // (or the client disconnects). A job that already finished returns its final
  // state and closes immediately instead of staying open.
  router.get(
    '/api/jobs/:id/events',
    asyncHandler(async (req, res) => {
      const jobId = getParam(req, 'id');
      const record = await deps.repo.get(jobId);
      if (!record) {
        sendError(res, 404, 'Nicht gefunden');
        return;
      }

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders();

      // Subscribe to live progress BEFORE sending the current DB snapshot:
      // job-processor persists the terminal state before it publishes, so
      // subscribing first guarantees no transition falls into the gap between
      // the snapshot and the subscription.
      let finished = false;
      const unsubscribe = subscribeProgress(jobId, (event) => {
        if (finished) return;
        writeSse(res, {
          jobId: event.jobId,
          status: event.status,
          progress: event.progress ?? 0,
          currentStep: event.currentStep,
          message: event.message,
          updatedAt: event.updatedAt,
          error: event.error,
        });
        if (TERMINAL.has(event.status)) {
          finished = true;
          res.end();
        }
      });

      res.on('close', () => {
        finished = true;
        unsubscribe();
      });

      writeSse(res, recordToPayload(record));

      if (TERMINAL.has(record.status)) {
        finished = true;
        res.end();
      }
    }),
  );

  return router;
}
