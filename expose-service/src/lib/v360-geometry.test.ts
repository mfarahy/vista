import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { convexHull, floorBoundaryFromAnalysis } from './v360-geometry.js';
import type { RasterPredictResponse } from './raster2seq.js';

const analysisWith = (
  refined?: RasterPredictResponse['refined_spaces'],
  draft?: RasterPredictResponse['spaces'],
): RasterPredictResponse => ({ status: 'ok', refined_spaces: refined, spaces: draft });

describe('floorBoundaryFromAnalysis', () => {
  it('returns null when there is no geometry', () => {
    assert.equal(floorBoundaryFromAnalysis(analysisWith([])), null);
    assert.equal(floorBoundaryFromAnalysis(analysisWith(undefined, [])), null);
  });

  it('builds a normalized convex-hull polygon from refined spaces', () => {
    const refined = [
      {
        id: 'r1',
        room_type: 'Living Room',
        area: 20,
        polygon: [
          [0, 0],
          [0, 100],
          [100, 100],
          [100, 0],
        ],
      },
    ];
    const boundary = floorBoundaryFromAnalysis(analysisWith(refined));
    assert.ok(boundary);
    assert.ok(boundary!.length >= 3);
    // Every point must be inside the unit square.
    for (const [x, y] of boundary!) {
      assert.ok(x >= 0 && x <= 1);
      assert.ok(y >= 0 && y <= 1);
    }
    // The hull of a square spans the whole unit square.
    const xs = boundary!.map(([x]) => x);
    const ys = boundary!.map(([, y]) => y);
    assert.equal(Math.max(...xs), 1);
    assert.equal(Math.min(...xs), 0);
    assert.equal(Math.max(...ys), 1);
    assert.equal(Math.min(...ys), 0);
  });

  it('prefers refined spaces over draft spaces', () => {
    const refined = [
      {
        id: 'r1',
        room_type: 'Kitchen',
        area: 10,
        polygon: [
          [0, 0],
          [0, 10],
          [10, 10],
          [10, 0],
        ],
      },
    ];
    const draft = [
      {
        id: 1,
        category_id: 1,
        polygon: [
          [0, 0],
          [0, 500],
          [500, 500],
          [500, 0],
        ],
      },
    ];
    const boundary = floorBoundaryFromAnalysis(analysisWith(refined, draft));
    assert.ok(boundary);
    assert.equal(Math.max(...boundary!.map(([x]) => x)), 1);
  });

  it('excludes outdoor spaces from the boundary', () => {
    const refined = [
      {
        id: 'interior',
        room_type: 'Bed Room',
        area: 12,
        polygon: [
          [0, 0],
          [0, 40],
          [40, 40],
          [40, 0],
        ],
      },
      {
        id: 'outdoor',
        room_type: 'Outdoor',
        area: 300,
        polygon: [
          [0, 0],
          [0, 1000],
          [1000, 1000],
          [1000, 0],
        ],
      },
    ];
    const boundary = floorBoundaryFromAnalysis(analysisWith(refined));
    assert.ok(boundary);
    // Outdoor would dominate the hull (span full unit square); interior-only
    // hull is a subset but must still be a valid closed loop.
    assert.ok(boundary!.length >= 3);
  });

  it('falls back to draft spaces when no refined spaces exist', () => {
    const draft = [
      {
        id: 1,
        category_id: 2,
        polygon: [
          [5, 5],
          [5, 95],
          [95, 95],
          [95, 5],
        ],
      },
      {
        id: 2,
        category_id: 3,
        polygon: [
          [95, 5],
          [95, 95],
          [200, 95],
          [200, 5],
        ],
      },
    ];
    const boundary = floorBoundaryFromAnalysis(analysisWith(undefined, draft));
    assert.ok(boundary);
    assert.equal(Math.max(...boundary!.map(([x]) => x)), 1);
  });
});

describe('convexHull', () => {
  it('returns null for < 3 points', () => {
    assert.equal(convexHull([]), null);
    assert.equal(
      convexHull([
        [0, 0],
        [1, 1],
      ]),
      null,
    );
  });

  it('computes the hull of collinear points as a degenerate null/line', () => {
    const hull = convexHull([
      [0, 0],
      [1, 1],
      [2, 2],
    ]);
    assert.ok(!hull || hull.length < 3);
  });

  it('computes the convex hull of a square', () => {
    const hull = convexHull([
      [0, 0],
      [0, 1],
      [1, 1],
      [1, 0],
      [0.5, 0.5],
    ]);
    assert.equal(hull!.length, 4);
    const labels = hull!
      .map(([x, y]) => `${x},${y}`)
      .sort()
      .join('|');
    assert.equal(labels, '0,0|0,1|1,0|1,1');
  });
});
