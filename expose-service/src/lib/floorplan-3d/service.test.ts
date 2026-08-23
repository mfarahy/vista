import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import type { PropertyImage } from '../types.js';
import type { FloorPlan3DModel } from './schema.js';
import type { FloorPlan3DProvider, FloorPlan3DRecord } from './types.js';
import { generateFloorPlan3D } from './service.js';

const sampleModel: FloorPlan3DModel = {
  unit: 'm',
  rooms: [
    { id: 'room-1', name: 'Wohnzimmer', level: 0, x: 3, y: 2, width: 6, depth: 4, height: 2.5, areaM2: 24 },
  ],
  walls: [],
  doors: [],
  windows: [],
};

const image: PropertyImage = {
  id: 'image-1',
  url: '/uploads/plan.png',
  fileName: 'plan.png',
  mimeType: 'image/png',
  size: 100,
  sequence: 0,
  isCover: false,
  category: 'floor_plan',
};

function failingProvider(message: string): FloorPlan3DProvider {
  return {
    name: 'test-provider',
    generate: async () => {
      throw new Error(message);
    },
  };
}

describe('generateFloorPlan3D', () => {
  afterEach(() => {
    delete process.env.FLOOR_PLAN_3D_PROVIDER;
  });

  it('persists pending, then completed with the generated model', async () => {
    const records: FloorPlan3DRecord[] = [];
    const provider: FloorPlan3DProvider = {
      name: 'test-provider',
      generate: async (input) => {
        assert.ok(input.imageBuffer.length > 0, 'provider must receive the image bytes');
        assert.equal(input.mimeType, 'image/png');
        return sampleModel;
      },
    };

    await generateFloorPlan3D('prop-1', image, {
      provider,
      readImage: async () => Buffer.from('plan-bytes'),
      persist: async (_id, record) => {
        records.push(record);
      },
    });

    assert.equal(records.length, 2);
    assert.equal(records[0].status, 'pending');
    assert.equal(records[0].provider, 'test-provider');
    assert.equal(records[0].sourceImageId, 'image-1');
    assert.equal(records[1].status, 'completed');
    assert.deepEqual(records[1].model, sampleModel);
    assert.equal(records[1].error, null);
  });

  it('persists a failed record with the error and never throws', async () => {
    const records: FloorPlan3DRecord[] = [];

    await generateFloorPlan3D('prop-1', image, {
      provider: failingProvider('openai exploded'),
      readImage: async () => Buffer.from('plan-bytes'),
      persist: async (_id, record) => {
        records.push(record);
      },
    });

    assert.equal(records.length, 2);
    assert.equal(records[0].status, 'pending');
    assert.equal(records[1].status, 'failed');
    assert.match(records[1].error ?? '', /openai exploded/);
    assert.equal(records[1].model, null);
  });

  it('persists a failed record when the image cannot be read', async () => {
    const records: FloorPlan3DRecord[] = [];

    await generateFloorPlan3D('prop-1', image, {
      provider: failingProvider('unused'),
      readImage: async () => {
        throw new Error('file missing');
      },
      persist: async (_id, record) => {
        records.push(record);
      },
    });

    assert.equal(records[1].status, 'failed');
    assert.match(records[1].error ?? '', /file missing/);
  });

  it('skips generation while another run for the same property is in flight', async () => {
    const records: FloorPlan3DRecord[] = [];
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const provider: FloorPlan3DProvider = {
      name: 'test-provider',
      generate: async () => {
        await gate;
        return sampleModel;
      },
    };

    const first = generateFloorPlan3D('prop-1', image, {
      provider,
      readImage: async () => Buffer.from('plan-bytes'),
      persist: async (_id, record) => {
        records.push(record);
      },
    });
    const second = generateFloorPlan3D('prop-1', image, {
      provider,
      readImage: async () => Buffer.from('plan-bytes'),
      persist: async (_id, record) => {
        records.push(record);
      },
    });
    release();
    await Promise.all([first, second]);

    assert.equal(records.length, 2, 'only the first run may persist records');
    assert.equal(records[0].status, 'pending');
    assert.equal(records[1].status, 'completed');
  });
});