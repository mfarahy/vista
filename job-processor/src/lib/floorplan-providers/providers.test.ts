import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { FloorplanRecognitionProvider } from './floorplan-recognition-provider.js';
import { MeltFlexProvider } from './meltflex-provider.js';
import { resolveProvider, getDefaultProviderName } from './provider-resolver.js';
import { buildGlbFromGeometry } from './glb-builder.js';
import type { FloorPlanGeometry } from './types.js';
import { getLogger } from '../logger.js';

const log = getLogger();

describe('FloorplanRecognitionProvider', () => {
  it('isAvailable when apiUrl is set', () => {
    const provider = new FloorplanRecognitionProvider({ apiUrl: 'http://localhost:5000/predictions' });
    assert.equal(provider.isAvailable(), true);
    assert.equal(provider.name, 'floorplan-recognition');
  });

  it('returns geometry result type', async () => {
    const mockGeometry: FloorPlanGeometry = {
      wall: [[[100, 100], [200, 100], [200, 200], [100, 200]]],
      door: [],
      entry_door: [],
      window: [[[150, 100], [180, 100], [180, 120], [150, 120]]],
      kitchen: [],
      door_center_line: [],
      entry_door_center_line: [],
      window_center_line: [],
    };

    const provider = new FloorplanRecognitionProvider({ apiUrl: 'http://test:5000' });

    // Mock fetch
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      return new Response(JSON.stringify({ output: JSON.stringify(mockGeometry), status: 'succeeded' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    try {
      const result = await provider.process(
        { assetId: 'test-1', imageUrl: 'http://example.com/img.png', mimeType: 'image/png', imageBuffer: Buffer.from('img') },
        log,
      );
      assert.equal(result.type, 'geometry');
      if (result.type === 'geometry') {
        assert.equal(result.geometry.wall.length, 1);
        assert.equal(result.geometry.window.length, 1);
      }
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('throws on non-OK response', async () => {
    const provider = new FloorplanRecognitionProvider({ apiUrl: 'http://test:5000' });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response('error', { status: 500 });

    try {
      await assert.rejects(
        () => provider.process(
          { assetId: 'test-2', imageUrl: 'http://example.com/img.png', mimeType: 'image/png', imageBuffer: Buffer.from('img') },
          log,
        ),
        (e: Error) => e.message.includes('500'),
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('throws on no output', async () => {
    const provider = new FloorplanRecognitionProvider({ apiUrl: 'http://test:5000' });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response(JSON.stringify({ status: 'succeeded' }), { status: 200 });

    try {
      await assert.rejects(
        () => provider.process(
          { assetId: 'test-3', imageUrl: 'http://example.com/img.png', mimeType: 'image/png', imageBuffer: Buffer.from('img') },
          log,
        ),
        (e: Error) => e.message.includes('no output'),
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe('MeltFlexProvider', () => {
  it('isAvailable when MELTFLEX_API_KEY is set', () => {
    process.env.MELTFLEX_API_KEY = 'test-key';
    const provider = new MeltFlexProvider();
    assert.equal(provider.isAvailable(), true);
    assert.equal(provider.name, 'meltflex');
    delete process.env.MELTFLEX_API_KEY;
  });

  it('isAvailable returns false when no API key', () => {
    delete process.env.MELTFLEX_API_KEY;
    const provider = new MeltFlexProvider();
    assert.equal(provider.isAvailable(), false);
  });
});

describe('resolveProvider', () => {
  it('returns floorplan-recognition provider by default', () => {
    const provider = resolveProvider();
    // Will be null if recognition URL is not set, which is expected
    if (process.env.FLOORPLAN_RECOGNITION_URL) {
      assert.equal(provider?.name, 'floorplan-recognition');
    }
  });

  it('returns null for unknown provider name', () => {
    const provider = resolveProvider('unknown-provider');
    assert.equal(provider, null);
  });

  it('returns null when provider is not available', () => {
    delete process.env.MELTFLEX_API_KEY;
    const provider = resolveProvider('meltflex');
    assert.equal(provider, null);
  });
});

describe('getDefaultProviderName', () => {
  it('returns floorplan-recognition by default', () => {
    delete process.env.FLOORPLAN_3D_PROVIDER;
    assert.equal(getDefaultProviderName(), 'floorplan-recognition');
  });

  it('respects FLOORPLAN_3D_PROVIDER env', () => {
    process.env.FLOORPLAN_3D_PROVIDER = 'meltflex';
    assert.equal(getDefaultProviderName(), 'meltflex');
    delete process.env.FLOORPLAN_3D_PROVIDER;
  });

  it('falls back to floorplan-recognition for unknown values', () => {
    process.env.FLOORPLAN_3D_PROVIDER = 'unknown';
    assert.equal(getDefaultProviderName(), 'floorplan-recognition');
    delete process.env.FLOORPLAN_3D_PROVIDER;
  });
});

describe('buildGlbFromGeometry', () => {
  it('returns a valid GLB buffer with glTF magic', () => {
    const geometry: FloorPlanGeometry = {
      wall: [[[100, 100], [300, 100], [300, 200], [100, 200]]],
      door: [[[150, 100], [170, 100], [170, 100], [150, 100]]],
      entry_door: [],
      window: [[[200, 100], [220, 100], [220, 120], [200, 120]]],
      kitchen: [],
      door_center_line: [],
      entry_door_center_line: [],
      window_center_line: [],
    };

    const glb = buildGlbFromGeometry(geometry);
    assert.ok(glb.length >= 12, 'GLB should be at least 12 bytes');
    assert.equal(glb.subarray(0, 4).toString(), 'glTF', 'GLB should start with glTF magic');
    assert.equal(glb.readUInt32LE(4), 2, 'GLB version should be 2');
    assert.equal(glb.readUInt32LE(8), glb.length, 'GLB length should match');
  });

  it('returns a valid GLB for empty geometry', () => {
    const geometry: FloorPlanGeometry = {
      wall: [],
      door: [],
      entry_door: [],
      window: [],
      kitchen: [],
      door_center_line: [],
      entry_door_center_line: [],
      window_center_line: [],
    };

    const glb = buildGlbFromGeometry(geometry);
    assert.ok(glb.length >= 12);
    assert.equal(glb.subarray(0, 4).toString(), 'glTF');
  });
});
