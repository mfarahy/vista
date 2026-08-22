import { z } from 'zod';

/**
 * Expose configuration (Phase 5A). This is the presentation configuration of
 * an Exposé: which sections are shown, in which order, which media are used,
 * and which marketing fields the user has overridden inside the Builder.
 *
 * It intentionally contains no factual property data and no marketing copy:
 * only references (image IDs) and lightweight content overrides. The Property
 * model and the MarketingContent record are never modified by the Builder.
 */

export const EXPOSE_SECTION_TYPES = [
  'cover',
  'highlights',
  'property',
  'equipment',
  'location',
  'facts',
  'energy',
  'gallery',
  'floorplans',
  'documents',
  'contact',
] as const;

export type ExposeSectionType = (typeof EXPOSE_SECTION_TYPES)[number];

export const exposeSectionSchema = z.object({
  id: z.string().min(1).max(80),
  type: z.enum(EXPOSE_SECTION_TYPES),
  visible: z.boolean(),
});

export type ExposeSection = z.infer<typeof exposeSectionSchema>;

/**
 * User edits made inside the Exposé Builder. An override, when present,
 * replaces the corresponding MarketingContent value at render time; the
 * MarketingContent record itself stays untouched.
 */
export const exposeContentOverridesSchema = z
  .object({
    title: z.string().max(300).optional(),
    subtitle: z.string().max(300).optional(),
    highlights: z.array(z.string().max(200)).max(12).optional(),
    propertyDescription: z.string().max(8000).optional(),
    equipmentDescription: z.string().max(4000).optional(),
    locationDescription: z.string().max(4000).optional(),
  })
  .strict();

export type ExposeContentOverrides = z.infer<typeof exposeContentOverridesSchema>;

export const exposeConfigurationSchema = z
  .object({
    template: z.enum(['modern']),
    sections: z.array(exposeSectionSchema).min(1).max(EXPOSE_SECTION_TYPES.length),
    selectedCoverImageId: z.string().min(1).max(120).optional(),
    galleryImageIds: z.array(z.string().min(1).max(120)).max(200).optional(),
    contentOverrides: exposeContentOverridesSchema.optional(),
  })
  .strict()
  .superRefine((configuration, context) => {
    const ids = configuration.sections.map((section) => section.id);
    if (new Set(ids).size !== ids.length) {
      context.addIssue({
        code: 'custom',
        path: ['sections'],
        message: 'Section ids must be unique',
      });
    }
  });

export type ExposeConfiguration = z.infer<typeof exposeConfigurationSchema>;

export function defaultExposeSections(): ExposeSection[] {
  return EXPOSE_SECTION_TYPES.map((type) => ({ id: type, type, visible: true }));
}

export function defaultExposeConfiguration(): ExposeConfiguration {
  return { template: 'modern', sections: defaultExposeSections() };
}