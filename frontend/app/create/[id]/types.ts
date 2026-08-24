import { defaultLocale, translate, type Locale, type TranslationKey } from '@/lib/i18n/core';

export type ImageCategory = 'exterior' | 'interior' | 'floor_plan' | 'document';

/** One editable marketing field with its provenance (ai | user). */
export type MarketingTextField = {
  value: string;
  source: 'ai' | 'user';
};

export type MarketingTextListField = {
  value: string[];
  source: 'ai' | 'user';
};

/**
 * Persisted AI-generated / user-edited Exposé copy. `locationDescription` is
 * null when no meaningful location facts exist. User edits set `source` to
 * "user" so regeneration never silently overwrites them.
 */
export type MarketingContent = {
  title: MarketingTextField;
  subtitle: MarketingTextField;
  highlights: MarketingTextListField;
  propertyDescription: MarketingTextField;
  equipmentDescription: MarketingTextField;
  locationDescription: MarketingTextField | null;
};

export const emptyMarketingContent = (): MarketingContent => ({
  title: { value: '', source: 'ai' },
  subtitle: { value: '', source: 'ai' },
  highlights: { value: [], source: 'ai' },
  propertyDescription: { value: '', source: 'ai' },
  equipmentDescription: { value: '', source: 'ai' },
  locationDescription: null,
});

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
    configuration?: {
      template: 'modern' | 'classic' | 'elegant';
      sections: Array<{ id: string; type: string; visible: boolean }>;
      selectedCoverImageId?: string;
      galleryImageIds?: string[];
      contentOverrides?: {
        title?: string;
        subtitle?: string;
        highlights?: string[];
        propertyDescription?: string;
        equipmentDescription?: string;
        locationDescription?: string;
      };
      branding?: {
        companyName?: string;
        logoUrl?: string;
        phone?: string;
        email?: string;
        website?: string;
      };
    } | null;
    pdfUrl?: string | null;
    generatedAt?: string | null;
  } | null;
  marketingContent?: MarketingContent | null;
  createdAt?: string;
  updatedAt?: string;
  exposeData?: ExposeData;
  floorPlan3D?: FloorPlan3DRecord | null;
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

export type FloorPlan3DStatus = 'pending' | 'completed' | 'failed';

export type FloorPlan3DPoint = { x: number; y: number };

export type FloorPlan3DRoom = {
  id: string;
  name: string;
  level: number;
  x: number;
  y: number;
  width: number;
  depth: number;
  height: number;
  areaM2: number | null;
};

export type FloorPlan3DWall = {
  id: string;
  level: number;
  from: FloorPlan3DPoint;
  to: FloorPlan3DPoint;
  thickness: number;
  height: number;
};

export type FloorPlan3DOpening = {
  id: string;
  level: number;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
};

/** Canonical 3D floor plan model produced by the backend provider. */
export type FloorPlan3DModel = {
  unit: 'm';
  rooms: FloorPlan3DRoom[];
  walls: FloorPlan3DWall[];
  doors: FloorPlan3DOpening[];
  windows: FloorPlan3DOpening[];
};

/**
 * Persisted 3D floor plan generation record on the property. `model` is only
 * set when generation completed; `error` only when it failed.
 */
export type FloorPlan3DRecord = {
  status: FloorPlan3DStatus;
  provider: string;
  sourceImageId: string;
  model: FloorPlan3DModel | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
};

export type EnergyData = {
  certificateType?: 'needs_based' | 'consumption_based' | 'not_available' | 'unknown' | null;
  certificateDate?: string | null;
  certificateValidUntil?: string | null;
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
  heatingType?: string | null;
  hotWaterIncluded?: boolean | null;
  finalEnergyDemand?: number | null;
  finalEnergyConsumption?: number | null;
  efficiencyClass?: 'A+' | 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | null;
};

export type RentalData = {
  isRented?: boolean | null;
  furnished?: boolean | null;
  annualRent?: number | null;
};

/** WEG facts for an Eigentumswohnung; only explicitly stated values. */
export type WegData = {
  /** Monthly Hausgeld / Wohngeld in EUR. */
  hausgeldEur?: number | null;
  /** Instandhaltungsrücklage in EUR. */
  maintenanceReserveEur?: number | null;
  /** Miteigentumsanteil preserved verbatim, e.g. "145/10.000". */
  coOwnershipShare?: string | null;
};

export type InvestmentData = {
  grossYieldTargetPercent?: number | null;
  grossYieldActualPercent?: number | null;
};

export type LegalFlags = {
  usufruct?: boolean | null;
  leasehold?: boolean | null;
  foreclosure?: boolean | null;
  heritageProtection?: boolean | null;
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

export type TravelMode = 'foot' | 'bike' | 'car' | 'transit';

/**
 * Verified route from the property to a nearby facility. All values come from
 * the routing provider — the Exposé never displays a facility without one.
 */
export type NearbyFacilityRoute = {
  distanceMeters: number;
  durationSeconds: number;
  travelMode: TravelMode;
  provider: string;
};

export type NearbyFacility = {
  id: string;
  name: string;
  category: string;
  latitude: number;
  longitude: number;
  address?: string;
  distanceMeters: number;
  distanceType: 'straight_line';
  source: string;
  route?: NearbyFacilityRoute;
};

export type NearbyFacilityGroups = {
  shopping: NearbyFacility[];
  education: NearbyFacility[];
  transport: NearbyFacility[];
  healthcare: NearbyFacility[];
  recreation: NearbyFacility[];
  dailyLife: NearbyFacility[];
};

export type LocationIntelligence = {
  address: StructuredAddress;
  coordinates: { latitude: number; longitude: number };
  formattedAddress?: string;
  source: 'geocoded' | 'manual';
  geocodingProvider?: string;
  confidence?: number;
  matchType?: string;
  verificationRequired: boolean;
  facilities: NearbyFacilityGroups;
  radiusMeters: number;
  mapAsset?: {
    assetId: string;
    url: string;
    mimeType: string;
    caption: string;
  };
  summary: string;
  generatedAt: string;
  expiresAt: string;
};

export type AdditionalInformation = {
  additionalInformation?: string | null;
  legalNotes?: string | null;
  sellerNotes?: string | null;
  commissionNotes?: string | null;
  availability?: string | null;
  notes?: Record<string, string>;
  legalFlags?: LegalFlags;
};

export type ExposeData = {
  basicInformation: {
    propertyType: string;
    propertySubtype?: string | null;
    usageType?: string | null;
    title?: string | null;
    address: StructuredAddress;
  };
  pricing: {
    purchasePrice?: number | null;
    rentPrice?: number | null;
    additionalCosts?: number | null;
    buyerCommission?: string | null;
    sellerCommission?: string | null;
    pricePerM2?: number | null;
    commissionRate?: number | null;
    commissionPayer?: 'buyer' | 'seller' | 'both' | null;
    commissionVatIncluded?: boolean | null;
  };
  propertyDetails: {
    livingArea?: number | null;
    plotArea?: number | null;
    usableArea?: number | null;
    rooms?: number | null;
    bedrooms?: number | null;
    bathrooms?: number | null;
    guestToilets?: number | null;
    yearBuilt?: number | null;
    completionYear?: number | null;
    floor?: string | null;
    numberOfFloors?: number | null;
    garageCount?: number | null;
    parkingSpaceCount?: number | null;
    bodenrichtwert?: number | null;
    buildingStatus?: 'new' | 'existing' | null;
    renovationStatus?: string | null;
    lastModernizationYear?: number | null;
  };
  energy?: EnergyData | null;
  rental?: RentalData;
  weg?: WegData;
  investment?: InvestmentData;
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
    intelligence?: LocationIntelligence;
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
  route?: NearbyFacilityRoute;
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
  ['apartment', 'propertyType.apartment'],
  ['house', 'propertyType.house'],
  ['villa', 'propertyType.villa'],
  ['penthouse', 'propertyType.penthouse'],
  ['semi-detached', 'propertyType.semiDetached'],
  ['terraced', 'propertyType.terraced'],
  ['other', 'propertyType.other'],
] as const;

/**
 * Normalized property subtypes per property type. The first tuple entry is the
 * canonical stored value (what the AI returns, see prompt.ts and
 * WIZARD_FIELD_TARGETS); the second is the translation key of the label shown
 * in the wizard. Values and label keys live together here so the UI never
 * hard-codes either in more than one place.
 */
export const PROPERTY_SUBTYPES: Record<string, ReadonlyArray<readonly [string, TranslationKey]>> = {
  apartment: [
    ['condominium', 'propertySubtype.condominium'],
    ['groundFloorApartment', 'propertySubtype.groundFloorApartment'],
    ['highGroundFloor', 'propertySubtype.highGroundFloor'],
    ['storeyApartment', 'propertySubtype.storeyApartment'],
    ['maisonette', 'propertySubtype.maisonette'],
    ['loft', 'propertySubtype.loft'],
    ['terraceApartment', 'propertySubtype.terraceApartment'],
    ['penthouse', 'propertySubtype.penthouse'],
    ['atticApartment', 'propertySubtype.atticApartment'],
    ['basementApartment', 'propertySubtype.basementApartment'],
  ],
  house: [
    ['singleFamilyHouse', 'propertySubtype.singleFamilyHouse'],
    ['semiDetached', 'propertySubtype.semiDetached'],
    ['terraced', 'propertySubtype.terraced'],
    ['endTerraceHouse', 'propertySubtype.endTerraceHouse'],
    ['townhouse', 'propertySubtype.townhouse'],
    ['bungalow', 'propertySubtype.bungalow'],
    ['villa', 'propertySubtype.villa'],
    ['countryHouse', 'propertySubtype.countryHouse'],
    ['multiFamilyHouse', 'propertySubtype.multiFamilyHouse'],
  ],
  villa: [['villa', 'propertySubtype.villa']],
  penthouse: [['penthouse', 'propertySubtype.penthouse']],
  'semi-detached': [['semiDetached', 'propertySubtype.semiDetached']],
  terraced: [
    ['terraced', 'propertySubtype.terraced'],
    ['endTerraceHouse', 'propertySubtype.endTerraceHouse'],
  ],
  other: [],
};

/** Resolves a stored subtype value to its normalized key (for Select values). */
export function subtypeKey(propertyType: string, value?: string | null): string {
  if (!value) return '';
  const options = PROPERTY_SUBTYPES[propertyType] ?? [];
  return options.find(([key]) => key === value)?.[0] ?? value;
}

export function propertySubtypeOptions(
  propertyType: string,
): ReadonlyArray<readonly [string, TranslationKey]> {
  return PROPERTY_SUBTYPES[propertyType] ?? [];
}

export const PROPERTY_USAGE_TYPES = [
  ['ownerOccupied', 'usageType.ownerOccupied'],
  ['rental', 'usageType.rental'],
  ['investment', 'usageType.investment'],
  ['mixed', 'usageType.mixed'],
] as const;

export const PROPERTY_CONDITIONS = [
  ['unknown', 'condition.unknown'],
  ['firstOccupancy', 'condition.firstOccupancy'],
  ['firstOccupancyAfterRenovation', 'condition.firstOccupancyAfterRenovation'],
  ['wellMaintained', 'condition.wellMaintained'],
  ['modernized', 'condition.modernized'],
  ['newLike', 'condition.newLike'],
  ['needsRenovation', 'condition.needsRenovation'],
  ['renovated', 'condition.renovated'],
  ['fullyRenovated', 'condition.fullyRenovated'],
] as const;

/** Legacy condition values mapped onto the normalized domain condition set. */
const LEGACY_CONDITION_MAP: Record<string, string> = {
  new: 'firstOccupancy',
  'like-new': 'newLike',
  good: 'wellMaintained',
  renovated: 'renovated',
  'needs-renovation': 'needsRenovation',
};

/** Resolves a stored condition value to its translation key. */
export function conditionLabel(value?: string | null): TranslationKey | string {
  if (!value) return '';
  const normalized = LEGACY_CONDITION_MAP[value] ?? value;
  return PROPERTY_CONDITIONS.find(([key]) => key === normalized)?.[1] ?? value;
}

export function normalizeCondition(value?: string | null): string {
  if (!value) return '';
  return LEGACY_CONDITION_MAP[value] ?? value;
}

export const BUILDING_STATUSES = [
  ['new', 'buildingStatus.new'],
  ['existing', 'buildingStatus.existing'],
] as const;

export const RENOVATION_STATUSES = [
  ['firstOccupancyAfterRenovation', 'renovationStatus.firstOccupancyAfterRenovation'],
  ['modernized', 'renovationStatus.modernized'],
  ['renovated', 'renovationStatus.renovated'],
  ['fullyRenovated', 'renovationStatus.fullyRenovated'],
] as const;

export const ENERGY_CERTIFICATE_TYPES = [
  ['needs_based', 'energyCertificateType.needs_based'],
  ['consumption_based', 'energyCertificateType.consumption_based'],
  ['not_available', 'energyCertificateType.not_available'],
  ['unknown', 'energyCertificateType.unknown'],
] as const;

export const ENERGY_SOURCES = [
  ['gas', 'energySource.gas'],
  ['oil', 'energySource.oil'],
  ['district_heating', 'energySource.district_heating'],
  ['heat_pump', 'energySource.heat_pump'],
  ['electricity', 'energySource.electricity'],
  ['wood', 'energySource.wood'],
  ['pellets', 'energySource.pellets'],
  ['other', 'energySource.other'],
] as const;

export const FEATURE_OPTIONS = [
  ['balcony', 'feature.balcony'],
  ['terrace', 'feature.terrace'],
  ['garden', 'feature.garden'],
  ['garage', 'feature.garage'],
  ['parking', 'feature.parking'],
  ['elevator', 'feature.elevator'],
  ['basement', 'feature.basement'],
  ['attic', 'feature.attic'],
  ['fitted-kitchen', 'feature.fitted-kitchen'],
  ['underfloor-heating', 'feature.underfloor-heating'],
  ['air-conditioning', 'feature.air-conditioning'],
  ['guest-toilet', 'feature.guest-toilet'],
  ['shower', 'feature.shower'],
  ['bathtub', 'feature.bathtub'],
  ['carport', 'feature.carport'],
  ['accessible', 'feature.accessible'],
  ['storage', 'feature.storage'],
  ['wardrobes', 'feature.wardrobes'],
  ['smart-home', 'feature.smart-home'],
  ['energy-efficient', 'feature.energy-efficient'],
] as const;

export const STEPS = [
  'wizard.steps.documents',
  'wizard.steps.object',
  'wizard.steps.building',
  'wizard.steps.features',
  'wizard.steps.energy',
  'wizard.steps.financial',
  'wizard.steps.legal',
  'wizard.steps.location',
  'wizard.steps.yourDetails',
  'wizard.steps.marketing',
  'wizard.steps.photos',
  'wizard.steps.plans',
  'wizard.steps.agent',
  'wizard.steps.review',
] as const;

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
  | 'teilungserklaerung'
  | 'property_photo'
  | 'other';

export type DocumentPage = {
  pageNumber: number;
  text: string;
};

export type ExtractedField = {
  field: string;
  value: string | number | boolean | null;
  sourceDocumentId: string;
  evidence?: string | null;
  confidence?: number | null;
};

export type DocumentAnalysisResult = {
  text: string;
  documentType?: DocumentType;
  pages?: DocumentPage[];
  fields: ExtractedField[];
  metadata?: Record<string, unknown>;
};

export type UnderstandingWizardField = {
  field: string;
  value: string | number | boolean | null;
  evidence: string | null;
};

export type UnderstandingAdditionalInfo = {
  key: string;
  value: string | number | boolean | null;
  evidence: string | null;
};

export type PhotoType =
  | 'exterior'
  | 'living_room'
  | 'bedroom'
  | 'kitchen'
  | 'bathroom'
  | 'hallway'
  | 'office'
  | 'dining_room'
  | 'balcony'
  | 'terrace'
  | 'garden'
  | 'view'
  | 'garage'
  | 'parking'
  | 'basement'
  | 'utility_room'
  | 'other';

export type PhotoTag = {
  tag: string;
  /** Factual description of what is visibly present. */
  evidence: string;
};

/** Visual analysis of a property_photo document. */
export type PhotoUnderstanding = {
  photoType: PhotoType | null;
  photoTags: PhotoTag[];
  visualDescription: string | null;
  coverSuitability: 'high' | 'medium' | 'low' | null;
  coverSuitabilityReason: string | null;
};

export type DocumentUnderstandingResult = {
  documentType: DocumentType;
  tags: string[];
  summary: string;
  keepInLibrary: boolean;
  wizardFields: UnderstandingWizardField[];
  additionalInformation: UnderstandingAdditionalInfo[];
  /** Optional for backward compatibility with records from earlier phases. */
  photo?: PhotoUnderstanding | null;
};

export type DocumentRecord = {
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
};

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, TranslationKey> = {
  grundbuchauszug: 'documentType.grundbuchauszug',
  grundriss: 'documentType.grundriss',
  energieausweis: 'documentType.energieausweis',
  expose: 'documentType.expose',
  lageplan: 'documentType.lageplan',
  wohnflaechenberechnung: 'documentType.wohnflaechenberechnung',
  bauplan: 'documentType.bauplan',
  kaufvertrag: 'documentType.kaufvertrag',
  mietvertrag: 'documentType.mietvertrag',
  teilungserklaerung: 'documentType.teilungserklaerung',
  property_photo: 'documentType.property_photo',
  other: 'documentType.other',
};

/** Translation keys for the AI photo classification labels. */
export const PHOTO_TYPE_LABELS: Record<PhotoType, TranslationKey> = {
  exterior: 'photoType.exterior',
  living_room: 'photoType.living_room',
  bedroom: 'photoType.bedroom',
  kitchen: 'photoType.kitchen',
  bathroom: 'photoType.bathroom',
  hallway: 'photoType.hallway',
  office: 'photoType.office',
  dining_room: 'photoType.dining_room',
  balcony: 'photoType.balcony',
  terrace: 'photoType.terrace',
  garden: 'photoType.garden',
  view: 'photoType.view',
  garage: 'photoType.garage',
  parking: 'photoType.parking',
  basement: 'photoType.basement',
  utility_room: 'photoType.utility_room',
  other: 'photoType.other',
};

/** Translation keys for the AI photo tags. */
export const PHOTO_TAG_LABELS: Record<string, TranslationKey> = {
  'fitted-kitchen': 'photoTag.fitted-kitchen',
  'parquet-floor': 'photoTag.parquet-floor',
  'laminate-floor': 'photoTag.laminate-floor',
  tiles: 'photoTag.tiles',
  balcony: 'photoTag.balcony',
  terrace: 'photoTag.terrace',
  garden: 'photoTag.garden',
  bathtub: 'photoTag.bathtub',
  shower: 'photoTag.shower',
  'guest-toilet': 'photoTag.guest-toilet',
  fireplace: 'photoTag.fireplace',
  'large-windows': 'photoTag.large-windows',
  'built-in-wardrobes': 'photoTag.built-in-wardrobes',
  garage: 'photoTag.garage',
  parking: 'photoTag.parking',
};

/** Translation key for a photo type, falling back to the raw type. */
export function photoTypeLabel(type: PhotoType | null | undefined): TranslationKey | string {
  if (!type) return '';
  return PHOTO_TYPE_LABELS[type] ?? type;
}

/**
 * Translation key for a structured-equipment category used in the review step.
 * The persisted category is a stable internal id; only the displayed label is
 * localized (reusing the wizard's feature-category labels).
 */
export function equipmentCategoryLabel(
  category: string | null | undefined,
): TranslationKey | string {
  const labels: Record<string, TranslationKey> = {
    interior: 'steps.features.categoryInterior',
    kitchen: 'steps.features.categoryKitchen',
    bathroom: 'steps.features.categoryBathroom',
    flooring: 'steps.features.categoryFlooring',
    windows: 'steps.features.categoryWindows',
    heating: 'steps.features.categoryHeating',
    technology: 'steps.features.categoryTechnology',
    outdoor: 'steps.features.categoryOutdoor',
    parking: 'steps.features.categoryParking',
    storage: 'steps.features.categoryStorage',
    other: 'steps.features.categoryOther',
  };
  return labels[category ?? ''] ?? category ?? '';
}

/**
 * Translation key for a photo/plan section key used as image alt text. Room
 * sections and the generic "other" fall back to a neutral "Property photo"
 * label; known sections reuse their translated names.
 */
export function photoSectionLabel(
  subcategory: string | null | undefined,
): TranslationKey | string {
  if (!subcategory) return 'media.photo';
  const labels: Record<string, TranslationKey> = {
    kitchen: 'steps.photos.kitchen',
    bathroom: 'steps.photos.bathroom',
    front: 'steps.photos.exteriorViews',
    garden: 'steps.photos.garden',
    terrace: 'steps.photos.terrace',
    balcony: 'steps.photos.balcony',
    entrance: 'steps.photos.entrance',
    garage: 'steps.photos.garage',
    parking: 'steps.photos.parking',
    ground_floor: 'media.planTypes.grundriss',
    site_plan: 'media.planTypes.lageplan',
    energy_certificate: 'media.planTypes.energieausweis',
  };
  return labels[subcategory] ?? 'media.photo';
}

export const LEGAL_FLAG_LABELS: Record<string, TranslationKey> = {
  usufruct: 'legalFlag.usufruct',
  leasehold: 'legalFlag.leasehold',
  foreclosure: 'legalFlag.foreclosure',
  heritageProtection: 'legalFlag.heritageProtection',
};

/** Translation key for an additional-information key extracted from documents. */
export function additionalInfoLabel(key: string): TranslationKey | string {
  const labels: Record<string, TranslationKey> = {
    parcelNumber: 'additionalInfo.parcelNumber',
    plotNumber: 'additionalInfo.plotNumber',
    landRegisterDistrict: 'additionalInfo.landRegisterDistrict',
    landRegisterSheet: 'additionalInfo.landRegisterSheet',
    owners: 'additionalInfo.owners',
    registeredOwners: 'additionalInfo.registeredOwners',
    owner_name: 'additionalInfo.owner_name',
    encumbrances: 'additionalInfo.encumbrances',
    registeredEncumbrances: 'additionalInfo.registeredEncumbrances',
    landCharges: 'additionalInfo.landCharges',
    registeredLandCharges: 'additionalInfo.registeredLandCharges',
    easements: 'additionalInfo.easements',
    rightsOfWay: 'additionalInfo.rightsOfWay',
    buildingRestrictions: 'additionalInfo.buildingRestrictions',
    usufruct: 'additionalInfo.usufruct',
    leasehold: 'additionalInfo.leasehold',
    foreclosure: 'additionalInfo.foreclosure',
    heritageProtection: 'additionalInfo.heritageProtection',
    orientation: 'additionalInfo.orientation',
    owner: 'additionalInfo.owner',
    landRegister: 'additionalInfo.landRegister',
    municipal_district: 'additionalInfo.municipal_district',
    cadastral_flur: 'additionalInfo.cadastral_flur',
    cadastral_gemarkung: 'additionalInfo.cadastral_gemarkung',
    building_plot_area: 'additionalInfo.building_plot_area',
    projected_building_footprint: 'additionalInfo.projected_building_footprint',
    projected_building_dimensions: 'additionalInfo.projected_building_dimensions',
    document_date: 'additionalInfo.document_date',
    wegAdministrator: 'additionalInfo.wegAdministrator',
    specialUseRights: 'additionalInfo.specialUseRights',
    specialUseRight: 'additionalInfo.specialUseRight',
    coOwnership: 'additionalInfo.coOwnership',
    ownershipStructure: 'additionalInfo.ownershipStructure',
    wegInformation: 'additionalInfo.wegInformation',
    legalRestrictions: 'additionalInfo.legalRestrictions',
    houseRules: 'additionalInfo.houseRules',
    registryCourt: 'additionalInfo.registryCourt',
    landRegisterDistrictOrLocation: 'additionalInfo.landRegisterDistrictOrLocation',
    encumbrancesAndRestrictions: 'additionalInfo.encumbrancesAndRestrictions',
    additionalRestriction: 'additionalInfo.additionalRestriction',
    documentDate: 'additionalInfo.documentDate',
    cadastralDistrict: 'additionalInfo.cadastralDistrict',
    cadastralFlur: 'additionalInfo.cadastralFlur',
    buildablePlotArea: 'additionalInfo.buildablePlotArea',
    projectedBuildingDimensions: 'additionalInfo.projectedBuildingDimensions',
    registeredOwner: 'additionalInfo.registeredOwner',
    approvalInformation: 'additionalInfo.approvalInformation',
    planDate: 'additionalInfo.planDate',
    calculationDate: 'additionalInfo.calculationDate',
    calculatedBy: 'additionalInfo.calculatedBy',
    listedRooms: 'additionalInfo.listedRooms',
    primaryEnergyDemand: 'additionalInfo.primaryEnergyDemand',
    numberOfApartments: 'additionalInfo.numberOfApartments',
    energyCertificateIssuer: 'additionalInfo.energyCertificateIssuer',
    registrationNumber: 'additionalInfo.registrationNumber',
    flur: 'additionalInfo.flur',
    ownershipTransferDate: 'additionalInfo.ownershipTransferDate',
    legalInformation: 'additionalInfo.legalInformation',
  };
  return labels[key] ?? key;
}

export const emptyExposeData = (property: Property): ExposeData => ({
  basicInformation: {
    propertyType: property.propertyType,
    propertySubtype: null,
    usageType: null,
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
    pricePerM2: null,
    commissionRate: null,
    commissionPayer: null,
    commissionVatIncluded: null,
  },
  propertyDetails: {
    livingArea: property.livingArea,
    plotArea: property.plotArea,
    usableArea: null,
    rooms: property.rooms,
    bedrooms: property.bedrooms,
    bathrooms: property.bathrooms,
    guestToilets: null,
    yearBuilt: property.constructionYear,
    completionYear: null,
    floor: property.floor,
    numberOfFloors: property.totalFloors,
    garageCount: null,
    parkingSpaceCount: null,
    bodenrichtwert: property.bodenrichtwert ?? null,
    buildingStatus: null,
    renovationStatus: null,
    lastModernizationYear: null,
  },
  energy: null,
  rental: { isRented: null, furnished: null, annualRent: null },
  weg: { hausgeldEur: null, maintenanceReserveEur: null, coOwnershipShare: null },
  investment: { grossYieldTargetPercent: null, grossYieldActualPercent: null },
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
    legalFlags: {
      usufruct: null,
      leasehold: null,
      foreclosure: null,
      heritageProtection: null,
    },
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
    condition: normalizeCondition(payload.condition) || null,
    roomsData: property.roomsData.map(({ id: _roomId, ...room }) => room),
    exposeData: property.exposeData ?? emptyExposeData(property),
  };
};

export const pretty = (
  value: string | number | null | undefined,
  locale: Locale = defaultLocale,
) =>
  value === null || value === undefined || value === ''
    ? translate(locale, 'common.notSpecified')
    : String(value);

export const money = (value?: number | null, locale: Locale = defaultLocale) =>
  value
    ? new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: 'EUR',
        maximumFractionDigits: 0,
      }).format(value)
    : translate(locale, 'common.notSpecified');
