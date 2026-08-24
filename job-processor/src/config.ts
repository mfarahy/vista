/**
 * Environment-based configuration for the job-processor worker.
 */
export interface Config {
  natsUrl: string;
  subjectPrefix: string;
  /** NATS subject this worker subscribes to (the prefix + `>` wildcard). */
  subscriptionSubject: string;
  databaseUrl: string;
  /** Base URL of expose-service (the API service), used by the document-processing handler to invoke its worker endpoints. */
  exposeServiceUrl: string;
  host: string;
  port: number;
  logLevel: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const subjectPrefix = (env.NATS_SUBJECT_PREFIX || 'vista.jobs').replace(/\.$/, '');
  return {
    natsUrl: env.NATS_URL || 'nats://localhost:4222',
    subjectPrefix,
    subscriptionSubject: `${subjectPrefix}.>`,
    databaseUrl: env.DATABASE_URL || '',
    exposeServiceUrl: env.EXPOSE_SERVICE_URL || 'http://localhost:4000',
    host: env.HOST || '0.0.0.0',
    port: Number(env.PORT || 4100),
    logLevel: env.LOG_LEVEL || 'info',
  };
}
