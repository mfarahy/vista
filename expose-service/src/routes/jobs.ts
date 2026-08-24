import { Router } from 'express';
import { z } from 'zod';
import { getParam } from '../lib/http.js';
import { asyncHandler, sendError } from '../lib/http.js';
import { getLogger } from '../lib/logger.js';
import { createJobEvent } from '../lib/jobs/event.js';
import { jobStore, type JobRecord } from '../lib/jobs/store.js';
import { publishJob } from '../lib/jobs/publisher.js';

const CREATE_JOB_BODY = z.object({
  type: z.string().min(1),
  payload: z.unknown().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export interface JobDeps {
  repo: {
    create(input: { type: string; payload?: unknown; metadata?: Record<string, unknown> }): Promise<{
      id: string;
    }>;
    get(id: string): Promise<JobRecord | null>;
  };
  publish: (event: ReturnType<typeof createJobEvent>) => Promise<void>;
}

const defaultDeps: JobDeps = {
  repo: {
    create: (input) => jobStore.create(input),
    get: (id) => jobStore.get(id),
  },
  publish: (event) => publishJob(event),
};

export function jobsRouter(deps: JobDeps = defaultDeps): Router {
  const router = Router();

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

  return router;
}
