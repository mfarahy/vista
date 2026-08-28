import type { FloorPlan3DProvider } from './types.js';
import { OpenAIFloorPlan3DProvider } from './openai-provider.js';
import { MeltFlexFloorPlan3DProvider } from './meltflex-provider.js';

export * from './types.js';
export * from './schema.js';

/**
 * Name of the configured floor plan 3D provider, without constructing it.
 * Used to build pending records; generation itself goes through
 * `createFloorPlan3DProvider`.
 */
export function floorPlan3DProviderName(): string {
  return process.env.FLOOR_PLAN_3D_PROVIDER || 'openai';
}

/**
 * Returns the configured floor plan 3D provider. Only OpenAI is implemented
 * for the MVP; the provider abstraction keeps this replaceable later (e.g.
 * MeltFlexAI) without touching the service or the routes.
 */
export function createFloorPlan3DProvider(): FloorPlan3DProvider {
  const provider = floorPlan3DProviderName();
  if (provider === 'openai') return new OpenAIFloorPlan3DProvider();
  if (provider === 'meltflex') return new MeltFlexFloorPlan3DProvider();
  throw new Error(`Unknown floor plan 3D provider: ${provider}`);
}