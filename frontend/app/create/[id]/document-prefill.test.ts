import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type {
  DocumentRecord,
  UnderstandingAdditionalInfo,
  UnderstandingWizardField,
} from './types';
import {
  collectAdditionalInformation,
  collectWizardFieldCandidates,
  computeWizardPrefills,
  formatExtractedValue,
  groupAdditionalByKey,
  groupCandidatesByField,
  pickDefault,
  wizardFieldLabel,
} from './document-prefill';

function recordWithUnderstanding(
  id: string,
  filename: string,
  understanding: DocumentRecord['understandingResult'],
): DocumentRecord {
  return {
    id,
    propertyId: 'prop-1',
    filename,
    mimeType: 'application/pdf',
    size: 100,
    url: `/uploads/${filename}`,
    status: 'completed',
    documentType: null,
    error: null,
    analysisResult: null,
    tags: [],
    understandingResult: understanding,
    understandingError: null,
    createdAt: '',
    updatedAt: '',
  };
}

function understanding(
  wizardFields: UnderstandingWizardField[],
  additionalInformation: UnderstandingAdditionalInfo[] = [],
) {
  return {
    documentType: 'expose' as const,
    tags: [],
    summary: '',
    keepInLibrary: true,
    wizardFields,
    additionalInformation,
  };
}

describe('collectWizardFieldCandidates', () => {
  it('returns AI wizard fields with source document and evidence', () => {
    const records = [
      recordWithUnderstanding(
        'doc-1',
        'grundriss.pdf',
        understanding([
          { field: 'livingArea', value: 124.5, evidence: 'Wohnfläche: 124,5 m²' },
          { field: 'rooms', value: 5, evidence: '5 Zimmer' },
        ]),
      ),
    ];
    const candidates = collectWizardFieldCandidates(records);
    assert.equal(candidates.length, 2);
    assert.equal(candidates[0].value, 124.5);
    assert.equal(candidates[0].sourceDocumentId, 'doc-1');
    assert.equal(candidates[0].sourceFilename, 'grundriss.pdf');
    assert.equal(candidates[0].evidence, 'Wohnfläche: 124,5 m²');
  });

  it('ignores non-completed documents and empty values', () => {
    const records = [
      {
        ...recordWithUnderstanding(
          'doc-1',
          'a.pdf',
          understanding([{ field: 'livingArea', value: null, evidence: null }]),
        ),
        status: 'failed' as const,
      },
      recordWithUnderstanding(
        'doc-2',
        'b.pdf',
        understanding([{ field: 'livingArea', value: null, evidence: null }]),
      ),
    ];
    assert.deepEqual(collectWizardFieldCandidates(records), []);
  });
});

describe('groupCandidatesByField / pickDefault', () => {
  it('preserves every source and prefers the value with evidence', () => {
    const candidates = [
      {
        field: 'livingArea',
        value: 999,
        sourceDocumentId: 'a',
        sourceFilename: 'a.pdf',
        evidence: null,
      },
      {
        field: 'livingArea',
        value: 125,
        sourceDocumentId: 'b',
        sourceFilename: 'b.pdf',
        evidence: '125 m²',
      },
    ];
    const grouped = groupCandidatesByField(candidates);
    assert.equal(grouped.livingArea.length, 2);
    assert.equal(pickDefault(grouped.livingArea)?.value, 125);
  });
});

describe('computeWizardPrefills', () => {
  it('fills empty wizard fields from AI values as defaults', () => {
    const records = [
      recordWithUnderstanding(
        'doc-1',
        'wohnflaechenberechnung.pdf',
        understanding([
          { field: 'livingArea', value: 107, evidence: 'Wohnfläche: 107 m²' },
          { field: 'guestToilets', value: 1, evidence: '1 Gäste-WC' },
        ]),
      ),
    ];
    const { defaults } = computeWizardPrefills(records, {});
    assert.equal(defaults.livingArea, 107);
    assert.equal(defaults.guestToilets, 1);
  });

  it('never overwrites a value the user has already entered', () => {
    const records = [
      recordWithUnderstanding(
        'doc-1',
        'expose.pdf',
        understanding([{ field: 'livingArea', value: 107, evidence: 'Wohnfläche: 107 m²' }]),
      ),
    ];
    const { defaults } = computeWizardPrefills(records, { livingArea: 130 });
    assert.equal(defaults.livingArea, undefined, 'user value must win');
  });

  it('keeps conflicting candidates visible while choosing a default', () => {
    const records = [
      recordWithUnderstanding(
        'expose',
        'Expose.pdf',
        understanding([{ field: 'livingArea', value: 107, evidence: '107 m²' }]),
      ),
      recordWithUnderstanding(
        'berechnung',
        'Wohnflaechenberechnung.pdf',
        understanding([{ field: 'livingArea', value: 106.4, evidence: '106,4 m²' }]),
      ),
    ];
    const { sourcesByField, defaults } = computeWizardPrefills(records, {});
    assert.equal(sourcesByField.livingArea.length, 2, 'both sources preserved');
    assert.equal(sourcesByField.livingArea[0].sourceFilename, 'Expose.pdf');
    assert.equal(defaults.livingArea, 107, 'deterministic default');
  });

  it('preserves conflicting Hausgeld candidates from two WEG documents', () => {
    const records = [
      recordWithUnderstanding(
        'teil',
        'Teilungserklaerung.pdf',
        understanding([{ field: 'hausgeld', value: 350, evidence: 'Hausgeld: 350 €' }]),
      ),
      recordWithUnderstanding(
        'hausgeld',
        'Hausgeldabrechnung.pdf',
        understanding([{ field: 'hausgeld', value: 375, evidence: 'monatliches Hausgeld 375 €' }]),
      ),
    ];
    const { sourcesByField, defaults } = computeWizardPrefills(records, {});
    assert.equal(sourcesByField.hausgeld.length, 2, 'both Hausgeld sources stay visible');
    assert.deepEqual(
      sourcesByField.hausgeld.map((source) => source.value),
      [350, 375],
    );
    assert.equal(defaults.hausgeld, 350, 'first evidence-bearing candidate is the default');
  });

  it('never overwrites a user-entered Hausgeld with a document value', () => {
    const records = [
      recordWithUnderstanding(
        'teil',
        'Teilungserklaerung.pdf',
        understanding([
          { field: 'hausgeld', value: 350, evidence: 'Hausgeld: 350 €' },
          {
            field: 'coOwnershipShare',
            value: '145/10.000',
            evidence: '145/10.000 Miteigentumsanteile',
          },
        ]),
      ),
    ];
    const { defaults, sourcesByField } = computeWizardPrefills(records, { hausgeld: 400 });
    assert.equal(defaults.hausgeld, undefined, 'user value 400 wins forever');
    assert.equal(defaults.coOwnershipShare, '145/10.000', 'empty WEG fields are still prefilled');
    assert.equal(sourcesByField.hausgeld.length, 1, 'the document still contributes a source');
  });

  it('treats the initial property-type default as empty so documents can prefill it', () => {
    const records = [
      recordWithUnderstanding(
        'expose',
        'Expose.pdf',
        understanding([{ field: 'propertyType', value: 'house', evidence: 'Einfamilienhaus' }]),
      ),
    ];
    // The wizard maps the implicit default ("apartment") to "" before asking
    // for defaults — see applyExtractedDocuments in wizard-client.
    const { defaults } = computeWizardPrefills(records, { propertyType: '' });
    assert.equal(defaults.propertyType, 'house');
  });

  it('treats the initial transaction-type default as empty for rental documents', () => {
    const records = [
      recordWithUnderstanding(
        'mietvertrag',
        'Mietvertrag.pdf',
        understanding([
          { field: 'transactionType', value: 'rent', evidence: 'Kaltmiete: 890 EUR' },
        ]),
      ),
    ];
    const { defaults } = computeWizardPrefills(records, { transactionType: '' });
    assert.equal(defaults.transactionType, 'rent');
  });

  it('never overwrites a non-default property or transaction choice', () => {
    const records = [
      recordWithUnderstanding(
        'expose',
        'Expose.pdf',
        understanding([
          { field: 'propertyType', value: 'house', evidence: 'Einfamilienhaus' },
          { field: 'transactionType', value: 'rent', evidence: 'Mietvertrag' },
        ]),
      ),
    ];
    const { defaults } = computeWizardPrefills(records, {
      propertyType: 'villa',
      transactionType: 'sale',
    });
    assert.equal(defaults.propertyType, undefined, 'explicit choice must win');
    assert.equal(defaults.transactionType, undefined, 'explicit choice must win');
  });

  it('resolves internal wizard-field keys to German labels for the UI', () => {
    assert.equal(wizardFieldLabel('livingArea'), 'Wohnfläche');
    assert.equal(wizardFieldLabel('parcelNumber'), 'Flurstück');
    assert.equal(wizardFieldLabel('monthlyRent'), 'Kaltmiete');
    assert.equal(wizardFieldLabel('hausgeld'), 'Hausgeld');
    assert.equal(wizardFieldLabel('maintenanceReserve'), 'Instandhaltungsrücklage');
    assert.equal(wizardFieldLabel('coOwnershipShare'), 'Miteigentumsanteil');
  });

  it('formats extracted values without internal jargon', () => {
    assert.equal(formatExtractedValue(true), 'Ja');
    assert.equal(formatExtractedValue(false), 'Nein');
    assert.equal(formatExtractedValue(null), '—');
    assert.equal(formatExtractedValue(145), '145');
    assert.equal(formatExtractedValue('2024-03-01'), '01.03.2024');
    assert.equal(formatExtractedValue('2025-12-31'), '31.12.2025');
  });
});

describe('additional information candidates', () => {
  it('collects document additional information with source and evidence', () => {
    const records = [
      recordWithUnderstanding(
        'grundbuch',
        'Grundbuchauszug.pdf',
        understanding(
          [],
          [
            { key: 'parcelNumber', value: '5/366', evidence: 'Flurstück 5/366' },
            { key: 'landRegisterDistrict', value: 'Essen', evidence: 'Amtsgericht Essen' },
          ],
        ),
      ),
    ];
    const candidates = collectAdditionalInformation(records);
    assert.equal(candidates.length, 2);
    assert.equal(candidates[0].key, 'parcelNumber');
    assert.equal(candidates[0].sourceFilename, 'Grundbuchauszug.pdf');
    assert.equal(candidates[0].evidence, 'Flurstück 5/366');
  });

  it('groups additional information by key and preserves multiple documents', () => {
    const records = [
      recordWithUnderstanding(
        'a',
        'A.pdf',
        understanding(
          [],
          [{ key: 'owners', value: 'Max Mustermann', evidence: 'Eigentümer: Max Mustermann' }],
        ),
      ),
      recordWithUnderstanding(
        'b',
        'B.pdf',
        understanding(
          [],
          [{ key: 'owners', value: 'Max & Erika Mustermann', evidence: 'Eheleute Mustermann' }],
        ),
      ),
    ];
    const byKey = groupAdditionalByKey(collectAdditionalInformation(records));
    assert.equal(byKey.owners.length, 2);
    assert.deepEqual(
      byKey.owners.map((candidate) => candidate.sourceFilename),
      ['A.pdf', 'B.pdf'],
    );
  });
});
