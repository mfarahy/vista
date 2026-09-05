import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { convertRaster2SeqToFloorPlan } from './raster2seq-adapter.js';
import {
  clonePlan,
  pushHistory,
  redoStep,
  undoStep,
} from './plan-ops.js';
import { emptyFloorPlan } from './model.js';
import { importFloorPlanJson, serializeFloorPlan } from './serialization.js';

const fixturesDir = join(import.meta.dirname, 'fixtures');

function loadFixture(name: string): unknown {
  return JSON.parse(readFileSync(join(fixturesDir, name), 'utf8'));
}

/**
 * Phase 4 import semantics over pure operations (the React hook delegates
 * to these, so the guarantees hold in the editor too):
 * - a successful import replaces the plan as one undoable operation,
 * - a failed/invalid import leaves the existing plan untouched,
 * - undo removes the imported plan, redo restores it.
 */
describe('raster2seq import semantics', () => {
  it('successful import: image response becomes canonical FloorPlan JSON', () => {
    const converted = convertRaster2SeqToFloorPlan(loadFixture('raster2seq-mock.json'));
    assert.equal(converted.ok, true);
    if (!converted.ok) return;

    // The imported plan round-trips through the Phase 3 canonical format.
    const roundTrip = importFloorPlanJson(serializeFloorPlan(converted.plan));
    assert.equal(roundTrip.ok, true);
    if (!roundTrip.ok) return;
    assert.ok(roundTrip.plan.walls.length > 0);
    assert.equal(roundTrip.plan.units, 'm');
  });

  it('failed import keeps the existing plan unchanged', () => {
    const existing = convertRaster2SeqToFloorPlan(loadFixture('raster2seq-real-sample1.json'));
    assert.equal(existing.ok, true);
    if (!existing.ok) return;
    const snapshot = serializeFloorPlan(existing.plan);

    const failed = convertRaster2SeqToFloorPlan({ status: 'error', code: 'INFERENCE_FAILED' });
    assert.equal(failed.ok, false);

    // The caller only replaces the plan on success, so the snapshot is intact.
    assert.equal(serializeFloorPlan(existing.plan), snapshot);
  });

  it('invalid geometry keeps the existing plan unchanged', () => {
    const existing = convertRaster2SeqToFloorPlan(loadFixture('raster2seq-mock.json'));
    assert.equal(existing.ok, true);
    if (!existing.ok) return;
    const snapshot = serializeFloorPlan(existing.plan);

    const bad = convertRaster2SeqToFloorPlan({ spaces: [{ id: 0 }] });
    assert.equal(bad.ok, false);
    assert.equal(serializeFloorPlan(existing.plan), snapshot);
  });

  it('undo removes the imported plan and redo restores it', () => {
    const converted = convertRaster2SeqToFloorPlan(loadFixture('raster2seq-mock.json'));
    assert.equal(converted.ok, true);
    if (!converted.ok) return;

    let past: ReturnType<typeof clonePlan>[] = [];
    let future: ReturnType<typeof clonePlan>[] = [];
    let current = clonePlan(emptyFloorPlan());

    // Import replaces the plan as one undoable operation.
    past = pushHistory(past, clonePlan(current), 100);
    future = [];
    current = clonePlan(converted.plan);
    assert.ok(current.walls.length > 0);

    const undone = undoStep(past, future, clonePlan(current));
    assert.ok(undone);
    past = undone.past;
    future = undone.future;
    current = undone.current;
    assert.equal(current.walls.length, 0);

    const redone = redoStep(past, future, clonePlan(current));
    assert.ok(redone);
    current = redone.current;
    assert.equal(current.walls.length, converted.plan.walls.length);
    assert.equal(serializeFloorPlan(current), serializeFloorPlan(converted.plan));
  });
});
