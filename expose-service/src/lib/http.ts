import type { NextFunction, Request, Response } from 'express';
import multer from 'multer';
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
    sendError(res, 404, 'Nicht gefunden');
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
  // Multer reports upload-limit violations as errors; translate them into
  // user-understandable German 400 responses instead of a generic 500.
  if (error instanceof multer.MulterError) {
    const messages: Record<string, string> = {
      LIMIT_FILE_SIZE: 'Die Datei ist zu groß.',
      LIMIT_FILE_COUNT: 'Zu viele Dateien auf einmal.',
      LIMIT_UNEXPECTED_FILE: 'Ungültige Datei.',
      LIMIT_FIELD_KEY: 'Ungültige Formulardaten.',
      LIMIT_FIELD_VALUE: 'Formulardaten sind zu groß.',
      LIMIT_FIELD_COUNT: 'Zu viele Formulardaten.',
    };
    sendError(res, 400, messages[error.code] ?? 'Ungültige Datei.');
    return;
  }
  // Malformed JSON bodies (body-parser) are client errors, not server failures.
  if (
    typeof error === 'object' &&
    error !== null &&
    (error as { type?: string }).type === 'entity.parse.failed'
  ) {
    sendError(res, 400, 'Ungültige Anfrage: Die Daten konnten nicht gelesen werden.');
    return;
  }
  getLogger().error({ err: error }, 'Unhandled error while processing request');
  sendError(res, 500, 'Interner Serverfehler');
}
