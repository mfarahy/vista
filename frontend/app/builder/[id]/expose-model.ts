import type { MarketingContent, Property, PropertyImage } from '../../create/[id]/types';
import {
  ENERGY_CERTIFICATE_TYPES,
  ENERGY_SOURCES,
  FEATURE_OPTIONS,
  PROPERTY_TYPES,
  conditionLabel,
  subtypeLabel,
} from '../../create/[id]/types';

/**
 * Expose configuration model for the Exposé Builder (Phase 5A).
 *
 * The configuration only references Property data (image ids) and carries
 * lightweight content overrides. The Builder never mutates the Property model
 * or the MarketingContent record; at render time the effective content is
 * "Expose override, fallback to MarketingContent".
 */

export const EXPOSE_SECTION_TYPES = [
  'cover',
  'facts',
  'highlights',
  'property',
  'equipment',
  'location',
  'energy',
  'gallery',
  'floorplans',
  'documents',
  'contact',
] as const;

export type ExposeSectionType = (typeof EXPOSE_SECTION_TYPES)[number];

export type ExposeSection = {
  id: string;
  type: ExposeSectionType;
  visible: boolean;
};

export type ExposeContentOverrides = {
  title?: string;
  subtitle?: string;
  highlights?: string[];
  propertyDescription?: string;
  equipmentDescription?: string;
  locationDescription?: string;
};

export type ExposeConfiguration = {
  template: 'modern';
  sections: ExposeSection[];
  selectedCoverImageId?: string;
  galleryImageIds?: string[];
  contentOverrides?: ExposeContentOverrides;
};

export const SECTION_LABELS: Record<ExposeSectionType, string> = {
  cover: 'Titelseite',
  highlights: 'Highlights',
  property: 'Objekt',
  equipment: 'Ausstattung',
  location: 'Lage',
  facts: 'Fakten',
  energy: 'Energie',
  gallery: 'Galerie',
  floorplans: 'Grundrisse',
  documents: 'Unterlagen',
  contact: 'Kontakt',
};

export const SECTION_DESCRIPTIONS: Record<ExposeSectionType, string> = {
  cover: 'Titelfoto, Titel und Untertitel',
  highlights: 'Kurze Stärken in Stichpunkten',
  property: 'Wesentliche Objektdaten',
  equipment: 'Ausstattungsmerkmale und Beschreibung',
  location: 'Lagebeschreibung und Adresse',
  facts: 'Kompakte Faktenübersicht',
  energy: 'Energieausweis-Daten',
  gallery: 'Ausgewählte Objektfotos',
  floorplans: 'Grundriss-Pläne',
  documents: 'Präsentationsunterlagen',
  contact: 'Ansprechpartner',
};

export function defaultExposeSections(): ExposeSection[] {
  return EXPOSE_SECTION_TYPES.map((type) => ({ id: type, type, visible: true }));
}

export function defaultExposeConfiguration(): ExposeConfiguration {
  return { template: 'modern', sections: defaultExposeSections() };
}

/** Sections that actually render in the preview, in persisted order. */
export function visibleSections(configuration: ExposeConfiguration): ExposeSection[] {
  return configuration.sections.filter((section) => section.visible);
}

/**
 * Lightweight runtime guard for configurations loaded from the API. The
 * backend validates with Zod; this check protects the client against
 * unexpected shapes without duplicating the full schema.
 */
export function isExposeConfiguration(value: unknown): value is ExposeConfiguration {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<ExposeConfiguration>;
  if (candidate.template !== 'modern') return false;
  if (!Array.isArray(candidate.sections)) return false;
  return candidate.sections.every(
    (section) =>
      section &&
      typeof section === 'object' &&
      typeof section.id === 'string' &&
      typeof section.visible === 'boolean' &&
      EXPOSE_SECTION_TYPES.includes(section.type),
  );
}

export type EffectiveMarketingContent = {
  title: string;
  subtitle: string;
  highlights: string[];
  propertyDescription: string;
  equipmentDescription: string;
  locationDescription: string;
};

/**
 * Resolves the rendered content: an Expose override wins, otherwise the
 * MarketingContent value is used. Empty-string overrides are respected as
 * explicit user choices ("clear this field").
 */
export function effectiveMarketingContent(
  marketing: MarketingContent | null | undefined,
  overrides?: ExposeContentOverrides,
): EffectiveMarketingContent {
  const base: EffectiveMarketingContent = {
    title: marketing?.title.value ?? '',
    subtitle: marketing?.subtitle.value ?? '',
    highlights: marketing?.highlights.value ?? [],
    propertyDescription: marketing?.propertyDescription.value ?? '',
    equipmentDescription: marketing?.equipmentDescription.value ?? '',
    locationDescription: marketing?.locationDescription?.value ?? '',
  };
  return {
    title: overrides?.title ?? base.title,
    subtitle: overrides?.subtitle ?? base.subtitle,
    highlights: overrides?.highlights ?? base.highlights,
    propertyDescription: overrides?.propertyDescription ?? base.propertyDescription,
    equipmentDescription: overrides?.equipmentDescription ?? base.equipmentDescription,
    locationDescription: overrides?.locationDescription ?? base.locationDescription,
  };
}

export type ExposeFact = { label: string; value: string };

export type ExposePriceFacts = {
  primary: ExposeFact;
  secondary: ExposeFact[];
};

const formatNumber = (value?: number | null) =>
  value == null
    ? ''
    : new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 }).format(value);

export function formatMoney(value?: number | null) {
  return value == null
    ? ''
    : new Intl.NumberFormat('de-DE', {
        style: 'currency',
        currency: 'EUR',
        maximumFractionDigits: 0,
      }).format(value);
}

const area = (value?: number | null) =>
  value == null ? '' : `${formatNumber(value)} m²`;

/** Years are rendered without thousands separators (Baujahr "1987"). */
const year = (value?: number | null) => (value == null ? '' : String(value));

export function propertyTypeLabel(property: Property): string {
  return (
    PROPERTY_TYPES.find(([key]) => key === property.propertyType)?.[1] ??
    property.propertyType
  );
}

export function subtypeOrTypeLabel(property: Property): string {
  const subtype = property.exposeData?.basicInformation.propertySubtype;
  return subtype
    ? subtypeLabel(property.propertyType, subtype)
    : propertyTypeLabel(property);
}

/**
 * Factual Property section ("Objekt"). Read-only values — the Builder must
 * never edit them. Only values that actually exist are rendered.
 */
export function propertyFacts(property: Property): ExposeFact[] {
  const details = property.exposeData?.propertyDetails;
  const facts: ExposeFact[] = [];
  const living = property.livingArea ?? details?.livingArea;
  const usable = details?.usableArea;
  const plot = property.plotArea ?? details?.plotArea;
  const rooms = property.rooms ?? details?.rooms;
  const bedrooms = property.bedrooms;
  const bathrooms = property.bathrooms ?? details?.bathrooms;
  const yearBuilt = property.constructionYear ?? details?.yearBuilt;
  const condition = conditionLabel(property.condition);
  if (living != null) facts.push({ label: 'Wohnfläche', value: area(living) });
  if (usable != null) facts.push({ label: 'Nutzfläche', value: area(usable) });
  if (plot != null) facts.push({ label: 'Grundstück', value: area(plot) });
  if (rooms != null) facts.push({ label: 'Zimmer', value: formatNumber(rooms) });
  if (bedrooms != null) facts.push({ label: 'Schlafzimmer', value: formatNumber(bedrooms) });
  if (bathrooms != null) facts.push({ label: 'Bäder', value: formatNumber(bathrooms) });
  if (yearBuilt != null) facts.push({ label: 'Baujahr', value: year(yearBuilt) });
  if (condition) facts.push({ label: 'Zustand', value: condition });
  return facts;
}

/** Compact facts summary ("Fakten") — a concise subset, not the full wizard. */
export function summaryFacts(property: Property): ExposeFact[] {
  const details = property.exposeData?.propertyDetails;
  const pricing = property.exposeData?.pricing;
  const facts: ExposeFact[] = [];
  const living = property.livingArea ?? details?.livingArea;
  const plot = property.plotArea ?? details?.plotArea;
  const rooms = property.rooms ?? details?.rooms;
  const yearBuilt = property.constructionYear ?? details?.yearBuilt;
  const sale = property.transactionType === 'sale';
  facts.push({ label: 'Objektart', value: subtypeOrTypeLabel(property) });
  if (living != null) facts.push({ label: 'Wohnfläche', value: area(living) });
  if (plot != null) facts.push({ label: 'Grundstück', value: area(plot) });
  if (rooms != null) facts.push({ label: 'Zimmer', value: formatNumber(rooms) });
  if (yearBuilt != null) facts.push({ label: 'Baujahr', value: year(yearBuilt) });
  if (sale) {
    const purchasePrice = property.askingPrice ?? pricing?.purchasePrice;
    if (purchasePrice != null)
      facts.push({ label: 'Kaufpreis', value: formatMoney(purchasePrice) });
  } else {
    const rent = property.coldRent ?? pricing?.rentPrice;
    if (rent != null) facts.push({ label: 'Kaltmiete', value: formatMoney(rent) });
  }
  return facts;
}

/**
 * Price block for the cover, driven by the persisted transaction type. Sale
 * properties show the asking price with the persisted commission; rentals
 * show cold rent plus Nebenkosten and Kaution when present. Only persisted
 * values are used — nothing is derived.
 */
export function priceFacts(property: Property): ExposePriceFacts | null {
  const pricing = property.exposeData?.pricing;
  if (property.transactionType === 'rent') {
    const rent = property.coldRent ?? pricing?.rentPrice;
    if (rent == null) return null;
    const secondary: ExposeFact[] = [];
    const additionalCosts = property.additionalCosts ?? pricing?.additionalCosts;
    if (additionalCosts != null)
      secondary.push({ label: 'Nebenkosten', value: formatMoney(additionalCosts) });
    if (property.deposit != null)
      secondary.push({ label: 'Kaution', value: formatMoney(property.deposit) });
    return { primary: { label: 'Kaltmiete', value: formatMoney(rent) }, secondary };
  }
  const purchasePrice = property.askingPrice ?? pricing?.purchasePrice;
  if (purchasePrice == null) return null;
  const secondary: ExposeFact[] = [];
  const commission = pricing?.buyerCommission || property.commission;
  if (commission) secondary.push({ label: 'Provision', value: commission });
  return { primary: { label: 'Kaufpreis', value: formatMoney(purchasePrice) }, secondary };
}

/** Short fact row on the cover: living area, rooms, year built. */
export function coverFacts(property: Property): ExposeFact[] {
  const details = property.exposeData?.propertyDetails;
  const facts: ExposeFact[] = [];
  const living = property.livingArea ?? details?.livingArea;
  const rooms = property.rooms ?? details?.rooms;
  const yearBuilt = property.constructionYear ?? details?.yearBuilt;
  if (living != null) facts.push({ label: 'Wohnfläche', value: area(living) });
  if (rooms != null) facts.push({ label: 'Zimmer', value: formatNumber(rooms) });
  if (yearBuilt != null) facts.push({ label: 'Baujahr', value: year(yearBuilt) });
  return facts;
}

/** Energy section — rendered only when energy information exists. */
export function energyFacts(property: Property): ExposeFact[] {
  const energy = property.exposeData?.energy;
  if (!energy) return [];
  const facts: ExposeFact[] = [];
  if (energy.certificateType) {
    const label = ENERGY_CERTIFICATE_TYPES.find(
      ([key]) => key === energy.certificateType,
    )?.[1];
    if (label) facts.push({ label: 'Energieausweis', value: label });
  }
  if (energy.finalEnergyDemand != null)
    facts.push({
      label: 'Endenergiebedarf',
      value: `${formatNumber(energy.finalEnergyDemand)} kWh/(m²a)`,
    });
  if (energy.finalEnergyConsumption != null)
    facts.push({
      label: 'Endenergieverbrauch',
      value: `${formatNumber(energy.finalEnergyConsumption)} kWh/(m²a)`,
    });
  if (energy.efficiencyClass)
    facts.push({ label: 'Effizienzklasse', value: energy.efficiencyClass });
  if (energy.primaryEnergySource) {
    const label = ENERGY_SOURCES.find(
      ([key]) => key === energy.primaryEnergySource,
    )?.[1];
    if (label) facts.push({ label: 'Energieträger', value: label });
  }
  if (energy.heatingType)
    facts.push({ label: 'Heizungsart', value: energy.heatingType });
  if (energy.certificateDate)
    facts.push({ label: 'Ausstellungsdatum', value: energy.certificateDate });
  if (energy.certificateValidUntil)
    facts.push({ label: 'Gültig bis', value: energy.certificateValidUntil });
  return facts;
}

/**
 * Equipment presented in the Exposé. Prefers the structured equipment items
 * of the property data (name only, descriptions stay in the narrative);
 * falls back to the wizard's feature labels and free-form additions. Only
 * values that exist are returned.
 */
export function structuredEquipment(property: Property): string[] {
  const structured = property.exposeData?.equipment ?? [];
  const items: string[] = [];
  for (const item of structured) {
    const name = item.name.trim();
    if (name) items.push(name);
  }
  if (items.length) {
    const freeForm = property.additionalFeatures?.trim();
    if (freeForm) items.push(freeForm);
    return items;
  }
  return equipmentFeatures(property);
}

/** Structured equipment features with German labels, plus free-form additions. */
export function equipmentFeatures(property: Property): string[] {
  const features: string[] = [];
  for (const key of property.selectedFeatures) {
    const label = FEATURE_OPTIONS.find(([optionKey]) => optionKey === key)?.[1];
    if (label) features.push(label);
  }
  if (property.additionalFeatures) features.push(property.additionalFeatures);
  return features;
}

/** Photos usable for cover/gallery (excludes plans and documents). */
export function photoImages(images: PropertyImage[]): PropertyImage[] {
  return images.filter(
    (image) =>
      image.category === 'exterior' ||
      image.category === 'interior' ||
      !image.category,
  );
}

export function defaultGalleryImageIds(property: Property): string[] {
  return photoImages(property.images).map((image) => image.id);
}

export function defaultCoverImageId(property: Property): string | undefined {
  const photos = photoImages(property.images);
  return photos.find((image) => image.isCover)?.id ?? photos[0]?.id;
}

/** Resolves the configured gallery references; falls back to all photos. */
export function galleryImagesOf(
  property: Property,
  configuration: ExposeConfiguration,
): PropertyImage[] {
  const photos = photoImages(property.images);
  const ids = configuration.galleryImageIds;
  if (!ids?.length) return photos;
  const byId = new Map(photos.map((image) => [image.id, image]));
  return ids
    .map((id) => byId.get(id))
    .filter((image): image is PropertyImage => Boolean(image));
}

export function coverImageOf(
  property: Property,
  configuration: ExposeConfiguration,
): PropertyImage | undefined {
  const photos = photoImages(property.images);
  if (configuration.selectedCoverImageId) {
    const selected = photos.find(
      (image) => image.id === configuration.selectedCoverImageId,
    );
    if (selected) return selected;
  }
  const fallbackId = defaultCoverImageId(property);
  return fallbackId ? photos.find((image) => image.id === fallbackId) : undefined;
}

/** Location line shown on the cover and the location section header. */
export function locationLine(property: Property): string {
  const address =
    property.exposeData?.location.address ??
    property.exposeData?.basicInformation.address;
  return [address?.district, address?.city].filter(Boolean).join(' · ');
}

export function fullAddressLines(property: Property): string[] {
  const address =
    property.exposeData?.location.address ??
    property.exposeData?.basicInformation.address;
  if (!address) return [];
  const street = [address.street, address.houseNumber].filter(Boolean).join(' ');
  const city = [address.postalCode, address.city].filter(Boolean).join(' ');
  return [street, city, address.district ?? ''].filter(Boolean);
}

/** Floorplan images that can be rendered directly in the template. */
export function floorplanImages(images: PropertyImage[]): PropertyImage[] {
  return images.filter((image) => image.category === 'floor_plan');
}