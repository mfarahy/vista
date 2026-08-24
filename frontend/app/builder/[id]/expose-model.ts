import type {
  DocumentRecord,
  FloorPlan3DRecord,
  MarketingContent,
  NearbyFacility,
  Property,
  PropertyImage,
  TravelMode,
} from '../../create/[id]/types';
import type { BrokerProfile } from '../../create/[id]/types';
import {
  ENERGY_CERTIFICATE_TYPES,
  ENERGY_SOURCES,
  FEATURE_OPTIONS,
  PROPERTY_SUBTYPES,
  PROPERTY_TYPES,
  conditionLabel,
} from '../../create/[id]/types';
import { translations, type Locale, type TranslationKey, type Translator } from '@/lib/i18n/core';

/**
 * Expose configuration model for the Exposé Builder (Phase 5A, extended in
 * Phase 11 with the template registry and Exposé-local branding).
 *
 * The configuration only references Property data (image ids) and carries
 * lightweight content overrides plus optional branding. The Builder never
 * mutates the Property model or the MarketingContent record; at render time
 * the effective content is "Expose override, fallback to MarketingContent"
 * and the effective branding is "Expose branding, fallback to Agent profile".
 */

/** Templates the Builder can render. `modern` remains the default. */
export const EXPOSE_TEMPLATE_IDS = ['modern', 'classic', 'elegant'] as const;

export type ExposeTemplateId = (typeof EXPOSE_TEMPLATE_IDS)[number];

/** Safe fallback for unknown or missing template values. */
export function normalizeTemplateId(value: unknown): ExposeTemplateId {
  return EXPOSE_TEMPLATE_IDS.includes(value as ExposeTemplateId)
    ? (value as ExposeTemplateId)
    : 'modern';
}

/**
 * Exposé-local branding. All fields are optional; missing values fall back to
 * the Agent profile (and finally the system branding) at render time. The
 * Agent profile is never modified by the Builder.
 */
export type ExposeBranding = {
  companyName?: string;
  logoUrl?: string;
  phone?: string;
  email?: string;
  website?: string;
};

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
  'broker',
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
  template: ExposeTemplateId;
  sections: ExposeSection[];
  selectedCoverImageId?: string;
  galleryImageIds?: string[];
  contentOverrides?: ExposeContentOverrides;
  branding?: ExposeBranding;
};

export const SECTION_LABELS: Record<ExposeSectionType, TranslationKey> = {
  cover: 'expose.sectionLabels.cover',
  highlights: 'expose.sectionLabels.highlights',
  property: 'expose.sectionLabels.property',
  equipment: 'expose.sectionLabels.equipment',
  location: 'expose.sectionLabels.location',
  facts: 'expose.sectionLabels.facts',
  energy: 'expose.sectionLabels.energy',
  gallery: 'expose.sectionLabels.gallery',
  floorplans: 'expose.sectionLabels.floorplans',
  documents: 'expose.sectionLabels.documents',
  contact: 'expose.sectionLabels.contact',
  broker: 'expose.sectionLabels.broker',
};

export const SECTION_DESCRIPTIONS: Record<ExposeSectionType, TranslationKey> = {
  cover: 'expose.sectionDescriptions.cover',
  highlights: 'expose.sectionDescriptions.highlights',
  property: 'expose.sectionDescriptions.property',
  equipment: 'expose.sectionDescriptions.equipment',
  location: 'expose.sectionDescriptions.location',
  facts: 'expose.sectionDescriptions.facts',
  energy: 'expose.sectionDescriptions.energy',
  gallery: 'expose.sectionDescriptions.gallery',
  floorplans: 'expose.sectionDescriptions.floorplans',
  documents: 'expose.sectionDescriptions.documents',
  contact: 'expose.sectionDescriptions.contact',
  broker: 'expose.sectionDescriptions.broker',
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
 * unexpected shapes without duplicating the full schema. Unknown or missing
 * template values fall back to "modern" (see normalizeTemplateId).
 */
export function isExposeConfiguration(value: unknown): value is ExposeConfiguration {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<ExposeConfiguration>;
  if (
    candidate.template != null &&
    !EXPOSE_TEMPLATE_IDS.includes(candidate.template as ExposeTemplateId)
  ) {
    return false;
  }
  if (
    candidate.branding != null &&
    (typeof candidate.branding !== 'object' || Array.isArray(candidate.branding))
  ) {
    return false;
  }
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

export type ExposeFact = { label: TranslationKey | string; value: string };

/** Media available to a template: property images and library documents. */
export type ExposeMedia = {
  images: PropertyImage[];
  documents: DocumentRecord[];
  /**
   * Static rendering (PDF print route): the interactive 3D floor plan viewer
   * is skipped so the PDF keeps the reliable 2D plan images.
   */
  staticRender?: boolean;
};

export type ExposePriceFacts = {
  primary: ExposeFact;
  secondary: ExposeFact[];
};

const formatNumber = (value?: number | null, locale: Locale = 'de') =>
  value == null ? '' : new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value);

export function formatMoney(value?: number | null, locale: Locale = 'de') {
  return value == null
    ? ''
    : new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: 'EUR',
        maximumFractionDigits: 0,
      }).format(value);
}

const area = (value?: number | null, locale: Locale = 'de') =>
  value == null
    ? ''
    : `${formatNumber(value, locale)} ${translations[locale].t('expose.units.sqm')}`;

/** Years are rendered without thousands separators (Baujahr "1987"). */
const year = (value?: number | null) => (value == null ? '' : String(value));

/** Translation key of the property type label. */
export function propertyTypeLabel(property: Property): TranslationKey | string {
  return (
    PROPERTY_TYPES.find(([key]) => key === property.propertyType)?.[1] ?? property.propertyType
  );
}

/** Translation key of the subtype (when it belongs to the chosen type), else the type key. */
export function subtypeOrTypeLabel(property: Property): TranslationKey | string {
  const subtype = property.exposeData?.basicInformation.propertySubtype;
  if (!subtype) return propertyTypeLabel(property);
  // Only render the subtype when it actually belongs to the chosen property
  // type. A leftover house subtype on an apartment (or vice versa) would
  // otherwise leak raw identifiers into the Exposé. Legacy German values are
  // matched against the German translation of the stored key.
  const validSubtypes = PROPERTY_SUBTYPES[property.propertyType] ?? [];
  const known = validSubtypes.some(
    ([key]) => key === subtype || translations.de.t(key) === subtype,
  );
  return known
    ? (validSubtypes.find(([key]) => key === subtype || translations.de.t(key) === subtype)?.[1] ??
        propertyTypeLabel(property))
    : propertyTypeLabel(property);
}

/**
 * Factual Property section ("Objekt"). Read-only values — the Builder must
 * never edit them. Only values that actually exist are rendered.
 */
export function propertyFacts(property: Property, tr: Translator): ExposeFact[] {
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
  const locale = tr.locale ?? 'de';
  if (living != null) facts.push({ label: 'expose.facts.livingArea', value: area(living, locale) });
  if (usable != null) facts.push({ label: 'expose.facts.usableArea', value: area(usable, locale) });
  if (plot != null) facts.push({ label: 'expose.facts.plot', value: area(plot, locale) });
  if (rooms != null)
    facts.push({ label: 'expose.facts.rooms', value: formatNumber(rooms, locale) });
  if (bedrooms != null)
    facts.push({ label: 'expose.facts.bedrooms', value: formatNumber(bedrooms, locale) });
  if (bathrooms != null)
    facts.push({ label: 'expose.facts.bathrooms', value: formatNumber(bathrooms, locale) });
  if (yearBuilt != null) facts.push({ label: 'expose.facts.yearBuilt', value: year(yearBuilt) });
  if (condition) facts.push({ label: 'expose.facts.condition', value: tr.t(condition) });
  facts.push(...wegFacts(property, tr));
  return facts;
}

/**
 * WEG facts for a condominium (Eigentumswohnung). Only explicitly persisted
 * values are rendered — nothing is derived. Falls back to the legacy
 * `hausgeld` property field when the structured WEG value is absent.
 */
export function wegFacts(property: Property, tr: Translator): ExposeFact[] {
  const weg = property.exposeData?.weg;
  const facts: ExposeFact[] = [];
  const hausgeld = weg?.hausgeldEur ?? property.hausgeld;
  if (hausgeld != null)
    facts.push({ label: 'expose.facts.hausgeld', value: formatMoney(hausgeld, tr.locale) });
  if (weg?.maintenanceReserveEur != null)
    facts.push({
      label: 'expose.facts.maintenanceReserve',
      value: formatMoney(weg.maintenanceReserveEur, tr.locale),
    });
  if (weg?.coOwnershipShare)
    facts.push({ label: 'expose.facts.coOwnershipShare', value: weg.coOwnershipShare });
  return facts;
}

/** Compact facts summary ("Fakten") — a concise subset, not the full wizard. */
export function summaryFacts(property: Property, tr: Translator): ExposeFact[] {
  const details = property.exposeData?.propertyDetails;
  const pricing = property.exposeData?.pricing;
  const facts: ExposeFact[] = [];
  const living = property.livingArea ?? details?.livingArea;
  const plot = property.plotArea ?? details?.plotArea;
  const rooms = property.rooms ?? details?.rooms;
  const yearBuilt = property.constructionYear ?? details?.yearBuilt;
  const sale = property.transactionType === 'sale';
  const locale = tr.locale ?? 'de';
  facts.push({ label: 'expose.facts.propertyType', value: tr.t(subtypeOrTypeLabel(property)) });
  if (living != null) facts.push({ label: 'expose.facts.livingArea', value: area(living, locale) });
  if (plot != null) facts.push({ label: 'expose.facts.plot', value: area(plot, locale) });
  if (rooms != null)
    facts.push({ label: 'expose.facts.rooms', value: formatNumber(rooms, locale) });
  if (yearBuilt != null) facts.push({ label: 'expose.facts.yearBuilt', value: year(yearBuilt) });
  if (sale) {
    const purchasePrice = property.askingPrice ?? pricing?.purchasePrice;
    if (purchasePrice != null)
      facts.push({
        label: 'expose.facts.purchasePrice',
        value: formatMoney(purchasePrice, locale),
      });
  } else {
    const rent = property.coldRent ?? pricing?.rentPrice;
    if (rent != null)
      facts.push({ label: 'expose.facts.coldRent', value: formatMoney(rent, locale) });
  }
  return facts;
}

/**
 * Price block for the cover, driven by the persisted transaction type. Sale
 * properties show the asking price with the persisted commission; rentals
 * show cold rent plus Nebenkosten and Kaution when present. Only persisted
 * values are used — nothing is derived.
 */
export function priceFacts(property: Property, tr: Translator): ExposePriceFacts | null {
  const pricing = property.exposeData?.pricing;
  const locale = tr.locale ?? 'de';
  if (property.transactionType === 'rent') {
    const rent = property.coldRent ?? pricing?.rentPrice;
    if (rent == null) return null;
    const secondary: ExposeFact[] = [];
    const additionalCosts = property.additionalCosts ?? pricing?.additionalCosts;
    if (additionalCosts != null)
      secondary.push({
        label: 'expose.facts.additionalCosts',
        value: formatMoney(additionalCosts, locale),
      });
    if (property.deposit != null)
      secondary.push({
        label: 'expose.facts.deposit',
        value: formatMoney(property.deposit, locale),
      });
    return {
      primary: { label: 'expose.facts.coldRent', value: formatMoney(rent, locale) },
      secondary,
    };
  }
  const purchasePrice = property.askingPrice ?? pricing?.purchasePrice;
  if (purchasePrice == null) return null;
  const secondary: ExposeFact[] = [];
  const commission = pricing?.buyerCommission || property.commission;
  if (commission) secondary.push({ label: 'expose.facts.commission', value: commission });
  return {
    primary: { label: 'expose.facts.purchasePrice', value: formatMoney(purchasePrice, locale) },
    secondary,
  };
}

/** Short fact row on the cover: living area, rooms, year built. */
export function coverFacts(property: Property, tr: Translator): ExposeFact[] {
  const details = property.exposeData?.propertyDetails;
  const facts: ExposeFact[] = [];
  const living = property.livingArea ?? details?.livingArea;
  const rooms = property.rooms ?? details?.rooms;
  const yearBuilt = property.constructionYear ?? details?.yearBuilt;
  const locale = tr.locale ?? 'de';
  if (living != null) facts.push({ label: 'expose.facts.livingArea', value: area(living, locale) });
  if (rooms != null)
    facts.push({ label: 'expose.facts.rooms', value: formatNumber(rooms, locale) });
  if (yearBuilt != null) facts.push({ label: 'expose.facts.yearBuilt', value: year(yearBuilt) });
  return facts;
}

/** Energy section — rendered only when energy information exists. */
export function energyFacts(property: Property, tr: Translator): ExposeFact[] {
  const energy = property.exposeData?.energy;
  if (!energy) return [];
  const facts: ExposeFact[] = [];
  const locale = tr.locale ?? 'de';
  if (energy.certificateType) {
    const label = ENERGY_CERTIFICATE_TYPES.find(([key]) => key === energy.certificateType)?.[1];
    if (label) facts.push({ label: 'expose.facts.energyCertificate', value: tr.t(label) });
  }
  if (energy.finalEnergyDemand != null)
    facts.push({
      label: 'expose.facts.energyDemand',
      value: `${formatNumber(energy.finalEnergyDemand, locale)} ${tr.t('expose.units.kwh')}`,
    });
  if (energy.finalEnergyConsumption != null)
    facts.push({
      label: 'expose.facts.energyConsumption',
      value: `${formatNumber(energy.finalEnergyConsumption, locale)} ${tr.t('expose.units.kwh')}`,
    });
  if (energy.efficiencyClass)
    facts.push({ label: 'expose.facts.efficiencyClass', value: energy.efficiencyClass });
  if (energy.primaryEnergySource && energy.primaryEnergySource !== 'other') {
    const label = ENERGY_SOURCES.find(([key]) => key === energy.primaryEnergySource)?.[1];
    if (label) facts.push({ label: 'expose.facts.energySource', value: tr.t(label) });
  }
  if (energy.heatingType)
    facts.push({ label: 'expose.facts.heatingType', value: energy.heatingType });
  if (energy.certificateDate)
    facts.push({
      label: 'expose.facts.certificateDate',
      value: formatDate(energy.certificateDate, locale),
    });
  if (energy.certificateValidUntil)
    facts.push({
      label: 'expose.facts.certificateValidUntil',
      value: formatDate(energy.certificateValidUntil, locale),
    });
  return facts;
}

/**
 * Formats an ISO date (YYYY-MM-DD) per locale: TT.MM.JJJJ for German,
 * MM/DD/YYYY for English.
 */
export function formatDate(value: string, locale: Locale = 'de'): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return value;
  return locale === 'de'
    ? `${match[3]}.${match[2]}.${match[1]}`
    : `${match[2]}/${match[3]}/${match[1]}`;
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
    (image) => image.category === 'exterior' || image.category === 'interior' || !image.category,
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
  return ids.map((id) => byId.get(id)).filter((image): image is PropertyImage => Boolean(image));
}

export function coverImageOf(
  property: Property,
  configuration: ExposeConfiguration,
): PropertyImage | undefined {
  const photos = photoImages(property.images);
  if (configuration.selectedCoverImageId) {
    const selected = photos.find((image) => image.id === configuration.selectedCoverImageId);
    if (selected) return selected;
  }
  const fallbackId = defaultCoverImageId(property);
  return fallbackId ? photos.find((image) => image.id === fallbackId) : undefined;
}

/** Location line shown on the cover and the location section header. */
export function locationLine(property: Property): string {
  const address =
    property.exposeData?.location.address ?? property.exposeData?.basicInformation.address;
  return [address?.district, address?.city].filter(Boolean).join(' · ');
}

/**
 * Location & Nearby Amenities presentation (Phase 13).
 *
 * The Exposé shows exactly one verified facility per display category —
 * the closest routed candidate. A facility without a verified route is never
 * presented with distances or travel times. All values come from the
 * structured LocationIntelligence payload; nothing is invented here.
 */

export type NearbyDisplayCategory =
  | 'supermarket'
  | 'kindergarten'
  | 'school'
  | 'transport'
  | 'pharmacy'
  | 'healthcare'
  | 'park'
  | 'dining';

export type NearbyIcon =
  | 'supermarket'
  | 'kindergarten'
  | 'school'
  | 'transport'
  | 'pharmacy'
  | 'healthcare'
  | 'park'
  | 'dining';

export type NearbyFacilityEntry = {
  place: NearbyFacility;
  category: NearbyDisplayCategory;
  /** Translation key of the category label, e.g. "expose.nearby.supermarket". */
  label: TranslationKey;
  icon: NearbyIcon;
  /** Routed distance in meters (from the routing provider). */
  distanceMeters: number;
  /** Routed duration in seconds (from the routing provider). */
  durationSeconds: number;
  travelMode: TravelMode;
};

/** Display categories with their candidate place categories, closest first. */
export const NEARBY_DISPLAY_CATEGORIES: Record<
  NearbyDisplayCategory,
  { label: TranslationKey; candidates: string[] }
> = {
  supermarket: { label: 'expose.nearby.supermarket', candidates: ['supermarket', 'grocery'] },
  kindergarten: { label: 'expose.nearby.kindergarten', candidates: ['kindergarten'] },
  school: { label: 'expose.nearby.school', candidates: ['school'] },
  transport: {
    label: 'expose.nearby.transport',
    candidates: ['train_station', 'subway', 'tram', 'bus_stop'],
  },
  pharmacy: { label: 'expose.nearby.pharmacy', candidates: ['pharmacy'] },
  healthcare: {
    label: 'expose.nearby.healthcare',
    candidates: ['hospital', 'doctor'],
  },
  park: { label: 'expose.nearby.park', candidates: ['park', 'playground'] },
  dining: { label: 'expose.nearby.dining', candidates: ['restaurant', 'cafe'] },
};

function routedCandidates(property: Property): NearbyFacility[] {
  const groups = property.exposeData?.location.intelligence?.facilities;
  if (!groups) return [];
  return Object.values(groups)
    .flat()
    .filter((place) => place.route != null);
}

/**
 * Selects the closest verified facility per display category, sorted by
 * routed distance. Categories without a routed result are omitted.
 */
export function nearbyFacilityEntries(property: Property): NearbyFacilityEntry[] {
  const routed = routedCandidates(property);
  const entries: NearbyFacilityEntry[] = [];
  for (const [category, spec] of Object.entries(NEARBY_DISPLAY_CATEGORIES) as Array<
    [NearbyDisplayCategory, { label: TranslationKey; candidates: string[] }]
  >) {
    const place = routed
      .filter((candidate) => spec.candidates.includes(candidate.category))
      .sort(
        (a, b) => (a.route?.distanceMeters ?? Infinity) - (b.route?.distanceMeters ?? Infinity),
      )[0];
    if (!place?.route) continue;
    entries.push({
      place,
      category,
      label: spec.label,
      icon: category,
      distanceMeters: place.route.distanceMeters,
      durationSeconds: place.route.durationSeconds,
      travelMode: place.route.travelMode,
    });
  }
  return entries.sort((a, b) => a.distanceMeters - b.distanceMeters);
}

/** Distance formatting for the nearby list ("650 m", "1,4 km" / "1.4 km"). */
export function formatNearbyDistance(meters: number, locale: Locale = 'de'): string {
  if (meters < 1000)
    return `${Math.round(meters / 10) * 10} ${translations[locale].t('expose.units.meter')}`;
  return `${(meters / 1000).toLocaleString(locale, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })} ${translations[locale].t('expose.units.km')}`;
}

/** Duration formatting for the nearby list ("8 Min." / "8 min"). */
export function formatNearbyDuration(seconds: number, locale: Locale = 'de'): string {
  return `${Math.max(1, Math.round(seconds / 60))} ${translations[locale].t('expose.units.minute')}`;
}

/** Translation key of the travel-mode label ("8 Min. zu Fuß"). */
export function travelModeLabel(mode: TravelMode): TranslationKey {
  const labels: Record<TravelMode, TranslationKey> = {
    foot: 'expose.travelMode.foot',
    bike: 'expose.travelMode.bike',
    car: 'expose.travelMode.car',
    transit: 'expose.travelMode.transit',
  };
  return labels[mode];
}

export function fullAddressLines(property: Property): string[] {
  const address =
    property.exposeData?.location.address ?? property.exposeData?.basicInformation.address;
  if (!address) return [];
  const street = [address.street, address.houseNumber].filter(Boolean).join(' ');
  const city = [address.postalCode, address.city].filter(Boolean).join(' ');
  return [street, city, address.district ?? ''].filter(Boolean);
}

/** Floorplan images that can be rendered directly in the template. */
export function floorplanImages(images: PropertyImage[]): PropertyImage[] {
  return images.filter((image) => image.category === 'floor_plan');
}

/**
 * The generated 3D floor plan record when it is usable in the Exposé: status
 * `completed` with a model. Pending or failed generation returns null, so the
 * template falls back to the 2D floor plan.
 */
export function completedFloorPlan3D(property: Property): FloorPlan3DRecord | null {
  const record = property.floorPlan3D;
  return record?.status === 'completed' && record.model ? record : null;
}

/**
 * Guards an image URL before it is used in an `<img>` src attribute. Only
 * http(s) URLs and absolute paths are accepted — anything else (javascript:,
 * data:, ...) is rejected so user-controlled branding can never inject
 * scripts or break the document.
 */
export function safeImageUrl(value?: string | null): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith('/')) return trimmed;
  return undefined;
}

/** Guards a website URL: only http(s) URLs are accepted as usable links. */
function safeWebsiteUrl(value?: string | null): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  return /^https?:\/\//i.test(trimmed) ? trimmed : undefined;
}

export type EffectiveBranding = {
  companyName: string;
  logoUrl?: string;
  phone?: string;
  email?: string;
  website?: string;
};

const nonEmpty = (value?: string | null) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
};

/**
 * Resolves the branding shown in the Exposé: an Expose configuration value
 * wins, otherwise the Broker Profile (company, logo, contact) is used, and
 * the system branding only provides the final company-name fallback. The
 * Property and Broker Profile are never modified.
 *
 * Backward compatibility: when no Broker Profile is provided (or a field is
 * empty), the legacy per-property agent data of the wizard's old "Agent /
 * Kontakt" step is used, so already-created Exposés keep their contact.
 */
export function effectiveBranding(
  property: Property,
  configuration: ExposeConfiguration,
  brokerProfile?: BrokerProfile | null,
): EffectiveBranding {
  const branding = configuration.branding ?? {};
  const profile = brokerProfile ?? legacyAgentOf(property);
  const agent = property.exposeData?.agent;
  const system = property.exposeData?.systemBranding;
  return {
    companyName:
      nonEmpty(branding.companyName) ??
      nonEmpty(profile?.company) ??
      nonEmpty(agent?.company) ??
      nonEmpty(system?.companyName) ??
      '',
    logoUrl: safeImageUrl(branding.logoUrl) ?? safeImageUrl(profile?.logo) ?? safeImageUrl(agent?.logo),
    phone: nonEmpty(branding.phone) ?? nonEmpty(profile?.phone) ?? nonEmpty(agent?.phone),
    email: nonEmpty(branding.email) ?? nonEmpty(profile?.email) ?? nonEmpty(agent?.email),
    website:
      safeWebsiteUrl(branding.website) ??
      safeWebsiteUrl(profile?.website) ??
      safeWebsiteUrl(agent?.website),
  };
}

/** Legacy per-property agent data (wizard's old "Agent/Kontakt" step). */
export function legacyAgentOf(property: Property) {
  return property.exposeData?.agent;
}

/**
 * Resolves the broker information rendered in the Exposé: the configured
 * Broker Profile wins, otherwise the legacy per-property agent data is used
 * so existing Exposés keep their contact details.
 */
export function effectiveBrokerProfile(
  property: Property,
  brokerProfile?: BrokerProfile | null,
): BrokerProfile | null {
  const hasProfileContent = (profile: BrokerProfile): boolean =>
    Boolean(nonEmpty(profile.name)) ||
    Object.values(profile).some((value) => {
      if (Array.isArray(value)) return value.length > 0;
      return Boolean(value);
    });
  if (brokerProfile && hasProfileContent(brokerProfile)) {
    return brokerProfile;
  }
  const agent = property.exposeData?.agent;
  if (agent && (nonEmpty(agent.name) || nonEmpty(agent.company))) {
    return {
      name: agent.name ?? '',
      jobTitle: null,
      company: agent.company,
      photo: agent.photo,
      logo: agent.logo,
      address: agent.address,
      website: agent.website,
      phone: agent.phone,
      mobile: null,
      email: agent.email,
      tagline: null,
      description: null,
      awards: [],
      recommendations: null,
      recommendationUrl: null,
      externalLinks: [],
      additionalImages: [],
    };
  }
  return null;
}

/** Address lines of the broker profile, e.g. ["Musterstraße 1", "10115 Berlin"]. */
export function brokerAddressLines(broker: BrokerProfile | null): string[] {
  const address = broker?.address;
  if (!address) return [];
  return [
    [address.street, address.houseNumber].filter(Boolean).join(' '),
    [address.postalCode, address.city].filter(Boolean).join(' '),
    address.district ?? '',
  ].filter(Boolean);
}

/** Contact channels that actually have values, with translated labels. */
export function brokerChannels(
  broker: BrokerProfile | null,
  tr: Translator,
): Array<{ label: string; value: string; type: 'phone' | 'mobile' | 'email' | 'website' }> {
  if (!broker) return [];
  const channels: Array<{ label: string; value: string; type: 'phone' | 'mobile' | 'email' | 'website' }> =
    [];
  if (nonEmpty(broker.phone))
    channels.push({ label: tr.t('expose.broker.phone'), value: broker.phone!, type: 'phone' });
  if (nonEmpty(broker.mobile))
    channels.push({ label: tr.t('expose.broker.mobile'), value: broker.mobile!, type: 'mobile' });
  if (nonEmpty(broker.email))
    channels.push({ label: tr.t('expose.broker.email'), value: broker.email!, type: 'email' });
  if (safeWebsiteUrl(broker.website))
    channels.push({
      label: tr.t('expose.broker.websiteLink'),
      value: safeWebsiteUrl(broker.website)!,
      type: 'website',
    });
  return channels;
}
