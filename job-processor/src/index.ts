import dotenv from 'dotenv';
import { loadConfig } from './config.js';
import { logger } from './lib/logger.js';
import { connectNats, disconnectNats } from './nats.js';
import { startConsumer } from './jobs/consumer.js';
import { createDefaultDispatcher } from './jobs/registry.js';
import { startHealthServer } from './health.js';
import { disconnectPrisma } from './lib/db.js';

dotenv.config();

async function main(): Promise<void> {
  const config = loadConfig();
  const nc = await connectNats();
  const dispatcher = createDefaultDispatcher();
  const sub = await startConsumer({
    nc,
    dispatcher,
    subscriptionSubject: config.subscriptionSubject,
  });

  startHealthServer();

  logger.info(
    {
      natsUrl: config.natsUrl,
      subject: config.subscriptionSubject,
      handlers: dispatcher.list(),
    },
    'job-processor started; listening on {subject} with handlers: {handlers}',
  );

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Received {signal}, shutting down');
    try {
      await sub.unsubscribe();
    } catch {
      /* already closed */
    }
    await disconnectNats(nc);
    await disconnectPrisma();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((error) => {
  logger.error({ err: error }, 'job-processor failed to start');
  process.exit(1);
});
