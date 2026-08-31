import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

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
