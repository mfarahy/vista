import type { PropertyPayload } from './types';
import type { WizardFieldCandidate } from './document-prefill';
import { formatExtractedValue, wizardFieldLabel } from './document-prefill';
import { distinctSourceValues } from './field-provenance';
import type { TranslationKey, Translator } from '@/lib/i18n/core';

/**
 * Review-checklist logic (Phase 10). The Prüfung step shows only information
 * that deserves attention: missing important facts, document conflicts and
 * analysis state. Everything is informational — the review never blocks
 * progression and never invents new mandatory fields (the existing
 * hasSufficientPropertyInfo gate in the marketing-content service stays the
 * only generation gate). Each issue carries the wizard step to edit.
 */

export type ReviewCategory =
  'Objekt' | 'Gebäude' | 'Ausstattung' | 'Energie' | 'Finanzen' | 'Dokumente' | 'Fotos' | 'Inhalt';

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

/** Translation key for each review category shown in the status strip. */
export const REVIEW_CATEGORY_KEYS: Record<ReviewCategory, TranslationKey> = {
  Objekt: 'reviewCategories.object',
  Gebäude: 'reviewCategories.building',
  Ausstattung: 'reviewCategories.features',
  Energie: 'reviewCategories.energy',
  Finanzen: 'reviewCategories.financial',
  Dokumente: 'reviewCategories.documents',
  Fotos: 'reviewCategories.photos',
  Inhalt: 'reviewCategories.content',
};

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
  labelKey: TranslationKey | string,
  category: ReviewCategory,
  editStep: number,
  tr: Translator,
): ReviewIssue {
  return {
    id,
    type: 'warning',
    category,
    title: tr.t('reviewIssues.missingTitle', { label: tr.t(labelKey) }),
    detail: tr.t('reviewIssues.missingDetail'),
    editStep,
  };
}

/**
 * Builds the review issues for a property. Missing optional information never
 * produces an issue — only core marketing facts, real document conflicts and
 * analysis/documentation state. Labels are resolved through the given
 * translator so the checklist renders in the active language.
 */
export function buildReviewIssues(input: ReviewChecklistInput, tr: Translator): ReviewIssue[] {
  const issues: ReviewIssue[] = [];
  const data = input.property.exposeData;
  const details = data?.propertyDetails;
  const livingArea = input.property.livingArea ?? details?.livingArea;
  const rooms = input.property.rooms ?? details?.rooms;
  const askingPrice = input.property.askingPrice ?? data?.pricing?.purchasePrice;
  const coldRent = input.property.coldRent ?? data?.pricing?.rentPrice;

  if (isEmpty(livingArea)) {
    issues.push(
      missingIssue('missing-livingArea', 'fields.livingArea', 'Objekt', STEP_PROPERTY, tr),
    );
  }
  if (isEmpty(rooms)) {
    issues.push(missingIssue('missing-rooms', 'fields.rooms', 'Objekt', STEP_PROPERTY, tr));
  }
  if (input.property.transactionType === 'rent') {
    if (isEmpty(coldRent)) {
      issues.push(missingIssue('missing-rent', 'fields.coldRent', 'Finanzen', STEP_FINANCIAL, tr));
    }
  } else if (isEmpty(askingPrice)) {
    issues.push(
      missingIssue('missing-price', 'fields.purchasePrice', 'Finanzen', STEP_FINANCIAL, tr),
    );
  }

  for (const [field, sources] of Object.entries(input.sourcesByField)) {
    const distinct = distinctSourceValues(sources);
    if (distinct.length < 2) continue;
    const context = FIELD_CONTEXT[field] ?? {
      category: 'Dokumente' as const,
      editStep: STEP_LEGAL,
    };
    issues.push({
      id: `conflict-${field}`,
      type: 'warning',
      category: context.category,
      title: tr.t('reviewIssues.conflictTitle'),
      detail: `${tr.t(wizardFieldLabel(field))}: ${distinct
        .map((value) => formatExtractedValue(value as string | number | boolean | null, tr.locale))
        .join(tr.t('reviewIssues.and'))}`,
      editStep: context.editStep,
    });
  }

  const { total, analyzed, failed } = input.documents;
  if (failed > 0) {
    issues.push({
      id: 'documents-failed',
      type: 'warning',
      category: 'Dokumente',
      title:
        failed === 1
          ? tr.t('reviewIssues.documentsFailedOne', { count: failed })
          : tr.t('reviewIssues.documentsFailedMany', { count: failed }),
      detail: tr.t('reviewIssues.documentsFailedDetail'),
      editStep: 0,
    });
  } else if (total === 0) {
    issues.push({
      id: 'documents-missing',
      type: 'info',
      category: 'Dokumente',
      title: tr.t('reviewIssues.documentsMissingTitle'),
      detail: tr.t('reviewIssues.documentsMissingDetail'),
      editStep: 0,
    });
  } else if (analyzed < total) {
    issues.push({
      id: 'documents-pending',
      type: 'info',
      category: 'Dokumente',
      title: tr.t('reviewIssues.documentsPendingTitle', { analyzed, total }),
      detail: tr.t('reviewIssues.documentsPendingDetail'),
      editStep: 0,
    });
  }

  if (input.imageCount === 0) {
    issues.push({
      id: 'photos-missing',
      type: 'info',
      category: 'Fotos',
      title: tr.t('reviewIssues.photosMissingTitle'),
      detail: tr.t('reviewIssues.photosMissingDetail'),
      editStep: STEP_PHOTOS,
    });
  }

  if (!input.marketingContentExists) {
    issues.push({
      id: 'content-missing',
      type: 'info',
      category: 'Inhalt',
      title: tr.t('reviewIssues.contentMissingTitle'),
      detail: tr.t('reviewIssues.contentMissingDetail'),
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
