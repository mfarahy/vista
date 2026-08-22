import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import type OpenAI from 'openai';

import { OpenAIDocumentUnderstandingProvider } from './openai-provider.js';
import type { DocumentUnderstandingResult } from './types.js';
import { buildPropertyModel, applyWizardFieldsToModel } from '../domain-model.js';
import type { Property } from '../types.js';

/**
 * Phase 2 extraction tests. The OpenAI call is mocked: the fake client returns
 * the structured result the provider maps and validates, so no paid API is
 * ever called. The tests prove that the expanded schema, the provider mapping
 * and the WIZARD_FIELD_TARGETS mapping onto the Property model agree.
 */

const originalKey = process.env.OPENAI_API_KEY;

const EXPOSE_OCR = `Exposé
Reiheneckhaus in Essen-Kray
Wohnfläche: ca. 125 m²
Grundstücksfläche: ca. 340 m²
5 Zimmer, 2 Bäder, 1 Gäste-WC
Baujahr 1987, gepflegt
Balkon, Terrasse, Garten, Garage
Kaufpreis: 510.000 €
Kaufpreis / m²: 4.343,53 €
3,57 % Käuferprovision inkl. MwSt.
zu verkaufen`;

const GRUNDBUCH_OCR = `Auszug aus dem Grundbuch von Gemarkung Furkastraße
Amtsgericht Essen
Bestandsverzeichnis
Ifd. Nr. 1
Furkastraße 88 A
Flurstück 5/366
Flur 4
Gemarkung 0456
Blatt 5081
Wirtschaftsart: Gebäude- und Freifläche
Größe: 458 m²
Verkehrswert lt. Gutachten: 59.500,00 DM
Belastungen: 32.100,00 DM
Straße 149 (Verweis auf benachbartes Flurstück)
Eingetragen: Kurt Bresching und Jutta Bresching, je zur Hälfte
Abteilung III: Grundschuld zugunsten Sparkasse Essen`;

const ENERGIEAUSWEIS_OCR = `Energieausweis
Bedarfsausweis
Ausstellungsdatum: 08.02.2026
Gültig bis: 07.02.2036
Energieeffizienzklasse: C
Endenergiebedarf: 85 kWh/(m²a)
Primärenergieträger: Erdgas
Gas-Brennwertheizung, Warmwasser enthalten`;

const GRUNDRISS_OCR = `Grundriss Erdgeschoss und Obergeschoss
3 Zimmer, 1 Schlafzimmer, 1 Bad, 1 Gäste-WC
Wohnfläche: 92 m²
Balkon nach Südwesten`;

const MIETEXPOSE_OCR = `Vermietung
3-Zimmer-Wohnung, vermietet, möbliert
Kaltmiete: 1.450 €
Nebenkosten: 220 €
verfügbar ab 01.10.2026`;

const INVESTMENT_OCR = `Anlageobjekt
Eigentumswohnung, vermietet
Kaltmiete: 950 €
Bruttorendite (soll): 4,5 %
Bruttorendite (ist): 5,4 %`;

function makeFakeClient(parsed: unknown): OpenAI {
  return {
    chat: {
      completions: {
        parse: async () => ({ choices: [{ message: { parsed } }] }),
      },
    },
  } as unknown as OpenAI;
}

function runExtraction(
  parsed: unknown,
  input: Parameters<OpenAIDocumentUnderstandingProvider['analyzeDocument']>[0],
) {
  const provider = new OpenAIDocumentUnderstandingProvider(makeFakeClient(parsed));
  return provider.analyzeDocument(input);
}

function propertyWith(): Property {
  return {
    id: 'prop-1',
    propertyType: 'apartment',
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
    images: [],
    roomsData: [],
  };
}

function fieldsOf(result: DocumentUnderstandingResult) {
  return new Map(result.wizardFields.map((field) => [field.field, field]));
}

function modelAfter(result: DocumentUnderstandingResult) {
  return applyWizardFieldsToModel(buildPropertyModel(propertyWith()), result.wizardFields);
}

describe('Grundbuchauszug: land-register extraction', () => {
  beforeEach(() => {
    process.env.OPENAI_API_KEY = 'test-key';
  });
  afterEach(() => {
    process.env.OPENAI_API_KEY = originalKey;
  });

  it('extracts the address, parcel number and land-register references', async () => {
    const result = await runExtraction(
      {
        documentType: 'grundbuchauszug',
        tags: ['address', 'property-identification', 'ownership', 'legal'],
        summary: 'Grundbuchauszug for Furkastraße 88 A.',
        keepInLibrary: true,
        wizardFields: [
          { field: 'street', value: 'Furkastraße', evidence: 'Furkastraße 88 A' },
          { field: 'houseNumber', value: '88 A', evidence: 'Furkastraße 88 A' },
          { field: 'parcelNumber', value: '5/366', evidence: 'Flurstück 5/366' },
        ],
        additionalInformation: [
          { key: 'landRegisterDistrict', value: 'Essen', evidence: 'Amtsgericht Essen' },
          { key: 'landRegisterSheet', value: 'Blatt 5081', evidence: 'Blatt 5081' },
          { key: 'parcelNumber', value: '5/366', evidence: 'Flurstück 5/366' },
          {
            key: 'registeredOwners',
            value: 'Kurt Bresching und Jutta Bresching, je zur Hälfte',
            evidence: 'Eingetragen: Kurt Bresching und Jutta Bresching, je zur Hälfte',
          },
          {
            key: 'registeredLandCharges',
            value: 'Grundschuld zugunsten Sparkasse Essen',
            evidence: 'Abteilung III: Grundschuld zugunsten Sparkasse Essen',
          },
        ],
      },
      {
        documentId: 'doc-grundbuch',
        filename: 'grundbuchauszug.pdf',
        mimeType: 'application/pdf',
        text: GRUNDBUCH_OCR,
      },
    );

    const byField = fieldsOf(result);
    assert.equal(byField.get('street')?.value, 'Furkastraße');
    assert.equal(byField.get('houseNumber')?.value, '88 A');
    assert.equal(byField.get('parcelNumber')?.value, '5/366');

    const info = new Map(result.additionalInformation.map((entry) => [entry.key, entry]));
    assert.equal(info.get('landRegisterDistrict')?.value, 'Essen');
    assert.equal(info.get('landRegisterSheet')?.value, 'Blatt 5081');
    assert.match(String(info.get('registeredOwners')?.value), /Kurt Bresching/);
    assert.match(String(info.get('registeredLandCharges')?.value), /Sparkasse Essen/);
    for (const entry of result.additionalInformation) {
      assert.ok(entry.evidence, `${entry.key} must carry evidence`);
    }

    // Land-register references stay in additionalInformation, never forced
    // into area/energy/condition wizard fields.
    assert.equal(byField.has('livingArea'), false);
    assert.equal(byField.has('condition'), false);
    assert.equal(byField.has('energyClass'), false);
  });

  it('never leaks unrelated figures into address fields', async () => {
    const result = await runExtraction(
      {
        documentType: 'grundbuchauszug',
        tags: ['address'],
        summary: 'Grundbuchauszug.',
        keepInLibrary: true,
        wizardFields: [
          { field: 'street', value: 'Furkastraße', evidence: 'Furkastraße 88 A' },
          { field: 'houseNumber', value: '88 A', evidence: 'Furkastraße 88 A' },
        ],
        additionalInformation: [
          { key: 'landRegisterSheet', value: 'Blatt 5081', evidence: 'Blatt 5081' },
        ],
      },
      {
        documentId: 'doc-grundbuch',
        filename: 'grundbuchauszug.pdf',
        mimeType: 'application/pdf',
        text: GRUNDBUCH_OCR,
      },
    );

    const byField = fieldsOf(result);
    assert.equal(byField.get('street')?.value, 'Furkastraße');
    assert.equal(byField.get('houseNumber')?.value, '88 A');
    // "Straße 149", "Blatt 5081", "59.500,00 DM" and "32.100,00 DM" must never
    // leak into street/postalCode/price fields.
    assert.equal(byField.has('postalCode'), false);
    assert.equal(byField.has('askingPrice'), false);

    const model = modelAfter(result);
    assert.equal(model.address.street, 'Furkastraße');
    assert.equal(model.address.houseNumber, '88 A');
  });
});

describe('Exposé: factual extraction without marketing', () => {
  beforeEach(() => {
    process.env.OPENAI_API_KEY = 'test-key';
  });
  afterEach(() => {
    process.env.OPENAI_API_KEY = originalKey;
  });

  it('extracts clearly stated factual fields onto the Property model', async () => {
    const result = await runExtraction(
      {
        documentType: 'expose',
        tags: ['address', 'rooms', 'living-area', 'building', 'energy'],
        summary: 'Exposé for a Reiheneckhaus in Essen-Kray.',
        keepInLibrary: true,
        wizardFields: [
          { field: 'propertyType', value: 'house', evidence: 'Reiheneckhaus' },
          { field: 'propertySubtype', value: 'endTerraceHouse', evidence: 'Reiheneckhaus' },
          { field: 'livingArea', value: 125, evidence: 'Wohnfläche: ca. 125 m²' },
          { field: 'plotArea', value: 340, evidence: 'Grundstücksfläche: ca. 340 m²' },
          { field: 'rooms', value: 5, evidence: '5 Zimmer' },
          { field: 'bathrooms', value: 2, evidence: '2 Bäder' },
          { field: 'guestToilets', value: 1, evidence: '1 Gäste-WC' },
          { field: 'yearBuilt', value: 1987, evidence: 'Baujahr 1987' },
          { field: 'condition', value: 'wellMaintained', evidence: 'gepflegt' },
          { field: 'balcony', value: true, evidence: 'Balkon' },
          { field: 'terrace', value: true, evidence: 'Terrasse' },
          { field: 'garden', value: true, evidence: 'Garten' },
          { field: 'garage', value: true, evidence: 'Garage' },
          { field: 'askingPrice', value: 510000, evidence: 'Kaufpreis: 510.000 €' },
          { field: 'pricePerM2', value: 4343.53, evidence: 'Kaufpreis / m²: 4.343,53 €' },
          { field: 'commissionRate', value: 3.57, evidence: '3,57 % Käuferprovision inkl. MwSt.' },
          { field: 'commissionPayer', value: 'buyer', evidence: 'Käuferprovision' },
          { field: 'transactionType', value: 'sale', evidence: 'zu verkaufen' },
        ],
        additionalInformation: [],
      },
      {
        documentId: 'doc-expose',
        filename: 'expose.pdf',
        mimeType: 'application/pdf',
        text: EXPOSE_OCR,
      },
    );

    const model = modelAfter(result);
    assert.equal(model.classification.propertyType, 'house');
    assert.equal(model.classification.propertySubtype, 'endTerraceHouse');
    assert.equal(model.areas.livingAreaM2, 125);
    assert.equal(model.areas.plotAreaM2, 340);
    assert.equal(model.rooms.total, 5);
    assert.equal(model.rooms.bathrooms, 2);
    assert.equal(model.rooms.guestToilets, 1);
    assert.equal(model.building.yearBuilt, 1987);
    assert.equal(model.building.condition, 'wellMaintained');
    assert.equal(model.outdoor.balcony, true);
    assert.equal(model.outdoor.terrace, true);
    assert.equal(model.outdoor.garden, true);
    assert.equal(model.features.parking?.garage, true);
    assert.equal(model.financial.askingPriceEur, 510000);
    assert.equal(model.financial.pricePerM2Eur, 4343.53);
    assert.equal(model.financial.commission?.ratePercent, 3.57);
    assert.equal(model.financial.commission?.payer, 'buyer');
    assert.equal(model.transaction.type, 'sale');

    for (const field of result.wizardFields) {
      assert.ok(field.evidence, `${field.field} must carry evidence`);
    }
  });

  it('does not turn marketing language into factual fields', async () => {
    const result = await runExtraction(
      {
        documentType: 'expose',
        tags: ['address', 'rooms'],
        summary: 'Exposé with marketing copy and two factual fields.',
        keepInLibrary: true,
        // "Traumhafte Lage", "familienfreundlich" and "wunderschön" produce no
        // wizard fields; only clearly supported facts are extracted.
        wizardFields: [
          { field: 'propertyType', value: 'house', evidence: 'Einfamilienhaus' },
          { field: 'rooms', value: 6, evidence: '6 Zimmer' },
        ],
        additionalInformation: [],
      },
      {
        documentId: 'doc-marketing',
        filename: 'traumhaus.pdf',
        mimeType: 'application/pdf',
        text:
          'Traumhafte Lage, familienfreundlich und wunderschön.\n' + 'Einfamilienhaus, 6 Zimmer',
      },
    );

    const byField = fieldsOf(result);
    assert.equal(byField.has('quietLocation'), false);
    assert.equal(byField.has('familyFriendly'), false);
    assert.equal(byField.has('beautiful'), false);
    assert.deepEqual(
      [...byField.keys()].sort(),
      ['propertyType', 'rooms'],
      'only factual fields are extracted',
    );
  });
});

describe('Energieausweis: energy extraction', () => {
  beforeEach(() => {
    process.env.OPENAI_API_KEY = 'test-key';
  });
  afterEach(() => {
    process.env.OPENAI_API_KEY = originalKey;
  });

  it('extracts certificate and consumption data with demand/consumption kept separate', async () => {
    const result = await runExtraction(
      {
        documentType: 'energieausweis',
        tags: ['energy', 'heating'],
        summary: 'Bedarfsausweis with efficiency class C.',
        keepInLibrary: true,
        wizardFields: [
          { field: 'certificateType', value: 'needs_based', evidence: 'Bedarfsausweis' },
          {
            field: 'certificateDate',
            value: '2026-02-08',
            evidence: 'Ausstellungsdatum: 08.02.2026',
          },
          {
            field: 'certificateValidUntil',
            value: '2036-02-07',
            evidence: 'Gültig bis: 07.02.2036',
          },
          { field: 'energyClass', value: 'C', evidence: 'Energieeffizienzklasse: C' },
          { field: 'energyDemand', value: 85, evidence: 'Endenergiebedarf: 85 kWh/(m²a)' },
          { field: 'primaryEnergySource', value: 'gas', evidence: 'Primärenergieträger: Erdgas' },
          { field: 'heatingType', value: 'Gas-Brennwertheizung', evidence: 'Gas-Brennwertheizung' },
          { field: 'hotWaterIncluded', value: true, evidence: 'Warmwasser enthalten' },
        ],
        additionalInformation: [],
      },
      {
        documentId: 'doc-energie',
        filename: 'energieausweis.pdf',
        mimeType: 'application/pdf',
        text: ENERGIEAUSWEIS_OCR,
      },
    );

    const model = modelAfter(result);
    assert.equal(model.energy?.certificateType, 'needs_based');
    assert.equal(model.energy?.certificateDate, '2026-02-08');
    assert.equal(model.energy?.certificateValidUntil, '2036-02-07');
    assert.equal(model.energy?.efficiencyClass, 'C');
    assert.equal(model.energy?.demandKwhPerM2A, 85);
    assert.equal(
      model.energy?.consumptionKwhPerM2A,
      undefined,
      'consumption stays empty for a Bedarfsausweis',
    );
    assert.equal(model.energy?.primaryEnergySource, 'gas');
    assert.equal(model.energy?.heatingType, 'Gas-Brennwertheizung');
    assert.equal(model.energy?.hotWaterIncluded, true);
  });

  it('maps a consumption-based certificate to consumption and keeps demand empty', async () => {
    const result = await runExtraction(
      {
        documentType: 'energieausweis',
        tags: ['energy'],
        summary: 'Verbrauchsausweis.',
        keepInLibrary: true,
        wizardFields: [
          { field: 'certificateType', value: 'consumption_based', evidence: 'Verbrauchsausweis' },
          {
            field: 'energyConsumption',
            value: 112,
            evidence: 'Endenergieverbrauch: 112 kWh/(m²a)',
          },
        ],
        additionalInformation: [],
      },
      {
        documentId: 'doc-energie',
        filename: 'verbrauchsausweis.pdf',
        mimeType: 'application/pdf',
        text: 'Verbrauchsausweis, Endenergieverbrauch: 112 kWh/(m²a)',
      },
    );

    const model = modelAfter(result);
    assert.equal(model.energy?.consumptionKwhPerM2A, 112);
    assert.equal(model.energy?.demandKwhPerM2A, undefined);
  });
});

describe('Grundriss: floor plan extraction', () => {
  beforeEach(() => {
    process.env.OPENAI_API_KEY = 'test-key';
  });
  afterEach(() => {
    process.env.OPENAI_API_KEY = originalKey;
  });

  it('extracts room and area information', async () => {
    const result = await runExtraction(
      {
        documentType: 'grundriss',
        tags: ['floor-plan', 'rooms', 'living-area'],
        summary: 'Floor plan of the property.',
        keepInLibrary: true,
        wizardFields: [
          { field: 'livingArea', value: 92, evidence: 'Wohnfläche: 92 m²' },
          { field: 'rooms', value: 3, evidence: '3 Zimmer' },
          { field: 'bedrooms', value: 1, evidence: '1 Schlafzimmer' },
          { field: 'bathrooms', value: 1, evidence: '1 Bad' },
          { field: 'guestToilets', value: 1, evidence: '1 Gäste-WC' },
          { field: 'balcony', value: true, evidence: 'Balkon nach Südwesten' },
          { field: 'orientation', value: 'Südwesten', evidence: 'Balkon nach Südwesten' },
        ],
        additionalInformation: [],
      },
      {
        documentId: 'doc-grundriss',
        filename: 'grundriss.pdf',
        mimeType: 'application/pdf',
        text: GRUNDRISS_OCR,
      },
    );

    const model = modelAfter(result);
    assert.equal(model.areas.livingAreaM2, 92);
    assert.equal(model.rooms.total, 3);
    assert.equal(model.rooms.bedrooms, 1);
    assert.equal(model.rooms.bathrooms, 1);
    assert.equal(model.rooms.guestToilets, 1);
    assert.equal(model.outdoor.balcony, true);
    assert.equal(model.outdoor.orientation, 'Südwesten');
  });
});

describe('Rental and investment extraction', () => {
  beforeEach(() => {
    process.env.OPENAI_API_KEY = 'test-key';
  });
  afterEach(() => {
    process.env.OPENAI_API_KEY = originalKey;
  });

  it('extracts rental information only when explicitly stated', async () => {
    const result = await runExtraction(
      {
        documentType: 'expose',
        tags: ['rooms', 'building'],
        summary: 'Rental listing for a furnished, rented apartment.',
        keepInLibrary: true,
        wizardFields: [
          { field: 'isRented', value: true, evidence: 'vermietet' },
          { field: 'furnished', value: true, evidence: 'möbliert' },
          { field: 'monthlyRent', value: 1450, evidence: 'Kaltmiete: 1.450 €' },
          { field: 'additionalCosts', value: 220, evidence: 'Nebenkosten: 220 €' },
          { field: 'availableFrom', value: '2026-10-01', evidence: 'verfügbar ab 01.10.2026' },
          { field: 'transactionType', value: 'rent', evidence: 'Vermietung' },
        ],
        additionalInformation: [],
      },
      {
        documentId: 'doc-miete',
        filename: 'mietexpose.pdf',
        mimeType: 'application/pdf',
        text: MIETEXPOSE_OCR,
      },
    );

    const model = modelAfter(result);
    assert.equal(model.rental?.isRented, true);
    assert.equal(model.rental?.furnished, true);
    assert.equal(model.rental?.monthlyRentEur, 1450);
    assert.equal(model.rental?.additionalCostsEur, 220);
    assert.equal(model.rental?.availableFrom, '2026-10-01');
    assert.equal(model.transaction.type, 'rent');
  });

  it('extracts investment yield only when explicitly stated', async () => {
    const result = await runExtraction(
      {
        documentType: 'expose',
        tags: ['rooms', 'living-area'],
        summary: 'Investment apartment with stated yields.',
        keepInLibrary: true,
        wizardFields: [
          { field: 'grossYieldTarget', value: 4.5, evidence: 'Bruttorendite (soll): 4,5 %' },
          { field: 'grossYieldActual', value: 5.4, evidence: 'Bruttorendite (ist): 5,4 %' },
          { field: 'monthlyRent', value: 950, evidence: 'Kaltmiete: 950 €' },
          { field: 'isRented', value: true, evidence: 'vermietet' },
        ],
        additionalInformation: [],
      },
      {
        documentId: 'doc-invest',
        filename: 'anlageobjekt.pdf',
        mimeType: 'application/pdf',
        text: INVESTMENT_OCR,
      },
    );

    const model = modelAfter(result);
    assert.equal(model.investment?.grossYieldTargetPercent, 4.5);
    assert.equal(model.investment?.grossYieldActualPercent, 5.4);
    assert.equal(model.rental?.monthlyRentEur, 950);
    assert.equal(model.rental?.isRented, true);
  });
});

describe('No hallucination', () => {
  beforeEach(() => {
    process.env.OPENAI_API_KEY = 'test-key';
  });
  afterEach(() => {
    process.env.OPENAI_API_KEY = originalKey;
  });

  it('keeps every absent value as null instead of fabricating a value', async () => {
    const result = await runExtraction(
      {
        documentType: 'other',
        tags: [],
        summary: 'Unrelated document with no property information.',
        keepInLibrary: false,
        wizardFields: [
          { field: 'livingArea', value: null, evidence: null },
          { field: 'askingPrice', value: null, evidence: null },
          { field: 'rooms', value: null, evidence: null },
        ],
        additionalInformation: [],
      },
      {
        documentId: 'doc-empty',
        filename: 'notizen.pdf',
        mimeType: 'application/pdf',
        text: 'Einkaufsliste\nBrot\nMilch',
      },
    );

    const model = modelAfter(result);
    assert.equal(model.areas.livingAreaM2, undefined);
    assert.equal(model.financial.askingPriceEur, undefined);
    assert.equal(model.rooms.total, undefined);
  });

  it('keeps property photos from producing fabricated measurements', async () => {
    const result = await runExtraction(
      {
        documentType: 'property_photo',
        tags: ['property-photo', 'interior', 'kitchen'],
        summary: 'Interior photo of a modern kitchen.',
        keepInLibrary: true,
        wizardFields: [],
        additionalInformation: [
          {
            key: 'visibleFeature',
            value: 'kitchen',
            evidence: 'A fitted kitchen with cabinets is visible.',
          },
        ],
      },
      {
        documentId: 'doc-photo',
        filename: 'kueche.jpg',
        mimeType: 'image/jpeg',
        text: '',
        image: { content: Buffer.from('fake-image-bytes'), mimeType: 'image/jpeg' },
      },
    );

    assert.equal(result.wizardFields.length, 0, 'no measurements from photographs');
    const model = modelAfter(result);
    assert.equal(model.areas.livingAreaM2, undefined);
    assert.equal(model.rooms.total, undefined);
    assert.equal(model.building.yearBuilt, undefined);
  });
});
