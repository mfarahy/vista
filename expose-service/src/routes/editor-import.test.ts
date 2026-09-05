import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { createApp } from '../app.js';
import type { RasterPredictResponse } from '../lib/raster2seq.js';

const PNG_HEADER = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function sampleAnalysis(): RasterPredictResponse {
  return {
    status: 'ok',
    request_id: 'req-editor-1',
    room_count: 2,
    refined_room_count: 2,
    spaces: [
      {
        id: 0,
        category_id: 2,
        label: 'Living Room',
        polygon: [
          [18.5, 22.0],
          [150.0, 22.0],
          [150.0, 128.5],
          [18.5, 128.5],
        ],
      },
      {
        id: 1,
        category_id: 10,
        label: 'Door',
        polygon: [
          [86.0, 104.0],
          [86.0, 125.0],
        ],
      },
    ],
    refined_spaces: [
      {
        id: '0',
        room_type: 'Living Room',
        area: 14075.7,
        polygon: [
          [18.5, 22.0],
          [150.0, 22.0],
          [150.0, 128.5],
          [18.5, 128.5],
        ],
        graph: [],
      },
    ],
  };
}

describe('Editor image import API', () => {
  let server: Server;
  let baseUrl: string;
  let analyzeImpl: () => Promise<RasterPredictResponse> = async () => sampleAnalysis();

  before(async () => {
    const app = createApp({
      editorImport: {
        analyze: async (image) => {
          assert.ok(Buffer.isBuffer(image.buffer));
          assert.ok(['image/jpeg', 'image/png', 'image/webp'].includes(image.mimeType));
          return analyzeImpl();
        },
      },
    });
    server = app.listen(0);
    await new Promise<void>((r) => server.once('listening', r));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  after(async () => {
    await new Promise<void>((r, rej) => server.close((e) => (e ? rej(e) : r())));
  });

  const postImage = (mime = 'image/png', bytes: Buffer = PNG_HEADER, field = 'image') => {
    const form = new FormData();
    form.append(field, new Blob([bytes], { type: mime }), 'plan.png');
    return fetch(`${baseUrl}/api/editor/floorplan-from-image`, {
      method: 'POST',
      body: form as unknown as BodyInit,
    });
  };

  it('returns the raw Raster2Seq result for a valid image', async () => {
    const res = await postImage();
    assert.equal(res.status, 200);
    const body = (await res.json()) as { result: RasterPredictResponse };
    assert.equal(body.result.status, 'ok');
    assert.equal(body.result.request_id, 'req-editor-1');
    assert.ok(Array.isArray(body.result.spaces));
    assert.ok(Array.isArray(body.result.refined_spaces));
  });

  it('rejects a missing image', async () => {
    const res = await fetch(`${baseUrl}/api/editor/floorplan-from-image`, { method: 'POST' });
    assert.equal(res.status, 400);
    const body = (await res.json()) as { code: string };
    assert.equal(body.code, 'INVALID_IMAGE');
  });

  it('rejects an unsupported image type', async () => {
    const res = await postImage('application/pdf', Buffer.from('%PDF-1.4 fake'));
    assert.equal(res.status, 400);
    const body = (await res.json()) as { code: string };
    assert.equal(body.code, 'INVALID_IMAGE');
  });

  it('maps a missing service configuration to 503', async () => {
    analyzeImpl = async () => {
      throw new Error('Raster2Seq is not configured (RASTER_AI_URL missing)');
    };
    try {
      const res = await postImage();
      assert.equal(res.status, 503);
      const body = (await res.json()) as { code: string };
      assert.equal(body.code, 'RASTER2SEQ_NOT_CONFIGURED');
    } finally {
      analyzeImpl = async () => sampleAnalysis();
    }
  });

  it('maps an unreachable service to 503', async () => {
    analyzeImpl = async () => {
      throw new Error('Raster2Seq inference service is not available at http://localhost:3026');
    };
    try {
      const res = await postImage();
      assert.equal(res.status, 503);
      const body = (await res.json()) as { code: string };
      assert.equal(body.code, 'RASTER2SEQ_UNAVAILABLE');
    } finally {
      analyzeImpl = async () => sampleAnalysis();
    }
  });

  it('maps a timeout to 504', async () => {
    analyzeImpl = async () => {
      throw new Error('Raster2Seq inference timed out after 300000ms');
    };
    try {
      const res = await postImage();
      assert.equal(res.status, 504);
      const body = (await res.json()) as { code: string };
      assert.equal(body.code, 'RASTER2SEQ_TIMEOUT');
    } finally {
      analyzeImpl = async () => sampleAnalysis();
    }
  });

  it('maps an inference failure to 502', async () => {
    analyzeImpl = async () => {
      throw new Error('Raster2Seq inference failed with status 500');
    };
    try {
      const res = await postImage();
      assert.equal(res.status, 502);
      const body = (await res.json()) as { code: string };
      assert.equal(body.code, 'RASTER2SEQ_FAILED');
    } finally {
      analyzeImpl = async () => sampleAnalysis();
    }
  });
});
