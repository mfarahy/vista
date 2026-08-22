import type {
  PropertyExposeData,
  ExposeImage,
  AgentData,
  LocationIntelligence,
} from './expose-data.js';
import type { LocationResearch } from '../mastra/schemas/location-research.js';
import type { DocumentUnderstandingResult } from './document-understanding/types.js';
import type { MarketingContentRecord } from './marketing-content/types.js';
import type { ExposeConfiguration } from './expose-configuration.js';

export { emptyExposeData, propertyExposeDataSchema } from './expose-data.js';
export type {
  PropertyExposeData,
  ExposeImage,
  EnergyData,
  AgentData,
  SystemBranding,
  LocationIntelligence,
} from './expose-data.js';
export type { LocationResearch } from '../mastra/schemas/location-research.js';
export type { MarketingContentRecord } from './marketing-content/types.js';

export const PROPERTY_TYPES = [
  ['apartment', 'Apartment'],
  ['house', 'House'],
  ['villa', 'Villa'],
  ['penthouse', 'Penthouse'],
  ['semi-detached', 'Semi-detached house'],
  ['terraced', 'Terraced house'],
  ['other', 'Other'],
] as const;

export const FEATURE_OPTIONS = [
  ['balcony', 'Balcony'],
  ['terrace', 'Terrace'],
  ['garden', 'Garden'],
  ['garage', 'Garage'],
  ['parking', 'Parking space'],
  ['elevator', 'Elevator'],
  ['basement', 'Basement'],
  ['attic', 'Attic'],
  ['fitted-kitchen', 'Fitted kitchen'],
  ['underfloor-heating', 'Underfloor heating'],
  ['air-conditioning', 'Air conditioning'],
  ['guest-toilet', 'Guest toilet'],
  ['accessible', 'Accessible'],
  ['storage', 'Storage room'],
  ['wardrobes', 'Built-in wardrobes'],
  ['smart-home', 'Smart home'],
  ['energy-efficient', 'Energy efficient'],
] as const;

export type PropertyType = (typeof PROPERTY_TYPES)[number][0];
export type TransactionType = 'sale' | 'rent';
export type Tone = 'professional' | 'premium' | 'modern' | 'warm' | 'neutral';

export interface PropertyImage {
  id: string;
  url: string;
  fileName: string;
  mimeType: string;
  size: number;
  sequence: number;
  isCover: boolean;
  room?: string | null;
  assetId?: string;
  category?: 'exterior' | 'interior' | 'floor_plan' | 'document' | null;
  subcategory?: string | null;
  caption?: string | null;
  description?: string | null;
  isHeroCandidate?: boolean;
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
  bodenrichtwert?: number | null;
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
  language: 'de' | 'en';
  images: PropertyImage[];
  roomsData: PropertyRoom[];
  expose?: Expose | null;
  /**
   * AI-generated / user-edited Exposé copy (Phase 4). Separated from the
   * factual Property data: generation never modifies the Property model.
   */
  marketingContent?: MarketingContentRecord | null;
  createdAt?: string;
  updatedAt?: string;
  exposeData?: PropertyExposeData;
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

export interface StructuredExposeFact {
  label: string;
  value: string;
}

export interface StructuredExposeImageReference {
  assetId: string;
  caption: string;
}

export interface StructuredExposeContent {
  version: 2;
  cover: {
    title: string;
    location?: string;
    heroImage?: StructuredExposeImageReference;
    purchasePrice?: string;
    livingArea?: string;
    rooms?: string;
  };
  overview: {
    facts: StructuredExposeFact[];
    energy?: { facts: StructuredExposeFact[] };
  };
  objectInformation?: {
    address: import('./expose-data.js').PropertyExposeData['basicInformation']['address'];
  };
  propertyDescription?: {
    paragraphs: { heading: string; text: string }[];
  };
  roomProgram?: { roomId: string; name: string; area?: string; description: string }[];
  equipment?: { facts: StructuredExposeFact[]; description?: string };
  location?: {
    description: string;
    district?: string;
    neighborhood?: string;
    intelligence?: LocationIntelligence;
    research?: LocationResearch;
  };
  otherInformation?: { items: StructuredExposeFact[] };
  additionalInformation?: { items: StructuredExposeFact[] };
  imageSections?: {
    category: ExposeImage['category'];
    label: string;
    images: StructuredExposeImageReference[];
  }[];
  planSections?: { title: string; images: StructuredExposeImageReference[] }[];
  mapSections?: { title: string; images: StructuredExposeImageReference[] }[];
  agentSection?: AgentData;
  vistaSection: {
    heading: string;
    subtitle: string;
    description: string;
    steps: string[];
    logo?: string;
    website?: string;
    email?: string;
    phone?: string;
  };
}
export type StoredExposeContent = ExposeContent | StructuredExposeContent;
export interface Expose {
  id: string;
  propertyId: string;
  template: 'modern';
  content: StoredExposeContent | null;
  /**
   * Presentation configuration persisted by the Exposé Builder (Phase 5A):
   * section visibility/order, selected cover and gallery references, and
   * content overrides. Contains no Property or MarketingContent copies.
   */
  configuration?: ExposeConfiguration | null;
  pdfUrl?: string | null;
  generatedAt?: string | null;
}
export interface PropertyPayload extends Omit<
  Property,
  'id' | 'images' | 'expose' | 'roomsData' | 'createdAt' | 'updatedAt'
> {
  roomsData: Omit<PropertyRoom, 'id'>[];
  exposeData?: PropertyExposeData;
}

export type DocumentStatus = 'pending' | 'processing' | 'completed' | 'failed';
export type DocumentType =
  | 'grundbuchauszug'
  | 'grundriss'
  | 'energieausweis'
  | 'expose'
  | 'lageplan'
  | 'wohnflaechenberechnung'
  | 'bauplan'
  | 'kaufvertrag'
  | 'mietvertrag'
  | 'property_photo'
  | 'other';

export interface DocumentPage {
  pageNumber: number;
  text: string;
}

export interface ExtractedField {
  field: string;
  value: string | number | boolean | null;
  sourceDocumentId: string;
  evidence?: string | null;
  confidence?: number | null;
}

export interface DocumentAnalysisResult {
  text: string;
  documentType?: DocumentType;
  pages?: DocumentPage[];
  fields: ExtractedField[];
  metadata?: Record<string, unknown>;
}

export interface DocumentRecord {
  id: string;
  propertyId: string;
  filename: string;
  mimeType: string;
  size: number;
  url: string;
  status: DocumentStatus;
  documentType?: DocumentType | null;
  error?: string | null;
  analysisResult?: DocumentAnalysisResult | null;
  tags?: string[];
  understandingResult?: DocumentUnderstandingResult | null;
  understandingError?: string | null;
  createdAt: string;
  updatedAt: string;
}

export const emptyProperty = (): PropertyPayload => ({
  propertyType: 'apartment',
  transactionType: 'sale',
  constructionYear: null,
  address: '',
  zipCode: '',
  city: '',
  district: '',
  livingArea: null,
  plotArea: null,
  rooms: null,
  bedrooms: null,
  bathrooms: null,
  floor: '',
  totalFloors: null,
  bodenrichtwert: null,
  availableFrom: '',
  condition: '',
  askingPrice: null,
  additionalCosts: null,
  commission: '',
  hausgeld: null,
  coldRent: null,
  deposit: null,
  selectedFeatures: [],
  additionalFeatures: '',
  surroundings: {},
  locationNote: '',
  sellerDescription: '',
  specialNotes: '',
  targetAudience: '',
  tone: 'professional',
  language: 'en',
  roomsData: [],
});
