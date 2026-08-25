import assert from 'node:assert/strict';
import { beforeEach, afterEach, describe, it } from 'node:test';
import type OpenAI from 'openai';

import { OpenAIDocumentUnderstandingProvider } from './openai-provider.js';

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

describe('OpenAIDocumentUnderstandingProvider', () => {
  beforeEach(() => {
    process.env.OPENAI_API_KEY = 'test-key';
  });
  afterEach(() => {
    process.env.OPENAI_API_KEY = originalKey;
    delete process.env.OPENAI_TEMPERATURE;
  });

  it('maps the structured AI output to a result', async () => {
    const capture: { body?: unknown } = {};
    const provider = new OpenAIDocumentUnderstandingProvider(
      makeFakeClient(
        {
          documentType: 'energieausweis',
          tags: ['energy', 'heating'],
          summary: 'Energy certificate.',
          keepInLibrary: true,
          wizardFields: [
            { field: 'energyClass', value: 'C', evidence: 'Energieeffizienzklasse C' },
          ],
          additionalInformation: [],
        },
        capture,
      ),
    );

    const result = await provider.analyzeDocument({
      documentId: 'doc-1',
      filename: 'energieausweis.pdf',
      mimeType: 'application/pdf',
      text: 'Energieausweis',
    });

    assert.equal(result.documentType, 'energieausweis');
    assert.deepEqual(result.tags, ['energy', 'heating']);
    assert.equal(result.summary, 'Energy certificate.');
    assert.equal(result.keepInLibrary, true);
    assert.equal(result.wizardFields[0].field, 'energyClass');
    assert.equal(result.wizardFields[0].value, 'C');
    assert.equal(result.wizardFields[0].evidence, 'Energieeffizienzklasse C');
  });

  it('passes the structured-output schema to the SDK', async () => {
    const capture: { body?: unknown } = {};
    const provider = new OpenAIDocumentUnderstandingProvider(
      makeFakeClient(
        {
          documentType: 'other',
          tags: [],
          summary: '',
          keepInLibrary: true,
          wizardFields: [],
          additionalInformation: [],
        },
        capture,
      ),
    );
    await provider.analyzeDocument({
      documentId: 'doc-1',
      filename: 'x.pdf',
      mimeType: 'application/pdf',
      text: 'text',
    });
    const body = capture.body as {
      response_format?: { type: string; json_schema?: { name?: string } };
    };
    assert.ok(body?.response_format);
    assert.equal(body.response_format.type, 'json_schema');
  });

  it('does not send a temperature by default', async () => {
    const capture: { body?: unknown } = {};
    const provider = new OpenAIDocumentUnderstandingProvider(
      makeFakeClient(
        {
          documentType: 'other',
          tags: [],
          summary: '',
          keepInLibrary: true,
          wizardFields: [],
          additionalInformation: [],
        },
        capture,
      ),
    );
    await provider.analyzeDocument({
      documentId: 'doc-1',
      filename: 'x.pdf',
      mimeType: 'application/pdf',
      text: 'text',
    });
    const body = capture.body as { temperature?: unknown };
    assert.equal(body.temperature, undefined, 'temperature must be omitted by default');
  });

  it('sends the configured temperature when OPENAI_TEMPERATURE is set', async () => {
    process.env.OPENAI_TEMPERATURE = '0.5';
    const capture: { body?: unknown } = {};
    const provider = new OpenAIDocumentUnderstandingProvider(
      makeFakeClient(
        {
          documentType: 'other',
          tags: [],
          summary: '',
          keepInLibrary: true,
          wizardFields: [],
          additionalInformation: [],
        },
        capture,
      ),
    );
    await provider.analyzeDocument({
      documentId: 'doc-1',
      filename: 'x.pdf',
      mimeType: 'application/pdf',
      text: 'text',
    });
    const body = capture.body as { temperature?: unknown };
    assert.equal(body.temperature, 0.5);
  });

  it('includes the actual image as an image_url part for image documents', async () => {
    const capture: { body?: unknown } = {};
    const provider = new OpenAIDocumentUnderstandingProvider(
      makeFakeClient(
        {
          documentType: 'property_photo',
          tags: ['interior', 'kitchen'],
          summary: 'Kitchen photo',
          keepInLibrary: true,
          wizardFields: [],
          additionalInformation: [],
        },
        capture,
      ),
    );

    await provider.analyzeDocument({
      documentId: 'doc-1',
      filename: 'kitchen.jpg',
      mimeType: 'image/jpeg',
      text: '',
      image: { content: Buffer.from('fake-image-bytes'), mimeType: 'image/jpeg' },
    });

    const body = capture.body as {
      messages?: Array<{ role: string; content: unknown }>;
    };
    const userMessage = body?.messages?.find((message) => message.role === 'user');
    assert.ok(Array.isArray(userMessage?.content), 'image documents must use content parts');

    const parts = userMessage.content as Array<{
      type: string;
      text?: string;
      image_url?: { url: string };
    }>;
    const textPart = parts.find((part) => part.type === 'text');
    const imagePart = parts.find((part) => part.type === 'image_url');
    assert.ok(textPart, 'OCR text must be included');
    assert.match(textPart?.text ?? '', /no text extracted/);
    assert.ok(imagePart, 'image must be attached');
    assert.equal(imagePart?.image_url?.url, 'data:image/jpeg;base64,ZmFrZS1pbWFnZS1ieXRlcw==');
  });

  it('sends a plain text message when no image is provided', async () => {
    const capture: { body?: unknown } = {};
    const provider = new OpenAIDocumentUnderstandingProvider(
      makeFakeClient(
        {
          documentType: 'energieausweis',
          tags: [],
          summary: '',
          keepInLibrary: true,
          wizardFields: [],
          additionalInformation: [],
        },
        capture,
      ),
    );

    await provider.analyzeDocument({
      documentId: 'doc-1',
      filename: 'energieausweis.pdf',
      mimeType: 'application/pdf',
      text: 'Energieausweis',
    });

    const body = capture.body as { messages?: Array<{ role: string; content: unknown }> };
    const userMessage = body?.messages?.find((message) => message.role === 'user');
    assert.equal(typeof userMessage?.content, 'string', 'PDF documents keep a plain text message');
  });

  it('throws when the model returns no parsed result', async () => {
    const provider = new OpenAIDocumentUnderstandingProvider(
      makeFakeClient(undefined),
    );
    await assert.rejects(
      () =>
        provider.analyzeDocument({
          documentId: 'doc-1',
          filename: 'x.pdf',
          mimeType: 'application/pdf',
          text: 'text',
        }),
      /no structured result/i,
    );
  });

  it('throws when the API key is missing', () => {
    process.env.OPENAI_API_KEY = '';
    assert.throws(() => new OpenAIDocumentUnderstandingProvider(), /API key/i);
  });
});
