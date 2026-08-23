import dotenv from 'dotenv';
dotenv.config();

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

/**
 * Manual PDF integration smoke test (Phase 5B, extended in Phase 11).
 *
 * Requires:
 * - the expose-service running at API_BASE_URL (default http://localhost:4000)
 * - the frontend running at FRONTEND_URL (default http://localhost:3000)
 * - Playwright Chromium installed (`npx playwright install chromium`)
 *
 * It creates a demo property through the API, renders a real PDF for each
 * Exposé template (modern, classic, elegant) through the same endpoint the
 * Builder uses, verifies the response and the print route, and writes the
 * PDFs to the system temp directory. Run: `npm run pdf:smoke`.
 */

const apiBaseUrl = (process.env.API_BASE_URL || 'http://localhost:4000').replace(/\/+$/, '');
const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/+$/, '');

const TEMPLATES = ['modern', 'classic', 'elegant'] as const;

/** Counts rendered pages from the PDF structure (excludes the page tree). */
function pdfPageCount(pdf: Buffer): number {
  const source = pdf.toString('latin1');
  return (source.match(/\/Type\s*\/Page\b(?!s)/g) || []).length;
}

/** Extracts the first MediaBox to verify the page format is A4 portrait. */
function pdfMediaBox(pdf: Buffer): { width: number; height: number } | null {
  const match = pdf
    .toString('latin1')
    .match(/\/MediaBox\s*\[\s*[\d.]+\s+[\d.]+\s+([\d.]+)\s+([\d.]+)\s*\]/);
  if (!match) return null;
  return { width: Number(match[1]), height: Number(match[2]) };
}

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

  // Read the demo configuration once; each template test only switches the
  // template field so sections, content and media stay untouched.
  const configurationResponse = await fetch(
    `${apiBaseUrl}/api/properties/${id}/expose/configuration`,
  );
  if (!configurationResponse.ok) {
    throw new Error(
      `Could not read the demo configuration (HTTP ${configurationResponse.status}).`,
    );
  }
  const baseConfiguration = (await configurationResponse.json()) as Record<string, unknown>;

  const outDir = path.join(os.tmpdir(), 'vista-pdf-smoke');
  await fs.mkdir(outDir, { recursive: true });

  for (const template of TEMPLATES) {
    console.log(`\n--- Template: ${template} ---`);

    const saveResponse = await fetch(`${apiBaseUrl}/api/properties/${id}/expose/configuration`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...baseConfiguration, template }),
    });
    if (!saveResponse.ok) {
      throw new Error(`Could not select the ${template} template (HTTP ${saveResponse.status}).`);
    }

    const printResponse = await fetch(`${frontendUrl}/expose/print/${id}`);
    if (!printResponse.ok) {
      throw new Error(
        `Print route unavailable (HTTP ${printResponse.status}). Is the frontend running on ${frontendUrl}?`,
      );
    }
    const html = await printResponse.text();
    if (!html.includes(`data-template="${template}"`)) {
      throw new Error(`The print route does not render the ${template} template.`);
    }
    if (!html.includes('Gepflegte Eigentumswohnung mit Balkon und Weitblick')) {
      throw new Error('The expected property title does not appear in the print route.');
    }

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

    const pages = pdfPageCount(pdf);
    if (pages < 2) {
      throw new Error(`Expected a multi-page Exposé, found ${pages} page(s)`);
    }
    const mediaBox = pdfMediaBox(pdf);
    if (!mediaBox || Math.abs(mediaBox.width - 595.28) > 3 || Math.abs(mediaBox.height - 841.89) > 3) {
      throw new Error(
        `Expected an A4 portrait MediaBox (595.28 x 841.89 pt), found ${mediaBox ? `${mediaBox.width} x ${mediaBox.height}` : 'none'}`,
      );
    }

    const outPath = path.join(outDir, `expose-${template}-${id}.pdf`);
    await fs.writeFile(outPath, pdf);

    console.log(
      `PDF OK (${template}): ${pages} A4 pages, ${pdf.length} bytes in ${durationMs} ms (${contentType})`,
    );
    console.log(`Content-Disposition: ${disposition}`);
    console.log(`Saved to ${outPath}`);
  }

  console.log('\nPDF smoke test passed for all templates: modern, classic, elegant');
}

main().catch((error) => {
  console.error(`PDF smoke test failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});