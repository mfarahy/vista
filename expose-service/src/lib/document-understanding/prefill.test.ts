import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { DocumentRecord } from '../types.js';
import type { DocumentUnderstandingResult } from './types.js';
import { computePrefillDefaults, documentWizardCandidates } from './prefill.js';

function recordWithUnderstanding(
  id: string,
  understanding: DocumentUnderstandingResult,
): Pick<DocumentRecord, 'id'> & { understandingResult: DocumentUnderstandingResult } {
  return { id, understandingResult: understanding };
}

describe('documentWizardCandidates', () => {
  it('returns AI wizard fields as candidates', () => {
    const document: Parameters<typeof documentWizardCandidates>[0] = {
      id: 'doc-1',
      filename: 'grundriss.pdf',
      understandingResult: {
        documentType: 'grundriss',
        tags: [],
        summary: '',
        keepInLibrary: true,
        wizardFields: [{ field: 'livingArea', value: 124.5, evidence: 'Wohnfläche: 124,5 m²' }],
        additionalInformation: [],
      },
    };
    const candidates = documentWizardCandidates(document);
    assert.equal(candidates.length, 1);
    assert.equal(candidates[0].value, 124.5);
    assert.equal(candidates[0].sourceDocumentId, 'doc-1');
    assert.equal(candidates[0].sourceFilename, 'grundriss.pdf');
  });

  it('returns no candidates when the AI produced no understanding result', () => {
    const candidates = documentWizardCandidates({
      id: 'doc-1',
      understandingResult: null,
    });
    assert.deepEqual(candidates, []);
  });

  it('returns no candidates when the AI produced no wizard fields', () => {
    const candidates = documentWizardCandidates({
      id: 'doc-1',
      understandingResult: {
        documentType: 'grundriss',
        tags: [],
        summary: '',
        keepInLibrary: true,
        wizardFields: [],
        additionalInformation: [],
      },
    });
    assert.deepEqual(candidates, []);
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

  it('keeps every source when multiple documents agree on the same value', () => {
    const documents = [
      recordWithUnderstanding('grundbuch', {
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
      }),
      recordWithUnderstanding('lageplan', {
        documentType: 'lageplan',
        tags: [],
        summary: '',
        keepInLibrary: true,
        wizardFields: [
          { field: 'street', value: 'Furkastraße', evidence: 'Furkastraße 88 A' },
          { field: 'houseNumber', value: '88 A', evidence: 'Furkastraße 88 A' },
          { field: 'parcelNumber', value: '5/366', evidence: 'Flurstück 5/366' },
          { field: 'plotArea', value: 784, evidence: '784 m²' },
        ],
        additionalInformation: [],
      }),
    ];
    const { valuesByField, defaults } = computePrefillDefaults(documents, {});
    assert.equal(valuesByField.street.length, 2, 'both street sources preserved');
    assert.equal(valuesByField.street[1].sourceDocumentId, 'lageplan');
    assert.equal(valuesByField.plotArea.length, 1);
    assert.equal(defaults.street, 'Furkastraße');
    assert.equal(defaults.houseNumber, '88 A');
    assert.equal(defaults.parcelNumber, '5/366');
    assert.equal(defaults.plotArea, 784);
  });

  it('aggregates fields across unrelated documents into one candidate set', () => {
    const documents = [
      recordWithUnderstanding('grundbuch', {
        documentType: 'grundbuchauszug',
        tags: [],
        summary: '',
        keepInLibrary: true,
        wizardFields: [
          { field: 'street', value: 'Furkastraße', evidence: 'Furkastraße 88 A' },
          { field: 'houseNumber', value: '88 A', evidence: 'Furkastraße 88 A' },
        ],
        additionalInformation: [],
      }),
      recordWithUnderstanding('grundriss', {
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
      recordWithUnderstanding('expose', {
        documentType: 'expose',
        tags: [],
        summary: '',
        keepInLibrary: true,
        wizardFields: [
          { field: 'livingArea', value: 125, evidence: '125 m²' },
          { field: 'rooms', value: 5, evidence: '5 Zimmer' },
          { field: 'yearBuilt', value: 1987, evidence: 'Baujahr 1987' },
        ],
        additionalInformation: [],
      }),
      recordWithUnderstanding('energieausweis', {
        documentType: 'energieausweis',
        tags: [],
        summary: '',
        keepInLibrary: true,
        wizardFields: [
          { field: 'energyClass', value: 'A', evidence: 'Energieeffizienzklasse A' },
          { field: 'heatingType', value: 'Gas', evidence: 'Gasheizung' },
        ],
        additionalInformation: [],
      }),
    ];
    const { valuesByField, defaults } = computePrefillDefaults(documents, {});
    assert.deepEqual(
      valuesByField.livingArea.map((source) => source.value),
      [124.5, 125],
      'conflicting living areas both stay available',
    );
    assert.equal(defaults.livingArea, 124.5, 'evidence-bearing first candidate is the default');
    assert.equal(defaults.rooms, 5);
    assert.equal(defaults.yearBuilt, 1987);
    assert.equal(defaults.energyClass, 'A');
    assert.equal(defaults.heatingType, 'Gas');
    assert.equal(valuesByField.rooms.length, 2, 'agreeing rooms values both preserved');
  });

  it('prefers the first candidate that carries evidence as the default', () => {
    const documents = [
      recordWithUnderstanding('doc-no-evidence', {
        documentType: 'expose',
        tags: [],
        summary: '',
        keepInLibrary: true,
        wizardFields: [{ field: 'livingArea', value: 999, evidence: null }],
        additionalInformation: [],
      }),
      recordWithUnderstanding('doc-with-evidence', {
        documentType: 'expose',
        tags: [],
        summary: '',
        keepInLibrary: true,
        wizardFields: [{ field: 'livingArea', value: 125, evidence: '125 m²' }],
        additionalInformation: [],
      }),
    ];
    const { defaults } = computePrefillDefaults(documents, {});
    assert.equal(defaults.livingArea, 125, 'the value backed by evidence is preferred');
  });

  it('keeps the user value when a later document arrives with a different AI value', () => {
    const firstUpload = [
      recordWithUnderstanding('doc-a', {
        documentType: 'grundriss',
        tags: [],
        summary: '',
        keepInLibrary: true,
        wizardFields: [{ field: 'livingArea', value: 124.5, evidence: '124,5 m²' }],
        additionalInformation: [],
      }),
    ];
    const withUserValue = computePrefillDefaults(firstUpload, { livingArea: 126 });
    assert.equal(withUserValue.defaults.livingArea, undefined, 'user value 126 is untouched');

    const laterUpload = [
      ...firstUpload,
      recordWithUnderstanding('doc-b', {
        documentType: 'expose',
        tags: [],
        summary: '',
        keepInLibrary: true,
        wizardFields: [{ field: 'livingArea', value: 125, evidence: '125 m²' }],
        additionalInformation: [],
      }),
    ];
    const { defaults, valuesByField } = computePrefillDefaults(laterUpload, { livingArea: 126 });
    assert.equal(defaults.livingArea, undefined, 'user value 126 still wins after a later upload');
    assert.equal(valuesByField.livingArea.length, 2, 'new document still contributes a candidate');
  });

  it('a document without an understanding result produces no fake fields', () => {
    const { defaults, valuesByField } = computePrefillDefaults(
      [
        recordWithUnderstanding('failed-doc', {
          documentType: 'grundriss',
          tags: [],
          summary: '',
          keepInLibrary: true,
          wizardFields: [],
          additionalInformation: [],
        }),
      ],
      {},
    );
    assert.deepEqual(defaults, {});
    assert.deepEqual(valuesByField, {});
  });

  it('uses persisted documents and their understanding result for reload', () => {
    const persisted = [
      recordWithUnderstanding('persisted-doc', {
        documentType: 'grundriss',
        tags: [],
        summary: '',
        keepInLibrary: true,
        wizardFields: [{ field: 'rooms', value: 5, evidence: '5 Zimmer' }],
        additionalInformation: [],
      }),
    ];
    const { defaults } = computePrefillDefaults(persisted, {});
    assert.equal(defaults.rooms, 5, 'defaults are rebuilt from persisted records on reload');
  });

  it('deleting a document removes it from sources but keeps an already-filled wizard value', () => {
    const livingArea = (id: string, value: number) =>
      recordWithUnderstanding(id, {
        documentType: 'expose',
        tags: [],
        summary: '',
        keepInLibrary: true,
        wizardFields: [{ field: 'livingArea', value, evidence: `${value} m²` }],
        additionalInformation: [],
      });

    const withAll = computePrefillDefaults([livingArea('doc-a', 125), livingArea('doc-b', 124.5)], {
      livingArea: 130,
    });
    assert.equal(withAll.valuesByField.livingArea.length, 2, 'both sources present before delete');
    assert.equal(withAll.defaults.livingArea, undefined, 'user value 130 wins');

    const afterDelete = computePrefillDefaults([livingArea('doc-b', 124.5)], {
      livingArea: 130,
    });
    assert.equal(
      afterDelete.valuesByField.livingArea.length,
      1,
      'deleted document no longer contributes a source',
    );
    assert.equal(afterDelete.valuesByField.livingArea[0].sourceDocumentId, 'doc-b');
    assert.equal(
      afterDelete.defaults.livingArea,
      undefined,
      'already-populated wizard value is not cleared by delete',
    );
  });

  it('keeps metadata available even when the wizard field is empty', () => {
    const { defaults, valuesByField } = computePrefillDefaults(
      [
        recordWithUnderstanding('grundbuch', {
          documentType: 'grundbuchauszug',
          tags: ['address', 'ownership'],
          summary: 'Grundbuchauszug summary',
          keepInLibrary: true,
          wizardFields: [{ field: 'parcelNumber', value: '5/366', evidence: 'Flurstück 5/366' }],
          additionalInformation: [],
        }),
      ],
      {},
    );
    assert.equal(valuesByField.parcelNumber.length, 1, 'non-wizard metadata field is preserved');
    assert.equal(defaults.parcelNumber, '5/366');
  });
});
