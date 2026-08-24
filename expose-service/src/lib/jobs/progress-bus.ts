import type { Subscription } from 'nats';
import { StringCodec } from 'nats';
import { getNatsConnection } from './publisher.js';
import { parseJobProgress, type JobProgressEvent } from './progress-event.js';
import { getLogger } from '../logger.js';

export const progressSubjectPrefix = (
  process.env.NATS_PROGRESS_SUBJECT_PREFIX || 'vista.progress'
).replace(/\.$/, '');

export type ProgressListener = (event: JobProgressEvent) => void;

/**
 * In-memory subscription registry bridging NATS progress events to registered
 * SSE clients. A single wildcard subscription on `<prefix>.>` feeds a per-jobId
 * map of listeners. This is sufficient for the MVP: it is not a distributed
 * pub/sub (no Redis) and scales to the process's SSE connections.
 */
export class JobProgressBus {
  private readonly listeners = new Map<string, Set<ProgressListener>>();
  private sub: Subscription | null = null;
  private connecting: Promise<void> | null = null;

  /** Registers a listener for a job; returns an unsubscribe function. */
  subscribe(jobId: string, listener: ProgressListener): () => void {
    let set = this.listeners.get(jobId);
    if (!set) {
      set = new Set();
      this.listeners.set(jobId, set);
    }
    set.add(listener);
    this.connect().catch(() => undefined);
    return () => this.unsubscribe(jobId, listener);
  }

  /** Forwards a progress event to every listener registered for that job. */
  dispatch(event: JobProgressEvent): void {
    const set = this.listeners.get(event.jobId);
    if (!set) return;
    for (const listener of [...set]) {
      try {
        listener(event);
      } catch (error) {
        getLogger().warn({ jobId: event.jobId, err: error }, 'Progress listener failed');
      }
    }
  }

  private unsubscribe(jobId: string, listener: ProgressListener): void {
    const set = this.listeners.get(jobId);
    if (!set) return;
    set.delete(listener);
    if (set.size === 0) this.listeners.delete(jobId);
  }

  /** Establishes the wildcard NATS subscription once; idempotent. */
  private async connect(): Promise<void> {
    if (this.sub) return;
    if (this.connecting) return this.connecting;
    this.connecting = (async () => {
      const log = getLogger();
      const nc = await getNatsConnection();
      const subject = `${progressSubjectPrefix}.>`;
      log.info({ subject }, 'Subscribing to job progress events on {subject}');
      this.sub = nc.subscribe(subject);
      void (async () => {
        for await (const msg of this.sub!) {
          try {
            const event = parseJobProgress(JSON.parse(StringCodec().decode(msg.data)));
            this.dispatch(event);
          } catch (error) {
            log.warn({ subject: msg.subject, err: error }, 'Dropping malformed progress event');
          }
        }
      })();
    })().finally(() => {
      this.connecting = null;
    });
    return this.connecting;
  }

  /** Unsubscribes and clears all listeners (used by tests and shutdown). */
  async close(): Promise<void> {
    if (this.sub) {
      try {
        await this.sub.unsubscribe();
      } catch {
        /* already closed */
      }
      this.sub = null;
    }
    this.listeners.clear();
  }
}

let bus: JobProgressBus | null = null;

/** Returns the shared process-wide progress bus (lazily created). */
export function getJobProgressBus(): JobProgressBus {
  if (!bus) bus = new JobProgressBus();
  return bus;
}

/** Resets the singleton (primarily for tests). */
export function resetProgressBus(): void {
  bus = null;
}
