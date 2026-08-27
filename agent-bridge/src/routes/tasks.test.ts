import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import type { Session, SessionStatus } from '@opencode-ai/sdk';
import express from 'express';
import { errorHandler } from '../lib/http.js';
import {
  OpenCodeNotFoundError,
  OpenCodeTimeoutError,
  OpenCodeUnavailableError,
  type OpenCodeClient,
} from '../lib/opencode.js';
import {
  ScreenshotNavigationError,
  type ScreenshotResult,
  type ScreenshotService,
} from '../lib/screenshot.js';
import { tasksRouter } from './tasks.js';

function makeSession(id: string): Session {
  return {
    id,
    projectID: 'project-1',
    directory: 'D:\\repo\\vista',
    title: 'Task session',
    version: '1',
    time: { created: 1000, updated: 2000 },
  };
}

function makeScreenshotResult(overrides: Partial<ScreenshotResult> = {}): ScreenshotResult {
  return {
    path: '/tmp/screenshots/vista-task.png',
    filename: 'vista-task.png',
    url: 'http://localhost:3000/demo',
    format: 'png',
    width: 1440,
    height: 900,
    bytes: 999,
    ...overrides,
  };
}

describe('POST /task', () => {
  let server: Server;
  let baseUrl: string;
  let replaceClient: (overrides?: Partial<OpenCodeClient>) => void;
  let replaceCapture: (impl: ScreenshotService['capture']) => void;

  const sessions = new Map<string, Session>([['existing-1', makeSession('existing-1')]]);
  const statuses = new Map<string, SessionStatus>();
  let createdCount = 0;

  function createFakeClient(overrides: Partial<OpenCodeClient> = {}): OpenCodeClient {
    return {
      health: async () => ({ healthy: true }),
      createSession: async () => {
        createdCount += 1;
        const session = makeSession(`created-${createdCount}`);
        sessions.set(session.id, session);
        return session;
      },
      getSession: async (id) => {
        const session = sessions.get(id);
        if (!session) throw new OpenCodeNotFoundError(`OpenCode session not found: ${id}`);
        return session;
      },
      getSessionStatus: async (id) => statuses.get(id) ?? { type: 'idle' },
      sendPrompt: async (id, prompt) => ({
        messageId: `message-${id}`,
        text: `answer to: ${prompt}`,
        tokens: { input: 11, output: 22, reasoning: 3 },
        cost: 0.02,
      }),
      ...overrides,
    };
  }

  let capture: ScreenshotService['capture'];
  const defaultCapture = async (): Promise<ScreenshotResult> => makeScreenshotResult();

  before(async () => {
    capture = defaultCapture;
    replaceCapture = (impl) => {
      capture = impl;
    };
    const holder: { client: OpenCodeClient } = { client: createFakeClient() };
    const opencode: OpenCodeClient = {
      health: (...a) => holder.client.health(...a),
      createSession: (...a) => holder.client.createSession(...a),
      getSession: (...a) => holder.client.getSession(...a),
      getSessionStatus: (...a) => holder.client.getSessionStatus(...a),
      sendPrompt: (...a) => holder.client.sendPrompt(...a),
    };
    replaceClient = (overrides = {}) => {
      holder.client = createFakeClient(overrides);
    };
    const screenshot: ScreenshotService = { dir: '/tmp/screenshots', capture: (r) => capture(r) };
    const app = express();
    app.use(express.json());
    app.use(tasksRouter(opencode, screenshot));
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

  it('creates a new session when sessionId is not provided', async () => {
    const beforeCount = createdCount;
    const response = await post('/task', { prompt: 'Inspect the renderer.' });
    assert.equal(response.status, 200);
    const body = (await response.json()) as {
      sessionId: string;
      status: string;
      response: string;
      tokens: { input: number };
      durationMs: number;
    };
    assert.ok(body.sessionId.startsWith('created-'));
    assert.equal(createdCount, beforeCount + 1);
    assert.equal(body.status, 'completed');
    assert.equal(body.response, 'answer to: Inspect the renderer.');
    assert.equal(body.tokens.input, 11);
    assert.equal(typeof body.durationMs, 'number');
  });

  it('reuses an existing session when sessionId is provided', async () => {
    const beforeCount = createdCount;
    const response = await post('/task', {
      sessionId: 'existing-1',
      prompt: 'Fix the door geometry.',
    });
    assert.equal(response.status, 200);
    const body = (await response.json()) as { sessionId: string; response: string };
    assert.equal(body.sessionId, 'existing-1');
    assert.equal(body.response, 'answer to: Fix the door geometry.');
    assert.equal(createdCount, beforeCount, 'no new session should be created');
  });

  it('supports session continuity across sequential tasks', async () => {
    const first = await post('/task', {
      sessionId: 'existing-1',
      prompt: 'Fix the doors.',
    });
    assert.equal(first.status, 200);
    const firstBody = (await first.json()) as { sessionId: string };
    const second = await post('/task', {
      sessionId: firstBody.sessionId,
      prompt: 'The doors are better, now fix the stairs.',
    });
    assert.equal(second.status, 200);
    const secondBody = (await second.json()) as {
      sessionId: string;
      response: string;
    };
    assert.equal(secondBody.sessionId, firstBody.sessionId);
    assert.equal(secondBody.response, 'answer to: The doors are better, now fix the stairs.');
  });

  it('captures a screenshot and returns its metadata when requested', async () => {
    let seen: Parameters<ScreenshotService['capture']>[0] | undefined;
    replaceCapture(async (request) => {
      seen = request;
      return makeScreenshotResult({ url: 'http://localhost:3000/demo' });
    });
    const response = await post('/task', {
      sessionId: 'existing-1',
      prompt: 'Check the UI.',
      screenshot: { url: '/demo', fullPage: true },
    });
    assert.equal(response.status, 200);
    const body = (await response.json()) as {
      sessionId: string;
      screenshot: {
        filename: string;
        path: string;
        width: number;
        height: number;
        bytes: number;
      };
    };
    assert.ok(body.screenshot, 'screenshot should be present');
    assert.equal(body.screenshot.filename, 'vista-task.png');
    assert.equal(body.screenshot.width, 1440);
    assert.deepEqual(seen, { url: '/demo', selector: undefined, fullPage: true });
  });

  it('returns 400 when prompt is missing', async () => {
    const response = await post('/task', {});
    assert.equal(response.status, 400);
  });

  it('returns 400 when prompt is empty', async () => {
    const response = await post('/task', { prompt: '' });
    assert.equal(response.status, 400);
  });

  it('returns 404 when the provided sessionId does not exist', async () => {
    const response = await post('/task', { sessionId: 'nope', prompt: 'hello' });
    assert.equal(response.status, 404);
  });

  it('returns 503 when the OpenCode server is unavailable', async () => {
    replaceClient({
      createSession: async () => {
        throw new OpenCodeUnavailableError('OpenCode unavailable: fetch failed');
      },
    });
    const response = await post('/task', { prompt: 'hello' });
    assert.equal(response.status, 503);
  });

  it('returns 504 when the OpenCode request times out', async () => {
    replaceClient({
      sendPrompt: async () => {
        throw new OpenCodeTimeoutError('OpenCode did not respond in time');
      },
    });
    const response = await post('/task', { sessionId: 'existing-1', prompt: 'hello' });
    assert.equal(response.status, 504);
  });

  it('returns a failure status when the screenshot capture fails', async () => {
    replaceClient();
    replaceCapture(async () => {
      throw new ScreenshotNavigationError('Page unavailable (HTTP 500)');
    });
    const response = await post('/task', {
      sessionId: 'existing-1',
      prompt: 'hello',
      screenshot: {},
    });
    assert.equal(response.status, 502);
    const body = (await response.json()) as { error: string };
    assert.match(body.error, /HTTP 500/);
  });
});
