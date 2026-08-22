import { z } from 'zod';
import { locationResearchSchema } from '../mastra/schemas/location-research.js';

export const certificateTypeSchema = z.enum([
  'needs_based',
  'consumption_based',
  'not_available',
  'unknown',
]);
export const primaryEnergySourceSchema = z.enum([
  'gas',
  'oil',
  'district_heating',
  'heat_pump',
  'electricity',
  'wood',
  'pellets',
  'other',
]);
export const efficiencyClassSchema = z.enum(['A+', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']);

const nonNegativeNumber = z.number().finite().nonnegative().nullable().optional();
const optionalText = (max: number) => z.string().max(max).nullable().optional();

export const addressSchema = z.object({
  street: optionalText(180),
  houseNumber: optionalText(30),
  postalCode: optionalText(20),
  city: optionalText(100),
  district: optionalText(100),
  state: optionalText(100),
  country: z.string().max(100).default('Deutschland'),
  formattedAddress: optionalText(300),
  latitude: z.number().finite().min(-90).max(90).nullable().optional(),
  longitude: z.number().finite().min(-180).max(180).nullable().optional(),
});

export const placeCategorySchema = z.enum([
  'supermarket',
  'grocery',
  'shopping_center',
  'kindergarten',
  'school',
  'train_station',
  'subway',
  'tram',
  'bus_stop',
  'doctor',
  'pharmacy',
  'hospital',
  'park',
  'playground',
  'sports_facility',
  'restaurant',
  'cafe',
  'bank',
  'post_office',
]);
export const placeSchema = z.object({
  id: z.string().max(200),
  name: z.string().max(200),
  category: placeCategorySchema,
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
  address: z.string().max(300).optional(),
  distanceMeters: z.number().finite().nonnegative(),
  distanceType: z.literal('straight_line'),
  source: z.string().max(100),
});
export const locationIntelligenceSchema = z.object({
  address: addressSchema,
  coordinates: z.object({
    latitude: z.number().finite().min(-90).max(90),
    longitude: z.number().finite().min(-180).max(180),
  }),
  formattedAddress: z.string().max(300).optional(),
  source: z.enum(['geocoded', 'manual']),
  geocodingProvider: z.string().max(100).optional(),
  confidence: z.number().finite().min(0).max(1).optional(),
  matchType: z.string().max(100).optional(),
  verificationRequired: z.boolean().default(false),
  facilities: z.object({
    shopping: z.array(placeSchema),
    education: z.array(placeSchema),
    transport: z.array(placeSchema),
    healthcare: z.array(placeSchema),
    recreation: z.array(placeSchema),
    dailyLife: z.array(placeSchema),
  }),
  radiusMeters: z.number().int().positive(),
  mapAsset: z
    .object({
      assetId: z.string(),
      url: z.string(),
      mimeType: z.literal('image/svg+xml'),
      caption: z.string(),
    })
    .optional(),
  summary: z.string().max(2000),
  generatedAt: z.string(),
  expiresAt: z.string(),
});

export const energyDataSchema = z
  .object({
    certificateType: certificateTypeSchema.nullable().optional(),
    certificateDate: optionalText(20),
    certificateValidUntil: optionalText(20),
    yearOfConstruction: z
      .number()
      .int()
      .min(1800)
      .max(new Date().getFullYear() + 1)
      .nullable()
      .optional(),
    primaryEnergySource: primaryEnergySourceSchema.nullable().optional(),
    heatingType: optionalText(80),
    hotWaterIncluded: z.boolean().nullable().optional(),
    finalEnergyDemand: nonNegativeNumber,
    finalEnergyConsumption: nonNegativeNumber,
    efficiencyClass: efficiencyClassSchema.nullable().optional(),
  })
  .superRefine((value, context) => {
    if (value.certificateType === 'needs_based' && value.finalEnergyDemand == null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['finalEnergyDemand'],
        message: 'Bedarfsorientierte Ausweise benötigen einen Endenergiebedarf.',
      });
    }
    if (value.certificateType === 'consumption_based' && value.finalEnergyConsumption == null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['finalEnergyConsumption'],
        message: 'Verbrauchsorientierte Ausweise benötigen einen Endenergieverbrauch.',
      });
    }
  });

export const roomTypeSchema = z.enum([
  'living_room',
  'bedroom',
  'child_room',
  'office',
  'kitchen',
  'dining_room',
  'bathroom',
  'guest_wc',
  'hallway',
  'utility_room',
  'hobby_room',
  'basement',
  'attic',
  'garage',
  'other',
]);
export const roomDataSchema = z.object({
  id: z.string().optional(),
  type: roomTypeSchema,
  name: z.string().min(1).max(100),
  area: nonNegativeNumber,
  description: optionalText(1500),
  features: z.array(z.string().max(100)).max(30).default([]),
  floor: optionalText(30),
  order: z.number().int().nonnegative().optional(),
});

export const equipmentCategorySchema = z.enum([
  'interior',
  'kitchen',
  'bathroom',
  'flooring',
  'windows',
  'heating',
  'technology',
  'outdoor',
  'parking',
  'storage',
  'other',
]);
export const equipmentDataSchema = z.object({
  id: z.string().optional(),
  category: equipmentCategorySchema,
  name: z.string().min(1).max(120),
  description: optionalText(1000),
});

export const outdoorAreaTypeSchema = z.enum([
  'garden',
  'terrace',
  'balcony',
  'courtyard',
  'roof_terrace',
]);
export const outdoorAreaSchema = z.object({
  id: z.string().optional(),
  type: outdoorAreaTypeSchema,
  area: nonNegativeNumber,
  orientation: optionalText(50),
  description: optionalText(1000),
});

export const imageCategorySchema = z.enum(['exterior', 'interior', 'floor_plan', 'document']);
export const exposeImageSchema = z.object({
  id: z.string().optional(),
  assetId: z.string().min(1),
  category: imageCategorySchema,
  subcategory: z.string().max(80).nullable().optional(),
  caption: z.string().max(180).nullable().optional(),
  description: z.string().max(1000).nullable().optional(),
  order: z.number().int().nonnegative().optional(),
  isHeroCandidate: z.boolean().default(false),
  url: z.string().optional(),
  fileName: z.string().optional(),
  mimeType: z.string().optional(),
  size: z.number().int().nonnegative().optional(),
});

export const borisEnrichmentSchema = z.object({
  available: z.boolean(),
  source: z.string().max(200),
  retrievedAt: z.string(),
  referenceDate: z.string().nullable().optional(),
  zone: z
    .object({
      id: z.string().nullable().optional(),
      name: z.string().nullable().optional(),
    })
    .nullable()
    .optional(),
  bodenrichtwert: z
    .object({
      value: z.number().finite().nullable().optional(),
      unit: z.string().max(50).default('EUR/m²'),
    })
    .nullable()
    .optional(),
  landUse: z.string().nullable().optional(),
  developmentState: z.string().nullable().optional(),
  valueDeterminingCharacteristics: z.record(z.string(), z.unknown()).default({}),
  raw: z.record(z.string(), z.unknown()).nullable().optional(),
});

export const locationDataSchema = z.object({
  address: addressSchema,
  latitude: z.number().finite().min(-90).max(90).nullable().optional(),
  longitude: z.number().finite().min(-180).max(180).nullable().optional(),
  district: optionalText(100),
  neighborhood: optionalText(100),
  description: optionalText(2000),
  intelligence: locationIntelligenceSchema.optional(),
  research: locationResearchSchema.optional(),
  boris: borisEnrichmentSchema.optional(),
});

export const agentDataSchema = z.object({
  name: optionalText(150),
  company: optionalText(150),
  address: addressSchema.optional(),
  phone: optionalText(60),
  email: z.string().email().nullable().optional(),
  website: z.string().url().nullable().optional(),
  photo: optionalText(500),
  logo: optionalText(500),
});

export const systemBrandingSchema = z.object({
  companyName: z.string().max(150).default('Vista'),
  logo: optionalText(500),
  website: z.string().url().nullable().optional(),
  email: z.string().email().nullable().optional(),
  phone: optionalText(60),
  description: optionalText(1000),
  processSteps: z.array(z.string().max(200)).max(20).default([]),
});

export const pricingSchema = z.object({
  purchasePrice: nonNegativeNumber,
  rentPrice: nonNegativeNumber,
  additionalCosts: nonNegativeNumber,
  buyerCommission: optionalText(120),
  sellerCommission: optionalText(120),
  // Structured price-per-m² captured explicitly. It is never derived from
  // price / living area by the application (see domain-model.ts for the same
  // rule); it only holds values that were explicitly provided or extracted.
  pricePerM2: nonNegativeNumber,
  commissionRate: nonNegativeNumber,
  commissionPayer: z.enum(['buyer', 'seller', 'both']).nullable().optional(),
  commissionVatIncluded: z.boolean().nullable().optional(),
});

export const propertyDetailsSchema = z.object({
  livingArea: nonNegativeNumber,
  plotArea: nonNegativeNumber,
  usableArea: nonNegativeNumber,
  rooms: nonNegativeNumber,
  bedrooms: z.number().int().nonnegative().nullable().optional(),
  bathrooms: nonNegativeNumber,
  guestToilets: z.number().int().nonnegative().nullable().optional(),
  yearBuilt: z
    .number()
    .int()
    .min(1000)
    .max(new Date().getFullYear() + 1)
    .nullable()
    .optional(),
  completionYear: z
    .number()
    .int()
    .min(1000)
    .max(new Date().getFullYear() + 1)
    .nullable()
    .optional(),
  floor: optionalText(30),
  numberOfFloors: z.number().int().nonnegative().nullable().optional(),
  garageCount: z.number().int().nonnegative().nullable().optional(),
  parkingSpaceCount: z.number().int().nonnegative().nullable().optional(),
  bodenrichtwert: nonNegativeNumber,
  // Building construction metadata (mirrors the PropertyModel building section).
  buildingStatus: z.enum(['new', 'existing']).nullable().optional(),
  renovationStatus: optionalText(60),
  lastModernizationYear: z
    .number()
    .int()
    .min(1800)
    .max(new Date().getFullYear() + 1)
    .nullable()
    .optional(),
});

export const rentalDataSchema = z.object({
  isRented: z.boolean().nullable().optional(),
  furnished: z.boolean().nullable().optional(),
  annualRent: nonNegativeNumber,
});

export const investmentDataSchema = z.object({
  grossYieldTargetPercent: nonNegativeNumber,
  grossYieldActualPercent: nonNegativeNumber,
});

export const legalFlagsSchema = z.object({
  usufruct: z.boolean().nullable().optional(),
  leasehold: z.boolean().nullable().optional(),
  foreclosure: z.boolean().nullable().optional(),
  heritageProtection: z.boolean().nullable().optional(),
});

export const parkingSchema = z.object({
  garageCount: z.number().int().nonnegative().nullable().optional(),
  parkingSpaceCount: z.number().int().nonnegative().nullable().optional(),
  description: optionalText(1000),
});

export const additionalInformationSchema = z.object({
  additionalInformation: optionalText(3000),
  legalNotes: optionalText(3000),
  sellerNotes: optionalText(3000),
  commissionNotes: optionalText(1000),
  availability: optionalText(200),
  notes: z.record(z.string(), z.string().max(2000).nullable().optional()).optional(),
  legalFlags: legalFlagsSchema.optional(),
});

export const propertyExposeDataSchema = z.object({
  basicInformation: z.object({
    propertyType: z.string().min(1).max(100),
    propertySubtype: optionalText(100),
    usageType: optionalText(50),
    title: optionalText(200),
    address: addressSchema,
  }),
  pricing: pricingSchema,
  propertyDetails: propertyDetailsSchema,
  energy: energyDataSchema.nullable().optional(),
  rental: rentalDataSchema.optional(),
  investment: investmentDataSchema.optional(),
  rooms: z.array(roomDataSchema).max(100).default([]),
  equipment: z.array(equipmentDataSchema).max(200).default([]),
  outdoorAreas: z.array(outdoorAreaSchema).max(20).default([]),
  parking: parkingSchema.optional(),
  description: z
    .object({
      short: optionalText(2000),
      long: optionalText(6000),
    })
    .optional(),
  location: locationDataSchema,
  images: z.array(exposeImageSchema).max(500).default([]),
  floorPlans: z.array(exposeImageSchema).max(100).default([]),
  maps: z.array(exposeImageSchema).max(20).default([]),
  additionalInformation: additionalInformationSchema.default({}),
  agent: agentDataSchema.optional(),
  systemBranding: systemBrandingSchema.default({ companyName: 'Vista', processSteps: [] }),
});

export type EnergyData = z.infer<typeof energyDataSchema>;
export type RoomData = z.infer<typeof roomDataSchema>;
export type EquipmentData = z.infer<typeof equipmentDataSchema>;
export type ExposeImage = z.infer<typeof exposeImageSchema>;
export type LocationData = z.infer<typeof locationDataSchema>;
export type BorisEnrichment = z.infer<typeof borisEnrichmentSchema>;
export type StructuredAddress = z.infer<typeof addressSchema>;
export type PlaceCategory = z.infer<typeof placeCategorySchema>;
export type Place = z.infer<typeof placeSchema>;
export type LocationIntelligence = z.infer<typeof locationIntelligenceSchema>;
export type AgentData = z.infer<typeof agentDataSchema>;
export type SystemBranding = z.infer<typeof systemBrandingSchema>;
export type RentalData = z.infer<typeof rentalDataSchema>;
export type InvestmentData = z.infer<typeof investmentDataSchema>;
export type LegalFlags = z.infer<typeof legalFlagsSchema>;
export type PropertyExposeData = z.infer<typeof propertyExposeDataSchema>;

export const emptyExposeData = (): PropertyExposeData => ({
  basicInformation: {
    propertyType: 'apartment',
    propertySubtype: null,
    title: null,
    address: { country: 'Deutschland' },
  },
  pricing: {
    purchasePrice: null,
    rentPrice: null,
    additionalCosts: null,
    buyerCommission: null,
    sellerCommission: null,
    pricePerM2: null,
    commissionRate: null,
    commissionPayer: null,
    commissionVatIncluded: null,
  },
  propertyDetails: {
    livingArea: null,
    plotArea: null,
    usableArea: null,
    rooms: null,
    bedrooms: null,
    bathrooms: null,
    guestToilets: null,
    yearBuilt: null,
    completionYear: null,
    floor: null,
    numberOfFloors: null,
    garageCount: null,
    parkingSpaceCount: null,
    bodenrichtwert: null,
    buildingStatus: null,
    renovationStatus: null,
    lastModernizationYear: null,
  },
  energy: null,
  rental: { isRented: null, furnished: null, annualRent: null },
  investment: { grossYieldTargetPercent: null, grossYieldActualPercent: null },
  rooms: [],
  equipment: [],
  outdoorAreas: [],
  parking: { garageCount: null, parkingSpaceCount: null, description: null },
  description: { short: null, long: null },
  location: { address: { country: 'Deutschland' } },
  images: [],
  floorPlans: [],
  maps: [],
  additionalInformation: {
    additionalInformation: null,
    legalNotes: null,
    sellerNotes: null,
    commissionNotes: null,
    availability: null,
    notes: {},
    legalFlags: {
      usufruct: null,
      leasehold: null,
      foreclosure: null,
      heritageProtection: null,
    },
  },
  agent: undefined,
  systemBranding: { companyName: 'Vista', processSteps: [] },
});
