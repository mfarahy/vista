import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { DOCUMENT_TYPES, DOCUMENT_TAGS, documentUnderstandingSchema } from './schema.js';

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
});
