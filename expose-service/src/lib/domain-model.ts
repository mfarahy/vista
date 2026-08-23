import type { StructuredAddress } from './expose-data.js';
import type { Property, PropertyType, StoredExposeContent, TransactionType } from './types.js';

/**
 * MVP domain model. Separates the four concepts the wizard and the future
 * Exposé builder work with:
 *
 *   Property          = factual information about the real estate object
 *   Listing           = how this property is currently offered / published
 *   MarketingContent  = human/AI generated selling content
 *   Expose            = presentation / design configuration
 *
 * The persisted JSON store keeps the legacy flat `Property` shape. The
 * `build*Model` functions below are the mapping bridge: they derive this
 * domain model from the persisted record without adding a second persisted
 * structure. `WIZARD_FIELD_TARGETS` is the mapping target for AI-extracted
 * wizard fields (see document-understanding/prefill.ts).
 */

export const PROPERTY_CONDITIONS = [
  'unknown',
  'firstOccupancy',
  'firstOccupancyAfterRenovation',
  'wellMaintained',
  'modernized',
  'newLike',
  'needsRenovation',
  'renovated',
  'fullyRenovated',
] as const;

export type PropertyCondition = (typeof PROPERTY_CONDITIONS)[number];

export const PROPERTY_USAGE_TYPES = ['ownerOccupied', 'rental', 'investment', 'mixed'] as const;
export type PropertyUsageType = (typeof PROPERTY_USAGE_TYPES)[number];

export interface PropertyModel {
  identity: {
    propertyId?: string;
  };
  address: StructuredAddress;
  classification: {
    propertyType: PropertyType;
    propertySubtype?: string;
    usageType?: PropertyUsageType;
  };
  transaction: {
    type: TransactionType;
  };
  areas: {
    livingAreaM2?: number;
    usableAreaM2?: number;
    plotAreaM2?: number;
  };
  rooms: {
    total?: number;
    bedrooms?: number;
    bathrooms?: number;
    guestToilets?: number;
  };
  building: {
    yearBuilt?: number;
    status?: 'new' | 'existing';
    condition?: PropertyCondition;
    floors?: number;
    basement?: boolean;
    attic?: boolean;
    renovationStatus?: string;
    lastModernizationYear?: number;
  };
  features: {
    kitchen?: {
      fitted?: boolean;
    };
    bathroom?: {
      shower?: boolean;
      bathtub?: boolean;
    };
    guestToilet?: boolean;
    heating?: {
      type?: string;
      energySource?: string;
    };
    parking?: {
      parkingSpaces?: number;
      garage?: boolean;
      carport?: boolean;
    };
  };
  outdoor: {
    balcony?: boolean;
    terrace?: boolean;
    garden?: boolean;
    gardenAreaM2?: number;
    orientation?: string;
  };
  energy?: {
    certificateType?: string;
    certificateDate?: string;
    certificateValidUntil?: string;
    efficiencyClass?: string;
    demandKwhPerM2A?: number;
    consumptionKwhPerM2A?: number;
    primaryEnergySource?: string;
    heatingType?: string;
    hotWaterIncluded?: boolean;
  };
  financial: {
    askingPriceEur?: number;
    pricePerM2Eur?: number;
    marketValueEur?: number;
    priceVsMarketValuePercent?: number;
    commission?: {
      ratePercent?: number;
      payer?: 'buyer' | 'seller' | 'both';
      vatIncluded?: boolean;
    };
  };
  rental?: {
    isRented?: boolean;
    monthlyRentEur?: number;
    annualRentEur?: number;
    additionalCostsEur?: number;
    /** Rental security (Kaution) in EUR, only when explicitly stated. */
    depositEur?: number;
    furnished?: boolean;
    availableFrom?: string;
  };
  investment?: {
    grossYieldTargetPercent?: number;
    grossYieldActualPercent?: number;
  };
  legal?: {
    usufruct?: boolean;
    leasehold?: boolean;
    foreclosure?: boolean;
    heritageProtection?: boolean;
    easements?: string[];
    restrictions?: string[];
    notes?: string;
  };
  location?: {
    district?: string;
    publicTransport?: string[];
    schools?: string[];
    kindergartens?: string[];
    shopping?: string[];
    medical?: string[];
    recreation?: string[];
    description?: string;
  };
}

export interface ListingModel {
  transactionType: TransactionType;
  status: 'draft' | 'active' | 'archived';
  availableFrom?: string;
  provider?: string;
  contact?: {
    name?: string;
    email?: string;
    phone?: string;
  };
  publication?: {
    firstPublishedAt?: string;
    lastPublishedAt?: string;
    includedPlatforms?: string[];
    excludedPlatforms?: string[];
  };
}

export interface MarketingContentModel {
  title?: string;
  subtitle?: string;
  highlights?: string[];
  propertyDescription?: string;
  equipmentDescription?: string;
  locationDescription?: string;
  additionalDescription?: string;
}

export interface ExposeModel {
  template?: string;
  sections?: string[];
  contentOverrides?: Record<string, unknown>;
}

export interface DomainModel {
  property: PropertyModel;
  listing: ListingModel;
  marketingContent: MarketingContentModel;
  expose: ExposeModel;
}

const RENOVATION_CONDITIONS: readonly PropertyCondition[] = [
  'firstOccupancyAfterRenovation',
  'modernized',
  'renovated',
  'fullyRenovated',
];

function hasFeature(property: Property, feature: string): boolean {
  return property.selectedFeatures.includes(feature);
}

function hasAnyValue(values: Record<string, unknown>): boolean {
  return Object.values(values).some((value) => value !== undefined && value !== null && value !== '');
}

function normalizeCondition(value: string | null | undefined): PropertyCondition {
  if (value && (PROPERTY_CONDITIONS as readonly string[]).includes(value)) {
    return value as PropertyCondition;
  }
  return 'unknown';
}

function normalizeUsageType(value: string | null | undefined): PropertyUsageType | undefined {
  if (value && (PROPERTY_USAGE_TYPES as readonly string[]).includes(value)) {
    return value as PropertyUsageType;
  }
  return undefined;
}

function toTextList(value: string | null | undefined): string[] | undefined {
  return value?.trim() ? [value.trim()] : undefined;
}

function commissionOf(
  rate: string | null | undefined,
): PropertyModel['financial']['commission'] | undefined {
  if (!rate) return undefined;
  const match = rate.replace(',', '.').match(/(\d+(?:\.\d+)?)/);
  const ratePercent = match ? Number(match[1]) : undefined;
  return {
    ...(ratePercent !== undefined ? { ratePercent } : {}),
    payer: 'buyer',
    vatIncluded: /inkl/i.test(rate),
  };
}

export function buildPropertyModel(property: Property): PropertyModel {
  const exposeData = property.exposeData;
  const address: StructuredAddress = exposeData?.basicInformation.address ?? {
    street: property.address ?? undefined,
    postalCode: property.zipCode ?? undefined,
    city: property.city ?? undefined,
    district: property.district ?? undefined,
    country: 'Deutschland',
  };

  const details = exposeData?.propertyDetails;
  const pricing = exposeData?.pricing;
  const energy = exposeData?.energy;
  const condition = property.condition ?? undefined;
  const conditionEnum = normalizeCondition(condition);

  const livingArea = details?.livingArea ?? undefined;
  const askingPrice = pricing?.purchasePrice ?? undefined;
  const pricePerM2 =
    pricing?.pricePerM2 ??
    (askingPrice != null && livingArea != null && livingArea > 0
      ? Math.round(askingPrice / livingArea)
      : undefined);

  const gardenOutdoor = exposeData?.outdoorAreas.find((area) => area.type === 'garden');
  const surroundings = property.surroundings ?? {};
  const recreationText =
    [surroundings.parks, surroundings.restaurants].filter(Boolean).join(' · ') || undefined;

  const rentalData = exposeData?.rental;
  const rental =
    (rentalData ? hasAnyValue(rentalData as unknown as Record<string, unknown>) : false) ||
    property.transactionType === 'rent' ||
    pricing?.rentPrice != null ||
    property.coldRent != null ||
    property.deposit != null
      ? {
          isRented: rentalData?.isRented ?? undefined,
          monthlyRentEur: pricing?.rentPrice ?? property.coldRent ?? undefined,
          annualRentEur: rentalData?.annualRent ?? undefined,
          additionalCostsEur: pricing?.additionalCosts ?? undefined,
          depositEur: property.deposit ?? undefined,
          furnished: rentalData?.furnished ?? undefined,
          availableFrom: property.availableFrom ?? undefined,
        }
      : undefined;

  const investment = exposeData?.investment
    ? {
        grossYieldTargetPercent: exposeData.investment.grossYieldTargetPercent ?? undefined,
        grossYieldActualPercent: exposeData.investment.grossYieldActualPercent ?? undefined,
      }
    : undefined;

  const legalFlags = exposeData?.additionalInformation?.legalFlags;
  const legal =
    legalFlags || exposeData?.additionalInformation?.legalNotes
      ? {
          usufruct: legalFlags?.usufruct ?? undefined,
          leasehold: legalFlags?.leasehold ?? undefined,
          foreclosure: legalFlags?.foreclosure ?? undefined,
          heritageProtection: legalFlags?.heritageProtection ?? undefined,
          notes: exposeData?.additionalInformation?.legalNotes ?? undefined,
        }
      : undefined;

  return {
    identity: { propertyId: property.id },
    address,
    classification: {
      propertyType: property.propertyType,
      propertySubtype: exposeData?.basicInformation.propertySubtype ?? undefined,
      usageType: normalizeUsageType(exposeData?.basicInformation.usageType),
    },
    transaction: { type: property.transactionType },
    areas: {
      livingAreaM2: livingArea,
      usableAreaM2: details?.usableArea ?? undefined,
      plotAreaM2: details?.plotArea ?? undefined,
    },
    rooms: {
      total: details?.rooms ?? undefined,
      bedrooms: details?.bedrooms ?? property.bedrooms ?? undefined,
      bathrooms: details?.bathrooms ?? undefined,
      guestToilets: details?.guestToilets ?? undefined,
    },
    building: {
      yearBuilt: details?.yearBuilt ?? undefined,
      status:
        details?.buildingStatus ??
        (condition === 'new' || conditionEnum === 'firstOccupancy'
          ? 'new'
          : conditionEnum !== 'unknown' || details?.yearBuilt != null
            ? 'existing'
            : undefined),
      condition: conditionEnum,
      floors: details?.numberOfFloors ?? undefined,
      basement: hasFeature(property, 'basement') ? true : undefined,
      attic: hasFeature(property, 'attic') ? true : undefined,
      renovationStatus:
        details?.renovationStatus ??
        ((RENOVATION_CONDITIONS as readonly string[]).includes(condition ?? '')
          ? (condition as PropertyCondition)
          : undefined),
      lastModernizationYear: details?.lastModernizationYear ?? undefined,
    },
    features: {
      kitchen: hasFeature(property, 'fitted-kitchen') ? { fitted: true } : undefined,
      bathroom:
        hasFeature(property, 'shower') || hasFeature(property, 'bathtub')
          ? {
              shower: hasFeature(property, 'shower') ? true : undefined,
              bathtub: hasFeature(property, 'bathtub') ? true : undefined,
            }
          : undefined,
      guestToilet: hasFeature(property, 'guest-toilet') ? true : undefined,
      heating: energy?.primaryEnergySource || energy?.heatingType
        ? {
            type: energy.heatingType ?? undefined,
            energySource: energy.primaryEnergySource ?? undefined,
          }
        : undefined,
      parking: {
        parkingSpaces: details?.parkingSpaceCount ?? undefined,
        garage:
          (details?.garageCount ?? 0) > 0 || hasFeature(property, 'garage') ? true : undefined,
        carport: hasFeature(property, 'carport') ? true : undefined,
      },
    },
    outdoor: {
      balcony: hasFeature(property, 'balcony') ? true : undefined,
      terrace: hasFeature(property, 'terrace') ? true : undefined,
      garden: hasFeature(property, 'garden') ? true : undefined,
      gardenAreaM2: gardenOutdoor?.area ?? undefined,
      orientation: gardenOutdoor?.orientation ?? undefined,
    },
    energy: energy && hasAnyValue({
      certificateType: energy.certificateType,
      certificateDate: energy.certificateDate,
      certificateValidUntil: energy.certificateValidUntil,
      efficiencyClass: energy.efficiencyClass,
      demandKwhPerM2A: energy.finalEnergyDemand,
      consumptionKwhPerM2A: energy.finalEnergyConsumption,
      primaryEnergySource: energy.primaryEnergySource,
      heatingType: energy.heatingType,
      hotWaterIncluded: energy.hotWaterIncluded,
    })
      ? {
          certificateType: energy.certificateType ?? undefined,
          certificateDate: energy.certificateDate ?? undefined,
          certificateValidUntil: energy.certificateValidUntil ?? undefined,
          efficiencyClass: energy.efficiencyClass ?? undefined,
          demandKwhPerM2A: energy.finalEnergyDemand ?? undefined,
          consumptionKwhPerM2A: energy.finalEnergyConsumption ?? undefined,
          primaryEnergySource: energy.primaryEnergySource ?? undefined,
          heatingType: energy.heatingType ?? undefined,
          hotWaterIncluded: energy.hotWaterIncluded ?? undefined,
        }
      : undefined,
    financial: {
      askingPriceEur: askingPrice,
      pricePerM2Eur: pricePerM2,
      commission:
        pricing?.commissionRate != null
          ? {
              ratePercent: pricing.commissionRate,
              payer: pricing.commissionPayer ?? 'buyer',
              vatIncluded: pricing.commissionVatIncluded ?? false,
            }
          : commissionOf(pricing?.buyerCommission),
    },
    rental,
    investment:
      investment && hasAnyValue(investment) ? investment : undefined,
    legal: legal && hasAnyValue(legal as Record<string, unknown>) ? legal : undefined,
    location: {
      district: exposeData?.location.district ?? undefined,
      publicTransport: toTextList(surroundings.transport),
      schools: toTextList(surroundings.schools),
      kindergartens: toTextList(surroundings.childcare),
      shopping: toTextList(surroundings.shopping),
      medical: toTextList(surroundings.medical),
      recreation: toTextList(recreationText),
      description: exposeData?.location.description || property.locationNote || undefined,
    },
  };
}

export function buildListingModel(property: Property): ListingModel {
  // The application has no explicit listing-status field yet. A property whose
  // exposé content has been generated is considered active, everything else a
  // draft. Publication metadata stays undefined until the app tracks it.
  return {
    transactionType: property.transactionType,
    status: property.expose?.content ? 'active' : 'draft',
    availableFrom: property.availableFrom ?? undefined,
  };
}

function marketingContentOf(content: StoredExposeContent): MarketingContentModel {
  if ('highlights' in content) {
    return {
      highlights: content.highlights,
      propertyDescription: content.mainDescription,
      locationDescription: content.locationDescription,
      additionalDescription: content.shortDescription,
    };
  }
  return {
    title: content.cover.title,
    locationDescription: content.location?.description,
  };
}

export function buildMarketingContentModel(property: Property): MarketingContentModel {
  // Phase 4: the persisted marketing-content record is the current source of
  // truth when present. Values carry provenance (ai/user) on the record; the
  // domain view exposes the plain values.
  const persisted = property.marketingContent;
  if (persisted) {
    return {
      title: persisted.title?.value ?? undefined,
      subtitle: persisted.subtitle?.value ?? undefined,
      highlights: persisted.highlights?.value ?? undefined,
      propertyDescription: persisted.propertyDescription?.value ?? undefined,
      equipmentDescription: persisted.equipmentDescription?.value ?? undefined,
      locationDescription: persisted.locationDescription?.value ?? undefined,
    };
  }
  return {
    title: property.exposeData?.basicInformation.title ?? undefined,
    subtitle: property.exposeData?.basicInformation.propertySubtype ?? undefined,
    ...(property.expose?.content ? marketingContentOf(property.expose.content) : {}),
  };
}

export function buildExposeModel(property: Property): ExposeModel {
  return {
    template: property.expose?.template ?? 'modern',
  };
}

export function buildDomainModel(property: Property): DomainModel {
  return {
    property: buildPropertyModel(property),
    listing: buildListingModel(property),
    marketingContent: buildMarketingContentModel(property),
    expose: buildExposeModel(property),
  };
}

/**
 * Wizard fields intentionally kept outside the MVP property model. They have no
 * typed target and stay preserved in `DocumentRecord.understandingResult`.
 *  - floor: unit floor level is not part of the domain model.
 *  - parking: boolean, while `features.parking.parkingSpaces` is a count.
 *  - parcelNumber, plotNumber: land-register references, not property facts.
 */
export const WIZARD_FIELDS_WITHOUT_TARGET = [
  'floor',
  'parking',
  'parcelNumber',
  'plotNumber',
] as const;

export interface WizardFieldTarget {
  /** Dotted path into PropertyModel, e.g. `areas.livingAreaM2`. */
  path: string;
  /** Optional conversion applied to the raw wizard value before assignment. */
  transform?: (value: string | number | boolean | null) => string | number | boolean | null;
}

function toString(value: string | number | boolean | null): string | number | boolean | null {
  return value === null ? null : String(value);
}

function toNumber(value: string | number | boolean | null): string | number | boolean | null {
  if (value === null || value === '') return null;
  const num = typeof value === 'number' ? value : Number(String(value).replace(',', '.'));
  return Number.isFinite(num) ? num : null;
}

function toBoolean(value: string | number | boolean | null): string | number | boolean | null {
  if (typeof value === 'boolean') return value;
  if (value === 1 || value === '1' || value === 'true') return true;
  if (value === 0 || value === '0' || value === 'false') return false;
  return null;
}

/**
 * Mapping target from AI wizard fields (see document-understanding/schema.ts)
 * onto the domain model. The keys are the short flat wizard field names; the
 * paths are the dotted PropertyModel locations. A later phase will expand the
 * extraction to fill these paths directly; the existing prefill pipeline is
 * unchanged.
 */
export const WIZARD_FIELD_TARGETS: Record<string, WizardFieldTarget> = {
  // Address
  street: { path: 'address.street', transform: toString },
  houseNumber: { path: 'address.houseNumber', transform: toString },
  postalCode: { path: 'address.postalCode', transform: toString },
  city: { path: 'address.city', transform: toString },
  district: { path: 'address.district', transform: toString },
  state: { path: 'address.state', transform: toString },
  country: { path: 'address.country', transform: toString },
  // Classification
  propertyType: { path: 'classification.propertyType', transform: toString },
  propertySubtype: { path: 'classification.propertySubtype', transform: toString },
  usageType: { path: 'classification.usageType', transform: toString },
  // Areas
  livingArea: { path: 'areas.livingAreaM2', transform: toNumber },
  usableArea: { path: 'areas.usableAreaM2', transform: toNumber },
  plotArea: { path: 'areas.plotAreaM2', transform: toNumber },
  // Rooms
  rooms: { path: 'rooms.total', transform: toNumber },
  bedrooms: { path: 'rooms.bedrooms', transform: toNumber },
  bathrooms: { path: 'rooms.bathrooms', transform: toNumber },
  guestToilets: { path: 'rooms.guestToilets', transform: toNumber },
  // Building
  yearBuilt: { path: 'building.yearBuilt', transform: toNumber },
  yearOfConstruction: { path: 'building.yearBuilt', transform: toNumber },
  buildingStatus: { path: 'building.status', transform: toString },
  condition: { path: 'building.condition', transform: toString },
  numberOfFloors: { path: 'building.floors', transform: toNumber },
  basement: { path: 'building.basement', transform: toBoolean },
  attic: { path: 'building.attic', transform: toBoolean },
  renovationStatus: { path: 'building.renovationStatus', transform: toString },
  lastModernizationYear: { path: 'building.lastModernizationYear', transform: toNumber },
  // Features
  garage: { path: 'features.parking.garage', transform: toBoolean },
  // Outdoor
  balcony: { path: 'outdoor.balcony', transform: toBoolean },
  terrace: { path: 'outdoor.terrace', transform: toBoolean },
  garden: { path: 'outdoor.garden', transform: toBoolean },
  gardenArea: { path: 'outdoor.gardenAreaM2', transform: toNumber },
  orientation: { path: 'outdoor.orientation', transform: toString },
  // Energy
  energyClass: { path: 'energy.efficiencyClass', transform: toString },
  energyConsumption: { path: 'energy.consumptionKwhPerM2A', transform: toNumber },
  energyDemand: { path: 'energy.demandKwhPerM2A', transform: toNumber },
  heatingType: { path: 'energy.heatingType', transform: toString },
  certificateType: { path: 'energy.certificateType', transform: toString },
  certificateDate: { path: 'energy.certificateDate', transform: toString },
  certificateValidUntil: { path: 'energy.certificateValidUntil', transform: toString },
  primaryEnergySource: { path: 'energy.primaryEnergySource', transform: toString },
  hotWaterIncluded: { path: 'energy.hotWaterIncluded', transform: toBoolean },
  // Financial
  askingPrice: { path: 'financial.askingPriceEur', transform: toNumber },
  pricePerM2: { path: 'financial.pricePerM2Eur', transform: toNumber },
  commissionRate: { path: 'financial.commission.ratePercent', transform: toNumber },
  commissionPayer: { path: 'financial.commission.payer', transform: toString },
  // Rental
  isRented: { path: 'rental.isRented', transform: toBoolean },
  monthlyRent: { path: 'rental.monthlyRentEur', transform: toNumber },
  annualRent: { path: 'rental.annualRentEur', transform: toNumber },
  additionalCosts: { path: 'rental.additionalCostsEur', transform: toNumber },
  deposit: { path: 'rental.depositEur', transform: toNumber },
  furnished: { path: 'rental.furnished', transform: toBoolean },
  availableFrom: { path: 'rental.availableFrom', transform: toString },
  // Investment
  grossYieldTarget: { path: 'investment.grossYieldTargetPercent', transform: toNumber },
  grossYieldActual: { path: 'investment.grossYieldActualPercent', transform: toNumber },
  // Legal
  usufruct: { path: 'legal.usufruct', transform: toBoolean },
  leasehold: { path: 'legal.leasehold', transform: toBoolean },
  foreclosure: { path: 'legal.foreclosure', transform: toBoolean },
  heritageProtection: { path: 'legal.heritageProtection', transform: toBoolean },
  // Transaction
  transactionType: { path: 'transaction.type', transform: toString },
};

function setByPath(
  model: PropertyModel,
  segments: string[],
  value: string | number | boolean,
): PropertyModel {
  const root = { ...model } as unknown as Record<string, unknown>;
  let current = root;
  for (let index = 0; index < segments.length - 1; index += 1) {
    const key = segments[index];
    const existing = current[key];
    current[key] =
      typeof existing === 'object' && existing !== null && !Array.isArray(existing)
        ? { ...(existing as Record<string, unknown>) }
        : {};
    current = current[key] as Record<string, unknown>;
  }
  current[segments[segments.length - 1]] = value;
  return root as unknown as PropertyModel;
}

export function applyWizardFieldToModel(
  model: PropertyModel,
  field: string,
  value: string | number | boolean | null,
): PropertyModel {
  const target = WIZARD_FIELD_TARGETS[field];
  if (!target || value === null || value === undefined) return model;
  const converted = target.transform ? target.transform(value) : value;
  if (converted === null || converted === undefined || converted === '') return model;
  return setByPath(model, target.path.split('.'), converted);
}

export function applyWizardFieldsToModel(
  model: PropertyModel,
  fields: Array<{ field: string; value: string | number | boolean | null }>,
): PropertyModel {
  let next = model;
  for (const field of fields) {
    next = applyWizardFieldToModel(next, field.field, field.value);
  }
  return next;
}
