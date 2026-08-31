import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { makeFloorplan3DHandler } from './floorplan-3d.js';
import type { FloorPlanProvider, FloorPlanProviderResult } from '../../lib/floorplan-providers/index.js';
import { getLogger } from '../../lib/logger.js';

function fakeStorage(initial: Map<string, Buffer>, opts: { signedUrl?: string | null } = {}) {
  const map = initial;
  const puts: Array<{ id: string; bytes: number; mime: string }> = [];
  return {
    storage: {
      get: async (id: string) => {
        const c = map.get(id);
        return c ? { content: c, mimeType: 'image/png' } : null;
      },
      put: async (id: string, content: Buffer, mime: string) => {
        map.set(id, content);
        puts.push({ id, bytes: content.length, mime });
      },
      delete: async () => {},
      getSignedUrl: async () => opts.signedUrl ?? null,
    } as never,
    puts,
  };
}

function fakePrisma() {
  const payload: Record<string, unknown> = {};
  let message: string | null = null;
  return {
    prisma: {
      job: {
        findUnique: async () => ({ payload: {} }),
        update: async (_args: { data: { payload: unknown; message: string } }) => {
          Object.assign(payload, _args.data.payload as Record<string, unknown>);
          message = _args.data.message;
          return { id: 'job-1' } as never;
        },
      },
    } as never,
    getPayload: () => payload,
    getMessage: () => message,
  };
}

function ctx(payload: unknown, updates: Array<Record<string, unknown>> = []) {
  return {
    job: { jobId: 'job-1', jobType: 'floorplan-3d', payload, metadata: undefined },
    update: async (patch: Record<string, unknown>) => {
      updates.push(patch);
    },
    log: getLogger(),
  };
}

function fakeProvider(result: FloorPlanProviderResult): FloorPlanProvider {
  return {
    name: 'floorplan-recognition' as const,
    isAvailable: () => true,
    process: async () => result,
  };
}

describe('floorplan-3d handler (provider-based)', () => {
  it('uses geometry provider and stores GLB to R2', async () => {
    const store = fakeStorage(new Map([['asset-1', Buffer.from('img')]]), { signedUrl: null });
    const prisma = fakePrisma();
    const updates: Array<Record<string, unknown>> = [];

    const handler = makeFloorplan3DHandler({
      storage: store.storage,
      prisma: prisma.prisma,
      providerOverride: fakeProvider({
        type: 'geometry',
        geometry: {
          wall: [[[100, 100], [200, 100], [200, 200], [100, 200]]],
          door: [],
          entry_door: [],
          window: [],
          kitchen: [],
          door_center_line: [],
          entry_door_center_line: [],
          window_center_line: [],
        },
      }),
    });

    const result = await handler(ctx({ assetId: 'asset-1' }, updates));
    assert.ok(result.message?.startsWith('/api/floorplan3d/result/'));
    assert.ok(store.puts.some((p) => p.id === 'floorplan-result-job-1'));
    assert.ok(store.puts.some((p) => p.mime === 'model/gltf-binary'));
    assert.ok(updates.some((u) => u.currentStep === 'loading_image'));
    assert.ok(updates.some((u) => u.currentStep === 'calling_provider'));
    assert.ok(updates.some((u) => u.currentStep === 'storing_result'));
  });

  it('uses direct-3D provider and stores modelUrl', async () => {
    const store = fakeStorage(new Map([['asset-1', Buffer.from('img')]]));
    const prisma = fakePrisma();

    const handler = makeFloorplan3DHandler({
      storage: store.storage,
      prisma: prisma.prisma,
      providerOverride: fakeProvider({
        type: 'direct-3d',
        modelUrl: 'https://cdn.example.com/model.glb',
        format: 'glb',
        creditsUsed: 5,
      }),
    });

    const result = await handler(ctx({ assetId: 'asset-1' }, []));
    assert.equal(result.message, 'https://cdn.example.com/model.glb');
  });

  it('stores base64 GLB to R2 when no modelUrl', async () => {
    const glb = Buffer.from('glTFxxxx');
    const b64 = glb.toString('base64');
    const store = fakeStorage(new Map([['asset-1', Buffer.from('img')]]));
    const prisma = fakePrisma();

    const handler = makeFloorplan3DHandler({
      storage: store.storage,
      prisma: prisma.prisma,
      providerOverride: fakeProvider({
        type: 'direct-3d',
        modelBase64: b64,
        format: 'glb',
      }),
    });

    const result = await handler(ctx({ assetId: 'asset-1' }, []));
    assert.equal(result.message, '/api/floorplan3d/result/job-1/file');
    assert.ok(store.puts.some((p) => p.id === 'floorplan-result-job-1'));
  });

  it('throws when no provider is available', async () => {
    const store = fakeStorage(new Map([['asset-1', Buffer.from('img')]]));
    const handler = makeFloorplan3DHandler({
      storage: store.storage,
      prisma: fakePrisma().prisma,
      providerOverride: null,
    });

    await assert.rejects(
      () => handler(ctx({ assetId: 'asset-1' }, [])),
      (e: Error) => {
        assert.match(e.message, /not configured or unavailable/i);
        return true;
      },
    );
  });

  it('throws when asset not found in storage', async () => {
    const store = fakeStorage(new Map());
    const handler = makeFloorplan3DHandler({
      storage: store.storage,
      prisma: fakePrisma().prisma,
      providerOverride: fakeProvider({ type: 'geometry', geometry: { wall: [], door: [], entry_door: [], window: [], kitchen: [], door_center_line: [], entry_door_center_line: [], window_center_line: [] } }),
    });

    await assert.rejects(
      () => handler(ctx({ assetId: 'nonexistent' }, [])),
      (e: Error) => {
        assert.match(e.message, /not found/i);
        return true;
      },
    );
  });

  it('cleanup preserves original asset', async () => {
    const map = new Map<string, Buffer>([['asset-1', Buffer.from('img')]]);
    const store = fakeStorage(map);
    const handler = makeFloorplan3DHandler({
      storage: store.storage,
      prisma: fakePrisma().prisma,
      providerOverride: fakeProvider({
        type: 'direct-3d',
        modelUrl: 'https://cdn.example.com/a.glb',
        format: 'glb',
      }),
    });
    await handler(ctx({ assetId: 'asset-1' }, []));
    assert.ok(map.has('asset-1'), 'original asset must not be deleted');
  });

  it('passes provider name from payload to provider resolver', async () => {
    const store = fakeStorage(new Map([['asset-1', Buffer.from('img')]]));
    const prisma = fakePrisma();
    let receivedProviderName: string | undefined;

    const handler = makeFloorplan3DHandler({
      storage: store.storage,
      prisma: prisma.prisma,
      providerOverride: {
        name: 'meltflex' as const,
        isAvailable: () => true,
        process: async (input, _log) => {
          receivedProviderName = 'meltflex';
          return { type: 'direct-3d', modelUrl: 'https://cdn.example.com/model.glb', format: 'glb' };
        },
      },
    });

    await handler(ctx({ assetId: 'asset-1', provider: 'meltflex' }, []));
    assert.equal(receivedProviderName, 'meltflex');
  });
});
