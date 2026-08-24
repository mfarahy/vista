import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { translations } from '@/lib/i18n/core';
import {
  STEP_BUILDING,
  STEP_ENERGY,
  STEP_FEATURES,
  STEP_FINANCIAL,
  STEP_LEGAL,
  STEP_LOCATION,
  STEP_MARKETING_CONTENT,
  STEP_PROPERTY,
  STEP_REVIEW,
  STEP_YOUR_INFO,
  isHouseLike,
  normalizeCertificateType,
  normalizeEnergySource,
  shouldShowBuildingShell,
  shouldShowInvestment,
  stepStatus,
  stepStatusLabel,
  type StepCompletionSnapshot,
} from './wizard-steps';

function snapshot(overrides: Partial<StepCompletionSnapshot> = {}): StepCompletionSnapshot {
  return {
    documents: { total: 0, analyzed: 0 },
    addressSelected: false,
    propertyType: 'apartment',
    transactionType: 'sale',
    usageType: null,
    livingArea: null,
    usableArea: null,
    plotArea: null,
    rooms: null,
    bedrooms: null,
    bathrooms: null,
    guestToilets: null,
    yearBuilt: null,
    condition: null,
    renovationStatus: null,
    lastModernizationYear: null,
    selectedFeatures: [],
    gardenArea: null,
    energy: null,
    askingPrice: null,
    rentPrice: null,
    commissionRate: null,
    legalFlags: {},
    additionalInfoCount: 0,
    surroundings: {},
    yourInfo: {},
    imageCount: 0,
    planCount: 0,
    contentExists: false,
    marketingContentExists: false,
    ...overrides,
  };
}

describe('conditional sections', () => {
  it('house types expose the building shell', () => {
    assert.equal(shouldShowBuildingShell('house'), true);
    assert.equal(shouldShowBuildingShell('semi-detached'), true);
    assert.equal(shouldShowBuildingShell('terraced'), true);
    assert.equal(shouldShowBuildingShell('villa'), true);
    assert.equal(isHouseLike('house'), true);
  });

  it('apartments stay compact and do not show the building shell', () => {
    assert.equal(shouldShowBuildingShell('apartment'), false);
    assert.equal(shouldShowBuildingShell('penthouse'), false);
    assert.equal(isHouseLike('apartment'), false);
  });

  it('shows investment fields for rent or rental/investment usage', () => {
    assert.equal(shouldShowInvestment('investment', 'sale'), true);
    assert.equal(shouldShowInvestment('rental', 'sale'), true);
    assert.equal(shouldShowInvestment('mixed', 'sale'), true);
    assert.equal(shouldShowInvestment('ownerOccupied', 'rent'), true);
    assert.equal(shouldShowInvestment(null, 'sale'), false);
    assert.equal(shouldShowInvestment('ownerOccupied', 'sale'), false);
  });
});

describe('step completion', () => {
  it('property step is complete when address, type, area and rooms are set', () => {
    const status = stepStatus(
      STEP_PROPERTY,
      snapshot({
        addressSelected: true,
        propertyType: 'apartment',
        livingArea: 92,
        rooms: 3,
      }),
    );
    assert.equal(status, 'complete');
  });

  it('property step is partial when only some core facts are filled', () => {
    const status = stepStatus(
      STEP_PROPERTY,
      snapshot({ addressSelected: true, propertyType: 'apartment' }),
    );
    assert.equal(status, 'partial');
  });

  it('property step is incomplete when nothing relevant is filled', () => {
    assert.equal(
      stepStatus(STEP_PROPERTY, snapshot({ propertyType: '', addressSelected: false })),
      'incomplete',
    );
  });

  it('building step completes with year and condition', () => {
    const status = stepStatus(
      STEP_BUILDING,
      snapshot({ yearBuilt: 1987, condition: 'wellMaintained' }),
    );
    assert.equal(status, 'complete');
  });

  it('features step completes with at least one selected feature', () => {
    assert.equal(
      stepStatus(STEP_FEATURES, snapshot({ selectedFeatures: ['balcony'] })),
      'complete',
    );
    assert.equal(stepStatus(STEP_FEATURES, snapshot()), 'incomplete');
  });

  it('energy step stays incomplete without forcing fake values', () => {
    assert.equal(stepStatus(STEP_ENERGY, snapshot()), 'incomplete');
    assert.equal(
      stepStatus(STEP_ENERGY, snapshot({ energy: { efficiencyClass: 'B' } })),
      'complete',
    );
  });

  it('financial step reflects the transaction type', () => {
    assert.equal(stepStatus(STEP_FINANCIAL, snapshot({ transactionType: 'sale' })), 'incomplete');
    assert.equal(
      stepStatus(STEP_FINANCIAL, snapshot({ transactionType: 'sale', askingPrice: 449000 })),
      'complete',
    );
    assert.equal(
      stepStatus(STEP_FINANCIAL, snapshot({ transactionType: 'rent', rentPrice: 1900 })),
      'complete',
    );
  });

  it('legal step completes from legal flags or stays partial with document info', () => {
    assert.equal(stepStatus(STEP_LEGAL, snapshot()), 'incomplete');
    assert.equal(stepStatus(STEP_LEGAL, snapshot({ legalFlags: { leasehold: true } })), 'complete');
    assert.equal(stepStatus(STEP_LEGAL, snapshot({ additionalInfoCount: 2 })), 'partial');
  });

  it('empty optional fields never block progression', () => {
    assert.equal(stepStatus(STEP_YOUR_INFO, snapshot()), 'incomplete');
    assert.equal(stepStatus(STEP_LOCATION, snapshot()), 'incomplete');
  });

  it('the review step is the final wizard step (no separate agent step)', () => {
    assert.equal(STEP_REVIEW, 12);
    assert.equal(stepStatus(STEP_REVIEW, snapshot()), 'incomplete');
    assert.equal(stepStatus(STEP_REVIEW, snapshot({ contentExists: true })), 'complete');
  });

  it('marketing content step completes only after content was generated', () => {
    assert.equal(stepStatus(STEP_MARKETING_CONTENT, snapshot()), 'incomplete');
    assert.equal(
      stepStatus(STEP_MARKETING_CONTENT, snapshot({ marketingContentExists: true })),
      'complete',
    );
  });

  it('documents step is complete only when every document is analyzed', () => {
    assert.equal(stepStatus(0, snapshot()), 'incomplete');
    assert.equal(stepStatus(0, snapshot({ documents: { total: 3, analyzed: 2 } })), 'partial');
    assert.equal(stepStatus(0, snapshot({ documents: { total: 3, analyzed: 3 } })), 'complete');
  });

  it('labels the statuses in German', () => {
    assert.equal(translations.de.t(stepStatusLabel('complete')), 'Ausgefüllt');
    assert.equal(translations.de.t(stepStatusLabel('partial')), 'Teilweise ausgefüllt');
    assert.equal(translations.de.t(stepStatusLabel('incomplete')), 'Noch offen');
  });
});

describe('AI value normalization', () => {
  it('maps German energy sources onto the normalized enum', () => {
    assert.equal(normalizeEnergySource('Gasheizung'), 'gas');
    assert.equal(normalizeEnergySource('Erdgas'), 'gas');
    assert.equal(normalizeEnergySource('Wärmepumpe'), 'heat_pump');
    assert.equal(normalizeEnergySource('Fernwärme'), 'district_heating');
    assert.equal(normalizeEnergySource('gas'), 'gas');
    assert.equal(normalizeEnergySource('heat_pump'), 'heat_pump');
    // A heating system name like "Zentralheizung" is NOT an energy source and
    // must not be mapped to "other" (Phase 12 regression: it previously
    // overwrote the real AI value "gas" in the prefill).
    assert.equal(normalizeEnergySource('Zentralheizung'), null);
    assert.equal(normalizeEnergySource('Gasetagenheizung'), 'gas');
    assert.equal(normalizeEnergySource('Sonstige'), 'other');
    assert.equal(normalizeEnergySource(''), null);
    assert.equal(normalizeEnergySource(null), null);
  });

  it('maps certificate types onto the normalized enum', () => {
    assert.equal(normalizeCertificateType('Bedarfsausweis'), 'needs_based');
    assert.equal(normalizeCertificateType('Verbrauchsausweis'), 'consumption_based');
    assert.equal(normalizeCertificateType('needs_based'), 'needs_based');
    assert.equal(normalizeCertificateType('consumption_based'), 'consumption_based');
    assert.equal(normalizeCertificateType('kein Ausweis'), 'not_available');
    assert.equal(normalizeCertificateType(null), null);
  });
});
