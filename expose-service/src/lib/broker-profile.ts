import { z } from 'zod';
import { addressSchema } from './expose-data.js';

/**
 * Broker profile (MVP): the single source of truth for the broker/agent
 * information shown in every Exposé. One profile per application instance —
 * there is deliberately no per-property copy and no versioning. The Exposé
 * renderer reads this profile and falls back to the legacy per-property
 * agent data of a property for already-published Exposés (see
 * `legacyAgentToProfile` in store.ts).
 */

const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();

/** Accepts '', null, or a valid http(s) URL (matches exposeBrandingSchema). */
const optionalUrl = (max = 500) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .refine((value) => value === null || value === undefined || value === '' || /^https?:\/\//i.test(value), {
      message: 'Only http(s) URLs are allowed',
    });

/** Accepts '', null, or an http(s)/uploaded image path. */
const optionalImage = (max = 500) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .refine(
      (value) =>
        value === null ||
        value === undefined ||
        value === '' ||
        /^https?:\/\//i.test(value) ||
        value.startsWith('/uploads/'),
      { message: 'Only http(s) or uploaded image URLs are allowed' },
    );

const optionalEmail = z
  .string()
  .trim()
  .max(150)
  .nullable()
  .optional()
  .refine(
    (value) =>
      value === null ||
      value === undefined ||
      value === '' ||
      z.string().email().safeParse(value).success,
    { message: 'Invalid email address' },
  );

export const brokerProfileSchema = z
  .object({
    /** Broker/agent name — the only required field. */
    name: z.string().trim().min(1, 'Broker name is required').max(150),
    jobTitle: optionalText(150),
    company: optionalText(150),
    photo: optionalImage(),
    logo: optionalImage(),
    address: addressSchema.optional(),
    website: optionalUrl(),
    phone: optionalText(60),
    mobile: optionalText(60),
    email: optionalEmail,
    tagline: optionalText(300),
    description: optionalText(4000),
    awards: z.array(z.string().trim().min(1).max(200)).max(30).default([]),
    recommendations: optionalText(2000),
    recommendationUrl: optionalUrl(),
    externalLinks: z
      .array(
        z.object({
          label: z.string().trim().min(1).max(100),
          url: z
            .string()
            .trim()
            .max(500)
            .refine((value) => /^https?:\/\//i.test(value), {
              message: 'Only http(s) URLs are allowed',
            }),
        }),
      )
      .max(20)
      .default([]),
    additionalImages: z.array(z.string().trim().min(1).max(500)).max(20).default([]),
  })
  .strict();

export type BrokerProfile = z.infer<typeof brokerProfileSchema>;

/** Default profile used before any data is saved. */
export function emptyBrokerProfile(): BrokerProfile {
  return {
    name: '',
    jobTitle: null,
    company: null,
    photo: null,
    logo: null,
    address: undefined,
    website: null,
    phone: null,
    mobile: null,
    email: null,
    tagline: null,
    description: null,
    awards: [],
    recommendations: null,
    recommendationUrl: null,
    externalLinks: [],
    additionalImages: [],
  };
}