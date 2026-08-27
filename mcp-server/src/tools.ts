import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { AgentBridgeClient, ScreenshotMetadata } from './lib/bridge.js';
import { BridgeError } from './lib/bridge.js';
import { getLogger } from './lib/logger.js';

/**
 * The three MCP tools exposed by the Vista supervisor server. Each tool is a
 * thin pass-through to the matching Agent Bridge endpoint and carries the
 * bridge's error text through to the MCP client. No OpenCode or screenshot
 * logic lives here.
 */

/** Shared screenshot options, identical to the bridge's `/task` and `/screenshot`. */
const screenshotShape = {
  url: z
    .string()
    .min(1)
    .optional()
    .describe('Absolute URL or page path (e.g. /demo) of the Vista app to capture.'),
  selector: z
    .string()
    .min(1)
    .optional()
    .describe('CSS selector of an element to capture instead of the whole page.'),
  fullPage: z
    .boolean()
    .optional()
    .describe('Capture the full scrollable page instead of the viewport.'),
};

const screenshotInput = z.object(screenshotShape).strict();

export interface McpServerOptions {
  /** Base URL used to build the safe screenshot retrieval URL returned to clients. */
  bridgeUrl: string;
}

export function createMcpServer(bridge: AgentBridgeClient, options: McpServerOptions): McpServer {
  const server = new McpServer({ name: 'vista-mcp-supervisor', version: '1.0.0' });
  registerTools(server, bridge, options.bridgeUrl);
  return server;
}

/** Safe URL for retrieving a captured screenshot via the bridge's own endpoint. */
export function screenshotRetrievalUrl(bridgeUrl: string, filename: string): string {
  return `${bridgeUrl}/screenshot/${encodeURIComponent(filename)}`;
}

/**
 * Drops the absolute filesystem `path` (local paths never leak to an external
 * supervisor) and adds the safe retrieval URL instead.
 */
function publicScreenshot(
  screenshot: ScreenshotMetadata,
  bridgeUrl: string,
): Record<string, unknown> {
  return {
    filename: screenshot.filename,
    retrievalUrl: screenshotRetrievalUrl(bridgeUrl, screenshot.filename),
    url: screenshot.url,
    format: screenshot.format,
    width: screenshot.width,
    height: screenshot.height,
    bytes: screenshot.bytes,
  };
}

function textResult(output: unknown): { content: { type: 'text'; text: string }[] } {
  return { content: [{ type: 'text', text: JSON.stringify(output, null, 2) }] };
}

function errorResult(error: unknown): {
  content: { type: 'text'; text: string }[];
  isError: boolean;
} {
  const status = error instanceof BridgeError ? error.status : 500;
  const detail =
    error instanceof BridgeError ? error.message : 'Agent bridge request failed unexpectedly';
  return {
    content: [{ type: 'text', text: `Agent bridge error (HTTP ${status}): ${detail}` }],
    isError: true,
  };
}

export function registerTools(
  server: McpServer,
  bridge: AgentBridgeClient,
  bridgeUrl: string,
): void {
  const log = getLogger();

  server.registerTool(
    'vista_task',
    {
      title: 'Vista task',
      description:
        'Send a task to OpenCode through the Vista agent bridge. Creates a new agent ' +
        'session when sessionId is omitted; otherwise reuses the given session so the ' +
        'agent keeps its context. Waits for the agent to finish and optionally captures a ' +
        'screenshot of the Vista app. Returns the session id, status, full agent response, ' +
        'token/cost data and screenshot metadata when a screenshot was requested.',
      inputSchema: {
        prompt: z.string().min(1).describe('The instruction to send to the OpenCode agent.'),
        sessionId: z
          .string()
          .min(1)
          .optional()
          .describe('Existing agent session id. When omitted, a new session is created.'),
        screenshot: screenshotInput
          .optional()
          .describe('Capture a screenshot once the agent finishes.'),
      },
    },
    async (args) => {
      try {
        const result = await bridge.sendTask(args);
        return textResult({
          sessionId: result.sessionId,
          status: result.status,
          messageId: result.messageId,
          response: result.response,
          tokens: result.tokens,
          cost: result.cost,
          screenshot: result.screenshot
            ? publicScreenshot(result.screenshot, bridgeUrl)
            : undefined,
          durationMs: result.durationMs,
        });
      } catch (error) {
        log.error(
          { err: error },
          'vista_task failed: %s',
          error instanceof Error ? error.message : String(error),
        );
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    'vista_screenshot',
    {
      title: 'Vista screenshot',
      description:
        'Capture the current Vista UI through the agent bridge without sending a task to ' +
        'OpenCode. Returns the screenshot file name, a URL to retrieve the PNG, and its ' +
        'dimensions, byte size and format.',
      inputSchema: {
        ...screenshotShape,
      },
    },
    async (args) => {
      try {
        const result = await bridge.captureScreenshot(args);
        return textResult({
          filename: result.filename,
          retrievalUrl: screenshotRetrievalUrl(bridgeUrl, result.filename),
          url: result.url,
          format: result.format,
          width: result.width,
          height: result.height,
          bytes: result.bytes,
        });
      } catch (error) {
        log.error(
          { err: error },
          'vista_screenshot failed: %s',
          error instanceof Error ? error.message : String(error),
        );
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    'vista_session',
    {
      title: 'Vista session',
      description:
        'Inspect an existing OpenCode session through the agent bridge: its title, working ' +
        'directory, status (idle | busy | retry) and created/updated timestamps.',
      inputSchema: {
        sessionId: z.string().min(1).describe('The agent session id to inspect.'),
      },
    },
    async ({ sessionId }) => {
      try {
        const session = await bridge.getSession(sessionId);
        return textResult(session);
      } catch (error) {
        log.error(
          { err: error },
          'vista_session failed: %s',
          error instanceof Error ? error.message : String(error),
        );
        return errorResult(error);
      }
    },
  );
}
