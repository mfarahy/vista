import {
  createOpencodeClient,
  type AssistantMessage,
  type Part,
  type Session,
  type SessionStatus,
} from '@opencode-ai/sdk';
import { getLogger } from './logger.js';

/**
 * Thin wrapper around the official OpenCode SDK (@opencode-ai/sdk). It owns
 * error classification (unavailable / API error / not found / timeout) so the
 * HTTP routes can map failures onto clear status codes without touching SDK
 * internals.
 */

/** Timeout for the bridge's own connection/health probes (short on purpose). */
const HEALTH_TIMEOUT_MS = 5000;

export class OpenCodeError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'OpenCodeError';
  }
}

/** The OpenCode server could not be reached (connection refused, DNS, ...). */
export class OpenCodeUnavailableError extends OpenCodeError {}

/** The OpenCode server answered with a non-2xx status. */
export class OpenCodeApiError extends OpenCodeError {
  readonly status: number;

  constructor(message: string, status: number, cause?: unknown) {
    super(message, { cause });
    this.name = 'OpenCodeApiError';
    this.status = status;
  }
}

/** The requested session does not exist on the server. */
export class OpenCodeNotFoundError extends OpenCodeError {}

/** The request exceeded the configured timeout. */
export class OpenCodeTimeoutError extends OpenCodeError {}

/** The agent run itself failed (e.g. provider/auth error). */
export class OpenCodePromptError extends OpenCodeError {}

export interface OpenCodeClientOptions {
  /** Base URL of the running OpenCode server. */
  url: string;
  /** Maximum time (ms) to wait for an agent response. */
  timeoutMs: number;
}

export interface HealthResult {
  healthy: boolean;
  version?: string;
}

/** Assistant response extracted from a completed agent run. */
export interface PromptResult {
  messageId: string;
  text: string;
  tokens: {
    input: number;
    output: number;
    reasoning: number;
  };
  cost: number;
}

export interface OpenCodeClient {
  /** Probes GET /global/health; throws OpenCodeUnavailableError when unreachable. */
  health(): Promise<HealthResult>;
  /** Creates a session on the OpenCode server and returns it. */
  createSession(title?: string): Promise<Session>;
  /** Returns the session, throwing OpenCodeNotFoundError when it does not exist. */
  getSession(id: string): Promise<Session>;
  /** Returns the session status (idle | busy | retry). */
  getSessionStatus(id: string): Promise<SessionStatus>;
  /**
   * Sends a prompt to the session and waits for the agent to finish.
   * Throws OpenCodeTimeoutError when the run exceeds the configured timeout.
   */
  sendPrompt(id: string, prompt: string): Promise<PromptResult>;
}

function describeError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return String(error);
}

/** Classifies a thrown SDK error into the bridge's error hierarchy. */
export function classifySdkError(error: unknown, timedOut: boolean): OpenCodeError {
  if (timedOut) return new OpenCodeTimeoutError('OpenCode did not respond in time');
  if (error instanceof OpenCodeError) return error;

  const cause = (error as { cause?: unknown } | undefined)?.cause;
  const status =
    cause && typeof cause === 'object' ? (cause as { status?: unknown }).status : undefined;
  if (typeof status === 'number') {
    const message = describeError(error);
    if (status === 404) return new OpenCodeNotFoundError(`OpenCode session not found: ${message}`);
    return new OpenCodeApiError(`OpenCode API error (${status}): ${message}`, status, error);
  }
  return new OpenCodeUnavailableError(`OpenCode unavailable: ${describeError(error)}`, {
    cause: error,
  });
}

/** Joins the assistant text parts of a finished agent run. */
export function extractPromptText(parts: Part[]): string {
  return parts
    .filter((part): part is Extract<Part, { type: 'text' }> => part.type === 'text')
    .map((part) => part.text)
    .join('\n');
}

/** Extracts a human-readable message from an assistant message error field. */
export function messageErrorText(info: AssistantMessage): string {
  if (!info.error) return 'agent run failed';
  if (typeof info.error === 'string') return info.error;
  const candidate = info.error as { message?: unknown };
  if (typeof candidate.message === 'string' && candidate.message) return candidate.message;
  return describeError(info.error);
}

/**
 * Builds the SDK-backed OpenCodeClient. The SDK client is created with
 * `throwOnError: true` + `responseStyle: 'data'` so methods return typed data
 * directly and failures surface as exceptions classified by
 * {@link classifySdkError}.
 */
export function createSdkOpenCodeClient(options: OpenCodeClientOptions): OpenCodeClient {
  const sdk = createOpencodeClient({
    baseUrl: options.url,
    throwOnError: true,
  });

  const log = getLogger();

  async function withTimeout<T>(
    operation: (signal: AbortSignal) => Promise<T>,
    timeoutMs: number,
  ): Promise<T> {
    const signal = AbortSignal.timeout(timeoutMs);
    try {
      return await operation(signal);
    } catch (error) {
      throw classifySdkError(error, signal.aborted);
    }
  }

  /** Unwraps the typed `.data` payload of a `throwOnError` SDK call. */
  function data<T>(result: { data: T }): T {
    return result.data;
  }

  return {
    async health(): Promise<HealthResult> {
      try {
        const response = await fetch(`${options.url}/global/health`, {
          signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
        });
        if (!response.ok) {
          throw new OpenCodeUnavailableError(
            `OpenCode health check failed with status ${response.status}`,
          );
        }
        return (await response.json()) as HealthResult;
      } catch (error) {
        if (error instanceof OpenCodeError) throw error;
        throw new OpenCodeUnavailableError(
          `OpenCode health check failed: ${describeError(error)}`,
          {
            cause: error,
          },
        );
      }
    },

    async createSession(title?: string): Promise<Session> {
      const session = await withTimeout(
        (signal) =>
          sdk.session
            .create<true>({
              body: { title },
              signal,
              throwOnError: true,
            })
            .then(data),
        options.timeoutMs,
      );
      log.info({ sessionId: session.id, title: session.title }, 'OpenCode session created');
      return session;
    },

    async getSession(id: string): Promise<Session> {
      return withTimeout(
        (signal) =>
          sdk.session
            .get<true>({
              path: { id },
              signal,
              throwOnError: true,
            })
            .then(data),
        options.timeoutMs,
      );
    },

    async getSessionStatus(id: string): Promise<SessionStatus> {
      const statuses = await withTimeout(
        (signal) =>
          sdk.session
            .status<true>({
              signal,
              throwOnError: true,
            })
            .then(data),
        options.timeoutMs,
      );
      // The server only reports sessions with activity (busy/retry); an
      // absent entry means the session exists and is idle.
      return statuses[id] ?? { type: 'idle' };
    },

    async sendPrompt(id: string, prompt: string): Promise<PromptResult> {
      log.info({ sessionId: id }, 'Sending prompt to OpenCode session');
      const started = performance.now();
      const message = await withTimeout(
        (signal) =>
          sdk.session
            .prompt<true>({
              path: { id },
              body: { parts: [{ type: 'text', text: prompt }] },
              signal,
              throwOnError: true,
            })
            .then(data),
        options.timeoutMs,
      );
      log.info(
        {
          sessionId: id,
          messageId: message.info.id,
          durationMs: Math.round(performance.now() - started),
        },
        'OpenCode agent finished responding',
      );
      if (message.info.error) {
        throw new OpenCodePromptError(
          `OpenCode agent run failed: ${messageErrorText(message.info)}`,
        );
      }
      return {
        messageId: message.info.id,
        text: extractPromptText(message.parts),
        tokens: {
          input: message.info.tokens.input,
          output: message.info.tokens.output,
          reasoning: message.info.tokens.reasoning,
        },
        cost: message.info.cost,
      };
    },
  };
}
