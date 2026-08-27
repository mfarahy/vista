import { Router } from 'express';
import { z } from 'zod';
import type { OpenCodeClient } from '../lib/opencode.js';
import type { ScreenshotService } from '../lib/screenshot.js';
import { asyncHandler } from '../lib/http.js';
import { getLogger } from '../lib/logger.js';

const taskBody = z.object({
  prompt: z.string().min(1, 'prompt is required'),
  sessionId: z.string().min(1).optional(),
  screenshot: z
    .object({
      url: z.string().min(1).optional(),
      selector: z.string().min(1).optional(),
      fullPage: z.boolean().optional(),
    })
    .optional(),
});

/**
 * Combined task endpoint for an external supervisor. It creates or reuses an
 * OpenCode session, sends the prompt, waits for the agent, and optionally
 * captures a screenshot — returning a single structured response. Reusing the
 * same `sessionId` across calls keeps agent context intact (e.g. "fix the
 * doors", then "now fix the stairs" in the same session).
 */
export function tasksRouter(opencode: OpenCodeClient, screenshot?: ScreenshotService): Router {
  const router = Router();
  const log = getLogger();

  router.post(
    '/task',
    asyncHandler(async (req, res) => {
      const { prompt, sessionId, screenshot: screenshotOpts } = taskBody.parse(req.body);
      const started = performance.now();

      let session: string;
      if (!sessionId) {
        const created = await opencode.createSession();
        session = created.id;
        log.info({ sessionId: session }, 'Task created new OpenCode session');
      } else {
        // Verify the session exists so an invalid ID fails fast (404).
        await opencode.getSession(sessionId);
        session = sessionId;
        log.info({ sessionId: session }, 'Task reusing existing OpenCode session');
      }

      const result = await opencode.sendPrompt(session, prompt);

      let screenshotResult: Awaited<ReturnType<ScreenshotService['capture']>> | undefined;
      if (screenshotOpts) {
        if (!screenshot) {
          throw new Error('Screenshot requested but screenshot service is not configured');
        }
        screenshotResult = await screenshot.capture({
          url: screenshotOpts.url || '/',
          selector: screenshotOpts.selector,
          fullPage: screenshotOpts.fullPage,
        });
      }

      log.info({ sessionId: session }, 'Task completed');
      res.json({
        sessionId: session,
        status: 'completed',
        messageId: result.messageId,
        response: result.text,
        tokens: result.tokens,
        cost: result.cost,
        screenshot: screenshotResult
          ? {
              filename: screenshotResult.filename,
              path: screenshotResult.path,
              url: screenshotResult.url,
              format: screenshotResult.format,
              width: screenshotResult.width,
              height: screenshotResult.height,
              bytes: screenshotResult.bytes,
            }
          : undefined,
        durationMs: Math.round(performance.now() - started),
      });
    }),
  );

  return router;
}
