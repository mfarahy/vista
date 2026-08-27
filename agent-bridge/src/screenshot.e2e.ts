import assert from 'node:assert/strict';
import { mkdtemp, readFile, stat, rm } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import express from 'express';

process.env.LOG_LEVEL = 'silent';
import type { ScreenshotService } from './lib/screenshot.js';
const { errorHandler } = await import('./lib/http.js');
const { createScreenshotService } = await import('./lib/screenshot.js');
const { screenshotsRouter } = await import('./routes/screenshots.js');

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const PAGE_HTML = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <title>Vista bridge e2e</title>
    <style>
      body { margin: 0; font-family: sans-serif; }
      #brand { width: 320px; height: 120px; background: #1a3f7a; color: #fff; font-size: 24px; }
      .tall { height: 2600px; background: linear-gradient(#fff, #ddd); }
    </style>
  </head>
  <body>
    <div id="brand">Vista Agent Bridge</div>
    <h1>Hello Vista</h1>
    <div class="tall"></div>
  </body>
</html>`;

/**
 * End-to-end proof that the screenshot capability works with a real headless
 * Chromium: a local static page is served, captured through the HTTP API, and
 * the stored file is verified as a valid PNG. Run via `npm run test:e2e`.
 */
describe('POST /screenshot (real browser)', () => {
  let staticServer: Server;
  let staticUrl: string;
  let appServer: Server;
  let bridgeUrl: string;
  let screenshotDir: string;
  let screenshot: ScreenshotService;

  before(async () => {
    staticServer = createServer((req, res) => {
      if (req.url === '/404') {
        res.writeHead(404, { 'content-type': 'text/plain' });
        res.end('not found');
        return;
      }
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(PAGE_HTML);
    });
    await new Promise<void>((resolve) => staticServer.listen(0, '127.0.0.1', resolve));
    staticUrl = `http://127.0.0.1:${(staticServer.address() as AddressInfo).port}`;

    screenshotDir = await mkdtemp(path.join(tmpdir(), 'vista-screenshots-'));
    screenshot = createScreenshotService({
      appUrl: staticUrl,
      screenshotDir,
      timeoutMs: 15000,
      headless: true,
    });

    const app = express();
    app.use(express.json());
    app.use(screenshotsRouter(screenshot));
    app.use(errorHandler);
    appServer = app.listen(0);
    await new Promise<void>((resolve) => appServer.once('listening', resolve));
    bridgeUrl = `http://127.0.0.1:${(appServer.address() as AddressInfo).port}`;
  });

  after(async () => {
    await new Promise<void>((resolve, reject) =>
      appServer.close((error) => (error ? reject(error) : resolve())),
    );
    await new Promise<void>((resolve, reject) =>
      staticServer.close((error) => (error ? reject(error) : resolve())),
    );
    await rm(screenshotDir, { recursive: true, force: true });
  });

  async function postScreenshot(body: unknown): Promise<{
    status: number;
    json: { path: string; bytes: number; width: number; height: number; format?: string };
  }> {
    const response = await fetch(`${bridgeUrl}/screenshot`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    return {
      status: response.status,
      json: (await response.json()) as {
        path: string;
        bytes: number;
        width: number;
        height: number;
        format?: string;
      },
    };
  }

  async function assertValidPng(filePath: string): Promise<void> {
    const info = await stat(filePath);
    assert.ok(info.size > 0, 'screenshot file should not be empty');
    const head = await readFile(filePath);
    assert.ok(head.subarray(0, 8).equals(PNG_MAGIC), 'file must start with the PNG signature');
  }

  it('captures the viewport of the default page', async () => {
    const { status, json } = await postScreenshot({});
    assert.equal(status, 200);
    assert.equal(json.format ?? 'png', 'png');
    assert.ok(json.bytes > 0);
    await assertValidPng(json.path);
  });

  it('captures the full page when fullPage is set', async () => {
    const { status, json } = await postScreenshot({ fullPage: true });
    assert.equal(status, 200);
    assert.ok(
      json.height > 900,
      `full-page capture should be taller than the viewport (${json.height})`,
    );
    await assertValidPng(json.path);
  });

  it('captures a single element when a selector is given', async () => {
    const { status, json } = await postScreenshot({ selector: '#brand' });
    assert.equal(status, 200);
    assert.ok(json.width <= 320 + 1 && json.height <= 120 + 1);
    await assertValidPng(json.path);
  });

  it('resolves relative paths against the configured app URL', async () => {
    const { status, json } = await postScreenshot({ url: '/page' });
    assert.equal(status, 200);
    await assertValidPng(json.path);
  });

  it('returns 404 when the selector does not exist', async () => {
    const { status } = await postScreenshot({ selector: '#missing' });
    assert.equal(status, 404);
  });

  it('returns 502 when the target returns a non-2xx status', async () => {
    const { status } = await postScreenshot({ url: `${staticUrl}/404` });
    assert.equal(status, 502);
  });
});
