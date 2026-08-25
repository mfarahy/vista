import { pino, type Logger, type LoggerOptions } from 'pino';

const SERVICE_NAME = 'vista-job-processor';

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
};

export function resolveFormat(): 'json' | 'text' {
  const format = (process.env.LOG_FORMAT || '').toLowerCase();
  if (format === 'json') return 'json';
  return 'text';
}

export const logger: Logger = pino(
  resolveFormat() === 'text'
    ? {
        ...baseOptions,
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname',
          },
        },
      }
    : baseOptions,
);

export function childLogger(
  bindings: Record<string, unknown> = {},
  level: LoggerOptions['level'] = resolveLevel(),
): Logger {
  return logger.child(bindings, { level });
}

/** Returns the base logger (used by non-HTTP workers like the processor). */
export function getLogger(): Logger {
  return logger;
}

export interface ExternalCallOptions {
  /** External system name, e.g. `openai`, `google-document-ai`. */
  service: string;
  /** Operation name, e.g. `process-document`, `chat.completions`. */
  operation: string;
  /** Additional non-sensitive context properties. */
  props?: Record<string, unknown>;
}

/**
 * Times and logs the lifecycle of an external integration call made by the
 * document pipeline (OCR / understanding providers). Failures are logged as
 * `warn` and rethrown so callers keep their failure semantics.
 */
export async function trackExternalCall<T>(
  options: ExternalCallOptions,
  fn: () => Promise<T>,
): Promise<T> {
  const log = getLogger();
  const base = {
    service: options.service,
    operation: options.operation,
    ...options.props,
  };
  log.info(base, 'Calling external service {service} for {operation}');
  const started = performance.now();
  try {
    const result = await fn();
    log.info(
      { ...base, durationMs: Math.round(performance.now() - started) },
      'External service {service} {operation} completed successfully',
    );
    return result;
  } catch (error) {
    log.warn(
      { ...base, durationMs: Math.round(performance.now() - started), err: error },
      'External service {service} {operation} failed after {durationMs} ms',
    );
    throw error;
  }
}

export type { Logger };

