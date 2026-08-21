import { z } from 'zod';

const text = z.string().trim().min(1);

export const locationResearchInputSchema = z.object({
  propertyId: text.max(200),
  address: text.max(240),
  city: text.max(100),
  district: text.max(100).optional(),
  neighborhood: text.max(100).optional(),
  postalCode: text.max(20),
  country: text.max(100).default('Germany'),
  latitude: z.number().finite().min(-90).max(90).optional(),
  longitude: z.number().finite().min(-180).max(180).optional(),
  locationIntelligence: z
    .object({
      coordinates: z.object({ latitude: z.number(), longitude: z.number() }),
      facilities: z.record(
        z.array(z.object({ name: text, category: text, distanceMeters: z.number().nonnegative() })),
      ),
    })
    .optional(),
});

export const researchSourceSchema = z.object({
  url: z.string().url(),
  title: text.max(300),
  domain: text.max(200),
  retrievedAt: z.string().datetime(),
  relevanceScore: z.number().finite().min(0).max(1).optional(),
  authorityScore: z.number().finite().min(0).max(1).optional(),
  excerpt: text.max(1200).optional(),
});

export const researchClaimSchema = z.object({
  statement: text.max(1200),
  category: z.enum([
    'mikrolage',
    'makrolage',
    'infrastructure',
    'transport',
    'education',
    'shopping',
    'recreation',
    'healthcare',
    'important_fact',
  ]),
  factType: z.enum(['hard_fact', 'contextual_fact']),
  confidence: z.number().finite().min(0).max(1),
  sources: z.array(researchSourceSchema).min(1),
});

const sectionSchema = z.object({
  summary: text.max(2000).optional(),
  claims: z.array(researchClaimSchema),
});

export const locationResearchSchema = z.object({
  researchedAt: z.string().datetime(),
  mikrolage: sectionSchema,
  makrolage: sectionSchema,
  infrastructure: z.object({
    transport: z.array(researchClaimSchema),
    education: z.array(researchClaimSchema),
    shopping: z.array(researchClaimSchema),
    healthcare: z.array(researchClaimSchema),
    recreation: z.array(researchClaimSchema),
  }),
  sources: z.array(researchSourceSchema),
  confidence: z.number().finite().min(0).max(1),
});

export type LocationResearchInput = z.infer<typeof locationResearchInputSchema>;
export type ResearchSource = z.infer<typeof researchSourceSchema>;
export type ResearchClaim = z.infer<typeof researchClaimSchema>;
export type LocationResearch = z.infer<typeof locationResearchSchema>;
