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
    assert.ok(
      parts.some((part) => part.type === 'text' && /no text extracted/.test(part.text ?? '')),
    );
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

  it('instructs the model to distinguish the address from unrelated references', () => {
    const prompt = buildSystemPrompt();
    assert.match(
      prompt,
      /do not extract values merely because a number or word appears near a field/i,
    );
    assert.match(prompt, /references to other streets/i);
    assert.match(prompt, /register numbers/i);
    assert.match(prompt, /monetary values/i);
  });

  it('references common German real-estate terminology for context', () => {
    const prompt = buildSystemPrompt();
    assert.match(prompt, /Flurstück/);
    assert.match(prompt, /Grundbuchauszug/);
    assert.match(prompt, /Energieausweis/);
  });

  it('covers the Kaution terminology and the deposit extraction rule', () => {
    const prompt = buildSystemPrompt();
    for (const term of [
      'Kaution',
      'Mietkaution',
      'Mietsicherheit',
      'Kautionsbetrag',
      'Sicherheitsleistung',
    ]) {
      assert.match(prompt, new RegExp(term));
    }
    assert.match(prompt, /deposit/);
    assert.match(prompt, /never calculate the deposit/i);
    assert.match(prompt, /do not treat unrelated amounts as the deposit/i);
  });

  it('requires concise supporting evidence and null when undeterminable', () => {
    const prompt = buildSystemPrompt();
    assert.match(
      prompt,
      /every non-null extracted value must include concise supporting evidence/i,
    );
    assert.match(prompt, /return null/i);
  });

  it('covers the WEG extraction rules', () => {
    const prompt = buildSystemPrompt();
    assert.match(prompt, /Hausgeld/i);
    assert.match(prompt, /never calculate Hausgeld/i);
    assert.match(
      prompt,
      /do NOT confuse Kaltmiete, Nebenkosten, Kaution or Instandhaltungsrücklage/i,
    );
    assert.match(prompt, /Instandhaltungsrücklage/i);
    assert.match(prompt, /Zuführung zur Rücklage/i);
    assert.match(prompt, /Miteigentumsanteil/i);
    assert.match(prompt, /Sondernutzungsrecht/i);
    assert.match(prompt, /is NOT a Sondernutzungsrecht/i);
    assert.match(prompt, /wegAdministrator/i);
    assert.match(prompt, /Teilungserklärung/i);
  });

  it('covers the property photo rules', () => {
    const prompt = buildSystemPrompt();
    assert.match(prompt, /photoType/i);
    assert.match(prompt, /photoTags/i);
    assert.match(prompt, /visualDescription/i);
    assert.match(prompt, /coverSuitability/i);
    assert.match(prompt, /never estimate measurements from a photo/i);
    assert.match(prompt, /never write photo observations into factual property wizard fields/i);
    assert.match(prompt, /never marketing language/i);
  });

  it('covers the WEG document priorities without expanding the taxonomy', () => {
    const prompt = buildSystemPrompt();
    assert.match(prompt, /Wirtschaftsplan \/ Hausgeldabrechnung/i);
    assert.match(prompt, /Rücklagenbestand/i);
    assert.match(prompt, /do not automatically treat every monetary amount as the purchase price/i);
  });
});
