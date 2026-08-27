import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import express from 'express';
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
