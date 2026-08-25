import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { pino, type Logger, type LoggerOptions } from 'pino';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { pinoHttp } from 'pino-http';

/**
 * Central structured logger for the Vista expose service.
 *
 * Uses pino (JSON log lines) with a console/stream destination for the MVP.
 * A request-scoped child logger is stored in AsyncLocalStorage so any module —
 * including external-service clients that have no reference to the Express
 * request — can obtain the current correlation id via `getLogger()`.
 */

const SERVICE_NAME = 'vista-expose-service';

/** Holds the child logger bound to the currently handled HTTP request. */
const requestStorage = new AsyncLocalStorage<Logger>();

function resolveLevel(): LoggerOptions['level'] {
  if (process.env.LOG_LEVEL) {
    const level = process.env.LOG_LEVEL.toLowerCase();
    if (['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'].includes(level)) {
      return level as LoggerOptions['level'];
    }
  }
  if (process.env.NODE_ENV === 'production') return 'info';
  if (
    process.env.NODE_ENV === 'test' ||
    process.argv.includes('--test') ||
    process.argv[1]?.match(/\.test\.(ts|js)$/)
  )
    return 'silent';
  return 'debug';
}

const baseOptions: LoggerOptions = {
  level: resolveLevel(),
  timestamp: pino.stdTimeFunctions.isoTime,
  base: {
    service: SERVICE_NAME,
    env: process.env.NODE_ENV || 'development',
  },
  redact: {
    censor: '[REDACTED]',
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      '*.password',
      '*.apiKey',
      '*.api_key',
      '*.token',
      '*.access_token',
      '*.refresh_token',
      '*.authorization',
      '*.secret',
      '*.private_key',
      '*.client_secret',
      '*.credentials',
    ],
  },
};

export function resolveFormat(): 'json' | 'text' {
  const format = (process.env.LOG_FORMAT || '').toLowerCase();
  if (['text', 'pretty'].includes(format)) return 'text';
  return 'json';
}

const prettyTransport: LoggerOptions = {
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard',
      ignore: 'pid,hostname',
    },
  },
};

export const logger: Logger = pino(
  resolveFormat() === 'text' ? { ...baseOptions, ...prettyTransport } : baseOptions,
);

const CORRELATION_HEADER = (process.env.CORRELATION_ID_HEADER || 'x-correlation-id').toLowerCase();

function readCorrelationId(req: IncomingMessage): string | undefined {
  const value = req.headers[CORRELATION_HEADER];
  if (Array.isArray(value)) return value[0];
  return value;
}

type RequestLoggerMiddleware = (
  req: IncomingMessage,
  res: ServerResponse,
  next: (err?: unknown) => void,
) => void;

/**
 * Express middleware that logs each incoming request, reads or generates a
 * correlation id, and makes a request-scoped logger available to downstream
 * handlers and services via `getLogger()`.
 *
 * Health/readiness probes are excluded from request logs to avoid noise.
 */
export function requestLogger(): RequestLoggerMiddleware {
  const httpLogger = pinoHttp({
    logger,
    genReqId: (req, res) => {
      const existing = readCorrelationId(req);
      const id = existing || randomUUID();
      res.setHeader(CORRELATION_HEADER, id);
      return id;
    },
    customProps: (req) => ({ correlationId: req.id }),
    serializers: {
      req: (req) => ({
        id: req.id,
        method: req.method,
        url: req.url,
      }),
    },
    autoLogging: {
      // Ignore probes and static asset traffic (uploads, demo page) to avoid noise.
      ignore: (req) => /^\/(health|ready|uploads|demo)(\/|\?|$)/.test(req.url || ''),
    },
    customLogLevel: (_req, res, err) => {
      if (err || res.statusCode >= 500) return 'error';
      if (res.statusCode >= 400) return 'warn';
      return 'info';
    },
  });

  return (req, res, next) => {
    httpLogger(req, res, (err?: unknown) => {
      requestStorage.run(req.log, () => next(err));
    });
  };
}

/** Returns the logger scoped to the current request, or the base logger. */
export function getLogger(): Logger {
  return requestStorage.getStore() || logger;
}

/** Maps the app's log level onto the Mastra `LogLevel` set (fatal/trace collapse). */
export function mastraLogLevel(): 'debug' | 'info' | 'warn' | 'error' | 'silent' {
  const level = resolveLevel() ?? 'info';
  if (level === 'fatal') return 'error';
  if (level === 'trace') return 'debug';
  if (level === 'silent') return 'silent';
  return level as 'debug' | 'info' | 'warn' | 'error' | 'silent';
}

export interface ExternalCallOptions {
  /** External system name, e.g. `openai`, `nominatim`, `fal.ai`, `google-document-ai`. */
  service: string;
  /** Operation name, e.g. `chat.completions`, `geocode`, `floorplan-to-3d`. */
  operation: string;
  /** HTTP method when applicable. */
  method?: string;
  /** Endpoint path (never secrets or sensitive query parameters). */
  path?: string;
  /** Additional non-sensitive context properties. */
  props?: Record<string, unknown>;
  /** Derives an HTTP status code from a successful result, when available. */
  status?: (result: unknown) => number | undefined;
}

function statusFromError(error: unknown): number | undefined {
  if (error && typeof error === 'object') {
    const candidate = error as { status?: unknown; response?: { status?: unknown } };
    if (typeof candidate.status === 'number') return candidate.status;
    if (typeof candidate.response?.status === 'number') return candidate.response.status;
  }
  return undefined;
}

/**
 * Times and logs the lifecycle of an external integration call:
 * start, successful completion (status + duration), and failure (duration +
 * error). Failures are logged as `warn` because they are treated as
 * recoverable (most integrations fall back gracefully); callers that treat a
 * failure as fatal can log an additional `error`.
 */
export async function trackExternalCall<T>(
  options: ExternalCallOptions,
  fn: () => Promise<T>,
): Promise<T> {
  const log = getLogger();
  const base = {
    service: options.service,
    operation: options.operation,
    ...(options.method ? { method: options.method } : {}),
    ...(options.path ? { path: options.path } : {}),
    ...options.props,
  };
  log.info(base, 'Calling external service {service} for {operation}');
  const started = performance.now();
  try {
    const result = await fn();
    log.info(
      {
        ...base,
        ...(options.status ? { statusCode: options.status(result) } : {}),
        durationMs: Math.round(performance.now() - started),
      },
      'External service {service} {operation} completed successfully',
    );
    return result;
  } catch (error) {
    log.warn(
      {
        ...base,
        ...(statusFromError(error) !== undefined ? { statusCode: statusFromError(error) } : {}),
        durationMs: Math.round(performance.now() - started),
        err: error,
      },
      'External service {service} {operation} failed after {durationMs} ms',
    );
    throw error;
  }
}
