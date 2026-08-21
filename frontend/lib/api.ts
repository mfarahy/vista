import { frontendLogger } from './logger';

export function getApiBaseUrl() {
  return process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4000';
}

function methodOf(init: RequestInit = {}) {
  return (init.method || 'GET').toUpperCase();
}

function pathOf(path: string) {
  return path.startsWith('http') ? new URL(path).pathname : path;
}

/**
 * Fetches from the expose-service API with minimal client-side observability.
 * Network failures are logged structurally (method, path, duration); response
 * status codes are left to the callers, which intentionally handle and fall
 * back from non-2xx responses.
 */
export async function apiFetch(path: string, init: RequestInit = {}) {
  const baseUrl = getApiBaseUrl();
  const url = path.startsWith('http') ? path : `${baseUrl}${path}`;
  const started = performance.now();
  try {
    return await fetch(url, init);
  } catch (error) {
    frontendLogger.error('API request failed', {
      method: methodOf(init),
      path: pathOf(path),
      durationMs: Math.round(performance.now() - started),
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

export function apiAssetUrl(path: string) {
  return path.startsWith('http') || path.startsWith('data:') ? path : `${getApiBaseUrl()}${path}`;
}