import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  emptyTopologySummary,
  isValidPrimitiveIdFormat,
  validateVlmAnalysis,
  vlmFloorplanAnalysisSchema,
} from './schema.js';
import {
  buildPrimitiveIdSet,
  extractVlmPrimitives,
  normalizeVlmPrimitives,
  serializePrimitivesForVlm,
} from './geometry-primitives.js';
import { buildVlmUserMessage } from './prompt.js';

const rawFixture = {
  wall: [[[0, 0], [1, 1]], [[0, 0], [1, 1]], [[0, 0], [1, 1]], [[0, 0], [1, 1]]],
  door: [[[0, 0]], [[0, 0]]],
  entry_door: [],
  window: [[[0, 0]], [[0, 0]], [[0, 0]]],
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
  geometryRelationships: [],
};

const ALL_TYPES = [
  'same_wall',
  'wall_continuation',
  'wall_corner',
  'wall_t_junction',
  'parallel',
  'perpendicular',
  'same_axis',
  'opening_interrupts_wall',
  'belongs_to_same_raw_object',
  'likely_false_positive',
  'likely_non_architectural',
] as const;

describe('vlm geometry interpretation — geometryRelationships schema', () => {
  it('parses all eleven relationship types', () => {
    const input = {
      ...baseAnalysis,
      geometryRelationships: ALL_TYPES.map((type) =>
        type === 'likely_false_positive' || type === 'likely_non_architectural'
          ? { type, sourcePrimitiveIds: ['wall-0:s0'], sourceObjectIds: ['wall-0'], confidence: 0.9, reason: 'verdict' }
          : type === 'opening_interrupts_wall'
            ? { type, sourcePrimitiveIds: ['wall-0:s0', 'wall-1:s0'], sourceObjectIds: ['window-0', 'wall-0'], confidence: 0.9, reason: 'opening' }
            : { type, sourcePrimitiveIds: ['wall-0:s0', 'wall-1:s0'], sourceObjectIds: ['wall-0', 'wall-1'], confidence: 0.9, reason: null },
      ),
    };
    const parsed = vlmFloorplanAnalysisSchema.parse(input);
    assert.equal(parsed.geometryRelationships.length, 11);
    for (const type of ALL_TYPES) {
      assert.ok(parsed.geometryRelationships.some((r) => r.type === type), `missing ${type}`);
    }
  });

  it('rejects unknown relationship types', () => {
    assert.throws(() =>
      vlmFloorplanAnalysisSchema.parse({
        ...baseAnalysis,
        geometryRelationships: [{ type: 'merge_walls', sourcePrimitiveIds: ['wall-0:s0', 'wall-1:s0'], sourceObjectIds: ['wall-0'], confidence: 0.5, reason: null }],
      }),
    );
  });

  it('requires at least 2 primitives for relational types', () => {
    for (const type of ['same_wall', 'wall_continuation', 'wall_corner', 'wall_t_junction', 'parallel', 'perpendicular', 'same_axis', 'opening_interrupts_wall', 'belongs_to_same_raw_object']) {
      assert.throws(
        () =>
          vlmFloorplanAnalysisSchema.parse({
            ...baseAnalysis,
            geometryRelationships: [{ type, sourcePrimitiveIds: ['wall-0:s0'], sourceObjectIds: ['wall-0'], confidence: 0.5, reason: null }],
          }),
        `expected ${type} with a single primitive to be rejected`,
      );
    }
  });

  it('allows a single primitive for false-positive verdicts', () => {
    for (const type of ['likely_false_positive', 'likely_non_architectural']) {
      assert.doesNotThrow(() =>
        vlmFloorplanAnalysisSchema.parse({
          ...baseAnalysis,
          geometryRelationships: [{ type, sourcePrimitiveIds: ['wall-0:s0'], sourceObjectIds: ['wall-0'], confidence: 0.9, reason: 'stair graphic' }],
        }),
      );
    }
  });

  it('preserves backwards compatibility when geometryRelationships absent (defaults to [])', () => {
    const legacy = {
      wallRelationships: [],
      openings: [],
      objectClassifications: [],
      rooms: [],
      topologySummary: emptyTopologySummary(),
    };
    const parsed = vlmFloorplanAnalysisSchema.parse(legacy as never);
    assert.deepEqual(parsed.geometryRelationships, []);
    const { analysis, warnings } = validateVlmAnalysis(parsed, rawFixture);
    assert.deepEqual(analysis.geometryRelationships, []);
    assert.equal(warnings.length, 0);
  });

  it('rejects confidence outside 0..1', () => {
    assert.throws(() =>
      vlmFloorplanAnalysisSchema.parse({
        ...baseAnalysis,
        geometryRelationships: [{ type: 'parallel', sourcePrimitiveIds: ['wall-0:s0', 'wall-1:s0'], sourceObjectIds: [], confidence: 1.5, reason: null }],
      }),
    );
  });

  it('preserves the wall_continuation example ordering from the spec', () => {
    const parsed = vlmFloorplanAnalysisSchema.parse({
      ...baseAnalysis,
      geometryRelationships: [
        { type: 'wall_continuation', sourcePrimitiveIds: ['wall-8:s2', 'wall-4:s0'], sourceObjectIds: ['wall-8', 'wall-4'], confidence: 0.9, reason: 'continuation' },
      ],
    });
    assert.deepEqual(parsed.geometryRelationships[0].sourcePrimitiveIds, ['wall-8:s2', 'wall-4:s0']);
  });
});

describe('vlm geometry interpretation — validation against primitives', () => {
  const known = new Set(['wall-0:s0', 'wall-0:s1', 'wall-1:s0']);

  it('filters unknown primitive IDs when a known set is provided', () => {
    const analysis = vlmFloorplanAnalysisSchema.parse({
      ...baseAnalysis,
      geometryRelationships: [
        { type: 'same_wall', sourcePrimitiveIds: ['wall-0:s0', 'wall-9:s9'], sourceObjectIds: ['wall-0'], confidence: 0.9, reason: null },
        { type: 'parallel', sourcePrimitiveIds: ['wall-10:s0', 'wall-11:s0'], sourceObjectIds: [], confidence: 0.9, reason: null },
        { type: 'same_axis', sourcePrimitiveIds: ['wall-0:s0', 'wall-1:s0'], sourceObjectIds: ['wall-0', 'wall-1'], confidence: 0.9, reason: null },
      ],
    });
    const { analysis: filtered, warnings } = validateVlmAnalysis(analysis, rawFixture, known);
    assert.ok(warnings.some((w) => w.includes('geometryRelationships')));
    assert.equal(filtered.geometryRelationships.length, 1);
    assert.deepEqual(filtered.geometryRelationships[0].sourcePrimitiveIds, ['wall-0:s0', 'wall-1:s0']);
  });

  it('keeps syntactically valid primitives when no known set is provided', () => {
    const analysis = vlmFloorplanAnalysisSchema.parse({
      ...baseAnalysis,
      geometryRelationships: [
        { type: 'parallel', sourcePrimitiveIds: ['wall-0:s0', 'wall-1:s0'], sourceObjectIds: [], confidence: 0.8, reason: null },
      ],
    });
    const { analysis: filtered, warnings } = validateVlmAnalysis(analysis, rawFixture);
    assert.equal(filtered.geometryRelationships.length, 1);
    assert.equal(warnings.length, 0);
  });

  it('drops malformed primitive IDs', () => {
    const analysis = vlmFloorplanAnalysisSchema.parse({
      ...baseAnalysis,
      geometryRelationships: [
        { type: 'parallel', sourcePrimitiveIds: ['wall-0', 'wall-1:s0'], sourceObjectIds: [], confidence: 0.8, reason: null },
      ],
    });
    const { analysis: filtered, warnings } = validateVlmAnalysis(analysis, rawFixture);
    assert.equal(filtered.geometryRelationships.length, 0);
    assert.ok(warnings.some((w) => w.includes('invalid primitiveId')));
  });

  it('filters invalid sourceObjectIds like existing VLM references', () => {
    const analysis = vlmFloorplanAnalysisSchema.parse({
      ...baseAnalysis,
      geometryRelationships: [
        { type: 'same_wall', sourcePrimitiveIds: ['wall-0:s0', 'wall-1:s0'], sourceObjectIds: ['wall-0', 'wall-99'], confidence: 0.9, reason: null },
      ],
    });
    const { analysis: filtered, warnings } = validateVlmAnalysis(analysis, rawFixture, known);
    assert.equal(filtered.geometryRelationships.length, 1);
    assert.deepEqual(filtered.geometryRelationships[0].sourceObjectIds, ['wall-0']);
    assert.ok(warnings.some((w) => w.includes('invalid sourceObjectIds')));
  });

  it('deduplicates symmetric types regardless of order, keeping highest confidence', () => {
    const analysis = vlmFloorplanAnalysisSchema.parse({
      ...baseAnalysis,
      geometryRelationships: [
        { type: 'parallel', sourcePrimitiveIds: ['wall-0:s0', 'wall-1:s0'], sourceObjectIds: [], confidence: 0.6, reason: null },
        { type: 'parallel', sourcePrimitiveIds: ['wall-1:s0', 'wall-0:s0'], sourceObjectIds: [], confidence: 0.92, reason: null },
      ],
    });
    const { analysis: filtered, warnings } = validateVlmAnalysis(analysis, rawFixture, known);
    assert.equal(filtered.geometryRelationships.length, 1);
    assert.equal(filtered.geometryRelationships[0].confidence, 0.92);
    assert.ok(warnings.some((w) => w.includes('duplicate')));
  });

  it('does NOT collapse reversed directional relationships', () => {
    const analysis = vlmFloorplanAnalysisSchema.parse({
      ...baseAnalysis,
      geometryRelationships: [
        { type: 'wall_continuation', sourcePrimitiveIds: ['wall-0:s0', 'wall-1:s0'], sourceObjectIds: ['wall-0', 'wall-1'], confidence: 0.7, reason: null },
        { type: 'wall_continuation', sourcePrimitiveIds: ['wall-1:s0', 'wall-0:s0'], sourceObjectIds: ['wall-1', 'wall-0'], confidence: 0.8, reason: null },
      ],
    });
    const { analysis: filtered } = validateVlmAnalysis(analysis, rawFixture, known);
    assert.equal(filtered.geometryRelationships.length, 2);
  });

  it('isValidPrimitiveIdFormat accepts run/corner/legacy ids and rejects RAW ids', () => {
    assert.equal(isValidPrimitiveIdFormat('wall-5:s0'), true);
    assert.equal(isValidPrimitiveIdFormat('wall-5:c2'), true);
    assert.equal(isValidPrimitiveIdFormat('wall-5:p0'), true);
    assert.equal(isValidPrimitiveIdFormat('wall-5'), false);
    assert.equal(isValidPrimitiveIdFormat('wall-x:s0'), false);
    assert.equal(isValidPrimitiveIdFormat('sofa-0:s0'), false);
  });
});

describe('vlm geometry interpretation — primitives extractor', () => {
  it('extracts stable run ids with the required VLM fields from a rectangle', () => {
    const raw = { wall: [[[0, 0], [200, 0], [200, 40], [0, 40]]] };
    const prims = extractVlmPrimitives(raw);
    assert.ok(prims.length >= 2);
    assert.ok(prims.every((p) => p.primitiveId.startsWith('wall-0:s')));
    for (const p of prims) {
      assert.equal(p.sourceObjectId, 'wall-0');
      assert.equal(p.type, 'run');
      assert.ok(typeof p.start.x === 'number' && typeof p.start.y === 'number');
      assert.ok(typeof p.end.x === 'number' && typeof p.end.y === 'number');
      assert.ok(p.lengthPx > 0);
      assert.ok(p.angleDeg >= 0 && p.angleDeg < 180);
      assert.ok(['horizontal', 'vertical', 'diagonal'].includes(p.orientation));
      assert.ok(Array.isArray(p.sourceVertexIndices));
    }
    // longest run first
    for (let i = 1; i < prims.length; i++) {
      assert.ok(prims[i - 1].lengthPx >= prims[i].lengthPx);
    }
  });

  it('allows one RAW polygon to produce many primitives and traces back to source', () => {
    const raw = { wall: [[[0, 0], [300, 0], [300, 100], [300, 200], [0, 200], [0, 100]]] };
    const prims = extractVlmPrimitives(raw);
    assert.ok(prims.length >= 3);
    const ids = buildPrimitiveIdSet(prims);
    assert.equal(ids.size, prims.length);
    const serialized = serializePrimitivesForVlm(prims);
    assert.ok(serialized.includes('wall-0:s0'));
    assert.ok(serialized.includes('src=wall-0'));
  });

  it('returns [] for degenerate input and never throws', () => {
    assert.deepEqual(extractVlmPrimitives({ wall: [] }), []);
    assert.deepEqual(extractVlmPrimitives({ wall: [[[0, 0]]] }), []);
    assert.deepEqual(extractVlmPrimitives({}), []);
  });

  it('normalizeVlmPrimitives round-trips valid client input and rejects malformed', () => {
    const raw = { wall: [[[0, 0], [200, 0], [200, 40], [0, 40]]] };
    const prims = extractVlmPrimitives(raw);
    const normalized = normalizeVlmPrimitives(JSON.parse(JSON.stringify(prims)));
    assert.ok(normalized !== null && normalized.length === prims.length);
    assert.equal(normalizeVlmPrimitives([{ nope: true }]), null);
    assert.equal(normalizeVlmPrimitives('not-an-array'), null);
  });
});

describe('vlm geometry interpretation — prompt carries primitives', () => {
  it('embeds the primitives block and relationship rules in the user message', () => {
    const raw = {
      wall: [], door: [], entry_door: [], window: [], kitchen: [],
      door_center_line: [], entry_door_center_line: [], window_center_line: [],
    };
    const primitives = [
      { primitiveId: 'wall-5:s0', sourceObjectId: 'wall-5', type: 'run' as const, start: { x: 0, y: 0 }, end: { x: 100, y: 0 }, lengthPx: 100, angleDeg: 0, orientation: 'horizontal' as const, thicknessPx: 8, sourceVertexIndices: [0, 1] },
    ];
    const parts = buildVlmUserMessage({ imageBuffer: Buffer.from('img'), mimeType: 'image/jpeg', raw, primitives });
    const text = parts.find((p) => p.type === 'text');
    assert.ok(text && text.type === 'text');
    assert.ok(text.text.includes('GEOMETRY PRIMITIVES (1 runs'));
    assert.ok(text.text.includes('wall-5:s0 src=wall-5'));
    assert.ok(text.text.includes('GEOMETRY RELATIONSHIPS'));
    assert.ok(text.text.includes('NEVER the geometry calculator'));
  });

  it('emits an empty-relationships guard when no primitives are supplied', () => {
    const raw = {
      wall: [], door: [], entry_door: [], window: [], kitchen: [],
      door_center_line: [], entry_door_center_line: [], window_center_line: [],
    };
    const parts = buildVlmUserMessage({ imageBuffer: Buffer.from('img'), mimeType: 'image/jpeg', raw });
    const text = parts.find((p) => p.type === 'text');
    assert.ok(text && text.type === 'text' && text.text.includes('Return geometryRelationships as []'));
  });
});
