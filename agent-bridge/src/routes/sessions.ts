import { Router } from 'express';
import { z } from 'zod';
import type { OpenCodeClient } from '../lib/opencode.js';
import { asyncHandler, sendError } from '../lib/http.js';
import { getLogger } from '../lib/logger.js';

export function sessionsRouter(opencode: OpenCodeClient): Router {
  const router = Router();
  const log = getLogger();

  const createBody = z.object({
    title: z.string().trim().max(200).optional(),
  });

  // POST /session — create a new OpenCode session and return its ID.
  router.post(
    '/session',
    asyncHandler(async (req, res) => {
      const { title } = createBody.parse(req.body);
      const session = await opencode.createSession(title);
      log.info({ sessionId: session.id }, 'Bridge created session');
      res.status(201).json({
        sessionId: session.id,
        title: session.title,
        createdAt: session.time.created,
      });
    }),
  );

  // GET /session/:id — basic session information and status.
  router.get(
    '/session/:id',
    asyncHandler(async (req, res) => {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      if (!id) {
        sendError(res, 400, 'Missing session id');
        return;
      }
      const [session, status] = await Promise.all([
        opencode.getSession(id),
        opencode.getSessionStatus(id),
      ]);
      res.json({
        sessionId: session.id,
        title: session.title,
        directory: session.directory,
        status: status.type,
        createdAt: session.time.created,
        updatedAt: session.time.updated,
      });
    }),
  );

  return router;
}
