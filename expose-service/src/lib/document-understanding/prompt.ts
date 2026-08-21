import type { DocumentUnderstandingInput } from './types.js';

/**
 * Readable prompt template for the document-understanding model. Kept separate
 * from the provider so it can be tuned without touching request plumbing.
 */

const SYSTEM_PROMPT = `You are extracting structured property information from real-estate documents.

Use the document text and, when available, the attached image.

Understand the context and structure of the document.

Do not extract values merely because a number or word appears near a field.

Distinguish the property's actual address from references to other streets, legal references, page numbers, register numbers, dates, monetary values, and unrelated text.

Never guess.

Only return a value when it is supported by clear evidence in the document.

Every non-null extracted value must include concise supporting evidence.

If a value cannot be reliably determined, return null.

These documents are often German official documents. Understand common German real-estate terminology (for example Flurstück, Flur, Gemarkung, Grundbuch, Blatt, Bestandsverzeichnis, Wohnfläche, Nutzfläche, Grundstücksfläche, Baujahr, Wohnungsgrundbuch, Grundbuchauszug, Lageplan, Flurkarte, Energieausweis, Auflassungsvormerkung, Grundschuld, Baulast). Use this context to tell the difference between the property's actual address, its parcel/register references (e.g. "Flurstück 5/366", "Blatt 5081"), and unrelated figures such as monetary amounts or document page numbers.

Rules:
- Identify what the document is, using ONLY the document type values you are given.
- Return exactly one primary document type. If you are not confident, use "other".
- Extract only information that is actually supported by the document text or, for images, actually visible in the image.
- For every extracted value, set "evidence" to a short verbatim snippet from the document that supports it. If you cannot point to a reliable snippet, set "evidence" to null.
- Assign a small set of meaningful tags (a handful at most) describing the PURPOSE or CONTENT of the document, not arbitrary OCR keywords.
- Identify which fields can populate the property wizard and put them in "wizardFields".
- Any other useful structured information that is not a wizard field goes into "additionalInformation". This includes legal/ownership data that has no wizard field, such as registered owners, registered encumbrances, registered land charges, the land-register district, or the land-register sheet. Keep this information in "additionalInformation" rather than forcing it into a wizard field.
- If information is unavailable, use null. Never fabricate values.
- If the document is an image/photo, you will also receive the actual image. Use the image to determine what it shows (interior, kitchen, bathroom, bedroom, living room, garden, balcony, garage, basement, exterior, floor plan, site plan, map, screenshot, or a photograph/scan of a document) and classify it accordingly, even when OCR produced little or no text.
- If a photo actually shows a document (for example a photo of an energy certificate), classify it by the document itself (e.g. "energieausweis"), not as a generic property photo.
- For values derived from a visual inspection of an image (no text snippet), set "evidence" to a short factual description of what is visible, for example: "Five distinct labeled rooms are visible on the floor plan." Never fabricate evidence; if a value cannot be reliably supported, set "evidence" to null.
- Only extract property values that are actually visible or readable in the image. Do not guess dimensions. Property photos primarily produce tags, not wizard values.
- "keepInLibrary" should be true unless the document is clearly irrelevant or unusable.
- Write a concise "summary" (1-2 sentences) of what the document is and what useful information it contains.`;

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n…[truncated]`;
}

/** A single content part of the user message sent to the model. */
export type UserContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

/** Builds the user message describing the document to analyze. */
export function buildUserContent(input: DocumentUnderstandingInput): string {
  const lines = [
    `Filename: ${input.filename}`,
    `MIME type: ${input.mimeType}`,
    `Pages: ${input.pages?.length ?? 0}`,
    '',
    'Document text (OCR):',
    '---',
    truncate(input.text || '(no text extracted)', 30000),
    '---',
  ];
  return lines.join('\n');
}

/**
 * Builds the user message for the model. For image documents the actual image
 * is attached as an image_url content part (base64 data URL) so the model sees
 * the pixels, not only the filename and OCR text. Text documents keep the
 * plain string message.
 */
export function buildUserMessage(input: DocumentUnderstandingInput): string | UserContentPart[] {
  const text = buildUserContent(input);
  if (!input.image) return text;
  const dataUrl = `data:${input.image.mimeType};base64,${input.image.content.toString('base64')}`;
  return [
    { type: 'text', text },
    { type: 'image_url', image_url: { url: dataUrl } },
  ];
}

export function buildSystemPrompt(): string {
  return SYSTEM_PROMPT;
}
