import { z } from 'zod';
import { locationIntelligenceSchema, propertyExposeDataSchema } from './expose-data.js';
import { locationResearchSchema } from '../mastra/schemas/location-research.js';

const nullableNumber = z.number().finite().nullable().optional();
export const propertySchema = z.object({
  propertyType: z.string(),
  transactionType: z.enum(['sale', 'rent']),
  constructionYear: nullableNumber,
  address: z.string().max(180).optional().nullable(),
  zipCode: z.string().max(20).optional().nullable(),
  city: z.string().max(100).optional().nullable(),
  district: z.string().max(100).optional().nullable(),
  livingArea: nullableNumber,
  plotArea: nullableNumber,
  rooms: nullableNumber,
  bedrooms: z.number().int().nonnegative().nullable().optional(),
  bathrooms: z.number().int().nonnegative().nullable().optional(),
  floor: z.string().max(30).optional().nullable(),
  totalFloors: z.number().int().nonnegative().nullable().optional(),
  bodenrichtwert: nullableNumber,
  availableFrom: z.string().max(40).optional().nullable(),
  condition: z.string().max(50).optional().nullable(),
  askingPrice: nullableNumber,
  additionalCosts: nullableNumber,
  commission: z.string().max(100).optional().nullable(),
  hausgeld: nullableNumber,
  coldRent: nullableNumber,
  deposit: nullableNumber,
  selectedFeatures: z.array(z.string()).max(30),
  additionalFeatures: z.string().max(1000).optional().nullable(),
  surroundings: z.record(z.string().max(1000)).optional().default({}),
  locationNote: z.string().max(2000).optional().nullable(),
  sellerDescription: z.string().max(3000).optional().nullable(),
  specialNotes: z.string().max(3000).optional().nullable(),
  targetAudience: z.string().max(300).optional().nullable(),
  tone: z.enum(['professional', 'premium', 'modern', 'warm', 'neutral']),
  language: z.enum(['de', 'en']),
  roomsData: z
    .array(
      z.object({
        name: z.string().min(1).max(100),
        type: z.string().max(80),
        size: nullableNumber,
        floor: z.string().max(30).optional().nullable(),
        description: z.string().max(1500).optional().nullable(),
        sequence: z.number().int().nonnegative().optional(),
      }),
    )
    .max(50),
  exposeData: propertyExposeDataSchema.optional(),
});

export const exposeContentSchema = z.object({
  title: z.string(),
  portalTitle: z.string(),
  shortDescription: z.string(),
  mainDescription: z.string(),
  highlights: z.array(z.string()).min(1).max(8),
  roomDescriptions: z.array(
    z.object({ roomId: z.string(), name: z.string(), description: z.string() }),
  ),
  locationDescription: z.string(),
  targetAudience: z.string(),
  factualSnapshot: z.array(z.string()),
});

// Legacy content remains accepted for existing records while Phase 3 renders v2 content.
export const structuredExposeContentSchema = z.object({
  version: z.literal(2),
  cover: z.object({
    title: z.string().trim().min(1),
    location: z.string().trim().optional(),
    heroImage: z
      .object({ assetId: z.string().trim().min(1), caption: z.string().trim().min(1) })
      .optional(),
    purchasePrice: z.string().trim().optional(),
    livingArea: z.string().trim().optional(),
    rooms: z.string().trim().optional(),
  }),
  overview: z.object({
    facts: z
      .array(z.object({ label: z.string().trim().min(1), value: z.string().trim().min(1) }))
      .min(1),
    energy: z
      .object({
        facts: z
          .array(z.object({ label: z.string().trim().min(1), value: z.string().trim().min(1) }))
          .min(1),
      })
      .optional(),
  }),
  objectInformation: z
    .object({ address: propertyExposeDataSchema.shape.basicInformation.shape.address })
    .optional(),
  propertyDescription: z
    .object({
      paragraphs: z
        .array(z.object({ heading: z.string().trim().min(1), text: z.string().trim().min(1) }))
        .min(1),
    })
    .optional(),
  roomProgram: z
    .array(
      z.object({
        roomId: z.string(),
        name: z.string(),
        area: z.string().optional(),
        description: z.string(),
      }),
    )
    .optional(),
  equipment: z
    .object({
      facts: z
        .array(z.object({ label: z.string().trim().min(1), value: z.string().trim().min(1) }))
        .min(1),
      description: z.string().trim().optional(),
    })
    .optional(),
  location: z
    .object({
      description: z.string().trim().min(1),
      district: z.string().trim().optional(),
      neighborhood: z.string().trim().optional(),
      intelligence: locationIntelligenceSchema.optional(),
      research: locationResearchSchema.optional(),
    })
    .optional(),
  otherInformation: z
    .object({
      items: z
        .array(z.object({ label: z.string().trim().min(1), value: z.string().trim().min(1) }))
        .min(1),
    })
    .optional(),
  additionalInformation: z
    .object({
      items: z
        .array(z.object({ label: z.string().trim().min(1), value: z.string().trim().min(1) }))
        .min(1),
    })
    .optional(),
  imageSections: z
    .array(
      z.object({
        category: z.enum(['exterior', 'interior', 'floor_plan', 'document']),
        label: z.string(),
        images: z.array(z.object({ assetId: z.string(), caption: z.string() })).min(1),
      }),
    )
    .optional(),
  planSections: z
    .array(
      z.object({
        title: z.string(),
        images: z.array(z.object({ assetId: z.string(), caption: z.string() })).min(1),
      }),
    )
    .optional(),
  mapSections: z
    .array(
      z.object({
        title: z.string(),
        images: z.array(z.object({ assetId: z.string(), caption: z.string() })).min(1),
      }),
    )
    .optional(),
  agentSection: propertyExposeDataSchema.shape.agent,
  vistaSection: z.object({
    heading: z.string(),
    subtitle: z.string(),
    description: z.string(),
    steps: z.array(z.string()).min(1),
    logo: z.string().optional(),
    website: z.string().optional(),
    email: z.string().optional(),
    phone: z.string().optional(),
  }),
});

export const exposeContentInputSchema = z.union([
  exposeContentSchema,
  structuredExposeContentSchema,
]);
