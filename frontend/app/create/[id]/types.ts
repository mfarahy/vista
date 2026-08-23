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
      template: 'modern';
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
    } | null;
    pdfUrl?: string | null;
    generatedAt?: string | null;
  } | null;
  marketingContent?: MarketingContent | null;
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
  ['apartment', 'Wohnung'],
  ['house', 'Haus'],
  ['villa', 'Villa'],
  ['penthouse', 'Penthouse'],
  ['semi-detached', 'Doppelhaushälfte'],
  ['terraced', 'Reihenhaus'],
  ['other', 'Sonstiges'],
] as const;

/**
 * Normalized property subtypes per property type. The first tuple entry is the
 * canonical stored value (what the AI returns, see prompt.ts and
 * WIZARD_FIELD_TARGETS); the second is the German label shown in the wizard.
 * Values and labels live together here so the UI never hard-codes either in
 * more than one place.
 */
export const PROPERTY_SUBTYPES: Record<string, ReadonlyArray<readonly [string, string]>> = {
  apartment: [
    ['condominium', 'Eigentumswohnung'],
    ['groundFloorApartment', 'Erdgeschosswohnung'],
    ['highGroundFloor', 'Hochparterre'],
    ['storeyApartment', 'Etagenwohnung'],
    ['maisonette', 'Maisonette'],
    ['loft', 'Loft'],
    ['terraceApartment', 'Terrassenwohnung'],
    ['penthouse', 'Penthouse'],
    ['atticApartment', 'Dachgeschoss'],
    ['basementApartment', 'Souterrain'],
  ],
  house: [
    ['singleFamilyHouse', 'Einfamilienhaus'],
    ['semiDetached', 'Doppelhaushälfte'],
    ['terraced', 'Reihenhaus'],
    ['endTerraceHouse', 'Reihenendhaus'],
    ['townhouse', 'Stadthaus'],
    ['bungalow', 'Bungalow'],
    ['villa', 'Villa'],
    ['countryHouse', 'Landhaus'],
    ['multiFamilyHouse', 'Mehrfamilienhaus'],
  ],
  villa: [['villa', 'Villa']],
  penthouse: [['penthouse', 'Penthouse']],
  'semi-detached': [['semiDetached', 'Doppelhaushälfte']],
  terraced: [
    ['terraced', 'Reihenhaus'],
    ['endTerraceHouse', 'Reihenendhaus'],
  ],
  other: [],
};

/** Resolves a stored subtype value (normalized or German) to its German label. */
export function subtypeLabel(propertyType: string, value?: string | null): string {
  if (!value) return '';
  const options = PROPERTY_SUBTYPES[propertyType] ?? [];
  return options.find(([key, label]) => key === value || label === value)?.[1] ?? value;
}

/** Resolves a stored subtype value to its normalized key (for Select values). */
export function subtypeKey(propertyType: string, value?: string | null): string {
  if (!value) return '';
  const options = PROPERTY_SUBTYPES[propertyType] ?? [];
  return options.find(([key, label]) => key === value || label === value)?.[0] ?? value;
}

export function propertySubtypeOptions(
  propertyType: string,
): ReadonlyArray<readonly [string, string]> {
  return PROPERTY_SUBTYPES[propertyType] ?? [];
}

export const PROPERTY_USAGE_TYPES = [
  ['ownerOccupied', 'Selbst genutzt'],
  ['rental', 'Vermietet'],
  ['investment', 'Kapitalanlage'],
  ['mixed', 'Teilweise selbst genutzt'],
] as const;

export const PROPERTY_CONDITIONS = [
  ['unknown', 'Keine Angabe'],
  ['firstOccupancy', 'Erstbezug'],
  ['firstOccupancyAfterRenovation', 'Erstbezug nach Sanierung'],
  ['wellMaintained', 'Gepflegt'],
  ['modernized', 'Modernisiert'],
  ['newLike', 'Neuwertig'],
  ['needsRenovation', 'Renovierungsbedürftig'],
  ['renovated', 'Renoviert'],
  ['fullyRenovated', 'Vollständig renoviert'],
] as const;

/** Legacy condition values mapped onto the normalized domain condition set. */
const LEGACY_CONDITION_MAP: Record<string, string> = {
  new: 'firstOccupancy',
  'like-new': 'newLike',
  good: 'wellMaintained',
  renovated: 'renovated',
  'needs-renovation': 'needsRenovation',
};

export function conditionLabel(value?: string | null): string {
  if (!value) return '';
  const normalized = LEGACY_CONDITION_MAP[value] ?? value;
  return PROPERTY_CONDITIONS.find(([key]) => key === normalized)?.[1] ?? value;
}

export function normalizeCondition(value?: string | null): string {
  if (!value) return '';
  return LEGACY_CONDITION_MAP[value] ?? value;
}

export const BUILDING_STATUSES = [
  ['new', 'Neubau'],
  ['existing', 'Bestand'],
] as const;

export const RENOVATION_STATUSES = [
  ['firstOccupancyAfterRenovation', 'Erstbezug nach Sanierung'],
  ['modernized', 'Modernisiert'],
  ['renovated', 'Renoviert'],
  ['fullyRenovated', 'Vollständig renoviert'],
] as const;

export const ENERGY_CERTIFICATE_TYPES = [
  ['needs_based', 'Bedarfsausweis'],
  ['consumption_based', 'Verbrauchsausweis'],
  ['not_available', 'Nicht verfügbar'],
  ['unknown', 'Unbekannt'],
] as const;

export const ENERGY_SOURCES = [
  ['gas', 'Gas'],
  ['oil', 'Öl'],
  ['district_heating', 'Fernwärme'],
  ['heat_pump', 'Wärmepumpe'],
  ['electricity', 'Strom'],
  ['wood', 'Holz'],
  ['pellets', 'Pellets'],
  ['other', 'Sonstige'],
] as const;

export const FEATURE_OPTIONS = [
  ['balcony', 'Balkon'],
  ['terrace', 'Terrasse'],
  ['garden', 'Garten'],
  ['garage', 'Garage'],
  ['parking', 'Stellplatz'],
  ['elevator', 'Aufzug'],
  ['basement', 'Keller'],
  ['attic', 'Dachgeschoss'],
  ['fitted-kitchen', 'Einbauküche'],
  ['underfloor-heating', 'Fußbodenheizung'],
  ['air-conditioning', 'Klimaanlage'],
  ['guest-toilet', 'Gäste-WC'],
  ['shower', 'Dusche'],
  ['bathtub', 'Badewanne'],
  ['carport', 'Carport'],
  ['accessible', 'Barrierefrei'],
  ['storage', 'Abstellraum'],
  ['wardrobes', 'Einbauschränke'],
  ['smart-home', 'Smart Home'],
  ['energy-efficient', 'Energieeffizient'],
] as const;

export const STEPS = [
  'Dokumente',
  'Objekt',
  'Gebäude',
  'Ausstattung',
  'Energie',
  'Finanzen',
  'Recht & Zusätzliches',
  'Lage',
  'Ihre Angaben',
  'Exposé-Inhalt',
  'Fotos',
  'Pläne & Dokumente',
  'Agent',
  'Prüfung',
];

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

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  grundbuchauszug: 'Grundbuchauszug',
  grundriss: 'Grundriss',
  energieausweis: 'Energieausweis',
  expose: 'Exposé',
  lageplan: 'Lageplan / Flurkarte',
  wohnflaechenberechnung: 'Wohnflächenberechnung',
  bauplan: 'Bauplan',
  kaufvertrag: 'Kaufvertrag',
  mietvertrag: 'Mietvertrag',
  teilungserklaerung: 'Teilungserklärung',
  property_photo: 'Property photo',
  other: 'Other',
};

/** German display labels for the AI photo classification. */
export const PHOTO_TYPE_LABELS: Record<PhotoType, string> = {
  exterior: 'Außenansicht',
  living_room: 'Wohnzimmer',
  bedroom: 'Schlafzimmer',
  kitchen: 'Küche',
  bathroom: 'Badezimmer',
  hallway: 'Diele / Flur',
  office: 'Arbeitszimmer',
  dining_room: 'Esszimmer',
  balcony: 'Balkon',
  terrace: 'Terrasse',
  garden: 'Garten',
  view: 'Ausblick',
  garage: 'Garage',
  parking: 'Stellplatz',
  basement: 'Keller',
  utility_room: 'Hauswirtschaftsraum',
  other: 'Sonstiges',
};

/** German display labels for the AI photo tags. */
export const PHOTO_TAG_LABELS: Record<string, string> = {
  'fitted-kitchen': 'Einbauküche',
  'parquet-floor': 'Parkettboden',
  'laminate-floor': 'Laminatboden',
  tiles: 'Fliesen',
  balcony: 'Balkon',
  terrace: 'Terrasse',
  garden: 'Garten',
  bathtub: 'Badewanne',
  shower: 'Dusche',
  'guest-toilet': 'Gäste-WC',
  fireplace: 'Kamin',
  'large-windows': 'Große Fenster',
  'built-in-wardrobes': 'Einbauschränke',
  garage: 'Garage',
  parking: 'Stellplatz',
};

export function photoTypeLabel(type: PhotoType | null | undefined): string {
  if (!type) return '';
  return PHOTO_TYPE_LABELS[type] ?? type;
}

export const LEGAL_FLAG_LABELS: Record<string, string> = {
  usufruct: 'Nießbrauch',
  leasehold: 'Erbbaurecht',
  foreclosure: 'Zwangsversteigerung',
  heritageProtection: 'Denkmalschutz',
};

/** German display label for an additional-information key extracted from documents. */
export function additionalInfoLabel(key: string): string {
  const labels: Record<string, string> = {
    parcelNumber: 'Flurstück',
    plotNumber: 'Flurstück',
    landRegisterDistrict: 'Gemarkung / Amtsgericht',
    landRegisterSheet: 'Grundbuchblatt',
    owners: 'Eingetragene Eigentümer',
    registeredOwners: 'Eingetragene Eigentümer',
    owner_name: 'Eigentümer',
    encumbrances: 'Eingetragene Belastungen',
    registeredEncumbrances: 'Eingetragene Belastungen',
    landCharges: 'Grundschulden',
    registeredLandCharges: 'Grundschulden',
    easements: 'Wegerechte / Dienstbarkeiten',
    rightsOfWay: 'Wegerechte',
    buildingRestrictions: 'Baulasten',
    usufruct: 'Nießbrauch',
    leasehold: 'Erbbaurecht',
    foreclosure: 'Zwangsversteigerung',
    heritageProtection: 'Denkmalschutz',
    orientation: 'Ausrichtung',
    owner: 'Eigentümer',
    landRegister: 'Grundbuch',
    municipal_district: 'Verwaltungsbezirk',
    cadastral_flur: 'Flur',
    cadastral_gemarkung: 'Gemarkung',
    building_plot_area: 'Baugrundstück',
    projected_building_footprint: 'Geplante Bebauungsfläche',
    projected_building_dimensions: 'Gebäudemaße',
    document_date: 'Datum',
    wegAdministrator: 'WEG-Verwaltung',
    specialUseRights: 'Sondernutzungsrechte',
    specialUseRight: 'Sondernutzungsrecht',
    coOwnership: 'Miteigentumsanteil',
    ownershipStructure: 'Eigentümerstruktur',
    wegInformation: 'WEG-Informationen',
    legalRestrictions: 'Rechtliche Einschränkungen',
    houseRules: 'Hausordnung',
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
