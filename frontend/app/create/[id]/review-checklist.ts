import type { PropertyPayload } from './types';
import type { WizardFieldCandidate } from './document-prefill';
import { formatExtractedValue, wizardFieldLabel } from './document-prefill';
import { distinctSourceValues } from './field-provenance';

/**
 * Review-checklist logic (Phase 10). The Prüfung step shows only information
 * that deserves attention: missing important facts, document conflicts and
 * analysis state. Everything is informational — the review never blocks
 * progression and never invents new mandatory fields (the existing
 * hasSufficientPropertyInfo gate in the marketing-content service stays the
 * only generation gate). Each issue carries the wizard step to edit.
 */

export type ReviewCategory =
  | 'Objekt'
  | 'Gebäude'
  | 'Ausstattung'
  | 'Energie'
  | 'Finanzen'
  | 'Dokumente'
  | 'Fotos'
  | 'Inhalt';

export type ReviewIssueType = 'warning' | 'info';

export interface ReviewIssue {
  id: string;
  type: ReviewIssueType;
  category: ReviewCategory;
  title: string;
  detail?: string;
  /** Wizard step the "Bearbeiten" action navigates to. */
  editStep: number;
}

export interface ReviewChecklistInput {
  property: PropertyPayload;
  sourcesByField: Record<string, WizardFieldCandidate[]>;
  documents: { total: number; analyzed: number; failed: number };
  imageCount: number;
  marketingContentExists: boolean;
}

/** The categories shown in the review status strip (spec §17). */
export const REVIEW_CATEGORIES: ReviewCategory[] = [
  'Objekt',
  'Gebäude',
  'Ausstattung',
  'Energie',
  'Finanzen',
  'Dokumente',
];

const STEP_PROPERTY = 1;
const STEP_FINANCIAL = 5;
const STEP_LEGAL = 6;
const STEP_PHOTOS = 10;
const STEP_MARKETING_CONTENT = 9;

/** Wizard step and review category per extraction field (for conflicts). */
const FIELD_CONTEXT: Record<string, { category: ReviewCategory; editStep: number }> = {
  street: { category: 'Objekt', editStep: STEP_PROPERTY },
  houseNumber: { category: 'Objekt', editStep: STEP_PROPERTY },
  postalCode: { category: 'Objekt', editStep: STEP_PROPERTY },
  city: { category: 'Objekt', editStep: STEP_PROPERTY },
  district: { category: 'Objekt', editStep: STEP_PROPERTY },
  state: { category: 'Objekt', editStep: STEP_PROPERTY },
  country: { category: 'Objekt', editStep: STEP_PROPERTY },
  propertyType: { category: 'Objekt', editStep: STEP_PROPERTY },
  propertySubtype: { category: 'Objekt', editStep: STEP_PROPERTY },
  usageType: { category: 'Objekt', editStep: STEP_PROPERTY },
  livingArea: { category: 'Objekt', editStep: STEP_PROPERTY },
  usableArea: { category: 'Objekt', editStep: STEP_PROPERTY },
  plotArea: { category: 'Objekt', editStep: STEP_PROPERTY },
  rooms: { category: 'Objekt', editStep: STEP_PROPERTY },
  bedrooms: { category: 'Objekt', editStep: STEP_PROPERTY },
  bathrooms: { category: 'Objekt', editStep: STEP_PROPERTY },
  guestToilets: { category: 'Objekt', editStep: STEP_PROPERTY },
  floor: { category: 'Objekt', editStep: STEP_PROPERTY },
  yearBuilt: { category: 'Gebäude', editStep: 2 },
  buildingStatus: { category: 'Gebäude', editStep: 2 },
  condition: { category: 'Gebäude', editStep: 2 },
  renovationStatus: { category: 'Gebäude', editStep: 2 },
  lastModernizationYear: { category: 'Gebäude', editStep: 2 },
  numberOfFloors: { category: 'Gebäude', editStep: 2 },
  basement: { category: 'Gebäude', editStep: 2 },
  attic: { category: 'Gebäude', editStep: 2 },
  balcony: { category: 'Ausstattung', editStep: 3 },
  terrace: { category: 'Ausstattung', editStep: 3 },
  garden: { category: 'Ausstattung', editStep: 3 },
  gardenArea: { category: 'Ausstattung', editStep: 3 },
  parking: { category: 'Ausstattung', editStep: 3 },
  garage: { category: 'Ausstattung', editStep: 3 },
  carport: { category: 'Ausstattung', editStep: 3 },
  shower: { category: 'Ausstattung', editStep: 3 },
  bathtub: { category: 'Ausstattung', editStep: 3 },
  orientation: { category: 'Ausstattung', editStep: 3 },
  energyClass: { category: 'Energie', editStep: 4 },
  energyDemand: { category: 'Energie', editStep: 4 },
  energyConsumption: { category: 'Energie', editStep: 4 },
  heatingType: { category: 'Energie', editStep: 4 },
  primaryEnergySource: { category: 'Energie', editStep: 4 },
  yearOfConstruction: { category: 'Energie', editStep: 4 },
  certificateType: { category: 'Energie', editStep: 4 },
  certificateDate: { category: 'Energie', editStep: 4 },
  certificateValidUntil: { category: 'Energie', editStep: 4 },
  hotWaterIncluded: { category: 'Energie', editStep: 4 },
  askingPrice: { category: 'Finanzen', editStep: STEP_FINANCIAL },
  pricePerM2: { category: 'Finanzen', editStep: STEP_FINANCIAL },
  commissionRate: { category: 'Finanzen', editStep: STEP_FINANCIAL },
  commissionPayer: { category: 'Finanzen', editStep: STEP_FINANCIAL },
  additionalCosts: { category: 'Finanzen', editStep: STEP_FINANCIAL },
  monthlyRent: { category: 'Finanzen', editStep: STEP_FINANCIAL },
  annualRent: { category: 'Finanzen', editStep: STEP_FINANCIAL },
  deposit: { category: 'Finanzen', editStep: STEP_FINANCIAL },
  hausgeld: { category: 'Finanzen', editStep: STEP_FINANCIAL },
  maintenanceReserve: { category: 'Finanzen', editStep: STEP_FINANCIAL },
  coOwnershipShare: { category: 'Finanzen', editStep: STEP_FINANCIAL },
  grossYieldTarget: { category: 'Finanzen', editStep: STEP_FINANCIAL },
  grossYieldActual: { category: 'Finanzen', editStep: STEP_FINANCIAL },
  availableFrom: { category: 'Finanzen', editStep: STEP_FINANCIAL },
  usufruct: { category: 'Dokumente', editStep: STEP_LEGAL },
  leasehold: { category: 'Dokumente', editStep: STEP_LEGAL },
  foreclosure: { category: 'Dokumente', editStep: STEP_LEGAL },
  heritageProtection: { category: 'Dokumente', editStep: STEP_LEGAL },
};

function isEmpty(value: unknown): boolean {
  return value === null || value === undefined || value === '';
}

function missingIssue(
  id: string,
  label: string,
  category: ReviewCategory,
  editStep: number,
): ReviewIssue {
  return {
    id,
    type: 'warning',
    category,
    title: `${label} fehlt`,
    detail: 'Diese Angabe fehlt noch und ist für das Exposé wichtig.',
    editStep,
  };
}

/**
 * Builds the review issues for a property. Missing optional information never
 * produces an issue — only core marketing facts, real document conflicts and
 * analysis/documentation state.
 */
export function buildReviewIssues(input: ReviewChecklistInput): ReviewIssue[] {
  const issues: ReviewIssue[] = [];
  const data = input.property.exposeData;
  const details = data?.propertyDetails;
  const livingArea = input.property.livingArea ?? details?.livingArea;
  const rooms = input.property.rooms ?? details?.rooms;
  const askingPrice = input.property.askingPrice ?? data?.pricing?.purchasePrice;
  const coldRent = input.property.coldRent ?? data?.pricing?.rentPrice;

  if (isEmpty(livingArea)) {
    issues.push(missingIssue('missing-livingArea', 'Wohnfläche', 'Objekt', STEP_PROPERTY));
  }
  if (isEmpty(rooms)) {
    issues.push(missingIssue('missing-rooms', 'Zimmer', 'Objekt', STEP_PROPERTY));
  }
  if (input.property.transactionType === 'rent') {
    if (isEmpty(coldRent)) {
      issues.push(missingIssue('missing-rent', 'Kaltmiete', 'Finanzen', STEP_FINANCIAL));
    }
  } else if (isEmpty(askingPrice)) {
    issues.push(missingIssue('missing-price', 'Kaufpreis', 'Finanzen', STEP_FINANCIAL));
  }

  for (const [field, sources] of Object.entries(input.sourcesByField)) {
    const distinct = distinctSourceValues(sources);
    if (distinct.length < 2) continue;
    const context = FIELD_CONTEXT[field] ?? { category: 'Dokumente' as const, editStep: STEP_LEGAL };
    issues.push({
      id: `conflict-${field}`,
      type: 'warning',
      category: context.category,
      title: `Unterschiedliche Angaben in Dokumenten`,
      detail: `${wizardFieldLabel(field)}: ${distinct
        .map((value) => formatExtractedValue(value as string | number | boolean | null))
        .join(' und ')}`,
      editStep: context.editStep,
    });
  }

  const { total, analyzed, failed } = input.documents;
  if (failed > 0) {
    issues.push({
      id: 'documents-failed',
      type: 'warning',
      category: 'Dokumente',
      title: `${failed} ${failed === 1 ? 'Dokument konnte' : 'Dokumente konnten'} nicht analysiert werden`,
      detail: 'Die Analyse kann erneut gestartet werden.',
      editStep: 0,
    });
  } else if (total === 0) {
    issues.push({
      id: 'documents-missing',
      type: 'info',
      category: 'Dokumente',
      title: 'Keine Dokumente hochgeladen',
      detail: 'Unterlagen helfen Vista, Angaben vorauszufüllen — der Assistent funktioniert auch ohne.',
      editStep: 0,
    });
  } else if (analyzed < total) {
    issues.push({
      id: 'documents-pending',
      type: 'info',
      category: 'Dokumente',
      title: `${analyzed} von ${total} Dokumenten analysiert`,
      detail: 'Die restlichen Dokumente werden analysiert oder konnten nicht verarbeitet werden.',
      editStep: 0,
    });
  }

  if (input.imageCount === 0) {
    issues.push({
      id: 'photos-missing',
      type: 'info',
      category: 'Fotos',
      title: 'Noch keine Fotos hochgeladen',
      detail: 'Ein Exposé wirkt ohne Fotos unvollständig.',
      editStep: STEP_PHOTOS,
    });
  }

  if (!input.marketingContentExists) {
    issues.push({
      id: 'content-missing',
      type: 'info',
      category: 'Inhalt',
      title: 'Exposé-Inhalt noch nicht erzeugt',
      detail: 'Vista kann den Text aus Ihren geprüften Angaben erzeugen.',
      editStep: STEP_MARKETING_CONTENT,
    });
  }

  return issues;
}

export type ReviewCategoryStatus = 'ok' | 'attention';

/**
 * Status per review category for the compact ✓ / ⚠ strip. A category needs
 * attention when any of its issues is open — warnings and informational
 * items alike, because even informational items are worth a glance.
 */
export function reviewCategoryStatuses(
  issues: ReviewIssue[],
): Record<ReviewCategory, ReviewCategoryStatus> {
  const statuses: Record<ReviewCategory, ReviewCategoryStatus> = {
    Objekt: 'ok',
    Gebäude: 'ok',
    Ausstattung: 'ok',
    Energie: 'ok',
    Finanzen: 'ok',
    Dokumente: 'ok',
    Fotos: 'ok',
    Inhalt: 'ok',
  };
  for (const issue of issues) {
    if (issue.category in statuses) statuses[issue.category] = 'attention';
  }
  return statuses;
}