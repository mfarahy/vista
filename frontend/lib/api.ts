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

/**
 * Resolves the download filename from an RFC 5987 `filename*` or plain
 * `filename` Content-Disposition parameter, or null when absent.
 */
export function pdfFilenameFromDisposition(disposition: string | null): string | null {
  if (!disposition) return null;
  const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (encoded?.[1]) {
    try {
      return decodeURIComponent(encoded[1]);
    } catch {
      // Malformed encoding: fall through to the plain filename parameter.
    }
  }
  const plain = disposition.match(/filename="?([^";]+)"?/i);
  return plain?.[1] ?? null;
}

/**
 * Generates the Exposé PDF through the API and triggers a browser download
 * without leaving the current page. Returns the download filename on success,
 * or null when the backend rejected the request.
 */
export async function downloadPdf(propertyId: string): Promise<string | null> {
  const response = await apiFetch(`/api/properties/${propertyId}/pdf`, { method: 'POST' });
  if (!response.ok) return null;
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download =
      pdfFilenameFromDisposition(response.headers.get('Content-Disposition')) ??
      `Expose_${propertyId}.pdf`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    return anchor.download;
  } finally {
    URL.revokeObjectURL(url);
  }
}
