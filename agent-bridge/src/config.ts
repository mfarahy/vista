/**
 * Environment-based configuration for the OpenCode agent bridge.
 */
export interface Config {
  /** Base URL of the running OpenCode server (`opencode serve`). */
  opencodeUrl: string;
  /** Maximum time (ms) to wait for an OpenCode agent response. */
  opencodeTimeoutMs: number;
  /** Base URL of the running Vista frontend used by the screenshot service. */
  appUrl: string;
  /** Maximum time (ms) to wait for a page to load before screenshotting. */
  screenshotTimeoutMs: number;
  /** Directory where captured screenshots are stored. */
  screenshotDir: string;
  /** Whether the screenshot browser runs headless (Chromium). */
  screenshotHeadless: boolean;
  host: string;
  port: number;
  logLevel: string;
  logFormat: 'json' | 'text';
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    opencodeUrl: (env.OPENCODE_URL || 'http://127.0.0.1:4096').replace(/\/$/, ''),
    opencodeTimeoutMs: Number(env.OPENCODE_TIMEOUT_MS || 600000),
    appUrl: (env.VISTA_APP_URL || 'http://localhost:3000').replace(/\/$/, ''),
    screenshotTimeoutMs: Number(env.SCREENSHOT_TIMEOUT_MS || 60000),
    screenshotDir: env.SCREENSHOT_DIR || './data/screenshots',
    screenshotHeadless: (env.SCREENSHOT_HEADLESS || 'true') !== 'false',
    host: env.HOST || '0.0.0.0',
    port: Number(env.PORT || 4200),
    logLevel: env.LOG_LEVEL || 'info',
    logFormat: (env.LOG_FORMAT || 'text') === 'json' ? 'json' : 'text',
  };
}
