import type { PropertyModel, ListingModel } from '../domain-model.js';
import type { MarketingContentStructured } from './schema.js';

/**
 * The marketing-content layer turns verified property facts and user-provided
 * information into professional, editable German Exposé copy. It never touches
 * the Property model: the AI receives only the whitelist payload built from
 * `buildMarketingContentInput` (see prompt.ts) and persists a separate
 * MarketingContent record.
 *
 * Every field keeps a provenance (`source`) so user edits are never silently
 * overwritten by ordinary page loads or property changes. Only an explicit
 * "Regenerate" action may replace AI-generated values — and even then
 * field-by-field user edits are preserved (see service.ts).
 */

/** One editable marketing field with its provenance. */
export interface MarketingTextField {
  value: string;
  source: 'ai' | 'user';
}

/** A highlight list with the same provenance as the text fields. */
export interface MarketingTextListField {
  value: string[];
  source: 'ai' | 'user';
}

/**
 * Persisted marketing content. `locationDescription` is null when the input
 * contains no meaningful location facts — the model must not fill it with
 * generic statements.
 */
export interface MarketingContentRecord {
  title: MarketingTextField;
  subtitle: MarketingTextField;
  highlights: MarketingTextListField;
  propertyDescription: MarketingTextField;
  equipmentDescription: MarketingTextField;
  locationDescription: MarketingTextField | null;
}

/** User-provided "Ihre Angaben" used as marketing context, never as facts. */
export interface MarketingUserInformation {
  sellerDescription?: string;
  specialNotes?: string;
  sellerNotes?: string;
  additionalInformation?: string;
  targetAudience?: string;
}

/**
 * Curated factual input for the marketing model. Only values that are already
 * reviewed and persisted on the Property model are included — never raw OCR or
 * raw Document AI responses.
 */
export interface MarketingContentInput {
  property: {
    propertyType?: string;
    propertySubtype?: string;
    usageType?: string;
    address: {
      district?: string;
      city?: string;
      postalCode?: string;
      state?: string;
      country?: string;
    };
    livingAreaM2?: number;
    usableAreaM2?: number;
    plotAreaM2?: number;
    totalRooms?: number;
    bedrooms?: number;
    bathrooms?: number;
    guestToilets?: number;
    yearBuilt?: number;
    buildingStatus?: 'new' | 'existing';
    condition?: string;
    floors?: number;
    basement?: boolean;
    attic?: boolean;
    renovationStatus?: string;
    lastModernizationYear?: number;
    fittedKitchen?: boolean;
    shower?: boolean;
    bathtub?: boolean;
    guestToilet?: boolean;
    heatingType?: string;
    heatingEnergySource?: string;
    parkingSpaces?: number;
    garage?: boolean;
    carport?: boolean;
    balcony?: boolean;
    terrace?: boolean;
    garden?: boolean;
    gardenAreaM2?: number;
    orientation?: string;
    efficiencyClass?: string;
    energyDemandKwhPerM2A?: number;
    energyConsumptionKwhPerM2A?: number;
    primaryEnergySource?: string;
    askingPriceEur?: number;
    rentPriceEur?: number;
    /** Rental security (Kaution) in EUR, only when explicitly stated. */
    depositEur?: number;
  };
  listing: {
    transactionType: string;
    availableFrom?: string;
  };
  location: {
    district?: string;
    publicTransport?: string[];
    schools?: string[];
    kindergartens?: string[];
    shopping?: string[];
    medical?: string[];
    recreation?: string[];
    description?: string;
  };
  userInformation: MarketingUserInformation;
}

export interface MarketingContentProvider {
  generateContent(input: MarketingContentInput): Promise<MarketingContentStructured>;
}

/** Builds the marketing input from the reviewed domain model and user info. */
export function marketingContentInputOf(
  propertyModel: PropertyModel,
  listingModel: ListingModel,
  userInformation: MarketingUserInformation,
): MarketingContentInput {
  const property = propertyModel;
  const areas = property.areas;
  const rooms = property.rooms;
  const building = property.building;
  const features = property.features;
  const outdoor = property.outdoor;
  const energy = property.energy;
  const financial = property.financial;
  const rental = property.rental;
  const location = property.location ?? {};

  return {
    property: {
      propertyType: property.classification.propertyType,
      propertySubtype: property.classification.propertySubtype,
      usageType: property.classification.usageType,
      address: {
        district: property.address.district ?? undefined,
        city: property.address.city ?? undefined,
        postalCode: property.address.postalCode ?? undefined,
        state: property.address.state ?? undefined,
        country: property.address.country ?? undefined,
      },
      livingAreaM2: areas.livingAreaM2,
      usableAreaM2: areas.usableAreaM2,
      plotAreaM2: areas.plotAreaM2,
      totalRooms: rooms.total,
      bedrooms: rooms.bedrooms,
      bathrooms: rooms.bathrooms,
      guestToilets: rooms.guestToilets,
      yearBuilt: building.yearBuilt,
      buildingStatus: building.status,
      condition: building.condition,
      floors: building.floors,
      basement: building.basement,
      attic: building.attic,
      renovationStatus: building.renovationStatus,
      lastModernizationYear: building.lastModernizationYear,
      fittedKitchen: features.kitchen?.fitted,
      shower: features.bathroom?.shower,
      bathtub: features.bathroom?.bathtub,
      guestToilet: features.guestToilet,
      heatingType: features.heating?.type,
      heatingEnergySource: features.heating?.energySource,
      parkingSpaces: features.parking?.parkingSpaces,
      garage: features.parking?.garage,
      carport: features.parking?.carport,
      balcony: outdoor.balcony,
      terrace: outdoor.terrace,
      garden: outdoor.garden,
      gardenAreaM2: outdoor.gardenAreaM2,
      orientation: outdoor.orientation,
      efficiencyClass: energy?.efficiencyClass,
      energyDemandKwhPerM2A: energy?.demandKwhPerM2A,
      energyConsumptionKwhPerM2A: energy?.consumptionKwhPerM2A,
      primaryEnergySource: energy?.primaryEnergySource,
      askingPriceEur: financial.askingPriceEur,
      rentPriceEur: rental?.monthlyRentEur,
      depositEur: rental?.depositEur,
    },
    listing: {
      transactionType: listingModel.transactionType,
      availableFrom: listingModel.availableFrom,
    },
    location: {
      district: location.district,
      publicTransport: location.publicTransport,
      schools: location.schools,
      kindergartens: location.kindergartens,
      shopping: location.shopping,
      medical: location.medical,
      recreation: location.recreation,
      description: location.description,
    },
    userInformation,
  };
}
