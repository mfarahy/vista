import type { RawModelResult } from './types';

/**
 * Server-side client for the local geometry-ai inference service.
 *
 * Only runs inside the Next.js API route (Node runtime); the browser never
 * talks to the Python service directly. `GEOMETRY_AI_SERVICE_URL` overrides
 * the default localhost port.
 */

const DEFAULT_SERVICE_URL = 'http://127.0.0.1:8787';
const REQUEST_TIMEOUT_MS = 120_000;

export class GeometryAiUnreachableError extends Error {
  constructor(cause?: unknown) {
    super('geometry-ai service is unreachable', { cause });
    this.name = 'GeometryAiUnreachableError';
  }
}

export class GeometryAiResponseError extends Error {
  readonly status: number;

  constructor(status: number, body?: string) {
    super(`geometry-ai service responded with ${status}: ${body ?? ''}`);
    this.name = 'GeometryAiResponseError';
    this.status = status;
  }
}

export async function fetchRawGeometry(
  imageBuffer: Buffer,
  contentType: string,
): Promise<RawModelResult> {
  const baseUrl = process.env.GEOMETRY_AI_SERVICE_URL ?? DEFAULT_SERVICE_URL;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(`${baseUrl}/extract`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image_base64: imageBuffer.toString('base64'),
        content_type: contentType || 'image/png',
      }),
      signal: controller.signal,
    });
  } catch (cause) {
    throw new GeometryAiUnreachableError(cause);
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    throw new GeometryAiResponseError(res.status, await res.text().catch(() => ''));
  }

  try {
    return (await res.json()) as RawModelResult;
  } catch {
    throw new GeometryAiResponseError(200, 'non-JSON body');
  }
}