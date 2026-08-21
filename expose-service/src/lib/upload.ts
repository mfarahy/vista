import multer from 'multer';

export const upload = multer({ storage: multer.memoryStorage() });

export const ALLOWED_IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export const ALLOWED_DOCUMENT_MIMES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
]);

export const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

export const MAX_DOCUMENT_BYTES = 25 * 1024 * 1024;

export const IMAGE_CATEGORIES = ['exterior', 'interior', 'floor_plan', 'document'] as const;
export type ImageCategory = (typeof IMAGE_CATEGORIES)[number];

export function isAllowedImageMime(mimeType: string): boolean {
  return ALLOWED_IMAGE_MIMES.has(mimeType);
}
