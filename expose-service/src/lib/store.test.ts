import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vista-store-test-'));
process.env.DATA_DIR = tempDir;

const { createProperty, createDocument, listDocuments, updateDocument } = await import(
  './store.js'
);
const { getFloorPlan3D, saveFloorPlan3D } = await import('./store.js');
import type { FloorPlan3DRecord } from './floorplan-3d/types.js';

function sampleRecord(status: FloorPlan3DRecord['status']): FloorPlan3DRecord {
  const now = new Date().toISOString();
  return {
    status,
    provider: 'openai',
    sourceImageId: 'image-1',
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

describe('JSON store concurrency safety', () => {
  let propertyId: string;

  before(async () => {
    const property = await createProperty();
    propertyId = property.id;
  });

  after(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('persists every document when records are created concurrently', async () => {
    const created = await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        createDocument(propertyId, {
          filename: `doc-${index}.pdf`,
          mimeType: 'application/pdf',
          size: index,
          url: `/uploads/doc-${index}.pdf`,
        }),
      ),
    );
    const persisted = await listDocuments(propertyId);
    const ids = new Set(created.map((record) => record.id));
    assert.equal(persisted.length, 8, 'no created document may be lost');
    assert.deepEqual(
      persisted.map((record) => record.id).sort(),
      [...ids].sort(),
    );
  });

  it('applies concurrent status updates without lost updates', async () => {
    const records = await Promise.all(
      Array.from({ length: 5 }, (_, index) =>
        createDocument(propertyId, {
          filename: `update-${index}.pdf`,
          mimeType: 'application/pdf',
          size: index,
          url: `/uploads/update-${index}.pdf`,
        }),
      ),
    );
    await Promise.all(
      records.map((record, index) =>
        updateDocument(record.id, {
          status: 'completed',
          documentType: 'expose',
          tags: [`tag-${index}`],
        }),
      ),
    );
    const persisted = await listDocuments(propertyId);
    for (const record of records) {
      const found = persisted.find((item) => item.id === record.id);
      assert.ok(found, 'updated document must exist');
      assert.equal(found.status, 'completed');
      assert.ok(found.tags?.length, 'update must not be lost');
    }
  });
});

describe('floor plan 3D records', () => {
  let propertyId: string;

  before(async () => {
    const property = await createProperty();
    propertyId = property.id;
  });

  after(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('returns null before generation was started', async () => {
    assert.equal(await getFloorPlan3D(propertyId), null);
  });

  it('persists pending, completed, and failed status transitions', async () => {
    await saveFloorPlan3D(propertyId, sampleRecord('pending'));
    let record = await getFloorPlan3D(propertyId);
    assert.equal(record?.status, 'pending');
    assert.equal(record?.model, null);
    assert.equal(record?.sourceImageId, 'image-1');
    assert.equal(record?.provider, 'openai');

    await saveFloorPlan3D(propertyId, sampleRecord('completed'));
    record = await getFloorPlan3D(propertyId);
    assert.equal(record?.status, 'completed');
    assert.equal(record?.model?.rooms[0].name, 'Wohnzimmer');
    assert.equal(record?.error, null);

    await saveFloorPlan3D(propertyId, sampleRecord('failed'));
    record = await getFloorPlan3D(propertyId);
    assert.equal(record?.status, 'failed');
    assert.equal(record?.model, null);
    assert.match(record?.error ?? '', /openai exploded/);
  });
});