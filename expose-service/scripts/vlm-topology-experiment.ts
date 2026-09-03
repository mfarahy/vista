/**
 * VLM → architectural topology contract experiment (reproducer).
 *
 * Loads the fixture (original image + RAW recognition JSON), renders the
 * annotated recognition image, calls the VLM with the topology-contract
 * prompt/schema, validates every ID against the RAW JSON, and writes the
 * result.
 *
 * Requires: OPENAI_API_KEY (and optionally OPENAI_MODEL / OPENAI_BASE_URL).
 * Usage (from expose-service/): OPENAI_API_KEY=... npx tsx scripts/vlm-topology-experiment.ts [outPath]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import OpenAI from 'openai';
import { zodResponseFormat } from 'openai/helpers/zod';
import { chromium } from 'playwright';
import { VLM_SYSTEM_PROMPT, buildVlmUserMessage } from '../src/lib/vlm-floorplan/prompt.js';
import { vlmFloorplanAnalysisSchema, validateVlmAnalysis } from '../src/lib/vlm-floorplan/schema.js';
import { buildPrimitiveIdSet, extractVlmPrimitives } from '../src/lib/vlm-floorplan/geometry-primitives.js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');
const FIXTURE_IMAGE = resolve(repoRoot, 'frontend', 'public', 'c658e915-9247-4904-8032-717dd11ecfdd.jpg');
const FIXTURE_RAW = resolve(repoRoot, 'frontend', 'public', 'recognition-c658e915-9247-4904-8032-717dd11ecfdd.json');
const DEFAULT_OUT = resolve(repoRoot, 'docs', 'vlm-grounding-experiment', 'after-topology-contract.json');
const ANNOTATED_TMP = resolve(repoRoot, 'docs', 'vlm-grounding-experiment', 'annotated-topology-contract.png');

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  console.error('OPENAI_API_KEY is required');
  process.exit(1);
}
const model = process.env.VLM_MODEL || process.env.OPENAI_MODEL || 'gpt-4o-mini';
const outPath = process.argv[2] ?? DEFAULT_OUT;

// ---- Render the annotated recognition image (same primitives as the frontend renderer) ----
async function renderAnnotated(imagePath, raw): Promise<Buffer> {
  const browser = await chromium.launch();
  try {
    const imgB64 = readFileSync(imagePath).toString('base64');
    const page = await browser.newPage();
    await page.setContent(`<img id="bg" src="data:image/jpeg;base64,${imgB64}">`);
    const { w: W, h: H } = await page.evaluate(() => {
      const img = document.getElementById('bg') as HTMLImageElement;
      return { w: img.naturalWidth, h: img.naturalHeight };
    });
    const COLORS = { wall: '#e53935', door: '#1e88e5', entry_door: '#8e24aa', window: '#00acc1', kitchen: '#fb8c00' };
    const LABEL_COLORS = { wall: '#b71c1c', door: '#0d47a1', entry_door: '#4a148c', window: '#006064', kitchen: '#e65100' };
    const ALPHA = { wall: 0.28, door: 0.3, entry_door: 0.32, window: 0.3, kitchen: 0.26 };
    const STROKE = { wall: 2.5, door: 2, entry_door: 2.2, window: 2, kitchen: 2 };
    const rgba = (hex: string, a: number) => {
      const h = hex.replace('#', '');
      return `rgba(${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)},${a})`;
    };
    const poly = (p: number[][], c: string, a: number, sw: number, dash?: number[]) =>
      `<polygon points="${p.map(([x, y]) => `${x},${y}`).join(' ')}" fill="${rgba(c, a)}" stroke="${c}" stroke-width="${sw}"${dash ? ` stroke-dasharray="${dash.join(' ')}"` : ''}/>`;
    const centroid = (p: number[][]) => {
      let x = 0, y = 0;
      for (const [px, py] of p) { x += px; y += py; }
      return { x: x / p.length, y: y / p.length };
    };
    const parts = [`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`];
    parts.push(`<image href="data:image/jpeg;base64,${imgB64}" width="${W}" height="${H}"/>`);
    for (const p of raw.wall) parts.push(poly(p, COLORS.wall, ALPHA.wall, STROKE.wall));
    for (const p of raw.door) parts.push(poly(p, COLORS.door, ALPHA.door, STROKE.door));
    for (const p of raw.entry_door) parts.push(poly(p, COLORS.entry_door, ALPHA.entry_door, STROKE.entry_door));
    for (const p of raw.window) parts.push(poly(p, COLORS.window, ALPHA.window, STROKE.window));
    for (const p of raw.kitchen) parts.push(poly(p, COLORS.kitchen, ALPHA.kitchen, STROKE.kitchen, [6, 4]));
    const cats = [
      { key: 'wall', prefix: 'wall', size: Math.max(9, Math.round(W / 120)) },
      { key: 'door', prefix: 'door', size: 9 },
      { key: 'entry_door', prefix: 'entry_door', size: 9 },
      { key: 'window', prefix: 'window', size: 8 },
      { key: 'kitchen', prefix: 'kitchen', size: 10 },
    ];
    for (const cat of cats) {
      (raw[cat.key] ?? []).forEach((p: number[][], i: number) => {
        if (!p?.length) return;
        const c = centroid(p);
        parts.push(`<text x="${c.x}" y="${c.y}" font-size="${cat.size}" fill="${LABEL_COLORS[cat.key]}" text-anchor="middle" dominant-baseline="middle" font-weight="600" stroke="#fff" stroke-width="3" stroke-linejoin="round" paint-order="stroke">${cat.prefix}-${i}</text>`);
      });
    }
    parts.push('</svg>');
    await page.setViewportSize({ width: W, height: H });
    await page.setContent(`<body style="margin:0"><div style="width:${W}px;height:${H}px">${parts.join('')}</div></body>`, { waitUntil: 'load' });
    await page.waitForTimeout(200);
    await page.screenshot({ path: ANNOTATED_TMP, clip: { x: 0, y: 0, width: W, height: H } });
    return readFileSync(ANNOTATED_TMP);
  } finally {
    await browser.close();
  }
}

// ---- Run ----
const raw = JSON.parse(readFileSync(FIXTURE_RAW, 'utf8'));
const imageBuffer = readFileSync(FIXTURE_IMAGE);
const annotatedBuffer = await renderAnnotated(FIXTURE_IMAGE, raw);
const primitives = extractVlmPrimitives(raw);
const primitiveIds = buildPrimitiveIdSet(primitives);
console.log(`primitives=${primitives.length} (${primitives.map((p) => p.primitiveId).join(', ')})`);

const client = new OpenAI({ apiKey, baseURL: process.env.OPENAI_BASE_URL || undefined });
const started = Date.now();
const completion = await client.chat.completions.parse({
  model,
  response_format: zodResponseFormat(vlmFloorplanAnalysisSchema, 'vlm_floorplan_analysis'),
  messages: [
    { role: 'system', content: VLM_SYSTEM_PROMPT },
    {
      role: 'user',
      content: buildVlmUserMessage({
        imageBuffer,
        mimeType: 'image/jpeg',
        raw,
        annotatedImageBuffer: annotatedBuffer,
        annotatedMimeType: 'image/png',
        primitives,
      }) as never,
    },
  ],
});
const durationMs = Date.now() - started;

const parsed = completion.choices[0]?.message.parsed;
if (!parsed) {
  console.error('No structured result:', (completion.choices[0]?.message.content ?? '').slice(0, 2000));
  process.exit(1);
}
const validated = vlmFloorplanAnalysisSchema.parse(parsed);
const { analysis, warnings } = validateVlmAnalysis(validated, raw, primitiveIds);

writeFileSync(outPath, JSON.stringify({ model, durationMs, usage: completion.usage, warnings, analysis }, null, 2));
console.log(`annotated: ${ANNOTATED_TMP}`);
console.log(`result: ${outPath}`);
console.log(`warnings=${warnings.length} wallRelationships=${analysis.wallRelationships.length} openings=${analysis.openings.length} objectClassifications=${analysis.objectClassifications.length} rooms=${analysis.rooms.length} geometryRelationships=${analysis.geometryRelationships.length}`);
console.log(`summary: continuousWalls=${analysis.topologySummary.continuousWalls.length} corners=${analysis.topologySummary.corners.length} tJunctions=${analysis.topologySummary.tJunctions.length} falsePositives=${analysis.topologySummary.falsePositives.length}`);
