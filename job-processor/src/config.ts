/**
 * Environment-based configuration for the job-processor worker.
 */
export interface Config {
  natsUrl: string;
  subjectPrefix: string;
  /** NATS subject this worker subscribes to (the prefix + `>` wildcard). */
  subscriptionSubject: string;
  /** NATS subject prefix used to publish job progress events (`<prefix>.<jobId>`). */
  progressSubjectPrefix: string;
  databaseUrl: string;
  host: string;
  port: number;
  logLevel: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const subjectPrefix = (env.NATS_SUBJECT_PREFIX || 'vista.jobs').replace(/\.$/, '');
  const progressSubjectPrefix = (env.NATS_PROGRESS_SUBJECT_PREFIX || 'vista.progress').replace(
    /\.$/,
    '',
  );
  return {
    natsUrl: env.NATS_URL || 'nats://localhost:4222',
    subjectPrefix,
    subscriptionSubject: `${subjectPrefix}.>`,
    progressSubjectPrefix,
    databaseUrl: env.DATABASE_URL || '',
    host: env.HOST || '0.0.0.0',
    port: Number(env.PORT || 4100),
    logLevel: env.LOG_LEVEL || 'info',
  };
}
