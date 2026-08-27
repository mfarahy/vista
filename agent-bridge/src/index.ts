import dotenv from 'dotenv';
import { loadConfig } from './config.js';
import { createApp } from './app.js';
import { getLogger } from './lib/logger.js';
import { createSdkOpenCodeClient, OpenCodeError } from './lib/opencode.js';

dotenv.config();

async function main(): Promise<void> {
  const config = loadConfig();
  const log = getLogger();

  log.info(
    { opencodeUrl: config.opencodeUrl, timeoutMs: config.opencodeTimeoutMs, port: config.port },
    'Starting agent bridge: opencode=%s timeoutMs=%s port=%s',
    config.opencodeUrl,
    config.opencodeTimeoutMs,
    config.port,
  );

  const opencode = createSdkOpenCodeClient({
    url: config.opencodeUrl,
    timeoutMs: config.opencodeTimeoutMs,
  });

  // Probe the OpenCode server once at startup. A missing server is not fatal
  // (it may start later); requests fail with 503 until it is reachable.
  try {
    const health = await opencode.health();
    log.info(
      { healthy: health.healthy, version: health.version },
      'Connected to OpenCode server (version %s)',
      health.version ?? 'unknown',
    );
  } catch (error) {
    log.warn(
      { err: error },
      'OpenCode server not reachable at startup: %s',
      error instanceof OpenCodeError ? error.message : String(error),
    );
  }

  const app = createApp({ opencode });
  const server = app.listen(config.port, config.host, () => {
    log.info(
      { host: config.host, port: config.port },
      'Agent bridge listening on %s:%s',
      config.host,
      config.port,
    );
  });

  const shutdown = async (signal: string) => {
    log.info({ signal }, 'Received %s, shutting down', signal);
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    log.info('Agent bridge stopped');
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((error) => {
  getLogger().error({ err: error }, 'Agent bridge failed to start: %s', String(error));
  process.exit(1);
});
