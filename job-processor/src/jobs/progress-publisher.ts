import type { NatsConnection } from 'nats';
import { StringCodec } from 'nats';
import { loadConfig } from '../config.js';
import { getLogger } from '../lib/logger.js';
import type { JobProgressEvent } from './progress-event.js';

/** Builds the per-job subject progress events are published to. */
export function progressSubject(jobId: string): string {
  const prefix = loadConfig().progressSubjectPrefix;
  return `${prefix}.${jobId}`;
}

/**
 * Publishes a job progress event to NATS. Best-effort: a failed publish is
 * logged and swallowed so the consumer pipeline is never blocked by it.
 */
export function publishJobProgress(nc: NatsConnection, event: JobProgressEvent): void {
  try {
    nc.publish(progressSubject(event.jobId), StringCodec().encode(JSON.stringify(event)));
  } catch (error) {
    getLogger().warn({ jobId: event.jobId, err: error }, 'Failed to publish progress for {jobId}');
  }
}
