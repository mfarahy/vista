import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { randomUUID } from 'node:crypto';
import { getLogger } from '../logger.js';
import type { JobStatus } from './status.js';

let prisma: PrismaClient | null = null;

/**
 * Lazily-instantiated Prisma client. Connecting is deferred until the first
 * job query so creating the app (including in tests that never touch jobs)
 * does not require a database connection.
 */
export function getPrisma(): PrismaClient {
  if (!prisma) {
    const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
    prisma = new PrismaClient({ adapter });
  }
  return prisma;
}

export async function closePrisma(): Promise<void> {
  if (prisma) {
    await prisma.$disconnect();
    prisma = null;
  }
}

/** A job as persisted in the database (matches the Prisma `Job` model). */
export type JobRecord = Prisma.JobGetPayload<Record<string, never>>;

export interface CreateJobInput {
  readonly type: string;
  readonly payload?: unknown;
  readonly metadata?: Record<string, unknown>;
}

export interface JobStatusPatch {
  readonly status?: JobStatus;
  readonly progress?: number;
  readonly currentStep?: string;
  readonly message?: string;
  readonly error?: string;
}

/**
 * PostgreSQL/Prisma-backed repository for job records. expose-service creates
 * and reads jobs; job-processor advances their status.
 */
export const jobStore = {
  /** Persists a new job as `queued` and returns it. */
  async create(input: CreateJobInput): Promise<JobRecord> {
    const id = randomUUID();
    const record = await getPrisma().job.create({
      data: {
        id,
        type: input.type,
        status: 'queued',
        payload: (input.payload ?? {}) as Prisma.InputJsonValue,
        metadata: input.metadata as Prisma.InputJsonValue | undefined,
      },
    });
    getLogger().info({ jobId: record.id, type: record.type }, 'Created job {jobId} as queued');
    return record;
  },

  async get(id: string): Promise<JobRecord | null> {
    return getPrisma().job.findUnique({ where: { id } });
  },

  /** Advances a persisted job's status/progress. */
  async updateStatus(id: string, patch: JobStatusPatch): Promise<JobRecord | null> {
    const data: Prisma.JobUpdateInput = {};
    if (patch.status) data.status = patch.status;
    if (patch.progress !== undefined) data.progress = patch.progress;
    if (patch.currentStep !== undefined) data.currentStep = patch.currentStep;
    if (patch.message !== undefined) data.message = patch.message;
    if (patch.error !== undefined) data.error = patch.error;
    const record = await getPrisma().job.update({ where: { id }, data });
    getLogger().info({ jobId: id, status: record.status }, 'Updated job {jobId} -> {status}');
    return record;
  },
};
