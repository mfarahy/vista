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
 * so the worker never crashes. Malformed events are dropped with a warning.
 * Returns the active subscription.
 */
export async function startConsumer(options: ConsumerOptions): Promise<Subscription> {
  const log = options.log ?? getLogger();
  const nc = options.nc;

  const sub = nc.subscribe(options.subscriptionSubject);
  log.info(
    { subject: options.subscriptionSubject },
    'Consuming jobs from NATS subject %s',
    options.subscriptionSubject,
  );

  void (async () => {
    let received = 0;
    for await (const msg of sub) {
      received += 1;
      log.debug(
        { subject: msg.subject, sizeBytes: msg.data.length, received },
        'NATS message %s received from %s',
        received,
        msg.subject,
      );
      const jobLog = log.child({ correlationId: msg.subject });
      try {
        await handleMessage(options, jobLog, msg.subject, msg.data);
      } catch (error) {
        // Last-resort containment: a malformed handler/event must not kill the loop.
        jobLog.error({ err: error }, 'Unhandled error processing NATS message');
      }
    }
  })();

  void nc.closed().then(() => {
    log.warn('NATS consumer loop ended (connection closed)');
  });

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
    log.warn(
      { subject, err: error, sizeBytes: data.length },
      'Dropping malformed job event on %s (not JSON or missing required fields)',
      subject,
    );
    return;
  }

  const { jobId, jobType } = event;
  log.info({ jobId, jobType, subject }, 'Job %s (%s) received from %s', jobId, jobType, subject);

  await jobRepo.processing(jobId);

  const ctx: JobRunContext = {
    job: {
      jobId: event.jobId,
      jobType: event.jobType,
      payload: event.payload,
      metadata: event.metadata,
    },
    update: async (patch) => {
      await jobRepo.setStatus(jobId, {
        status: 'processing',
        progress: patch.progress,
        currentStep: patch.currentStep,
        message: patch.message,
      });
    },
    log,
  };

  log.info(
    { jobId, jobType },
    'Running handler for job %s (%s)',
    jobId,
    jobType,
  );
  const startedAt = Date.now();
  let result: JobHandlerResult;
  try {
    await options.dispatcher.dispatch(ctx);
    result = {};
  } catch (error) {
    const message = errorMessage(error, 'job processing failed');
    const durationMs = Date.now() - startedAt;
    log.error(
      { jobId, jobType, err: error, durationMs },
      'Job %s (%s) failed after %sms: %s',
      jobId,
      jobType,
      durationMs,
      message,
    );
    await jobRepo.failed(jobId, message);
    return;
  }

  const durationMs = Date.now() - startedAt;
  log.info(
    { jobId, jobType, durationMs, message: result.message },
    'Job %s (%s) completed in %sms%s',
    jobId,
    jobType,
    durationMs,
    result.message ? `: ${result.message}` : '',
  );
  await jobRepo.completed(jobId, result.message);
}