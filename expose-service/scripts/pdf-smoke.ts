import dotenv from 'dotenv';
dotenv.config();

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

/**
 * Manual PDF integration smoke test (Phase 5B).
 *
 * Requires:
 * - the expose-service running at API_BASE_URL (default http://localhost:4000)
 * - the frontend running at FRONTEND_URL (default http://localhost:3000)
 * - Playwright Chromium installed (`npx playwright install chromium`)
 *
 * It creates a demo property through the API, generates a real PDF through the
 * same endpoint the Builder uses, verifies the response, and writes the PDF to
 * the system temp directory. Run: `npm run pdf:smoke`.
 */

const apiBaseUrl = (process.env.API_BASE_URL || 'http://localhost:4000').replace(/\/+$/, '');
const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/+$/, '');

async function main(): Promise<void> {
  console.log(`Using API ${apiBaseUrl} and frontend ${frontendUrl}`);

  const demoResponse = await fetch(`${apiBaseUrl}/api/demo`, { method: 'POST' });
  if (!demoResponse.ok) {
    throw new Error(
      `Could not create the demo property (HTTP ${demoResponse.status}). Is the expose-service running on ${apiBaseUrl}?`,
    );
  }
  const { id } = (await demoResponse.json()) as { id: string };
  console.log(`Created demo property ${id}`);

  const started = Date.now();
  const response = await fetch(`${apiBaseUrl}/api/properties/${id}/pdf`, { method: 'POST' });
  const durationMs = Date.now() - started;
  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `PDF generation failed (HTTP ${response.status}): ${body}. Is the frontend running on ${frontendUrl} with the print route?`,
    );
  }

  const contentType = response.headers.get('content-type') ?? '';
  const disposition = response.headers.get('content-disposition') ?? '';
  const pdf = Buffer.from(await response.arrayBuffer());

  if (!contentType.startsWith('application/pdf')) {
    throw new Error(`Unexpected content type: ${contentType}`);
  }
  if (pdf.subarray(0, 4).toString('ascii') !== '%PDF') {
    throw new Error('Response body is not a PDF');
  }
  if (pdf.length < 10_000) {
    throw new Error(`PDF looks too small (${pdf.length} bytes)`);
  }

  const outDir = path.join(os.tmpdir(), 'vista-pdf-smoke');
  await fs.mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, `expose-${id}.pdf`);
  await fs.writeFile(outPath, pdf);

  console.log(`PDF OK: ${pdf.length} bytes in ${durationMs} ms (${contentType})`);
  console.log(`Content-Disposition: ${disposition}`);
  console.log(`Saved to ${outPath}`);
}

main().catch((error) => {
  console.error(`PDF smoke test failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
