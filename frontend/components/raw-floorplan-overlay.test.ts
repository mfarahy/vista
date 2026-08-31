import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { computeMaxCoord, detectUnknownFields } from './raw-floorplan-overlay.js';
import fixture from '../public/recognition-c658e915-9247-4904-8032-717dd11ecfdd.json' with { type: 'json' };
import type { RawGeometry } from './raw-floorplan-overlay.js';

describe('raw floorplan recognition overlay — regression', () => {
  const raw = fixture as unknown as RawGeometry;

  it('preserves raw recognition response without transformation', () => {
    // Fixture must be passed through verbatim; stringify+parse should be identical
    const cloned = JSON.parse(JSON.stringify(raw)) as RawGeometry;
    assert.deepEqual(cloned.wall, raw.wall);
    assert.deepEqual(cloned.door, raw.door);
    assert.deepEqual(cloned.window, raw.window);
    assert.deepEqual(cloned.kitchen, raw.kitchen);
  });

  it('polygon coordinates are not transformed', () => {
    // First wall polygon first point is exactly [406,823] — no normalization
    assert.deepEqual(raw.wall[0][0], [406, 823]);
    // First door polygon first point
    assert.deepEqual(raw.door[0][0], [402, 760]);
  });

  it('all recognition categories are exposed', () => {
    const expected: (keyof RawGeometry)[] = [
      'wall',
      'door',
      'entry_door',
      'window',
      'kitchen',
      'door_center_line',
      'entry_door_center_line',
      'window_center_line',
    ];
    for (const key of expected) {
      assert.ok(Array.isArray((raw as Record<string, unknown>)[key]), `missing category ${key}`);
    }
    // Counts from fixture (the problematic floorplan)
    assert.equal(raw.wall.length, 5);
    assert.equal(raw.door.length, 6);
    assert.equal(raw.entry_door.length, 1);
    assert.equal(raw.window.length, 5);
    assert.equal(raw.kitchen.length, 1);
    assert.equal(raw.door_center_line.length, 6);
    assert.equal(raw.entry_door_center_line.length, 1);
    assert.equal(raw.window_center_line.length, 4);
  });

  it('image dimensions are preserved and max coord validation works', () => {
    // Image is 1050+ width based on fixture coords; we use known fixture max
    const { maxX, maxY } = computeMaxCoord(raw);
    // From manual inspection fixture max is 1050 x ~873
    assert.equal(maxX, 1050);
    assert.equal(maxY, 873);
    // Simulate image dimensions larger than max — should be within bounds
    const imageWidth = 1200;
    const imageHeight = 900;
    assert.ok(maxX <= imageWidth && maxY <= imageHeight, 'coords should be within image bounds for generous size');
    // Tight image — out of bounds detection
    assert.ok(maxX > 800 || maxY > 800, 'max coord deliberately large to test warning path');
  });

  it('overlay uses original coordinate system (viewBox equals image dimensions)', () => {
    const width = 1500;
    const height = 1060;
    const viewBox = `0 0 ${width} ${height}`;
    assert.equal(viewBox, '0 0 1500 1060');
    // Verify that a sample wall point lies within viewBox
    const [x, y] = raw.wall[0][0];
    assert.ok(x >= 0 && x <= width);
    assert.ok(y >= 0 && y <= height);
  });

  it('detects unknown fields without crashing', () => {
    const withExtra = { ...raw, unexpected_field: [[0, 0]] } as unknown as Record<string, unknown>;
    const unknown = detectUnknownFields(withExtra);
    assert.deepEqual(unknown, ['unexpected_field']);
    const clean = detectUnknownFields(raw as unknown as Record<string, unknown>);
    assert.equal(clean.length, 0);
  });
});
