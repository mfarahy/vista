import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  clearStoredFloorPlan,
  restoreFloorPlan,
  saveFloorPlan,
  type StorageLike,
} from './storage.js';
import { planAddDoor, planAddWall, planAddWindow, planDeleteWalls } from './plan-ops.js';
import { createWall, emptyFloorPlan } from './model.js';
import { serializeFloorPlan } from './serialization.js';

function memoryStore(): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
  };
}

function samplePlan() {
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

describe('floorplan storage', () => {
  it('saves and restores a plan', () => {
    const store = memoryStore();
    const plan = samplePlan();
    assert.equal(saveFloorPlan(plan, store), true);
    const restored = restoreFloorPlan(store);
    assert.equal(restored.status, 'ok');
    // Canonical form is stable across the round-trip (wall order and
    // ring traversal are normalized, not significant).
    assert.equal(
      restored.status === 'ok' ? serializeFloorPlan(restored.plan) : null,
      serializeFloorPlan(plan),
    );
  });

  it('persists only the canonical plan (no editor state)', () => {
    const store = memoryStore();
    saveFloorPlan(samplePlan(), store);
    const keys = Object.keys(JSON.parse(store.data.get('vista.floorplan.v1') ?? '{}') as object).sort();
    assert.deepEqual(keys, ['doors', 'rooms', 'units', 'version', 'walls', 'windows']);
  });

  it('reports empty when nothing was stored', () => {
    assert.deepEqual(restoreFloorPlan(memoryStore()), { status: 'empty' });
  });

  it('reports corrupt data instead of throwing', () => {
    const store = memoryStore();
    store.setItem('vista.floorplan.v1', '{broken json');
    const broken = restoreFloorPlan(store);
    assert.equal(broken.status, 'corrupt');
    store.setItem(
      'vista.floorplan.v1',
      JSON.stringify({ version: 1, units: 'm', walls: [], doors: [], windows: [], rooms: [{ id: 'x' }] }),
    );
    const invalid = restoreFloorPlan(store);
    assert.equal(invalid.status, 'corrupt');
    if (invalid.status === 'corrupt') assert.ok(invalid.errors.length > 0);
  });

  it('clears the stored draft', () => {
    const store = memoryStore();
    saveFloorPlan(samplePlan(), store);
    clearStoredFloorPlan(store);
    assert.deepEqual(restoreFloorPlan(store), { status: 'empty' });
  });

  it('tolerates unavailable storage', () => {
    const failing: StorageLike = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
      removeItem: () => {
        throw new Error('denied');
      },
    };
    assert.equal(saveFloorPlan(samplePlan(), failing), false);
    assert.deepEqual(restoreFloorPlan(failing), { status: 'empty' });
    assert.deepEqual(restoreFloorPlan(null), { status: 'empty' });
    assert.equal(saveFloorPlan(samplePlan(), null), false);
    clearStoredFloorPlan(failing);
  });
});

describe('floorplan referential integrity', () => {
  it('deletes a wall together with its attached windows', () => {
    let plan = samplePlan();
    const wallId = plan.walls[2].id;
    assert.equal(plan.windows.length, 1);
    plan = planDeleteWalls(plan, [wallId]);
    assert.ok(plan.walls.every((wall) => wall.id !== wallId));
    assert.equal(plan.windows.length, 0);
    assert.equal(plan.doors.length, 1);
  });

  it('never leaves doors or windows pointing at deleted walls', () => {
    let plan = samplePlan();
    const wallIds = plan.walls.map((wall) => wall.id);
    plan = planDeleteWalls(plan, wallIds);
    assert.deepEqual(plan.walls, []);
    assert.deepEqual(plan.doors, []);
    assert.deepEqual(plan.windows, []);
    assert.deepEqual(plan.rooms, []);
  });

  it('serialized plans carry no dangling wall references', () => {
    const plan = samplePlan();
    const parsed = JSON.parse(serializeFloorPlan(plan)) as {
      walls: { id: string }[];
      doors: { wallId: string }[];
      windows: { wallId: string }[];
    };
    const ids = new Set(parsed.walls.map((wall) => wall.id));
    for (const door of parsed.doors) assert.ok(ids.has(door.wallId));
    for (const window of parsed.windows) assert.ok(ids.has(window.wallId));
  });
});
