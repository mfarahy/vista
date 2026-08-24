import { chromium } from 'playwright';
import type { Property } from '../lib/types.js';
import { getLogger } from '../lib/logger.js';

/**
 * Phase 5B PDF export. The generated PDF is the Exposé the user sees in the
 * Builder: the React `ModernExposeTemplate` rendered by the frontend print
 * route `/expose/print/:id`, printed to A4 by Chromium. This service never
 * re-implements the Exposé layout — it only navigates Chromium to the known
 * internal print route and waits until the page signals that data, fonts, and
 * images are ready (`window.__EXPOSE_READY__`).
 *
 * The browser is launched per generation and always closed, even on failure.
 */

const DEFAULT_FRONTEND_URL = 'http://localhost:3000';
const PRINT_ROUTE = '/expose/print';
const NAVIGATION_TIMEOUT_MS = 60_000;
const READY_TIMEOUT_MS = 60_000;

/** Base URL of the Next.js app that hosts the print route. */
export function frontendBaseUrl(): string {
  return (process.env.FRONTEND_URL || DEFAULT_FRONTEND_URL).replace(/\/+$/, '');
}

/**
 * Builds the internal print route URL for a property id. The PDF renderer
 * only ever opens this known route — arbitrary external URLs are never
 * accepted as input.
 */
export function printRouteUrl(propertyId: string): string {
  return `${frontendBaseUrl()}${PRINT_ROUTE}/${encodeURIComponent(propertyId)}`;
}

/**
 * Sanitizes a PDF base name (without extension) so user-controlled property
 * data can never break header values or be mistaken for a filesystem path.
 * German characters are preserved for the download filename.
 */
export function sanitizePdfBaseName(value: string): string {
  const cleaned = value
    .replace(/[^\p{L}\p{N}-]+/gu, '_')
    .replace(/_+/g, '_')
    .replace(/-{2,}/g, '-')
    .replace(/^[_-\s]+|[_-\s]+$/g, '')
    .slice(0, 120);
  return cleaned || 'Expose';
}

const GERMAN_ASCII: Record<string, string> = {
  ä: 'ae',
  ö: 'oe',
  ü: 'ue',
  Ä: 'Ae',
  Ö: 'Oe',
  Ü: 'Ue',
  ß: 'ss',
};

/**
 * Content-Disposition header value for the PDF download. Non-ASCII names
 * (e.g. "Expose_Weserstraße_42.pdf") are transmitted via the RFC 5987
 * `filename*` parameter with an ASCII fallback so every client receives the
 * intended name without mangled characters.
 */
export function contentDispositionHeader(fileName: string): string {
  const asciiFallback = fileName.replace(/[^\x20-\x7E]/g, (char) => {
    const mapped = GERMAN_ASCII[char];
    return mapped ?? '_';
  });
  if (asciiFallback === fileName) return `attachment; filename="${fileName}"`;
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

/**
 * Download filename for a property's Exposé PDF, e.g.
 * `Expose_Weserstraße_42.pdf`. Built from property data only; falls back to
 * the property id when no address exists.
 */
export function pdfFileName(property: Property): string {
  const address = property.exposeData?.location.address;
  const street = address?.street ?? property.address ?? '';
  const houseNumber = address?.houseNumber ?? '';
  const base = [street, houseNumber].filter(Boolean).join(' ').trim();
  return `${sanitizePdfBaseName(base ? `Expose_${base}` : `Expose_${property.id}`)}.pdf`;
}

/** Renders the property's Exposé to an A4 PDF via the frontend print route. */
export async function renderExposePdf(propertyId: string): Promise<Buffer> {
  const log = getLogger();
  const route = printRouteUrl(propertyId);
  const started = performance.now();
  log.info({ propertyId, route }, 'PDF generation started for property {propertyId}');

  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({
      viewport: { width: 794, height: 1123 },
      deviceScaleFactor: 1,
    });
    const response = await page.goto(route, {
      waitUntil: 'domcontentloaded',
      timeout: NAVIGATION_TIMEOUT_MS,
    });
    if (!response?.ok()) {
      throw new Error(`Print route unavailable (HTTP ${response?.status() ?? 'no response'})`);
    }
    await page.waitForFunction(
      () => (globalThis as { __EXPOSE_READY__?: boolean }).__EXPOSE_READY__ === true,
      { timeout: READY_TIMEOUT_MS },
    );
    const footerTemplate = await page.evaluate(() => {
      const host = globalThis as { __EXPOSE_FOOTER_HTML__?: unknown };
      return typeof host.__EXPOSE_FOOTER_HTML__ === 'string' ? host.__EXPOSE_FOOTER_HTML__ : '';
    });
    const pdf = await page.pdf(exposePdfSettings(footerTemplate));
    const durationMs = Math.round(performance.now() - started);
    log.info(
      { propertyId, route, durationMs, bytes: pdf.byteLength },
      'PDF generation completed for property {propertyId} after {durationMs} ms',
    );
    return Buffer.from(pdf);
  } catch (error) {
    const durationMs = Math.round(performance.now() - started);
    log.error(
      { err: error, propertyId, route, durationMs },
      'PDF generation failed for property {propertyId} after {durationMs} ms',
    );
    throw error;
  } finally {
    await browser.close();
  }
}

export type ExposePdfSettings = {
  format: 'A4';
  printBackground: boolean;
  preferCSSPageSize: boolean;
  displayHeaderFooter: boolean;
  headerTemplate: string;
  footerTemplate: string | undefined;
};

/**
 * PDF options for the Exposé. The per-page footer template is rendered by the
 * frontend print route (localized Makler identity, Vista branding, page
 * indicator) and drawn by Chromium into the CSS bottom page margin of every
 * page; the `pageNumber`/`totalPages` placeholders resolve to the actual
 * final page count. Without a template (older frontend), the footer is
 * disabled and the output stays identical to the plain A4 export.
 */
export function exposePdfSettings(footerTemplate: string): ExposePdfSettings {
  const hasFooter = footerTemplate.trim().length > 0;
  return {
    format: 'A4',
    printBackground: true,
    preferCSSPageSize: true,
    displayHeaderFooter: hasFooter,
    headerTemplate: '<span></span>',
    footerTemplate: hasFooter ? footerTemplate : undefined,
  };
}

export type RenderPdfFunction = (propertyId: string) => Promise<Buffer>;
