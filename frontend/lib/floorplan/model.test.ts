import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  clampThickness,
  createWall,
  emptyFloorPlan,
  isValidWall,
  wallLength,
  wallsBoundingBox,
} from './model';

describe('floorplan model', () => {
  it('creates walls with unique ids and real-world geometry', () => {
    const a = createWall({ x: 0, y: 0 }, { x: 3, y: 4 });
    const b = createWall({ x: 0, y: 0 }, { x: 1, y: 0 });
    assert.notEqual(a.id, b.id);
    assert.equal(wallLength(a), 5);
    assert.equal(a.thickness, 0.2);
  });

  it('rejects degenerate walls', () => {
    assert.equal(isValidWall({ start: { x: 0, y: 0 }, end: { x: 0, y: 0 } }), false);
    assert.equal(isValidWall({ start: { x: 0, y: 0 }, end: { x: 1, y: 0 } }), true);
  });

  it('clamps wall thickness to a sane range', () => {
    assert.equal(clampThickness(0.2), 0.2);
    assert.equal(clampThickness(0), 0.05);
    assert.equal(clampThickness(5), 1);
    assert.equal(clampThickness(NaN), 0.2);
  });

  it('computes a bounding box over walls', () => {
    assert.equal(wallsBoundingBox([]), null);
    const box = wallsBoundingBox([
      createWall({ x: 0, y: 0 }, { x: 2, y: 1 }),
      createWall({ x: -1, y: 5 }, { x: 4, y: 3 }),
    ]);
    assert.deepEqual(box, { minX: -1, minY: 0, maxX: 4, maxY: 5 });
  });

  it('starts from an empty plan', () => {
    assert.deepEqual(emptyFloorPlan(), { walls: [] });
  });
});
