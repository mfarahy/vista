import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import express from 'express';
import type { BridgeError } from './bridge.js';
import { createAgentBridgeClient } from './bridge.js';

describe('AgentBridgeClient', () => {
  let server: Server;
  let baseUrl: string;
  let mode: 'ok' | 'json404' | 'plain500' | null = 'ok';

  before(async () => {
    const app = express();
    app.use(express.json());
    app.post('/task', (req, res) => {
      if (mode === 'json404') {
        res.status(404).json({ error: 'OpenCode session not found: nope' });
        return;
      }
      if (mode === 'plain500') {
        res.status(500).send('boom');
        return;
      }
      res.json({
        sessionId: 'ses-1',
        status: 'completed',
        messageId: 'msg-1',
        response: `answer to: ${req.body.prompt}`,
        tokens: { input: 1, output: 2, reasoning: 0 },
        cost: 0.001,
        durationMs: 42,
      });
    });
    app.post('/screenshot', (_req, res) => {
      res.json({
        status: 'ok',
        filename: 'shot.png',
        path: '/data/shot.png',
        url: 'http://localhost:3000/',
        format: 'png',
        width: 1440,
        height: 900,
        bytes: 10,
      });
    });
    app.get('/session/:id', (req, res) => {
      res.json({
        sessionId: req.params.id,
        title: 'T',
        status: 'idle',
        createdAt: 1,
        updatedAt: 2,
      });
    });
    server = app.listen(0);
    await new Promise<void>((resolve) => server.once('listening', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  after(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  });

  it('forwards a task to the bridge and returns the structured result', async () => {
    mode = 'ok';
    const bridge = createAgentBridgeClient(baseUrl);
    const result = await bridge.sendTask({ prompt: 'Inspect the renderer.' });
    assert.equal(result.sessionId, 'ses-1');
    assert.equal(result.response, 'answer to: Inspect the renderer.');
    assert.equal(result.status, 'completed');
  });

  it('captures a screenshot through the bridge', async () => {
    mode = 'ok';
    const bridge = createAgentBridgeClient(baseUrl);
    const result = await bridge.captureScreenshot({ url: '/demo' });
    assert.equal(result.filename, 'shot.png');
    assert.equal(result.width, 1440);
  });

  it('returns session information from the bridge', async () => {
    mode = 'ok';
    const bridge = createAgentBridgeClient(baseUrl);
    const result = await bridge.getSession('ses-1');
    assert.equal(result.sessionId, 'ses-1');
    assert.equal(result.status, 'idle');
  });

  it('translates a JSON error body into a BridgeError with status and message', async () => {
    mode = 'json404';
    const bridge = createAgentBridgeClient(baseUrl);
    const error = (await bridge.sendTask({ sessionId: 'nope', prompt: 'hello' }).then(
      () => undefined,
      (e) => e,
    )) as BridgeError;
    assert.equal(error.status, 404);
    assert.equal(error.message, 'OpenCode session not found: nope');
  });

  it('keeps a generic message for a non-JSON error body', async () => {
    mode = 'plain500';
    const bridge = createAgentBridgeClient(baseUrl);
    const error = (await bridge.sendTask({ prompt: 'hello' }).then(
      () => undefined,
      (e) => e,
    )) as BridgeError;
    assert.equal(error.status, 500);
    assert.match(error.message, /status 500/);
  });

  it('maps bridge-unreachable network failures to a 503 BridgeError', async () => {
    const client = createAgentBridgeClient('http://127.0.0.1:1');
    const error = (await client.sendTask({ prompt: 'hello' }).then(
      () => undefined,
      (e) => e,
    )) as BridgeError;
    assert.equal(error.status, 503);
    assert.match(error.message, /Agent bridge is unavailable/);
  });
});
