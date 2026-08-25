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
  if (['text', 'pretty'].includes(format)) return 'text';
  return 'json';
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

export type { Logger };

