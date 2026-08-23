import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

process.env.OPENAI_API_KEY = '';
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vista-floorplan3d-route-test-'));
process.env.DATA_DIR = tempDir;
process.env.UPLOAD_DIR = path.join(tempDir, 'uploads');

const { createApp } = await import('../app.js');
const { addImage, createProperty, saveFloorPlan3D } = await import('../lib/store.js');
import type { FloorPlan3DRecord } from '../lib/floorplan-3d/types.js';

function record(status: FloorPlan3DRecord['status'], sourceImageId: string): FloorPlan3DRecord {
  const now = new Date().toISOString();
  return {
    status,
    provider: 'openai',
    sourceImageId,
    model:
      status === 'completed'
        ? {
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
                areaM2: null,
              },
            ],
            walls: [],
            doors: [],
            windows: [],
          }
        : null,
    error: status === 'failed' ? 'openai exploded' : null,
    createdAt: now,
    updatedAt: now,
  };
}

describe('floor plan 3D endpoints', () => {
  let server: Server;
  let baseUrl: string;

  before(async () => {
    const app = createApp();
    server = app.listen(0);
    await new Promise<void>((resolve) => server.once('listening', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  after(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    // Let background generation runs (fire-and-forget) settle before cleanup.
    await new Promise((resolve) => setTimeout(resolve, 300));
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('returns null before generation was started', async () => {
    const property = await createProperty();
    const response = await fetch(`${baseUrl}/api/properties/${property.id}/floorplan3d`);
    assert.equal(response.status, 200);
    assert.equal(await response.json(), null);
  });

  it('returns 422 when no floor plan has been uploaded', async () => {
    const property = await createProperty();
    const response = await fetch(`${baseUrl}/api/properties/${property.id}/floorplan3d`, {
      method: 'POST',
    });
    assert.equal(response.status, 422);
    const body = (await response.json()) as { error?: string };
    assert.ok(body.error, 'expected a German error message');
  });

  type GenerationRecord = {
    status?: string;
    provider?: string;
    error?: string | null;
  };

  it('triggers generation and persists a pending record', async () => {
    const property = await createProperty();
    const image = await addImage(property.id, {
      url: '/uploads/plan.png',
      fileName: 'plan.png',
      mimeType: 'image/png',
      size: 100,
      sequence: 0,
      isCover: false,
      category: 'floor_plan',
      subcategory: 'ground_floor',
    });
    assert.ok(image);

    const response = await fetch(`${baseUrl}/api/properties/${property.id}/floorplan3d`, {
      method: 'POST',
    });
    assert.equal(response.status, 202);
    const body = (await response.json()) as { status?: string; sourceImageId?: string };
    assert.equal(body.status, 'pending');
    assert.equal(body.sourceImageId, image.id);

    let record: GenerationRecord | null = null;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const statusResponse = await fetch(
        `${baseUrl}/api/properties/${property.id}/floorplan3d`,
      );
      const polled = (await statusResponse.json()) as GenerationRecord | null;
      if (polled && polled.status !== 'pending') {
        record = polled;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    assert.ok(record, 'a generation record must be persisted');
    assert.equal(record.status, 'failed');
    assert.equal(record.provider, 'openai');
    assert.ok(record.error, 'the failure reason must be recorded');
  });

  it('returns an existing completed record instead of regenerating', async () => {
    const property = await createProperty();
    const image = await addImage(property.id, {
      url: '/uploads/plan.png',
      fileName: 'plan.png',
      mimeType: 'image/png',
      size: 100,
      sequence: 0,
      isCover: false,
      category: 'floor_plan',
    });
    await saveFloorPlan3D(property.id, record('completed', image!.id));

    const response = await fetch(`${baseUrl}/api/properties/${property.id}/floorplan3d`, {
      method: 'POST',
    });
    assert.equal(response.status, 200);
    const body = (await response.json()) as { status?: string; model?: unknown };
    assert.equal(body.status, 'completed');
    assert.ok(body.model, 'the completed model is returned without regenerating');
  });

  it('regenerates after a failed attempt', async () => {
    const property = await createProperty();
    const image = await addImage(property.id, {
      url: '/uploads/plan.png',
      fileName: 'plan.png',
      mimeType: 'image/png',
      size: 100,
      sequence: 0,
      isCover: false,
      category: 'floor_plan',
    });
    await saveFloorPlan3D(property.id, record('failed', image!.id));

    const response = await fetch(`${baseUrl}/api/properties/${property.id}/floorplan3d`, {
      method: 'POST',
    });
    assert.equal(response.status, 202, 'a failed record is retried');
  });
});