import type { NatsConnection, Subscription } from 'nats';
import { StringCodec } from 'nats';
import type { JobDispatcher, JobHandlerResult, JobRunContext } from './dispatcher.js';
import { parseJobEvent } from './event.js';
import { jobRepo } from '../lib/jobRepo.js';
import { getLogger, type Logger } from '../lib/logger.js';
import { errorMessage } from '../lib/error.js';

export interface ConsumerOptions {
  nc: NatsConnection;
  dispatcher: JobDispatcher;
  /** Subject to subscribe to, e.g. `vista.jobs.>`. */
  subscriptionSubject: string;
  log?: Logger;
}

/**
 * Subscribes to the job subject wildcard and processes each message:
 * parse -> persist processing -> dispatch handler -> mark completed, or mark
 * failed. A failure in any single job is contained (logged, status = failed)
 * so the worker never crashes. Returns the active subscription.
 */
export async function startConsumer(options: ConsumerOptions): Promise<Subscription> {
  const log = options.log ?? getLogger();
  const nc = options.nc;

  const sub = nc.subscribe(options.subscriptionSubject);
  log.info(
    { subject: options.subscriptionSubject },
    'Consuming jobs from NATS subject {subject}',
  );

  void (async () => {
    for await (const msg of sub) {
      const jobLog = log.child({ correlationId: msg.subject });
      try {
        await handleMessage(options, jobLog, msg.subject, msg.data);
      } catch (error) {
        // Last-resort containment: a malformed handler/event must not kill the loop.
        jobLog.error({ err: error }, 'Unhandled error processing NATS message');
      }
    }
  })();

  return sub;
}

async function handleMessage(
  options: ConsumerOptions,
  log: Logger,
  subject: string,
  data: Uint8Array,
): Promise<void> {
  const decoded = StringCodec().decode(data);

  let event;
  try {
    event = parseJobEvent(JSON.parse(decoded));
  } catch (error) {
    log.warn({ subject, err: error }, 'Dropping malformed job event on {subject}');
    return;
  }

  log.info(
    { jobId: event.jobId, jobType: event.jobType, subject },
    'Job {jobId} received from {subject}',
  );
  await jobRepo.processing(event.jobId);

  const ctx: JobRunContext = {
    job: {
      jobId: event.jobId,
      jobType: event.jobType,
      payload: event.payload,
      metadata: event.metadata,
    },
    update: async (patch) => {
      await jobRepo.setStatus(event.jobId, {
        status: 'processing',
        progress: patch.progress,
        currentStep: patch.currentStep,
        message: patch.message,
      });
    },
    log,
  };

  log.info({ jobId: event.jobId }, 'Job {jobId} started');
  let result: JobHandlerResult;
  try {
    await options.dispatcher.dispatch(ctx);
    result = {};
  } catch (error) {
    const message = errorMessage(error, 'job processing failed');
    log.error({ jobId: event.jobId, err: error }, 'Job {jobId} failed: {message}');
    await jobRepo.failed(event.jobId, message);
    return;
  }

  log.info({ jobId: event.jobId }, 'Job {jobId} completed');
  await jobRepo.completed(event.jobId, result.message);
}
