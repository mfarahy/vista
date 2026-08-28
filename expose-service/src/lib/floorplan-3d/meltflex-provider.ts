import { getLogger, trackExternalCall } from '../logger.js';
import type { FloorPlan3DInput, FloorPlan3DProvider } from './types.js';
import type { FloorPlan3DModel } from './schema.js';

/** MeltFlex API endpoint for floor-plan-to-3D conversion. */
export const MELTFLEX_API_URL = 'https://www.meltflexai.com/api/v1/floorplan-to-3d';

/** How long to wait for MeltFlex before treating it as a timeout. Takes up to several minutes. */
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
  opts: { apiKey: string; timeoutMs?: number; fetchImpl?: typeof fetch } = {
    apiKey: process.env.MELTFLEX_API_KEY ?? '',
  },
): Promise<MeltFlexSuccessResponse> {
  const apiKey = opts.apiKey;
  if (!apiKey) {
    throw new MeltFlexError(401, 'unauthorized', 'MELTFLEX_API_KEY is not configured');
  }

  const timeoutMs = opts.timeoutMs ?? MELTFLEX_TIMEOUT_MS;
  const fetchImpl = opts.fetchImpl ?? fetch;

  const dataUrl = `data:${mimeType || 'image/png'};base64,${imageBuffer.toString('base64')}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await trackExternalCall(
      { service: 'meltflex', operation: 'floorplan-to-3d', method: 'POST', path: '/api/v1/floorplan-to-3d' },
      () =>
        fetchImpl(MELTFLEX_API_URL, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ image: dataUrl }),
          signal: controller.signal,
        }),
    );
  } catch (cause) {
    clearTimeout(timer);
    if (cause instanceof Error && cause.name === 'AbortError') {
      throw new MeltFlexError(504, 'timeout', 'MeltFlex request timed out');
    }
    // Include original cause for unreachable
    throw new MeltFlexError(502, 'unreachable', `MeltFlex service unreachable: ${cause instanceof Error ? cause.message : String(cause)}`);
  } finally {
    clearTimeout(timer);
  }

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
  // MeltFlex returns success, modelUrl or model fallback
  if (body.success !== true && body.success !== undefined) {
    // If success is explicitly false, treat as failure
    const msg = typeof body.error === 'string' ? body.error : JSON.stringify(body).slice(0, 500);
    throw new MeltFlexError(422, 'conversion-failed', `MeltFlex conversion failed: ${msg}`);
  }

  const modelUrl = typeof body.modelUrl === 'string' ? body.modelUrl : undefined;
  const modelBase64 = typeof body.model === 'string' ? body.model : undefined;
  const format = typeof body.format === 'string' ? body.format : 'glb';

  if (!modelUrl && !modelBase64) {
    throw new MeltFlexError(502, 'malformed-response', 'MeltFlex response missing modelUrl and fallback model');
  }

  if (format !== 'glb') {
    getLogger().warn({ format }, 'MeltFlex returned unexpected format, expected glb');
  }

  return {
    success: true,
    modelUrl,
    format,
    creditsUsed: typeof body.creditsUsed === 'number' ? body.creditsUsed : undefined,
    model: modelBase64,
  };
}

/**
 * MeltFlex-backed floor plan 3D provider. Delegates the heavy lifting to MeltFlex
 * and stores the GLB result in the extended FloorPlan3DRecord fields.
 *
 * The FloorPlan3DProvider interface historically returns a JSON model; for MeltFlex
 * the GLB is the true artefact. We keep the provider interface compatible by
 * returning a minimal FloorPlan3DModel placeholder and persisting the GLB URL/base64
 * on the record via the service's extended fields. A dummy model is not ideal but
 * keeps the existing service flow intact without a breaking change.
 * For new code, prefer calling `callMeltFlex` directly and handling the GLB result.
 */
export class MeltFlexFloorPlan3DProvider implements FloorPlan3DProvider {
  readonly name = 'meltflex';

  async generate(input: FloorPlan3DInput): Promise<FloorPlan3DModel> {
    const result = await callMeltFlex(input.imageBuffer, input.mimeType);
    // Store GLB artefacts in a module-level cache so the service can retrieve them
    // after generate resolves (see service.ts). This avoids changing the provider interface.
    lastMeltFlexResult = result;
    // Return a minimal valid model as placeholder — the GLB is the real output
    return {
      unit: 'm',
      rooms: [{ id: 'meltflex-room', name: 'Room', level: 0, x: 0, y: 0, width: 5, depth: 5, height: 2.5, areaM2: 25 }],
      walls: [],
      doors: [],
      windows: [],
    };
  }

  /** Returns the last MeltFlex result for the current generate call. */
  static consumeLastResult(): MeltFlexSuccessResponse | null {
    const result = lastMeltFlexResult;
    lastMeltFlexResult = null;
    return result;
  }
}

let lastMeltFlexResult: MeltFlexSuccessResponse | null = null;

export function getMeltFlexResult(): MeltFlexSuccessResponse | null {
  return lastMeltFlexResult;
}

export function consumeMeltFlexResult(): MeltFlexSuccessResponse | null {
  const r = lastMeltFlexResult;
  lastMeltFlexResult = null;
  return r;
}
