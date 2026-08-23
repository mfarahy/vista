import assert from 'node:assert/strict';
import { beforeEach, afterEach, describe, it } from 'node:test';
import type OpenAI from 'openai';

import { OpenAIFloorPlan3DProvider } from './openai-provider.js';

const originalKey = process.env.OPENAI_API_KEY;

function makeFakeClient(parsed: unknown, capture: { body?: unknown } = {}) {
  return {
    chat: {
      completions: {
        parse: async (body: unknown) => {
          capture.body = body;
          return { choices: [{ message: { parsed } }] };
        },
      },
    },
  } as unknown as OpenAI;
}

const sampleModel = {
  unit: 'm',
  rooms: [
    {
      id: 'room-1',
      name: 'Wohnzimmer',
      level: 0,
      x: 3,
      y: 2,
      width: 6,
      depth: 4,
      height: 2.5,
      areaM2: 24,
    },
  ],
  walls: [{ id: 'wall-1', level: 0, from: { x: 0, y: 0 }, to: { x: 6, y: 0 }, thickness: 0.25, height: 2.5 }],
  doors: [{ id: 'door-1', level: 0, x: 1, y: 0, width: 0.9, height: 2.1, rotation: 0 }],
  windows: [{ id: 'window-1', level: 0, x: 3, y: 4, width: 1.4, height: 1.2, rotation: Math.PI }],
};

function sampleInput() {
  return {
    imageBuffer: Buffer.from('fake-png-bytes'),
    mimeType: 'image/png',
    property: { address: 'Musterstraße 12', livingAreaM2: 107, totalRooms: 4 },
  };
}

describe('OpenAIFloorPlan3DProvider', () => {
  beforeEach(() => {
    process.env.OPENAI_API_KEY = 'test-key';
  });
  afterEach(() => {
    process.env.OPENAI_API_KEY = originalKey;
    delete process.env.OPENAI_TEMPERATURE;
    delete process.env.FLOOR_PLAN_3D_MAX_TOKENS;
  });

  it('maps the structured AI output to a 3D model', async () => {
    const provider = new OpenAIFloorPlan3DProvider(makeFakeClient(sampleModel));

    const model = await provider.generate(sampleInput());

    assert.equal(model.unit, 'm');
    assert.equal(model.rooms.length, 1);
    assert.equal(model.rooms[0].name, 'Wohnzimmer');
    assert.equal(model.rooms[0].areaM2, 24);
    assert.equal(model.walls.length, 1);
    assert.equal(model.doors.length, 1);
    assert.equal(model.windows.length, 1);
  });

  it('applies schema defaults to partial AI output', async () => {
    const provider = new OpenAIFloorPlan3DProvider(
      makeFakeClient({
        unit: 'm',
        rooms: [{ id: 'r1', name: 'Küche', x: 1, y: 1, width: 3, depth: 3, areaM2: null }],
      }),
    );

    const model = await provider.generate(sampleInput());

    assert.equal(model.rooms[0].level, 0);
    assert.equal(model.rooms[0].height, 2.5);
    assert.deepEqual(model.walls, []);
    assert.deepEqual(model.doors, []);
  });

  it('passes the structured-output schema and the plan image to the SDK', async () => {
    const capture: { body?: unknown } = {};
    const provider = new OpenAIFloorPlan3DProvider(makeFakeClient(sampleModel, capture));

    await provider.generate(sampleInput());

    const body = capture.body as {
      response_format?: { type: string; json_schema?: { name?: string } };
      max_tokens?: number;
      messages?: Array<{ role: string; content: unknown }>;
    };
    assert.ok(body?.response_format);
    assert.equal(body.response_format.type, 'json_schema');
    assert.equal(body.response_format.json_schema?.name, 'floor_plan_3d_model');
    assert.equal(body.max_tokens, 4096);
    const user = body.messages?.find((message) => message.role === 'user');
    const parts = user?.content as Array<{ type?: string; text?: string; image_url?: { url?: string } }>;
    assert.ok(Array.isArray(parts), 'user content must be a part array');
    const image = parts.find((part) => part.type === 'image_url');
    assert.ok(image?.image_url?.url?.startsWith('data:image/png;base64,'), 'image must be embedded');
    const text = parts.find((part) => part.type === 'text');
    assert.match(String(text?.text), /Musterstraße 12/);
    assert.match(String(text?.text), /107 m²/);
  });

  it('does not send a temperature by default', async () => {
    const capture: { body?: unknown } = {};
    const provider = new OpenAIFloorPlan3DProvider(makeFakeClient(sampleModel, capture));
    await provider.generate(sampleInput());
    const body = capture.body as { temperature?: unknown };
    assert.equal(body.temperature, undefined, 'temperature must be omitted by default');
  });

  it('honors FLOOR_PLAN_3D_MAX_TOKENS when set', async () => {
    process.env.FLOOR_PLAN_3D_MAX_TOKENS = '2048';
    const capture: { body?: unknown } = {};
    const provider = new OpenAIFloorPlan3DProvider(makeFakeClient(sampleModel, capture));
    await provider.generate(sampleInput());
    const body = capture.body as { max_tokens?: number };
    assert.equal(body.max_tokens, 2048);
  });

  it('throws when the model returns no parsed result', async () => {
    const provider = new OpenAIFloorPlan3DProvider(makeFakeClient(undefined));
    await assert.rejects(() => provider.generate(sampleInput()), /no structured result/i);
  });

  it('throws when the AI output violates the schema', async () => {
    const provider = new OpenAIFloorPlan3DProvider(
      makeFakeClient({ unit: 'm', rooms: [{ id: 'r1', name: '', x: 1, y: 1, width: 0, depth: 3 }] }),
    );
    await assert.rejects(() => provider.generate(sampleInput()));
  });

  it('throws when the API key is missing', () => {
    process.env.OPENAI_API_KEY = '';
    assert.throws(() => new OpenAIFloorPlan3DProvider(), /API key/i);
  });
});