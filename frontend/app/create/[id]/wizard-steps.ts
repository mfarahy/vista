/**
 * Pure wizard helpers for the domain-model based steps. Kept free of React so
 * the conditional-section and completion logic can be tested directly:
 *
 *   - completion state per step (complete / partial / incomplete),
 *   - conditional sections that depend on property type and transaction state.
 *
 * Completion is informational only: an incomplete step never blocks progress
 * unless the wizard explicitly requires it (only the address must be resolved).
 */

export type WizardStepStatus = 'complete' | 'partial' | 'incomplete';

export const STEP_DOCUMENTS = 0;
export const STEP_PROPERTY = 1;
export const STEP_BUILDING = 2;
export const STEP_FEATURES = 3;
export const STEP_ENERGY = 4;
export const STEP_FINANCIAL = 5;
export const STEP_LEGAL = 6;
export const STEP_LOCATION = 7;
export const STEP_YOUR_INFO = 8;
export const STEP_MARKETING_CONTENT = 9;
export const STEP_PHOTOS = 10;
export const STEP_PLANS = 11;
export const STEP_AGENT = 12;
export const STEP_REVIEW = 13;

const HOUSE_TYPES = ['house', 'villa', 'semi-detached', 'terraced'];
const INVESTMENT_USAGE = ['rental', 'investment', 'mixed'];

export function isHouseLike(propertyType: string): boolean {
  return HOUSE_TYPES.includes(propertyType);
}

/**
 * Building shell fields (floors, basement, attic) are only relevant for house
 * types. Apartments stay compact — the unit floor is not part of the model.
 */
export function shouldShowBuildingShell(propertyType: string): boolean {
  return isHouseLike(propertyType);
}

/**
 * Investment / rental specifics are shown when the user rents the property or
 * declares a rental/investment usage. Pure-sale owner-occupied stays simple.
 */
export function shouldShowInvestment(
  usageType: string | null | undefined,
  transactionType: string,
): boolean {
  return transactionType === 'rent' || INVESTMENT_USAGE.includes(usageType ?? '');
}

function isFilled(value: unknown): boolean {
  if (value === null || value === undefined || value === '') return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.values(value).some(isFilled);
  return true;
}

export interface StepCompletionSnapshot {
  documents: { total: number; analyzed: number };
  addressSelected: boolean;
  propertyType: string;
  transactionType: string;
  usageType?: string | null;
  livingArea?: number | null;
  usableArea?: number | null;
  plotArea?: number | null;
  rooms?: number | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  guestToilets?: number | null;
  yearBuilt?: number | null;
  condition?: string | null;
  renovationStatus?: string | null;
  lastModernizationYear?: number | null;
  selectedFeatures: string[];
  gardenArea?: number | null;
  energy?: Record<string, unknown> | null;
  askingPrice?: number | null;
  rentPrice?: number | null;
  commissionRate?: number | null;
  legalFlags?: Record<string, unknown>;
  additionalInfoCount: number;
  surroundings: Record<string, string>;
  yourInfo: Record<string, unknown>;
  imageCount: number;
  planCount: number;
  agentName?: string | null;
  agentCompany?: string | null;
  contentExists: boolean;
  marketingContentExists: boolean;
}

/**
 * Computes the completion state for a wizard step. Only the address and the
 * core property facts count as "complete" for the data steps; everything else
 * is best-effort information that must never block progression.
 */
export function stepStatus(
  step: number,
  s: StepCompletionSnapshot,
): WizardStepStatus {
  switch (step) {
    case STEP_DOCUMENTS: {
      if (s.documents.total === 0) return 'incomplete';
      if (s.documents.analyzed === s.documents.total) return 'complete';
      return 'partial';
    }
    case STEP_PROPERTY: {
      const core = [
        s.addressSelected,
        isFilled(s.propertyType),
        isFilled(s.livingArea),
        isFilled(s.rooms),
      ];
      return statusOf(core, [s.addressSelected, isFilled(s.livingArea), isFilled(s.rooms)]);
    }
    case STEP_BUILDING: {
      const core = [isFilled(s.yearBuilt), isFilled(s.condition)];
      return statusOf(core, [isFilled(s.renovationStatus), isFilled(s.lastModernizationYear)]);
    }
    case STEP_FEATURES:
      return isFilled(s.selectedFeatures) || isFilled(s.gardenArea)
        ? 'complete'
        : 'incomplete';
    case STEP_ENERGY: {
      const demandOrClass = isFilled(s.energy?.demandKwhPerM2A) || isFilled(s.energy?.consumptionKwhPerM2A);
      if (isFilled(s.energy?.certificateType) || demandOrClass || isFilled(s.energy?.efficiencyClass)) {
        return 'complete';
      }
      return isFilled(s.energy) ? 'partial' : 'incomplete';
    }
    case STEP_FINANCIAL: {
      if (s.transactionType === 'rent') {
        return isFilled(s.rentPrice) ? 'complete' : isFilled(s.askingPrice) ? 'partial' : 'incomplete';
      }
      if (isFilled(s.askingPrice)) return 'complete';
      if (isFilled(s.commissionRate) || isFilled(s.rentPrice)) return 'partial';
      return 'incomplete';
    }
    case STEP_LEGAL: {
      if (isFilled(s.legalFlags)) return 'complete';
      if (s.additionalInfoCount > 0) return 'partial';
      return 'incomplete';
    }
    case STEP_LOCATION:
      return isFilled(s.surroundings) ? 'complete' : 'incomplete';
    case STEP_YOUR_INFO:
      return isFilled(s.yourInfo) ? 'complete' : 'incomplete';
    case STEP_MARKETING_CONTENT:
      return s.marketingContentExists ? 'complete' : 'incomplete';
    case STEP_PHOTOS:
      return s.imageCount > 0 ? 'complete' : 'incomplete';
    case STEP_PLANS:
      return s.planCount > 0 ? 'complete' : 'incomplete';
    case STEP_AGENT:
      return isFilled(s.agentName) || isFilled(s.agentCompany) ? 'complete' : 'incomplete';
    case STEP_REVIEW:
      return s.contentExists ? 'complete' : 'incomplete';
    default:
      return 'incomplete';
  }
}

function statusOf(
  core: boolean[],
  any: boolean[],
): WizardStepStatus {
  if (core.every(Boolean)) return 'complete';
  if (core.some(Boolean) || any.some(Boolean)) return 'partial';
  return 'incomplete';
}

export function stepStatusLabel(status: WizardStepStatus): string {
  switch (status) {
    case 'complete':
      return 'Ausgefüllt';
    case 'partial':
      return 'Teilweise ausgefüllt';
    default:
      return 'Noch offen';
  }
}

const ENERGY_SOURCE_VALUES = [
  'gas',
  'oil',
  'district_heating',
  'heat_pump',
  'electricity',
  'wood',
  'pellets',
  'other',
] as const;

/**
 * Normalizes an AI-extracted energy source into the persisted enum value.
 * Accepts the normalized value itself as well as common German terms
 * ("Gasheizung" → "gas", "Erdgas" → "gas", "Wärmepumpe" → "heat_pump").
 */
export function normalizeEnergySource(value: string | null | undefined): string | null {
  if (!value) return null;
  const lowered = value.toLowerCase();
  if ((ENERGY_SOURCE_VALUES as readonly string[]).includes(lowered)) return lowered;
  if (lowered.includes('gas')) return 'gas';
  if (lowered.includes('öl') || lowered.includes('oel')) return 'oil';
  if (lowered.includes('fernwärme') || lowered.includes('fernwaerme')) return 'district_heating';
  if (lowered.includes('wärmepumpe') || lowered.includes('waermepumpe')) return 'heat_pump';
  if (lowered.includes('strom') || lowered.includes('elektro')) return 'electricity';
  if (lowered.includes('pellet')) return 'pellets';
  if (lowered.includes('holz')) return 'wood';
  if (lowered.includes('heizung') || lowered.includes('sonst')) return 'other';
  return null;
}

/**
 * Normalizes an AI-extracted certificate type into the persisted enum value.
 * Accepts the normalized value ("needs_based", "consumption_based") as well as
 * German terms ("Bedarfsausweis", "Verbrauchsausweis").
 */
export function normalizeCertificateType(value: string | null | undefined): string | null {
  if (!value) return null;
  const lowered = value.toLowerCase();
  if (lowered === 'needs_based' || lowered.includes('bedarf')) return 'needs_based';
  if (lowered === 'consumption_based' || lowered.includes('verbrauch'))
    return 'consumption_based';
  if (lowered.includes('nicht') || lowered.includes('kein')) return 'not_available';
  if (lowered.includes('unbekannt') || lowered.includes('unknown')) return 'unknown';
  return null;
}