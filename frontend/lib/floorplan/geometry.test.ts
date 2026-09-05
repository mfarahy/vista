import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  collectEndpoints,
  distancePointToSegment,
  formatLengthM,
  nearestEndpoint,
  snapPoint,
  snapToleranceForScale,
} from './geometry';
import type { Wall } from './model';

const walls: Wall[] = [
  { id: 'a', start: { x: 0, y: 0 }, end: { x: 4, y: 0 }, thickness: 0.2 },
  { id: 'b', start: { x: 4, y: 0 }, end: { x: 4, y: 3 }, thickness: 0.2 },
];

describe('floorplan geometry', () => {
  it('collects wall endpoints', () => {
    assert.equal(collectEndpoints(walls).length, 4);
  });

  it('measures point-to-segment distance', () => {
    assert.equal(distancePointToSegment({ x: 2, y: 1 }, walls[0].start, walls[0].end), 1);
    assert.equal(distancePointToSegment({ x: 2, y: 0 }, walls[0].start, walls[0].end), 0);
  });

  it('snaps to nearby wall endpoints', () => {
    const hit = nearestEndpoint({ x: 0.05, y: 0.05 }, walls, 0.2);
    assert.ok(hit);
    assert.equal(hit.wallId, 'a');
    assert.deepEqual(hit.point, { x: 0, y: 0 });
    const miss = nearestEndpoint({ x: 2, y: 2 }, walls, 0.2);
    assert.equal(miss, null);
  });

  it('prioritizes endpoint snapping over angle snapping', () => {
    const snapped = snapPoint({ x: 4.02, y: 0.03 }, walls, 0.2, { x: 1, y: 1 });
    assert.equal(snapped.kind, 'endpoint');
    assert.deepEqual(snapped.point, { x: 4, y: 0 });
  });

  it('snaps horizontal and vertical relative to the pending start', () => {
    const horizontal = snapPoint({ x: 3, y: 0.01 }, [], 0.2, { x: 0, y: 0 });
    assert.equal(horizontal.kind, 'horizontal');
    assert.equal(horizontal.point.y, 0);
    const vertical = snapPoint({ x: 0.01, y: 3 }, [], 0.2, { x: 0, y: 0 });
    assert.equal(vertical.kind, 'vertical');
    assert.equal(vertical.point.x, 0);
  });

  it('snaps diagonal angles to 45 degrees', () => {
    const snapped = snapPoint({ x: 2, y: 2.05 }, [], 0.5, { x: 0, y: 0 });
    assert.equal(snapped.kind, 'angle');
    assert.ok(Math.abs(snapped.point.x - snapped.point.y) < 1e-6);
  });

  it('derives a sane snap tolerance from the zoom scale', () => {
    assert.ok(snapToleranceForScale(60) > 0.1 && snapToleranceForScale(60) < 0.3);
    assert.equal(snapToleranceForScale(0), 0.2);
  });

  it('formats wall lengths', () => {
    assert.equal(formatLengthM(3.456), '3.46 m');
  });
});
