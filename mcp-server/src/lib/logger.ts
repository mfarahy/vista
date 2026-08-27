import { pino, type Logger, type LoggerOptions } from 'pino';

const SERVICE_NAME = 'vista-mcp-supervisor';

function resolveLevel(env: NodeJS.ProcessEnv = process.env): LoggerOptions['level'] {
  if (env.LOG_LEVEL) {
    const level = env.LOG_LEVEL.toLowerCase();
    if (['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'].includes(level)) {
      return level as LoggerOptions['level'];
    }
  }
  if (env.NODE_ENV === 'production') return 'info';
  if (
    env.NODE_ENV === 'test' ||
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

export function resolveFormat(env: NodeJS.ProcessEnv = process.env): 'json' | 'text' {
  const format = (env.LOG_FORMAT || '').toLowerCase();
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

/** Returns the base logger (the MCP server has no request-scoped storage). */
export function getLogger(): Logger {
  return logger;
}

export type { Logger };
