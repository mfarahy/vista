import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { detectDocumentType, extractFields } from './extract.js';

describe('detectDocumentType', () => {
  it('detects a Grundbuchauszug', () => {
    assert.equal(
      detectDocumentType('Auszug aus dem Grundbuch, Amtsgericht Essen'),
      'grundbuchauszug',
    );
  });

  it('detects a Grundriss', () => {
    assert.equal(detectDocumentType('Grundriss Erdgeschoss, Maßstab 1:100'), 'grundriss');
  });

  it('detects an Energieausweis', () => {
    assert.equal(
      detectDocumentType(
        'Energieausweis, Energieeffizienzklasse C, Endenergiebedarf 80 kWh/(m²·a)',
      ),
      'energieausweis',
    );
  });

  it('detects a Lageplan / Flurkarte', () => {
    assert.equal(detectDocumentType('Flurkarte, Gemarkung Essen, Flur 4'), 'lageplan');
  });

  it('detects a Kaufvertrag', () => {
    assert.equal(detectDocumentType('Notarieller Kaufvertrag vom 12.05.2021'), 'kaufvertrag');
  });

  it('detects an Exposé', () => {
    assert.equal(detectDocumentType('Exposé: Helle 3-Zimmer-Wohnung in Essen'), 'expose');
  });

  it('returns other when nothing matches', () => {
    assert.equal(detectDocumentType('Bitte hier unterschreiben.'), 'other');
  });
});

describe('extractFields', () => {
  it('extracts property numbers with evidence', () => {
    const text =
      'Wohnfläche ca. 124,5 m², Grundstücksfläche 400 m², 5 Zimmer, 2 Schlafzimmer, 2 Badezimmer, Baujahr 1998, 3 Stockwerke.';
    const fields = extractFields(text, 'doc-1');
    const livingArea = fields.find((field) => field.field === 'livingArea');
    assert.ok(livingArea);
    assert.equal(livingArea!.value, 124.5);
    assert.equal(livingArea!.sourceDocumentId, 'doc-1');
    assert.equal(livingArea!.confidence, null);
    assert.match(livingArea!.evidence ?? '', /124,5 m²/);
    assert.equal(fields.find((field) => field.field === 'rooms')!.value, 5);
    assert.equal(fields.find((field) => field.field === 'bedrooms')!.value, 2);
    assert.equal(fields.find((field) => field.field === 'bathrooms')!.value, 2);
    assert.equal(fields.find((field) => field.field === 'yearBuilt')!.value, 1998);
    assert.equal(fields.find((field) => field.field === 'numberOfFloors')!.value, 3);
  });

  it('extracts a German address', () => {
    const text = 'Musterstraße 12, 45127 Essen, Deutschland';
    const fields = extractFields(text, 'doc-2');
    assert.equal(fields.find((field) => field.field === 'street')!.value, 'Musterstraße');
    assert.equal(fields.find((field) => field.field === 'houseNumber')!.value, '12');
    assert.equal(fields.find((field) => field.field === 'postalCode')!.value, '45127');
    assert.equal(fields.find((field) => field.field === 'city')!.value, 'Essen');
  });

  it('extracts energy and land information', () => {
    const text =
      'Energieeffizienzklasse C, Endenergieverbrauch 85 kWh, Heizung Gas, Flurstück 234, Keller vorhanden, Stellplatz.';
    const fields = extractFields(text, 'doc-3');
    assert.equal(fields.find((field) => field.field === 'energyClass')!.value, 'C');
    assert.equal(fields.find((field) => field.field === 'energyConsumption')!.value, 85);
    assert.equal(fields.find((field) => field.field === 'heatingType')!.value, 'Gas');
    assert.equal(fields.find((field) => field.field === 'parcelNumber')!.value, '234');
    assert.equal(fields.find((field) => field.field === 'basement')!.value, true);
    assert.equal(fields.find((field) => field.field === 'parking')!.value, true);
  });

  it('does not invent values for missing information', () => {
    const fields = extractFields('Kein Text mit relevanten Daten.', 'doc-4');
    assert.equal(fields.length, 0);
  });
});
