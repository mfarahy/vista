import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

const MAX_BYTES = 15 * 1024 * 1024;
const ALLOWED_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/jpg']);
const MELTFLEX_URL = 'https://www.meltflexai.com/api/v1/floorplan-to-3d';
const TIMEOUT_MS = 180_000;

function errorResponse(key: string, status: number, detail?: string) {
  return NextResponse.json({ error: key, ...(detail ? { detail } : {}) }, { status });
}

function mapMeltFlexStatus(status: number): { key: string; http: number } {
  if (status === 400) return { key: 'floorplan3d.meltflex.invalidImage', http: 400 };
  if (status === 401) return { key: 'floorplan3d.meltflex.authFailed', http: 401 };
  if (status === 402) return { key: 'floorplan3d.meltflex.insufficientCredits', http: 402 };
  if (status === 429) return { key: 'floorplan3d.meltflex.rateLimited', http: 429 };
  if (status === 500 || status === 502) return { key: 'floorplan3d.meltflex.serverError', http: 502 };
  return { key: 'floorplan3d.meltflex.conversionFailed', http: 502 };
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.MELTFLEX_API_KEY;
  const hasApiKey = Boolean(apiKey);
  console.info('[floorplan-to-3d] POST received — hasApiKey:', hasApiKey);
  if (!apiKey) {
    console.error('[floorplan-to-3d] MELTFLEX_API_KEY missing — cannot call MeltFlex');
    return errorResponse('floorplan3d.meltflex.notConfigured', 500);
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch (cause) {
    console.error('[floorplan-to-3d] Failed to parse formData', cause);
    return errorResponse('floorplan3d.meltflex.invalidImage', 400);
  }

  const file = form.get('file');
  if (!(file instanceof File)) {
    console.warn('[floorplan-to-3d] Missing file in formData — keys:', [...form.keys()]);
    return errorResponse('floorplan3d.meltflex.missingFile', 400);
  }
  console.info('[floorplan-to-3d] Upload received — name:', file.name, 'type:', file.type, 'size:', file.size);
  if (!ALLOWED_MIMES.has(file.type) && file.type !== '') {
    console.warn('[floorplan-to-3d] Rejected unsupported mime type:', file.type);
    return errorResponse('floorplan3d.meltflex.unsupportedType', 400);
  }
  if (file.size === 0) {
    console.warn('[floorplan-to-3d] Rejected empty file — size 0');
    return errorResponse('floorplan3d.meltflex.invalidImage', 400);
  }
  if (file.size > MAX_BYTES) {
    console.warn('[floorplan-to-3d] Rejected too-large file — size:', file.size, 'max:', MAX_BYTES);
    return errorResponse('floorplan3d.meltflex.tooLarge', 413);
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const mimeType = file.type || 'image/png';
  const base64Len = buffer.toString('base64').length;
  const dataUrl = `data:${mimeType};base64,${buffer.toString('base64')}`;
  console.info('[floorplan-to-3d] Calling MeltFlex — mime:', mimeType, 'bytes:', buffer.length, 'base64Len:', base64Len, 'url:', MELTFLEX_URL);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const started = Date.now();

  let meltflexRes: Response;
  try {
    meltflexRes = await fetch(MELTFLEX_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ image: dataUrl }),
      signal: controller.signal,
    });
  } catch (cause) {
    clearTimeout(timer);
    const durationMs = Date.now() - started;
    if (cause instanceof Error && cause.name === 'AbortError') {
      console.error('[floorplan-to-3d] MeltFlex timeout after', durationMs, 'ms (limit', TIMEOUT_MS, 'ms)');
      return errorResponse('floorplan3d.meltflex.timeout', 504);
    }
    console.error('[floorplan-to-3d] MeltFlex fetch failed after', durationMs, 'ms —', cause instanceof Error ? cause.message : String(cause), cause);
    return errorResponse('floorplan3d.meltflex.serverError', 502);
  } finally {
    clearTimeout(timer);
  }

  const durationMs = Date.now() - started;
  console.info('[floorplan-to-3d] MeltFlex response — status:', meltflexRes.status, 'ok:', meltflexRes.ok, 'durationMs:', durationMs, 'content-type:', meltflexRes.headers.get('content-type'));

  if (!meltflexRes.ok) {
    const bodyText = await meltflexRes.text().catch(() => '');
    console.warn('[floorplan-to-3d] MeltFlex non-OK — status:', meltflexRes.status, 'durationMs:', durationMs, 'body:', bodyText.slice(0, 1000));
    const mapped = mapMeltFlexStatus(meltflexRes.status);
    // Avoid leaking raw body details to user; log server-side instead
    // Do not expose API keys or internal details
    return errorResponse(mapped.key, mapped.http);
  }

  let json: Record<string, unknown>;
  try {
    json = (await meltflexRes.json()) as Record<string, unknown>;
  } catch (cause) {
    console.error('[floorplan-to-3d] MeltFlex returned non-JSON after', durationMs, 'ms —', cause);
    return errorResponse('floorplan3d.meltflex.malformedResponse', 502);
  }

  console.debug('[floorplan-to-3d] MeltFlex JSON keys:', Object.keys(json), 'success:', json.success, 'hasModelUrl:', typeof json.modelUrl === 'string', 'hasModel:', typeof json.model === 'string', 'format:', json.format, 'creditsUsed:', json.creditsUsed);

  const modelUrl = typeof json.modelUrl === 'string' ? json.modelUrl : null;
  const modelBase64 = typeof json.model === 'string' ? json.model : null;
  const format = typeof json.format === 'string' ? json.format : 'glb';
  const creditsUsed = typeof json.creditsUsed === 'number' ? json.creditsUsed : null;

  const success = json.success;
  if (success === false) {
    console.warn('[floorplan-to-3d] MeltFlex success=false — body:', JSON.stringify(json).slice(0, 1000));
    return errorResponse('floorplan3d.meltflex.conversionFailed', 422);
  }

  if (!modelUrl && !modelBase64) {
    console.error('[floorplan-to-3d] MeltFlex missing modelUrl and model — keys:', Object.keys(json), 'body:', JSON.stringify(json).slice(0, 1000));
    return errorResponse('floorplan3d.meltflex.malformedResponse', 502);
  }

  console.info('[floorplan-to-3d] MeltFlex success — format:', format, 'hasModelUrl:', Boolean(modelUrl), 'modelBase64Len:', modelBase64?.length ?? 0, 'creditsUsed:', creditsUsed);

  return NextResponse.json({
    modelUrl,
    modelBase64,
    format,
    creditsUsed,
  });
}
