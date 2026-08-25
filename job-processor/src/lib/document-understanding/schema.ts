import { z } from 'zod';

/**
 * Controlled vocabularies and the structured-output schema that the OpenAI
 * provider enforces. The model can only return values from these sets, so the
 * result stays within the application's domain instead of free-form JSON.
 */

export const DOCUMENT_TYPES = [
  'grundbuchauszug',
  'grundriss',
  'energieausweis',
  'expose',
  'lageplan',
  'wohnflaechenberechnung',
  'bauplan',
  'kaufvertrag',
  'mietvertrag',
  'teilungserklaerung',
  'property_photo',
  'other',
] as const;

export const DOCUMENT_TAGS = [
  'address',
  'property-identification',
  'floor-plan',
  'rooms',
  'living-area',
  'plot-area',
  'year-built',
  'energy',
  'heating',
  'parking',
  'basement',
  'ownership',
  'legal',
  'property-photo',
  'building',
  'land',
  'interior',
  'exterior',
  'kitchen',
  'bathroom',
  'bedroom',
  'living-room',
  'garden',
  'balcony',
  'garage',
  'site-plan',
  'map',
  'document-photo',
  'screenshot',
] as const;

/**
 * The set of wizard field keys the model may fill. Keys stay short and flat
 * (see WIZARD_FIELD_TARGETS in domain-model.ts for the dotted PropertyModel
 * path each key maps onto). Existing keys match the existing wizard fields
 * (see prefill.ts and the frontend wizard) so prefilled values drop straight
 * into the wizard without a separate mapping layer.
 */
export const WIZARD_FIELDS = [
  // Address
  'street',
  'houseNumber',
  'postalCode',
  'city',
  'district',
  'state',
  'country',
  // Classification
  'propertyType',
  'propertySubtype',
  'usageType',
  // Areas
  'livingArea',
  'usableArea',
  'plotArea',
  // Rooms
  'rooms',
  'bedrooms',
  'bathrooms',
  'guestToilets',
  // Building
  'yearBuilt',
  'buildingStatus',
  'condition',
  'numberOfFloors',
  'floor',
  'basement',
  'attic',
  'renovationStatus',
  'lastModernizationYear',
  // Features
  'parking',
  'garage',
  // Outdoor
  'balcony',
  'terrace',
  'garden',
  'gardenArea',
  'orientation',
  // Energy
  'energyClass',
  'energyDemand',
  'energyConsumption',
  'heatingType',
  'yearOfConstruction',
  'certificateType',
  'certificateDate',
  'certificateValidUntil',
  'primaryEnergySource',
  'hotWaterIncluded',
  // Financial
  'askingPrice',
  'pricePerM2',
  'commissionRate',
  'commissionPayer',
  // Rental
  'isRented',
  'monthlyRent',
  'annualRent',
  'additionalCosts',
  'deposit',
  'furnished',
  'availableFrom',
  // Investment
  'grossYieldTarget',
  'grossYieldActual',
  // Legal
  'usufruct',
  'leasehold',
  'foreclosure',
  'heritageProtection',
  // Transaction
  'transactionType',
  // Land / identification
  'parcelNumber',
  'plotNumber',
  // WEG (Eigentumswohnung)
  'hausgeld',
  'maintenanceReserve',
  'coOwnershipShare',
] as const;

export type UnderstandingDocumentType = (typeof DOCUMENT_TYPES)[number];
export type UnderstandingTag = (typeof DOCUMENT_TAGS)[number];

/**
 * Controlled photo classification for `property_photo` documents. Only
 * categories useful for the current Exposé; the model picks exactly one.
 */
export const PHOTO_TYPES = [
  'exterior',
  'living_room',
  'bedroom',
  'kitchen',
  'bathroom',
  'hallway',
  'office',
  'dining_room',
  'balcony',
  'terrace',
  'garden',
  'view',
  'garage',
  'parking',
  'basement',
  'utility_room',
  'other',
] as const;

/**
 * Visually observable photo features. Only features that are clearly visible
 * may be returned; measurements and legal/financial facts are never inferred
 * from a photo.
 */
export const PHOTO_TAGS = [
  'fitted-kitchen',
  'parquet-floor',
  'laminate-floor',
  'tiles',
  'balcony',
  'terrace',
  'garden',
  'bathtub',
  'shower',
  'guest-toilet',
  'fireplace',
  'large-windows',
  'built-in-wardrobes',
  'garage',
  'parking',
] as const;

export const COVER_SUITABILITY_VALUES = ['high', 'medium', 'low'] as const;

export type PhotoType = (typeof PHOTO_TYPES)[number];
export type PhotoTag = (typeof PHOTO_TAGS)[number];
export type CoverSuitability = (typeof COVER_SUITABILITY_VALUES)[number];

export const photoTagSchema = z.object({
  tag: z.enum(PHOTO_TAGS),
  /** Factual description of what is visibly present; never fabricated. */
  evidence: z.string().min(1),
});

export const photoUnderstandingSchema = z.object({
  photoType: z.enum(PHOTO_TYPES).nullable(),
  photoTags: z.array(photoTagSchema).max(20).default([]),
  visualDescription: z.string().nullable(),
  coverSuitability: z.enum(COVER_SUITABILITY_VALUES).nullable(),
  coverSuitabilityReason: z.string().nullable(),
});

export const wizardFieldSchema = z.object({
  field: z.enum(WIZARD_FIELDS),
  value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
  evidence: z.string().nullable(),
});

export const additionalInfoSchema = z.object({
  key: z.string().min(1),
  value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
  evidence: z.string().nullable(),
});

/**
 * Structured-output schema. The OpenAI SDK enforces this via JSON schema and
 * returns a parsed object, so we never hand-parse arbitrary model JSON.
 */
export const documentUnderstandingSchema = z.object({
  documentType: z.enum(DOCUMENT_TYPES),
  tags: z.array(z.enum(DOCUMENT_TAGS)).max(12),
  summary: z.string(),
  keepInLibrary: z.boolean(),
  wizardFields: z.array(wizardFieldSchema).max(30),
  additionalInformation: z.array(additionalInfoSchema).max(30),
  /**
   * Visual analysis for `property_photo` documents. Null for all other
   * document types. Kept nullable so records created before this phase stay
   * readable without a migration.
   */
  photo: photoUnderstandingSchema.nullable().default(null),
});

export type DocumentUnderstandingStructured = z.infer<typeof documentUnderstandingSchema>;
export type PhotoUnderstandingStructured = z.infer<typeof photoUnderstandingSchema>;
