export const PROPERTY_TYPES = [
  ["apartment", "Apartment"],
  ["house", "House"],
  ["villa", "Villa"],
  ["penthouse", "Penthouse"],
  ["semi-detached", "Semi-detached house"],
  ["terraced", "Terraced house"],
  ["other", "Other"],
] as const;

export const FEATURE_OPTIONS = [
  ["balcony", "Balcony"],
  ["terrace", "Terrace"],
  ["garden", "Garden"],
  ["garage", "Garage"],
  ["parking", "Parking space"],
  ["elevator", "Elevator"],
  ["basement", "Basement"],
  ["attic", "Attic"],
  ["fitted-kitchen", "Fitted kitchen"],
  ["underfloor-heating", "Underfloor heating"],
  ["air-conditioning", "Air conditioning"],
  ["guest-toilet", "Guest toilet"],
  ["accessible", "Accessible"],
  ["storage", "Storage room"],
  ["wardrobes", "Built-in wardrobes"],
  ["smart-home", "Smart home"],
  ["energy-efficient", "Energy efficient"],
] as const;

export type PropertyType = (typeof PROPERTY_TYPES)[number][0];
export type TransactionType = "sale" | "rent";
export type Tone = "professional" | "premium" | "modern" | "warm" | "neutral";

export interface PropertyImage {
  id: string;
  url: string;
  fileName: string;
  mimeType: string;
  size: number;
  sequence: number;
  isCover: boolean;
  room?: string | null;
}
export interface PropertyRoom {
  id: string;
  name: string;
  type: string;
  size?: number | null;
  floor?: string | null;
  description?: string | null;
  sequence: number;
}
export interface Surroundings {
  transport?: string;
  schools?: string;
  childcare?: string;
  shopping?: string;
  restaurants?: string;
  parks?: string;
  medical?: string;
  highway?: string;
  airport?: string;
}
export interface Property {
  id: string;
  propertyType: PropertyType;
  transactionType: TransactionType;
  constructionYear?: number | null;
  address?: string | null;
  zipCode?: string | null;
  city?: string | null;
  district?: string | null;
  livingArea?: number | null;
  plotArea?: number | null;
  rooms?: number | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  floor?: string | null;
  totalFloors?: number | null;
  availableFrom?: string | null;
  condition?: string | null;
  askingPrice?: number | null;
  additionalCosts?: number | null;
  commission?: string | null;
  hausgeld?: number | null;
  coldRent?: number | null;
  deposit?: number | null;
  selectedFeatures: string[];
  additionalFeatures?: string | null;
  surroundings: Surroundings;
  locationNote?: string | null;
  sellerDescription?: string | null;
  specialNotes?: string | null;
  targetAudience?: string | null;
  tone: Tone;
  language: "de" | "en";
  images: PropertyImage[];
  roomsData: PropertyRoom[];
  expose?: Expose | null;
  createdAt?: string;
  updatedAt?: string;
}
export interface ExposeContent {
  title: string;
  portalTitle: string;
  shortDescription: string;
  mainDescription: string;
  highlights: string[];
  roomDescriptions: { roomId: string; name: string; description: string }[];
  locationDescription: string;
  targetAudience: string;
  factualSnapshot: string[];
}
export interface Expose {
  id: string;
  propertyId: string;
  template: "modern";
  content: ExposeContent | null;
  pdfUrl?: string | null;
  generatedAt?: string | null;
}
export interface PropertyPayload extends Omit<
  Property,
  "id" | "images" | "expose" | "roomsData" | "createdAt" | "updatedAt"
> {
  roomsData: Omit<PropertyRoom, "id">[];
}

export const emptyProperty = (): PropertyPayload => ({
  propertyType: "apartment",
  transactionType: "sale",
  constructionYear: null,
  address: "",
  zipCode: "",
  city: "",
  district: "",
  livingArea: null,
  plotArea: null,
  rooms: null,
  bedrooms: null,
  bathrooms: null,
  floor: "",
  totalFloors: null,
  availableFrom: "",
  condition: "",
  askingPrice: null,
  additionalCosts: null,
  commission: "",
  hausgeld: null,
  coldRent: null,
  deposit: null,
  selectedFeatures: [],
  additionalFeatures: "",
  surroundings: {},
  locationNote: "",
  sellerDescription: "",
  specialNotes: "",
  targetAudience: "",
  tone: "professional",
  language: "en",
  roomsData: [],
});
