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
    log.error({ service: 'meltflex', operation: 'floorplan-to-3d', env: process.env.NODE_ENV ?? 'unknown' }, 'MELTFLEX_API_KEY missing — is the secret mounted?');
    throw new MeltFlexError(401, 'unauthorized', 'MELTFLEX_API_KEY is not configured');
  }

  log.info(
    {
      service: 'meltflex',
      operation: 'floorplan-to-3d',
      hasApiKey: true,
      apiKeyPrefix: apiKey.slice(0, 4),
      apiKeyLength: apiKey.length,
      mode: imageUrl ? 'imageUrl' : 'base64',
      imageUrlLength: imageUrl?.length,
      imageUrlHost: (() => { try { return imageUrl ? new URL(imageUrl).host : null; } catch { return 'invalid'; } })(),
      imageBytes: imageBuffer.length,
      mimeType,
      timeoutMs,
    },
    'MeltFlex request configured — mode={mode}, keyPrefix={apiKeyPrefix}..., timeout={timeoutMs}ms',
  );

  let payload: Record<string, unknown>;
  if (imageUrl) {
    payload = { imageUrl };
    log.info({ service: 'meltflex', imageUrlLength: imageUrl.length }, 'MeltFlex request via imageUrl ({imageUrlLength} chars)');
  } else {
    const base64 = imageBuffer.toString('base64');
    const dataUrl = `data:${mimeType || 'image/png'};base64,${base64}`;
    payload = { image: dataUrl };
    log.info(
      { service: 'meltflex', imageBytes: imageBuffer.length, base64Length: base64.length, dataUrlLength: dataUrl.length, mimeType },
      'MeltFlex request via base64 ({imageBytes} bytes → {base64Length} chars)',
    );
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = performance.now();

  let response: Response;
  try {
    const fetchStartedAt = performance.now();
    log.info(
      { service: 'meltflex', operation: 'floorplan-to-3d', url: MELTFLEX_API_URL, timeoutMs },
      'MeltFlex HTTP POST starting — {url}',
    );
    response = await trackExternalCall(
      { service: 'meltflex', operation: 'floorplan-to-3d', props: { imageBytes: imageBuffer.length, mode: imageUrl ? 'imageUrl' : 'base64' } },
      () =>
        fetchImpl(MELTFLEX_API_URL, {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: controller.signal,
        }),
    );
    log.info(
      {
        service: 'meltflex',
        operation: 'floorplan-to-3d',
        httpStatus: response.status,
        ok: response.ok,
        contentType: response.headers?.get?.('content-type') ?? undefined,
        contentLength: response.headers?.get?.('content-length') ?? undefined,
        fetchDurationMs: Math.round(performance.now() - fetchStartedAt),
      },
      'MeltFlex HTTP response received — status={httpStatus}, ok={ok}, fetch={fetchDurationMs}ms',
    );
  } catch (cause) {
    const durationMs = Math.round(performance.now() - startedAt);
    clearTimeout(timer);
    if (cause instanceof Error && cause.name === 'AbortError') {
      log.error(
        { service: 'meltflex', timeoutMs, durationMs, err: cause },
        'MeltFlex request timed out after {durationMs}ms (limit {timeoutMs}ms)',
      );
      throw new MeltFlexError(504, 'timeout', 'MeltFlex request timed out');
    }
    log.error(
      {
        service: 'meltflex',
        durationMs,
        err: cause,
        errName: cause instanceof Error ? cause.name : typeof cause,
        errMessage: cause instanceof Error ? cause.message : String(cause),
      },
      'MeltFlex service unreachable after {durationMs}ms — {errName}: {errMessage}',
    );
    throw new MeltFlexError(502, 'unreachable', `MeltFlex service unreachable: ${cause instanceof Error ? cause.message : String(cause)}`);
  } finally {
    clearTimeout(timer);
  }

  const durationMs = Math.round(performance.now() - startedAt);

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    log.warn(
      {
        service: 'meltflex',
        operation: 'floorplan-to-3d',
        httpStatus: response.status,
        responseBody: text.slice(0, 2000),
        responseBodyLength: text.length,
        durationMs,
      },
      'MeltFlex non-OK response — status={httpStatus}, bodyLength={responseBodyLength}, duration={durationMs}ms',
    );
    throw mapMeltFlexError(response.status, text);
  }

  let json: unknown;
  try {
    json = await response.json();
  } catch (cause) {
    log.error(
      { service: 'meltflex', httpStatus: response.status, durationMs, err: cause },
      'MeltFlex returned non-JSON response after {durationMs}ms — status={httpStatus}',
    );
    throw new MeltFlexError(502, 'malformed-response', 'MeltFlex returned non-JSON response');
  }

  const body = json as Record<string, unknown>;
  const bodyKeys = Object.keys(body);
  log.info(
    {
      service: 'meltflex',
      operation: 'floorplan-to-3d',
      httpStatus: response.status,
      durationMs,
      bodyKeys,
      success: body.success,
      hasModelUrl: typeof body.modelUrl === 'string',
      hasModel: typeof body.model === 'string',
      modelUrlPreview: typeof body.modelUrl === 'string' ? body.modelUrl.slice(0, 100) : undefined,
      modelBase64Length: typeof body.model === 'string' ? (body.model as string).length : undefined,
      format: body.format,
      creditsUsed: body.creditsUsed,
      error: body.error,
    },
    'MeltFlex JSON response parsed — keys={bodyKeys}, success={success}, format={format}, duration={durationMs}ms',
  );

  if (body.success !== true && body.success !== undefined) {
    const msg = typeof body.error === 'string' ? body.error : JSON.stringify(body).slice(0, 500);
    log.warn(
      { service: 'meltflex', success: body.success, error: body.error, durationMs },
      'MeltFlex conversion failed — success={success}, error={error}',
    );
    throw new MeltFlexError(422, 'conversion-failed', `MeltFlex conversion failed: ${msg}`);
  }

  const modelUrl = typeof body.modelUrl === 'string' ? body.modelUrl : undefined;
  const modelBase64 = typeof body.model === 'string' ? body.model : undefined;
  const format = typeof body.format === 'string' ? body.format : 'glb';

  if (!modelUrl && !modelBase64) {
    log.error(
      { service: 'meltflex', bodyKeys, durationMs },
      'MeltFlex response missing both modelUrl and model — no GLB output available',
    );
    throw new MeltFlexError(502, 'malformed-response', 'MeltFlex response missing modelUrl and fallback model');
  }

  log.info(
    {
      service: 'meltflex',
      format,
      hasModelUrl: Boolean(modelUrl),
      hasModel: Boolean(modelBase64),
      modelBase64Length: modelBase64?.length ?? 0,
      modelUrlPreview: modelUrl?.slice(0, 120),
      creditsUsed: typeof body.creditsUsed === 'number' ? body.creditsUsed : undefined,
      durationMs,
    },
    'MeltFlex call succeeded — format={format}, modelUrl={hasModelUrl}, modelBase64={hasModel}, credits={creditsUsed}, duration={durationMs}ms',
  );

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
