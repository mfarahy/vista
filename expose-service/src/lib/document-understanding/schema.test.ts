import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  DOCUMENT_TYPES,
  DOCUMENT_TAGS,
  WIZARD_FIELDS,
  PHOTO_TYPES,
  PHOTO_TAGS,
  documentUnderstandingSchema,
} from './schema.js';

describe('document understanding schema', () => {
  it('exposes a controlled document type taxonomy', () => {
    assert.ok(DOCUMENT_TYPES.includes('grundriss'));
    assert.ok(DOCUMENT_TYPES.includes('expose'));
    assert.ok(DOCUMENT_TYPES.includes('energieausweis'));
    assert.ok(DOCUMENT_TYPES.includes('property_photo'));
    assert.ok(DOCUMENT_TYPES.includes('teilungserklaerung'));
    assert.ok(DOCUMENT_TYPES.includes('other'));
  });

  it('exposes a controlled tag taxonomy', () => {
    assert.ok(DOCUMENT_TAGS.includes('floor-plan'));
    assert.ok(DOCUMENT_TAGS.includes('energy'));
    assert.ok(DOCUMENT_TAGS.includes('living-area'));
    assert.ok(DOCUMENT_TAGS.includes('rooms'));
  });

  it('exposes the WEG wizard fields for Eigentumswohnung extraction', () => {
    for (const field of ['hausgeld', 'maintenanceReserve', 'coOwnershipShare']) {
      assert.ok(
        WIZARD_FIELDS.includes(field as (typeof WIZARD_FIELDS)[number]),
        `${field} must exist`,
      );
    }
  });

  it('exposes a controlled photo type and tag taxonomy', () => {
    for (const type of ['exterior', 'living_room', 'kitchen', 'bathroom', 'other']) {
      assert.ok(PHOTO_TYPES.includes(type as (typeof PHOTO_TYPES)[number]), `photo type ${type}`);
    }
    for (const tag of ['fitted-kitchen', 'parquet-floor', 'bathtub', 'large-windows']) {
      assert.ok(PHOTO_TAGS.includes(tag as (typeof PHOTO_TAGS)[number]), `photo tag ${tag}`);
    }
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

  it('accepts photo metadata for property photos', () => {
    const result = documentUnderstandingSchema.parse({
      documentType: 'property_photo',
      tags: ['property-photo', 'interior', 'kitchen'],
      summary: 'Küchenfoto.',
      keepInLibrary: true,
      wizardFields: [],
      additionalInformation: [],
      photo: {
        photoType: 'kitchen',
        photoTags: [
          {
            tag: 'fitted-kitchen',
            evidence: 'Einbauküche mit Hochschränken und Arbeitsplatte sichtbar.',
          },
          { tag: 'tiles', evidence: 'Fliesen an der Arbeitsfläche sichtbar.' },
        ],
        visualDescription:
          'Heller Wohnbereich mit Parkettboden, großen Fenstern und Zugang zu einem Balkon.',
        coverSuitability: 'high',
        coverSuitabilityReason: 'Zentraler Bildausschnitt, gut belichtet.',
      },
    });
    assert.equal(result.photo?.photoType, 'kitchen');
    assert.equal(result.photo?.photoTags.length, 2);
    assert.equal(result.photo?.photoTags[0].tag, 'fitted-kitchen');
    assert.equal(result.photo?.coverSuitability, 'high');
  });

  it('keeps photo metadata null for non-photo documents', () => {
    const result = documentUnderstandingSchema.parse({
      documentType: 'teilungserklaerung',
      tags: ['ownership', 'legal'],
      summary: 'Teilungserklärung.',
      keepInLibrary: true,
      wizardFields: [
        {
          field: 'coOwnershipShare',
          value: '145/10.000',
          evidence: '145/10.000 Miteigentumsanteile',
        },
      ],
      additionalInformation: [],
    });
    assert.equal(result.photo, null);
  });

  it('rejects photo tags outside the controlled set', () => {
    assert.throws(() =>
      documentUnderstandingSchema.parse({
        documentType: 'property_photo',
        tags: [],
        summary: '',
        keepInLibrary: true,
        wizardFields: [],
        additionalInformation: [],
        photo: {
          photoType: 'kitchen',
          photoTags: [{ tag: 'swimming-pool', evidence: 'Pool sichtbar.' }],
        },
      }),
    );
  });

  it('rejects a photo type outside the controlled set', () => {
    assert.throws(() =>
      documentUnderstandingSchema.parse({
        documentType: 'property_photo',
        tags: [],
        summary: '',
        keepInLibrary: true,
        wizardFields: [],
        additionalInformation: [],
        photo: { photoType: 'attic_room', photoTags: [] },
      }),
    );
  });

  it('accepts a WEG extraction result with the new wizard fields', () => {
    const result = documentUnderstandingSchema.parse({
      documentType: 'teilungserklaerung',
      tags: ['ownership', 'legal'],
      summary: 'Teilungserklärung mit WEG-Angaben.',
      keepInLibrary: true,
      wizardFields: [
        { field: 'hausgeld', value: 350, evidence: 'Hausgeld: 350,00 €' },
        {
          field: 'maintenanceReserve',
          value: 85000,
          evidence: 'Instandhaltungsrücklage: 85.000 €',
        },
        {
          field: 'coOwnershipShare',
          value: '145/10.000',
          evidence: '145/10.000 Miteigentumsanteile',
        },
      ],
      additionalInformation: [
        {
          key: 'wegAdministrator',
          value: 'Hausverwaltung Mustermann GmbH',
          evidence: 'Verwalter: Hausverwaltung Mustermann GmbH',
        },
      ],
    });
    assert.equal(result.wizardFields.length, 3);
    assert.equal(result.wizardFields[0].value, 350);
    assert.equal(result.additionalInformation[0].key, 'wegAdministrator');
  });
});
