/**
 * Local diagnostic script to test MeltFlex API directly with base64 images.
 *
 * Usage:
 *   MELTFLEX_API_KEY=... npx tsx scripts/test-meltflex-local.ts
 *
 * Tests:
 *   1. POST https://www.meltflexai.com/api/v1/floorplan-to-3d with base64 image
 *   2. POST with imageUrl (expose-service public image endpoint)
 *   3. Validates response (modelUrl / model base64)
 *
 * Sample images: D:\repo\vista\sample\*.jpg
 */

import fs from 'node:fs/promises';
import path from 'node:path';

const MELTFLEX_API_URL = 'https://www.meltflexai.com/api/v1/floorplan-to-3d';
const TIMEOUT_MS = 180_000;
const SAMPLE_DIR = path.resolve(process.cwd(), 'sample');

interface MeltFlexResult {
  success: boolean;
  modelUrl?: string;
  format?: string;
  creditsUsed?: number;
  model?: string;
  error?: string;
}

function mapStatus(status: number, body: string): string {
  if (status === 400) return `400 bad request — invalid image: ${body.slice(0, 300)}`;
  if (status === 401) return `401 unauthorized — bad MELTFLEX_API_KEY`;
  if (status === 402) return `402 insufficient credits`;
  if (status === 429) return `429 rate limited`;
  if (status === 500) return `500 server error: ${body.slice(0, 500)}`;
  if (status === 502) return `502 bad gateway: ${body.slice(0, 500)}`;
  return `${status}: ${body.slice(0, 500)}`;
}

async function callMeltFlexWithBase64(
  apiKey: string,
  imageBuffer: Buffer,
  mimeType: string,
  label: string,
): Promise<MeltFlexResult> {
  const base64 = imageBuffer.toString('base64');
  const dataUrl = `data:${mimeType};base64,${base64}`;
  const payload = { image: dataUrl };

  console.log(`\n[base64] ${label}: ${imageBuffer.length} bytes → ${base64.length} chars`);
  console.log(`[base64] Payload size: ${JSON.stringify(payload).length} bytes`);
  console.log(`[base64] POST ${MELTFLEX_API_URL} — timeout ${TIMEOUT_MS / 1000}s`);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const started = performance.now();

  try {
    const res = await fetch(MELTFLEX_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timer);
    const durationMs = Math.round(performance.now() - started);

    console.log(`[base64] Response: status=${res.status} ok=${res.ok} duration=${durationMs}ms`);
    console.log(`[base64] Content-Type: ${res.headers.get('content-type')}`);

    if (!res.ok) {
      const bodyText = await res.text().catch(() => '');
      console.error(`[base64] ERROR: ${mapStatus(res.status, bodyText)}`);
      return { success: false, error: mapStatus(res.status, bodyText) };
    }

    const json = await res.json();
    const body = json as Record<string, unknown>;
    console.log(`[base64] Response keys: ${Object.keys(body).join(', ')}`);
    console.log(`[base64] success: ${body.success}`);
    console.log(`[base64] format: ${body.format}`);
    console.log(`[base64] creditsUsed: ${body.creditsUsed}`);

    if (typeof body.modelUrl === 'string') {
      console.log(`[base64] modelUrl: ${body.modelUrl.slice(0, 120)}...`);
    }
    if (typeof body.model === 'string') {
      console.log(`[base64] model (base64): ${body.model.length} chars`);
      // Validate GLB magic
      const glbBytes = Buffer.from(body.model, 'base64');
      const magic = glbBytes.subarray(0, 4).toString();
      console.log(`[base64] GLB magic: "${magic}" (${glbBytes.length} bytes)`);
    }

    return body as unknown as MeltFlexResult;
  } catch (err) {
    clearTimeout(timer);
    const durationMs = Math.round(performance.now() - started);
    if (err instanceof Error && err.name === 'AbortError') {
      console.error(`[base64] TIMEOUT after ${durationMs}ms (limit ${TIMEOUT_MS}ms)`);
      return { success: false, error: `timeout after ${durationMs}ms` };
    }
    console.error(`[base64] FETCH ERROR after ${durationMs}ms: ${err instanceof Error ? err.message : String(err)}`);
    return { success: false, error: `fetch failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}

async function callMeltFlexWithImageUrl(
  apiKey: string,
  imageUrl: string,
  label: string,
): Promise<MeltFlexResult> {
  const payload = { imageUrl };

  console.log(`\n[imageUrl] ${label}: ${imageUrl.slice(0, 120)}`);
  console.log(`[imageUrl] POST ${MELTFLEX_API_URL} — timeout ${TIMEOUT_MS / 1000}s`);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const started = performance.now();

  try {
    const res = await fetch(MELTFLEX_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timer);
    const durationMs = Math.round(performance.now() - started);

    console.log(`[imageUrl] Response: status=${res.status} ok=${res.ok} duration=${durationMs}ms`);
    console.log(`[imageUrl] Content-Type: ${res.headers.get('content-type')}`);

    if (!res.ok) {
      const bodyText = await res.text().catch(() => '');
      console.error(`[imageUrl] ERROR: ${mapStatus(res.status, bodyText)}`);
      return { success: false, error: mapStatus(res.status, bodyText) };
    }

    const json = await res.json();
    const body = json as Record<string, unknown>;
    console.log(`[imageUrl] Response keys: ${Object.keys(body).join(', ')}`);
    console.log(`[imageUrl] success: ${body.success}`);
    console.log(`[imageUrl] format: ${body.format}`);
    console.log(`[imageUrl] creditsUsed: ${body.creditsUsed}`);

    if (typeof body.modelUrl === 'string') {
      console.log(`[imageUrl] modelUrl: ${body.modelUrl.slice(0, 120)}...`);
    }
    if (typeof body.model === 'string') {
      console.log(`[imageUrl] model (base64): ${body.model.length} chars`);
      const glbBytes = Buffer.from(body.model, 'base64');
      const magic = glbBytes.subarray(0, 4).toString();
      console.log(`[imageUrl] GLB magic: "${magic}" (${glbBytes.length} bytes)`);
    }

    return body as unknown as MeltFlexResult;
  } catch (err) {
    clearTimeout(timer);
    const durationMs = Math.round(performance.now() - started);
    if (err instanceof Error && err.name === 'AbortError') {
      console.error(`[imageUrl] TIMEOUT after ${durationMs}ms (limit ${TIMEOUT_MS}ms)`);
      return { success: false, error: `timeout after ${durationMs}ms` };
    }
    console.error(`[imageUrl] FETCH ERROR after ${durationMs}ms: ${err instanceof Error ? err.message : String(err)}`);
    return { success: false, error: `fetch failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}

async function main() {
  const apiKey = process.env.MELTFLEX_API_KEY;
  if (!apiKey) {
    console.error('ERROR: MELTFLEX_API_KEY is not set');
    console.error('Usage: MELTFLEX_API_KEY=... npx tsx scripts/test-meltflex-local.ts');
    process.exit(1);
  }

  console.log(`API Key: ${apiKey.slice(0, 4)}... (length ${apiKey.length})`);
  console.log(`Sample directory: ${SAMPLE_DIR}`);

  // List sample files
  let files: string[];
  try {
    files = (await fs.readdir(SAMPLE_DIR)).filter((f) => /\.(jpg|jpeg|png|webp)$/i.test(f));
  } catch {
    console.error(`ERROR: Sample directory not found: ${SAMPLE_DIR}`);
    process.exit(1);
  }

  if (files.length === 0) {
    console.error('ERROR: No sample images found');
    process.exit(1);
  }

  console.log(`Found ${files.length} sample image(s): ${files.join(', ')}`);

  const results: Array<{ file: string; test: string; ok: boolean; detail: string }> = [];

  // Test 1: Base64 with first sample image
  const firstFile = files[0];
  const filePath = path.join(SAMPLE_DIR, firstFile);
  const imageBytes = await fs.readFile(filePath);
  const ext = path.extname(firstFile).toLowerCase();
  const mimeMap: Record<string, string> = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };
  const mimeType = mimeMap[ext] || 'image/jpeg';

  console.log(`\n${'='.repeat(60)}`);
  console.log(`TEST 1: Base64 image upload`);
  console.log(`${'='.repeat(60)}`);
  const base64Result = await callMeltFlexWithBase64(apiKey, imageBytes, mimeType, firstFile);
  results.push({
    file: firstFile,
    test: 'base64',
    ok: base64Result.success,
    detail: base64Result.success
      ? `modelUrl=${Boolean(base64Result.modelUrl)} format=${base64Result.format} credits=${base64Result.creditsUsed}`
      : base64Result.error ?? 'unknown error',
  });

  // Test 2: imageUrl with expose-service public endpoint (if configured)
  const publicApiUrl = process.env.PUBLIC_API_BASE_URL || process.env.EXPOSE_SERVICE_URL || '';
  if (publicApiUrl) {
    // Use a known R2 asset ID for testing
    const testAssetId = process.argv[2] || 'dfcc78f8-8f00-41ac-9d5e-4df69db94e97';
    const imageUrl = `${publicApiUrl.replace(/\/$/, '')}/api/floorplan3d/image/${testAssetId}`;

    console.log(`\n${'='.repeat(60)}`);
    console.log(`TEST 2: Public image URL (assetId=${testAssetId})`);
    console.log(`${'='.repeat(60)}`);
    const urlResult = await callMeltFlexWithImageUrl(apiKey, imageUrl, `asset=${testAssetId}`);
    results.push({
      file: testAssetId,
      test: 'imageUrl',
      ok: urlResult.success,
      detail: urlResult.success
        ? `modelUrl=${Boolean(urlResult.modelUrl)} format=${urlResult.format} credits=${urlResult.creditsUsed}`
        : urlResult.error ?? 'unknown error',
    });
  } else {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`TEST 2: SKIPPED (no PUBLIC_API_BASE_URL set)`);
    console.log(`${'='.repeat(60)}`);
    console.log('Set PUBLIC_API_BASE_URL=http://localhost:4000 and start expose-service to test imageUrl.');
  }

  // Summary
  console.log(`\n${'='.repeat(60)}`);
  console.log('SUMMARY');
  console.log(`${'='.repeat(60)}`);
  for (const r of results) {
    const status = r.ok ? '✓ PASS' : '✗ FAIL';
    console.log(`  ${status}  [${r.test}] ${r.file} — ${r.detail}`);
  }

  const failed = results.filter((r) => !r.ok);
  if (failed.length > 0) {
    console.log(`\n${failed.length} test(s) failed.`);
    process.exit(1);
  }
  console.log(`\nAll ${results.length} test(s) passed.`);
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
