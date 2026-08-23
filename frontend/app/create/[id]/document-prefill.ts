import type { DocumentRecord, PropertyPayload } from './types';

/**
 * Wizard-prefill helpers. Faithful port of the backend prefill rules
 * (see expose-service/src/lib/document-understanding/prefill.ts):
 *
 *   - The AI understanding result is the single source of truth.
 *   - All candidates from all persisted documents are collected, keeping the
 *     source document (id + filename) and the AI-provided evidence attached.
 *   - Values from multiple documents coexist; conflicts are never deleted.
 *   - Only fields that are currently empty in the wizard are prefilled and a
 *     user-entered value is never overwritten.
 */

export type WizardFieldCandidate = {
  field: string;
  value: string | number | boolean | null;
  sourceDocumentId: string;
  sourceFilename: string;
  evidence: string | null;
};

/**
 * Document-derived additional information (parcel number, land-register sheet,
 * owners, encumbrances, restrictions, …). Kept separate from wizard fields so
 * the Legal step can surface them without forcing them into the main form.
 */
export type AdditionalInfoCandidate = {
  key: string;
  value: string | number | boolean | null;
  sourceDocumentId: string;
  sourceFilename: string;
  evidence: string | null;
};

/**
 * German labels for the AI-extracted wizard fields (the raw field keys are
 * internal identifiers and must never be shown to the user).
 */
export const WIZARD_FIELD_LABELS: Record<string, string> = {
  street: 'Straße',
  houseNumber: 'Hausnummer',
  postalCode: 'PLZ',
  city: 'Ort',
  district: 'Stadtteil',
  state: 'Bundesland',
  country: 'Land',
  propertyType: 'Objektart',
  propertySubtype: 'Objektunterart',
  usageType: 'Verwendungszweck',
  livingArea: 'Wohnfläche',
  usableArea: 'Nutzfläche',
  plotArea: 'Grundstücksfläche',
  rooms: 'Zimmer',
  bedrooms: 'Schlafzimmer',
  bathrooms: 'Badezimmer',
  guestToilets: 'Gäste-WCs',
  yearBuilt: 'Baujahr',
  buildingStatus: 'Objektstatus',
  condition: 'Zustand',
  numberOfFloors: 'Etagen',
  floor: 'Etage',
  basement: 'Keller',
  attic: 'Dachgeschoss',
  renovationStatus: 'Sanierungsstatus',
  lastModernizationYear: 'Letzte Modernisierung',
  parking: 'Stellplatz',
  garage: 'Garage',
  balcony: 'Balkon',
  terrace: 'Terrasse',
  garden: 'Garten',
  gardenArea: 'Gartenfläche',
  orientation: 'Ausrichtung',
  energyClass: 'Effizienzklasse',
  energyDemand: 'Endenergiebedarf',
  energyConsumption: 'Endenergieverbrauch',
  heatingType: 'Heizungsart',
  yearOfConstruction: 'Baujahr laut Ausweis',
  certificateType: 'Ausweistyp',
  certificateDate: 'Ausgestellt am',
  certificateValidUntil: 'Gültig bis',
  primaryEnergySource: 'Energieträger',
  hotWaterIncluded: 'Warmwasser enthalten',
  askingPrice: 'Kaufpreis',
  pricePerM2: 'Kaufpreis / m²',
  commissionRate: 'Provisionssatz',
  commissionPayer: 'Provisionszahler',
  isRented: 'Vermietet',
  monthlyRent: 'Kaltmiete',
  annualRent: 'Jahresmiete',
  additionalCosts: 'Nebenkosten',
  deposit: 'Kaution',
  furnished: 'Möbliert',
  availableFrom: 'Verfügbar ab',
  grossYieldTarget: 'Bruttorendite (Soll)',
  grossYieldActual: 'Bruttorendite (Ist)',
  hausgeld: 'Hausgeld',
  maintenanceReserve: 'Instandhaltungsrücklage',
  coOwnershipShare: 'Miteigentumsanteil',
  usufruct: 'Nießbrauch',
  leasehold: 'Erbbaurecht',
  foreclosure: 'Zwangsversteigerung',
  heritageProtection: 'Denkmalschutz',
  transactionType: 'Kauf / Miete',
  parcelNumber: 'Flurstück',
  plotNumber: 'Flur',
};

/** Resolves a wizard-field key to its German label, falling back to the key. */
export function wizardFieldLabel(field: string): string {
  return WIZARD_FIELD_LABELS[field] ?? field;
}

/** Formats an extracted value for display without internal jargon. */
export function formatExtractedValue(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—';
  if (value === true) return 'Ja';
  if (value === false) return 'Nein';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value))
    return `${value.slice(8, 10)}.${value.slice(5, 7)}.${value.slice(0, 4)}`;
  return String(value);
}

function isEmpty(value: unknown): boolean {
  return value === null || value === undefined || value === '';
}

/**
 * Collects every non-empty wizard field across all persisted documents. A
 * document without a completed understanding result contributes nothing.
 */
export function collectWizardFieldCandidates(records: DocumentRecord[]): WizardFieldCandidate[] {
  const candidates: WizardFieldCandidate[] = [];
  for (const record of records) {
    if (record.status !== 'completed') continue;
    const fields = record.understandingResult?.wizardFields;
    if (!fields?.length) continue;
    for (const field of fields) {
      if (isEmpty(field.value)) continue;
      candidates.push({
        field: field.field,
        value: field.value,
        sourceDocumentId: record.id,
        sourceFilename: record.filename,
        evidence: field.evidence,
      });
    }
  }
  return candidates;
}

/**
 * Groups candidates by wizard field. Every source is preserved, so conflicting
 * values remain available to the UI instead of being silently discarded.
 */
export function groupCandidatesByField(
  candidates: WizardFieldCandidate[],
): Record<string, WizardFieldCandidate[]> {
  const byField: Record<string, WizardFieldCandidate[]> = {};
  for (const candidate of candidates) {
    (byField[candidate.field] ??= []).push(candidate);
  }
  return byField;
}

/**
 * Deterministic default selection for a field:
 *   1. prefer a value that carries evidence,
 *   2. otherwise the first candidate in document order.
 * Never random.
 */
export function pickDefault(sources: WizardFieldCandidate[]): WizardFieldCandidate | undefined {
  return sources.find((source) => source.evidence) ?? sources[0];
}

/**
 * Collects every non-empty additional-information entry across all persisted
 * documents, preserving the source document and its AI-provided evidence.
 */
export function collectAdditionalInformation(records: DocumentRecord[]): AdditionalInfoCandidate[] {
  const candidates: AdditionalInfoCandidate[] = [];
  for (const record of records) {
    if (record.status !== 'completed') continue;
    const entries = record.understandingResult?.additionalInformation;
    if (!entries?.length) continue;
    for (const entry of entries) {
      if (isEmpty(entry.value)) continue;
      candidates.push({
        key: entry.key,
        value: entry.value,
        sourceDocumentId: record.id,
        sourceFilename: record.filename,
        evidence: entry.evidence,
      });
    }
  }
  return candidates;
}

/**
 * Groups additional-information entries by key so the Legal step can show every
 * document that contributed a value, including conflicting ones.
 */
export function groupAdditionalByKey(
  candidates: AdditionalInfoCandidate[],
): Record<string, AdditionalInfoCandidate[]> {
  const byKey: Record<string, AdditionalInfoCandidate[]> = {};
  for (const candidate of candidates) {
    (byKey[candidate.key] ??= []).push(candidate);
  }
  return byKey;
}

export type WizardPrefill = {
  /** Every candidate per field, including conflicts. */
  sourcesByField: Record<string, WizardFieldCandidate[]>;
  /** Defaults for fields that are currently empty in the wizard. */
  defaults: Record<string, string | number | boolean>;
};

/**
 * Computes wizard defaults from persisted documents. A field is only prefilled
 * when it is currently empty in `currentValues`; existing user values win.
 */
export function computeWizardPrefills(
  records: DocumentRecord[],
  currentValues: Record<string, unknown>,
): WizardPrefill {
  const sourcesByField = groupCandidatesByField(collectWizardFieldCandidates(records));
  const defaults: Record<string, string | number | boolean> = {};
  for (const [field, sources] of Object.entries(sourcesByField)) {
    if (!isEmpty(currentValues[field])) continue;
    const chosen = pickDefault(sources);
    if (chosen) defaults[field] = chosen.value as string | number | boolean;
  }
  return { sourcesByField, defaults };
}

/**
 * The current wizard values per extraction field, mapped from the reviewed
 * Property payload (flat legacy fields + canonical exposeData). Used for the
 * prefill guard and for field provenance — one mapping, shared by every step.
 *
 * The wizard boots with propertyType "apartment" and transactionType "sale"
 * as implicit defaults, not user input; they map to "" so documents can
 * prefill them, while an explicit user choice is never overwritten.
 */
export function wizardCurrentValues(
  property: PropertyPayload,
): Record<string, string | number | boolean | null | undefined> {
  const data = property.exposeData;
  if (!data) return {};
  const address = data.basicInformation.address;
  const details = data.propertyDetails;
  return {
    livingArea: property.livingArea ?? details.livingArea,
    usableArea: details.usableArea,
    plotArea: property.plotArea ?? details.plotArea,
    rooms: property.rooms ?? details.rooms,
    bedrooms: property.bedrooms ?? details.bedrooms,
    bathrooms: property.bathrooms ?? details.bathrooms,
    guestToilets: details.guestToilets,
    yearBuilt: property.constructionYear ?? details.yearBuilt,
    numberOfFloors: property.totalFloors ?? details.numberOfFloors,
    floor: property.floor,
    street: address.street,
    houseNumber: address.houseNumber,
    postalCode: address.postalCode,
    city: address.city,
    district: address.district,
    state: address.state,
    country: address.country,
    condition: property.condition,
    buildingStatus: details.buildingStatus,
    renovationStatus: details.renovationStatus,
    lastModernizationYear: details.lastModernizationYear,
    usageType: data.basicInformation.usageType,
    propertySubtype: data.basicInformation.propertySubtype,
    propertyType: property.propertyType === 'apartment' ? '' : property.propertyType,
    transactionType: property.transactionType === 'sale' ? '' : property.transactionType,
    energyClass: data.energy?.efficiencyClass,
    energyConsumption: data.energy?.finalEnergyConsumption,
    energyDemand: data.energy?.finalEnergyDemand,
    heatingType: data.energy?.heatingType,
    primaryEnergySource: data.energy?.primaryEnergySource,
    yearOfConstruction: data.energy?.yearOfConstruction,
    certificateType: data.energy?.certificateType,
    certificateDate: data.energy?.certificateDate,
    certificateValidUntil: data.energy?.certificateValidUntil,
    hotWaterIncluded: data.energy?.hotWaterIncluded,
    askingPrice: property.askingPrice,
    pricePerM2: data.pricing.pricePerM2,
    commissionRate: data.pricing.commissionRate,
    commissionPayer: data.pricing.commissionPayer,
    isRented: data.rental?.isRented,
    monthlyRent: property.coldRent,
    annualRent: data.rental?.annualRent,
    additionalCosts: property.additionalCosts,
    furnished: data.rental?.furnished,
    availableFrom: property.availableFrom,
    hausgeld: data.weg?.hausgeldEur,
    maintenanceReserve: data.weg?.maintenanceReserveEur,
    coOwnershipShare: data.weg?.coOwnershipShare,
    grossYieldTarget: data.investment?.grossYieldTargetPercent,
    grossYieldActual: data.investment?.grossYieldActualPercent,
    usufruct: data.additionalInformation?.legalFlags?.usufruct,
    leasehold: data.additionalInformation?.legalFlags?.leasehold,
    foreclosure: data.additionalInformation?.legalFlags?.foreclosure,
    heritageProtection: data.additionalInformation?.legalFlags?.heritageProtection,
  };
}
