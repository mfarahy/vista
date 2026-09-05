import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  exportFileName,
  importFloorPlanJson,
  serializeFloorPlan,
  toCanonicalObject,
} from './serialization.js';
import { planAddDoor, planAddWall, planAddWindow } from './plan-ops.js';
import { createWall, emptyFloorPlan, type FloorPlan } from './model.js';

function rectPlan(): FloorPlan {
  let plan = emptyFloorPlan();
  const walls = [
    createWall({ x: 0, y: 0 }, { x: 4, y: 0 }),
    createWall({ x: 4, y: 0 }, { x: 4, y: 3 }),
    createWall({ x: 4, y: 3 }, { x: 0, y: 3 }),
    createWall({ x: 0, y: 3 }, { x: 0, y: 0 }),
  ];
  for (const wall of walls) plan = planAddWall(plan, wall);
  const door = planAddDoor(plan, plan.walls[0].id, 0.5, 0.9, 'left');
  assert.ok(door);
  plan = door.plan;
  const window = planAddWindow(plan, plan.walls[2].id, 0.5, 1.2);
  assert.ok(window);
  return window.plan;
}

describe('floorplan serialization', () => {
  it('serializes only canonical data (no UI state)', () => {
    const parsed = JSON.parse(serializeFloorPlan(rectPlan())) as Record<string, unknown>;
    assert.deepEqual(Object.keys(parsed).sort(), ['doors', 'rooms', 'units', 'version', 'walls', 'windows']);
    assert.equal(parsed.version, 1);
    assert.equal(parsed.units, 'm');
    for (const wall of parsed.walls as Record<string, unknown>[]) {
      assert.deepEqual(Object.keys(wall).sort(), ['end', 'id', 'start', 'thickness']);
    }
    for (const door of parsed.doors as Record<string, unknown>[]) {
      assert.deepEqual(Object.keys(door).sort(), ['centerT', 'id', 'swing', 'wallId', 'width']);
      assert.ok(!('x' in door) && !('start' in door));
    }
    for (const window of parsed.windows as Record<string, unknown>[]) {
      assert.deepEqual(Object.keys(window).sort(), ['centerT', 'id', 'wallId', 'width']);
    }
  });

  it('is deterministic: entity order does not affect output', () => {
    const plan = rectPlan();
    const shuffled: FloorPlan = {
      ...plan,
      walls: [...plan.walls].reverse(),
      doors: [...plan.doors].reverse(),
      windows: [...plan.windows].reverse(),
      rooms: [...plan.rooms].reverse(),
    };
    assert.equal(serializeFloorPlan(shuffled), serializeFloorPlan(plan));
  });

  it('round-trips JSON → FloorPlan with equality', () => {
    const plan = toCanonicalObject(rectPlan());
    const result = importFloorPlanJson(serializeFloorPlan(plan));
    assert.equal(result.ok, true);
    assert.deepEqual(result.ok ? result.plan : null, plan);
  });

  it('imports a valid JSON plan', () => {
    const result = importFloorPlanJson(serializeFloorPlan(rectPlan()));
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.plan.walls.length, 4);
      assert.equal(result.plan.doors.length, 1);
      assert.equal(result.plan.windows.length, 1);
      assert.equal(result.plan.rooms.length, 1);
    }
  });

  it('rejects malformed JSON without throwing', () => {
    const result = importFloorPlanJson('{not json');
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.kind, 'parse');
      assert.equal(result.errors[0].code, 'malformed-json');
    }
  });

  it('rejects unsupported versions', () => {
    const plan = { ...toCanonicalObject(rectPlan()), version: 999 };
    const result = importFloorPlanJson(JSON.stringify(plan));
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.ok(result.errors.some((e) => e.code === 'unsupported-version'));
    }
  });

  it('rejects invalid door/window wall references on import', () => {
    const plan = toCanonicalObject(rectPlan());
    const tampered = {
      ...plan,
      doors: [{ ...plan.doors[0], wallId: 'missing-wall' }],
      windows: [{ ...plan.windows[0], wallId: 'missing-wall' }],
    };
    const result = importFloorPlanJson(JSON.stringify(tampered));
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.errors.filter((e) => e.code === 'invalid-wall-ref').length, 2);
    }
  });

  it('accepts legacy plans without version/units', () => {
    const plan = toCanonicalObject(rectPlan());
    const legacy = { walls: plan.walls, doors: plan.doors, windows: plan.windows, rooms: [] };
    const result = importFloorPlanJson(JSON.stringify(legacy));
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.plan.version, 1);
      assert.equal(result.plan.units, 'm');
      assert.equal(result.plan.rooms.length, 1);
    }
  });

  it('builds a sensible export filename', () => {
    assert.match(exportFileName(new Date(2026, 8, 5, 12, 0)), /^floorplan-2026-09-05-1200\.json$/);
  });
});
