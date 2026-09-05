import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  clampOpeningWidth,
  clampT,
  clampThickness,
  createDoor,
  createWall,
  createWindow,
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
    assert.deepEqual(emptyFloorPlan(), { walls: [], doors: [], windows: [], rooms: [] });
  });

  it('creates doors and windows attached to walls without absolute coordinates', () => {
    const door = createDoor('wall-1', 0.25, 0.9, 'right');
    assert.equal(door.wallId, 'wall-1');
    assert.equal(door.centerT, 0.25);
    assert.equal(door.swing, 'right');
    assert.ok(!('x' in door) && !('start' in door));
    const window = createWindow('wall-1', 1.5, 99);
    assert.equal(window.centerT, 1);
    assert.equal(window.width, 3);
  });

  it('clamps opening widths and fractional positions', () => {
    assert.equal(clampOpeningWidth(NaN), 0.9);
    assert.equal(clampOpeningWidth(0.1), 0.4);
    assert.equal(clampT(-2), 0);
    assert.equal(clampT(2), 1);
  });
});
