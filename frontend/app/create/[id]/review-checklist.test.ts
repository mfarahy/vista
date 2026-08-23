import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { PropertyPayload } from './types';
import type { WizardFieldCandidate } from './document-prefill';
import { buildReviewIssues, reviewCategoryStatuses } from './review-checklist';
import type { ReviewChecklistInput } from './review-checklist';

function source(
  field: string,
  value: string | number | boolean,
  filename: string,
): WizardFieldCandidate {
  return { field, value, sourceDocumentId: filename, sourceFilename: filename, evidence: null };
}

function property(overrides: Partial<PropertyPayload> = {}): PropertyPayload {
  return {
    propertyType: 'house',
    transactionType: 'sale',
    constructionYear: null,
    address: '',
    zipCode: '',
    city: '',
    district: '',
    livingArea: null,
    plotArea: null,
    rooms: null,
    bedrooms: null,
    bathrooms: null,
    floor: '',
    totalFloors: null,
    bodenrichtwert: null,
    availableFrom: '',
    condition: '',
    askingPrice: null,
    additionalCosts: null,
    commission: '',
    hausgeld: null,
    coldRent: null,
    deposit: null,
    selectedFeatures: [],
    additionalFeatures: '',
    surroundings: {},
    locationNote: '',
    sellerDescription: '',
    specialNotes: '',
    targetAudience: '',
    tone: 'professional',
    language: 'de',
    roomsData: [],
    ...overrides,
  };
}

function input(overrides: Partial<ReviewChecklistInput> = {}): ReviewChecklistInput {
  return {
    property: property(),
    sourcesByField: {},
    documents: { total: 2, analyzed: 2, failed: 0 },
    imageCount: 3,
    marketingContentExists: true,
    ...overrides,
  };
}

describe('buildReviewIssues', () => {
  it('warns about missing important information with the correct edit step', () => {
    const issues = buildReviewIssues(input());
    const missingArea = issues.find((issue) => issue.id === 'missing-livingArea');
    const missingPrice = issues.find((issue) => issue.id === 'missing-price');
    assert.ok(missingArea, 'Wohnfläche warning exists');
    assert.equal(missingArea?.type, 'warning');
    assert.equal(missingArea?.category, 'Objekt');
    assert.equal(missingArea?.editStep, 1, 'navigates to the Objekt step');
    assert.ok(missingPrice, 'Kaufpreis warning exists');
    assert.equal(missingPrice?.category, 'Finanzen');
    assert.equal(missingPrice?.editStep, 5, 'navigates to the Finanzen step');
  });

  it('does not warn when the important facts are present', () => {
    const issues = buildReviewIssues(
      input({
        property: property({ livingArea: 145, rooms: 5, askingPrice: 549000 }),
      }),
    );
    assert.ok(!issues.some((issue) => issue.id === 'missing-livingArea'));
    assert.ok(!issues.some((issue) => issue.id === 'missing-price'));
  });

  it('warns about the missing rent instead of the price for rentals', () => {
    const issues = buildReviewIssues(
      input({ property: property({ transactionType: 'rent' }) }),
    );
    assert.ok(issues.some((issue) => issue.id === 'missing-rent'));
    assert.ok(!issues.some((issue) => issue.id === 'missing-price'));
  });

  it('keeps optional fields silent when empty', () => {
    const issues = buildReviewIssues(
      input({
        property: property({ livingArea: 145, rooms: 5, askingPrice: 549000 }),
      }),
    );
    assert.ok(!issues.some((issue) => issue.title.includes('Gartenfläche')));
    assert.ok(!issues.some((issue) => issue.title.includes('Hausgeld')));
    assert.ok(!issues.some((issue) => issue.title.includes('Instandhaltungsrücklage')));
  });

  it('reports document conflicts as non-blocking warnings', () => {
    const issues = buildReviewIssues(
      input({
        sourcesByField: {
          houseNumber: [source('houseNumber', '88 A', 'Grundbuchauszug.pdf'), source('houseNumber', '88a', 'Lageplan.pdf')],
        },
      }),
    );
    const conflict = issues.find((issue) => issue.id === 'conflict-houseNumber');
    assert.ok(conflict);
    assert.equal(conflict?.type, 'warning');
    assert.equal(conflict?.category, 'Objekt');
    assert.equal(conflict?.editStep, 1);
    assert.match(conflict?.detail ?? '', /88 A und 88a/);
  });

  it('navigates legal-field conflicts to the Recht step', () => {
    const issues = buildReviewIssues(
      input({
        sourcesByField: {
          usufruct: [source('usufruct', true, 'A.pdf'), source('usufruct', false, 'B.pdf')],
        },
      }),
    );
    const conflict = issues.find((issue) => issue.id === 'conflict-usufruct');
    assert.equal(conflict?.editStep, 6);
  });

  it('warns about failed analyses and informs about pending ones', () => {
    const failed = buildReviewIssues(
      input({ documents: { total: 3, analyzed: 2, failed: 1 } }),
    );
    assert.ok(failed.some((issue) => issue.id === 'documents-failed'));
    const pending = buildReviewIssues(
      input({ documents: { total: 3, analyzed: 2, failed: 0 } }),
    );
    assert.ok(pending.some((issue) => issue.id === 'documents-pending'));
  });

  it('informs about missing photos and missing marketing content without blocking', () => {
    const issues = buildReviewIssues(
      input({
        imageCount: 0,
        marketingContentExists: false,
        property: property({ livingArea: 145, rooms: 5, askingPrice: 549000 }),
      }),
    );
    const photos = issues.find((issue) => issue.id === 'photos-missing');
    const content = issues.find((issue) => issue.id === 'content-missing');
    assert.ok(photos);
    assert.equal(photos?.type, 'info');
    assert.equal(photos?.editStep, 10);
    assert.ok(content);
    assert.equal(content?.editStep, 9);
  });

  it('never flags empty optional fields as blocking warnings', () => {
    const issues = buildReviewIssues(input());
    assert.ok(issues.every((issue) => issue.type === 'warning' || issue.type === 'info'));
  });
});

describe('reviewCategoryStatuses', () => {
  it('marks categories with issues as attention and others as ok', () => {
    const issues = buildReviewIssues(
      input({
        documents: { total: 0, analyzed: 0, failed: 0 },
        property: property({ askingPrice: 549000 }),
      }),
    );
    const statuses = reviewCategoryStatuses(issues);
    assert.equal(statuses.Objekt, 'attention', 'Wohnfläche/Zimmer missing');
    assert.equal(statuses.Finanzen, 'ok', 'Kaufpreis present');
    assert.equal(statuses.Dokumente, 'attention', 'no documents');
    assert.equal(statuses.Energie, 'ok');
  });
});