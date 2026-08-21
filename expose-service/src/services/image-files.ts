import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { addImage, removeImage, uploadPath } from '../lib/store.js';
import type { PropertyImage } from '../lib/types.js';
import { isAllowedImageMime, MAX_IMAGE_BYTES } from '../lib/upload.js';

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '');
}

export interface UploadFile {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

export interface UploadMeta {
  category: 'exterior' | 'interior' | 'floor_plan' | 'document';
  subcategory?: string | null;
  caption?: string | null;
}

export async function persistImages(
  propertyId: string,
  files: UploadFile[],
  meta: UploadMeta,
  hasCover: boolean,
): Promise<PropertyImage[]> {
  await fs.mkdir(uploadPath, { recursive: true });

  const images: PropertyImage[] = [];
  for (const file of files) {
    const name = `${randomUUID()}-${sanitizeFileName(file.originalname)}`;
    await fs.writeFile(path.join(uploadPath, name), file.buffer);

    const image = await addImage(propertyId, {
      url: `/uploads/${name}`,
      fileName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
      sequence: 0,
      isCover: false,
      assetId: randomUUID(),
      category: meta.category,
      subcategory: meta.subcategory ?? null,
      caption: meta.caption ?? null,
      description: null,
      isHeroCandidate: meta.category === 'exterior' && !hasCover,
    });
    if (image) images.push(image);
  }
  return images;
}

export async function deleteImageFile(imageUrl: string): Promise<void> {
  if (!imageUrl.startsWith('/uploads/')) return;
  await fs.rm(path.join(uploadPath, path.basename(imageUrl)), { force: true });
}

export async function removeImageRecord(
  propertyId: string,
  imageId: string,
): Promise<PropertyImage | null> {
  const removed = await removeImage(propertyId, imageId);
  if (removed) await deleteImageFile(removed.url);
  return removed;
}

export { isAllowedImageMime, MAX_IMAGE_BYTES };
