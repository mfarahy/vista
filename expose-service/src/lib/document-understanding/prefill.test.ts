import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { DocumentRecord } from '../types.js';
import type { DocumentUnderstandingResult } from './types.js';
import { computePrefillDefaults, documentWizardCandidates } from './prefill.js';

function recordWithUnderstanding(
  id: string,
  understanding: DocumentUnderstandingResult,
): Pick<DocumentRecord, 'id'> & { analysisResult?: null; understandingResult: DocumentUnderstandingResult } {
  return { id, understandingResult: understanding };
}

describe('documentWizardCandidates', () => {
  it('prefers the AI understanding result over rule-based fields', () => {
    const document: Parameters<typeof documentWizardCandidates>[0] = {
      id: 'doc-1',
      analysisResult: { text: 'x', fields: [{ field: 'livingArea', value: 80, sourceDocumentId: 'doc-1' }] },
      understandingResult: {
        documentType: 'grundriss',
        tags: [],
        summary: '',
        keepInLibrary: true,
        wizardFields: [
          { field: 'livingArea', value: 124.5, evidence: 'Wohnfläche: 124,5 m²' },
        ],
        additionalInformation: [],
      },
    };
    const candidates = documentWizardCandidates(document);
    assert.equal(candidates.length, 1);
    assert.equal(candidates[0].value, 124.5);
    assert.equal(candidates[0].sourceDocumentId, 'doc-1');
  });

  it('falls back to rule-based fields when there is no understanding result', () => {
    const candidates = documentWizardCandidates({
      id: 'doc-1',
      analysisResult: {
        text: 'x',
        fields: [{ field: 'rooms', value: 3, sourceDocumentId: 'doc-1' }],
      },
      understandingResult: null,
    });
    assert.equal(candidates[0].field, 'rooms');
    assert.equal(candidates[0].value, 3);
  });
});

describe('computePrefillDefaults', () => {
  it('fills empty wizard fields from the AI value as a default', () => {
    const documents = [
      recordWithUnderstanding('doc-1', {
        documentType: 'grundriss',
        tags: [],
        summary: '',
        keepInLibrary: true,
        wizardFields: [
          { field: 'livingArea', value: 124.5, evidence: 'Wohnfläche: 124,5 m²' },
          { field: 'rooms', value: 5, evidence: '5 Zimmer' },
        ],
        additionalInformation: [],
      }),
    ];
    const { defaults } = computePrefillDefaults(documents, {});
    assert.equal(defaults.livingArea, 124.5);
    assert.equal(defaults.rooms, 5);
  });

  it('never overwrites a value the user has already entered', () => {
    const documents = [
      recordWithUnderstanding('doc-1', {
        documentType: 'grundriss',
        tags: [],
        summary: '',
        keepInLibrary: true,
        wizardFields: [
          { field: 'livingArea', value: 124.5, evidence: 'Wohnfläche: 124,5 m²' },
          { field: 'rooms', value: 5, evidence: '5 Zimmer' },
        ],
        additionalInformation: [],
      }),
    ];
    const { defaults } = computePrefillDefaults(documents, { livingArea: 130 });
    assert.equal(defaults.livingArea, undefined, 'user value must win');
    assert.equal(defaults.rooms, 5, 'empty field is still prefilled');
  });

  it('preserves conflicting values from multiple documents without loss', () => {
    const documents = [
      recordWithUnderstanding('doc1', {
        documentType: 'expose',
        tags: [],
        summary: '',
        keepInLibrary: true,
        wizardFields: [{ field: 'livingArea', value: 125, evidence: '125 m²' }],
        additionalInformation: [],
      }),
      recordWithUnderstanding('doc2', {
        documentType: 'wohnflaechenberechnung',
        tags: [],
        summary: '',
        keepInLibrary: true,
        wizardFields: [{ field: 'livingArea', value: 124.5, evidence: '124,5 m²' }],
        additionalInformation: [],
      }),
    ];
    const { valuesByField, defaults } = computePrefillDefaults(documents, {});
    const sources = valuesByField.livingArea;
    assert.equal(sources.length, 2);
    assert.deepEqual(
      sources.map((source) => [source.value, source.sourceDocumentId]),
      [
        [125, 'doc1'],
        [124.5, 'doc2'],
      ],
    );
    assert.equal(defaults.livingArea, 125);
  });
});
