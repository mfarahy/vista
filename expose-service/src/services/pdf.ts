import { chromium } from 'playwright';
import { exposeHTML } from '../lib/expose-template.js';
import type { Property, StoredExposeContent } from '../lib/types.js';

/** Renders the stored expose content as a printable A4 PDF via Playwright/Chromium. */
export async function renderExposePdf(
  property: Property,
  content: StoredExposeContent,
): Promise<Buffer> {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({
      viewport: { width: 794, height: 1123 },
      deviceScaleFactor: 1,
    });
    await page.setContent(await exposeHTML(property, content), { waitUntil: 'networkidle' });
    return await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
    });
  } finally {
    await browser.close();
  }
}
