import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateFloorPlan } from './validation.js';
import { planAddDoor, planAddWall, planAddWindow } from './plan-ops.js';
import { createWall, emptyFloorPlan, type FloorPlan } from './model.js';
import { toCanonicalObject } from './serialization.js';

function rectPlan(): FloorPlan {
  let plan = emptyFloorPlan();
  for (const [sx, sy, ex, ey] of [
    [0, 0, 4, 0],
    [4, 0, 4, 3],
    [4, 3, 0, 3],
    [0, 3, 0, 0],
  ] as const) {
    plan = planAddWall(plan, createWall({ x: sx, y: sy }, { x: ex, y: ey }));
  }
  const door = planAddDoor(plan, plan.walls[0].id, 0.5, 0.9, 'left');
  assert.ok(door);
  const window = planAddWindow(door.plan, door.plan.walls[2].id, 0.5, 1.2);
  assert.ok(window);
  return window.plan;
}

function validJson(): Record<string, unknown> {
  return JSON.parse(JSON.stringify(toCanonicalObject(rectPlan()))) as Record<string, unknown>;
}

describe('floorplan validation', () => {
  it('accepts a valid plan', () => {
    const result = validateFloorPlan(validJson());
    assert.equal(result.valid, true);
    assert.deepEqual(result.errors, []);
  });

  it('accepts an empty plan', () => {
    assert.equal(validateFloorPlan(JSON.parse(JSON.stringify(emptyFloorPlan()))).valid, true);
  });

  it('rejects non-object input', () => {
    for (const input of [null, 42, 'plan', []]) {
      const result = validateFloorPlan(input);
      assert.equal(result.valid, false);
      assert.equal(result.errors[0].code, 'invalid-plan');
    }
  });

  it('rejects unsupported versions and invalid units', () => {
    const version = validJson();
    version.version = 2;
    assert.ok(validateFloorPlan(version).errors.some((e) => e.code === 'unsupported-version'));
    const units = validJson();
    units.units = 'ft';
    assert.ok(validateFloorPlan(units).errors.some((e) => e.code === 'invalid-units'));
  });

  it('rejects missing entity arrays', () => {
    const result = validateFloorPlan({ version: 1, units: 'm' });
    assert.equal(result.valid, false);
    assert.equal(result.errors.filter((e) => e.code === 'missing-field').length, 4);
  });

  it('rejects walls with non-finite coordinates', () => {
    const json = validJson();
    const walls = json.walls as Record<string, unknown>[];
    (walls[0].start as Record<string, unknown>).x = Number.NaN;
    const result = validateFloorPlan(json);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.code === 'invalid-number'));
  });

  it('rejects zero-length walls', () => {
    const json = validJson();
    const walls = json.walls as Record<string, unknown>[];
    walls[0] = { ...walls[0], start: { x: 1, y: 1 }, end: { x: 1, y: 1 } };
    const result = validateFloorPlan(json);
    assert.ok(result.errors.some((e) => e.code === 'zero-length-wall'));
  });

  it('rejects invalid wall thickness', () => {
    for (const thickness of [0, -0.2, 2, Number.NaN]) {
      const json = validJson();
      const walls = json.walls as Record<string, unknown>[];
      walls[1] = { ...walls[1], thickness };
      const result = validateFloorPlan(json);
      assert.ok(
        result.errors.some((e) => e.code === 'invalid-thickness' || e.code === 'invalid-number'),
        `thickness ${String(thickness)} should fail`,
      );
    }
  });

  it('rejects doors referencing missing walls', () => {
    const json = validJson();
    const doors = json.doors as Record<string, unknown>[];
    doors[0] = { ...doors[0], wallId: 'ghost' };
    const result = validateFloorPlan(json);
    assert.ok(result.errors.some((e) => e.code === 'invalid-wall-ref'));
  });

  it('rejects windows referencing missing walls', () => {
    const json = validJson();
    const windows = json.windows as Record<string, unknown>[];
    windows[0] = { ...windows[0], wallId: 'ghost' };
    const result = validateFloorPlan(json);
    assert.ok(result.errors.some((e) => e.code === 'invalid-wall-ref'));
  });

  it('rejects out-of-range centerT values', () => {
    for (const [key, index] of [['doors', 0], ['windows', 0]] as const) {
      const json = validJson();
      const openings = json[key] as Record<string, unknown>[];
      openings[index] = { ...openings[index], centerT: 1.5 };
      assert.ok(validateFloorPlan(json).errors.some((e) => e.code === 'invalid-centerT'));
    }
  });

  it('rejects invalid opening widths and swing values', () => {
    const narrow = validJson();
    (narrow.doors as Record<string, unknown>[])[0] = { ...(narrow.doors as Record<string, unknown>[])[0], width: 0.1 };
    assert.ok(validateFloorPlan(narrow).errors.some((e) => e.code === 'invalid-width'));
    const swing = validJson();
    (swing.doors as Record<string, unknown>[])[0] = { ...(swing.doors as Record<string, unknown>[])[0], swing: 'up' };
    assert.ok(validateFloorPlan(swing).errors.some((e) => e.code === 'invalid-swing'));
  });

  it('rejects duplicate IDs across entities', () => {
    const json = validJson();
    const doors = json.doors as Record<string, unknown>[];
    const windows = json.windows as Record<string, unknown>[];
    windows[0] = { ...windows[0], id: doors[0].id };
    const result = validateFloorPlan(json);
    assert.ok(result.errors.some((e) => e.code === 'duplicate-id'));
  });

  it('rejects non-finite numbers', () => {
    const json = validJson();
    const windows = json.windows as Record<string, unknown>[];
    windows[0] = { ...windows[0], width: Number.POSITIVE_INFINITY };
    assert.ok(validateFloorPlan(json).errors.some((e) => e.code === 'invalid-number'));
  });

  it('rejects rooms with invalid boundaries and areas', () => {
    const empty = validJson();
    (empty.rooms as unknown[])[0] = {
      id: 'room-x',
      name: 'X',
      polygon: [{ x: 0, y: 0 }],
      areaM2: 0,
      wallIds: [],
    };
    assert.ok(validateFloorPlan(empty).errors.some((e) => e.code === 'invalid-boundary'));
    const area = validJson();
    (area.rooms as Record<string, unknown>[])[0] = {
      ...(area.rooms as Record<string, unknown>[])[0],
      areaM2: 999,
    };
    assert.ok(validateFloorPlan(area).errors.some((e) => e.code === 'invalid-area'));
    const ref = validJson();
    (ref.rooms as Record<string, unknown>[])[0] = {
      ...(ref.rooms as Record<string, unknown>[])[0],
      wallIds: ['ghost'],
    };
    assert.ok(validateFloorPlan(ref).errors.some((e) => e.code === 'invalid-wall-ref'));
  });
});
