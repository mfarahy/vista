import fs from 'node:fs/promises';
import path from 'node:path';
import { uploadPath } from './store.js';
import { getLogger } from './logger.js';

/**
 * Object storage for Vista 360 media (floorplan originals + 360 panoramas).
 * Mirrors the property-document storage (`document-storage.ts`) but keys
 * objects by an explicit `key` (e.g. `floorplans/{id}/original.png`) instead
 * of a fixed `documents/{id}` prefix, so the floorplan/panorama workflows can
 * use the clean, predictable key structure they want.
 *
 * The backing store (local disk for dev/tests, Cloudflare R2 / any
 * S3-compatible bucket for production) is selected by the same
 * `DOCUMENT_STORAGE_PROVIDER` env var the document pipeline uses, so a
 * deployment keeps a single storage provider.
 */

export interface ReadableObject {
  content: Buffer;
  mimeType: string;
}

export interface MediaStorage {
  put(key: string, content: Buffer, mimeType: string): Promise<void>;
  get(key: string): Promise<ReadableObject | null>;
  delete(key: string): Promise<void>;
}

/** Filesystem-backed storage (dev / tests). Mirrors LocalDocumentStorage. */
export class LocalMediaStorage implements MediaStorage {
  constructor(private readonly dir: string = uploadPath) {}

  async put(key: string, content: Buffer): Promise<void> {
    const filePath = this.filePathFor(key);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content);
  }

  async get(key: string): Promise<ReadableObject | null> {
    try {
      const content = await fs.readFile(this.filePathFor(key));
      return { content, mimeType: '' };
    } catch {
      return null;
    }
  }

  async delete(key: string): Promise<void> {
    await fs.rm(this.filePathFor(key), { force: true });
  }

  private filePathFor(key: string): string {
    return path.join(this.dir, key);
  }
}

/** S3-compatible object storage, configured for Cloudflare R2 out of the box. */
export interface R2MediaStorageOptions {
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

export class R2MediaStorage implements MediaStorage {
  constructor(private readonly options: R2MediaStorageOptions) {}

  async put(key: string, content: Buffer, mimeType: string): Promise<void> {
    const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');
    const client = new S3Client(this.s3Config()) as unknown as S3ClientLike;
    await client.send(
      new PutObjectCommand({
        Bucket: this.options.bucket,
        Key: key,
        Body: content,
        ContentType: mimeType || undefined,
      }) as never,
    );
  }

  async get(key: string): Promise<ReadableObject | null> {
    const { S3Client, GetObjectCommand } = await import('@aws-sdk/client-s3');
    const client = new S3Client(this.s3Config()) as unknown as S3ClientLike;
    try {
      const result = (await client.send(
        new GetObjectCommand({ Bucket: this.options.bucket, Key: key }) as never,
      )) as { Body?: { transformToByteArray(): Promise<Uint8Array> }; ContentType?: string };
      const content = result.Body
        ? Buffer.from(await result.Body.transformToByteArray())
        : Buffer.alloc(0);
      return { content, mimeType: result.ContentType ?? '' };
    } catch (error) {
      getLogger().warn({ err: error, key }, 'Failed to read object {key} from R2');
      return null;
    }
  }

  async delete(key: string): Promise<void> {
    const { S3Client, DeleteObjectCommand } = await import('@aws-sdk/client-s3');
    const client = new S3Client(this.s3Config()) as unknown as S3ClientLike;
    await client.send(new DeleteObjectCommand({ Bucket: this.options.bucket, Key: key }) as never);
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
}

export function createR2MediaStorage(env: NodeJS.ProcessEnv = process.env): R2MediaStorage {
  // Both the generic R2_* names and the Cloudflare CI names are accepted so
  // the same code runs locally and in the pipeline without code changes.
  const options: R2MediaStorageOptions = {
    endpoint: env.R2_ENDPOINT || env.CLOUDFLARE_S3_API_ENDPOINT || '',
    bucket: env.R2_BUCKET || env.CLOUDFLARE_R2_BUCKET || env.DOCUMENT_STORAGE_BUCKET || '',
    accessKeyId: env.R2_ACCESS_KEY_ID || env.CLOUDFLARE_ACCESS_KEY_ID || '',
    secretAccessKey: env.R2_SECRET_ACCESS_KEY || env.CLOUDFLARE_SECRET_ACCESS_KEY || '',
    region: env.R2_REGION || env.CLOUDFLARE_REGION,
  };
  if (!options.endpoint || !options.bucket || !options.accessKeyId || !options.secretAccessKey) {
    throw new Error(
      'R2 media storage requires an endpoint, bucket, access key id and secret access key. ' +
        'Set DOCUMENT_STORAGE_PROVIDER=r2 and provide CLOUDFLARE_S3_API_ENDPOINT, ' +
        'CLOUDFLARE_R2_BUCKET (or DOCUMENT_STORAGE_BUCKET), CLOUDFLARE_ACCESS_KEY_ID and ' +
        'CLOUDFLARE_SECRET_ACCESS_KEY (or the R2_* equivalents).',
    );
  }
  return new R2MediaStorage(options);
}

/** Selects the media storage provider (same env var as document storage). */
export function mediaStorageProvider(env: NodeJS.ProcessEnv = process.env): 'local' | 'r2' {
  return (env.DOCUMENT_STORAGE_PROVIDER || 'local').toLowerCase() === 'r2' ? 'r2' : 'local';
}

/**
 * Returns the configured media storage. The provider is selected by
 * `DOCUMENT_STORAGE_PROVIDER` (`local` by default, `r2` for Cloudflare R2),
 * so it can be swapped at deploy time without changing callers.
 */
export function createMediaStorage(env: NodeJS.ProcessEnv = process.env): MediaStorage {
  return mediaStorageProvider(env) === 'r2' ? createR2MediaStorage(env) : new LocalMediaStorage();
}
