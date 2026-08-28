import { getLogger, trackExternalCall } from './logger.js';

export const MELTFLEX_API_URL = 'https://www.meltflexai.com/api/v1/floorplan-to-3d';
export const MELTFLEX_TIMEOUT_MS = 180_000;

export class MeltFlexError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'MeltFlexError';
    this.status = status;
    this.code = code;
  }
}

type MeltFlexSuccessResponse = {
  success: boolean;
  modelUrl?: string;
  format?: string;
  creditsUsed?: number;
  model?: string;
};

function mapMeltFlexError(status: number, bodyText: string): MeltFlexError {
  const fallback = bodyText?.slice(0, 500) || `HTTP ${status}`;
  if (status === 400) return new MeltFlexError(400, 'invalid-image', `Invalid floor plan image: ${fallback}`);
  if (status === 401) return new MeltFlexError(401, 'unauthorized', `MeltFlex authentication failed: ${fallback}`);
  if (status === 402) return new MeltFlexError(402, 'insufficient-credits', `MeltFlex insufficient credits: ${fallback}`);
  if (status === 429) return new MeltFlexError(429, 'rate-limited', `MeltFlex rate limited: ${fallback}`);
  if (status === 500) return new MeltFlexError(500, 'server-error', `MeltFlex server error: ${fallback}`);
  if (status === 502) return new MeltFlexError(502, 'server-error', `MeltFlex bad gateway: ${fallback}`);
  return new MeltFlexError(status, 'api-error', `MeltFlex error ${status}: ${fallback}`);
}

export async function callMeltFlex(
  imageBuffer: Buffer,
  mimeType: string,
  opts: { apiKey: string; timeoutMs?: number; fetchImpl?: typeof fetch; imageUrl?: string } = {
    apiKey: process.env.MELTFLEX_API_KEY ?? '',
  },
): Promise<MeltFlexSuccessResponse> {
  const log = getLogger();
  const apiKey = opts.apiKey;
  const timeoutMs = opts.timeoutMs ?? MELTFLEX_TIMEOUT_MS;
  const fetchImpl = opts.fetchImpl ?? fetch;
  const imageUrl = opts.imageUrl;

  if (!apiKey) {
    log.error({ service: 'meltflex', operation: 'floorplan-to-3d' }, 'MELTFLEX_API_KEY missing');
    throw new MeltFlexError(401, 'unauthorized', 'MELTFLEX_API_KEY is not configured');
  }

  let payload: Record<string, unknown>;
  if (imageUrl) {
    payload = { imageUrl };
    log.info({ service: 'meltflex', hasImageUrl: true }, 'MeltFlex request via imageUrl');
  } else {
    const base64 = imageBuffer.toString('base64');
    const dataUrl = `data:${mimeType || 'image/png'};base64,${base64}`;
    payload = { image: dataUrl };
    log.info({ imageBytes: imageBuffer.length, base64Length: base64.length }, 'MeltFlex request via base64');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = performance.now();

  let response: Response;
  try {
    response = await trackExternalCall(
      { service: 'meltflex', operation: 'floorplan-to-3d', props: { imageBytes: imageBuffer.length } },
      () =>
        fetchImpl(MELTFLEX_API_URL, {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: controller.signal,
        }),
    );
  } catch (cause) {
    clearTimeout(timer);
    const durationMs = Math.round(performance.now() - startedAt);
    if (cause instanceof Error && cause.name === 'AbortError') {
      log.error({ timeoutMs, durationMs, err: cause }, 'MeltFlex timeout');
      throw new MeltFlexError(504, 'timeout', 'MeltFlex request timed out');
    }
    log.error({ durationMs, err: cause }, 'MeltFlex unreachable');
    throw new MeltFlexError(502, 'unreachable', `MeltFlex service unreachable: ${cause instanceof Error ? cause.message : String(cause)}`);
  } finally {
    clearTimeout(timer);
  }

  const durationMs = Math.round(performance.now() - startedAt);
  log.info({ statusCode: response.status, durationMs }, 'MeltFlex response {statusCode} in {durationMs}ms');

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw mapMeltFlexError(response.status, text);
  }

  let json: unknown;
  try {
    json = await response.json();
  } catch {
    throw new MeltFlexError(502, 'malformed-response', 'MeltFlex returned non-JSON response');
  }

  const body = json as Record<string, unknown>;
  if (body.success !== true && body.success !== undefined) {
    const msg = typeof body.error === 'string' ? body.error : JSON.stringify(body).slice(0, 500);
    throw new MeltFlexError(422, 'conversion-failed', `MeltFlex conversion failed: ${msg}`);
  }

  const modelUrl = typeof body.modelUrl === 'string' ? body.modelUrl : undefined;
  const modelBase64 = typeof body.model === 'string' ? body.model : undefined;
  const format = typeof body.format === 'string' ? body.format : 'glb';

  if (!modelUrl && !modelBase64) {
    throw new MeltFlexError(502, 'malformed-response', 'MeltFlex response missing modelUrl and fallback model');
  }

  return {
    success: true,
    modelUrl,
    format,
    creditsUsed: typeof body.creditsUsed === 'number' ? body.creditsUsed : undefined,
    model: modelBase64,
  };
}

export async function callMeltFlexViaUrl(
  imageUrl: string,
  opts: { apiKey?: string; timeoutMs?: number; fetchImpl?: typeof fetch } = {},
): Promise<MeltFlexSuccessResponse> {
  const apiKey = opts.apiKey ?? process.env.MELTFLEX_API_KEY ?? '';
  return callMeltFlex(Buffer.alloc(0), 'image/png', { apiKey, timeoutMs: opts.timeoutMs, fetchImpl: opts.fetchImpl, imageUrl });
}
