import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { makeFloorplan3DHandler } from './floorplan-3d.js';
import { MeltFlexError } from '../../lib/meltflex-provider.js';
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

describe('floorplan-3d handler', () => {
  it('resolves image from R2, calls MeltFlex with base64 fallback when no signed URL, and completes with modelUrl', async () => {
    const store = fakeStorage(new Map([['asset-1', Buffer.from('img')]]), { signedUrl: null });
    const prisma = fakePrisma();
    const updates: Array<Record<string, unknown>> = [];
    let meltCalled: string | null = null;

    const handler = makeFloorplan3DHandler({
      storage: store.storage,
      prisma: prisma.prisma,
      callMeltFlex: async (buf) => {
        meltCalled = 'base64';
        assert.ok(buf.length > 0);
        return { success: true, modelUrl: 'https://cdn.example.com/model.glb', format: 'glb', creditsUsed: 5 };
      },
      callMeltFlexViaUrl: async () => {
        meltCalled = 'url';
        throw new Error('should not be called');
      },
    });

    const result = await handler(ctx({ assetId: 'asset-1' }, updates));
    assert.equal(result.message, 'https://cdn.example.com/model.glb');
    assert.equal(meltCalled, 'base64');
    assert.ok(updates.some((u) => u.currentStep === 'loading_image'));
    assert.ok(updates.some((u) => u.currentStep === 'calling_meltflex'));
  });

  it('prefers signed imageUrl when available', async () => {
    const store = fakeStorage(new Map([['asset-1', Buffer.from('img')]]), { signedUrl: 'https://r2.example.com/signed' });
    const prisma = fakePrisma();
    let viaUrl = false;
    const handler = makeFloorplan3DHandler({
      storage: store.storage,
      prisma: prisma.prisma,
      callMeltFlexViaUrl: async (url) => {
        viaUrl = true;
        assert.equal(url, 'https://r2.example.com/signed');
        return { success: true, modelUrl: 'https://cdn.example.com/a.glb', format: 'glb' };
      },
      callMeltFlex: async () => {
        throw new Error('should not call base64');
      },
    });
    await handler(ctx({ assetId: 'asset-1' }, []));
    assert.equal(viaUrl, true);
  });

  it('handles 502 as failure (throws)', async () => {
    const store = fakeStorage(new Map([['asset-1', Buffer.from('img')]]));
    const handler = makeFloorplan3DHandler({
      storage: store.storage,
      prisma: fakePrisma().prisma,
      callMeltFlex: async () => {
        throw new MeltFlexError(502, 'server-error', 'bad gateway');
      },
      callMeltFlexViaUrl: async () => {
        throw new MeltFlexError(502, 'server-error', 'bad gateway');
      },
    });
    await assert.rejects(() => handler(ctx({ assetId: 'asset-1' }, [])), (e: Error) => {
      assert.match(e.message, /bad gateway/i);
      return true;
    });
  });

  it('handles 429 correctly', async () => {
    const store = fakeStorage(new Map([['asset-1', Buffer.from('img')]]));
    const handler = makeFloorplan3DHandler({
      storage: store.storage,
      prisma: fakePrisma().prisma,
      callMeltFlex: async () => {
        throw new MeltFlexError(429, 'rate-limited', 'rate limited');
      },
      callMeltFlexViaUrl: async () => {
        throw new MeltFlexError(429, 'rate-limited', 'rate limited');
      },
    });
    await assert.rejects(() => handler(ctx({ assetId: 'asset-1' }, [])), (e: Error) => {
      assert.equal((e as MeltFlexError).status, 429);
      return true;
    });
  });

  it('handles 401 auth failure', async () => {
    const store = fakeStorage(new Map([['asset-1', Buffer.from('img')]]));
    const handler = makeFloorplan3DHandler({
      storage: store.storage,
      prisma: fakePrisma().prisma,
      callMeltFlex: async () => {
        throw new MeltFlexError(401, 'unauthorized', 'auth failed');
      },
      callMeltFlexViaUrl: async () => {
        throw new MeltFlexError(401, 'unauthorized', 'auth failed');
      },
    });
    await assert.rejects(() => handler(ctx({ assetId: 'asset-1' }, [])), (e: Error) => {
      assert.equal((e as MeltFlexError).status, 401);
      return true;
    });
  });

  it('fails on malformed response (no modelUrl nor model)', async () => {
    const store = fakeStorage(new Map([['asset-1', Buffer.from('img')]]));
    const handler = makeFloorplan3DHandler({
      storage: store.storage,
      prisma: fakePrisma().prisma,
      callMeltFlex: async () => {
        throw new MeltFlexError(502, 'malformed-response', 'missing modelUrl');
      },
      callMeltFlexViaUrl: async () => {
        throw new MeltFlexError(502, 'malformed-response', 'missing modelUrl');
      },
    });
    await assert.rejects(() => handler(ctx({ assetId: 'asset-1' }, [])));
  });

  it('stores base64 fallback GLB to R2 and returns file URL', async () => {
    const glb = Buffer.from('glTFxxxx'); // minimal header
    const b64 = glb.toString('base64');
    const map = new Map<string, Buffer>([['asset-1', Buffer.from('img')]]);
    const store = fakeStorage(map);
    const prisma = fakePrisma();
    const handler = makeFloorplan3DHandler({
      storage: store.storage,
      prisma: prisma.prisma,
      callMeltFlex: async () => ({ success: true, model: b64, format: 'glb' }),
      callMeltFlexViaUrl: async () => {
        throw new Error('no url');
      },
    });
    // ensure no signed url and no public base url
    delete process.env.PUBLIC_API_BASE_URL;
    const result = await handler(ctx({ assetId: 'asset-1' }, []));
    assert.equal(result.message, '/api/floorplan3d/result/job-1/file');
    assert.ok(store.puts.some((p) => p.id === 'floorplan-result-job-1'));
  });

  it('cleanup preserves original asset', async () => {
    const map = new Map<string, Buffer>([['asset-1', Buffer.from('img')]]);
    const store = fakeStorage(map);
    const handler = makeFloorplan3DHandler({
      storage: store.storage,
      prisma: fakePrisma().prisma,
      callMeltFlex: async () => ({ success: true, modelUrl: 'https://cdn.example.com/a.glb', format: 'glb' }),
      callMeltFlexViaUrl: async () => {
        throw new Error('no');
      },
    });
    await handler(ctx({ assetId: 'asset-1' }, []));
    assert.ok(map.has('asset-1'), 'original asset must not be deleted');
  });
});
