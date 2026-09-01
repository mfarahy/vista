import OpenAI from 'openai';
import { zodResponseFormat } from 'openai/helpers/zod';
import { vlmFloorplanAnalysisSchema, type VlmFloorplanAnalysis } from './schema.js';
import { VLM_SYSTEM_PROMPT, buildVlmUserMessage } from './prompt.js';
import { getLogger, trackExternalCall } from '../logger.js';
import type { RawFloorplanRecognitionResponse } from '../../routes/debug-floorplan-recognition.js';

export interface VlmInput {
  imageBuffer: Buffer;
  mimeType: string;
  raw: RawFloorplanRecognitionResponse;
  annotatedImageBuffer?: Buffer;
  annotatedMimeType?: string;
}

export interface VlmResult {
  analysis: VlmFloorplanAnalysis;
  model: string;
  durationMs: number;
  rawResponse: unknown;
}

const DEFAULT_VLM_MODEL = 'gpt-4o-mini';

export class VlmFloorplanProvider {
  readonly name = 'vlm-floorplan';
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(client?: OpenAI) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('OPENAI_API_KEY is not configured');
    this.client =
      client ??
      new OpenAI({
        apiKey,
        baseURL: process.env.OPENAI_BASE_URL || undefined,
      });
    this.model = process.env.VLM_MODEL || process.env.OPENAI_MODEL || DEFAULT_VLM_MODEL;
  }

  async analyze(input: VlmInput): Promise<VlmResult> {
    const started = performance.now();
    const completion = await trackExternalCall(
      {
        service: 'openai',
        operation: 'vlm-floorplan-analysis',
        props: { provider: this.name, model: this.model },
      },
      () =>
        this.client.chat.completions.parse({
          model: this.model,
          response_format: zodResponseFormat(vlmFloorplanAnalysisSchema, 'vlm_floorplan_analysis'),
          messages: [
            { role: 'system', content: VLM_SYSTEM_PROMPT },
            { role: 'user', content: buildVlmUserMessage(input) as never },
          ],
        }),
    );

    const durationMs = Math.round(performance.now() - started);
    const parsed = completion.choices[0]?.message.parsed as VlmFloorplanAnalysis | undefined;

    if (!parsed) {
      // Fallback: try to parse raw content as JSON for debugging
      const rawContent = completion.choices[0]?.message.content ?? '';
      throw Object.assign(new Error('VLM returned no structured result'), {
        rawContent,
        rawResponse: completion,
      });
    }

    const validated = vlmFloorplanAnalysisSchema.parse(parsed);

    getLogger().info(
      {
        provider: this.name,
        model: this.model,
        durationMs,
        inputTokens: completion.usage?.prompt_tokens,
        outputTokens: completion.usage?.completion_tokens,
        wallRelationships: validated.wallRelationships.length,
        openings: validated.openings.length,
        objectClassifications: validated.objectClassifications.length,
        rooms: validated.rooms.length,
        geometryHints: validated.geometryHints.length,
        topologySummary: validated.topologySummary
          ? validated.topologySummary.continuousWalls.length +
            validated.topologySummary.corners.length +
            validated.topologySummary.tJunctions.length +
            validated.topologySummary.falsePositives.length
          : 0,
      },
      'VLM floorplan analysis completed',
    );

    return {
      analysis: validated,
      model: this.model,
      durationMs,
      rawResponse: completion.choices[0]?.message,
    };
  }

  /** Expose model name for route metadata without construction side-effects. */
  getModel(): string {
    return this.model;
  }
}
