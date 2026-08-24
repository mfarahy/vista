import { connect, type NatsConnection, type PublishOptions } from 'nats';
import { getLogger } from '../logger.js';
import type { JobEvent } from './event.js';

const natsUrl = process.env.NATS_URL || 'nats://localhost:4222';
const subjectPrefix = (process.env.NATS_SUBJECT_PREFIX || 'vista.jobs').replace(/\.$/, '');

/** Lazily-created, shared NATS connection reused across publishes. */
let connection: NatsConnection | null = null;
let connecting: Promise<NatsConnection> | null = null;

export async function getNatsConnection(): Promise<NatsConnection> {
  if (connection && !connection.isClosed()) return connection;
  if (connecting) return connecting;
  connecting = (async () => {
    const log = getLogger();
    log.info({ natsUrl, subjectPrefix }, 'Connecting to NATS at {natsUrl}');
    const nc = await connect({ servers: natsUrl });
    log.info('NATS connection established');
    const onDisconnect = () => log.warn('NATS connection closed');
    nc.closed()
      .then(() => {
        connection = null;
        onDisconnect();
      })
      .catch((err) => {
        connection = null;
        log.error({ err }, 'NATS connection failed');
      });
    connection = nc;
    return nc;
  })().finally(() => {
    connecting = null;
  });
  return connecting;
}

export function jobSubject(jobType: string): string {
  return `${subjectPrefix}.${jobType}`;
}

/** Publishes a job event to the per-type NATS subject. */
export async function publishJob(event: JobEvent, options?: PublishOptions): Promise<void> {
  const nc = await getNatsConnection();
  nc.publish(jobSubject(event.jobType), JSON.stringify(event), options);
  getLogger().info(
    { jobId: event.jobId, jobType: event.jobType, subject: jobSubject(event.jobType) },
    'Published job {jobId} to {subject}',
  );
}

/** Closes the shared NATS connection (used by tests and graceful shutdown). */
export async function closeNats(): Promise<void> {
  if (connection && !connection.isClosed()) {
    await connection.drain();
  }
  connection = null;
  connecting = null;
}

export { natsUrl, subjectPrefix };
