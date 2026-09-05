import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { detectRooms } from './rooms.js';
import { createWall, type Wall } from './model.js';

function rectWalls(originX: number, originY: number, w: number, h: number, prefix: string): Wall[] {
  const p = (x: number, y: number) => ({ x: originX + x, y: originY + y });
  const mk = (id: string, start: { x: number; y: number }, end: { x: number; y: number }): Wall => ({
    ...createWall(start, end),
    id,
  });
  return [
    mk(`${prefix}-s`, p(0, 0), p(w, 0)),
    mk(`${prefix}-e`, p(w, 0), p(w, h)),
    mk(`${prefix}-n`, p(w, h), p(0, h)),
    mk(`${prefix}-w`, p(0, h), p(0, 0)),
  ];
}

describe('room detection', () => {
  it('recognizes a closed rectangle as one room with calculated area', () => {
    const walls = rectWalls(0, 0, 4, 3, 'r');
    const rooms = detectRooms(walls);
    assert.equal(rooms.length, 1);
    assert.equal(rooms[0].areaM2, 12);
    assert.equal(rooms[0].wallIds.length, 4);
    assert.equal(rooms[0].polygon.length, 4);
    assert.equal(rooms[0].name, '');
  });

  it('recognizes subdivided rooms and drops the outer loop', () => {
    // ┌──────────────┐
    // │   Bedroom    │
    // ├──────┬───────┤
    // │ Bath │ Hall  │
    // └──────┴───────┘   (6 x 5, divider at y=2.5, vertical at x=3 below)
    const mk = (id: string, sx: number, sy: number, ex: number, ey: number): Wall => ({
      ...createWall({ x: sx, y: sy }, { x: ex, y: ey }),
      id,
    });
    const walls = [
      mk('top', 0, 0, 6, 0),
      mk('right', 6, 0, 6, 5),
      mk('bottom', 6, 5, 0, 5),
      mk('left', 0, 5, 0, 0),
      mk('mid-h', 0, 2.5, 6, 2.5),
      mk('mid-v', 3, 2.5, 3, 5),
    ];
    const rooms = detectRooms(walls);
    const areas = rooms.map((room) => room.areaM2).sort((a, b) => a - b);
    assert.deepEqual(areas, [7.5, 7.5, 15]);
    // Bedroom 6x2.5, bath + hall 3x2.5 each.
    assert.ok(rooms.some((room) => Math.abs(room.areaM2 - 15) < 1e-9));
    assert.equal(rooms.filter((room) => Math.abs(room.areaM2 - 7.5) < 1e-9).length, 2);
  });

  it('closes rooms at overshooting T-junctions', () => {
    // A wall drawn past the corner still encloses the room: the crossing
    // point splits the overshoot and the loop closes there.
    const mk = (id: string, sx: number, sy: number, ex: number, ey: number): Wall => ({
      ...createWall({ x: sx, y: sy }, { x: ex, y: ey }),
      id,
    });
    const walls = [
      mk('top', 0, 0, 4, 0),
      mk('right', 4, 0, 4, 3),
      mk('bottom', 4, 3, 0, 3),
      mk('left', 0, 3, 0, -0.5),
    ];
    const rooms = detectRooms(walls);
    assert.equal(rooms.length, 1);
    assert.equal(rooms[0].areaM2, 12);
  });

  it('ignores open plans and slivers', () => {
    const open = rectWalls(0, 0, 4, 3, 'o').slice(0, 2);
    assert.deepEqual(detectRooms(open), []);
    assert.deepEqual(detectRooms([]), []);
  });

  it('preserves user-assigned room names across re-detection', () => {
    const walls = rectWalls(0, 0, 4, 3, 'r');
    const first = detectRooms(walls);
    assert.equal(first.length, 1);
    const renamed = [{ ...first[0], name: 'Bedroom' }];
    const again = detectRooms(walls, renamed);
    assert.equal(again.length, 1);
    assert.equal(again[0].name, 'Bedroom');
    assert.equal(again[0].id, first[0].id);
  });

  it('keeps ids stable regardless of wall order', () => {
    const walls = rectWalls(0, 0, 4, 3, 'r');
    const forward = detectRooms(walls);
    const backward = detectRooms([...walls].reverse());
    assert.equal(forward[0].id, backward[0].id);
  });
});
