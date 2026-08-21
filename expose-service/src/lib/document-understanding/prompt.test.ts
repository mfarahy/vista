import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildSystemPrompt, buildUserContent, buildUserMessage } from './prompt.js';

describe('document understanding prompt', () => {
  it('builds a user message with filename, mime type and OCR text', () => {
    const content = buildUserContent({
      documentId: 'doc-1',
      filename: 'grundriss.pdf',
      mimeType: 'application/pdf',
      text: 'Grundriss, 3 Zimmer, Wohnfläche 92 m²',
      pages: [{ pageNumber: 1, text: 'Grundriss' }],
    });
    assert.match(content, /grundriss\.pdf/);
    assert.match(content, /application\/pdf/);
    assert.match(content, /Wohnfläche 92 m²/);
  });

  it('handles an empty OCR text', () => {
    const content = buildUserContent({
      documentId: 'doc-1',
      filename: 'photo.jpg',
      mimeType: 'image/jpeg',
      text: '',
    });
    assert.match(content, /no text extracted/);
  });

  it('attaches the image as an image_url content part for image documents', () => {
    const message = buildUserMessage({
      documentId: 'doc-1',
      filename: 'kitchen.jpg',
      mimeType: 'image/jpeg',
      text: '',
      image: { content: Buffer.from('fake-image-bytes'), mimeType: 'image/jpeg' },
    });

    assert.ok(Array.isArray(message), 'image documents must use content parts');
    const parts = message as Array<{ type: string; text?: string; image_url?: { url: string } }>;
    const imagePart = parts.find((part) => part.type === 'image_url');
    assert.ok(imagePart);
    assert.equal(imagePart.image_url?.url, 'data:image/jpeg;base64,ZmFrZS1pbWFnZS1ieXRlcw==');
    assert.ok(parts.some((part) => part.type === 'text' && /no text extracted/.test(part.text ?? '')));
  });

  it('returns a plain string when no image is provided', () => {
    const message = buildUserMessage({
      documentId: 'doc-1',
      filename: 'grundriss.pdf',
      mimeType: 'application/pdf',
      text: 'Grundriss',
    });
    assert.equal(typeof message, 'string');
  });

  it('instructs the model not to guess and to preserve evidence', () => {
    const prompt = buildSystemPrompt();
    assert.match(prompt, /Do not guess/i);
    assert.match(prompt, /evidence/i);
    assert.match(prompt, /structured/i);
    assert.match(prompt, /other/i);
  });

  it('instructs the model to use the actual image for image documents', () => {
    const prompt = buildSystemPrompt();
    assert.match(prompt, /receive the actual image/i);
    assert.match(prompt, /visible in the image/i);
  });
});
