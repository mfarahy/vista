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
  if (!apiKey) {
    return errorResponse('floorplan3d.meltflex.notConfigured', 500);
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return errorResponse('floorplan3d.meltflex.invalidImage', 400);
  }

  const file = form.get('file');
  if (!(file instanceof File)) {
    return errorResponse('floorplan3d.meltflex.missingFile', 400);
  }
  if (!ALLOWED_MIMES.has(file.type) && file.type !== '') {
    return errorResponse('floorplan3d.meltflex.unsupportedType', 400);
  }
  if (file.size === 0) {
    return errorResponse('floorplan3d.meltflex.invalidImage', 400);
  }
  if (file.size > MAX_BYTES) {
    return errorResponse('floorplan3d.meltflex.tooLarge', 413);
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const mimeType = file.type || 'image/png';
  const dataUrl = `data:${mimeType};base64,${buffer.toString('base64')}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

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
    if (cause instanceof Error && cause.name === 'AbortError') {
      return errorResponse('floorplan3d.meltflex.timeout', 504);
    }
    return errorResponse('floorplan3d.meltflex.serverError', 502);
  } finally {
    clearTimeout(timer);
  }

  if (!meltflexRes.ok) {
    const _body = await meltflexRes.text().catch(() => '');
    void _body;
    const mapped = mapMeltFlexStatus(meltflexRes.status);
    // Avoid leaking raw body details to user; log server-side instead
    // Do not expose API keys or internal details
    return errorResponse(mapped.key, mapped.http);
  }

  let json: Record<string, unknown>;
  try {
    json = (await meltflexRes.json()) as Record<string, unknown>;
  } catch {
    return errorResponse('floorplan3d.meltflex.malformedResponse', 502);
  }

  const modelUrl = typeof json.modelUrl === 'string' ? json.modelUrl : null;
  const modelBase64 = typeof json.model === 'string' ? json.model : null;
  const format = typeof json.format === 'string' ? json.format : 'glb';
  const creditsUsed = typeof json.creditsUsed === 'number' ? json.creditsUsed : null;

  const success = json.success;
  if (success === false) {
    return errorResponse('floorplan3d.meltflex.conversionFailed', 422);
  }

  if (!modelUrl && !modelBase64) {
    return errorResponse('floorplan3d.meltflex.malformedResponse', 502);
  }

  return NextResponse.json({
    modelUrl,
    modelBase64,
    format,
    creditsUsed,
  });
}
