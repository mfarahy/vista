import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import express from 'express';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { errorHandler } from '../lib/http.js';
import {
  ScreenshotNavigationError,
  ScreenshotSelectorError,
  ScreenshotTimeoutError,
  screenshotFileName,
  resolveScreenshotUrl,
  type ScreenshotResult,
  type ScreenshotService,
} from '../lib/screenshot.js';
import { screenshotsRouter } from './screenshots.js';

function makeResult(overrides: Partial<ScreenshotResult> = {}): ScreenshotResult {
  return {
    path: 'C:\\screenshots\\vista-test.png',
    filename: 'vista-test.png',
    url: 'http://localhost:3000/',
    format: 'png',
    width: 1440,
    height: 900,
    bytes: 12345,
    ...overrides,
  };
}

describe('screenshot helpers', () => {
  it('keeps absolute URLs unchanged', () => {
    assert.equal(
      resolveScreenshotUrl('http://localhost:3000', 'http://example.com/page'),
      'http://example.com/page',
    );
  });

  it('resolves root paths against the app URL', () => {
    assert.equal(
      resolveScreenshotUrl('http://localhost:3000', '/demo'),
      'http://localhost:3000/demo',
    );
  });

  it('resolves extension-less paths with a leading slash', () => {
    assert.equal(
      resolveScreenshotUrl('http://localhost:3000', 'demo'),
      'http://localhost:3000/demo',
    );
  });

  it('produces timestamped PNG filenames', () => {
    const name = screenshotFileName(new Date('2026-08-27T09:15:00.000Z'));
    assert.match(name, /^vista-2026-08-27T09-15-00Z-[a-z0-9]{6}\.png$/);
  });
});

describe('POST /screenshot', () => {
  let server: Server;
  let baseUrl: string;
  let capture: (request: Parameters<ScreenshotService['capture']>[0]) => Promise<ScreenshotResult>;
  let replaceCapture: (impl: typeof capture) => void;

  const defaultCapture = async (request: {
    url: string;
    selector?: string;
    fullPage?: boolean;
  }): Promise<ScreenshotResult> => makeResult({ url: request.url });

  before(async () => {
    capture = defaultCapture;
    replaceCapture = (impl) => {
      capture = impl;
    };
    const app = express();
    app.use(express.json());
    app.use(
      screenshotsRouter({
        dir: '/tmp/screenshots',
        capture: (request) => capture(request),
      }),
    );
    app.use(errorHandler);
    server = app.listen(0);
    await new Promise<void>((resolve) => server.once('listening', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  after(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  });

  function post(path: string, body: unknown): Promise<Response> {
    return fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    });
  }

  it('captures a screenshot of the default page', async () => {
    const response = await post('/screenshot', {});
    assert.equal(response.status, 200);
    const body = (await response.json()) as {
      status: string;
      format: string;
      path: string;
      url: string;
      bytes: number;
    };
    assert.equal(body.status, 'ok');
    assert.equal(body.format, 'png');
    assert.equal(body.path, 'C:\\screenshots\\vista-test.png');
    assert.equal(body.url, '/');
    assert.equal(body.bytes, 12345);
  });

  it('passes the requested url, selector, and fullPage through', async () => {
    let seen: Parameters<ScreenshotService['capture']>[0] | undefined;
    replaceCapture(async (request) => {
      seen = request;
      return makeResult({ url: 'http://localhost:3000/demo' });
    });
    const response = await post('/screenshot', {
      url: 'http://localhost:3000/demo',
      selector: '#hero',
      fullPage: true,
    });
    assert.equal(response.status, 200);
    assert.deepEqual(seen, {
      url: 'http://localhost:3000/demo',
      selector: '#hero',
      fullPage: true,
    });
  });

  it('rejects a non-string url', async () => {
    const response = await post('/screenshot', { url: 42 });
    assert.equal(response.status, 400);
  });

  it('rejects an empty selector', async () => {
    const response = await post('/screenshot', { selector: '' });
    assert.equal(response.status, 400);
  });

  it('rejects a malformed body', async () => {
    const response = await post('/screenshot', '{not json');
    assert.equal(response.status, 400);
  });

  it('returns 502 when the target page is unreachable', async () => {
    replaceCapture(async () => {
      throw new ScreenshotNavigationError('Page unavailable (HTTP 500)');
    });
    const response = await post('/screenshot', {});
    assert.equal(response.status, 502);
    const body = (await response.json()) as { error: string };
    assert.match(body.error, /HTTP 500/);
  });

  it('returns 504 when the page load times out', async () => {
    replaceCapture(async () => {
      throw new ScreenshotTimeoutError('Page did not load within 60000 ms');
    });
    const response = await post('/screenshot', {});
    assert.equal(response.status, 504);
  });

  it('returns 404 when the selector is not found', async () => {
    replaceCapture(async () => {
      throw new ScreenshotSelectorError('Element not found for selector "#nope"');
    });
    const response = await post('/screenshot', { selector: '#nope' });
    assert.equal(response.status, 404);
  });
});

describe('GET /screenshot/:filename', () => {
  let server: Server;
  let baseUrl: string;
  let screenshotDir: string;
  let dirName: string;

  before(async () => {
    dirName = await mkdtemp(path.join(tmpdir(), 'vista-served-'));
    screenshotDir = dirName;
    const app = express();
    app.use(
      screenshotsRouter({
        dir: screenshotDir,
        capture: async () => {
          throw new Error('capture not used in GET tests');
        },
      }),
    );
    app.use(errorHandler);
    server = app.listen(0);
    await new Promise<void>((resolve) => server.once('listening', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  after(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    await rm(screenshotDir, { recursive: true, force: true });
  });

  const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  it('serves a stored PNG with the image content type', async () => {
    await mkdir(screenshotDir, { recursive: true });
    const payload = Buffer.concat([PNG_SIG, Buffer.from([1, 2, 3, 4])]);
    await writeFile(path.join(screenshotDir, 'vista-ok.png'), payload);

    const response = await fetch(`${baseUrl}/screenshot/vista-ok.png`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'image/png');
    const body = Buffer.from(await response.arrayBuffer());
    assert.ok(body.subarray(0, 8).equals(PNG_SIG));
  });

  it('returns 404 when the file does not exist', async () => {
    const response = await fetch(`${baseUrl}/screenshot/does-not-exist.png`);
    assert.equal(response.status, 404);
  });

  it('rejects path traversal attempts', async () => {
    // Multi-segment traversal is normalized by the HTTP layer to a non-matching
    // route (404); a decoded backslash or single-segment traversal hits the
    // handler's validation (400). Either way the file is never served, so only
    // a 200 is unacceptable.
    const attempts = [
      '../../etc/passwd',
      '..%2F..%2Fetc%2Fpasswd',
      'sub%2F..%2F..%2Fetc%2Fpasswd',
      '..%5C..%5Csecret',
      '.',
      '..',
    ];
    for (const attempt of attempts) {
      const response = await fetch(`${baseUrl}/screenshot/${attempt}`);
      assert.ok(
        response.status === 404 || response.status === 400,
        `expected 400/404 for "${attempt}" but got ${response.status}`,
      );
    }
  });

  it('never serves files outside the screenshot directory', async () => {
    const outside = path.join(dirName, '..', 'outside-secret.png');
    await writeFile(outside, Buffer.from('secret'));
    try {
      const response = await fetch(`${baseUrl}/screenshot/outside-secret.png`);
      assert.equal(response.status, 404, 'a sibling file must not be reachable');
    } finally {
      await rm(outside, { force: true });
    }
  });
});
