import fs from 'node:fs/promises';
import path from 'node:path';
import { uploadPath } from './store.js';
import { getLogger } from './logger.js';

/**
 * Storage abstraction for property-document bytes. The producer
 * (expose-service) writes document files here on upload; the worker reads and
 * writes the same files while processing. Keeping the file bytes behind this
 * interface means the backing store (local disk, Cloudflare R2 / any S3-compatible
 * bucket, …) can be swapped without touching the routes or the job handler.
 *
 * Objects are keyed by the document id, which is a UUID and therefore a safe
 * object / file name.
 */
export interface ReadableFile {
  content: Buffer;
  mimeType: string;
}

export interface DocumentStorage {
  put(documentId: string, content: Buffer, mimeType: string): Promise<void>;
  get(documentId: string): Promise<ReadableFile | null>;
  delete(documentId: string): Promise<void>;
}

/** Filesystem-backed storage (dev / tests). Mirrors the previous upload behaviour. */
export class LocalDocumentStorage implements DocumentStorage {
  constructor(private readonly dir: string = uploadPath) {}

  async put(documentId: string, content: Buffer): Promise<void> {
    await fs.mkdir(this.dir, { recursive: true });
    await fs.writeFile(this.filePathFor(documentId), content);
  }

  async get(documentId: string): Promise<ReadableFile | null> {
    try {
      const content = await fs.readFile(this.filePathFor(documentId));
      return { content, mimeType: '' };
    } catch {
      return null;
    }
  }

  async delete(documentId: string): Promise<void> {
    await fs.rm(this.filePathFor(documentId), { force: true });
  }

  private filePathFor(documentId: string): string {
    return path.join(this.dir, path.basename(documentId));
  }
}

/** S3-compatible object storage, configured for Cloudflare R2 out of the box. */
export interface R2StorageOptions {
  endpoint: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  region?: string;
}

type S3ClientLike = {
  send(command: {
    input: Record<string, unknown>;
    constructor: { name: string };
  }): Promise<unknown>;
};


export class R2DocumentStorage implements DocumentStorage {
  constructor(private readonly options: R2StorageOptions) {}

  async put(documentId: string, content: Buffer, mimeType: string): Promise<void> {
    const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');
    const client = new S3Client(this.s3Config()) as unknown as S3ClientLike;
    await client.send(
      new PutObjectCommand({
        Bucket: this.options.bucket,
        Key: this.keyFor(documentId),
        Body: content,
        ContentType: mimeType || undefined,
      }) as never,
    );
  }

  async get(documentId: string): Promise<ReadableFile | null> {
    const { S3Client, GetObjectCommand } = await import('@aws-sdk/client-s3');
    const client = new S3Client(this.s3Config()) as unknown as S3ClientLike;
    try {
      const result = (await client.send(
        new GetObjectCommand({ Bucket: this.options.bucket, Key: this.keyFor(documentId) }) as never,
      )) as { Body?: { transformToByteArray(): Promise<Uint8Array> }; ContentType?: string };
      const content = result.Body
        ? Buffer.from(await result.Body.transformToByteArray())
        : Buffer.alloc(0);
      return { content, mimeType: result.ContentType ?? '' };
    } catch (error) {
      getLogger().warn({ err: error, documentId }, 'Failed to read document {documentId} from R2');
      return null;
    }
  }

  async delete(documentId: string): Promise<void> {
    const { S3Client, DeleteObjectCommand } = await import('@aws-sdk/client-s3');
    const client = new S3Client(this.s3Config()) as unknown as S3ClientLike;
    await client.send(
      new DeleteObjectCommand({ Bucket: this.options.bucket, Key: this.keyFor(documentId) }) as never,
    );
  }

  private s3Config(): Record<string, unknown> {
    return {
      endpoint: this.options.endpoint,
      region: this.options.region ?? 'auto',
      credentials: {
        accessKeyId: this.options.accessKeyId,
        secretAccessKey: this.options.secretAccessKey,
      },
      forcePathStyle: true,
    };
  }

  private keyFor(documentId: string): string {
    return `documents/${documentId}`;
  }
}

export function createR2DocumentStorage(env: NodeJS.ProcessEnv = process.env): R2DocumentStorage {
  // Both the generic R2_* names and the Cloudflare CI names are accepted so
  // the same code runs locally and in the pipeline without code changes.
  const options: R2StorageOptions = {
    endpoint: env.R2_ENDPOINT || env.CLOUDFLARE_S3_API_ENDPOINT || '',
    bucket: env.R2_BUCKET || env.CLOUDFLARE_R2_BUCKET || env.DOCUMENT_STORAGE_BUCKET || '',
    accessKeyId: env.R2_ACCESS_KEY_ID || env.CLOUDFLARE_ACCESS_KEY_ID || '',
    secretAccessKey: env.R2_SECRET_ACCESS_KEY || env.CLOUDFLARE_SECRET_ACCESS_KEY || '',
    region: env.R2_REGION || env.CLOUDFLARE_REGION,
  };
  if (!options.endpoint || !options.bucket || !options.accessKeyId || !options.secretAccessKey) {
    throw new Error(
      'R2 document storage requires an endpoint, bucket, access key id and secret access key. ' +
        'Set DOCUMENT_STORAGE_PROVIDER=r2 and provide CLOUDFLARE_S3_API_ENDPOINT, ' +
        'CLOUDFLARE_R2_BUCKET (or DOCUMENT_STORAGE_BUCKET), CLOUDFLARE_ACCESS_KEY_ID and ' +
        'CLOUDFLARE_SECRET_ACCESS_KEY (or the R2_* equivalents).',
    );
  }
  return new R2DocumentStorage(options);
}

export type DocumentStorageProvider = 'local' | 'r2';

export function documentStorageProvider(env: NodeJS.ProcessEnv = process.env): DocumentStorageProvider {
  const provider = (env.DOCUMENT_STORAGE_PROVIDER || 'local').toLowerCase();
  if (provider === 'r2') return 'r2';
  return 'local';
}

/**
 * Returns the configured document storage. The provider is selected by
 * `DOCUMENT_STORAGE_PROVIDER` (`local` by default, `r2` for Cloudflare R2),
 * so it can be swapped at deploy time without changing callers.
 */
export function createDocumentStorage(env: NodeJS.ProcessEnv = process.env): DocumentStorage {
  return documentStorageProvider(env) === 'r2'
    ? createR2DocumentStorage(env)
    : new LocalDocumentStorage();
}
