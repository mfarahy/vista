import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';

import { createFloorPlan3DProvider } from './index.js';
import { OpenAIFloorPlan3DProvider } from './openai-provider.js';

const originalKey = process.env.OPENAI_API_KEY;
const originalProvider = process.env.FLOOR_PLAN_3D_PROVIDER;

describe('createFloorPlan3DProvider', () => {
  beforeEach(() => {
    process.env.OPENAI_API_KEY = 'test-key';
  });
  afterEach(() => {
    process.env.OPENAI_API_KEY = originalKey;
    process.env.FLOOR_PLAN_3D_PROVIDER = originalProvider;
  });

  it('defaults to the OpenAI provider', () => {
    delete process.env.FLOOR_PLAN_3D_PROVIDER;
    const provider = createFloorPlan3DProvider();
    assert.ok(provider instanceof OpenAIFloorPlan3DProvider);
    assert.equal(provider.name, 'openai');
  });

  it('selects the OpenAI provider when explicitly configured', () => {
    process.env.FLOOR_PLAN_3D_PROVIDER = 'openai';
    assert.equal(createFloorPlan3DProvider().name, 'openai');
  });

  it('throws for an unknown provider', () => {
    process.env.FLOOR_PLAN_3D_PROVIDER = 'meltflexai';
    assert.throws(() => createFloorPlan3DProvider(), /Unknown floor plan 3D provider/);
  });
});