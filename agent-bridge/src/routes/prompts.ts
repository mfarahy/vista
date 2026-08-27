import { Router } from 'express';
import { z } from 'zod';
import type { OpenCodeClient } from '../lib/opencode.js';
import { asyncHandler } from '../lib/http.js';
import { getLogger } from '../lib/logger.js';

export function promptsRouter(opencode: OpenCodeClient): Router {
  const router = Router();
  const log = getLogger();

  const promptBody = z.object({
    sessionId: z.string().min(1, 'sessionId is required'),
    prompt: z.string().min(1, 'prompt is required'),
  });

  // POST /prompt — send a prompt to an existing session and wait for the agent.
  router.post(
    '/prompt',
    asyncHandler(async (req, res) => {
      const { sessionId, prompt } = promptBody.parse(req.body);
      // Verify the session exists on the server (404 when it does not).
      await opencode.getSession(sessionId);
      const result = await opencode.sendPrompt(sessionId, prompt);
      log.info({ sessionId }, 'Bridge prompt completed');
      res.json({
        sessionId,
        status: 'completed',
        messageId: result.messageId,
        response: result.text,
        tokens: result.tokens,
        cost: result.cost,
      });
    }),
  );

  return router;
}
