import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  GEOMETRY_CONSTRAINT_TYPES,
  geometryConstraintLabel,
  constraintKey,
  sortConstraintsByConfidence,
  summarizeConstraints,
  filterConstraintsByVisibility,
  isLowConfidenceConstraint,
  LOW_CONFIDENCE_THRESHOLD,
  defaultConstraintsVisibility,
  type GeometryConstraint,
  type GeometryConstraintsVisibility,
} from './vlm-floorplan-overlay.js';

const mk = (type: GeometryConstraint['type'], ids: string[], confidence = 0.9, reason: string | null = null): GeometryConstraint => ({
  type,
  objectIds: ids,
  confidence,
  reason,
});

const allTypes: GeometryConstraint['type'][] = [
  'merge_walls',
  'continue_wall',
  'extend_wall',
  'remove_object',
  'parallel_walls',
  'perpendicular_walls',
  'same_axis',
  'wall_corner',
  'wall_t_junction',
  'opening_interrupts_wall',
];

describe('geometry constraint helpers', () => {
  it('exposes all ten constraint types', () => {
    assert.deepEqual([...GEOMETRY_CONSTRAINT_TYPES].sort(), [...allTypes].sort());
  });

  it('labels every constraint type without throwing', () => {
    for (const type of allTypes) {
      const label = geometryConstraintLabel(type);
      assert.ok(typeof label === 'string' && label.length > 0, `missing label for ${type}`);
    }
  });

  it('produces a stable key from type + objectIds', () => {
    const a = mk('continue_wall', ['wall-9', 'wall-2']);
    const b = mk('continue_wall', ['wall-9', 'wall-2']);
    const c = mk('continue_wall', ['wall-2', 'wall-9']);
    assert.equal(constraintKey(a), constraintKey(b));
    assert.notEqual(constraintKey(a), constraintKey(c));
    assert.equal(constraintKey(a), 'continue_wall|wall-9|wall-2');
  });

  it('low confidence threshold is 0.75', () => {
    assert.equal(LOW_CONFIDENCE_THRESHOLD, 0.75);
    assert.equal(isLowConfidenceConstraint(0.74), true);
    assert.equal(isLowConfidenceConstraint(0.75), false);
    assert.equal(isLowConfidenceConstraint(0.99), false);
    assert.equal(isLowConfidenceConstraint(0.2), true);
  });

  it('summarizes constraints by category', () => {
    const constraints = [
      mk('merge_walls', ['wall-0', 'wall-1']),
      mk('merge_walls', ['wall-2', 'wall-3']),
      mk('continue_wall', ['wall-3', 'wall-1']),
      mk('extend_wall', ['wall-1', 'wall-0']),
      mk('remove_object', ['wall-1']),
      mk('remove_object', ['window-2']),
      mk('parallel_walls', ['wall-0', 'wall-1']),
      mk('perpendicular_walls', ['wall-2', 'wall-3']),
      mk('wall_corner', ['wall-0', 'wall-1']),
      mk('wall_t_junction', ['wall-0', 'wall-2']),
      mk('opening_interrupts_wall', ['window-2', 'wall-1']),
    ];
    const s = summarizeConstraints(constraints);
    assert.equal(s.total, 11);
    assert.equal(s.mergeWalls, 2);
    assert.equal(s.continueWall, 1);
    assert.equal(s.extendWall, 1);
    assert.equal(s.removeObject, 2);
    assert.equal(s.parallelPerpendicular, 2);
    assert.equal(s.corners, 1);
    assert.equal(s.tJunctions, 1);
    assert.equal(s.openingInterruptions, 1);
  });

  it('summarizes empty constraint list as zeros', () => {
    const s = summarizeConstraints([]);
    assert.deepEqual(s, {
      total: 0,
      mergeWalls: 0,
      continueWall: 0,
      extendWall: 0,
      removeObject: 0,
      parallelPerpendicular: 0,
      corners: 0,
      tJunctions: 0,
      openingInterruptions: 0,
    });
  });

  it('sorts constraints by confidence descending without mutating input', () => {
    const constraints = [
      mk('merge_walls', ['wall-0', 'wall-1'], 0.5),
      mk('continue_wall', ['wall-1', 'wall-2'], 0.95),
      mk('wall_corner', ['wall-0', 'wall-2'], 0.7),
    ];
    const sorted = sortConstraintsByConfidence(constraints);
    assert.deepEqual(sorted.map((c) => c.confidence), [0.95, 0.7, 0.5]);
    assert.deepEqual(constraints.map((c) => c.confidence), [0.5, 0.95, 0.7], 'input must not be mutated');
  });

  it('filters constraints by per-type visibility', () => {
    const constraints = [
      mk('merge_walls', ['wall-0', 'wall-1']),
      mk('continue_wall', ['wall-1', 'wall-2']),
      mk('remove_object', ['wall-0']),
      mk('wall_corner', ['wall-0', 'wall-2']),
    ];
    const visibility: GeometryConstraintsVisibility = { ...defaultConstraintsVisibility, mergeWalls: false, wallCorner: false };
    const filtered = filterConstraintsByVisibility(constraints, visibility);
    assert.deepEqual(filtered.map((c) => c.type), ['continue_wall', 'remove_object']);
  });

  it('filterConstraintsByVisibility keeps everything with default visibility', () => {
    const constraints = allTypes.map((type, i) =>
      type === 'remove_object' ? mk(type, [`wall-${i}`]) : mk(type, [`wall-${i}`, `wall-${i + 1}`]),
    );
    const filtered = filterConstraintsByVisibility(constraints, defaultConstraintsVisibility);
    assert.equal(filtered.length, allTypes.length);
  });

  it('remove_object constraints may reference a single object', () => {
    const c = mk('remove_object', ['wall-1'], 0.99);
    assert.equal(c.objectIds.length, 1);
    assert.equal(c.type, 'remove_object');
  });

  it('directional constraint types keep source→target order in key and label', () => {
    const directional: GeometryConstraint['type'][] = ['continue_wall', 'extend_wall', 'opening_interrupts_wall'];
    for (const type of directional) {
      const c = mk(type, ['source-0', 'target-0']);
      assert.equal(constraintKey(c), `${type}|source-0|target-0`);
      assert.ok(geometryConstraintLabel(type).length > 0);
    }
  });
});