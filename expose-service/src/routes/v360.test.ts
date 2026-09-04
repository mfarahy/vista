import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { createApp } from '../app.js';
import type { MediaStorage } from '../lib/media-storage.js';
import type {
  CreateFloorplanInput,
  CreatePanoramaInput,
  FloorplanPatch,
  FloorplanRecord,
  PanoramaRecord,
  V360Store,
} from '../lib/v360-store.js';
import type { RasterPredictResponse } from '../lib/raster2seq.js';

const PNG_HEADER = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function sampleAnalysis(): RasterPredictResponse {
  return {
    status: 'ok',
    request_id: 'req-123',
    room_count: 1,
    refined_room_count: 1,
    spaces: [
      {
        id: 1,
        category_id: 1,
        polygon: [
          [0, 0],
          [0, 100],
          [100, 100],
          [100, 0],
        ],
      },
    ],
    refined_spaces: [
      {
        id: 'r1',
        room_type: 'Living Room',
        area: 25,
        polygon: [
          [0, 0],
          [0, 100],
          [100, 100],
          [100, 0],
        ],
      },
    ],
  };
}

/** In-memory V360Store implementation for tests. */
class MemoryV360Store implements V360Store {
  floorplans = new Map<string, FloorplanRecord>();
  panoramas = new Map<string, PanoramaRecord>();

  async getFloorplan(id: string): Promise<FloorplanRecord | null> {
    return this.floorplans.get(id) ?? null;
  }

  async createFloorplan(input: CreateFloorplanInput): Promise<FloorplanRecord> {
    const record: FloorplanRecord = {
      id: input.id,
      propertyId: null,
      originalKey: input.originalKey,
      imageUrl: input.imageUrl,
      mimeType: input.mimeType,
      size: input.size,
      width: input.width ?? null,
      height: input.height ?? null,
      status: 'pending',
      error: null,
      analysisResult: null,
      floorBoundary: null,
      cameraX: null,
      cameraY: null,
      cameraYaw: null,
      panoramas: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.floorplans.set(record.id, record);
    return record;
  }

  async updateFloorplan(id: string, patch: FloorplanPatch): Promise<FloorplanRecord | null> {
    const existing = this.floorplans.get(id);
    if (!existing) return null;
    const updated: FloorplanRecord = { ...existing, ...patch };
    updated.updatedAt = new Date().toISOString();
    this.floorplans.set(id, updated);
    return updated;
  }

  async getPanorama(id: string): Promise<PanoramaRecord | null> {
    return this.panoramas.get(id) ?? null;
  }

  async createPanorama(input: CreatePanoramaInput): Promise<PanoramaRecord> {
    const record: PanoramaRecord = {
      id: input.id,
      floorplanId: input.floorplanId,
      originalKey: input.originalKey,
      imageUrl: input.imageUrl,
      mimeType: input.mimeType,
      size: input.size,
      cameraX: input.cameraX ?? null,
      cameraY: input.cameraY ?? null,
      cameraYaw: input.cameraYaw ?? null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.panoramas.set(record.id, record);
    const fp = this.floorplans.get(input.floorplanId);
    if (fp) fp.panoramas = [...fp.panoramas, record];
    return record;
  }
}

describe('Vista 360 floorplan/panorama API', () => {
  let server: Server;
  let baseUrl: string;
  let store: MemoryV360Store;
  let storage: MediaStorage;
  const stored = new Map<string, { content: Buffer; mimeType: string }>();

  const makeStorage = (): MediaStorage => ({
    put: async (key, content, mime) => stored.set(key, { content, mimeType: mime }),
    get: async (key) => {
      const v = stored.get(key);
      return v ? { content: v.content, mimeType: v.mimeType } : null;
    },
    delete: async (key) => void stored.delete(key),
  });

  before(async () => {
    store = new MemoryV360Store();
    storage = makeStorage();
    const app = createApp({ v360: { storage, store } });
    server = app.listen(0);
    await new Promise<void>((r) => server.once('listening', r));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  after(async () => {
    await new Promise<void>((r, rej) => server.close((e) => (e ? rej(e) : r())));
  });

  const uploadFloorplan = async (mime = 'image/png') => {
    const blob = new Blob([PNG_HEADER], { type: mime });
    const form = new FormData();
    form.append('image', blob, mime === 'image/png' ? 'plan.png' : 'plan.txt');
    form.append('width', '800');
    form.append('height', '600');
    const res = await fetch(`${baseUrl}/api/v360/floorplans`, {
      method: 'POST',
      body: form as unknown as BodyInit,
    });
    return res;
  };

  it('uploads a floorplan, stores it and creates a record', async () => {
    const res = await uploadFloorplan();
    assert.equal(res.status, 201);
    const body = (await res.json()) as { floorplan: FloorplanRecord };
    const fp = body.floorplan;
    assert.ok(fp.id);
    assert.equal(fp.status, 'pending');
    assert.equal(fp.width, 800);
    assert.equal(fp.height, 600);
    assert.equal(fp.imageUrl, `/api/v360/floorplans/${fp.id}/file`);

    assert.equal(stored.has(fp.originalKey), true);
    assert.equal(fp.originalKey, `floorplans/${fp.id}/original.png`);

    const imgRes = await fetch(`${baseUrl}${fp.imageUrl}`);
    assert.equal(imgRes.status, 200);
    assert.equal(imgRes.headers.get('content-type'), 'image/png');
  });

  it('rejects an invalid floorplan image', async () => {
    const res = await uploadFloorplan('application/pdf');
    assert.equal(res.status, 400);
    const body = (await res.json()) as { code: string };
    assert.equal(body.code, 'INVALID_IMAGE');
  });

  it('analyzes a floorplan, stores raw result + boundary, and supports retry', async () => {
    const res = await uploadFloorplan();
    const fp = ((await res.json()) as { floorplan: FloorplanRecord }).floorplan;

    let calls = 0;
    let fail = true;
    const app = createApp({
      v360: {
        storage,
        store,
        analyze: async () => {
          calls += 1;
          if (fail) throw new Error('Raster2Seq inference failed with status 500');
          return sampleAnalysis();
        },
      },
    });
    const srv = app.listen(0);
    await new Promise<void>((r) => srv.once('listening', r));
    const url = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;

    try {
      // First attempt fails -> status failed, retryable.
      const failRes = await fetch(`${url}/api/v360/floorplans/${fp.id}/analyze`, {
        method: 'POST',
      });
      assert.equal(failRes.status, 502);
      const failBody = (await failRes.json()) as { code: string; floorplan: FloorplanRecord };
      assert.equal(failBody.code, 'RASTER2SEQ_FAILED');
      assert.equal(failBody.floorplan.status, 'failed');
      assert.ok(failBody.floorplan.error);

      // Retry succeeds.
      fail = false;
      const okRes = await fetch(`${url}/api/v360/floorplans/${fp.id}/analyze`, { method: 'POST' });
      assert.equal(okRes.status, 200);
      const okBody = (await okRes.json()) as { floorplan: FloorplanRecord };
      assert.equal(okBody.floorplan.status, 'analyzed');
      assert.equal(okBody.floorplan.error, null);
      assert.ok(okBody.floorplan.floorBoundary);
      assert.equal(
        (okBody.floorplan.analysisResult as { request_id: string }).request_id,
        'req-123',
      );
      assert.equal(calls, 2);

      // The analyzed record is returned by GET.
      const getRes = await fetch(`${url}/api/v360/floorplans/${fp.id}`);
      const getBody = (await getRes.json()) as { floorplan: FloorplanRecord };
      assert.equal(getBody.floorplan.status, 'analyzed');
      assert.ok(getBody.floorplan.floorBoundary);
    } finally {
      await new Promise<void>((r) => srv.close(() => r()));
    }
  });

  it('saves a normalized camera position and rejects out-of-range values', async () => {
    const res = await uploadFloorplan();
    const fp = ((await res.json()) as { floorplan: FloorplanRecord }).floorplan;

    const ok = await fetch(`${baseUrl}/api/v360/floorplans/${fp.id}/camera`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cameraX: 0.42, cameraY: 0.63, cameraYaw: 90 }),
    });
    assert.equal(ok.status, 200);
    const okBody = (await ok.json()) as { floorplan: FloorplanRecord };
    assert.equal(okBody.floorplan.cameraX, 0.42);
    assert.equal(okBody.floorplan.cameraY, 0.63);
    assert.equal(okBody.floorplan.cameraYaw, 90);

    const bad = await fetch(`${baseUrl}/api/v360/floorplans/${fp.id}/camera`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cameraX: 1.5, cameraY: -0.1 }),
    });
    assert.equal(bad.status, 400);
    const badBody = (await bad.json()) as { code: string };
    assert.equal(badBody.code, 'INVALID_CAMERA');
  });

  it('uploads a panorama copying the floorplan camera position', async () => {
    const res = await uploadFloorplan();
    const fp = ((await res.json()) as { floorplan: FloorplanRecord }).floorplan;
    await fetch(`${baseUrl}/api/v360/floorplans/${fp.id}/camera`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cameraX: 0.5, cameraY: 0.5, cameraYaw: 45 }),
    });

    const blob = new Blob([PNG_HEADER], { type: 'image/png' });
    const form = new FormData();
    form.append('image', blob, 'pano.png');
    const panoRes = await fetch(`${baseUrl}/api/v360/floorplans/${fp.id}/panoramas`, {
      method: 'POST',
      body: form as unknown as BodyInit,
    });
    assert.equal(panoRes.status, 201);
    const panoBody = (await panoRes.json()) as { panorama: PanoramaRecord };
    const pano = panoBody.panorama;
    assert.equal(pano.floorplanId, fp.id);
    assert.equal(pano.cameraX, 0.5);
    assert.equal(pano.cameraY, 0.5);
    assert.equal(pano.cameraYaw, 45);
    assert.ok(pano.id.length > 0);
    assert.equal(pano.originalKey, `panoramas/${pano.id}/original.png`);
    assert.equal(pano.imageUrl, `/api/v360/panoramas/${pano.id}/file`);
    assert.equal(stored.has(pano.originalKey), true);

    const fileRes = await fetch(`${baseUrl}${pano.imageUrl}`);
    assert.equal(fileRes.status, 200);
    assert.equal(fileRes.headers.get('content-type'), 'image/png');

    // Floorplan GET includes the panorama.
    const getRes = await fetch(`${baseUrl}/api/v360/floorplans/${fp.id}`);
    const getBody = (await getRes.json()) as { floorplan: FloorplanRecord };
    assert.equal(getBody.floorplan.panoramas.length, 1);
    assert.equal(getBody.floorplan.panoramas[0].id, pano.id);
  });

  it('returns 404 for unknown floorplans/panoramas', async () => {
    const res = await fetch(`${baseUrl}/api/v360/floorplans/missing`);
    assert.equal(res.status, 404);
    const pano = await fetch(`${baseUrl}/api/v360/panoramas/missing/file`);
    assert.equal(pano.status, 404);
  });
});
