/**
 * Optional OpenAI VLM refinement stage for the local Raster2Seq service.
 *
 * Mirrors the previous GPU prototype (`POST /predict?refine=vlm`): the local GPU
 * draft (`spaces[]` in 0-256 model-input space) plus the original floorplan
 * image are sent to a vision-capable chat model, which returns corrected
 * room types and cleaned polygons as `refined_spaces[]` — the shape
 * `expose-service` already consumes (`RasterPredictResponse`).
 *
 * This is wrapper code (not upstream Raster2Seq — upstream's own
 * `vlm_refinement/` scripts are Gemini-CLI batch jobs, see README).
 * The API key lives server-side only and is never logged or returned.
 */

const ROOM_TYPES = [
  'Outdoor',
  'Kitchen',
  'Living Room',
  'Bed Room',
  'Bath',
  'Entry',
  'Storage',
  'Garage',
  'Undefined',
  'Window',
  'Door',
];

function vlmError(code, message) {
  return Object.assign(new Error(message), { code });
}

function isFinitePoint(p) {
  return (
    Array.isArray(p) &&
    p.length >= 2 &&
    Number.isFinite(Number(p[0])) &&
    Number.isFinite(Number(p[1]))
  );
}

function cleanPolygon(polygon) {
  if (!Array.isArray(polygon)) return null;
  const pts = [];
  for (const p of polygon) {
    if (!isFinitePoint(p)) return null;
    const x = Math.min(256, Math.max(0, Number(p[0])));
    const y = Math.min(256, Math.max(0, Number(p[1])));
    pts.push([Math.round(x * 10) / 10, Math.round(y * 10) / 10]);
  }
  return pts.length >= 2 ? pts : null;
}

/** Shoelace area in model-input px^2 (no real-world scale is known). */
export function polygonArea(polygon) {
  let area = 0;
  for (let i = 0; i < polygon.length; i++) {
    const [x1, y1] = polygon[i];
    const [x2, y2] = polygon[(i + 1) % polygon.length];
    area += x1 * y2 - x2 * y1;
  }
  return Math.round((Math.abs(area) / 2) * 10) / 10;
}

function buildPrompt(draft) {
  const rooms = draft.spaces.map((s) => ({
    id: s.id,
    draft_label: s.label,
    category_id: s.category_id,
    polygon: s.polygon,
  }));
  return [
    'You are an architectural geometry refiner. You receive a raster floorplan',
    'image plus a draft room detection (JSON) in a 0-256 coordinate space.',
    'For each draft space: correct the room_type (keep window/door line',
    'segments as Window/Door), clean the polygon vertices (same 0-256 space,',
    'no duplicate consecutive points, at least 2 points), keep the draft id,',
    'and list adjacent space ids in graph (empty array when unsure).',
    `Allowed room_type values: ${ROOM_TYPES.join(', ')}.`,
    'Reply with a single JSON object, no prose: {"spaces": [{"id": 0,',
    '"room_type": "Living Room", "polygon": [[x, y], ...], "graph": []}]}.',
    `Draft JSON: ${JSON.stringify({ room_count: draft.room_count, spaces: rooms })}`,
  ].join(' ');
}

/**
 * Deterministic mock refinement (no API key needed): promotes the draft
 * spaces to the refined schema with shoelace areas. Used for RASTER2SEQ_MOCK
 * and contract tests.
 */
export function mockRefine(draft, vlmModel = 'mock') {
  const refined = [];
  let totalArea = 0;
  for (const s of draft.spaces ?? []) {
    const polygon = cleanPolygon(s.polygon);
    if (typeof s.id !== 'number' || !polygon) continue;
    const area = polygonArea(polygon);
    totalArea += area;
    refined.push({
      id: String(s.id),
      room_type: typeof s.label === 'string' && s.label ? s.label : 'Undefined',
      area,
      polygon,
      graph: [],
    });
  }
  return {
    refined_spaces: refined,
    refined_room_count: refined.length,
    refined_total_area: Math.round(totalArea * 10) / 10,
    vlm_model: vlmModel,
    refine_ms: 0,
  };
}

function normalizeRefined(json, draft) {
  if (!json || !Array.isArray(json.spaces)) {
    throw vlmError('VLM_MALFORMED', 'model returned no spaces array');
  }
  const draftIds = new Set((draft.spaces ?? []).map((s) => s.id));
  const refined = [];
  let totalArea = 0;
  json.spaces.forEach((s, index) => {
    const id = typeof s?.id === 'number' ? s.id : index;
    if (!draftIds.has(id)) return;
    const polygon = cleanPolygon(s?.polygon);
    const roomType = typeof s?.room_type === 'string' && s.room_type.trim() ? s.room_type.trim().slice(0, 64) : 'Undefined';
    if (!polygon) return;
    const area = polygonArea(polygon);
    totalArea += area;
    refined.push({
      id: String(id),
      room_type: roomType,
      area,
      polygon,
      graph: Array.isArray(s?.graph) ? s.graph.filter((g) => typeof g === 'string').slice(0, 32) : [],
    });
  });
  if (refined.length === 0) {
    throw vlmError('VLM_MALFORMED', 'model returned no usable spaces');
  }
  return {
    refined_spaces: refined,
    refined_room_count: refined.length,
    refined_total_area: Math.round(totalArea * 10) / 10,
  };
}

/**
 * Runs the OpenAI refinement. Throws coded errors:
 * VLM_NOT_CONFIGURED (no key), VLM_TIMEOUT, VLM_FAILED (HTTP/API), VLM_MALFORMED.
 */
export async function refineFloorplan({ imageBuffer, mimeType, draft, requestId, log }) {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  const model = process.env.OPENAI_MODEL?.trim() || 'gpt-4o';
  const baseUrl = (process.env.OPENAI_BASE_URL?.trim() || 'https://api.openai.com/v1').replace(/\/+$/, '');
  const timeoutMs = Number(process.env.REFINE_TIMEOUT_MS ?? 180_000);
  if (!apiKey) {
    throw vlmError('VLM_NOT_CONFIGURED', 'OPENAI_API_KEY is not set');
  }

  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  // Some newer models (e.g. gpt-5.x) only accept the default temperature,
  // so temperature is sent only when REFINE_TEMPERATURE is set explicitly.
  const rawTemperature = process.env.REFINE_TEMPERATURE?.trim();
  const temperature = rawTemperature === undefined || rawTemperature === '' ? undefined : Number(rawTemperature);
  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        ...(temperature === undefined || Number.isNaN(temperature) ? {} : { temperature }),
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: buildPrompt(draft) },
              {
                type: 'image_url',
                image_url: { url: `data:${mimeType};base64,${imageBuffer.toString('base64')}` },
              },
            ],
          },
        ],
      }),
    });
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      log?.('error', 'VLM refinement non-OK', { requestId, httpStatus: response.status, body: body.slice(0, 200) });
      throw vlmError('VLM_FAILED', `refinement failed with status ${response.status}`);
    }
    const payload = await response.json().catch(() => null);
    const content = payload?.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || !content) {
      throw vlmError('VLM_MALFORMED', 'model returned an empty response');
    }
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      throw vlmError('VLM_MALFORMED', 'model returned non-JSON content');
    }
    const usage = payload?.usage;
    const normalized = normalizeRefined(parsed, draft);
    const refineMs = Date.now() - started;
    log?.('log', 'VLM refinement completed', {
      requestId,
      vlmModel: model,
      refinedRoomCount: normalized.refined_room_count,
      refineMs,
      promptTokens: usage?.prompt_tokens,
      completionTokens: usage?.completion_tokens,
    });
    return { ...normalized, vlm_model: model, refine_ms: refineMs };
  } catch (err) {
    if (err?.name === 'AbortError') {
      log?.('error', 'VLM refinement timed out', { requestId, timeoutMs });
      throw vlmError('VLM_TIMEOUT', 'refinement timed out');
    }
    if (err?.code?.startsWith('VLM_')) throw err;
    log?.('error', 'VLM refinement failed', { requestId, detail: String(err?.message ?? err).slice(0, 200) });
    throw vlmError('VLM_FAILED', 'refinement failed');
  } finally {
    clearTimeout(timer);
  }
}
