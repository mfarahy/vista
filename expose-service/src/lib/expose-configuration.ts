import { z } from 'zod';

/**
 * Expose configuration (Phase 5A, extended in Phase 11). This is the
 * presentation configuration of an Exposé: the selected template, which
 * sections are shown, in which order, which media are used, the optional
 * Exposé-local branding, and which marketing fields the user has overridden
 * inside the Builder.
 *
 * It intentionally contains no factual property data and no marketing copy:
 * only references (image IDs) and lightweight content overrides. The Property
 * model and the MarketingContent record are never modified by the Builder.
 */

/** Templates the Exposé Builder can render. `modern` remains the default. */
export const EXPOSE_TEMPLATE_IDS = ['modern', 'classic', 'elegant'] as const;

export type ExposeTemplateId = (typeof EXPOSE_TEMPLATE_IDS)[number];

/**
 * Exposé-local branding. Every field is optional: values fall back to the
 * Agent profile (and the system branding) at render time. The Agent profile
 * itself is never modified by the Builder.
 */
export const exposeBrandingSchema = z
  .object({
    companyName: z.string().max(150).optional(),
    logoUrl: z.string().max(500).optional(),
    phone: z.string().max(60).optional(),
    email: z.union([z.string().email(), z.literal('')]).optional(),
    website: z
      .string()
      .max(500)
      .refine((value) => value === '' || /^https?:\/\//i.test(value), {
        message: 'Only http(s) website URLs are allowed',
      })
      .optional(),
  })
  .strict();

export type ExposeBranding = z.infer<typeof exposeBrandingSchema>;

export const EXPOSE_SECTION_TYPES = [
  'cover',
  'facts',
  'highlights',
  'property',
  'equipment',
  'location',
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
    // Defaults to "modern" so records persisted before the template concept
    // keep working without a migration.
    template: z.enum(EXPOSE_TEMPLATE_IDS).default('modern'),
    sections: z.array(exposeSectionSchema).min(1).max(EXPOSE_SECTION_TYPES.length),
    selectedCoverImageId: z.string().min(1).max(120).optional(),
    galleryImageIds: z.array(z.string().min(1).max(120)).max(200).optional(),
    contentOverrides: exposeContentOverridesSchema.optional(),
    branding: exposeBrandingSchema.optional(),
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