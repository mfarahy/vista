import { z } from 'zod';

/**
 * Structured-output schema for marketing content generation. The OpenAI SDK
 * enforces this via JSON schema (`zodResponseFormat`) and returns a parsed
 * object, so the model response is never hand-parsed.
 *
 * `locationDescription` is nullable: when the input contains no meaningful
 * location facts, the model must return null instead of generic statements.
 */
export const marketingContentSchema = z.object({
  title: z.string().trim().min(1).max(200),
  subtitle: z.string().trim().min(1).max(200),
  highlights: z.array(z.string().trim().min(1).max(120)).min(1).max(6),
  propertyDescription: z.string().trim().min(1).max(4000),
  equipmentDescription: z.string().trim().min(1).max(4000),
  locationDescription: z.string().trim().max(2000).nullable(),
});

export type MarketingContentStructured = z.infer<typeof marketingContentSchema>;

/** Provenance of a persisted marketing field. */
export const marketingContentSourceSchema = z.enum(['ai', 'user']);

/** Persisted record shape: every field keeps its provenance for user-edit protection. */
export const marketingContentRecordSchema = z.object({
  title: z.object({ value: z.string().max(200), source: marketingContentSourceSchema }),
  subtitle: z.object({ value: z.string().max(200), source: marketingContentSourceSchema }),
  highlights: z.object({
    value: z.array(z.string().max(120)).max(6),
    source: marketingContentSourceSchema,
  }),
  propertyDescription: z.object({
    value: z.string().max(4000),
    source: marketingContentSourceSchema,
  }),
  equipmentDescription: z.object({
    value: z.string().max(4000),
    source: marketingContentSourceSchema,
  }),
  locationDescription: z
    .object({ value: z.string().max(2000), source: marketingContentSourceSchema })
    .nullable(),
});
