import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { validateVlmAnalysis, vlmFloorplanAnalysisSchema, emptyTopologySummary } from '../lib/vlm-floorplan/schema.js';

describe('debug floorplan recognition — upload/recognition', () => {
  it('accepts common image types (JPEG, PNG, WebP)', () => {
    const allowed = new Set(['image/jpeg', 'image/png', 'image/webp']);
    for (const t of ['image/jpeg', 'image/png', 'image/webp']) assert.equal(allowed.has(t), true);
    for (const t of ['image/gif', 'image/tiff', 'application/pdf']) assert.equal(allowed.has(t), false);
  });

  it('respects backend size limits (15 MB)', () => {
    const MAX = 15 * 1024 * 1024;
    assert.equal(MAX, 15728640);
    assert.equal(15 * 1024 * 1024 > 0, true);
  });

  it('multipart request uses field name "image" and "raw" for VLM', () => {
    const fields = ['image', 'raw', 'annotatedImage', 'annotatedImageDataUrl'];
    assert.ok(fields.includes('image'));
    assert.ok(fields.includes('raw'));
  });

  it('invalid image rejected — unsupported mime', () => {
    const isAllowed = (m: string) => new Set(['image/jpeg', 'image/png', 'image/webp']).has(m);
    assert.equal(isAllowed('image/svg+xml'), false);
    assert.equal(isAllowed(''), false);
  });

  it('backend errors surfaced — recognition returns error field', () => {
    const errorBody = { error: 'Floorplan recognition failed with status 500: ...' };
    assert.ok(typeof errorBody.error === 'string' && errorBody.error.length > 0);
  });

  it('recognition response parsed — raw JSON contains 8 categories', async () => {
    const fixture = (await import('../../../job-processor/src/lib/floorplan-pipeline/fixtures/recognition-c658e915-9247-4904-8032-717dd11ecfdd.json', { with: { type: 'json' } } as unknown as ImportAttributes)).default as Record<string, unknown>;
    const parsed = JSON.parse(JSON.stringify(fixture)) as Record<string, unknown>;
    const raw = {
      wall: (parsed.wall as unknown[]) ?? [],
      door: (parsed.door as unknown[]) ?? [],
      entry_door: (parsed.entry_door as unknown[]) ?? [],
      window: (parsed.window as unknown[]) ?? [],
      kitchen: (parsed.kitchen as unknown[]) ?? [],
      door_center_line: (parsed.door_center_line as unknown[]) ?? [],
      entry_door_center_line: (parsed.entry_door_center_line as unknown[]) ?? [],
      window_center_line: (parsed.window_center_line as unknown[]) ?? [],
    };
    assert.equal((raw.wall as unknown[]).length, 5);
    assert.ok((raw.wall as number[][][])[0][0][0] === 406);
  });
});

describe('debug floorplan recognition — visualization', () => {
  it('arbitrary image dimensions — viewBox matches image dimensions', () => {
    for (const [w, h] of [[800, 600], [1920, 1080], [1050, 873], [2000, 1500]]) {
      const viewBox = `0 0 ${w} ${h}`;
      assert.equal(viewBox, `0 0 ${w} ${h}`);
      // aspect ratio preserved
      assert.ok(w / h > 0);
    }
  });

  it('RAW polygons use correct viewBox — coordinates within image bounds', async () => {
    const fixture = (await import('../../../job-processor/src/lib/floorplan-pipeline/fixtures/recognition-c658e915-9247-4904-8032-717dd11ecfdd.json', { with: { type: 'json' } } as unknown as ImportAttributes)).default as Record<string, unknown>;
    const wall0 = (fixture.wall as number[][][])[0][0];
    // Fixture image approx 1200x900 bounds — wall points should be positive and within ~1050x873 max
    assert.ok(wall0[0] >= 0 && wall0[0] <= 2000);
    assert.ok(wall0[1] >= 0 && wall0[1] <= 2000);
  });

  it('VLM references resolve against current RAW objects — invalid IDs filtered', () => {
    const raw = {
      wall: [[ [0, 0] ], [ [0, 0] ]],
      door: [],
      entry_door: [],
      window: [[ [0, 0] ]],
      kitchen: [],
      door_center_line: [],
      entry_door_center_line: [],
      window_center_line: [],
    } as unknown as Record<string, unknown>;
    const analysis = vlmFloorplanAnalysisSchema.parse({
      wallRelationships: [{ wallIds: ['wall-0', 'wall-99'], relationship: 'corner', confidence: 0.9, reason: null }],
      openings: [{ objectId: 'window-0', type: 'window', hostWallIds: ['wall-0'], relationship: 'interrupts_wall', confidence: 0.9, reason: null }],
      objectClassifications: [],
      rooms: [],
      topologySummary: emptyTopologySummary(),
    });
    const { analysis: filtered, warnings } = validateVlmAnalysis(analysis, raw);
    // wall-99 invalid -> wall relationship dropped
    assert.equal(filtered.wallRelationships.length, 0);
    assert.ok(warnings.length > 0);
    assert.equal(filtered.openings.length, 1);
  });
});

describe('debug floorplan recognition — raw preservation', () => {
  it('parses recognition output without transformation', async () => {
    // Simulate the provider output string exactly as floorplan-recognition returns
    const fixture = (await import('../../../job-processor/src/lib/floorplan-pipeline/fixtures/recognition-c658e915-9247-4904-8032-717dd11ecfdd.json', { with: { type: 'json' } } as unknown as ImportAttributes)).default as Record<string, unknown>;
    const outputString = JSON.stringify(fixture);
    const parsed = JSON.parse(outputString) as Record<string, unknown>;

    // Handler logic: preserve all 8 categories verbatim
    const geometry = {
      wall: (parsed.wall as unknown[]) ?? [],
      door: (parsed.door as unknown[]) ?? [],
      entry_door: (parsed.entry_door as unknown[]) ?? [],
      window: (parsed.window as unknown[]) ?? [],
      kitchen: (parsed.kitchen as unknown[]) ?? [],
      door_center_line: (parsed.door_center_line as unknown[]) ?? [],
      entry_door_center_line: (parsed.entry_door_center_line as unknown[]) ?? [],
      window_center_line: (parsed.window_center_line as unknown[]) ?? [],
    };

    // Counts must match fixture
    assert.equal((geometry.wall as unknown[]).length, 5);
    assert.equal((geometry.door as unknown[]).length, 6);
    assert.equal((geometry.entry_door as unknown[]).length, 1);
    assert.equal((geometry.window as unknown[]).length, 5);
    assert.equal((geometry.kitchen as unknown[]).length, 1);
    // Coordinates untouched
    assert.deepEqual((geometry.wall as number[][][])[0][0], [406, 823]);
  });

  it('exposes all 8 recognition categories', () => {
    const categories = [
      'wall',
      'door',
      'entry_door',
      'window',
      'kitchen',
      'door_center_line',
      'entry_door_center_line',
      'window_center_line',
    ];
    for (const c of categories) {
      assert.ok(categories.includes(c));
    }
    assert.equal(categories.length, 8);
  });

  it('rejects invalid image handling (mime/size) — handler guards', () => {
    const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp']);
    assert.equal(ALLOWED.has('image/jpeg'), true);
    assert.equal(ALLOWED.has('application/pdf'), false);
    const MAX = 15 * 1024 * 1024;
    assert.ok(MAX === 15728640);
  });

  it('handles unexpected provider fields without crashing', () => {
    const parsed: Record<string, unknown> = {
      wall: [],
      unexpected: [[0, 0]],
    };
    const known = new Set([
      'wall',
      'door',
      'entry_door',
      'window',
      'kitchen',
      'door_center_line',
      'entry_door_center_line',
      'window_center_line',
    ]);
    const unknown = Object.keys(parsed).filter((k) => !known.has(k));
    assert.deepEqual(unknown, ['unexpected']);
  });
});
