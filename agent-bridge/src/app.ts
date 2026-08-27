import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import type { OpenCodeClient } from './lib/opencode.js';
import type { ScreenshotService } from './lib/screenshot.js';
import { errorHandler } from './lib/http.js';
import { getLogger } from './lib/logger.js';
import { sessionsRouter } from './routes/sessions.js';
import { promptsRouter } from './routes/prompts.js';
import { screenshotsRouter } from './routes/screenshots.js';
import { tasksRouter } from './routes/tasks.js';

export interface CreateAppOptions {
  opencode: OpenCodeClient;
  screenshot?: ScreenshotService;
}

/**
 * Minimal per-request log line (method, path, status, duration). Kept inline
 * instead of pino-http because the bridge has no correlation-id requirements.
 */
function requestLog() {
  const log = getLogger();
  return (req: Request, res: Response, next: NextFunction): void => {
    if (req.path === '/health') {
      next();
      return;
    }
    const started = performance.now();
    res.on('finish', () => {
      const durationMs = Math.round(performance.now() - started);
      const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
      log[level](
        { method: req.method, path: req.path, status: res.statusCode, durationMs },
        '%s %s -> %s (%s ms)',
        req.method,
        req.path,
        res.statusCode,
        durationMs,
      );
    });
    next();
  };
}

export function createApp(options: CreateAppOptions): express.Express {
  const app = express();

  app.use(requestLog());
  app.use(express.json({ type: ['application/json', 'application/*+json'] }));

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'vista-agent-bridge' });
  });

  app.use(sessionsRouter(options.opencode));
  app.use(promptsRouter(options.opencode));
  app.use(tasksRouter(options.opencode, options.screenshot));
  if (options.screenshot) {
    app.use(screenshotsRouter(options.screenshot));
  }

  app.use((_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  app.use(errorHandler);
  return app;
}
