import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  DOCUMENT_TYPES,
  DOCUMENT_TAGS,
  WIZARD_FIELDS,
  documentUnderstandingSchema,
} from './schema.js';

describe('document understanding schema', () => {
  it('exposes a controlled document type taxonomy', () => {
    assert.ok(DOCUMENT_TYPES.includes('grundriss'));
    assert.ok(DOCUMENT_TYPES.includes('expose'));
    assert.ok(DOCUMENT_TYPES.includes('energieausweis'));
    assert.ok(DOCUMENT_TYPES.includes('property_photo'));
    assert.ok(DOCUMENT_TYPES.includes('other'));
  });

  it('exposes a controlled tag taxonomy', () => {
    assert.ok(DOCUMENT_TAGS.includes('floor-plan'));
    assert.ok(DOCUMENT_TAGS.includes('energy'));
    assert.ok(DOCUMENT_TAGS.includes('living-area'));
    assert.ok(DOCUMENT_TAGS.includes('rooms'));
  });

  it('accepts a valid structured result', () => {
    const result = documentUnderstandingSchema.parse({
      documentType: 'grundriss',
      tags: ['floor-plan', 'rooms', 'living-area'],
      summary: 'Floor plan of the property.',
      keepInLibrary: true,
      wizardFields: [
        { field: 'livingArea', value: 124.5, evidence: 'Wohnfläche: 124,5 m²' },
        { field: 'rooms', value: 5, evidence: '5 Zimmer' },
      ],
      additionalInformation: [{ key: 'orientation', value: 'South', evidence: 'Süd' }],
    });
    assert.equal(result.documentType, 'grundriss');
    assert.equal(result.wizardFields.length, 2);
  });

  it('rejects an invented document type', () => {
    assert.throws(() =>
      documentUnderstandingSchema.parse({
        documentType: 'not-a-real-type',
        tags: [],
        summary: '',
        keepInLibrary: true,
        wizardFields: [],
        additionalInformation: [],
      }),
    );
  });

  it('rejects arbitrary tags outside the controlled set', () => {
    assert.throws(() =>
      documentUnderstandingSchema.parse({
        documentType: 'other',
        tags: ['arbitrary-keyword'],
        summary: '',
        keepInLibrary: true,
        wizardFields: [],
        additionalInformation: [],
      }),
    );
  });

  it('rejects wizard fields that do not map to a known wizard field', () => {
    assert.throws(() =>
      documentUnderstandingSchema.parse({
        documentType: 'other',
        tags: [],
        summary: '',
        keepInLibrary: true,
        wizardFields: [{ field: 'madeUpField', value: 1, evidence: null }],
        additionalInformation: [],
      }),
    );
  });

  it('exposes the expanded wizard field set covering the Property model', () => {
    const expected: (typeof WIZARD_FIELDS)[number][] = [
      'propertySubtype',
      'usageType',
      'usableArea',
      'guestToilets',
      'buildingStatus',
      'condition',
      'renovationStatus',
      'lastModernizationYear',
      'gardenArea',
      'orientation',
      'certificateType',
      'certificateDate',
      'certificateValidUntil',
      'primaryEnergySource',
      'hotWaterIncluded',
      'askingPrice',
      'pricePerM2',
      'commissionRate',
      'commissionPayer',
      'isRented',
      'monthlyRent',
      'annualRent',
      'additionalCosts',
      'furnished',
      'availableFrom',
      'grossYieldTarget',
      'grossYieldActual',
      'usufruct',
      'leasehold',
      'foreclosure',
      'heritageProtection',
      'transactionType',
    ];
    for (const field of expected) {
      assert.ok(WIZARD_FIELDS.includes(field), `wizard field ${field} must exist`);
    }
  });

  it('accepts an expanded structured result with property-model fields', () => {
    const result = documentUnderstandingSchema.parse({
      documentType: 'expose',
      tags: ['address', 'rooms', 'living-area', 'building'],
      summary: 'Exposé with factual property data.',
      keepInLibrary: true,
      wizardFields: [
        { field: 'propertyType', value: 'house', evidence: 'Reiheneckhaus' },
        { field: 'propertySubtype', value: 'endTerraceHouse', evidence: 'Reiheneckhaus' },
        { field: 'livingArea', value: 125, evidence: 'Wohnfläche: 125 m²' },
        { field: 'plotArea', value: 340, evidence: 'Grundstücksfläche: 340 m²' },
        { field: 'rooms', value: 5, evidence: '5 Zimmer' },
        { field: 'guestToilets', value: 1, evidence: '1 Gäste-WC' },
        { field: 'yearBuilt', value: 1987, evidence: 'Baujahr 1987' },
        { field: 'condition', value: 'wellMaintained', evidence: 'gepflegt' },
        { field: 'askingPrice', value: 510000, evidence: 'Kaufpreis: 510.000 €' },
        { field: 'pricePerM2', value: 4343.53, evidence: '4.343,53 €/m²' },
        { field: 'commissionRate', value: 3.57, evidence: '3,57 % Käuferprovision' },
        { field: 'commissionPayer', value: 'buyer', evidence: 'Käuferprovision' },
        { field: 'transactionType', value: 'sale', evidence: 'zu verkaufen' },
      ],
      additionalInformation: [
        { key: 'parcelNumber', value: '5/366', evidence: 'Flurstück 5/366' },
        { key: 'landRegisterDistrict', value: 'Essen', evidence: 'Amtsgericht Essen' },
      ],
    });
    assert.equal(result.documentType, 'expose');
    assert.equal(result.wizardFields.length, 13);
  });

  it('represents absent values as null', () => {
    const result = documentUnderstandingSchema.parse({
      documentType: 'other',
      tags: [],
      summary: 'No usable information.',
      keepInLibrary: false,
      wizardFields: [
        { field: 'livingArea', value: null, evidence: null },
        { field: 'askingPrice', value: null, evidence: null },
      ],
      additionalInformation: [{ key: 'note', value: null, evidence: null }],
    });
    assert.equal(result.wizardFields[0].value, null);
    assert.equal(result.wizardFields[0].evidence, null);
  });
});
