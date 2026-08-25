import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import type OpenAI from 'openai';

import { OpenAIDocumentUnderstandingProvider } from './openai-provider.js';
import { documentWizardCandidates, computePrefillDefaults } from './prefill.js';

const originalKey = process.env.OPENAI_API_KEY;

/**
 * Representative OCR text of a German Grundbuchauszug. It contains many
 * unrelated numbers, street references, page numbers, register numbers and
 * monetary amounts. The AI (not regex) must understand the document structure
 * and return the property's actual address and parcel number.
 */
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
`;

function makeFakeClient(parsed: unknown): OpenAI {
  return {
    chat: {
      completions: {
        parse: async () => ({ choices: [{ message: { parsed } }] }),
      },
    },
  } as unknown as OpenAI;
}

function runExtraction(parsed: unknown) {
  const provider = new OpenAIDocumentUnderstandingProvider(makeFakeClient(parsed));
  return provider.analyzeDocument({
    documentId: 'doc-grundbuch',
    filename: 'grundbuchauszug.pdf',
    mimeType: 'application/pdf',
    text: GRUNDBUCH_OCR,
  });
}

describe('Grundbuchauszug regression (AI is the source of truth)', () => {
  beforeEach(() => {
    process.env.OPENAI_API_KEY = 'test-key';
  });
  afterEach(() => {
    process.env.OPENAI_API_KEY = originalKey;
  });

  it('represents the actual address and parcel number, not unrelated numbers', async () => {
    const result = await runExtraction({
      documentType: 'grundbuchauszug',
      tags: ['address', 'property-identification', 'ownership', 'legal', 'land'],
      summary: 'Grundbuchauszug for the property at Furkastraße 88 A.',
      keepInLibrary: true,
      wizardFields: [
        { field: 'street', value: 'Furkastraße', evidence: 'Furkastraße 88 A' },
        { field: 'houseNumber', value: '88 A', evidence: 'Furkastraße 88 A' },
        { field: 'parcelNumber', value: '5/366', evidence: 'Flurstück 5/366' },
      ],
      additionalInformation: [
        {
          key: 'registeredOwners',
          value: 'Kurt Bresching und Jutta Bresching, je zur Hälfte',
          evidence: 'Eingetragen: Kurt Bresching und Jutta Bresching, je zur Hälfte',
        },
        { key: 'landRegisterSheet', value: 'Blatt 5081', evidence: 'Blatt 5081' },
      ],
    });

    const byField = new Map(result.wizardFields.map((f) => [f.field, f]));
    assert.equal(result.documentType, 'grundbuchauszug');
    assert.equal(byField.get('street')?.value, 'Furkastraße');
    assert.equal(byField.get('houseNumber')?.value, '88 A');
    assert.equal(byField.get('parcelNumber')?.value, '5/366');
    assert.equal(byField.get('street')?.evidence, 'Furkastraße 88 A');
    assert.equal(byField.get('parcelNumber')?.evidence, 'Flurstück 5/366');

    // Ownership data that has no wizard field must be preserved, not dropped.
    const owners = result.additionalInformation.find((info) => info.key === 'registeredOwners');
    assert.ok(owners);
    assert.equal(owners.value, 'Kurt Bresching und Jutta Bresching, je zur Hälfte');
  });

  it('does not manufacture wizard fields for unrelated figures', async () => {
    const result = await runExtraction({
      documentType: 'grundbuchauszug',
      tags: ['address'],
      summary: 'Grundbuchauszug.',
      keepInLibrary: true,
      // The model correctly ignores "Straße 149", "Blatt 5081", page numbers,
      // register numbers and the monetary amounts.
      wizardFields: [],
      additionalInformation: [
        { key: 'landRegisterSheet', value: 'Blatt 5081', evidence: 'Blatt 5081' },
      ],
    });

    assert.equal(result.wizardFields.length, 0);
    const sheet = result.additionalInformation.find((info) => info.key === 'landRegisterSheet');
    assert.equal(sheet?.value, 'Blatt 5081');
  });

  it('keeps evidence for every extracted wizard value', async () => {
    const result = await runExtraction({
      documentType: 'grundbuchauszug',
      tags: [],
      summary: '',
      keepInLibrary: true,
      wizardFields: [
        { field: 'street', value: 'Furkastraße', evidence: 'Furkastraße 88 A' },
        { field: 'houseNumber', value: '88 A', evidence: 'Furkastraße 88 A' },
        { field: 'parcelNumber', value: '5/366', evidence: 'Flurstück 5/366' },
      ],
      additionalInformation: [],
    });

    for (const field of result.wizardFields) {
      assert.ok(field.value !== null, `${field.field} must have a value`);
      assert.ok(field.evidence, `${field.field} must carry evidence`);
    }
  });

  it('produces a correct wizard default and preserves the source document', async () => {
    const understanding = await runExtraction({
      documentType: 'grundbuchauszug',
      tags: [],
      summary: '',
      keepInLibrary: true,
      wizardFields: [
        { field: 'street', value: 'Furkastraße', evidence: 'Furkastraße 88 A' },
        { field: 'houseNumber', value: '88 A', evidence: 'Furkastraße 88 A' },
        { field: 'parcelNumber', value: '5/366', evidence: 'Flurstück 5/366' },
      ],
      additionalInformation: [],
    });

    const document: Parameters<typeof documentWizardCandidates>[0] = {
      id: 'doc-grundbuch',
      understandingResult: understanding,
    };
    const { defaults, valuesByField } = computePrefillDefaults([document], {});
    assert.equal(defaults.street, 'Furkastraße');
    assert.equal(defaults.houseNumber, '88 A');
    assert.equal(defaults.parcelNumber, '5/366');
    assert.equal(valuesByField.street[0].sourceDocumentId, 'doc-grundbuch');
    assert.equal(valuesByField.parcelNumber[0].sourceDocumentId, 'doc-grundbuch');
  });

  it('never overwrites a user-entered value with an AI default', async () => {
    const understanding = await runExtraction({
      documentType: 'grundbuchauszug',
      tags: [],
      summary: '',
      keepInLibrary: true,
      wizardFields: [
        { field: 'street', value: 'Furkastraße', evidence: 'Furkastraße 88 A' },
      ],
      additionalInformation: [],
    });

    const document: Parameters<typeof documentWizardCandidates>[0] = {
      id: 'doc-grundbuch',
      understandingResult: understanding,
    };
    const { defaults } = computePrefillDefaults([document], { street: 'Benutzerstraße' });
    assert.equal(defaults.street, undefined, 'user value must win over the AI default');
  });
});
