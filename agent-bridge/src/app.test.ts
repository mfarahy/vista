import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import type { Session, SessionStatus } from '@opencode-ai/sdk';
import { createApp } from './app.js';
import {
  OpenCodeApiError,
  OpenCodeNotFoundError,
  OpenCodePromptError,
  OpenCodeTimeoutError,
  OpenCodeUnavailableError,
  type OpenCodeClient,
} from './lib/opencode.js';

function makeSession(id: string, title = 'Test session'): Session {
  return {
    id,
    projectID: 'project-1',
    directory: 'D:\\repo\\vista',
    title,
    version: '1',
    time: { created: 1000, updated: 2000 },
  };
}

describe('agent bridge HTTP API', () => {
  let server: Server;
  let baseUrl: string;
  let opencode: OpenCodeClient & { health: () => Promise<{ healthy: boolean }> };
  let replaceClient: (overrides?: Partial<OpenCodeClient>) => void;

  const sessions = new Map<string, Session>([
    ['session-1', makeSession('session-1')],
    ['session-2', makeSession('session-2', 'Floor plan review')],
  ]);
  const statuses = new Map<string, SessionStatus>([['session-1', { type: 'idle' }]]);

  function createFakeClient(overrides: Partial<OpenCodeClient> = {}): OpenCodeClient {
    const client: OpenCodeClient = {
      health: async () => ({ healthy: true }),
      createSession: async (title) => {
        const session = makeSession('session-new', title ?? 'New session');
        sessions.set(session.id, session);
        return session;
      },
      getSession: async (id) => {
        const session = sessions.get(id);
        if (!session) throw new OpenCodeNotFoundError(`OpenCode session not found: ${id}`);
        return session;
      },
      getSessionStatus: async (id) => {
        const status = statuses.get(id);
        if (!status) throw new OpenCodeNotFoundError(`OpenCode session not found: ${id}`);
        return status;
      },
      sendPrompt: async (id, prompt) => {
        assert.equal(id, 'session-1');
        return {
          messageId: 'message-1',
          text: `answer to: ${prompt}`,
          tokens: { input: 10, output: 20, reasoning: 5 },
          cost: 0.01,
        };
      },
      ...overrides,
    };
    return client;
  }

  before(async () => {
    const holder: { client: OpenCodeClient } = { client: createFakeClient() };
    // Delegate through the holder so tests can swap the fake client behavior
    // without recreating the HTTP server.
    opencode = {
      health: (...args) => holder.client.health(...args),
      createSession: (...args) => holder.client.createSession(...args),
      getSession: (...args) => holder.client.getSession(...args),
      getSessionStatus: (...args) => holder.client.getSessionStatus(...args),
      sendPrompt: (...args) => holder.client.sendPrompt(...args),
    };
    replaceClient = (overrides = {}) => {
      holder.client = createFakeClient(overrides);
    };
    const app = createApp({ opencode });
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

  describe('POST /session', () => {
    it('creates a session and returns its ID', async () => {
      const response = await post('/session', { title: 'My session' });
      assert.equal(response.status, 201);
      const body = (await response.json()) as {
        sessionId: string;
        title: string;
        createdAt: number;
      };
      assert.equal(body.sessionId, 'session-new');
      assert.equal(body.title, 'My session');
      assert.equal(body.createdAt, 1000);
    });

    it('creates a session without a title', async () => {
      const response = await post('/session', {});
      assert.equal(response.status, 201);
      const body = (await response.json()) as { sessionId: string };
      assert.equal(body.sessionId, 'session-new');
    });

    it('rejects a malformed body', async () => {
      const response = await post('/session', { title: 42 });
      assert.equal(response.status, 400);
      const body = (await response.json()) as { error: string };
      assert.match(body.error, /Invalid request body/);
    });
  });

  describe('GET /session/:id', () => {
    it('returns session information and status', async () => {
      const response = await fetch(`${baseUrl}/session/session-1`);
      assert.equal(response.status, 200);
      const body = (await response.json()) as {
        sessionId: string;
        title: string;
        status: string;
      };
      assert.equal(body.sessionId, 'session-1');
      assert.equal(body.title, 'Test session');
      assert.equal(body.status, 'idle');
    });

    it('returns 404 for an unknown session', async () => {
      const response = await fetch(`${baseUrl}/session/nope`);
      assert.equal(response.status, 404);
    });
  });

  describe('POST /prompt', () => {
    it('sends a prompt and returns the agent response', async () => {
      const response = await post('/prompt', { sessionId: 'session-1', prompt: 'hello' });
      assert.equal(response.status, 200);
      const body = (await response.json()) as {
        sessionId: string;
        status: string;
        messageId: string;
        response: string;
        tokens: { input: number };
      };
      assert.equal(body.sessionId, 'session-1');
      assert.equal(body.status, 'completed');
      assert.equal(body.messageId, 'message-1');
      assert.equal(body.response, 'answer to: hello');
      assert.equal(body.tokens.input, 10);
    });

    it('returns 400 when sessionId is missing', async () => {
      const response = await post('/prompt', { prompt: 'hello' });
      assert.equal(response.status, 400);
    });

    it('returns 400 when prompt is empty', async () => {
      const response = await post('/prompt', { sessionId: 'session-1', prompt: '' });
      assert.equal(response.status, 400);
    });

    it('returns 400 on malformed JSON', async () => {
      const response = await post('/prompt', '{not json');
      assert.equal(response.status, 400);
    });

    it('returns 404 for an unknown session', async () => {
      const response = await post('/prompt', { sessionId: 'nope', prompt: 'hello' });
      assert.equal(response.status, 404);
    });

    it('returns 503 when the OpenCode server is unavailable', async () => {
      replaceClient({
        getSession: async () => {
          throw new OpenCodeUnavailableError('OpenCode unavailable: fetch failed');
        },
      });
      const response = await post('/prompt', { sessionId: 'session-1', prompt: 'hello' });
      assert.equal(response.status, 503);
    });

    it('returns 504 on request timeout', async () => {
      replaceClient({
        getSession: async () => sessions.get('session-1')!,
        sendPrompt: async () => {
          throw new OpenCodeTimeoutError('OpenCode did not respond in time');
        },
      });
      const response = await post('/prompt', { sessionId: 'session-1', prompt: 'hello' });
      assert.equal(response.status, 504);
    });

    it('returns 502 when the agent run fails', async () => {
      replaceClient({
        getSession: async () => sessions.get('session-1')!,
        sendPrompt: async () => {
          throw new OpenCodePromptError('OpenCode agent run failed: provider auth error');
        },
      });
      const response = await post('/prompt', { sessionId: 'session-1', prompt: 'hello' });
      assert.equal(response.status, 502);
      const body = (await response.json()) as { error: string };
      assert.match(body.error, /provider auth error/);
    });

    it('returns 502 for other OpenCode API errors', async () => {
      replaceClient({
        getSession: async () => {
          throw new OpenCodeApiError('OpenCode API error (500): boom', 500);
        },
      });
      const response = await post('/prompt', { sessionId: 'session-1', prompt: 'hello' });
      assert.equal(response.status, 502);
    });
  });

  describe('GET /health', () => {
    it('reports the bridge is healthy', async () => {
      const response = await fetch(`${baseUrl}/health`);
      assert.equal(response.status, 200);
      const body = (await response.json()) as { status: string };
      assert.equal(body.status, 'ok');
    });
  });
});
