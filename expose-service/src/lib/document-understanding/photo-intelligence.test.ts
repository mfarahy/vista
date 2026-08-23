import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import type OpenAI from 'openai';

import { OpenAIDocumentUnderstandingProvider } from './openai-provider.js';
import type { DocumentUnderstandingResult } from './types.js';
import { buildPropertyModel, applyWizardFieldsToModel } from '../domain-model.js';
import type { Property } from '../types.js';

/**
 * Phase 9 property-photo intelligence tests. The OpenAI call is mocked, so no
 * paid API is ever called. The tests prove that the photo schema, the provider
 * mapping and the domain model agree: photo metadata is carried on the
 * document record and never mutates factual Property fields.
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

function modelAfter(result: DocumentUnderstandingResult) {
  return applyWizardFieldsToModel(buildPropertyModel(propertyWith()), result.wizardFields);
}

describe('Property photo: classification and visual metadata', () => {
  beforeEach(() => {
    process.env.OPENAI_API_KEY = 'test-key';
  });
  afterEach(() => {
    process.env.OPENAI_API_KEY = originalKey;
  });

  it('maps the photo classification, tags and visual description onto the result', async () => {
    const result = await runExtraction(
      {
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
          visualDescription: 'Heller Wohnbereich mit Einbauküche und großen Fenstern.',
          coverSuitability: 'high',
          coverSuitabilityReason: 'Zentraler Bildausschnitt, gut belichtet.',
        },
      },
      {
        documentId: 'doc-photo',
        filename: 'kueche.jpg',
        mimeType: 'image/jpeg',
        text: '',
        image: { content: Buffer.from('fake-image-bytes'), mimeType: 'image/jpeg' },
      },
    );

    assert.equal(result.photo?.photoType, 'kitchen');
    assert.deepEqual(
      result.photo?.photoTags.map((tag) => tag.tag),
      ['fitted-kitchen', 'tiles'],
    );
    assert.match(result.photo?.photoTags[0].evidence ?? '', /Einbauküche/);
    assert.match(result.photo?.visualDescription ?? '', /Einbauküche/);
    assert.equal(result.photo?.coverSuitability, 'high');
  });

  it('classifies an exterior photo and never produces wizard fields', async () => {
    const result = await runExtraction(
      {
        documentType: 'property_photo',
        tags: ['property-photo', 'exterior'],
        summary: 'Außenansicht.',
        keepInLibrary: true,
        wizardFields: [],
        additionalInformation: [],
        photo: {
          photoType: 'exterior',
          photoTags: [{ tag: 'garden', evidence: 'Gartenfläche vor dem Gebäude sichtbar.' }],
          visualDescription: 'Mehrfamilienhaus mit gepflegter Fassade und Garten.',
          coverSuitability: 'medium',
          coverSuitabilityReason: null,
        },
      },
      {
        documentId: 'doc-photo',
        filename: 'aussen.jpg',
        mimeType: 'image/jpeg',
        text: '',
        image: { content: Buffer.from('fake-image-bytes'), mimeType: 'image/jpeg' },
      },
    );

    assert.equal(result.photo?.photoType, 'exterior');
    assert.equal(result.wizardFields.length, 0, 'photos produce no wizard fields');
    const model = modelAfter(result);
    assert.equal(model.areas.livingAreaM2, undefined);
    assert.equal(model.building.yearBuilt, undefined);
    assert.equal(model.outdoor.garden, undefined, 'a visible garden is a tag, not a property fact');
  });

  it('keeps photo metadata null when the model returns no photo object', async () => {
    const result = await runExtraction(
      {
        documentType: 'energieausweis',
        tags: ['energy'],
        summary: 'Energieausweis.',
        keepInLibrary: true,
        wizardFields: [{ field: 'energyClass', value: 'C', evidence: 'Energieeffizienzklasse C' }],
        additionalInformation: [],
      },
      {
        documentId: 'doc-energy',
        filename: 'energieausweis.pdf',
        mimeType: 'application/pdf',
        text: 'Energieeffizienzklasse C',
      },
    );

    assert.equal(result.photo, null, 'non-photo documents have no photo metadata');
  });

  it('works when OCR produced no text and only the image is available', async () => {
    const result = await runExtraction(
      {
        documentType: 'property_photo',
        tags: ['property-photo', 'interior', 'bathroom'],
        summary: 'Badezimmerfoto.',
        keepInLibrary: true,
        wizardFields: [],
        additionalInformation: [],
        photo: {
          photoType: 'bathroom',
          photoTags: [
            { tag: 'bathtub', evidence: 'Badewanne sichtbar.' },
            { tag: 'shower', evidence: 'Duschkabine sichtbar.' },
          ],
          visualDescription: 'Badezimmer mit Badewanne und Dusche.',
          coverSuitability: 'low',
          coverSuitabilityReason: 'Stark abgeschnittener Bildausschnitt.',
        },
      },
      {
        documentId: 'doc-photo',
        filename: 'bad.jpg',
        mimeType: 'image/jpeg',
        text: '',
        image: { content: Buffer.from('fake-image-bytes'), mimeType: 'image/jpeg' },
      },
    );

    assert.equal(result.photo?.photoType, 'bathroom');
    assert.deepEqual(result.photo?.photoTags.map((tag) => tag.tag).sort(), ['bathtub', 'shower']);
  });

  it('never estimates measurements from a photo', async () => {
    const result = await runExtraction(
      {
        documentType: 'property_photo',
        tags: ['property-photo', 'interior', 'living-room'],
        summary: 'Wohnzimmerfoto ohne Maßangaben.',
        keepInLibrary: true,
        wizardFields: [],
        additionalInformation: [],
        photo: {
          photoType: 'living_room',
          photoTags: [{ tag: 'large-windows', evidence: 'Große Fensterfront sichtbar.' }],
          visualDescription: 'Wohnzimmer mit großer Fensterfront.',
          coverSuitability: 'high',
          coverSuitabilityReason: null,
        },
      },
      {
        documentId: 'doc-photo',
        filename: 'wohnzimmer.jpg',
        mimeType: 'image/jpeg',
        text: '',
        image: { content: Buffer.from('fake-image-bytes'), mimeType: 'image/jpeg' },
      },
    );

    assert.equal(result.wizardFields.length, 0, 'no dimensions are extracted from pixels');
    const model = modelAfter(result);
    assert.equal(model.areas.livingAreaM2, undefined);
    assert.equal(model.rooms.total, undefined);
    assert.equal(model.building.yearBuilt, undefined);
    assert.equal(model.energy, undefined);
  });
});
