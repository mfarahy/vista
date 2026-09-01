import assert from 'node:assert/strict';
import { describe, it, before } from 'node:test';
import {
  vlmFloorplanAnalysisSchema,
  validateVlmAnalysis,
  isValidObjectId,
  parseObjectId,
  emptyTopologySummary,
  type TopologySummary,
} from './schema.js';

describe('vlm-floorplan schema validation', () => {
  const rawFixture = {
    wall: [[ [0, 0], [1, 1] ], [ [0, 0], [1, 1] ], [ [0, 0], [1, 1] ], [ [0, 0], [1, 1] ]],
    door: [[ [0, 0] ], [ [0, 0] ]],
    entry_door: [],
    window: [[ [0, 0] ], [ [0, 0] ], [ [0, 0] ]],
    kitchen: [],
    door_center_line: [],
    entry_door_center_line: [],
    window_center_line: [],
  } as unknown as Record<string, unknown>;

  const baseAnalysis = {
    wallRelationships: [],
    openings: [],
    objectClassifications: [],
    rooms: [],
    topologySummary: emptyTopologySummary(),
  };

  describe('topology contract — valid topology', () => {
    it('parses a complete valid topology analysis', () => {
      const input = {
        wallRelationships: [
          { wallIds: ['wall-3', 'wall-1'], relationship: 'same_continuous_wall', confidence: 0.94, reason: 'east facade' },
          { wallIds: ['wall-0', 'wall-1'], relationship: 'corner', confidence: 0.9, reason: null },
          { wallIds: ['wall-2', 'wall-1'], relationship: 'T_junction', confidence: 0.7, reason: null },
          { wallIds: ['wall-2', 'wall-3'], relationship: 'collinear', confidence: 0.6, reason: null },
          { wallIds: ['wall-0', 'wall-3'], relationship: 'perpendicular', confidence: 0.8, reason: null },
          { wallIds: ['wall-1', 'wall-3'], relationship: 'extension_of', confidence: 0.75, reason: null },
        ],
        openings: [
          { objectId: 'window-2', type: 'window', hostWallIds: ['wall-1'], relationship: 'interrupts_wall', confidence: 0.96, reason: 'vertical window in east facade' },
          { objectId: 'door-0', type: 'door', hostWallIds: ['wall-0', 'wall-1'], relationship: 'interrupts_wall', confidence: 0.8, reason: 'at junction' },
        ],
        objectClassifications: [
          { objectId: 'window-1', classification: 'likely_false_positive', confidence: 0.98, reason: 'diagonal, overlaps furniture' },
          { objectId: 'wall-4', classification: 'suspicious', confidence: 0.6, reason: 'stair contamination' },
          { objectId: 'wall-0', classification: 'valid', confidence: 0.9, reason: null },
          { objectId: 'door-1', classification: 'uncertain', confidence: 0.4, reason: 'ambiguous' },
        ],
        rooms: [
          { id: 'kitchen-0', type: 'kitchen', boundaryWalls: ['wall-3', 'wall-2', 'wall-4'], openings: ['window-3', 'door-4'], confidence: 0.92, reason: null },
        ],
        topologySummary: {
          continuousWalls: [['wall-3', 'wall-1']],
          corners: [['wall-3', 'wall-2'], ['wall-2', 'wall-4']],
          tJunctions: [['wall-3', 'wall-2']],
          falsePositives: ['window-1'],
        },
      };
      const parsed = vlmFloorplanAnalysisSchema.parse(input);
      assert.equal(parsed.wallRelationships.length, 6);
      assert.equal(parsed.openings.length, 2);
      assert.equal(parsed.objectClassifications.length, 4);
      assert.equal(parsed.rooms.length, 1);
      assert.equal(parsed.topologySummary.continuousWalls.length, 1);
      assert.equal(parsed.topologySummary.corners.length, 2);
      assert.equal(parsed.topologySummary.tJunctions.length, 1);
      assert.deepEqual(parsed.topologySummary.falsePositives, ['window-1']);
    });

    it('rejects missing required arrays (strict mode)', () => {
      assert.throws(() => vlmFloorplanAnalysisSchema.parse({} as never));
      assert.throws(() => vlmFloorplanAnalysisSchema.parse({
        wallRelationships: [], openings: [], objectClassifications: [], rooms: [],
        // topologySummary missing
      } as never));
    });

    it('accepts empty arrays and empty topology summary', () => {
      const parsed = vlmFloorplanAnalysisSchema.parse(baseAnalysis);
      assert.deepEqual(parsed.wallRelationships, []);
      assert.deepEqual(parsed.openings, []);
      assert.deepEqual(parsed.objectClassifications, []);
      assert.deepEqual(parsed.rooms, []);
      assert.deepEqual(parsed.topologySummary, emptyTopologySummary());
    });
  });

  describe('wall relationships', () => {
    it('supports the full relationship enum', () => {
      for (const rel of ['same_continuous_wall', 'separate_walls', 'collinear', 'perpendicular', 'corner', 'T_junction', 'extension_of', 'uncertain']) {
        assert.doesNotThrow(() => vlmFloorplanAnalysisSchema.parse({
          ...baseAnalysis,
          wallRelationships: [{ wallIds: ['wall-0', 'wall-1'], relationship: rel, confidence: 0.5, reason: null }],
        }));
      }
    });

    it('rejects unknown relationships', () => {
      assert.throws(() => vlmFloorplanAnalysisSchema.parse({
        ...baseAnalysis,
        wallRelationships: [{ wallIds: ['wall-0', 'wall-1'], relationship: 'touching', confidence: 0.5, reason: null }],
      }));
    });

    it('requires at least 2 wallIds', () => {
      assert.throws(() => vlmFloorplanAnalysisSchema.parse({
        ...baseAnalysis,
        wallRelationships: [{ wallIds: ['wall-0'], relationship: 'corner', confidence: 0.5, reason: null }],
      }));
    });

    it('filters invalid wall IDs, dropping relationships with <2 valid', () => {
      const analysis = vlmFloorplanAnalysisSchema.parse({
        ...baseAnalysis,
        wallRelationships: [
          { wallIds: ['wall-0', 'wall-99'], relationship: 'corner', confidence: 0.9, reason: null },
          { wallIds: ['wall-10', 'wall-11'], relationship: 'uncertain', confidence: 0.5, reason: null },
          { wallIds: ['wall-0', 'wall-1'], relationship: 'same_continuous_wall', confidence: 0.9, reason: null },
        ],
      });
      const { analysis: filtered, warnings } = validateVlmAnalysis(analysis, rawFixture);
      assert.ok(warnings.length > 0);
      // first two have invalid ids -> dropped, third survives with both ids valid
      assert.equal(filtered.wallRelationships.length, 1);
      assert.deepEqual(filtered.wallRelationships[0].wallIds, ['wall-0', 'wall-1']);
    });
  });

  describe('opening-host relationships', () => {
    it('parses valid opening-host relationships', () => {
      const parsed = vlmFloorplanAnalysisSchema.parse({
        ...baseAnalysis,
        openings: [
          { objectId: 'window-2', type: 'window', hostWallIds: ['wall-1'], relationship: 'interrupts_wall', confidence: 0.96, reason: 'embedded in east facade' },
        ],
      });
      assert.equal(parsed.openings[0].objectId, 'window-2');
      assert.deepEqual(parsed.openings[0].hostWallIds, ['wall-1']);
    });

    it('supports multiple host walls at a junction', () => {
      const parsed = vlmFloorplanAnalysisSchema.parse({
        ...baseAnalysis,
        openings: [
          { objectId: 'door-0', type: 'door', hostWallIds: ['wall-0', 'wall-1'], relationship: 'interrupts_wall', confidence: 0.8, reason: null },
        ],
      });
      assert.deepEqual(parsed.openings[0].hostWallIds, ['wall-0', 'wall-1']);
    });

    it('rejects openings with no host wall', () => {
      assert.throws(() => vlmFloorplanAnalysisSchema.parse({
        ...baseAnalysis,
        openings: [{ objectId: 'window-0', type: 'window', hostWallIds: [], relationship: 'interrupts_wall', confidence: 0.9, reason: null }],
      }));
    });

    it('filters invalid opening object IDs and host wall IDs', () => {
      const analysis = vlmFloorplanAnalysisSchema.parse({
        ...baseAnalysis,
        openings: [
          { objectId: 'window-9', type: 'window', hostWallIds: ['wall-0'], relationship: 'interrupts_wall', confidence: 0.9, reason: null },
          { objectId: 'window-0', type: 'window', hostWallIds: ['wall-99'], relationship: 'interrupts_wall', confidence: 0.9, reason: null },
          { objectId: 'window-1', type: 'window', hostWallIds: ['wall-0', 'wall-1'], relationship: 'interrupts_wall', confidence: 0.9, reason: null },
        ],
      });
      const { analysis: filtered, warnings } = validateVlmAnalysis(analysis, rawFixture);
      assert.ok(warnings.length > 0);
      assert.equal(filtered.openings.length, 1);
      assert.deepEqual(filtered.openings[0].hostWallIds, ['wall-0', 'wall-1']);
    });
  });

  describe('object classification', () => {
    it('supports all classification levels', () => {
      for (const cls of ['valid', 'suspicious', 'likely_false_positive', 'uncertain']) {
        assert.doesNotThrow(() => vlmFloorplanAnalysisSchema.parse({
          ...baseAnalysis,
          objectClassifications: [{ objectId: 'window-0', classification: cls, confidence: 0.5, reason: null }],
        }));
      }
    });

    it('rejects unknown classifications', () => {
      assert.throws(() => vlmFloorplanAnalysisSchema.parse({
        ...baseAnalysis,
        objectClassifications: [{ objectId: 'window-0', classification: 'maybe', confidence: 0.5, reason: null }],
      }));
    });

    it('accepts likely_false_positive with high confidence', () => {
      const parsed = vlmFloorplanAnalysisSchema.parse({
        ...baseAnalysis,
        objectClassifications: [
          { objectId: 'window-1', classification: 'likely_false_positive', confidence: 0.98, reason: 'overlaps furniture, not architectural' },
        ],
      });
      assert.equal(parsed.objectClassifications[0].classification, 'likely_false_positive');
      assert.equal(parsed.objectClassifications[0].confidence, 0.98);
    });

    it('accepts suspicious objects (geometry not trusted as-is)', () => {
      const parsed = vlmFloorplanAnalysisSchema.parse({
        ...baseAnalysis,
        objectClassifications: [
          { objectId: 'wall-4', classification: 'suspicious', confidence: 0.6, reason: 'stair contamination' },
        ],
      });
      assert.equal(parsed.objectClassifications[0].classification, 'suspicious');
    });

    it('filters invalid classification object IDs', () => {
      const analysis = vlmFloorplanAnalysisSchema.parse({
        ...baseAnalysis,
        objectClassifications: [
          { objectId: 'wall-9', classification: 'suspicious', confidence: 0.5, reason: null },
          { objectId: 'window-1', classification: 'valid', confidence: 0.9, reason: null },
        ],
      });
      const { analysis: filtered, warnings } = validateVlmAnalysis(analysis, rawFixture);
      assert.ok(warnings.length > 0);
      assert.equal(filtered.objectClassifications.length, 1);
      assert.equal(filtered.objectClassifications[0].objectId, 'window-1');
    });
  });

  describe('uncertain relationships', () => {
    it('allows explicit uncertain relationships and low confidence', () => {
      const parsed = vlmFloorplanAnalysisSchema.parse({
        ...baseAnalysis,
        wallRelationships: [
          { wallIds: ['wall-0', 'wall-1'], relationship: 'uncertain', confidence: 0.25, reason: 'host segment ambiguous' },
        ],
        openings: [
          { objectId: 'window-2', type: 'window', hostWallIds: ['wall-1'], relationship: 'uncertain', confidence: 0.18, reason: 'cannot reliably identify host' },
        ],
      });
      assert.equal(parsed.wallRelationships[0].relationship, 'uncertain');
      assert.equal(parsed.openings[0].relationship, 'uncertain');
    });
  });

  describe('topology summary', () => {
    it('filters invalid IDs from the summary', () => {
      const summary: TopologySummary = {
        continuousWalls: [['wall-3', 'wall-1'], ['wall-0', 'wall-99']],
        corners: [['wall-0', 'wall-1'], ['wall-3', 'wall-999']],
        tJunctions: [['wall-2', 'wall-1'], ['wall-9', 'wall-1']],
        falsePositives: ['window-1', 'door-99'],
      };
      const analysis = vlmFloorplanAnalysisSchema.parse({
        wallRelationships: [],
        openings: [],
        objectClassifications: [],
        rooms: [],
        topologySummary: summary,
      });
      const { analysis: filtered, warnings } = validateVlmAnalysis(analysis, rawFixture);
      assert.ok(warnings.length > 0);
      // wall-99 invalid -> group dropped
      assert.deepEqual(filtered.topologySummary.continuousWalls, [['wall-3', 'wall-1']]);
      // wall-999 invalid -> pair dropped
      assert.deepEqual(filtered.topologySummary.corners, [['wall-0', 'wall-1']]);
      // wall-9 invalid -> pair dropped
      assert.deepEqual(filtered.topologySummary.tJunctions, [['wall-2', 'wall-1']]);
      // door-99 invalid -> filtered
      assert.deepEqual(filtered.topologySummary.falsePositives, ['window-1']);
    });

    it('requires exactly 2 ids for corners and tJunctions', () => {
      assert.throws(() => vlmFloorplanAnalysisSchema.parse({
        ...baseAnalysis,
        topologySummary: { continuousWalls: [], corners: [['wall-0']], tJunctions: [], falsePositives: [] },
      }));
      assert.throws(() => vlmFloorplanAnalysisSchema.parse({
        ...baseAnalysis,
        topologySummary: { continuousWalls: [], corners: [], tJunctions: [['wall-0', 'wall-1', 'wall-2']], falsePositives: [] },
      }));
    });

    it('continuousWalls requires at least 2 ids per group', () => {
      assert.throws(() => vlmFloorplanAnalysisSchema.parse({
        ...baseAnalysis,
        topologySummary: { continuousWalls: [['wall-0']], corners: [], tJunctions: [], falsePositives: [] },
      }));
    });
  });

  describe('confidence validation', () => {
    it('clamps confidence to 0..1', () => {
      assert.throws(() => vlmFloorplanAnalysisSchema.parse({
        ...baseAnalysis,
        wallRelationships: [{ wallIds: ['wall-0', 'wall-1'], relationship: 'corner', confidence: 1.5, reason: null }],
      }));
      assert.throws(() => vlmFloorplanAnalysisSchema.parse({
        ...baseAnalysis,
        wallRelationships: [{ wallIds: ['wall-0', 'wall-1'], relationship: 'corner', confidence: -0.1, reason: null }],
      }));
      assert.throws(() => vlmFloorplanAnalysisSchema.parse({
        ...baseAnalysis,
        openings: [{ objectId: 'window-0', type: 'window', hostWallIds: ['wall-0'], relationship: 'interrupts_wall', confidence: 2, reason: null }],
      }));
      assert.throws(() => vlmFloorplanAnalysisSchema.parse({
        ...baseAnalysis,
        objectClassifications: [{ objectId: 'window-0', classification: 'valid', confidence: -0.01, reason: null }],
      }));
    });
  });

  describe('object id helpers', () => {
    it('isValidObjectId correctly validates against raw fixture', () => {
      assert.equal(isValidObjectId('wall-0', rawFixture), true);
      assert.equal(isValidObjectId('wall-3', rawFixture), true);
      assert.equal(isValidObjectId('wall-4', rawFixture), false);
      assert.equal(isValidObjectId('window-2', rawFixture), true);
      assert.equal(isValidObjectId('window-3', rawFixture), false);
      assert.equal(isValidObjectId('door-1', rawFixture), true);
      assert.equal(isValidObjectId('door-2', rawFixture), false);
      assert.equal(isValidObjectId('entry_door-0', rawFixture), false); // raw has 0 entry_door
      assert.equal(isValidObjectId('invalid-0', rawFixture), false);
      assert.equal(isValidObjectId('wall', rawFixture), false);
    });

    it('parseObjectId handles underscore categories', () => {
      assert.deepEqual(parseObjectId('wall-3'), { category: 'wall', index: 3 });
      assert.deepEqual(parseObjectId('entry_door-0'), { category: 'entry_door', index: 0 });
      assert.deepEqual(parseObjectId('window_center_line-1'), { category: 'window_center_line', index: 1 });
      assert.equal(parseObjectId('unknown-0'), null);
      assert.equal(parseObjectId('wall-'), null);
    });
  });

  it('preserves raw coordinates (no mutation of raw)', () => {
    const rawClone = JSON.parse(JSON.stringify(rawFixture));
    const analysis = vlmFloorplanAnalysisSchema.parse({
      ...baseAnalysis,
      wallRelationships: [{ wallIds: ['wall-0', 'wall-1'], relationship: 'same_continuous_wall', confidence: 1, reason: null }],
    });
    validateVlmAnalysis(analysis, rawFixture);
    assert.deepEqual(rawFixture, rawClone);
  });

  describe('opening hostWallIds empty + uncertain', () => {
    it('allows empty hostWallIds when relationship is uncertain', () => {
      assert.doesNotThrow(() =>
        vlmFloorplanAnalysisSchema.parse({
          ...baseAnalysis,
          openings: [{ objectId: 'window-0', type: 'window', hostWallIds: [], relationship: 'uncertain', confidence: 0.2, reason: 'cannot identify host' }],
        }),
      );
    });

    it('rejects empty hostWallIds when relationship is not uncertain', () => {
      assert.throws(() =>
        vlmFloorplanAnalysisSchema.parse({
          ...baseAnalysis,
          openings: [{ objectId: 'window-0', type: 'window', hostWallIds: [], relationship: 'interrupts_wall', confidence: 0.9, reason: null }],
        }),
      );
    });

    it('keeps uncertain openings with empty hostWallIds through validation (not dropped)', () => {
      const analysis = vlmFloorplanAnalysisSchema.parse({
        ...baseAnalysis,
        openings: [{ objectId: 'window-0', type: 'window', hostWallIds: [], relationship: 'uncertain', confidence: 0.15, reason: 'uncertain host' }],
      });
      const { analysis: filtered, warnings } = validateVlmAnalysis(analysis, rawFixture);
      assert.equal(filtered.openings.length, 1);
      assert.deepEqual(filtered.openings[0].hostWallIds, []);
      assert.equal(filtered.openings[0].relationship, 'uncertain');
      assert.equal(warnings.length, 0);
    });
  });

  describe('deduplication and conflicts — deterministic handling', () => {
    it('deduplicates wallRelationships: prefers higher confidence', () => {
      const analysis = vlmFloorplanAnalysisSchema.parse({
        ...baseAnalysis,
        wallRelationships: [
          { wallIds: ['wall-0', 'wall-1'], relationship: 'corner', confidence: 0.6, reason: null },
          { wallIds: ['wall-1', 'wall-0'], relationship: 'corner', confidence: 0.92, reason: null },
        ],
      });
      const { analysis: filtered, warnings } = validateVlmAnalysis(analysis, rawFixture);
      assert.equal(filtered.wallRelationships.length, 1);
      assert.equal(filtered.wallRelationships[0].confidence, 0.92);
      assert.ok(warnings.some((w) => w.includes('duplicate')));
    });

    it('marks duplicate wallRelationships as uncertain when confidence tied but relationship conflicts', () => {
      const analysis = vlmFloorplanAnalysisSchema.parse({
        ...baseAnalysis,
        wallRelationships: [
          { wallIds: ['wall-0', 'wall-1'], relationship: 'same_continuous_wall', confidence: 0.85, reason: null },
          { wallIds: ['wall-1', 'wall-0'], relationship: 'corner', confidence: 0.85, reason: null },
        ],
      });
      const { analysis: filtered, warnings } = validateVlmAnalysis(analysis, rawFixture);
      assert.equal(filtered.wallRelationships.length, 1);
      assert.equal(filtered.wallRelationships[0].relationship, 'uncertain');
      assert.ok(warnings.some((w) => w.includes('conflict')));
    });

    it('deduplicates openings by objectId: prefers higher confidence', () => {
      const analysis = vlmFloorplanAnalysisSchema.parse({
        ...baseAnalysis,
        openings: [
          { objectId: 'window-0', type: 'window', hostWallIds: ['wall-0'], relationship: 'interrupts_wall', confidence: 0.5, reason: null },
          { objectId: 'window-0', type: 'window', hostWallIds: ['wall-1'], relationship: 'interrupts_wall', confidence: 0.9, reason: null },
        ],
      });
      const { analysis: filtered, warnings } = validateVlmAnalysis(analysis, rawFixture);
      assert.equal(filtered.openings.length, 1);
      assert.deepEqual(filtered.openings[0].hostWallIds, ['wall-1']);
      assert.ok(warnings.some((w) => w.includes('duplicate')));
    });

    it('marks duplicate openings as uncertain when confidence tied but relationship conflicts', () => {
      const analysis = vlmFloorplanAnalysisSchema.parse({
        ...baseAnalysis,
        openings: [
          { objectId: 'window-0', type: 'window', hostWallIds: ['wall-0'], relationship: 'interrupts_wall', confidence: 0.7, reason: null },
          { objectId: 'window-0', type: 'window', hostWallIds: ['wall-1'], relationship: 'uncertain', confidence: 0.7, reason: null },
        ],
      });
      const { analysis: filtered } = validateVlmAnalysis(analysis, rawFixture);
      assert.equal(filtered.openings.length, 1);
      assert.equal(filtered.openings[0].relationship, 'uncertain');
      assert.deepEqual(filtered.openings[0].hostWallIds, []);
    });

    it('deduplicates objectClassifications: prefers higher confidence', () => {
      const analysis = vlmFloorplanAnalysisSchema.parse({
        ...baseAnalysis,
        objectClassifications: [
          { objectId: 'window-0', classification: 'valid', confidence: 0.4, reason: null },
          { objectId: 'window-0', classification: 'likely_false_positive', confidence: 0.95, reason: null },
        ],
      });
      const { analysis: filtered, warnings } = validateVlmAnalysis(analysis, rawFixture);
      assert.equal(filtered.objectClassifications.length, 1);
      assert.equal(filtered.objectClassifications[0].classification, 'likely_false_positive');
      assert.ok(warnings.some((w) => w.includes('duplicate')));
    });

    it('marks duplicate classifications as uncertain when tied and conflicting', () => {
      const analysis = vlmFloorplanAnalysisSchema.parse({
        ...baseAnalysis,
        objectClassifications: [
          { objectId: 'window-0', classification: 'valid', confidence: 0.8, reason: null },
          { objectId: 'window-0', classification: 'suspicious', confidence: 0.8, reason: null },
        ],
      });
      const { analysis: filtered, warnings } = validateVlmAnalysis(analysis, rawFixture);
      assert.equal(filtered.objectClassifications.length, 1);
      assert.equal(filtered.objectClassifications[0].classification, 'uncertain');
      assert.ok(warnings.some((w) => w.includes('conflict')));
    });

    it('deduplicates topologySummary entries', () => {
      const analysis = vlmFloorplanAnalysisSchema.parse({
        ...baseAnalysis,
        topologySummary: {
          continuousWalls: [['wall-0', 'wall-1'], ['wall-1', 'wall-0']],
          corners: [['wall-0', 'wall-1'], ['wall-0', 'wall-1']],
          tJunctions: [['wall-0', 'wall-2']],
          falsePositives: ['window-0', 'window-0'],
        },
      });
      const { analysis: filtered, warnings } = validateVlmAnalysis(analysis, rawFixture);
      assert.equal(filtered.topologySummary.continuousWalls.length, 1);
      assert.equal(filtered.topologySummary.corners.length, 1);
      assert.equal(filtered.topologySummary.falsePositives.length, 1);
      assert.ok(warnings.some((w) => w.includes('duplicate')));
    });

    it('false positives from topologySummary must be valid IDs', () => {
      const analysis = vlmFloorplanAnalysisSchema.parse({
        ...baseAnalysis,
        topologySummary: { continuousWalls: [], corners: [], tJunctions: [], falsePositives: ['wall-0'] },
      });
      const { analysis: filtered } = validateVlmAnalysis(analysis, rawFixture);
      assert.deepEqual(filtered.topologySummary.falsePositives, ['wall-0']);
    });

    it('confidence bounds rejected outside 0..1 (schema)', () => {
      assert.throws(() =>
        vlmFloorplanAnalysisSchema.parse({
          ...baseAnalysis,
          wallRelationships: [{ wallIds: ['wall-0', 'wall-1'], relationship: 'corner', confidence: 1.1, reason: null }],
        }),
      );
      assert.throws(() =>
        vlmFloorplanAnalysisSchema.parse({
          ...baseAnalysis,
          openings: [{ objectId: 'window-0', type: 'window', hostWallIds: ['wall-0'], relationship: 'interrupts_wall', confidence: -0.05, reason: null }],
        }),
      );
    });
  });

  describe('corner vs same_continuous_wall semantics', () => {
    it('accepts corner and same_continuous_wall as distinct valid relationships', () => {
      const corner = vlmFloorplanAnalysisSchema.parse({
        ...baseAnalysis,
        wallRelationships: [{ wallIds: ['wall-0', 'wall-1'], relationship: 'corner', confidence: 0.92, reason: 'North + East meet at right angle' }],
      });
      assert.equal(corner.wallRelationships[0].relationship, 'corner');
      const same = vlmFloorplanAnalysisSchema.parse({
        ...baseAnalysis,
        wallRelationships: [{ wallIds: ['wall-0', 'wall-1'], relationship: 'same_continuous_wall', confidence: 0.92, reason: 'collinear segments of same straight wall' }],
      });
      assert.equal(same.wallRelationships[0].relationship, 'same_continuous_wall');
    });
  });
});

describe('vlm-floorplan topology contract against real fixture (c658e915…)', () => {
  let fixture: Record<string, unknown>;

  before(async () => {
    fixture = (await import('../../../../job-processor/src/lib/floorplan-pipeline/fixtures/recognition-c658e915-9247-4904-8032-717dd11ecfdd.json', { with: { type: 'json' } } as unknown as ImportAttributes)).default as Record<string, unknown>;
  });

  it('validates a realistic east-facade topology against the fixture without warnings', () => {
    const analysis = vlmFloorplanAnalysisSchema.parse({
      wallRelationships: [
        { wallIds: ['wall-3', 'wall-1'], relationship: 'same_continuous_wall', confidence: 0.94, reason: 'east exterior facade' },
        { wallIds: ['wall-3', 'wall-2'], relationship: 'corner', confidence: 0.88, reason: null },
        { wallIds: ['wall-2', 'wall-4'], relationship: 'corner', confidence: 0.86, reason: null },
      ],
      openings: [
        { objectId: 'window-2', type: 'window', hostWallIds: ['wall-1'], relationship: 'interrupts_wall', confidence: 0.96, reason: 'vertical window in east facade' },
        { objectId: 'window-3', type: 'window', hostWallIds: ['wall-4'], relationship: 'interrupts_wall', confidence: 0.76, reason: 'kitchen window on north wall' },
        { objectId: 'entry_door-0', type: 'entry_door', hostWallIds: ['wall-0', 'wall-1'], relationship: 'interrupts_wall', confidence: 0.91, reason: null },
      ],
      objectClassifications: [
        { objectId: 'window-1', classification: 'likely_false_positive', confidence: 0.98, reason: 'diagonal object, overlaps furniture' },
        { objectId: 'wall-4', classification: 'suspicious', confidence: 0.62, reason: 'stair graphics contamination' },
        { objectId: 'wall-0', classification: 'valid', confidence: 0.85, reason: null },
      ],
      rooms: [
        { id: 'kitchen-0', type: 'kitchen', boundaryWalls: ['wall-4', 'wall-2'], openings: ['window-3', 'door-4'], confidence: 0.92, reason: null },
        { id: 'hallway-0', type: 'hallway', boundaryWalls: ['wall-4', 'wall-2', 'wall-0', 'wall-1'], openings: ['door-1', 'door-3'], confidence: 0.78, reason: null },
      ],
      topologySummary: {
        continuousWalls: [['wall-3', 'wall-1']],
        corners: [['wall-3', 'wall-2'], ['wall-2', 'wall-4'], ['wall-4', 'wall-0'], ['wall-0', 'wall-1']],
        tJunctions: [],
        falsePositives: ['window-1'],
      },
    });

    const { analysis: filtered, warnings } = validateVlmAnalysis(analysis, fixture);
    // All IDs exist in the real fixture → no warnings
    assert.deepEqual(warnings, []);
    assert.equal(filtered.wallRelationships.length, 3);
    assert.equal(filtered.openings.length, 3);
    assert.equal(filtered.objectClassifications.length, 3);
    assert.equal(filtered.rooms.length, 2);
    assert.deepEqual(filtered.topologySummary.continuousWalls, [['wall-3', 'wall-1']]);
    assert.equal(filtered.topologySummary.corners.length, 4);
    assert.deepEqual(filtered.topologySummary.falsePositives, ['window-1']);
  });

  it('flags fabricated IDs that are not present in the fixture', () => {
    const analysis = vlmFloorplanAnalysisSchema.parse({
      wallRelationships: [
        { wallIds: ['wall-3', 'wall-9'], relationship: 'same_continuous_wall', confidence: 0.9, reason: null },
      ],
      openings: [
        { objectId: 'window-2', type: 'window', hostWallIds: ['wall-1'], relationship: 'interrupts_wall', confidence: 0.9, reason: null },
        { objectId: 'door-99', type: 'door', hostWallIds: ['wall-0'], relationship: 'interrupts_wall', confidence: 0.9, reason: null },
      ],
      objectClassifications: [
        { objectId: 'wall-0', classification: 'valid', confidence: 0.9, reason: null },
        { objectId: 'window-42', classification: 'likely_false_positive', confidence: 0.9, reason: null },
      ],
      rooms: [],
      topologySummary: {
        continuousWalls: [['wall-3', 'wall-1']],
        corners: [['wall-0', 'wall-1']],
        tJunctions: [],
        falsePositives: ['window-1', 'window-500'],
      },
    });

    const { analysis: filtered, warnings } = validateVlmAnalysis(analysis, fixture);
    assert.ok(warnings.length > 0);
    // wall-9 invalid -> relationship dropped (needs min 2 valid)
    assert.equal(filtered.wallRelationships.length, 0);
    // door-99 invalid objectId -> opening dropped
    assert.equal(filtered.openings.length, 1);
    // window-42 invalid -> classification dropped
    assert.equal(filtered.objectClassifications.length, 1);
    // window-500 invalid -> filtered from summary
    assert.deepEqual(filtered.topologySummary.falsePositives, ['window-1']);
    assert.deepEqual(filtered.topologySummary.corners, [['wall-0', 'wall-1']]);
  });
});

// ---- GeometryHints contract tests ----

describe('vlm-floorplan geometryHints', () => {
  const rawFixture = {
    wall: [[ [0, 0], [1, 1] ], [ [0, 0], [1, 1] ], [ [0, 0], [1, 1] ], [ [0, 0], [1, 1] ]],
    door: [[ [0, 0] ], [ [0, 0] ]],
    entry_door: [],
    window: [[ [0, 0] ], [ [0, 0] ], [ [0, 0] ]],
    kitchen: [],
    door_center_line: [],
    entry_door_center_line: [],
    window_center_line: [],
  } as unknown as Record<string, unknown>;

  const baseAnalysis = {
    wallRelationships: [],
    openings: [],
    objectClassifications: [],
    rooms: [],
    topologySummary: emptyTopologySummary(),
    geometryHints: [],
  };

  it('parses all five supported hint types', () => {
    const input = {
      ...baseAnalysis,
      geometryHints: [
        { type: 'same_continuous_wall', objectIds: ['wall-3', 'wall-1'], confidence: 0.94, reason: 'continuous east exterior wall' },
        { type: 'parallel_walls', objectIds: ['wall-0', 'wall-1'], confidence: 0.91, reason: 'both vertical' },
        { type: 'same_axis', objectIds: ['wall-2', 'wall-3'], confidence: 0.93, reason: 'collinear' },
        { type: 'extend_to_intersection', objectIds: ['wall-1', 'wall-0'], confidence: 0.88, reason: 'truncated interior wall' },
        { type: 'merge_walls', objectIds: ['wall-0', 'wall-2'], confidence: 0.97, reason: 'fragmented facade' },
      ],
    };
    const parsed = vlmFloorplanAnalysisSchema.parse(input);
    assert.equal(parsed.geometryHints.length, 5);
    assert.equal(parsed.geometryHints[0].type, 'same_continuous_wall');
    assert.equal(parsed.geometryHints[3].type, 'extend_to_intersection');
  });

  it('rejects unknown hint types', () => {
    assert.throws(() => vlmFloorplanAnalysisSchema.parse({
      ...baseAnalysis,
      geometryHints: [{ type: 'rotate_wall', objectIds: ['wall-0', 'wall-1'], confidence: 0.5, reason: null }],
    }));
  });

  it('rejects hint with less than 2 objectIds', () => {
    assert.throws(() => vlmFloorplanAnalysisSchema.parse({
      ...baseAnalysis,
      geometryHints: [{ type: 'same_continuous_wall', objectIds: ['wall-0'], confidence: 0.5, reason: null }],
    }));
  });

  it('rejects missing objectIds', () => {
    assert.throws(() => vlmFloorplanAnalysisSchema.parse({
      ...baseAnalysis,
      geometryHints: [{ type: 'parallel_walls', confidence: 0.5, reason: null } as never],
    }));
  });

  it('rejects confidence outside 0..1', () => {
    assert.throws(() => vlmFloorplanAnalysisSchema.parse({
      ...baseAnalysis,
      geometryHints: [{ type: 'same_axis', objectIds: ['wall-0', 'wall-1'], confidence: 1.5, reason: null }],
    }));
    assert.throws(() => vlmFloorplanAnalysisSchema.parse({
      ...baseAnalysis,
      geometryHints: [{ type: 'merge_walls', objectIds: ['wall-0', 'wall-1'], confidence: -0.1, reason: null }],
    }));
  });

  it('filters invalid objectIds exactly like existing VLM references', () => {
    const analysis = vlmFloorplanAnalysisSchema.parse({
      ...baseAnalysis,
      geometryHints: [
        { type: 'same_continuous_wall', objectIds: ['wall-0', 'wall-99'], confidence: 0.9, reason: null },
        { type: 'parallel_walls', objectIds: ['wall-10', 'wall-11'], confidence: 0.9, reason: null },
        { type: 'same_axis', objectIds: ['wall-0', 'wall-1'], confidence: 0.9, reason: null },
      ],
    });
    const { analysis: filtered, warnings } = validateVlmAnalysis(analysis, rawFixture);
    assert.ok(warnings.some((w) => w.includes('geometryHints')));
    assert.equal(filtered.geometryHints.length, 1);
    assert.deepEqual(filtered.geometryHints[0].objectIds, ['wall-0', 'wall-1']);
  });

  it('filters partially invalid hints and preserves valid IDs after filtering', () => {
    const analysis = vlmFloorplanAnalysisSchema.parse({
      ...baseAnalysis,
      geometryHints: [
        { type: 'merge_walls', objectIds: ['wall-0', 'wall-1', 'wall-99'], confidence: 0.9, reason: null },
      ],
    });
    const { analysis: filtered, warnings } = validateVlmAnalysis(analysis, rawFixture);
    assert.ok(warnings.some((w) => w.includes('invalid objectIds')));
    // wall-99 invalid → filtered to 2 valid IDs, hint preserved with valid subset
    assert.equal(filtered.geometryHints.length, 1);
    assert.deepEqual(filtered.geometryHints[0].objectIds, ['wall-0', 'wall-1']);
  });

  it('omits hint entirely when <2 valid IDs remain after filtering', () => {
    const analysis = vlmFloorplanAnalysisSchema.parse({
      ...baseAnalysis,
      geometryHints: [
        { type: 'extend_to_intersection', objectIds: ['wall-0', 'wall-99'], confidence: 0.8, reason: 'one valid only' },
      ],
    });
    const { analysis: filtered, warnings } = validateVlmAnalysis(analysis, rawFixture);
    assert.equal(filtered.geometryHints.length, 0);
    assert.ok(warnings.some((w) => w.includes('dropped')));
  });

  it('preserves existing VLM schema compatibility when geometryHints absent (defaults to [])', () => {
    const legacy = {
      wallRelationships: [],
      openings: [],
      objectClassifications: [],
      rooms: [],
      topologySummary: emptyTopologySummary(),
    };
    const parsed = vlmFloorplanAnalysisSchema.parse(legacy as never);
    assert.deepEqual(parsed.geometryHints, []);
    const { analysis: filtered, warnings } = validateVlmAnalysis(parsed, rawFixture);
    assert.deepEqual(filtered.geometryHints, []);
    assert.equal(warnings.length, 0);
  });

  it('deduplicates geometryHints by type+ids keeping highest confidence', () => {
    const analysis = vlmFloorplanAnalysisSchema.parse({
      ...baseAnalysis,
      geometryHints: [
        { type: 'same_continuous_wall', objectIds: ['wall-0', 'wall-1'], confidence: 0.6, reason: null },
        { type: 'same_continuous_wall', objectIds: ['wall-1', 'wall-0'], confidence: 0.92, reason: null },
      ],
    });
    const { analysis: filtered, warnings } = validateVlmAnalysis(analysis, rawFixture);
    assert.equal(filtered.geometryHints.length, 1);
    assert.equal(filtered.geometryHints[0].confidence, 0.92);
    assert.ok(warnings.some((w) => w.includes('duplicate')));
  });

  it('allows empty geometryHints', () => {
    const parsed = vlmFloorplanAnalysisSchema.parse({ ...baseAnalysis, geometryHints: [] });
    assert.deepEqual(parsed.geometryHints, []);
  });
});

describe('vlm-floorplan geometryHints against real fixture (c658e915…)', () => {
  let fixture: Record<string, unknown>;
  before(async () => {
    fixture = (await import('../../../../job-processor/src/lib/floorplan-pipeline/fixtures/recognition-c658e915-9247-4904-8032-717dd11ecfdd.json', { with: { type: 'json' } } as unknown as ImportAttributes)).default as Record<string, unknown>;
  });

  it('validates realistic geometry hints against the fixture without warnings', () => {
    const analysis = vlmFloorplanAnalysisSchema.parse({
      wallRelationships: [],
      openings: [],
      objectClassifications: [],
      rooms: [],
      topologySummary: emptyTopologySummary(),
      geometryHints: [
        { type: 'same_continuous_wall', objectIds: ['wall-3', 'wall-1'], confidence: 0.94, reason: 'The two detected segments form one continuous east exterior wall interrupted by a window.' },
        { type: 'parallel_walls', objectIds: ['wall-1', 'wall-0'], confidence: 0.91, reason: 'Both wall segments run vertically with the same orientation in the floorplan.' },
        { type: 'same_axis', objectIds: ['wall-3', 'wall-0'], confidence: 0.93, reason: 'The wall segments appear collinear and belong to the same structural line.' },
        { type: 'extend_to_intersection', objectIds: ['wall-2', 'wall-3'], confidence: 0.88, reason: 'The interior wall appears to terminate at the exterior wall.' },
        { type: 'merge_walls', objectIds: ['wall-0', 'wall-3'], confidence: 0.97, reason: 'Both detections form one continuous exterior facade around window openings.' },
      ],
    });
    const { analysis: filtered, warnings } = validateVlmAnalysis(analysis, fixture);
    assert.deepEqual(warnings, []);
    assert.equal(filtered.geometryHints.length, 5);
  });

  it('filters fabricated IDs from geometryHints in fixture context', () => {
    const analysis = vlmFloorplanAnalysisSchema.parse({
      wallRelationships: [],
      openings: [],
      objectClassifications: [],
      rooms: [],
      topologySummary: emptyTopologySummary(),
      geometryHints: [
        { type: 'same_continuous_wall', objectIds: ['wall-0', 'wall-99'], confidence: 0.9, reason: null },
        { type: 'merge_walls', objectIds: ['wall-0', 'wall-1'], confidence: 0.9, reason: null },
      ],
    });
    const { analysis: filtered, warnings } = validateVlmAnalysis(analysis, fixture);
    assert.ok(warnings.length > 0);
    assert.equal(filtered.geometryHints.length, 1);
    assert.deepEqual(filtered.geometryHints[0].objectIds, ['wall-0', 'wall-1']);
  });
});
