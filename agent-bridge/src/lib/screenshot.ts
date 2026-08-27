import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

/**
 * Minimal screenshot capability for visual verification of the Vista app.
 * Launches a headless Chromium per request, navigates to the target URL,
 * waits for the page to load, captures the requested viewport/element, and
 * always closes the browser — including on failure. The screenshot is stored
 * on disk and only its path is returned to the caller.
 */

const VIEWPORT = { width: 1440, height: 900 };
/** Extra settle time after `load` so fonts/hydration finish rendering. */
const SETTLE_MS = 750;

export interface ScreenshotRequest {
  /** Fully qualified URL or a path (e.g. `/demo`) resolved against the app URL. */
  url: string;
  /** CSS selector of an element to capture instead of the whole page. */
  selector?: string;
  /** Capture the full scrollable page instead of the viewport. */
  fullPage?: boolean;
}

export interface ScreenshotResult {
  /** Absolute path of the stored PNG file. */
  path: string;
  /** The resolved URL that was captured. */
  url: string;
  format: 'png';
  width: number;
  height: number;
  bytes: number;
}

export interface ScreenshotServiceOptions {
  /** Base URL of the Vista frontend (used as default/prefix for relative paths). */
  appUrl: string;
  /** Directory where screenshot files are stored. */
  screenshotDir: string;
  /** Timeout (ms) for navigation and element waiting. */
  timeoutMs: number;
  /** Launch Chromium headless (default true). */
  headless: boolean;
}

export interface ScreenshotService {
  capture(request: ScreenshotRequest): Promise<ScreenshotResult>;
}

export class ScreenshotNavigationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ScreenshotNavigationError';
  }
}

export class ScreenshotSelectorError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ScreenshotSelectorError';
  }
}

export class ScreenshotTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ScreenshotTimeoutError';
  }
}

/**
 * Resolves a caller-supplied URL: absolute http(s) URLs pass through,
 * relative paths are resolved against the configured app URL.
 */
export function resolveScreenshotUrl(appUrl: string, url: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  return `${appUrl}${url.startsWith('/') ? url : `/${url}`}`;
}

/** Builds a unique, timestamped filename, e.g. `vista-2026-08-27T09-15-00Z-1a2b.png`. */
export function screenshotFileName(now = new Date()): string {
  const stamp = now
    .toISOString()
    .replace(/:/g, '-')
    .replace(/\.\d{3}Z$/, 'Z');
  const random = Math.random().toString(36).slice(2, 8);
  return `vista-${stamp}-${random}.png`;
}

/** Whether a Playwright timeout indicates the navigation deadline was hit. */
function isTimeoutError(error: unknown): boolean {
  return error instanceof Error && /Timeout/.test(error.name);
}

/** Reads image dimensions from a PNG buffer (width/height in the IHDR chunk). */
export function pngDimensions(buffer: Buffer): { width: number; height: number } {
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

export function createScreenshotService(options: ScreenshotServiceOptions): ScreenshotService {
  const { appUrl, screenshotDir, timeoutMs, headless } = options;

  return {
    async capture(request): Promise<ScreenshotResult> {
      const targetUrl = resolveScreenshotUrl(appUrl, request.url);
      const fileName = screenshotFileName();
      const filePath = path.resolve(screenshotDir, fileName);

      const browser = await chromium.launch({ headless });
      try {
        await mkdir(path.dirname(filePath), { recursive: true });
        const page = await browser.newPage({
          viewport: VIEWPORT,
          deviceScaleFactor: 1,
        });

        let response: Awaited<ReturnType<typeof page.goto>>;
        try {
          response = await page.goto(targetUrl, {
            waitUntil: 'load',
            timeout: timeoutMs,
          });
        } catch (error) {
          if (isTimeoutError(error)) {
            throw new ScreenshotTimeoutError(
              `Page did not load within ${timeoutMs} ms: ${targetUrl}`,
            );
          }
          throw new ScreenshotNavigationError(
            `Failed to navigate to ${targetUrl}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
        if (!response || !response.ok()) {
          throw new ScreenshotNavigationError(
            `Page unavailable at ${targetUrl} (HTTP ${response?.status() ?? 'no response'})`,
          );
        }
        await page.waitForTimeout(SETTLE_MS);

        let buffer: Buffer;
        if (request.selector) {
          let selector: Awaited<ReturnType<typeof page.waitForSelector>>;
          try {
            selector = await page.waitForSelector(request.selector, {
              state: 'attached',
              timeout: timeoutMs,
            });
          } catch (error) {
            if (isTimeoutError(error)) {
              throw new ScreenshotSelectorError(
                `Element not found for selector "${request.selector}" within ${timeoutMs} ms`,
              );
            }
            throw error;
          }
          buffer = await selector.screenshot();
        } else {
          buffer = await page.screenshot({
            type: 'png',
            fullPage: request.fullPage === true,
          });
        }

        const { width, height } = pngDimensions(buffer);
        await writeFile(filePath, buffer);
        return {
          path: filePath,
          url: page.url(),
          format: 'png',
          width,
          height,
          bytes: buffer.byteLength,
        };
      } finally {
        await browser.close();
      }
    },
  };
}
