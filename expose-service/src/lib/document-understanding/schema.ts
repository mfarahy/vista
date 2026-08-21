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
 * The set of wizard field keys the model may fill. These match the existing
 * wizard fields (see prefill.ts and the frontend wizard) so prefilled values
 * drop straight into the wizard without a separate mapping layer.
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
  // Property
  'propertyType',
  'livingArea',
  'plotArea',
  'rooms',
  'bedrooms',
  'bathrooms',
  'yearBuilt',
  // Building
  'numberOfFloors',
  'floor',
  'basement',
  'parking',
  'garage',
  'balcony',
  'terrace',
  'garden',
  // Energy
  'energyClass',
  'energyConsumption',
  'energyDemand',
  'heatingType',
  'yearOfConstruction',
  // Land / identification
  'parcelNumber',
  'plotNumber',
] as const;

export type UnderstandingDocumentType = (typeof DOCUMENT_TYPES)[number];
export type UnderstandingTag = (typeof DOCUMENT_TAGS)[number];

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
});

export type DocumentUnderstandingStructured = z.infer<typeof documentUnderstandingSchema>;
