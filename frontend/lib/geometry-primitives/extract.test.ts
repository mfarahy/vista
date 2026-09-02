import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DEFAULT_EXTRACTION_THRESHOLDS,
  extractGeometryPrimitives,
  extractWallPrimitives,
} from './index';
import { computeRelationships } from './relationships';
import fixture from '../../public/recognition-c658e915-9247-4904-8032-717dd11ecfdd.json' with { type: 'json' };
import type { RawGeometryLike } from './types';

const T = DEFAULT_EXTRACTION_THRESHOLDS;

describe('geometry primitives — straight run extraction', () => {
  it('clean rectangle → 4 runs and 4 corners', () => {
    const polygon = [
      [0, 0], [100, 0], [100, 50], [0, 50],
    ];
    const primitives = extractWallPrimitives('wall-0', polygon, 0);
    const runs = primitives.filter((p) => p.kind === 'run');
    const corners = primitives.filter((p) => p.kind === 'corner');
    assert.equal(runs.length, 4);
    assert.equal(corners.length, 4);
    assert.ok(runs.every((r) => r.lengthPx >= 49));
  });

  it('collinear consecutive edges are merged into one run', () => {
    // 4 collinear edges forming one straight side + 3 other sides
    const polygon = [
      [0, 0], [25, 0], [50, 0], [75, 0], [100, 0], [100, 50], [0, 50],
    ];
    const primitives = extractWallPrimitives('wall-0', polygon, 0);
    const runs = primitives.filter((p) => p.kind === 'run');
    assert.equal(runs.length, 4); // top (merged), right, bottom, left (closing edge)
    const top = runs.find((r) => r.orientation === 'horizontal' && r.midpoint.y === 0);
    assert.ok(top);
    assert.ok(top.lengthPx >= 99.5 && top.lengthPx <= 100.5, `top run length ${top.lengthPx}`);
    assert.equal(top.from.x, 0);
    assert.equal(top.to.x, 100);
  });

  it('polygon starting mid-side still merges the split side (cyclic merge)', () => {
    // Same rectangle but the vertex list starts in the middle of the bottom side.
    const polygon = [
      [60, 50], [100, 50], [100, 0], [0, 0], [0, 50], [30, 50],
    ];
    const primitives = extractWallPrimitives('wall-0', polygon, 0);
    const runs = primitives.filter((p) => p.kind === 'run');
    assert.equal(runs.length, 4);
    const bottom = runs.find((r) => r.midpoint.y === 50 && r.orientation === 'horizontal');
    assert.ok(bottom, 'bottom side must be a single merged run');
    assert.ok(bottom.lengthPx >= 99, `bottom length ${bottom.lengthPx}`);
  });

  it('tiny contour noise (1–2px jitter) is simplified away without inventing geometry', () => {
    const polygon = [
      [0, 0], [1, 1], [50, 1], [100, 0], [100, 50], [0, 50],
    ];
    const primitives = extractWallPrimitives('wall-0', polygon, 0);
    const runs = primitives.filter((p) => p.kind === 'run');
    assert.equal(runs.length, 4); // top noise collapses, right, bottom, left
    const top = runs.find((r) => r.midpoint.y < 2);
    assert.ok(top);
    assert.ok(top.lengthPx >= 99, `top length ${top.lengthPx}`);
  });

  it('runs shorter than the threshold are dropped (no fabricated slats)', () => {
    // Two long sides + two 8px sides: the short sides are kept only if they
    // survive the corner-leg rule as real runs; 8px is above minRunLength
    // (18) so they are dropped, but corners still exist.
    const polygon = [
      [0, 0], [200, 0], [200, 8], [0, 8],
    ];
    const primitives = extractWallPrimitives('wall-0', polygon, 0);
    const runs = primitives.filter((p) => p.kind === 'run');
    assert.equal(runs.length, 2);
    assert.ok(runs.every((r) => r.lengthPx > 100));
  });
});

describe('geometry primitives — classification and measurements', () => {
  it('horizontal / vertical / diagonal classification', () => {
    const horizontal = extractWallPrimitives('wall-0', [[0, 10], [100, 10], [100, 110], [0, 110]], 0)
      .filter((p) => p.kind === 'run');
    const h = horizontal.find((r) => r.midpoint.y === 10);
    const v = horizontal.find((r) => r.midpoint.x === 100);
    assert.equal(h?.orientation, 'horizontal');
    assert.equal(v?.orientation, 'vertical');

    const diagonal = extractWallPrimitives('wall-0', [[0, 0], [100, 100], [120, 60], [20, -40]], 0)
      .filter((p) => p.kind === 'run');
    assert.ok(diagonal.some((r) => r.orientation === 'diagonal'));
  });

  it('angle calculation uses canonical [0, 180) degrees', () => {
    const primitives = extractWallPrimitives('wall-0', [[0, 0], [100, 100], [100, 200], [0, 100]], 0);
    const diag = primitives.find((p) => p.kind === 'run' && Math.abs(p.lengthPx - 141.42) < 0.5);
    assert.ok(diag, '45° run must exist');
    assert.ok(Math.abs(diag.angleDeg - 45) < 0.5, `angle ${diag.angleDeg}`);
    // Anti-parallel direction maps to the same canonical angle.
    const primitives2 = extractWallPrimitives('wall-0', [[100, 100], [0, 0], [0, 100], [100, 200]], 0);
    const diag2 = primitives2.find((p) => p.kind === 'run' && Math.abs(p.lengthPx - 141.42) < 0.5);
    assert.ok(diag2);
    assert.ok(Math.abs(diag2.angleDeg - 45) < 0.5, `angle ${diag2.angleDeg}`);
  });

  it('length calculation is exact for axis-aligned runs', () => {
    const primitives = extractWallPrimitives('wall-0', [[0, 0], [120, 0], [120, 80], [0, 80]], 0);
    const h = primitives.find((p) => p.kind === 'run' && p.midpoint.y === 0);
    const v = primitives.find((p) => p.kind === 'run' && p.midpoint.x === 120);
    assert.ok(h);
    assert.ok(v);
    assert.equal(h.lengthPx, 120);
    assert.equal(v.lengthPx, 80);
  });

  it('bounding box and midpoint are derived from the run endpoints', () => {
    const primitives = extractWallPrimitives('wall-0', [[10, 20], [110, 20], [110, 90], [10, 90]], 0);
    const h = primitives.find((p) => p.kind === 'run' && p.midpoint.y === 20);
    assert.ok(h);
    assert.deepEqual(h.boundingBox, { minX: 10, minY: 20, maxX: 110, maxY: 20 });
    assert.deepEqual(h.midpoint, { x: 60, y: 20 });
  });
});

describe('geometry primitives — identity and traceability', () => {
  it('primitive IDs are stable across runs and use wall-3:sN / wall-3:cN scheme', () => {
    const polygon = [[0, 0], [100, 0], [100, 50], [0, 50]];
    const a = extractWallPrimitives('wall-3', polygon, 3);
    const b = extractWallPrimitives('wall-3', polygon, 3);
    assert.deepEqual(a.map((p) => p.primitiveId), b.map((p) => p.primitiveId));
    assert.ok(a.some((p) => p.primitiveId === 'wall-3:s0'));
    assert.ok(a.some((p) => p.primitiveId === 'wall-3:c0'));
    // s0 is the longest run (deterministic ordering).
    const runs = a.filter((p) => p.kind === 'run');
    assert.equal(runs[0].primitiveId, 'wall-3:s0');
    assert.ok(runs[0].lengthPx >= runs[1].lengthPx);
  });

  it('sourceObjectId is preserved on every primitive', () => {
    const primitives = extractWallPrimitives('wall-7', [[0, 0], [100, 0], [100, 50], [0, 50]], 7);
    assert.ok(primitives.length > 0);
    for (const p of primitives) {
      assert.equal(p.sourceObjectId, 'wall-7');
      assert.equal(p.sourceCategory, 'wall');
      assert.equal(p.sourcePolygonIndex, 7);
      assert.ok(p.primitiveId.startsWith('wall-7:'));
    }
  });

  it('sourceVertexIndices trace back into the RAW polygon', () => {
    const polygon = [[0, 0], [50, 0], [100, 0], [100, 50], [0, 50]];
    const primitives = extractWallPrimitives('wall-0', polygon, 0);
    const top = primitives.find((p) => p.kind === 'run' && p.midpoint.y === 0);
    assert.ok(top);
    assert.deepEqual(top.sourceVertexIndices, [0, 1, 2]);
  });
});

describe('geometry primitives — compound polygon decomposition (fixture invariants)', () => {
  const raw = fixture as unknown as RawGeometryLike;
  const result = extractGeometryPrimitives(raw);

  it('one compound RAW wall polygon produces multiple primitives', () => {
    const wall3 = result.primitives.filter((p) => p.sourceObjectId === 'wall-3');
    const runs = wall3.filter((p) => p.kind === 'run');
    assert.ok(runs.length >= 6, `wall-3 runs: ${runs.length}`);
    assert.ok(wall3.length > runs.length, 'corners must exist as separate primitives');
  });

  it('wall-3:s0 is the longest horizontal run (the long wall span)', () => {
    const s0 = result.primitives.find((p) => p.primitiveId === 'wall-3:s0');
    assert.ok(s0);
    assert.equal(s0.kind, 'run');
    assert.equal(s0.orientation, 'horizontal');
    assert.ok(s0.lengthPx >= 450, `length ${s0.lengthPx}`);
  });

  it('every fixture wall polygon yields runs; nothing is invented for empty categories', () => {
    const rawWalls = (raw.wall ?? []).length;
    const ids = new Set(result.primitives.map((p) => p.sourceObjectId));
    assert.equal(ids.size, rawWalls);
    assert.equal(result.summary.rawWallCount, rawWalls);
    assert.equal(result.summary.runs, result.primitives.filter((p) => p.kind === 'run').length);
    assert.equal(result.summary.corners, result.primitives.filter((p) => p.kind === 'corner').length);
  });

  it('reliable wall-ribbon thickness evidence: parallel boundary pair', () => {
    const s1 = result.primitives.find((p) => p.primitiveId === 'wall-3:s1');
    assert.ok(s1, 'wall-3:s1 (bottom ribbon edge) must exist');
    assert.ok(s1.estimatedThicknessPx !== null, 'ribbon pairing must yield a thickness estimate');
    assert.equal(s1.thickness.reason, 'reliable_parallel_boundaries');
    assert.ok(
      s1.thickness.estimatedThicknessPx !== null &&
        s1.thickness.estimatedThicknessPx >= 8 &&
        s1.thickness.estimatedThicknessPx <= 30,
      `thickness ${s1.thickness.estimatedThicknessPx}`,
    );
    assert.ok(s1.thickness.partnerIds.length >= 1);
  });

  it('extraction is deterministic for the fixture', () => {
    const again = extractGeometryPrimitives(raw);
    assert.deepEqual(
      again.primitives.map((p) => [p.primitiveId, p.lengthPx, p.angleDeg]),
      result.primitives.map((p) => [p.primitiveId, p.lengthPx, p.angleDeg]),
    );
  });
});

describe('geometry primitives — pairwise relationships', () => {
  function rects(): ReturnType<typeof extractWallPrimitives> {
    return extractWallPrimitives('wall-0', [[0, 0], [100, 0], [100, 200], [0, 200]], 0);
  }

  it('parallel detection (ribbon sides)', () => {
    const primitives = extractWallPrimitives('wall-0', [[0, 0], [100, 0], [100, 60], [0, 60]], 0);
    const rels = computeRelationships(primitives, T);
    const parallel = rels.filter((r) => r.type === 'parallel');
    assert.ok(parallel.length >= 2, `parallel rels: ${parallel.length}`);
    assert.ok(parallel.every((r) => r.value <= T.parallelEpsDeg));
  });

  it('perpendicular detection', () => {
    const rels = computeRelationships(rects(), T);
    const perp = rels.filter((r) => r.type === 'perpendicular');
    assert.ok(perp.length >= 4, `perpendicular rels: ${perp.length}`);
    assert.ok(perp.every((r) => Math.abs(r.value - 90) <= T.perpendicularEpsDeg));
  });

  it('same-axis and close-parallel detection with measured offset', () => {
    // Two horizontal runs on the same line (y=0), separated by a notch.
    const primitives = extractWallPrimitives(
      'wall-0',
      [[0, 0], [40, 0], [40, 10], [60, 10], [60, 0], [100, 0], [100, 50], [0, 50]],
      0,
    );
    const rels = computeRelationships(primitives, T);
    const sameAxis = rels.filter((r) => r.type === 'same_axis');
    assert.ok(sameAxis.length >= 1);
    assert.ok(sameAxis.every((r) => r.value <= T.sameAxisOffsetPx));

    const close = rels.filter((r) => r.type === 'close_parallel');
    const offsets = rels.filter((r) => r.type === 'offset');
    assert.ok(offsets.length >= 1);
    assert.ok(close.length >= 1);
  });

  it('endpoint proximity detection', () => {
    const primitives = extractWallPrimitives('wall-0', [[0, 0], [50, 0], [50, 30], [100, 30], [100, 80], [0, 80]], 0);
    const rels = computeRelationships(primitives, T);
    const prox = rels.filter((r) => r.type === 'endpoint_proximity');
    assert.ok(prox.length >= 2, `endpoint proximity rels: ${prox.length}`);
    assert.ok(prox.every((r) => r.value <= T.endpointProximityPx));
  });

  it('relationship ordering is deterministic (a before b)', () => {
    const rels = computeRelationships(rects(), T);
    for (const r of rels) {
      assert.ok(r.a < r.b || r.a.startsWith('wall-0:s'), 'a is deterministically first');
    }
  });
});

describe('geometry primitives — ambiguous thickness handling', () => {
  it('two near-identical parallel candidates ⇒ null thickness with ambiguous reason', () => {
    // A ribbon with two equally plausible parallel boundaries 8px and 9px away
    // — must NOT fabricate a thickness value. Cleaning/simplification are
    // disabled so the 1px notch that separates the candidate lines survives.
    const polygon = [
      [0, 0], [100, 0], [100, 9], [70, 9], [70, 8], [30, 8], [30, 9], [0, 9],
    ];
    const primitives = extractWallPrimitives(
      'wall-0',
      polygon,
      0,
      { thresholds: { ...T, cleanEpsPx: 0, simplifyEpsPx: 0 } },
    );
    const runs = primitives.filter((p) => p.kind === 'run');
    const top = runs.find((r) => r.midpoint.y === 0);
    assert.ok(top, 'top run exists');
    assert.equal(top.estimatedThicknessPx, null);
    assert.equal(top.thickness.reason, 'ambiguous_parallel_boundaries');
  });

  it('no parallel boundary ⇒ null thickness with no_parallel_boundaries reason', () => {
    const primitives = extractWallPrimitives('wall-0', [[0, 0], [100, 0], [100, 50], [0, 50]], 0);
    const runs = primitives.filter((p) => p.kind === 'run');
    for (const run of runs) {
      assert.equal(run.estimatedThicknessPx, null);
      assert.equal(run.thickness.reason, 'no_parallel_boundaries');
    }
  });

  it('distant parallel runs never count as thickness (no fake thick walls)', () => {
    // Two horizontal sides 200px apart — far outside the thickness range.
    const primitives = extractWallPrimitives('wall-0', [[0, 0], [100, 0], [100, 200], [0, 200]], 0);
    const runs = primitives.filter((p) => p.kind === 'run');
    assert.ok(runs.every((r) => r.estimatedThicknessPx === null));
  });
});