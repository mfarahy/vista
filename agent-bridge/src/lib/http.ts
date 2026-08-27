import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import {
  OpenCodeApiError,
  OpenCodeError,
  OpenCodeNotFoundError,
  OpenCodePromptError,
  OpenCodeTimeoutError,
  OpenCodeUnavailableError,
} from './opencode.js';
import {
  ScreenshotNavigationError,
  ScreenshotSelectorError,
  ScreenshotTimeoutError,
} from './screenshot.js';
import { getLogger } from './logger.js';

export function sendError(res: Response, status: number, message: string): Response {
  return res.status(status).json({ error: message });
}

/**
 * Forwards rejected promises from async route handlers to the error middleware.
 * Express 4 does not catch async errors automatically.
 */
export function asyncHandler(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    handler(req, res, next).catch(next);
  };
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

/** Central error boundary: maps OpenCode failures to clear HTTP status codes. */
export function errorHandler(
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (error instanceof ZodError) {
    const first = error.issues[0];
    sendError(
      res,
      400,
      `Invalid request body: ${first?.path.join('.') ?? 'body'} ${first?.message}`,
    );
    return;
  }
  // Malformed JSON bodies (body-parser) are client errors, not server failures.
  if (
    typeof error === 'object' &&
    error !== null &&
    (error as { type?: string }).type === 'entity.parse.failed'
  ) {
    sendError(res, 400, 'Invalid request: request body could not be parsed as JSON.');
    return;
  }
  if (error instanceof OpenCodeNotFoundError) {
    sendError(res, 404, errorMessage(error, 'Session not found'));
    return;
  }
  if (error instanceof OpenCodeTimeoutError) {
    sendError(res, 504, errorMessage(error, 'OpenCode request timed out'));
    return;
  }
  if (error instanceof OpenCodeUnavailableError) {
    sendError(res, 503, errorMessage(error, 'OpenCode server is unavailable'));
    return;
  }
  if (error instanceof OpenCodePromptError) {
    sendError(res, 502, errorMessage(error, 'OpenCode agent run failed'));
    return;
  }
  if (error instanceof OpenCodeApiError) {
    sendError(res, 502, errorMessage(error, 'OpenCode API error'));
    return;
  }
  if (error instanceof OpenCodeError) {
    sendError(res, 502, errorMessage(error, 'OpenCode error'));
    return;
  }
  if (error instanceof ScreenshotNavigationError) {
    sendError(res, 502, errorMessage(error, 'Screenshot target is unreachable'));
    return;
  }
  if (error instanceof ScreenshotTimeoutError) {
    sendError(res, 504, errorMessage(error, 'Screenshot timed out'));
    return;
  }
  if (error instanceof ScreenshotSelectorError) {
    sendError(res, 404, errorMessage(error, 'Screenshot selector not found'));
    return;
  }
  getLogger().error({ err: error }, 'Unhandled error while processing request');
  sendError(res, 500, 'Internal server error');
}
