import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  cleanupImportedWalls,
  clusterWallEndpoints,
  dedupeWalls,
  letterboxTransformFor,
  mergeCollinearWalls,
  modelToSourcePoint,
  orthogonalizeWalls,
  sourceToModelPoint,
} from './raster2seq-geometry.js';
import type { Wall } from './model.js';

function wall(id: string, x1: number, y1: number, x2: number, y2: number): Wall {
  return { id, start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: 0.2 };
}

function angleDeg(w: Wall): number {
  return (Math.atan2(w.end.y - w.start.y, w.end.x - w.start.x) * 180) / Math.PI;
}

describe('raster2seq letterbox inversion', () => {
  it('treats square sources as identity (no padding)', () => {
    const t = letterboxTransformFor(256, 256);
    assert.ok(t);
    assert.equal(t.scale, 1);
    assert.equal(t.padLeft, 0);
    assert.equal(t.padTop, 0);
    assert.deepEqual(modelToSourcePoint({ x: 37.5, y: 200 }, t), { x: 37.5, y: 200 });
  });

  it('inverts horizontal padding for wide images', () => {
    // 512x256: scale 0.5, resized 256x128, 64px pad top and bottom.
    const t = letterboxTransformFor(512, 256);
    assert.ok(t);
    assert.equal(t.scale, 0.5);
    assert.equal(t.resizedW, 256);
    assert.equal(t.resizedH, 128);
    assert.equal(t.padLeft, 0);
    assert.equal(t.padTop, 64);
    assert.deepEqual(modelToSourcePoint({ x: 0, y: 64 }, t), { x: 0, y: 0 });
    assert.deepEqual(modelToSourcePoint({ x: 256, y: 192 }, t), { x: 512, y: 256 });
  });

  it('inverts vertical padding for tall images', () => {
    // 256x512: scale 0.5, resized 128x256, 64px pad left and right.
    const t = letterboxTransformFor(256, 512);
    assert.ok(t);
    assert.equal(t.scale, 0.5);
    assert.equal(t.padLeft, 64);
    assert.equal(t.padTop, 0);
    assert.deepEqual(modelToSourcePoint({ x: 64, y: 0 }, t), { x: 0, y: 0 });
    assert.deepEqual(modelToSourcePoint({ x: 192, y: 256 }, t), { x: 256, y: 512 });
  });

  it('reproduces asymmetric padding (extra pixel goes bottom/right)', () => {
    // 100x101: scale = 256/101, new_w = int(253.46) = 253 -> pad 3, left 1.
    const t = letterboxTransformFor(100, 101);
    assert.ok(t);
    assert.equal(t.resizedW, 253);
    assert.equal(t.resizedH, 256);
    assert.equal(t.padLeft, 1);
    assert.equal(t.padTop, 0);
    const back = modelToSourcePoint({ x: 1, y: 0 }, t);
    assert.ok(Math.abs(back.x) < 1e-9 && Math.abs(back.y) < 1e-9);
  });

  it('round-trips non-square images', () => {
    for (const [w, h] of [[640, 480], [480, 640], [1000, 333], [333, 1000], [77, 77]] as const) {
      const t = letterboxTransformFor(w, h);
      assert.ok(t);
      for (const p of [{ x: 0, y: 0 }, { x: w, y: h }, { x: w / 3, y: h / 2 }] as const) {
        const roundTripped = modelToSourcePoint(sourceToModelPoint({ ...p }, t), t);
        assert.ok(Math.abs(roundTripped.x - p.x) < 1e-9, `${w}x${h} x`);
        assert.ok(Math.abs(roundTripped.y - p.y) < 1e-9, `${w}x${h} y`);
      }
    }
  });

  it('rejects invalid dimensions', () => {
    assert.equal(letterboxTransformFor(0, 100), null);
    assert.equal(letterboxTransformFor(100, -5), null);
    assert.equal(letterboxTransformFor(Number.NaN, 100), null);
    assert.equal(letterboxTransformFor(Infinity, 100), null);
  });
});

describe('raster2seq orthogonal cleanup', () => {
  it('snaps near-horizontal walls to exactly horizontal', () => {
    // 0.8° deviation over 4 m.
    const { walls, orthogonalized } = orthogonalizeWalls([wall('a', 0, 0, 4, 0.0559)]);
    assert.equal(orthogonalized, 1);
    assert.equal(walls[0].start.y, walls[0].end.y);
  });

  it('snaps near-vertical walls to exactly vertical', () => {
    // 89.2° direction.
    const { walls, orthogonalized } = orthogonalizeWalls([wall('a', 2, 0, 2.0559, 4)]);
    assert.equal(orthogonalized, 1);
    assert.equal(walls[0].start.x, walls[0].end.x);
    assert.ok(Math.abs(angleDeg(walls[0]) - 90) < 1e-9);
  });

  it('preserves meaningful diagonals', () => {
    const before = [wall('a', 0, 0, 4, 4), wall('b', 0, 0, 4, 4 * Math.tan((15 * Math.PI) / 180))];
    const { walls, orthogonalized } = orthogonalizeWalls(before);
    assert.equal(orthogonalized, 0);
    assert.deepEqual(walls.map((w) => w.start), before.map((w) => w.start));
    assert.deepEqual(walls.map((w) => w.end), before.map((w) => w.end));
  });

  it('leaves exactly orthogonal walls untouched', () => {
    const { orthogonalized } = orthogonalizeWalls([wall('a', 0, 0, 4, 0), wall('b', 1, 1, 1, 5)]);
    assert.equal(orthogonalized, 0);
  });
});

describe('raster2seq endpoint clustering', () => {
  it('merges endpoints within tolerance into identical coordinates', () => {
    const { walls, clustersMerged } = clusterWallEndpoints([
      wall('a', 0, 0, 4, 0),
      wall('b', 4.05, 0, 4.05, 3),
    ]);
    assert.equal(clustersMerged, 1);
    assert.deepEqual(walls[0].end, walls[1].start);
  });

  it('closes tiny gaps at angled joints', () => {
    const { walls } = clusterWallEndpoints([wall('a', 0, 0, 2, 0), wall('b', 2.05, 0, 2.05, 3)]);
    assert.deepEqual(walls[0].end, walls[1].start);
  });

  it('does not pull parallel walls sideways onto each other', () => {
    // 1px-offset duplicate of one shared edge: clustering must leave both
    // lines alone so the collinear merge can pick the dominant line.
    const { walls, clustersMerged } = clusterWallEndpoints([
      wall('a', 5, 0, 5, 4),
      wall('b', 5.05, 0, 5.05, 4),
    ]);
    assert.equal(clustersMerged, 0);
    assert.deepEqual(walls[0].start, { x: 5, y: 0 });
    assert.deepEqual(walls[1].start, { x: 5.05, y: 0 });
  });

  it('preserves endpoints far apart', () => {
    const { walls, clustersMerged } = clusterWallEndpoints([
      wall('a', 0, 0, 4, 0),
      wall('b', 4.5, 0, 4.5, 3),
    ]);
    assert.equal(clustersMerged, 0);
    assert.deepEqual(walls[1].start, { x: 4.5, y: 0 });
  });

  it('does not collapse long staircase chains into one point', () => {
    const chain = [
      wall('a', 0, 0, 1, 0),
      wall('b', 1.05, 0, 2, 0),
      wall('c', 2.05, 0, 3, 0),
      wall('d', 3.05, 0, 4, 0),
    ];
    const { walls } = clusterWallEndpoints(chain);
    const xs = walls.flatMap((w) => [w.start.x, w.end.x]);
    assert.ok(Math.max(...xs) - Math.min(...xs) > 3.5);
  });
});

describe('raster2seq wall dedupe and collinear merge', () => {
  it('removes exact duplicates regardless of endpoint order', () => {
    const { walls, removed } = dedupeWalls([
      wall('a', 0, 0, 4, 0),
      wall('b', 4, 0, 0, 0),
      wall('c', 0, 0, 4, 0),
      wall('d', 0, 0, 0, 3),
    ]);
    assert.equal(removed, 2);
    assert.equal(walls.length, 2);
  });

  it('merges collinear sub-segments into one wall', () => {
    const { walls, merged } = mergeCollinearWalls([
      wall('a', 0, 0, 4, 0),
      wall('b', 1, 0, 3, 0),
    ]);
    assert.equal(merged, 1);
    assert.equal(walls.length, 1);
    assert.deepEqual(walls[0].start, { x: 0, y: 0 });
    assert.deepEqual(walls[0].end, { x: 4, y: 0 });
  });

  it('merges reversed overlapping segments', () => {
    const { walls } = mergeCollinearWalls([wall('a', 4, 0, 0, 0), wall('b', 3, 0, 1, 0)]);
    assert.equal(walls.length, 1);
  });

  it('bridges tiny gaps between collinear segments', () => {
    const { walls } = mergeCollinearWalls([wall('a', 0, 0, 2, 0), wall('b', 2.05, 0, 4, 0)]);
    assert.equal(walls.length, 1);
    assert.deepEqual(walls[0].end, { x: 4, y: 0 });
  });

  it('preserves legitimate parallel walls', () => {
    const { walls, merged } = mergeCollinearWalls([
      wall('a', 0, 0, 4, 0),
      wall('b', 0, 0.5, 4, 0.5),
      wall('c', 0, 0.1, 4, 0.1),
    ]);
    assert.equal(merged, 0);
    assert.equal(walls.length, 3);
  });

  it('keeps collinear segments with a real gap separate', () => {
    const { walls } = mergeCollinearWalls([wall('a', 0, 0, 2, 0), wall('b', 3, 0, 5, 0)]);
    assert.equal(walls.length, 2);
  });
});

describe('raster2seq cleanup pipeline', () => {
  it('cleans a noisy square room into four exact walls', () => {
    const noisy = [
      wall('a', 0, 0.01, 4.02, 0.03),
      wall('a2', 0, 0.01, 4.02, 0.03), // exact duplicate of the intended edge
      wall('b', 4, 0, 4.03, 3),
      wall('c', 4, 3.02, 0, 3),
      wall('d', 0.02, 3, 0, 0),
    ];
    const { walls, diagnostics } = cleanupImportedWalls(noisy);
    assert.equal(walls.length, 4);
    assert.ok(diagnostics.duplicatesRemoved >= 1);
    assert.ok(diagnostics.endpointClustersMerged >= 1);
    // Residual skew stays inside the noise band: joining a nearby corner
    // (required for room detection) wins over perfect straightness.
    for (const w of walls) {
      const ang = (Math.abs(Math.atan2(w.end.y - w.start.y, w.end.x - w.start.x) * 180 / Math.PI) % 180);
      const dev = Math.min(ang, Math.abs(ang - 90), 180 - ang);
      assert.ok(dev <= 2.5, `${w.id} dev ${dev}`);
    }
    // Corners are shared exact coordinates.
    const points = walls.flatMap((w) => [w.start, w.end]);
    for (const p of points) {
      assert.ok(points.some((q) => q !== p && q.x === p.x && q.y === p.y), 'dangling corner');
    }
  });

  it('drops tiny sliver walls', () => {
    const { walls, diagnostics } = cleanupImportedWalls([
      wall('a', 0, 0, 4, 0),
      wall('sliver', 1, 0, 1.02, 0.01),
    ]);
    assert.ok(diagnostics.tinyWallsDropped >= 1 || walls.length === 1);
    assert.ok(walls.every((w) => Math.hypot(w.end.x - w.start.x, w.end.y - w.start.y) >= 0.05));
  });

  it('is deterministic across runs', () => {
    const input = [wall('b', 4, 0, 4.03, 3), wall('a', 0, 0.01, 4.02, 0.03), wall('a2', 0, 0, 4, 0)];
    assert.deepEqual(cleanupImportedWalls(input), cleanupImportedWalls([...input].reverse()));
  });
});
