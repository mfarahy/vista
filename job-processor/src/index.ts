import dotenv from 'dotenv';
import { loadConfig } from './config.js';
import { logger } from './lib/logger.js';
import { connectNats, disconnectNats, natsConnected } from './nats.js';
import { startConsumer } from './jobs/consumer.js';
import { createDefaultDispatcher } from './jobs/registry.js';
import { startHealthServer } from './health.js';
import { disconnectPrisma } from './lib/db.js';

dotenv.config();

async function main(): Promise<void> {
  const config = loadConfig();

  // Bootstrap context — deliberately excludes DATABASE_URL (a secret) and
  // only reports whether it is configured so credential values never hit logs.
  logger.info(
    {
      natsUrl: config.natsUrl,
      subscriptionSubject: config.subscriptionSubject,
      exposeServiceUrl: config.exposeServiceUrl,
      logLevel: config.logLevel,
      databaseConfigured: Boolean(config.databaseUrl),
    },
    'Starting job-processor: nats=%s subject=%s api=%s logLevel=%s',
    config.natsUrl,
    config.subscriptionSubject,
    config.exposeServiceUrl,
    config.logLevel,
  );

  // connectNats retries (with backoff) so a temporarily unreachable broker
  // (rollouts, DNS propagation) does not kill the worker at startup.
  const nc = await connectNats();
  const dispatcher = createDefaultDispatcher();
  const sub = await startConsumer({
    nc,
    dispatcher,
    subscriptionSubject: config.subscriptionSubject,
  });

  const healthServer = startHealthServer();

  logger.info(
    {
      natsUrl: config.natsUrl,
      subject: config.subscriptionSubject,
      handlers: dispatcher.list(),
      ready: natsConnected(),
    },
    'job-processor started; listening on %s with handlers: %s',
    config.subscriptionSubject,
    dispatcher.list().join(', '),
  );

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Received %s, shutting down', signal);
    try {
      await sub.unsubscribe();
      logger.info('Consumer unsubscribed');
    } catch {
      /* already closed */
    }
    try {
      await new Promise<void>((resolve, reject) => {
        healthServer.close((error) => (error ? reject(error) : resolve()));
      });
      logger.info('Health server closed');
    } catch {
      logger.warn('Health server close failed or was already closed');
    }
    await disconnectNats(nc);
    await disconnectPrisma();
    logger.info('Shutdown complete');
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((error) => {
  logger.error({ err: error }, 'job-processor failed to start: %s', errorMessage(error));
  process.exit(1);
});

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : String(error);
}