export type ImageCategory = 'exterior' | 'interior' | 'floor_plan' | 'document';

export type Property = {
  id: string;
  propertyType: string;
  transactionType: 'sale' | 'rent';
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
  surroundings: Record<string, string>;
  locationNote?: string | null;
  sellerDescription?: string | null;
  specialNotes?: string | null;
  targetAudience?: string | null;
  tone: 'professional' | 'premium' | 'modern' | 'warm' | 'neutral';
  language: 'de' | 'en';
  images: PropertyImage[];
  roomsData: Array<{
    id?: string;
    name: string;
    type: string;
    size?: number | null;
    floor?: string | null;
    description?: string | null;
    sequence: number;
  }>;
  expose?: {
    id: string;
    propertyId: string;
    template: 'modern';
    content: ExposeContent | null;
    pdfUrl?: string | null;
    generatedAt?: string | null;
  } | null;
  createdAt?: string;
  updatedAt?: string;
  exposeData?: ExposeData;
};

export type PropertyImage = {
  id: string;
  url: string;
  fileName: string;
  mimeType: string;
  size: number;
  sequence: number;
  isCover: boolean;
  room?: string | null;
  category?: ImageCategory | string | null;
  subcategory?: string | null;
  caption?: string | null;
};

export type EnergyData = {
  certificateType?: 'needs_based' | 'consumption_based' | 'not_available' | 'unknown' | null;
  yearOfConstruction?: number | null;
  primaryEnergySource?:
    | 'gas'
    | 'oil'
    | 'district_heating'
    | 'heat_pump'
    | 'electricity'
    | 'wood'
    | 'pellets'
    | 'other'
    | null;
  finalEnergyDemand?: number | null;
  finalEnergyConsumption?: number | null;
  efficiencyClass?: 'A+' | 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | null;
};

export type StructuredAddress = {
  street?: string | null;
  houseNumber?: string | null;
  postalCode?: string | null;
  city?: string | null;
  district?: string | null;
  state?: string | null;
  country?: string;
  formattedAddress?: string | null;
  latitude?: number | null;
  longitude?: number | null;
};

export type AdditionalInformation = {
  additionalInformation?: string | null;
  legalNotes?: string | null;
  sellerNotes?: string | null;
  commissionNotes?: string | null;
  availability?: string | null;
  notes?: Record<string, string>;
};

export type ExposeData = {
  basicInformation: {
    propertyType: string;
    propertySubtype?: string | null;
    title?: string | null;
    address: StructuredAddress;
  };
  pricing: {
    purchasePrice?: number | null;
    rentPrice?: number | null;
    additionalCosts?: number | null;
    buyerCommission?: string | null;
    sellerCommission?: string | null;
  };
  propertyDetails: {
    livingArea?: number | null;
    plotArea?: number | null;
    rooms?: number | null;
    bathrooms?: number | null;
    yearBuilt?: number | null;
    completionYear?: number | null;
    floor?: string | null;
    numberOfFloors?: number | null;
    garageCount?: number | null;
    parkingSpaceCount?: number | null;
    bodenrichtwert?: number | null;
  };
  energy?: EnergyData | null;
  rooms: Array<{
    id?: string;
    type: string;
    name: string;
    area?: number | null;
    description?: string | null;
    features: string[];
    floor?: string | null;
    order?: number;
  }>;
  equipment: Array<{ category: string; name: string; description?: string | null }>;
  outdoorAreas: Array<{
    type: string;
    area?: number | null;
    orientation?: string | null;
    description?: string | null;
  }>;
  location: {
    address: ExposeData['basicInformation']['address'];
    latitude?: number | null;
    longitude?: number | null;
    district?: string | null;
    neighborhood?: string | null;
    description?: string | null;
  };
  images: Array<Record<string, unknown>>;
  floorPlans: Array<Record<string, unknown>>;
  maps: Array<Record<string, unknown>>;
  additionalInformation: AdditionalInformation;
  agent?: {
    name?: string | null;
    company?: string | null;
    address?: ExposeData['basicInformation']['address'];
    phone?: string | null;
    email?: string | null;
    website?: string | null;
    photo?: string | null;
    logo?: string | null;
  };
  systemBranding: {
    companyName: string;
    logo?: string | null;
    website?: string | null;
    email?: string | null;
    phone?: string | null;
    description?: string | null;
    processSteps: string[];
  };
};

export type ExposeContent = {
  title: string;
  portalTitle: string;
  shortDescription: string;
  mainDescription: string;
  highlights: string[];
  roomDescriptions: Array<{ roomId: string; name: string; description: string }>;
  locationDescription: string;
  targetAudience: string;
  factualSnapshot: string[];
};

export type PropertyPayload = Omit<
  Property,
  'id' | 'images' | 'expose' | 'roomsData' | 'createdAt' | 'updatedAt'
> & {
  roomsData: Array<Omit<NonNullable<Property['roomsData']>[number], 'id'>>;
};

export type SetProperty = <K extends keyof PropertyPayload>(
  key: K,
  value: PropertyPayload[K],
) => void;

export type UploadImages = (
  files: FileList | null,
  meta: { category: ImageCategory; subcategory?: string; caption?: string },
) => Promise<void>;

export type BorisEnrichment = {
  available: boolean;
  source?: string;
  referenceDate?: string | null;
  bodenrichtwert?: { value?: number; unit?: string } | null;
};

export type ExternalFacility = {
  id?: string;
  name?: string;
  category?: string;
  distanceMeters?: number;
};

export type ExternalGeocoding = {
  coordinates?: { latitude: number; longitude: number } | null;
  address?: StructuredAddress;
  summary?: string;
  facilities?: {
    shopping?: ExternalFacility[];
    education?: ExternalFacility[];
    transport?: ExternalFacility[];
    healthcare?: ExternalFacility[];
    recreation?: ExternalFacility[];
    dailyLife?: ExternalFacility[];
  };
};

export type ExternalResearch = {
  mikrolage?: { summary?: string };
  makrolage?: { summary?: string };
};

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

export const STEPS = [
  'Address',
  'Property',
  'Details & Price',
  'Features',
  'Energy',
  'Photos',
  'Plans & Documents',
  'Agent',
  'Review',
];

export const emptyExposeData = (property: Property): ExposeData => ({
  basicInformation: {
    propertyType: property.propertyType,
    propertySubtype: null,
    title: null,
    address: {
      street: property.address,
      houseNumber: null,
      postalCode: property.zipCode,
      city: property.city,
      district: property.district,
      country: 'Deutschland',
    },
  },
  pricing: {
    purchasePrice: property.transactionType === 'sale' ? property.askingPrice : null,
    rentPrice:
      property.transactionType === 'rent' ? (property.coldRent ?? property.askingPrice) : null,
    additionalCosts: property.additionalCosts,
    buyerCommission: property.commission,
    sellerCommission: null,
  },
  propertyDetails: {
    livingArea: property.livingArea,
    plotArea: property.plotArea,
    rooms: property.rooms,
    bathrooms: property.bathrooms,
    yearBuilt: property.constructionYear,
    completionYear: null,
    floor: property.floor,
    numberOfFloors: property.totalFloors,
    garageCount: null,
    parkingSpaceCount: null,
    bodenrichtwert: property.bodenrichtwert ?? null,
  },
  energy: null,
  rooms: [],
  equipment: [],
  outdoorAreas: [],
  location: {
    address: {
      street: property.address,
      houseNumber: null,
      postalCode: property.zipCode,
      city: property.city,
      district: property.district,
      country: 'Deutschland',
    },
    district: property.district,
    latitude: null,
    longitude: null,
    neighborhood: null,
    description: property.locationNote,
  },
  images: [],
  floorPlans: [],
  maps: [],
  additionalInformation: {
    additionalInformation: null,
    legalNotes: null,
    sellerNotes: property.specialNotes,
    commissionNotes: null,
    availability: property.availableFrom,
  },
  systemBranding: { companyName: 'Vista', processSteps: [] },
  agent: undefined,
});

export const initialPayload = (property: Property): PropertyPayload => {
  const {
    id: _id,
    images: _images,
    expose: _expose,
    createdAt: _createdAt,
    updatedAt: _updatedAt,
    ...payload
  } = property;
  return {
    ...payload,
    roomsData: property.roomsData.map(({ id: _roomId, ...room }) => room),
    exposeData: property.exposeData ?? emptyExposeData(property),
  };
};

export const pretty = (value: string | number | null | undefined) =>
  value === null || value === undefined || value === '' ? 'Not provided' : String(value);

export const money = (value?: number | null) =>
  value
    ? new Intl.NumberFormat('de-DE', {
        style: 'currency',
        currency: 'EUR',
        maximumFractionDigits: 0,
      }).format(value)
    : 'Not provided';
