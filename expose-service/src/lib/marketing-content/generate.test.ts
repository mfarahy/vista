import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { emptyExposeData } from '../expose-data.js';
import type { Property } from '../types.js';
import { marketingContentRecordSchema, type MarketingContentStructured } from './schema.js';
import type { MarketingContentProvider, MarketingContentRecord } from './types.js';
import {
  InsufficientPropertyInfoError,
  generateMarketingContent,
  mergeGeneratedContent,
} from './service.js';

function propertyWith(overrides: Partial<Property> = {}): Property {
  return {
    id: 'prop-1',
    propertyType: 'house',
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
    ...overrides,
  };
}

function sampleStructured(): MarketingContentStructured {
  return {
    title: 'Gepflegtes Einfamilienhaus mit Garten und Garage',
    subtitle: 'Einfamilienhaus in Berlin-Buckow',
    highlights: ['107 m² Wohnfläche', '4 Zimmer', 'Eigener Garten', 'Garage'],
    propertyDescription: 'Das gepflegte Einfamilienhaus bietet rund 107 m² Wohnfläche.',
    equipmentDescription: 'Zur Ausstattung gehören eine Garage und ein Garten.',
    locationDescription: 'Das Objekt befindet sich in Berlin-Buckow.',
  };
}

function makeProvider(result: MarketingContentStructured): MarketingContentProvider {
  return { generateContent: async () => ({ ...result }) };
}

function failingProvider(): MarketingContentProvider {
  return {
    generateContent: async () => {
      throw new Error('AI provider failed');
    },
  };
}

function capturePersist() {
  const persisted: Array<{ id: string; content: MarketingContentRecord }> = [];
  const persist = async (id: string, content: MarketingContentRecord) => {
    persisted.push({ id, content });
  };
  return { persisted, persist };
}

describe('generateMarketingContent', () => {
  it('builds the input from property facts and persists the structured result', async () => {
    const property = propertyWith({
      livingArea: 107,
      rooms: 4,
      city: 'Berlin',
      district: 'Buckow',
      selectedFeatures: ['garden', 'garage'],
    });
    const { persisted, persist } = capturePersist();
    let receivedInput: unknown;
    const provider: MarketingContentProvider = {
      generateContent: async (input) => {
        receivedInput = input;
        return sampleStructured();
      },
    };

    const record = await generateMarketingContent(property, { provider, persist });

    assert.equal(
      (receivedInput as { property: { livingAreaM2?: number } }).property.livingAreaM2,
      107,
    );
    assert.deepEqual(record.highlights.value, sampleStructured().highlights);
    assert.equal(record.title.source, 'ai');
    assert.equal(persisted.length, 1);
    assert.equal(persisted[0].id, 'prop-1');
    assert.deepEqual(persisted[0].content, record);
  });

  it('produces a record that satisfies the persisted record schema', async () => {
    const property = propertyWith({
      livingArea: 107,
      rooms: 4,
      city: 'Berlin',
      selectedFeatures: ['garden', 'garage'],
    });
    const record = await generateMarketingContent(property, {
      provider: makeProvider(sampleStructured()),
      persist: async () => {},
    });
    const parsed = marketingContentRecordSchema.parse(record);
    assert.deepEqual(parsed, record);
  });

  it('rejects generation when the property has no meaningful facts', async () => {
    const property = propertyWith();
    await assert.rejects(
      () => generateMarketingContent(property, { provider: makeProvider(sampleStructured()) }),
      InsufficientPropertyInfoError,
    );
  });

  it('preserves user-edited fields on regeneration', () => {
    const existing: MarketingContentRecord = {
      title: { value: 'Mein eigener Titel', source: 'user' },
      subtitle: { value: 'Untertitel', source: 'ai' },
      highlights: { value: ['107 m²'], source: 'ai' },
      propertyDescription: { value: 'Beschreibung', source: 'ai' },
      equipmentDescription: { value: 'Ausstattung', source: 'ai' },
      locationDescription: { value: 'Lage', source: 'ai' },
    };
    const merged = mergeGeneratedContent(existing, sampleStructured());
    assert.equal(merged.title.value, 'Mein eigener Titel');
    assert.equal(merged.title.source, 'user');
    assert.equal(merged.subtitle.value, sampleStructured().subtitle);
    assert.equal(merged.subtitle.source, 'ai');
    assert.deepEqual(merged.highlights.value, sampleStructured().highlights);
  });

  it('preserves user-edited highlights and location on regeneration', () => {
    const existing: MarketingContentRecord = {
      title: { value: 'Titel', source: 'ai' },
      subtitle: { value: 'Untertitel', source: 'ai' },
      highlights: { value: ['Mein Highlight'], source: 'user' },
      propertyDescription: { value: 'Beschreibung', source: 'ai' },
      equipmentDescription: { value: 'Ausstattung', source: 'ai' },
      locationDescription: { value: 'Von mir geschrieben', source: 'user' },
    };
    const merged = mergeGeneratedContent(existing, sampleStructured());
    assert.deepEqual(merged.highlights.value, ['Mein Highlight']);
    assert.equal(merged.highlights.source, 'user');
    assert.equal(merged.locationDescription?.value, 'Von mir geschrieben');
    assert.equal(merged.locationDescription?.source, 'user');
  });

  it('replaces AI-generated location with null when the model returns none', () => {
    const existing: MarketingContentRecord = {
      title: { value: 'Titel', source: 'ai' },
      subtitle: { value: 'Untertitel', source: 'ai' },
      highlights: { value: ['Highlight'], source: 'ai' },
      propertyDescription: { value: 'Beschreibung', source: 'ai' },
      equipmentDescription: { value: 'Ausstattung', source: 'ai' },
      locationDescription: { value: 'Alte KI-Lage', source: 'ai' },
    };
    const merged = mergeGeneratedContent(existing, {
      ...sampleStructured(),
      locationDescription: null,
    });
    assert.equal(merged.locationDescription, null);
  });

  it('does not overwrite existing content when the AI fails', async () => {
    const property = propertyWith({
      livingArea: 107,
      marketingContent: {
        title: { value: 'Bestehender Titel', source: 'ai' },
        subtitle: { value: 'Untertitel', source: 'ai' },
        highlights: { value: ['Highlight'], source: 'ai' },
        propertyDescription: { value: 'Beschreibung', source: 'ai' },
        equipmentDescription: { value: 'Ausstattung', source: 'ai' },
        locationDescription: null,
      },
    });
    const { persisted, persist } = capturePersist();
    await assert.rejects(
      () => generateMarketingContent(property, { provider: failingProvider(), persist }),
      /AI provider failed/,
    );
    assert.equal(persisted.length, 0, 'nothing may be persisted on failure');
    assert.equal(property.marketingContent?.title.value, 'Bestehender Titel');
  });

  it('never mutates the Property data', async () => {
    const property = propertyWith({
      livingArea: 107,
      rooms: 4,
      city: 'Berlin',
      selectedFeatures: ['garden', 'garage'],
      exposeData: {
        ...emptyExposeData(),
        propertyDetails: {
          ...emptyExposeData().propertyDetails,
          livingArea: 107,
          rooms: 4,
        },
      },
    });
    const before = JSON.parse(JSON.stringify(property));
    const { persist } = capturePersist();
    await generateMarketingContent(property, {
      provider: makeProvider(sampleStructured()),
      persist,
    });
    assert.deepEqual(JSON.parse(JSON.stringify(property)), before, 'property must stay unchanged');
    assert.equal(property.livingArea, 107, 'the AI draft must not write back to property facts');
  });
});
