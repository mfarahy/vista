type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const isProduction = process.env.NODE_ENV === 'production';

function write(level: LogLevel, message: string, props?: Record<string, unknown>) {
  const entry: Record<string, unknown> = {
    service: 'vista-frontend',
    env: process.env.NODE_ENV || 'development',
    level,
    msg: message,
    ...props,
  };
  // Server-side (SSR/Node) emits JSON lines to match the backend's stream;
  // the browser logs the object so it stays readable in DevTools.
  if (typeof window === 'undefined') {
    const line = JSON.stringify(entry);
    if (level === 'error') console.error(line);
    else if (level === 'warn') console.warn(line);
    else if (level === 'info') console.info(line);
    else console.debug(line);
    return;
  }
  if (level === 'error') console.error(entry);
  else if (level === 'warn') console.warn(entry);
  else if (level === 'info') console.info(entry);
  else if (!isProduction) console.debug(entry);
}

/** Small isomorphic structured logger for the Next.js frontend. */
export const frontendLogger = {
  debug: (message: string, props?: Record<string, unknown>) => write('debug', message, props),
  info: (message: string, props?: Record<string, unknown>) => write('info', message, props),
  warn: (message: string, props?: Record<string, unknown>) => write('warn', message, props),
  error: (message: string, props?: Record<string, unknown>) => write('error', message, props),
};