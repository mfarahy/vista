import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  clampOpeningT,
  collectEndpoints,
  distancePointToSegment,
  formatAreaM2,
  formatLengthM,
  nearestEndpoint,
  nearestWall,
  openingEndpoints,
  parseLengthM,
  pointInPolygon,
  pointStrictlyInPolygon,
  polygonArea,
  polygonCentroid,
  projectPointToWall,
  setWallEndpoint,
  setWallLength,
  snapPoint,
  snapToleranceForScale,
  translateWall,
  wallPointAt,
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

  it('formats room areas', () => {
    assert.equal(formatAreaM2(12.345), '12.3 m²');
    assert.equal(formatAreaM2(NaN), '—');
  });

  it('locates points along a wall and projects onto it', () => {
    const wall = walls[0];
    assert.deepEqual(wallPointAt(wall, 0.25), { x: 1, y: 0 });
    const projected = projectPointToWall({ x: 2, y: 1 }, wall);
    assert.equal(projected.t, 0.5);
    assert.equal(projected.distance, 1);
  });

  it('finds the nearest wall with a fractional hit position', () => {
    const hit = nearestWall({ x: 2, y: 0.1 }, walls, 0.5);
    assert.ok(hit);
    assert.equal(hit.wall.id, 'a');
    assert.ok(Math.abs(hit.t - 0.5) < 1e-9);
    assert.equal(nearestWall({ x: 9, y: 9 }, walls, 0.5), null);
  });

  it('derives absolute opening endpoints from wall-relative position', () => {
    const { p1, p2, width } = openingEndpoints(walls[0], 0.5, 1);
    assert.deepEqual(p1, { x: 1.5, y: 0 });
    assert.deepEqual(p2, { x: 2.5, y: 0 });
    assert.equal(width, 1);
  });

  it('clamps openings so they never overhang short walls', () => {
    assert.equal(clampOpeningT(walls[0], 0, 1), 0.125);
    assert.equal(clampOpeningT(walls[0], 0.99, 1), 0.875);
    const tiny = { id: 't', start: { x: 0, y: 0 }, end: { x: 0.3, y: 0 }, thickness: 0.2 };
    assert.equal(clampOpeningT(tiny, 0.1, 2), 0.5);
  });

  it('measures polygon area and centroid', () => {
    const square = [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 3 },
      { x: 0, y: 3 },
    ];
    assert.equal(polygonArea(square), 12);
    assert.deepEqual(polygonCentroid(square), { x: 2, y: 1.5 });
    assert.equal(polygonArea([{ x: 0, y: 0 }]), 0);
  });

  it('edits wall endpoints and resizes walls to exact lengths', () => {
    const moved = setWallEndpoint(walls[0], 'end', { x: 6, y: 0 });
    assert.ok(moved);
    assert.deepEqual(moved.end, { x: 6, y: 0 });
    assert.equal(setWallEndpoint(walls[0], 'end', { x: 0.01, y: 0 }), null);
    const resized = setWallLength(walls[0], 2.5);
    assert.ok(resized);
    assert.deepEqual(resized.end, { x: 2.5, y: 0 });
    assert.equal(setWallLength(walls[0], 0.01), null);
    const shifted = translateWall(walls[0], { x: 1, y: 2 });
    assert.deepEqual(shifted.start, { x: 1, y: 2 });
    assert.deepEqual(shifted.end, { x: 5, y: 2 });
  });

  it('parses typed dimensions', () => {
    assert.equal(parseLengthM('4.25'), 4.25);
    assert.equal(parseLengthM('4,25 m'), 4.25);
    assert.equal(parseLengthM(' 2.5m '), 2.5);
    assert.equal(parseLengthM('abc'), null);
    assert.equal(parseLengthM('-1'), null);
    assert.equal(parseLengthM(''), null);
  });

  it('tests strict polygon containment excluding shared edges', () => {
    const square = [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 4 },
      { x: 0, y: 4 },
    ];
    assert.equal(pointInPolygon({ x: 2, y: 2 }, square), true);
    assert.equal(pointInPolygon({ x: 9, y: 9 }, square), false);
    assert.equal(pointStrictlyInPolygon({ x: 2, y: 2 }, square), true);
    // A neighbor centroid exactly on the shared edge is not "contained".
    assert.equal(pointStrictlyInPolygon({ x: 2, y: 0 }, square), false);
    assert.equal(pointStrictlyInPolygon({ x: 9, y: 9 }, square), false);
  });
});
