import OpenAI from 'openai';
import { zodResponseFormat } from 'openai/helpers/zod';
import type { MarketingContentInput, MarketingContentProvider } from './types.js';
import { marketingContentSchema, type MarketingContentStructured } from './schema.js';
import { buildSystemPrompt, buildUserMessage } from './prompt.js';
import { getLogger, trackExternalCall } from '../logger.js';

/**
 * OpenAI-backed marketing content provider. Uses the OpenAI SDK's structured
 * outputs (JSON schema) so the model returns a typed, validated result instead
 * of free-form JSON that would need manual parsing.
 *
 * Kept behind the MarketingContentProvider interface so it can be replaced
 * with another provider later.
 */
export class OpenAIMarketingContentProvider implements MarketingContentProvider {
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

  async generateContent(input: MarketingContentInput): Promise<MarketingContentStructured> {
    const completion = await trackExternalCall(
      {
        service: 'openai',
        operation: 'marketing-content',
        props: { provider: 'openai', model: this.model },
      },
      () =>
        this.client.chat.completions.parse({
          model: this.model,
          ...(this.temperature !== undefined ? { temperature: this.temperature } : {}),
          response_format: zodResponseFormat(marketingContentSchema, 'marketing_content'),
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

    const structured = marketingContentSchema.parse(parsed);
    getLogger().info(
      {
        provider: 'openai',
        model: this.model,
        inputTokens: completion.usage?.prompt_tokens,
        outputTokens: completion.usage?.completion_tokens,
        title: structured.title,
      },
      'AI marketing content completed with {provider}/{model}',
    );
    return structured;
  }
}
