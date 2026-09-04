import OpenAI from 'openai';
import { zodResponseFormat } from 'openai/helpers/zod';
import { normalizeRawGeometryRelationships, vlmFloorplanAnalysisSchema, type VlmFloorplanAnalysis } from './schema.js';
import { VLM_SYSTEM_PROMPT, buildVlmUserMessage } from './prompt.js';
import type { VlmPrimitive } from './geometry-primitives.js';
import { getLogger, trackExternalCall } from '../logger.js';
import type { RawFloorplanRecognitionResponse } from '../../routes/debug-floorplan-recognition.js';

export interface VlmInput {
  imageBuffer: Buffer;
  mimeType: string;
  raw: RawFloorplanRecognitionResponse;
  annotatedImageBuffer?: Buffer;
  annotatedMimeType?: string;
  primitives?: VlmPrimitive[];
}

export interface VlmResult {
  analysis: VlmFloorplanAnalysis;
  model: string;
  durationMs: number;
  rawResponse: unknown;
  normalizationWarnings?: string[];
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
    // NOTE: intentionally uses `create` (not `parse`) so the raw VLM JSON
    // reaches our boundary normalizer BEFORE strict Zod validation.
    // `parse` validates client-side with the same superRefine (≥2
    // sourcePrimitiveIds) and would throw on a single malformed
    // opening_interrupts_wall before normalization can drop/repair it.
    // The response_format still constrains the model server-side; the strict
    // `vlmFloorplanAnalysisSchema.parse` below remains the acceptance gate.
    const completion = await trackExternalCall(
      {
        service: 'openai',
        operation: 'vlm-floorplan-analysis',
        props: { provider: this.name, model: this.model },
      },
      () =>
        this.client.chat.completions.create({
          model: this.model,
          response_format: zodResponseFormat(vlmFloorplanAnalysisSchema, 'vlm_floorplan_analysis'),
          messages: [
            { role: 'system', content: VLM_SYSTEM_PROMPT },
            { role: 'user', content: buildVlmUserMessage(input) as never },
          ],
        }),
    );

    const durationMs = Math.round(performance.now() - started);
    const message = completion.choices[0]?.message as
      | { content?: string | null; refusal?: string | null }
      | undefined;
    const rawContent = message?.content ?? '';

    if (!rawContent) {
      throw Object.assign(new Error('VLM returned no structured result'), {
        rawContent,
        rawResponse: completion,
      });
    }

    let rawJson: unknown;
    try {
      rawJson = JSON.parse(rawContent);
    } catch {
      throw Object.assign(new Error('VLM returned invalid JSON'), {
        rawContent,
        rawResponse: completion,
      });
    }

    // Boundary normalization: drop/repair malformed opening_interrupts_wall
    // entries (fewer than 2 sourcePrimitiveIds) before strict Zod parsing so
    // malformed relationships cannot fail the whole analysis. The validator
    // itself stays strict; every repair/drop is logged and surfaced.
    const primitivesForRepair = input.primitives ?? [];
    const knownPrimitiveIds = new Set(primitivesForRepair.map((p) => p.primitiveId));
    const primitiveToSourceObject = new Map(primitivesForRepair.map((p) => [p.primitiveId, p.sourceObjectId] as const));
    const normalization = normalizeRawGeometryRelationships(rawJson, {
      knownPrimitiveIds: knownPrimitiveIds.size > 0 ? knownPrimitiveIds : undefined,
      primitiveToSourceObject,
    });
    const normalizationWarnings = normalization.warnings;
    if (normalizationWarnings.length > 0) {
      getLogger().warn(
        { provider: this.name, model: this.model, warnings: normalizationWarnings },
        'VLM geometryRelationships normalized at response boundary',
      );
    }

    const validated = vlmFloorplanAnalysisSchema.parse(normalization.sanitized);

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
        geometryConstraints: validated.geometryConstraints.length,
        geometryRelationships: validated.geometryRelationships.length,
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
      normalizationWarnings,
    };
  }

  /** Expose model name for route metadata without construction side-effects. */
  getModel(): string {
    return this.model;
  }
}
