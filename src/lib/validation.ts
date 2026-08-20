import { z } from "zod";

const nullableNumber = z.number().finite().nullable().optional();
export const propertySchema = z.object({
  propertyType: z.string(), transactionType: z.enum(["sale", "rent"]), constructionYear: nullableNumber,
  address: z.string().max(180).optional().nullable(), zipCode: z.string().max(20).optional().nullable(), city: z.string().max(100).optional().nullable(), district: z.string().max(100).optional().nullable(),
  livingArea: nullableNumber, plotArea: nullableNumber, rooms: nullableNumber, bedrooms: z.number().int().nonnegative().nullable().optional(), bathrooms: z.number().int().nonnegative().nullable().optional(),
  floor: z.string().max(30).optional().nullable(), totalFloors: z.number().int().nonnegative().nullable().optional(), availableFrom: z.string().max(40).optional().nullable(), condition: z.string().max(50).optional().nullable(),
  askingPrice: nullableNumber, additionalCosts: nullableNumber, commission: z.string().max(100).optional().nullable(), hausgeld: nullableNumber, coldRent: nullableNumber, deposit: nullableNumber,
  selectedFeatures: z.array(z.string()).max(30), additionalFeatures: z.string().max(1000).optional().nullable(), surroundings: z.record(z.string().max(1000)).optional().default({}), locationNote: z.string().max(2000).optional().nullable(), sellerDescription: z.string().max(3000).optional().nullable(), specialNotes: z.string().max(3000).optional().nullable(), targetAudience: z.string().max(300).optional().nullable(), tone: z.enum(["professional", "premium", "modern", "warm", "neutral"]), language: z.enum(["de", "en"]),
  roomsData: z.array(z.object({ name: z.string().min(1).max(100), type: z.string().max(80), size: nullableNumber, floor: z.string().max(30).optional().nullable(), description: z.string().max(1500).optional().nullable(), sequence: z.number().int().nonnegative().optional() })).max(50),
});

export const exposeContentSchema = z.object({ title: z.string(), portalTitle: z.string(), shortDescription: z.string(), mainDescription: z.string(), highlights: z.array(z.string()).min(1).max(8), roomDescriptions: z.array(z.object({ roomId: z.string(), name: z.string(), description: z.string() })), locationDescription: z.string(), targetAudience: z.string(), factualSnapshot: z.array(z.string()) });
