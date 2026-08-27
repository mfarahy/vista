import { getLogger } from './logger.js';

/**
 * Thin stateless HTTP client for the Vista agent-bridge. Every MCP tool call is
 * forwarded to one of the bridge's existing endpoints (`/task`, `/screenshot`,
 * `/session/:id`). The MCP server never talks to OpenCode itself.
 */

export interface TaskRequest {
  prompt: string;
  sessionId?: string;
  screenshot?: {
    url?: string;
    selector?: string;
    fullPage?: boolean;
  };
}

export interface ScreenshotRequest {
  url?: string;
  selector?: string;
  fullPage?: boolean;
}

export interface ScreenshotMetadata {
  filename: string;
  path: string;
  url: string;
  format: 'png';
  width: number;
  height: number;
  bytes: number;
}

export interface TaskResult {
  sessionId: string;
  status: string;
  messageId?: string;
  response?: string;
  tokens?: { input: number; output: number; reasoning: number };
  cost?: number;
  screenshot?: ScreenshotMetadata;
  durationMs: number;
}

export interface ScreenshotResult {
  status: string;
  filename: string;
  path: string;
  url: string;
  format: 'png';
  width: number;
  height: number;
  bytes: number;
}

export interface SessionResult {
  sessionId: string;
  title?: string;
  directory?: string;
  status: string;
  createdAt: number;
  updatedAt: number;
}

export interface AgentBridgeClient {
  sendTask(request: TaskRequest): Promise<TaskResult>;
  captureScreenshot(request: ScreenshotRequest): Promise<ScreenshotResult>;
  getSession(sessionId: string): Promise<SessionResult>;
}

/**
 * An Agent Bridge request failed. `status` mirrors the bridge's HTTP status
 * (400 bad request, 404 not found, 502/503/504 upstream failures) and `message`
 * carries the bridge's own error text so the supervisor sees a meaningful
 * failure instead of a generic one.
 */
export class BridgeError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'BridgeError';
    this.status = status;
  }
}

/** Generous ceiling for a bridge call (the bridge waits for the agent itself). */
const REQUEST_TIMEOUT_MS = 600000;

function describeError(error: unknown): string {
  return error instanceof Error && error.message ? error.message : String(error);
}

async function errorFromResponse(response: Response): Promise<BridgeError> {
  let message = `Agent bridge request failed with status ${response.status}`;
  try {
    const data = (await response.json()) as { error?: unknown };
    if (typeof data.error === 'string' && data.error) {
      message = data.error;
    }
  } catch {
    // Non-JSON error body: keep the generic status-based message.
  }
  return new BridgeError(message, response.status);
}

export function createAgentBridgeClient(baseUrl: string): AgentBridgeClient {
  const log = getLogger();

  async function call<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    const started = performance.now();
    let response: Response;
    try {
      response = await fetch(`${baseUrl}${path}`, {
        method,
        headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      throw new BridgeError(`Agent bridge is unavailable: ${describeError(error)}`, 503);
    }
    if (!response.ok) {
      throw await errorFromResponse(response);
    }
    const durationMs = Math.round(performance.now() - started);
    log.info(
      { method, path, status: response.status, durationMs },
      'Agent bridge %s %s -> %s (%s ms)',
      method,
      path,
      response.status,
      durationMs,
    );
    return (await response.json()) as T;
  }

  return {
    sendTask(request) {
      return call<TaskResult>('POST', '/task', request);
    },
    captureScreenshot(request) {
      return call<ScreenshotResult>('POST', '/screenshot', request);
    },
    getSession(sessionId) {
      return call<SessionResult>('GET', `/session/${encodeURIComponent(sessionId)}`);
    },
  };
}
