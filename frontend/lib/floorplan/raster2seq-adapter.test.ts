import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  convertRaster2SeqToFloorPlan,
  RASTER2SEQ_METERS_PER_PX,
  RASTER2SEQ_WALL_THICKNESS_M,
} from './raster2seq-adapter.js';
import { openingEndpoints, wallPointAt } from './geometry.js';
import { DEFAULT_WALL_THICKNESS_M } from './model.js';
import { validateFloorPlan } from './validation.js';

const fixturesDir = join(import.meta.dirname, 'fixtures');

function loadFixture(name: string): unknown {
  return JSON.parse(readFileSync(join(fixturesDir, name), 'utf8'));
}

function squareRoom(label: string, size = 256) {
  return {
    status: 'ok',
    room_count: 1,
    image_size: 256,
    coordinate_space: 'model-input-256x256-padded',
    spaces: [
      {
        id: 0,
        category_id: 2,
        label,
        polygon: [
          [0, 0],
          [size, 0],
          [size, size],
          [0, size],
        ],
      },
    ],
  };
}

describe('raster2seq adapter', () => {
  it('converts the mock service response into named rooms and walls', () => {
    const result = convertRaster2SeqToFloorPlan(loadFixture('raster2seq-mock.json'));
    assert.equal(result.ok, true);
    if (!result.ok) return;
    const { plan } = result;
    assert.equal(plan.version, 1);
    assert.equal(plan.units, 'm');
    assert.equal(plan.walls.length, 16);
    assert.equal(plan.rooms.length, 4);
    const names = plan.rooms.map((room) => room.name).sort();
    assert.deepEqual(names, ['Bath', 'Bed Room', 'Kitchen', 'Living Room']);
    for (const room of plan.rooms) {
      assert.ok(room.areaM2 > 0);
      assert.ok(room.polygon.length >= 3);
    }
    assert.deepEqual(validateFloorPlan(plan), { valid: true, errors: [] });
  });

  it('converts the real multiroom response with attached doors and windows', () => {
    const result = convertRaster2SeqToFloorPlan(loadFixture('raster2seq-real-multiroom.json'));
    assert.equal(result.ok, true);
    if (!result.ok) return;
    const { plan } = result;
    assert.ok(plan.walls.length > 0);
    assert.equal(plan.doors.length, 5);
    assert.equal(plan.windows.length, 4);
    const wallIds = new Set(plan.walls.map((wall) => wall.id));
    for (const door of [...plan.doors, ...plan.windows]) {
      assert.ok(wallIds.has(door.wallId));
      assert.ok(door.centerT >= 0 && door.centerT <= 1);
      assert.ok(door.width >= 0.4 && door.width <= 3);
    }
    assert.ok(plan.rooms.length > 0);
    assert.ok(plan.rooms.some((room) => room.name === 'Bed Room'));
    assert.ok(plan.rooms.some((room) => room.name === 'Bath'));
    assert.deepEqual(validateFloorPlan(plan), { valid: true, errors: [] });
  });

  it('converts the real sample1 response', () => {
    const result = convertRaster2SeqToFloorPlan(loadFixture('raster2seq-real-sample1.json'));
    assert.equal(result.ok, true);
    if (!result.ok) return;
    const { plan } = result;
    assert.ok(plan.walls.length > 0);
    assert.equal(plan.doors.length, 8);
    assert.equal(plan.windows.length, 5);
    assert.ok(plan.rooms.some((room) => room.name === 'Kitchen'));
    assert.deepEqual(validateFloorPlan(plan), { valid: true, errors: [] });
  });

  it('prefers refined spaces with corrected room types', () => {
    const input = {
      status: 'ok',
      room_count: 1,
      spaces: [squareRoom('Undefined').spaces[0]],
      refined_spaces: [
        {
          id: '0',
          room_type: 'Living Room',
          area: 65536,
          polygon: [
            [0, 0],
            [256, 0],
            [256, 256],
            [0, 256],
          ],
          graph: [],
        },
      ],
    };
    const result = convertRaster2SeqToFloorPlan(input);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.ok(result.plan.rooms.some((room) => room.name === 'Living Room'));
  });

  it('converts model-input units to meters with the documented scale', () => {
    const result = convertRaster2SeqToFloorPlan(squareRoom('Kitchen'));
    assert.equal(result.ok, true);
    if (!result.ok) return;
    const xs = result.plan.walls.flatMap((wall) => [wall.start.x, wall.end.x]);
    const ys = result.plan.walls.flatMap((wall) => [wall.start.y, wall.end.y]);
    assert.equal(Math.min(...xs), 0);
    assert.equal(Math.max(...xs), 256 * RASTER2SEQ_METERS_PER_PX);
    assert.equal(Math.min(...ys), 0);
    assert.equal(Math.max(...ys), 256 * RASTER2SEQ_METERS_PER_PX);
    assert.equal(result.plan.rooms[0].areaM2, 256 * RASTER2SEQ_METERS_PER_PX * (256 * RASTER2SEQ_METERS_PER_PX));
  });

  it('attaches an opening on a wall edge with a wall-fraction center', () => {
    const input = squareRoom('Kitchen');
    input.spaces.push({
      id: 1,
      category_id: 10,
      label: 'Door',
      polygon: [
        [108, 0],
        [148, 0],
      ],
    });
    const result = convertRaster2SeqToFloorPlan(input);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.plan.doors.length, 1);
    const [door] = result.plan.doors;
    assert.ok(Math.abs(door.centerT - 0.5) < 0.02);
    assert.ok(door.width >= 0.4 && door.width <= 3);
    assert.deepEqual(validateFloorPlan(result.plan), { valid: true, errors: [] });
  });

  it('skips openings far from any wall instead of inventing hosts', () => {
    const input = squareRoom('Kitchen');
    input.spaces.push({
      id: 1,
      category_id: 9,
      label: 'Window',
      polygon: [
        [300, 300],
        [340, 300],
      ],
    });
    const result = convertRaster2SeqToFloorPlan(input);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.plan.windows.length, 0);
    assert.deepEqual(validateFloorPlan(result.plan), { valid: true, errors: [] });
  });

  it('skips noise-sized opening segments', () => {
    const input = squareRoom('Kitchen');
    input.spaces.push({
      id: 1,
      category_id: 10,
      label: 'Door',
      polygon: [
        [100, 0],
        [101, 0],
      ],
    });
    const result = convertRaster2SeqToFloorPlan(input);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.plan.doors.length, 0);
  });

  it('leaves unknown room labels unnamed rather than dropping geometry', () => {
    const result = convertRaster2SeqToFloorPlan(squareRoom('Undefined'));
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.plan.walls.length, 4);
    assert.equal(result.plan.rooms[0].name, '');
  });

  it('keeps custom labels as room names', () => {
    const result = convertRaster2SeqToFloorPlan(squareRoom('Atelier'));
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.plan.rooms[0].name, 'Atelier');
  });

  it('is deterministic across runs', () => {
    const input = loadFixture('raster2seq-real-multiroom.json');
    const first = convertRaster2SeqToFloorPlan(input);
    const second = convertRaster2SeqToFloorPlan(loadFixture('raster2seq-real-multiroom.json'));
    assert.equal(first.ok && second.ok, true);
    assert.equal(JSON.stringify(first), JSON.stringify(second));
  });

  it('rejects malformed responses without throwing', () => {
    for (const bad of [
      null,
      undefined,
      42,
      'nope',
      [],
      {},
      { status: 'error', code: 'x' },
      { spaces: 'nope' },
      { spaces: [null] },
      { spaces: [{ id: 0, polygon: [[[0]]] }] },
      { spaces: [{ id: 0, category_id: 2, label: 'Kitchen', polygon: [[0, 'x'], [1, 1], [2, 2]] }] },
      { spaces: [{ id: 0, category_id: 2, label: 'Kitchen', polygon: [[Infinity, 0], [1, 1], [2, 2]] }] },
    ]) {
      const result = convertRaster2SeqToFloorPlan(bad);
      assert.equal(result.ok, false, `expected failure for ${JSON.stringify(bad)?.slice(0, 60)}`);
    }
  });

  it('reports empty when only outdoor or opening geometry is present', () => {
    const outdoorOnly = {
      status: 'ok',
      spaces: [{ id: 0, category_id: 0, label: 'Outdoor', polygon: [[0, 0], [10, 0], [10, 10], [0, 10]] }],
    };
    assert.deepEqual(convertRaster2SeqToFloorPlan(outdoorOnly), { ok: false, reason: 'empty' });
    const openingsOnly = {
      status: 'ok',
      spaces: [{ id: 0, category_id: 10, label: 'Door', polygon: [[0, 0], [10, 0]] }],
    };
    assert.deepEqual(convertRaster2SeqToFloorPlan(openingsOnly), { ok: false, reason: 'empty' });
    assert.deepEqual(convertRaster2SeqToFloorPlan({ spaces: [] }), { ok: false, reason: 'malformed' });
  });

  it('reports invalid geometry for degenerate polygons', () => {
    const degenerate = {
      status: 'ok',
      spaces: [{ id: 0, category_id: 2, label: 'Kitchen', polygon: [[5, 5], [5, 5], [5, 5]] }],
    };
    const result = convertRaster2SeqToFloorPlan(degenerate);
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.ok(['invalid-geometry', 'empty'].includes(result.reason));
  });

  it('inverts the letterbox for wide source images', () => {
    // 512x256 source: scale 0.5, 64px vertical padding in model space.
    const input = {
      status: 'ok',
      spaces: [
        {
          id: 0,
          category_id: 2,
          label: 'Living Room',
          polygon: [
            [0, 64],
            [256, 64],
            [256, 192],
            [0, 192],
          ],
        },
      ],
    };
    const result = convertRaster2SeqToFloorPlan(input, { sourceSize: { width: 512, height: 256 } });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    const xs = result.plan.walls.flatMap((wall) => [wall.start.x, wall.end.x]);
    const ys = result.plan.walls.flatMap((wall) => [wall.start.y, wall.end.y]);
    assert.equal(Math.min(...xs), 0);
    assert.equal(Math.max(...xs), 512 * RASTER2SEQ_METERS_PER_PX);
    assert.equal(Math.min(...ys), 0);
    assert.equal(Math.max(...ys), 256 * RASTER2SEQ_METERS_PER_PX);
    // Proportions preserved: 2:1 source stays 2:1 in meters.
    assert.equal(Math.max(...xs) / Math.max(...ys), 2);
    assert.deepEqual(validateFloorPlan(result.plan), { valid: true, errors: [] });
  });

  it('reads embedded source dimensions and lets options win', () => {
    const base = {
      status: 'ok',
      source_width: 512,
      source_height: 256,
      spaces: [
        {
          id: 0,
          category_id: 2,
          label: 'Living Room',
          polygon: [
            [0, 64],
            [256, 64],
            [256, 192],
            [0, 192],
          ],
        },
      ],
    };
    const embedded = convertRaster2SeqToFloorPlan(base);
    assert.equal(embedded.ok, true);
    if (!embedded.ok) return;
    const wide = Math.max(
      ...embedded.plan.walls.flatMap((wall) => [wall.start.x, wall.end.x]),
    );
    assert.equal(wide, 512 * RASTER2SEQ_METERS_PER_PX);
    // Explicit options override embedded dimensions (square -> identity).
    const overridden = convertRaster2SeqToFloorPlan(base, { sourceSize: { width: 256, height: 256 } });
    assert.equal(overridden.ok, true);
    if (!overridden.ok) return;
    const square = Math.max(
      ...overridden.plan.walls.flatMap((wall) => [wall.start.x, wall.end.x]),
    );
    // Without padding the 256-unit model span maps directly.
    assert.equal(square, 256 * RASTER2SEQ_METERS_PER_PX);
  });

  it('reuses the editor wall-thickness default for imports', () => {
    assert.equal(RASTER2SEQ_WALL_THICKNESS_M, DEFAULT_WALL_THICKNESS_M);
    const result = convertRaster2SeqToFloorPlan(loadFixture('raster2seq-real-multiroom.json'));
    assert.equal(result.ok, true);
    if (!result.ok) return;
    for (const wall of result.plan.walls) {
      assert.equal(wall.thickness, DEFAULT_WALL_THICKNESS_M);
    }
  });

  it('merges duplicate wall edges from overlapping room polygons', () => {
    const input = {
      status: 'ok',
      spaces: [
        { id: 0, category_id: 2, label: 'A', polygon: [[10, 10], [100, 10], [100, 100], [10, 100]] },
        // Same room shifted by ~1px: every edge duplicated with jitter.
        { id: 1, category_id: 2, label: 'B', polygon: [[11, 11], [101, 11], [101, 101], [11, 101]] },
      ],
    };
    const result = convertRaster2SeqToFloorPlan(input);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    // 8 raw edges collapse; the 1px-offset square is a separate room shell.
    assert.ok(result.plan.walls.length <= 8, `walls=${result.plan.walls.length}`);
    assert.deepEqual(validateFloorPlan(result.plan), { valid: true, errors: [] });
  });

  it('does not split a room over tiny shared-edge deviations', () => {
    const input = {
      status: 'ok',
      spaces: [
        { id: 0, category_id: 2, label: 'Living Room', polygon: [[10, 10], [100, 10], [100, 100], [10, 100]] },
        // Adjacent room sharing the x=100 edge with 1px jitter.
        { id: 1, category_id: 3, label: 'Kitchen', polygon: [[101, 10], [190, 10], [190, 100], [101, 100]] },
      ],
    };
    const result = convertRaster2SeqToFloorPlan(input);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.plan.rooms.length, 2);
    const names = result.plan.rooms.map((room) => room.name).sort();
    assert.deepEqual(names, ['Kitchen', 'Living Room']);
  });

  it('derives room areas from canonical geometry', () => {
    const result = convertRaster2SeqToFloorPlan(squareRoom('Kitchen'));
    assert.equal(result.ok, true);
    if (!result.ok) return;
    const span = 256 * RASTER2SEQ_METERS_PER_PX;
    assert.equal(result.plan.rooms[0].areaM2, span * span);
  });

  it('clamps opening centers so doors fit on short host walls', () => {
    const input = squareRoom('Kitchen');
    input.spaces.push({
      id: 1,
      category_id: 10,
      label: 'Door',
      polygon: [
        [240, 0],
        [256, 0],
      ],
    });
    const result = convertRaster2SeqToFloorPlan(input);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.plan.doors.length, 1);
    const [door] = result.plan.doors;
    const host = result.plan.walls.find((wall) => wall.id === door.wallId);
    assert.ok(host);
    // The rendered opening must not overhang the wall ends.
    const { p1, p2 } = openingEndpoints(host, door.centerT, door.width);
    const len = Math.hypot(host.end.x - host.start.x, host.end.y - host.start.y);
    for (const p of [p1, p2]) {
      const along =
        ((p.x - host.start.x) * (host.end.x - host.start.x) +
          (p.y - host.start.y) * (host.end.y - host.start.y)) /
        (len * len);
      assert.ok(along >= -1e-9 && along <= 1 + 1e-9, `overhang t=${along}`);
    }
  });

  it('keeps openings attached when their host wall moves', () => {
    const input = squareRoom('Kitchen');
    input.spaces.push({
      id: 1,
      category_id: 10,
      label: 'Door',
      polygon: [
        [108, 0],
        [148, 0],
      ],
    });
    const result = convertRaster2SeqToFloorPlan(input);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    const [door] = result.plan.doors;
    const host = result.plan.walls.find((wall) => wall.id === door.wallId);
    assert.ok(host);
    // centerT is wall-relative: translating the wall moves the opening with it.
    const before = wallPointAt(host, door.centerT);
    const delta = { x: 1.5, y: -0.5 };
    const moved = {
      ...host,
      start: { x: host.start.x + delta.x, y: host.start.y + delta.y },
      end: { x: host.end.x + delta.x, y: host.end.y + delta.y },
    };
    const after = wallPointAt(moved, door.centerT);
    assert.deepEqual(
      { x: after.x - before.x, y: after.y - before.y },
      delta,
    );
  });

  it('produces plans without image or pixel leakage', () => {
    const result = convertRaster2SeqToFloorPlan(loadFixture('raster2seq-real-sample1.json'));
    assert.equal(result.ok, true);
    if (!result.ok) return;
    const json = JSON.stringify(result.plan);
    assert.ok(!/\.png|\.jpg|base64|data:image/i.test(json));
    for (const wall of result.plan.walls) {
      assert.ok(Math.abs(wall.start.x) < 100 && Math.abs(wall.start.y) < 100);
    }
  });
});
