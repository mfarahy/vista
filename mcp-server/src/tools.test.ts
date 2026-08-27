import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { AgentBridgeClient, ScreenshotResult, TaskResult } from './lib/bridge.js';
import { BridgeError } from './lib/bridge.js';
import { createMcpServer } from './tools.js';

const BRIDGE_URL = 'http://bridge.local:4200';

const fakeScreenshot: ScreenshotResult = {
  status: 'ok',
  filename: 'vista-shot.png',
  path: '/local/data/screenshots/vista-shot.png',
  url: 'http://localhost:3000/demo',
  format: 'png',
  width: 1440,
  height: 900,
  bytes: 12345,
};

function makeFakeBridge(overrides: Partial<AgentBridgeClient> = {}): AgentBridgeClient {
  return {
    async sendTask(request): Promise<TaskResult> {
      return {
        sessionId: request.sessionId ?? 'new-session-1',
        status: 'completed',
        messageId: 'msg-1',
        response: `answer to: ${request.prompt}`,
        tokens: { input: 10, output: 20, reasoning: 3 },
        cost: 0.0123,
        durationMs: 1250,
        screenshot: request.screenshot ? { ...fakeScreenshot } : undefined,
      };
    },
    async captureScreenshot() {
      return { ...fakeScreenshot };
    },
    async getSession(sessionId) {
      return {
        sessionId,
        title: 'Vista review',
        directory: 'D:\\repo\\vista',
        status: 'idle',
        createdAt: 1000,
        updatedAt: 2000,
      };
    },
    ...overrides,
  };
}

describe('vista MCP tools', () => {
  let client: Client;
  const holder: { bridge: AgentBridgeClient } = { bridge: makeFakeBridge() };

  function replaceBridge(overrides: Partial<AgentBridgeClient> = {}): void {
    holder.bridge = makeFakeBridge(overrides);
  }

  before(async () => {
    const bridge: AgentBridgeClient = {
      sendTask: (...args) => holder.bridge.sendTask(...args),
      captureScreenshot: (...args) => holder.bridge.captureScreenshot(...args),
      getSession: (...args) => holder.bridge.getSession(...args),
    };
    const server = createMcpServer(bridge, { bridgeUrl: BRIDGE_URL });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    client = new Client({ name: 'test-client', version: '1.0.0' });
    await server.connect(serverTransport);
    await client.connect(clientTransport);
  });

  after(async () => {
    await client.close();
  });

  interface ToolResult {
    content: { type: string; text?: string }[];
    isError?: boolean;
  }

  function asResult(result: unknown): ToolResult {
    const narrowed = result as { content?: { type: string; text?: string }[]; isError?: boolean };
    assert.ok(Array.isArray(narrowed.content), 'expected tool result content');
    return narrowed as ToolResult;
  }

  function textOf(result: unknown): string {
    const { content } = asResult(result);
    const block = content.find((c) => c.type === 'text');
    assert.ok(block, 'expected a text content block');
    assert.ok(typeof block.text === 'string');
    return block.text;
  }

  function parse<T>(result: unknown): T {
    return JSON.parse(textOf(result)) as T;
  }

  it('exposes exactly the three supervisor tools', async () => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    assert.deepEqual(names, ['vista_screenshot', 'vista_session', 'vista_task']);
    const task = tools.find((t) => t.name === 'vista_task');
    assert.equal(task?.inputSchema?.required?.[0], 'prompt');
  });

  it('vista_task returns session, agent response and token/cost data', async () => {
    replaceBridge();
    const result = await client.callTool({
      name: 'vista_task',
      arguments: { prompt: 'Inspect the renderer.' },
    });
    const body = parse<{
      sessionId: string;
      status: string;
      response: string;
      tokens: { input: number };
      cost: number;
    }>(result);
    assert.equal(body.sessionId, 'new-session-1');
    assert.equal(body.status, 'completed');
    assert.equal(body.response, 'answer to: Inspect the renderer.');
    assert.equal(body.tokens.input, 10);
    assert.equal(body.cost, 0.0123);
  });

  it('vista_task forwards sessionId and screenshot options to the bridge', async () => {
    let seen: unknown;
    replaceBridge({
      sendTask: async (request) => {
        seen = request;
        return {
          sessionId: request.sessionId ?? 'new-session-1',
          status: 'completed',
          messageId: 'msg-1',
          response: 'done',
          tokens: { input: 1, output: 1, reasoning: 0 },
          cost: 0,
          durationMs: 1,
          screenshot: { ...fakeScreenshot },
        };
      },
    });
    const result = await client.callTool({
      name: 'vista_task',
      arguments: {
        sessionId: 'existing-1',
        prompt: 'Check the UI.',
        screenshot: { url: '/demo', fullPage: true },
      },
    });
    assert.deepEqual(seen, {
      sessionId: 'existing-1',
      prompt: 'Check the UI.',
      screenshot: { url: '/demo', fullPage: true },
    });
    const body = parse<{
      screenshot: { filename: string; retrievalUrl: string; path?: string };
    }>(result);
    assert.ok(body.screenshot, 'screenshot should be present');
    assert.equal(body.screenshot.filename, 'vista-shot.png');
    assert.equal(body.screenshot.retrievalUrl, `${BRIDGE_URL}/screenshot/vista-shot.png`);
    assert.equal(body.screenshot.path, undefined, 'absolute filesystem path must not leak');
  });

  it('vista_screenshot returns filename, retrieval url and metadata', async () => {
    replaceBridge();
    const result = await client.callTool({
      name: 'vista_screenshot',
      arguments: { url: '/demo', fullPage: true },
    });
    const body = parse<{
      filename: string;
      retrievalUrl: string;
      url: string;
      format: string;
      width: number;
      height: number;
      bytes: number;
      path?: string;
    }>(result);
    assert.equal(body.filename, 'vista-shot.png');
    assert.equal(body.retrievalUrl, `${BRIDGE_URL}/screenshot/vista-shot.png`);
    assert.equal(body.format, 'png');
    assert.equal(body.width, 1440);
    assert.equal(body.height, 900);
    assert.equal(body.bytes, 12345);
    assert.equal(body.path, undefined, 'absolute filesystem path must not leak');
  });

  it('vista_session returns the existing session status', async () => {
    replaceBridge();
    const result = await client.callTool({
      name: 'vista_session',
      arguments: { sessionId: 'existing-1' },
    });
    const body = parse<{
      sessionId: string;
      title: string;
      directory: string;
      status: string;
      createdAt: number;
      updatedAt: number;
    }>(result);
    assert.equal(body.sessionId, 'existing-1');
    assert.equal(body.title, 'Vista review');
    assert.equal(body.status, 'idle');
    assert.equal(body.createdAt, 1000);
  });

  it('reports a bridge-unavailable error to the client', async () => {
    replaceBridge({
      sendTask: async () => {
        throw new BridgeError('Agent bridge is unavailable: ECONNREFUSED', 503);
      },
    });
    const result = await client.callTool({
      name: 'vista_task',
      arguments: { prompt: 'hello' },
    });
    assert.equal(asResult(result).isError, true);
    assert.match(textOf(result), /HTTP 503/);
    assert.match(textOf(result), /ECONNREFUSED/);
  });

  it('reports an unknown session as a bridge 404', async () => {
    replaceBridge({
      getSession: async () => {
        throw new BridgeError('OpenCode session not found: nope', 404);
      },
    });
    const result = await client.callTool({
      name: 'vista_session',
      arguments: { sessionId: 'nope' },
    });
    assert.equal(asResult(result).isError, true);
    assert.match(textOf(result), /HTTP 404/);
    assert.match(textOf(result), /OpenCode session not found: nope/);
  });

  it('rejects a task without a prompt', async () => {
    const result = await client.callTool({ name: 'vista_task', arguments: {} });
    assert.equal(asResult(result).isError, true);
    assert.match(textOf(result), /Input validation error/);
  });

  it('rejects a session lookup without a sessionId', async () => {
    const result = await client.callTool({ name: 'vista_session', arguments: {} });
    assert.equal(asResult(result).isError, true);
    assert.match(textOf(result), /Input validation error/);
  });

  it('rejects unknown fields in the screenshot options', async () => {
    const result = await client.callTool({
      name: 'vista_task',
      arguments: { prompt: 'hello', screenshot: { url: '/demo', bogus: true } },
    });
    assert.equal(asResult(result).isError, true);
    assert.match(textOf(result), /Input validation error/);
  });

  it('rejects an empty prompt', async () => {
    const result = await client.callTool({ name: 'vista_task', arguments: { prompt: '' } });
    assert.equal(asResult(result).isError, true);
    assert.match(textOf(result), /Input validation error/);
  });

  it('rejects a custom tool that is not defined', async () => {
    const result = await client.callTool({ name: 'not_a_real_tool', arguments: {} });
    assert.equal(asResult(result).isError, true);
    assert.match(textOf(result), /Tool not_a_real_tool not found/);
  });
});
