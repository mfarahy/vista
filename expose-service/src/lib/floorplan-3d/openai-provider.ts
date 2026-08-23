import OpenAI from 'openai';
import { zodResponseFormat } from 'openai/helpers/zod';
import type { FloorPlan3DInput, FloorPlan3DProvider } from './types.js';
import { floorPlan3DModelSchema, type FloorPlan3DModel } from './schema.js';
import { SYSTEM_PROMPT, buildUserMessage } from './prompt.js';
import { getLogger, trackExternalCall } from '../logger.js';

const DEFAULT_MODEL = 'gpt-4o-mini';
const DEFAULT_MAX_TOKENS = 4096;

/**
 * OpenAI-backed floor plan 3D provider. Uses the OpenAI SDK's structured
 * outputs (JSON schema) so the model returns a typed, validated model instead
 * of free-form JSON that would need manual parsing.
 *
 * Kept behind the FloorPlan3DProvider interface so it can be replaced with
 * another provider (e.g. MeltFlexAI) later.
 */
export class OpenAIFloorPlan3DProvider implements FloorPlan3DProvider {
  readonly name = 'openai';
  private readonly client: OpenAI;
  private readonly model: string;
  private readonly temperature: number | undefined;
  private readonly maxTokens: number | undefined;

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
    this.model = process.env.OPENAI_MODEL || DEFAULT_MODEL;
    const temperature = process.env.OPENAI_TEMPERATURE;
    this.temperature = temperature === undefined ? undefined : Number(temperature);
    const maxTokens = process.env.FLOOR_PLAN_3D_MAX_TOKENS;
    this.maxTokens = maxTokens === undefined ? DEFAULT_MAX_TOKENS : Number(maxTokens);
  }

  async generate(input: FloorPlan3DInput): Promise<FloorPlan3DModel> {
    const completion = await trackExternalCall(
      {
        service: 'openai',
        operation: 'floorplan-3d',
        props: { provider: this.name, model: this.model },
      },
      () =>
        this.client.chat.completions.parse({
          model: this.model,
          ...(this.temperature !== undefined ? { temperature: this.temperature } : {}),
          max_tokens: this.maxTokens,
          response_format: zodResponseFormat(floorPlan3DModelSchema, 'floor_plan_3d_model'),
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: buildUserMessage(input) },
          ],
        }),
    );

    const parsed = completion.choices[0]?.message.parsed;
    if (!parsed) {
      throw new Error('The AI returned no structured result.');
    }

    const model = floorPlan3DModelSchema.parse(parsed);
    getLogger().info(
      {
        provider: this.name,
        model: this.model,
        inputTokens: completion.usage?.prompt_tokens,
        outputTokens: completion.usage?.completion_tokens,
        rooms: model.rooms.length,
        walls: model.walls.length,
        doors: model.doors.length,
        windows: model.windows.length,
      },
      'AI floor plan 3D model completed with {provider}/{model}',
    );
    return model;
  }
}