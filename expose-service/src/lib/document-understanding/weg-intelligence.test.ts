import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import type OpenAI from 'openai';

import { OpenAIDocumentUnderstandingProvider } from './openai-provider.js';
import type { DocumentUnderstandingResult } from './types.js';
import { buildPropertyModel, applyWizardFieldsToModel } from '../domain-model.js';
import type { Property } from '../types.js';

/**
 * Phase 9 WEG (Eigentumswohnung) extraction tests. The OpenAI call is mocked:
 * the fake client returns the structured result the provider maps and
 * validates, so no paid API is ever called. The tests prove that the schema,
 * the provider mapping and the WIZARD_FIELD_TARGETS mapping onto the domain
 * model agree for the WEG fields (Hausgeld, Instandhaltungsrücklage,
 * Miteigentumsanteil).
 */

const originalKey = process.env.OPENAI_API_KEY;

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

describe('WEG: Hausgeld extraction', () => {
  beforeEach(() => {
    process.env.OPENAI_API_KEY = 'test-key';
  });
  afterEach(() => {
    process.env.OPENAI_API_KEY = originalKey;
  });

  it('extracts an explicitly stated Hausgeld and normalizes it to EUR', async () => {
    const result = await runExtraction(
      {
        documentType: 'teilungserklaerung',
        tags: ['ownership', 'legal'],
        summary: 'Teilungserklärung mit Hausgeld.',
        keepInLibrary: true,
        wizardFields: [{ field: 'hausgeld', value: 350, evidence: 'Hausgeld: 350,00 €' }],
        additionalInformation: [],
        photo: null,
      },
      {
        documentId: 'doc-weg',
        filename: 'teilungserklaerung.pdf',
        mimeType: 'application/pdf',
        text: 'Hausgeld: 350,00 €',
      },
    );

    const hausgeld = fieldsOf(result).get('hausgeld');
    assert.equal(hausgeld?.value, 350);
    assert.equal(hausgeld?.evidence, 'Hausgeld: 350,00 €');
    const model = modelAfter(result);
    assert.equal(model.weg?.hausgeldEur, 350);
  });

  it('normalizes Wohngeld with German thousands formatting to a plain number', async () => {
    const result = await runExtraction(
      {
        documentType: 'other',
        tags: ['ownership'],
        summary: 'WEG-Unterlage.',
        keepInLibrary: true,
        wizardFields: [
          { field: 'hausgeld', value: 1250, evidence: 'monatliches Wohngeld 1.250,00 EUR' },
        ],
        additionalInformation: [],
        photo: null,
      },
      {
        documentId: 'doc-weg',
        filename: 'hausgeldabrechnung.pdf',
        mimeType: 'application/pdf',
        text: 'monatliches Wohngeld 1.250,00 EUR',
      },
    );

    const model = modelAfter(result);
    assert.equal(model.weg?.hausgeldEur, 1250);
  });

  it('keeps Hausgeld null when the document states no Hausgeld', async () => {
    const result = await runExtraction(
      {
        documentType: 'teilungserklaerung',
        tags: ['ownership', 'legal'],
        summary: 'Teilungserklärung ohne Hausgeld.',
        keepInLibrary: true,
        wizardFields: [{ field: 'hausgeld', value: null, evidence: null }],
        additionalInformation: [],
        photo: null,
      },
      {
        documentId: 'doc-weg',
        filename: 'teilungserklaerung.pdf',
        mimeType: 'application/pdf',
        text: 'Teilungserklärung ohne Hausgeldangabe.',
      },
    );

    const model = modelAfter(result);
    assert.equal(model.weg?.hausgeldEur, undefined, 'no Hausgeld is inferred');
  });

  it('keeps rental amounts and deposit out of the Hausgeld field', async () => {
    const result = await runExtraction(
      {
        documentType: 'expose',
        tags: ['rooms', 'building'],
        summary: 'Vermietete Eigentumswohnung.',
        keepInLibrary: true,
        wizardFields: [
          { field: 'monthlyRent', value: 890, evidence: 'Kaltmiete: 890 €' },
          { field: 'additionalCosts', value: 210, evidence: 'Nebenkosten: 210 €' },
          { field: 'deposit', value: 2670, evidence: 'Kaution: 2.670 €' },
          { field: 'hausgeld', value: 350, evidence: 'Hausgeld: 350 €' },
        ],
        additionalInformation: [],
        photo: null,
      },
      {
        documentId: 'doc-amounts',
        filename: 'expose.pdf',
        mimeType: 'application/pdf',
        text: 'Kaltmiete: 890 €\nNebenkosten: 210 €\nKaution: 2.670 €\nHausgeld: 350 €',
      },
    );

    const model = modelAfter(result);
    assert.equal(model.rental?.monthlyRentEur, 890);
    assert.equal(model.rental?.additionalCostsEur, 210);
    assert.equal(model.rental?.depositEur, 2670);
    assert.equal(model.weg?.hausgeldEur, 350, 'Hausgeld stays in the weg section');
  });
});

describe('WEG: maintenance reserve (Instandhaltungsrücklage)', () => {
  beforeEach(() => {
    process.env.OPENAI_API_KEY = 'test-key';
  });
  afterEach(() => {
    process.env.OPENAI_API_KEY = originalKey;
  });

  it('classifies an explicitly stated Instandhaltungsrücklage', async () => {
    const result = await runExtraction(
      {
        documentType: 'teilungserklaerung',
        tags: ['ownership'],
        summary: 'Teilungserklärung mit Rücklage.',
        keepInLibrary: true,
        wizardFields: [
          {
            field: 'maintenanceReserve',
            value: 85000,
            evidence: 'Instandhaltungsrücklage: 85.000 €',
          },
        ],
        additionalInformation: [],
        photo: null,
      },
      {
        documentId: 'doc-weg',
        filename: 'teilungserklaerung.pdf',
        mimeType: 'application/pdf',
        text: 'Instandhaltungsrücklage: 85.000 €',
      },
    );

    const field = fieldsOf(result).get('maintenanceReserve');
    assert.equal(field?.value, 85000);
    assert.ok(field?.evidence, 'must carry evidence');
    const model = modelAfter(result);
    assert.equal(model.weg?.maintenanceReserveEur, 85000);
  });

  it('keeps a generic Rücklage amount out of the maintenance reserve field', async () => {
    const result = await runExtraction(
      {
        documentType: 'other',
        tags: ['ownership'],
        summary: 'Unklare Rücklage bleibt in additionalInformation.',
        keepInLibrary: true,
        wizardFields: [{ field: 'maintenanceReserve', value: null, evidence: null }],
        additionalInformation: [
          { key: 'wegInformation', value: 'Rücklage: 12.000 €', evidence: 'Rücklage: 12.000 €' },
        ],
        photo: null,
      },
      {
        documentId: 'doc-weg',
        filename: 'weg-budget.pdf',
        mimeType: 'application/pdf',
        text: 'Zuführung zur Rücklage: 12.000 €',
      },
    );

    const model = modelAfter(result);
    assert.equal(model.weg?.maintenanceReserveEur, undefined, 'a Zuführung is never the reserve');
    const info = new Map(result.additionalInformation.map((entry) => [entry.key, entry]));
    assert.ok(info.get('wegInformation'), 'ambiguous WEG information is preserved');
  });
});

describe('WEG: Miteigentumsanteil', () => {
  beforeEach(() => {
    process.env.OPENAI_API_KEY = 'test-key';
  });
  afterEach(() => {
    process.env.OPENAI_API_KEY = originalKey;
  });

  it('preserves the exact normalized co-ownership share', async () => {
    const result = await runExtraction(
      {
        documentType: 'teilungserklaerung',
        tags: ['ownership', 'legal'],
        summary: 'Teilungserklärung mit Miteigentumsanteil.',
        keepInLibrary: true,
        wizardFields: [
          {
            field: 'coOwnershipShare',
            value: '145/10.000',
            evidence: '145/10.000 Miteigentumsanteile',
          },
        ],
        additionalInformation: [],
        photo: null,
      },
      {
        documentId: 'doc-weg',
        filename: 'teilungserklaerung.pdf',
        mimeType: 'application/pdf',
        text: '145/10.000 Miteigentumsanteile',
      },
    );

    const field = fieldsOf(result).get('coOwnershipShare');
    assert.equal(field?.value, '145/10.000', 'the share is preserved verbatim, not converted');
    const model = modelAfter(result);
    assert.equal(model.weg?.coOwnershipShare, '145/10.000');
  });
});

describe('WEG: additional information', () => {
  beforeEach(() => {
    process.env.OPENAI_API_KEY = 'test-key';
  });
  afterEach(() => {
    process.env.OPENAI_API_KEY = originalKey;
  });

  it('keeps WEG administrator and special use rights in additionalInformation', async () => {
    const result = await runExtraction(
      {
        documentType: 'teilungserklaerung',
        tags: ['ownership', 'legal'],
        summary: 'Teilungserklärung.',
        keepInLibrary: true,
        wizardFields: [],
        additionalInformation: [
          {
            key: 'wegAdministrator',
            value: 'Hausverwaltung Mustermann GmbH',
            evidence: 'Verwalter: Hausverwaltung Mustermann GmbH',
          },
          {
            key: 'specialUseRights',
            value: 'Sondernutzungsrecht am Stellplatz Nr. 3',
            evidence: 'Sondernutzungsrecht am Stellplatz Nr. 3',
          },
        ],
        photo: null,
      },
      {
        documentId: 'doc-weg',
        filename: 'teilungserklaerung.pdf',
        mimeType: 'application/pdf',
        text: 'Verwalter: Hausverwaltung Mustermann GmbH\nSondernutzungsrecht am Stellplatz Nr. 3',
      },
    );

    const info = new Map(result.additionalInformation.map((entry) => [entry.key, entry]));
    assert.match(String(info.get('wegAdministrator')?.value), /Mustermann/);
    assert.match(String(info.get('specialUseRights')?.value), /Stellplatz/);
    for (const entry of result.additionalInformation) {
      assert.ok(entry.evidence, `${entry.key} must carry evidence`);
    }
    const byField = fieldsOf(result);
    assert.equal(
      byField.has('coOwnershipShare'),
      false,
      'no legal detail is forced into a wizard field',
    );
  });

  it('every non-null WEG wizard value carries evidence', async () => {
    const result = await runExtraction(
      {
        documentType: 'teilungserklaerung',
        tags: ['ownership'],
        summary: 'Teilungserklärung.',
        keepInLibrary: true,
        wizardFields: [
          { field: 'hausgeld', value: 350, evidence: 'Hausgeld: 350 €' },
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
        additionalInformation: [],
        photo: null,
      },
      {
        documentId: 'doc-weg',
        filename: 'teilungserklaerung.pdf',
        mimeType: 'application/pdf',
        text: 'Hausgeld: 350 €\nInstandhaltungsrücklage: 85.000 €\n145/10.000 Miteigentumsanteile',
      },
    );

    for (const field of result.wizardFields) {
      if (field.value !== null) {
        assert.ok(field.evidence, `${field.field} must carry evidence`);
      }
    }
  });
});
