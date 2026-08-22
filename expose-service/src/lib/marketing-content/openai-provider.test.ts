import assert from 'node:assert/strict';
import { beforeEach, afterEach, describe, it } from 'node:test';
import type OpenAI from 'openai';

import { OpenAIMarketingContentProvider } from './openai-provider.js';
import type { MarketingContentInput } from './types.js';

const originalKey = process.env.OPENAI_API_KEY;

function makeFakeClient(parsed: unknown, capture: { body?: unknown } = {}) {
  return {
    chat: {
      completions: {
        parse: async (body: unknown) => {
          capture.body = body;
          return { choices: [{ message: { parsed } }] };
        },
      },
    },
  } as unknown as OpenAI;
}

function sampleInput(): MarketingContentInput {
  return {
    property: {
      propertyType: 'house',
      propertySubtype: 'singleFamilyHouse',
      address: { city: 'Berlin', district: 'Buckow' },
      livingAreaM2: 107,
      totalRooms: 4,
      garden: true,
      garage: true,
    },
    listing: { transactionType: 'sale' },
    location: {},
    userInformation: {},
  };
}

describe('OpenAIMarketingContentProvider', () => {
  beforeEach(() => {
    process.env.OPENAI_API_KEY = 'test-key';
  });
  afterEach(() => {
    process.env.OPENAI_API_KEY = originalKey;
    delete process.env.OPENAI_TEMPERATURE;
  });

  it('maps the structured AI output to a marketing content result', async () => {
    const capture: { body?: unknown } = {};
    const provider = new OpenAIMarketingContentProvider(
      makeFakeClient(
        {
          title: 'Gepflegtes Einfamilienhaus mit Garten und Garage',
          subtitle: 'Einfamilienhaus in Berlin-Buckow',
          highlights: ['107 m² Wohnfläche', '4 Zimmer', 'Eigener Garten', 'Garage'],
          propertyDescription: 'Das gepflegte Einfamilienhaus bietet rund 107 m² Wohnfläche.',
          equipmentDescription: 'Die Immobilie verfügt über eine Garage.',
          locationDescription: 'Das Objekt befindet sich in Berlin-Buckow.',
        },
        capture,
      ),
    );

    const result = await provider.generateContent(sampleInput());

    assert.equal(result.title, 'Gepflegtes Einfamilienhaus mit Garten und Garage');
    assert.equal(result.subtitle, 'Einfamilienhaus in Berlin-Buckow');
    assert.equal(result.highlights.length, 4);
    assert.match(result.propertyDescription, /107 m²/);
    assert.equal(result.locationDescription, 'Das Objekt befindet sich in Berlin-Buckow.');
  });

  it('passes the structured-output schema to the SDK', async () => {
    const capture: { body?: unknown } = {};
    const provider = new OpenAIMarketingContentProvider(
      makeFakeClient(
        {
          title: 'Test',
          subtitle: 'Test',
          highlights: ['T'],
          propertyDescription: 'T',
          equipmentDescription: 'T',
          locationDescription: null,
        },
        capture,
      ),
    );
    await provider.generateContent(sampleInput());
    const body = capture.body as {
      response_format?: { type: string; json_schema?: { name?: string } };
      messages?: Array<{ role: string; content: string }>;
    };
    assert.ok(body?.response_format);
    assert.equal(body.response_format.type, 'json_schema');
    assert.equal(body.response_format.json_schema?.name, 'marketing_content');
    const systemMessage = body.messages?.find((message) => message.role === 'system');
    assert.match(systemMessage?.content ?? '', /professioneller deutscher Immobilienmakler/i);
  });

  it('does not send a temperature by default', async () => {
    const capture: { body?: unknown } = {};
    const provider = new OpenAIMarketingContentProvider(
      makeFakeClient(
        {
          title: 'T',
          subtitle: 'T',
          highlights: ['T'],
          propertyDescription: 'T',
          equipmentDescription: 'T',
          locationDescription: null,
        },
        capture,
      ),
    );
    await provider.generateContent(sampleInput());
    const body = capture.body as { temperature?: unknown };
    assert.equal(body.temperature, undefined, 'temperature must be omitted by default');
  });

  it('sends the configured temperature when OPENAI_TEMPERATURE is set', async () => {
    process.env.OPENAI_TEMPERATURE = '0.5';
    const capture: { body?: unknown } = {};
    const provider = new OpenAIMarketingContentProvider(
      makeFakeClient(
        {
          title: 'T',
          subtitle: 'T',
          highlights: ['T'],
          propertyDescription: 'T',
          equipmentDescription: 'T',
          locationDescription: null,
        },
        capture,
      ),
    );
    await provider.generateContent(sampleInput());
    const body = capture.body as { temperature?: unknown };
    assert.equal(body.temperature, 0.5);
  });

  it('throws when the model returns no parsed result', async () => {
    const provider = new OpenAIMarketingContentProvider(makeFakeClient(undefined));
    await assert.rejects(() => provider.generateContent(sampleInput()), /no structured result/i);
  });

  it('throws when the API key is missing', () => {
    process.env.OPENAI_API_KEY = '';
    assert.throws(() => new OpenAIMarketingContentProvider(), /API key/i);
  });
});
