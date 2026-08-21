import type { NextFunction, Request, Response } from 'express';
import { getProperty } from './store.js';
import type { Property } from './types.js';
import { getLogger } from './logger.js';

export function getParam(req: Request, name: string): string {
  const value = req.params[name];
  return Array.isArray(value) ? value[0] : (value ?? '');
}

export function getQueryParam(req: Request, name: string): string {
  const value = req.query[name] as string | string[] | undefined;
  return Array.isArray(value) ? value[0] : (value ?? '');
}

export function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

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

/** Loads the property for the route param `id`, sending a 404 when it is missing. */
export async function loadProperty(req: Request, res: Response): Promise<Property | null> {
  const property = await getProperty(getParam(req, 'id'));
  if (!property) {
    sendError(res, 404, 'Not found');
    return null;
  }
  return property;
}

/** Central error boundary: returns JSON instead of the default HTML 500. */
export function errorHandler(
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  getLogger().error({ err: error }, 'Unhandled error while processing request');
  sendError(res, 500, 'Internal server error');
}
