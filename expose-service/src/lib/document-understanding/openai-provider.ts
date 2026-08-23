import OpenAI from 'openai';
import { zodResponseFormat } from 'openai/helpers/zod';
import type {
  DocumentUnderstandingInput,
  DocumentUnderstandingProvider,
  DocumentUnderstandingResult,
} from './types.js';
import { documentUnderstandingSchema, type DocumentUnderstandingStructured } from './schema.js';
import { buildSystemPrompt, buildUserMessage } from './prompt.js';
import { getLogger, trackExternalCall } from '../logger.js';

/**
 * OpenAI-backed document understanding provider. Uses the OpenAI SDK's
 * structured outputs (JSON schema) so the model returns a typed, validated
 * result instead of free-form JSON that would need manual parsing.
 *
 * Kept behind the DocumentUnderstandingProvider interface so it can be
 * replaced with another provider later.
 */
export class OpenAIDocumentUnderstandingProvider implements DocumentUnderstandingProvider {
  private readonly client: OpenAI;
  private readonly model: string;
  private readonly temperature: number | undefined;

  constructor(client?: OpenAI) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OpenAI API key is not configured.');
    }
    this.client =
      client ??
      new OpenAI({
        apiKey,
        baseURL: process.env.OPENAI_BASE_URL || undefined,
      });
    this.model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
    const temperature = process.env.OPENAI_TEMPERATURE;
    this.temperature = temperature === undefined ? undefined : Number(temperature);
  }

  async analyzeDocument(input: DocumentUnderstandingInput): Promise<DocumentUnderstandingResult> {
    const completion = await trackExternalCall(
      {
        service: 'openai',
        operation: 'document-understanding',
        props: { provider: 'openai', model: this.model },
      },
      () =>
        this.client.chat.completions.parse({
          model: this.model,
          ...(this.temperature !== undefined ? { temperature: this.temperature } : {}),
          response_format: zodResponseFormat(documentUnderstandingSchema, 'document_understanding'),
          messages: [
            { role: 'system', content: buildSystemPrompt() },
            { role: 'user', content: buildUserMessage(input) },
          ],
        }),
    );

    const parsed = completion.choices[0]?.message.parsed;
    if (!parsed) {
      throw new Error('The AI returned no structured result.');
    }

    const structured: DocumentUnderstandingStructured = documentUnderstandingSchema.parse(parsed);
    getLogger().info(
      {
        provider: 'openai',
        model: this.model,
        inputTokens: completion.usage?.prompt_tokens,
        outputTokens: completion.usage?.completion_tokens,
        documentType: structured.documentType,
      },
      'AI document understanding completed with {provider}/{model}',
    );
    return {
      documentType: structured.documentType,
      tags: [...structured.tags],
      summary: structured.summary,
      keepInLibrary: structured.keepInLibrary,
      wizardFields: structured.wizardFields.map((field) => ({ ...field })),
      additionalInformation: structured.additionalInformation.map((info) => ({ ...info })),
      photo: structured.photo
        ? {
            photoType: structured.photo.photoType,
            photoTags: structured.photo.photoTags.map((tag) => ({ ...tag })),
            visualDescription: structured.photo.visualDescription,
            coverSuitability: structured.photo.coverSuitability,
            coverSuitabilityReason: structured.photo.coverSuitabilityReason,
          }
        : null,
    };
  }
}
