import type { DocumentUnderstandingInput } from './types.js';

/**
 * Readable prompt template for the document-understanding model. Kept separate
 * from the provider so it can be tuned without touching request plumbing.
 */

const SYSTEM_PROMPT = `You are analyzing property documents for a real-estate application called Vista.

Your job is to turn one uploaded document into structured, useful property data.

Rules:
- Identify what the document is, using ONLY the document type values you are given.
- Return exactly one primary document type. If you are not confident, use "other".
- Do not guess. Do not infer values without evidence.
- Extract only information that is actually supported by the document text or, for images, actually visible in the image.
- For every extracted value, set "evidence" to a short verbatim snippet from the document that supports it. If you cannot point to a reliable snippet, set "evidence" to null.
- Assign a small set of meaningful tags (a handful at most) describing the PURPOSE or CONTENT of the document, not arbitrary OCR keywords.
- Identify which fields can populate the property wizard and put them in "wizardFields".
- Any other useful structured information that is not a wizard field goes into "additionalInformation".
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
