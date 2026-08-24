import { connect, type NatsConnection } from 'nats';
import { loadConfig } from './config.js';
import { getLogger, type Logger } from './lib/logger.js';

let connection: NatsConnection | null = null;
let connected = false;

export function natsConnected(): boolean {
  return Boolean(connection && connected && !connection.isClosed());
}

/** Connects to NATS and returns the shared connection used by the consumer. */
export async function connectNats(log: Logger = getLogger()): Promise<NatsConnection> {
  const config = loadConfig();
  log.info({ natsUrl: config.natsUrl }, 'Connecting job-processor to NATS at {natsUrl}');
  const nc = await connect({ servers: config.natsUrl });
  connected = true;
  log.info({ natsUrl: config.natsUrl }, 'NATS connection established');
  connection = nc;

  void nc.closed()
    .then(() => {
      connected = false;
      log.warn('NATS connection closed');
    })
    .catch((err) => {
      connected = false;
      log.error({ err }, 'NATS connection failed');
    });

  return nc;
}

export async function disconnectNats(nc: NatsConnection): Promise<void> {
  connected = false;
  if (!nc.isClosed()) {
    await nc.drain();
  }
}
