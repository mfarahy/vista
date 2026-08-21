import { z } from 'zod';
import {
  addressSchema,
  agentDataSchema,
  exposeImageSchema,
  locationIntelligenceSchema,
} from '../../lib/expose-data.js';
import { locationResearchSchema } from './location-research.js';

const text = z.string().trim().min(1);
const factSchema = z.object({ label: text.max(120), value: text.max(300) });
const imageReferenceSchema = z.object({
  assetId: text.max(200),
  caption: text.max(180),
});

export const exposeContentSchema = z.object({
  version: z.literal(2),
  cover: z.object({
    title: text.max(200),
    location: text.max(250).optional(),
    heroImage: imageReferenceSchema.optional(),
    purchasePrice: text.max(100).optional(),
    livingArea: text.max(100).optional(),
    rooms: text.max(50).optional(),
  }),
  overview: z.object({
    facts: z.array(factSchema).min(1),
    energy: z
      .object({
        facts: z.array(factSchema).min(1),
      })
      .optional(),
  }),
  objectInformation: z
    .object({
      address: addressSchema,
    })
    .optional(),
  propertyDescription: z
    .object({
      paragraphs: z.array(z.object({ heading: text.max(100), text: text.max(4000) })).min(1),
    })
    .optional(),
  roomProgram: z
    .array(
      z.object({
        roomId: text.max(200),
        name: text.max(100),
        area: text.max(80).optional(),
        description: text.max(2000),
      }),
    )
    .optional(),
  equipment: z
    .object({
      facts: z.array(factSchema).min(1),
      description: text.max(4000).optional(),
    })
    .optional(),
  location: z
    .object({
      description: text.max(2500),
      district: text.max(100).optional(),
      neighborhood: text.max(100).optional(),
      intelligence: locationIntelligenceSchema.optional(),
      research: locationResearchSchema.optional(),
    })
    .optional(),
  otherInformation: z.object({ items: z.array(factSchema).min(1) }).optional(),
  additionalInformation: z.object({ items: z.array(factSchema).min(1) }).optional(),
  imageSections: z
    .array(
      z.object({
        category: exposeImageSchema.shape.category,
        label: text.max(100),
        images: z.array(imageReferenceSchema).min(1),
      }),
    )
    .optional(),
  planSections: z
    .array(
      z.object({
        title: text.max(160),
        images: z.array(imageReferenceSchema).min(1),
      }),
    )
    .optional(),
  mapSections: z
    .array(
      z.object({
        title: text.max(160),
        images: z.array(imageReferenceSchema).min(1),
      }),
    )
    .optional(),
  agentSection: agentDataSchema.optional(),
  vistaSection: z.object({
    heading: text.max(160),
    subtitle: text.max(300),
    description: text.max(2000),
    steps: z.array(text.max(300)).min(1).max(20),
    logo: text.max(500).optional(),
    website: z.string().url().optional(),
    email: z.string().email().optional(),
    phone: text.max(60).optional(),
  }),
});

export type ExposeContent = z.infer<typeof exposeContentSchema>;

const forbiddenVisibleText =
  /\[\s*(?:insert|address|price|title|value)|\{\{|\}\}|\b(?:undefined|null|n\/a)\b|(?:screenshot|image|img|photo|scan)[_-]?\d*\.(?:png|jpe?g|webp|pdf)\b/i;

function inspectText(value: unknown, path: string, issues: string[]) {
  if (value === undefined) issues.push(path);
  else if (typeof value === 'string' && forbiddenVisibleText.test(value)) issues.push(path);
  else if (Array.isArray(value))
    value.forEach((item, index) => inspectText(item, `${path}[${index}]`, issues));
  else if (value && typeof value === 'object')
    Object.entries(value).forEach(([key, item]) => inspectText(item, `${path}.${key}`, issues));
}

function withoutUndefined(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutUndefined);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .map(([key, item]) => [key, withoutUndefined(item)]),
    );
  return value;
}

export function validateExposeContent(value: unknown): ExposeContent {
  const parsed = exposeContentSchema.parse(withoutUndefined(value));
  const issues: string[] = [];
  inspectText(parsed, 'content', issues);
  if (issues.length)
    throw new Error(
      `Expose content contains forbidden placeholder or filename text at ${issues.join(', ')}`,
    );

  const references = new Set([
    ...(parsed.imageSections ?? []).flatMap((section) =>
      section.images.map((image) => image.assetId),
    ),
    ...(parsed.planSections ?? []).flatMap((section) =>
      section.images.map((image) => image.assetId),
    ),
    ...(parsed.mapSections ?? []).flatMap((section) =>
      section.images.map((image) => image.assetId),
    ),
  ]);
  if (parsed.cover.heroImage && !references.has(parsed.cover.heroImage.assetId)) {
    throw new Error('Cover hero image must be represented in an image section');
  }
  return parsed;
}

export function validateExposeContentReferences(
  property: {
    rooms: Array<{ id?: string }>;
    images: Array<{ assetId: string }>;
    floorPlans: Array<{ assetId: string }>;
    maps: Array<{ assetId: string }>;
  },
  content: ExposeContent,
) {
  const imageIds = new Set(
    [...property.images, ...property.floorPlans, ...property.maps].map((image) => image.assetId),
  );
  const references = [
    ...(content.cover.heroImage ? [content.cover.heroImage] : []),
    ...(content.imageSections ?? []).flatMap((section) => section.images),
    ...(content.planSections ?? []).flatMap((section) => section.images),
    ...(content.mapSections ?? []).flatMap((section) => section.images),
  ];
  if (references.some((image) => !imageIds.has(image.assetId)))
    throw new Error('Expose content references an unknown image asset');
  const roomIds = new Set(
    property.rooms.map((room) => room.id).filter((id): id is string => Boolean(id)),
  );
  if ((content.roomProgram ?? []).some((room) => !roomIds.has(room.roomId)))
    throw new Error('Expose content references an unknown room');
  return content;
}
