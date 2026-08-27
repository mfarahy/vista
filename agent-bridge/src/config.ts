/**
 * Environment-based configuration for the OpenCode agent bridge.
 */
export interface Config {
  /** Base URL of the running OpenCode server (`opencode serve`). */
  opencodeUrl: string;
  /** Maximum time (ms) to wait for an OpenCode agent response. */
  opencodeTimeoutMs: number;
  host: string;
  port: number;
  logLevel: string;
  logFormat: 'json' | 'text';
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    opencodeUrl: (env.OPENCODE_URL || 'http://127.0.0.1:4096').replace(/\/$/, ''),
    opencodeTimeoutMs: Number(env.OPENCODE_TIMEOUT_MS || 600000),
    host: env.HOST || '0.0.0.0',
    port: Number(env.PORT || 4200),
    logLevel: env.LOG_LEVEL || 'info',
    logFormat: (env.LOG_FORMAT || 'text') === 'json' ? 'json' : 'text',
  };
}
