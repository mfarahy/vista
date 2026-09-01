import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  vlmFloorplanAnalysisSchema,
  validateVlmAnalysis,
  isValidObjectId,
  parseObjectId,
} from './schema.js';

describe('vlm-floorplan schema validation', () => {
  const rawFixture = {
    wall: [[ [0, 0], [1, 1] ], [ [0, 0], [1, 1] ], [ [0, 0], [1, 1] ]],
    door: [[ [0, 0] ]],
    entry_door: [],
    window: [[ [0, 0] ], [ [0, 0] ]],
    kitchen: [],
    door_center_line: [],
    entry_door_center_line: [],
    window_center_line: [],
  } as unknown as Record<string, unknown>;

  it('parses valid VLM analysis', () => {
    const input = {
      wallRelationships: [
        { wallIds: ['wall-1', 'wall-2'], relationship: 'same_continuous_wall', confidence: 0.94, reason: 'same exterior wall' },
      ],
      openings: [
        { objectId: 'window-0', type: 'window', hostWallIds: ['wall-1'], relationship: 'interrupts_wall', confidence: 0.98, reason: null },
      ],
      wallConnections: [
        { wallIds: ['wall-0', 'wall-1'], relationship: 'corner', confidence: 0.91, reason: null },
      ],
      rooms: [
        { id: 'room-1', type: 'living', boundaryWalls: ['wall-0', 'wall-1'], openings: ['window-0'], confidence: 0.89, reason: null },
      ],
      artifacts: [
        { objectId: 'wall-2', classification: 'likely_false_positive', confidence: 0.87, reason: 'no visible wall' },
      ],
    };
    const parsed = vlmFloorplanAnalysisSchema.parse(input);
    assert.equal(parsed.wallRelationships.length, 1);
    assert.equal(parsed.openings.length, 1);
    assert.equal(parsed.rooms.length, 1);
    assert.equal(parsed.artifacts.length, 1);
  });

  it('rejects invalid object IDs via validateVlmAnalysis', () => {
    const analysis = vlmFloorplanAnalysisSchema.parse({
      wallRelationships: [
        { wallIds: ['wall-0', 'wall-99'], relationship: 'corner', confidence: 0.9, reason: null },
        { wallIds: ['wall-10', 'wall-11'], relationship: 'uncertain', confidence: 0.5, reason: null },
      ],
      openings: [{ objectId: 'window-5', type: 'window', hostWallIds: ['wall-0'], relationship: 'interrupts_wall', confidence: 0.9, reason: null }],
      wallConnections: [{ wallIds: ['wall-0', 'wall-999'], relationship: 'corner', confidence: 0.8, reason: null }],
      rooms: [{ id: 'room-1', type: 'kitchen', boundaryWalls: ['wall-0', 'wall-999'], openings: [], confidence: 0.9, reason: null }],
      artifacts: [{ objectId: 'wall-999', classification: 'likely_false_positive', confidence: 0.9, reason: null }],
    });
    const { analysis: filtered, warnings } = validateVlmAnalysis(analysis, rawFixture);
    // wall-99 and wall-999 invalid, window-5 has index out of bounds (window length 2 => max index 1)
    assert.ok(warnings.length > 0);
    // Only wall-0 valid remains for first wallRelationship but needs min 2 => filtered out
    assert.equal(filtered.wallRelationships.length, 0);
    assert.equal(filtered.openings.length, 0);
    assert.equal(filtered.wallConnections.length, 0);
    // room should have 1 valid boundary object retained, not dropped entirely
    assert.equal(filtered.rooms.length, 1);
    assert.equal((filtered.rooms[0] as unknown as { boundaryWalls: string[] }).boundaryWalls.length, 1);
    assert.equal(filtered.artifacts.length, 0);
  });

  it('preserves raw coordinates (no mutation of raw)', () => {
    const rawClone = JSON.parse(JSON.stringify(rawFixture));
    const analysis = vlmFloorplanAnalysisSchema.parse({
      wallRelationships: [{ wallIds: ['wall-0', 'wall-1'], relationship: 'same_continuous_wall', confidence: 1, reason: null }],
      openings: [],
      wallConnections: [],
      rooms: [],
      artifacts: [],
    });
    validateVlmAnalysis(analysis, rawFixture);
    assert.deepEqual(rawFixture, rawClone);
  });

  it('parses confidence clamped 0..1', () => {
    assert.throws(() => vlmFloorplanAnalysisSchema.parse({
      wallRelationships: [{ wallIds: ['wall-0', 'wall-1'], relationship: 'corner', confidence: 1.5, reason: null }],
      openings: [], wallConnections: [], rooms: [], artifacts: [],
    }));
    assert.throws(() => vlmFloorplanAnalysisSchema.parse({
      wallRelationships: [{ wallIds: ['wall-0', 'wall-1'], relationship: 'corner', confidence: -0.1, reason: null }],
      openings: [], wallConnections: [], rooms: [], artifacts: [],
    }));
  });

  it('isValidObjectId correctly validates', () => {
    assert.equal(isValidObjectId('wall-0', rawFixture), true);
    assert.equal(isValidObjectId('wall-2', rawFixture), true);
    assert.equal(isValidObjectId('wall-3', rawFixture), false);
    assert.equal(isValidObjectId('window-1', rawFixture), true);
    assert.equal(isValidObjectId('window-99', rawFixture), false);
    assert.equal(isValidObjectId('door-0', rawFixture), true);
    assert.equal(isValidObjectId('invalid-0', rawFixture), false);
    assert.equal(isValidObjectId('wall', rawFixture), false);
    assert.equal(isValidObjectId('entry_door-0', rawFixture), false); // raw has 0 entry_door
  });

  it('parseObjectId handles underscore categories', () => {
    assert.deepEqual(parseObjectId('wall-3'), { category: 'wall', index: 3 });
    assert.deepEqual(parseObjectId('entry_door-0'), { category: 'entry_door', index: 0 });
    assert.deepEqual(parseObjectId('window_center_line-1'), { category: 'window_center_line', index: 1 });
    assert.equal(parseObjectId('unknown-0'), null);
    assert.equal(parseObjectId('wall-'), null);
  });

  it('accepts empty arrays when explicitly provided', () => {
    const parsed = vlmFloorplanAnalysisSchema.parse({
      wallRelationships: [],
      openings: [],
      wallConnections: [],
      rooms: [],
      artifacts: [],
    });
    assert.deepEqual(parsed.wallRelationships, []);
    assert.deepEqual(parsed.openings, []);
    assert.deepEqual(parsed.rooms, []);
  });

  it('rejects missing required arrays (strict mode)', () => {
    assert.throws(() => vlmFloorplanAnalysisSchema.parse({} as never));
  });
});
