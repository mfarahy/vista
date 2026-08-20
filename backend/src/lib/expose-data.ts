import { z } from "zod";

export const certificateTypeSchema = z.enum(["needs_based", "consumption_based", "not_available", "unknown"]);
export const primaryEnergySourceSchema = z.enum(["gas", "oil", "district_heating", "heat_pump", "electricity", "wood", "pellets", "other"]);
export const efficiencyClassSchema = z.enum(["A+", "A", "B", "C", "D", "E", "F", "G", "H"]);
const nullableNumber = z.number().finite().nullable().optional();
const nonNegativeNumber = z.number().finite().nonnegative().nullable().optional();
const text = (max: number) => z.string().max(max).nullable().optional();

export const addressSchema = z.object({
  street: text(180), houseNumber: text(30), postalCode: text(20), city: text(100), district: text(100), country: z.string().max(100).default("Deutschland"),
});
export const energyDataSchema = z.object({
  certificateType: certificateTypeSchema.nullable().optional(), yearOfConstruction: z.number().int().min(1800).max(new Date().getFullYear() + 1).nullable().optional(), primaryEnergySource: primaryEnergySourceSchema.nullable().optional(), finalEnergyDemand: nonNegativeNumber, finalEnergyConsumption: nonNegativeNumber, efficiencyClass: efficiencyClassSchema.nullable().optional(),
}).superRefine((value, context) => {
  if (value.certificateType === "needs_based" && value.finalEnergyDemand == null) context.addIssue({ code: z.ZodIssueCode.custom, path: ["finalEnergyDemand"], message: "Bedarfsorientierte Ausweise benötigen einen Endenergiebedarf." });
  if (value.certificateType === "consumption_based" && value.finalEnergyConsumption == null) context.addIssue({ code: z.ZodIssueCode.custom, path: ["finalEnergyConsumption"], message: "Verbrauchsorientierte Ausweise benötigen einen Endenergieverbrauch." });
});
export const roomDataSchema = z.object({ id: z.string().optional(), type: z.enum(["living_room", "bedroom", "child_room", "office", "kitchen", "dining_room", "bathroom", "guest_wc", "hallway", "utility_room", "hobby_room", "basement", "attic", "garage", "other"]), name: z.string().min(1).max(100), area: nonNegativeNumber, description: text(1500), features: z.array(z.string().max(100)).max(30).default([]), floor: text(30), order: z.number().int().nonnegative().optional() });
export const equipmentDataSchema = z.object({ id: z.string().optional(), category: z.enum(["interior", "kitchen", "bathroom", "flooring", "windows", "heating", "technology", "outdoor", "parking", "storage", "other"]), name: z.string().min(1).max(120), description: text(1000) });
export const outdoorAreaSchema = z.object({ id: z.string().optional(), type: z.enum(["garden", "terrace", "balcony", "courtyard", "roof_terrace"]), area: nonNegativeNumber, orientation: text(50), description: text(1000) });
export const exposeImageSchema = z.object({ id: z.string().optional(), assetId: z.string().min(1), category: z.enum(["exterior", "interior", "floor_plan", "document"]), subcategory: text(80), caption: text(180), description: text(1000), order: z.number().int().nonnegative().optional(), isHeroCandidate: z.boolean().default(false), url: z.string().optional(), fileName: z.string().optional(), mimeType: z.string().optional(), size: z.number().int().nonnegative().optional() });
export const placeCategorySchema = z.enum(["supermarket", "grocery", "shopping_center", "kindergarten", "school", "train_station", "subway", "tram", "bus_stop", "doctor", "pharmacy", "hospital", "park", "playground", "sports_facility", "restaurant", "cafe", "bank", "post_office"]);
export const placeSchema = z.object({ id: z.string().max(200), name: z.string().max(200), category: placeCategorySchema, latitude: z.number().finite().min(-90).max(90), longitude: z.number().finite().min(-180).max(180), address: z.string().max(300).optional(), distanceMeters: z.number().finite().nonnegative(), distanceType: z.literal("straight_line"), source: z.string().max(100) });
export const locationIntelligenceSchema = z.object({ address: addressSchema, coordinates: z.object({ latitude: z.number().finite().min(-90).max(90), longitude: z.number().finite().min(-180).max(180) }), formattedAddress: z.string().max(300).optional(), source: z.enum(["geocoded", "manual"]), geocodingProvider: z.string().max(100).optional(), confidence: z.number().finite().min(0).max(1).optional(), matchType: z.string().max(100).optional(), verificationRequired: z.boolean().default(false), facilities: z.object({ shopping: z.array(placeSchema), education: z.array(placeSchema), transport: z.array(placeSchema), healthcare: z.array(placeSchema), recreation: z.array(placeSchema), dailyLife: z.array(placeSchema) }), radiusMeters: z.number().int().positive(), mapAsset: z.object({ assetId: z.string(), url: z.string(), mimeType: z.literal("image/svg+xml"), caption: z.string() }).optional(), summary: z.string().max(2000), generatedAt: z.string(), expiresAt: z.string() });
export const locationDataSchema = z.object({ address: addressSchema, latitude: z.number().finite().min(-90).max(90).nullable().optional(), longitude: z.number().finite().min(-180).max(180).nullable().optional(), district: text(100), neighborhood: text(100), description: text(2000), intelligence: locationIntelligenceSchema.optional() });
export const agentDataSchema = z.object({ name: text(150), company: text(150), address: addressSchema.optional(), phone: text(60), email: z.string().email().nullable().optional(), website: z.string().url().nullable().optional(), photo: text(500), logo: text(500) });
export const systemBrandingSchema = z.object({ companyName: z.string().max(150).default("Vista"), logo: text(500), website: z.string().url().nullable().optional(), email: z.string().email().nullable().optional(), phone: text(60), description: text(1000), processSteps: z.array(z.string().max(200)).max(20).default([]) });
export const parkingSchema = z.object({ garageCount: z.number().int().nonnegative().nullable().optional(), parkingSpaceCount: z.number().int().nonnegative().nullable().optional(), description: text(1000) });
export const additionalInformationSchema = z.object({ additionalInformation: text(3000), legalNotes: text(3000), sellerNotes: text(3000), commissionNotes: text(1000), availability: text(200) }).default({});
export const propertyExposeDataSchema = z.object({
  basicInformation: z.object({ propertyType: z.string().min(1).max(100), propertySubtype: text(100), title: text(200), address: addressSchema }),
  pricing: z.object({ purchasePrice: nonNegativeNumber, rentPrice: nonNegativeNumber, additionalCosts: nonNegativeNumber, buyerCommission: text(120), sellerCommission: text(120) }),
  propertyDetails: z.object({ livingArea: nonNegativeNumber, plotArea: nonNegativeNumber, rooms: nonNegativeNumber, bathrooms: nonNegativeNumber, yearBuilt: z.number().int().min(1000).max(new Date().getFullYear() + 1).nullable().optional(), completionYear: z.number().int().min(1000).max(new Date().getFullYear() + 1).nullable().optional(), floor: text(30), numberOfFloors: z.number().int().nonnegative().nullable().optional(), garageCount: z.number().int().nonnegative().nullable().optional(), parkingSpaceCount: z.number().int().nonnegative().nullable().optional() }),
  energy: energyDataSchema.nullable().optional(), rooms: z.array(roomDataSchema).max(100).default([]), equipment: z.array(equipmentDataSchema).max(200).default([]), outdoorAreas: z.array(outdoorAreaSchema).max(20).default([]), parking: parkingSchema.optional(), description: z.object({ short: text(2000), long: text(6000) }).optional(), location: locationDataSchema, images: z.array(exposeImageSchema).max(500).default([]), floorPlans: z.array(exposeImageSchema).max(100).default([]), maps: z.array(exposeImageSchema).max(20).default([]), additionalInformation: additionalInformationSchema, agent: agentDataSchema.optional(), systemBranding: systemBrandingSchema.default({ companyName: "Vista", processSteps: [] }),
});
export type PropertyExposeData = z.infer<typeof propertyExposeDataSchema>;
export type EnergyData = z.infer<typeof energyDataSchema>;
export type ExposeImage = z.infer<typeof exposeImageSchema>;
export type LocationIntelligence = z.infer<typeof locationIntelligenceSchema>;
export type StructuredAddress = z.infer<typeof addressSchema>;
export const emptyExposeData = (): PropertyExposeData => ({
  basicInformation: { propertyType: "apartment", propertySubtype: null, title: null, address: { country: "Deutschland" } },
  pricing: { purchasePrice: null, rentPrice: null, additionalCosts: null, buyerCommission: null, sellerCommission: null },
  propertyDetails: { livingArea: null, plotArea: null, rooms: null, bathrooms: null, yearBuilt: null, completionYear: null, floor: null, numberOfFloors: null, garageCount: null, parkingSpaceCount: null },
  energy: null, rooms: [], equipment: [], outdoorAreas: [], location: { address: { country: "Deutschland" }, latitude: null, longitude: null, district: null, neighborhood: null, description: null }, images: [], floorPlans: [], maps: [], additionalInformation: {}, systemBranding: { companyName: "Vista", processSteps: [] },
});
