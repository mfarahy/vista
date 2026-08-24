import { connect, type NatsConnection } from 'nats';
import { loadConfig } from './config.js';
import { getLogger, type Logger } from './lib/logger.js';

let connection: NatsConnection | null = null;
let connected = false;

export function natsConnected(): boolean {
  return Boolean(connection && connected && !connection.isClosed());
}

export interface ConnectNatsOptions {
  /**
   * Maximum connection attempts. Negative (default) retries forever so a
   * transient outage (cluster rollout, DNS not yet propagated) never kills the
   * worker; `/ready` reports not-ready until the connection succeeds.
   */
  retries?: number;
  /** Base delay between attempts in ms (exponential backoff, capped). */
  retryBaseMs?: number;
}

/** Resolves with a small bounded backoff delay for the given retry index. */
export function retryDelayMs(retries: number, baseMs: number): number {
  const multiplier = 2 ** Math.min(retries, 6);
  return baseMs * multiplier;
}

/**
 * Connects to NATS and returns the shared connection used by the consumer.
 * Retries (with backoff) when the broker is unreachable so a DNS/startup race
 * does not crash the worker; every attempt is logged with context. After
 * connecting, the shared connection lifecycle (close / failure) is logged.
 */
export async function connectNats(
  options: ConnectNatsOptions = {},
  log: Logger = getLogger(),
): Promise<NatsConnection> {
  const config = loadConfig();
  const maxRetries = options.retries ?? -1;
  const baseMs = options.retryBaseMs ?? 2000;
  let attempt = 0;
  let lastError: unknown;

  while (maxRetries < 0 || attempt < maxRetries) {
    attempt += 1;
    const natsUrl = config.natsUrl;
    const attemptLabel = maxRetries < 0 ? `attempt ${attempt}` : `attempt ${attempt}/${maxRetries}`;
    try {
      log.info({ natsUrl, attempt }, 'Connecting job-processor to NATS at %s (%s)', natsUrl, attemptLabel);
      const nc = await connect({ servers: natsUrl });
      connected = true;
      connection = nc;
      log.info(
        {
          natsUrl,
          serverId: nc.info?.server_id,
          serverHost: nc.info?.host,
          serverPort: nc.info?.port,
        },
        'NATS connection established at %s (server %s)',
        natsUrl,
        nc.info?.server_id ?? 'unknown',
      );

      void nc.closed()
        .then((err) => {
          connected = false;
          log.warn(
            { err, natsUrl },
            'NATS connection closed; the client will not reconnect automatically',
          );
        })
        .catch((err) => {
          connected = false;
          log.error({ err, natsUrl }, 'NATS connection terminated with an error');
        });

      return nc;
    } catch (error) {
      lastError = error;
      connected = false;
      const nextMs = retryDelayMs(attempt - 1, baseMs);
      log.warn(
        { err: error, natsUrl, attempt, nextRetryMs: nextMs },
        'NATS connection attempt failed; retrying in %sms',
        nextMs,
      );
      await new Promise((resolve) => setTimeout(resolve, nextMs));
    }
  }

  log.error(
    { err: lastError, natsUrl: config.natsUrl, attempts: attempt },
    'Could not connect to NATS after %s attempts',
    attempt,
  );
  throw lastError;
}

export async function disconnectNats(nc: NatsConnection, log: Logger = getLogger()): Promise<void> {
  connected = false;
  if (!nc.isClosed()) {
    log.info('Draining NATS connection');
    await nc.drain();
    log.info('NATS connection drained');
  } else {
    log.info('NATS connection already closed');
  }
}