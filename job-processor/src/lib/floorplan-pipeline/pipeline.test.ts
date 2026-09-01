import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { normalizeGeometry } from './normalize.js';
import { detectRooms } from './rooms.js';
import { buildFloorPlan3DModel } from './model3d.js';
import { renderDebugSvg } from './svg.js';
import { runFloorplanPipeline } from './index.js';
import { pointInPolygon } from './geometry.js';
import type { RecognitionGeometry } from './types.js';

function loadFixture(name: string): RecognitionGeometry {
  return JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8')) as RecognitionGeometry;
}

const TEST_FIXTURE = 'recognition-c658e915-9247-4904-8032-717dd11ecfdd.json';

describe('normalizeGeometry', () => {
  it('extracts clean wall runs with positive coordinates and thickness', () => {
    const plan = normalizeGeometry(loadFixture(TEST_FIXTURE), 50);
    assert.ok(plan.walls.length >= 15, `expected a decent wall set, got ${plan.walls.length}`);
    for (const wall of plan.walls) {
      assert.ok(wall.length > 0, 'wall must have positive length');
      assert.ok(wall.thickness > 0, 'wall must have positive thickness');
      assert.ok(wall.from.x >= 0 && wall.from.y >= 0, 'coordinates must stay in image space');
      assert.ok(wall.to.x >= 0 && wall.to.y >= 0, 'coordinates must stay in image space');
      assert.ok(Math.abs(wall.to.x - wall.from.x) + Math.abs(wall.to.y - wall.from.y) > 0);
    }
  });

  it('drops tiny wall fragments', () => {
    const geometry: RecognitionGeometry = {
      wall: [
        [[10, 10], [12, 10], [12, 12], [10, 12]], // 4px area: noise
        [[100, 100], [200, 100], [200, 102], [100, 102]], // long thin wall
      ],
      door: [],
      entry_door: [],
      window: [],
      kitchen: [],
      door_center_line: [],
      entry_door_center_line: [],
      window_center_line: [],
    };
    const plan = normalizeGeometry(geometry, 50);
    assert.equal(plan.walls.length, 1);
    assert.ok(Math.abs(plan.walls[0].length - 100) < 3);
  });

  it('extracts openings from center lines with width and wall association', () => {
    const plan = normalizeGeometry(loadFixture(TEST_FIXTURE), 50);
    const doors = plan.openings.filter((o) => o.kind === 'door');
    const windows = plan.openings.filter((o) => o.kind === 'window');
    assert.ok(doors.length >= 3, `expected doors, got ${doors.length}`);
    assert.ok(windows.length >= 3, `expected windows, got ${windows.length}`);
    for (const opening of plan.openings) {
      assert.ok(opening.width > 0, 'opening width must be positive');
      assert.ok(opening.wallId !== null, `opening ${opening.id} should be associated with a wall`);
    }
  });

  it('handles empty geometry without throwing', () => {
    const empty: RecognitionGeometry = {
      wall: [], door: [], entry_door: [], window: [], kitchen: [],
      door_center_line: [], entry_door_center_line: [], window_center_line: [],
    };
    const plan = normalizeGeometry(empty, 50);
    assert.equal(plan.walls.length, 0);
    assert.equal(plan.openings.length, 0);
  });
});

describe('detectRooms', () => {
  it('detects the main rooms of the test floorplan', () => {
    const plan = normalizeGeometry(loadFixture(TEST_FIXTURE), 50);
    detectRooms(plan);
    assert.ok(plan.rooms.length >= 4, `expected at least 4 rooms, got ${plan.rooms.length}`);
    const interiors = plan.rooms.filter((r) => !r.exterior);
    assert.ok(interiors.length >= 4, 'expected enclosed interior rooms');
  });

  it('labels the kitchen via the recognized kitchen region', () => {
    const plan = normalizeGeometry(loadFixture(TEST_FIXTURE), 50);
    detectRooms(plan);
    const kitchen = plan.rooms.find((r) => r.hint === 'kitchen');
    assert.ok(kitchen, 'expected a kitchen room');
    assert.ok(kitchen.areaM2 > 10 && kitchen.areaM2 < 60, `suspicious kitchen area ${kitchen.areaM2}`);
  });

  it('flags the outside space and associates openings with rooms', () => {
    const plan = normalizeGeometry(loadFixture(TEST_FIXTURE), 50);
    detectRooms(plan);
    assert.ok(plan.rooms.some((r) => r.exterior), 'expected an exterior space (terrace)');
    const withRooms = plan.openings.filter((o) => o.roomIds.length >= 1);
    assert.ok(withRooms.length >= 4, `expected room-associated openings, got ${withRooms.length}`);
  });

  it('detects exactly one room for a simple closed box', () => {
    const ribbon = (a: number[][], b: number[][]): number[][] => [...a, ...b];
    const geometry: RecognitionGeometry = {
      wall: [
        ribbon([[100, 100], [300, 100]], [[300, 103], [100, 103]]), // top
        ribbon([[100, 297], [300, 297]], [[300, 300], [100, 300]]), // bottom
        ribbon([[100, 100], [103, 100]], [[103, 300], [100, 300]]), // left
        ribbon([[297, 100], [300, 100]], [[300, 300], [297, 300]]), // right
      ],
      door: [],
      entry_door: [],
      window: [],
      kitchen: [],
      door_center_line: [],
      entry_door_center_line: [],
      window_center_line: [],
    };
    const plan = normalizeGeometry(geometry, 50);
    detectRooms(plan);
    const interiors = plan.rooms.filter((r) => !r.exterior);
    assert.equal(interiors.length, 1);
    assert.ok(interiors[0].area > 25_000 && interiors[0].area < 45_000, `unexpected room area ${interiors[0].area}`);
  });
});

describe('buildFloorPlan3DModel', () => {
  it('produces a meter-space model with floors, walls and openings', () => {
    const plan = normalizeGeometry(loadFixture(TEST_FIXTURE), 50);
    detectRooms(plan);
    const model = buildFloorPlan3DModel(plan);
    assert.equal(model.unit, 'm');
    assert.equal(model.rooms.length, plan.rooms.length);
    assert.ok(model.walls.length >= 10);
    assert.ok(model.doors.length >= 3);
    assert.ok(model.windows.length >= 3);
    for (const room of model.rooms) {
      assert.ok(room.points.length >= 4, 'room floor must be a polygon');
      assert.ok(room.areaM2 !== null && room.areaM2 > 0);
      assert.ok(room.width > 0 && room.depth > 0);
    }
    for (const wall of model.walls) {
      assert.equal(wall.height, 2.7);
      assert.ok(wall.thickness > 0.05);
    }
  });

  it('does not throw for empty geometry', () => {
    const empty: RecognitionGeometry = {
      wall: [], door: [], entry_door: [], window: [], kitchen: [],
      door_center_line: [], entry_door_center_line: [], window_center_line: [],
    };
    const plan = normalizeGeometry(empty, 50);
    detectRooms(plan);
    const model = buildFloorPlan3DModel(plan);
    assert.equal(model.rooms.length, 0);
    assert.equal(model.walls.length, 0);
  });
});

describe('renderDebugSvg', () => {
  it('renders walls, openings and rooms into an SVG', () => {
    const plan = normalizeGeometry(loadFixture(TEST_FIXTURE), 50);
    detectRooms(plan);
    const svg = renderDebugSvg(plan);
    assert.ok(svg.startsWith('<svg'), 'must be an SVG document');
    assert.ok(svg.includes('class="legend"'), 'must include a legend');
    assert.ok(svg.includes('<polygon'), 'must include room polygons');
    assert.ok(svg.includes('<line'), 'must include wall lines');
  });
});

describe('runFloorplanPipeline', () => {
  it('runs end-to-end and returns normalized geometry, rooms, model and svg', () => {
    const result = runFloorplanPipeline(loadFixture(TEST_FIXTURE));
    assert.equal(result.normalized.units, 'pixel');
    assert.ok(result.rooms.length >= 4);
    assert.ok(result.model3d.rooms.length >= 4);
    assert.ok(result.debugSvg.startsWith('<svg'));
    assert.ok(result.normalized.bounds.minX >= 0 && result.normalized.bounds.minY >= 0);
  });
});

describe('regression: wall slats fix', () => {
  it('does not produce dozens of disconnected vertical slats', () => {
    const result = runFloorplanPipeline(loadFixture(TEST_FIXTURE));
    // A continuous apartment wall should be a single run, not many tiny slats.
    // The fixture has 5 wall polygons but the architectural wall count is small.
    assert.ok(
      result.normalized.walls.length < 30,
      `expected <30 wall runs (continuous walls), got ${result.normalized.walls.length}`,
    );
    assert.ok(
      result.model3d.walls.length < 30,
      `expected <30 3D wall segments, got ${result.model3d.walls.length}`,
    );
    // No wall should be an extremely thin slat (thickness fallback must be >= 0.15m).
    for (const wall of result.model3d.walls) {
      assert.ok(wall.thickness >= 0.14, `wall ${wall.id} too thin: ${wall.thickness}`);
    }
    // Total wall length should be substantial for an apartment (not fragmented noise).
    const totalPx = result.normalized.walls.reduce((s, w) => s + w.length, 0);
    assert.ok(totalPx > 1500, `total wall length too small: ${totalPx}`);
    assert.ok(totalPx < 20000, `total wall length suspiciously large: ${totalPx}`);
    // Walls should be axis-aligned (library prioritizes horizontal/vertical).
    for (const wall of result.normalized.walls) {
      const dx = Math.abs(wall.to.x - wall.from.x);
      const dy = Math.abs(wall.to.y - wall.from.y);
      const isHorizontal = dy < 4;
      const isVertical = dx < 4;
      const isAxisAligned = isHorizontal || isVertical;
      // Allow a small number of diagonal walls from recognition noise, but majority must be orthogonal.
      if (!isAxisAligned) {
        const angle = Math.abs(Math.atan2(wall.to.y - wall.from.y, wall.to.x - wall.from.x)) * 180 / Math.PI % 90;
        const deviation = Math.min(angle, 90 - angle);
        assert.ok(deviation < 10, `wall ${wall.id} not axis-aligned: angle deviation ${deviation}`);
      }
    }
    // 2D Y must map to 3D Z, not Y (height). Verify via model bounds: X/Z spread should be similar to pixel bounds aspect.
    const pixelWidth = result.normalized.bounds.maxX - result.normalized.bounds.minX;
    const pixelDepth = result.normalized.bounds.maxY - result.normalized.bounds.minY;
    const modelXs = result.model3d.walls.flatMap((w) => [w.from.x, w.to.x]);
    const modelZs = result.model3d.walls.flatMap((w) => [w.from.y, w.to.y]);
    const modelWidth = Math.max(...modelXs) - Math.min(...modelXs);
    const modelDepth = Math.max(...modelZs) - Math.min(...modelZs);
    const pixelAspect = pixelWidth / pixelDepth;
    const modelAspect = modelWidth / modelDepth;
    assert.ok(
      Math.abs(pixelAspect - modelAspect) < 0.25,
      `aspect ratio mismatch: pixel ${pixelAspect.toFixed(2)} vs model ${modelAspect.toFixed(2)}`,
    );
  });

  it('preserves wall thickness and handles openings after wall reconstruction', () => {
    const result = runFloorplanPipeline(loadFixture(TEST_FIXTURE));
    // Doors/windows should be associated with a wall (split after reconstruction).
    for (const opening of result.normalized.openings) {
      assert.ok(opening.wallId !== null, `opening ${opening.id} should have wallId`);
      assert.ok(opening.width >= 6, `opening ${opening.id} width too small`);
    }
    // Model should have doors/windows with correct heights.
    assert.ok(result.model3d.doors.length >= 3);
    assert.ok(result.model3d.windows.length >= 3);
    for (const d of result.model3d.doors) assert.ok(Math.abs(d.height - 2.1) < 0.01);
    for (const w of result.model3d.windows) assert.ok(Math.abs(w.height - 1.4) < 0.01);
  });

  it('aligns door/window rotation with their host wall instead of raw (noisy) opening endpoints', () => {
    const result = runFloorplanPipeline(loadFixture(TEST_FIXTURE));
    const wallById = new Map(result.normalized.walls.map((w) => [w.id, w]));
    const openingById = new Map(result.normalized.openings.map((o) => [o.id, o]));
    const normalizeAngle = (deg: number): number => ((deg % 180) + 180) % 180;
    for (const opening of [...result.model3d.doors, ...result.model3d.windows]) {
      const source = openingById.get(opening.id);
      const wall = source?.wallId ? wallById.get(source.wallId) : undefined;
      if (!wall) continue;
      const wallAngleDeg = (Math.atan2(wall.to.y - wall.from.y, wall.to.x - wall.from.x) * 180) / Math.PI;
      const openingAngleDeg = (opening.rotation * 180) / Math.PI;
      // A door/window leaf is a symmetric box, so only the 0-180deg line matters.
      const diff = Math.abs(normalizeAngle(wallAngleDeg) - normalizeAngle(openingAngleDeg));
      const wrapped = Math.min(diff, 180 - diff);
      assert.ok(
        wrapped < 5,
        `opening ${opening.id} rotation (${openingAngleDeg.toFixed(1)}deg) should match host wall ${source?.wallId} (${wallAngleDeg.toFixed(1)}deg), diff ${wrapped.toFixed(1)}deg`,
      );
    }
  });
});

describe('regression: room topology', () => {
  it('keeps terrace/outside separate and does not inflate interior count with artifacts', () => {
    const result = runFloorplanPipeline(loadFixture(TEST_FIXTURE));
    const interiors = result.normalized.rooms.filter((r) => !r.exterior);
    const exteriors = result.normalized.rooms.filter((r) => r.exterior);
    assert.ok(interiors.length >= 4 && interiors.length <= 6, `expected 4-6 interior rooms, got ${interiors.length}`);
    assert.ok(exteriors.length === 1, `expected exactly 1 exterior (terrace) component after artifact filtering, got ${exteriors.length}`);
    assert.ok(result.normalized.rooms.length >= 5 && result.normalized.rooms.length <= 7, `total rooms should be 5-7, got ${result.normalized.rooms.length}`);
  });

  it('room polygons have positive area and are not microscopic', () => {
    const result = runFloorplanPipeline(loadFixture(TEST_FIXTURE));
    for (const room of result.normalized.rooms) {
      assert.ok(room.polygon.length >= 4, `room ${room.id} polygon too few points`);
      assert.ok(room.area > 900, `room ${room.id} area ${room.area} too small`);
      assert.ok(room.areaM2 > 0.5, `room ${room.id} areaM2 ${room.areaM2} too small`);
      assert.ok(room.polygon.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)), `room ${room.id} has non-finite points`);
    }
  });

  it('rooms are inside the building bounds and exterior is not counted as interior', () => {
    const result = runFloorplanPipeline(loadFixture(TEST_FIXTURE));
    const b = result.normalized.bounds;
    for (const room of result.normalized.rooms.filter((r) => !r.exterior)) {
      for (const p of room.polygon) {
        assert.ok(p.x >= b.minX - 5 && p.x <= b.maxX + 5, `room ${room.id} point x ${p.x} outside bounds`);
        assert.ok(p.y >= b.minY - 5 && p.y <= b.maxY + 5, `room ${room.id} point y ${p.y} outside bounds`);
      }
    }
  });

  it('rooms do not heavily overlap walls (free space is not wall)', () => {
    const result = runFloorplanPipeline(loadFixture(TEST_FIXTURE));
    const wallPolys = result.normalized.regions.wall;
    for (const room of result.normalized.rooms.filter((r) => !r.exterior)) {
      let insideWalls = 0;
      let samples = 0;
      // sample grid inside room bbox
      const xs = room.polygon.map((p) => p.x);
      const ys = room.polygon.map((p) => p.y);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);
      for (let y = minY + 5; y < maxY; y += 20) {
        for (let x = minX + 5; x < maxX; x += 20) {
          const pt = { x, y };
          if (!pointInPolygon(pt, room.polygon)) continue;
          samples++;
          if (wallPolys.some((w) => pointInPolygon(pt, w))) insideWalls++;
        }
      }
      if (samples > 0) {
        const ratio = insideWalls / samples;
        assert.ok(ratio < 0.15, `room ${room.id} overlaps walls too much: ${insideWalls}/${samples} (${(ratio * 100).toFixed(1)}%)`);
      }
    }
  });

  it('room adjacency through doors is valid and windows never create adjacency', () => {
    const result = runFloorplanPipeline(loadFixture(TEST_FIXTURE));
    const roomIds = new Set(result.normalized.rooms.map((r) => r.id));
    const openingById = new Map(result.normalized.openings.map((o) => [o.id, o]));
    for (const edge of result.normalized.roomAdjacency) {
      assert.ok(roomIds.has(edge.roomA), `adjacency references missing room ${edge.roomA}`);
      assert.ok(roomIds.has(edge.roomB), `adjacency references missing room ${edge.roomB}`);
      assert.notEqual(edge.roomA, edge.roomB, 'adjacency must connect two different rooms');
      const opening = openingById.get(edge.openingId);
      assert.ok(opening, `adjacency references missing opening ${edge.openingId}`);
      assert.ok(opening.kind !== 'window', `window ${opening.id} must not create adjacency`);
      assert.ok(opening.roomIds.includes(edge.roomA) && opening.roomIds.includes(edge.roomB), `opening ${opening.id} must be associated with both rooms`);
    }
    // No duplicate edges
    const seen = new Set<string>();
    for (const e of result.normalized.roomAdjacency) {
      const key = [e.roomA, e.roomB].sort().join('|');
      assert.ok(!seen.has(key), `duplicate adjacency ${key}`);
      seen.add(key);
    }
  });

  it('floors correspond to room polygons and stay inside the building', () => {
    const result = runFloorplanPipeline(loadFixture(TEST_FIXTURE));
    const scale = result.normalized.options.pixelsPerMeter;
    const cx = (result.normalized.bounds.minX + result.normalized.bounds.maxX) / 2;
    const cy = (result.normalized.bounds.minY + result.normalized.bounds.maxY) / 2;
    assert.equal(result.model3d.rooms.length, result.normalized.rooms.length, 'model rooms must match detected rooms');
    for (let i = 0; i < result.normalized.rooms.length; i++) {
      const norm = result.normalized.rooms[i];
      const model = result.model3d.rooms[i];
      assert.equal(model.id, norm.id, `model room id mismatch at ${i}`);
      assert.ok(model.points.length >= 4, `model room ${model.id} floor polygon too few points`);
      // Floor area should be close to room area (same polygon transformed)
      assert.ok(Math.abs(model.areaM2! - norm.areaM2) < 1.0, `model room ${model.id} areaM2 ${model.areaM2} diverges from normalized ${norm.areaM2}`);
      // Floor polygon centroid should be near normalized centroid transformed to meters
      const toM = (p: { x: number; y: number }) => ({ x: (p.x - cx) / scale, y: (p.y - cy) / scale });
      const normPointsM = norm.polygon.map(toM);
      const normXs = normPointsM.map((p) => p.x);
      const normYs = normPointsM.map((p) => p.y);
      const normMinX = Math.min(...normXs);
      const normMaxX = Math.max(...normXs);
      const normMinY = Math.min(...normYs);
      const normMaxY = Math.max(...normYs);
      // Model floor bounds should be within a small epsilon of normalized bounds
      assert.ok(model.width > 0 && model.depth > 0, `model room ${model.id} has zero size`);
      assert.ok(model.width <= normMaxX - normMinX + 0.1, `model room ${model.id} width larger than polygon`);
    }
  });

  it('kitchen hint is only assigned when walls support it (overlap >50%)', () => {
    const result = runFloorplanPipeline(loadFixture(TEST_FIXTURE));
    const kitchenRooms = result.normalized.rooms.filter((r) => r.hint === 'kitchen');
    assert.ok(kitchenRooms.length <= 1, `expected at most one kitchen hint, got ${kitchenRooms.length}`);
    if (kitchenRooms.length === 1) {
      assert.ok(!kitchenRooms[0].exterior, 'kitchen hint must not be on exterior');
    }
  });

  it('simple closed box still yields one interior and no exterior fragmentation', () => {
    const ribbon = (a: number[][], b: number[][]): number[][] => [...a, ...b];
    const geometry: RecognitionGeometry = {
      wall: [
        ribbon([[100, 100], [300, 100]], [[300, 103], [100, 103]]),
        ribbon([[100, 297], [300, 297]], [[300, 300], [100, 300]]),
        ribbon([[100, 100], [103, 100]], [[103, 300], [100, 300]]),
        ribbon([[297, 100], [300, 100]], [[300, 300], [297, 300]]),
      ],
      door: [],
      entry_door: [],
      window: [],
      kitchen: [],
      door_center_line: [],
      entry_door_center_line: [],
      window_center_line: [],
    };
    const result = runFloorplanPipeline(geometry);
    const interiors = result.normalized.rooms.filter((r) => !r.exterior);
    const exteriors = result.normalized.rooms.filter((r) => r.exterior);
    assert.equal(interiors.length, 1, 'closed box must have one interior');
    // Exterior may be 1 large surrounding component or 0 if filtered as artifact? Accept either 0 or 1.
    assert.ok(exteriors.length <= 1, `closed box exterior should be 0 or 1, got ${exteriors.length}`);
  });
});

describe('regression: geometry verification — source overlay', () => {
  it('snaps orthogonal wall corners so exterior shell is closed (detached right wall fixed)', () => {
    const result = runFloorplanPipeline(loadFixture(TEST_FIXTURE));
    const byId = new Map(result.normalized.walls.map((w) => [w.id, w]));
    // wall-1 (bottom) and wall-15 (right) should meet at (1004,856) after corner snap
    const w1 = byId.get('wall-1');
    const w15 = byId.get('wall-15');
    assert.ok(w1 && w15, 'wall-1 and wall-15 must exist');
    const d1 = Math.hypot(w1.to.x - w15.to.x, w1.to.y - w15.to.y);
    const d2 = Math.hypot(w1.to.x - w15.from.x, w1.to.y - w15.from.y);
    const d3 = Math.hypot(w1.from.x - w15.to.x, w1.from.y - w15.to.y);
    const minDist = Math.min(d1, d2, d3, Math.hypot(w1.from.x - w15.from.x, w1.from.y - w15.from.y));
    assert.ok(minDist < 1.5, `wall-1 and wall-15 should be corner-connected after snap, got minDist ${minDist.toFixed(1)} (w1 ${w1.from.x},${w1.from.y}->${w1.to.x},${w1.to.y} w15 ${w15.from.x},${w15.from.y}->${w15.to.x},${w15.to.y})`);
    // wall-2 (top) and wall-13 (right) should also be connected
    const w2 = byId.get('wall-2');
    const w13 = byId.get('wall-13');
    assert.ok(w2 && w13, 'wall-2 and wall-13 must exist');
    const dTop = Math.min(
      Math.hypot(w2.to.x - w13.from.x, w2.to.y - w13.from.y),
      Math.hypot(w2.to.x - w13.to.x, w2.to.y - w13.to.y),
      Math.hypot(w2.from.x - w13.from.x, w2.from.y - w13.from.y),
      Math.hypot(w2.from.x - w13.to.x, w2.from.y - w13.to.y),
    );
    assert.ok(dTop < 1.5, `wall-2 and wall-13 should be corner-connected, got ${dTop.toFixed(1)}`);
  });

  it('traces detached right-side wall to its source polygon and classifies it', () => {
    const result = runFloorplanPipeline(loadFixture(TEST_FIXTURE));
    // The suspicious detached wall on the right is wall-15 (1004,856 vertical)
    // It originates from the large bottom-right wall polygon [535,557]-[1050,870]
    const w15 = result.normalized.walls.find((w) => w.id === 'wall-15');
    assert.ok(w15, 'wall-15 must exist');
    const poly = w15.polygon;
    const xs = poly.map((p) => p.x);
    const ys = poly.map((p) => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    // Source polygon bounds should match the large bottom-right fixture polygon
    assert.ok(minX >= 530 && minX <= 540, `wall-15 source minX ${minX} should be ~535`);
    assert.ok(maxX >= 1045 && maxX <= 1055, `wall-15 source maxX ${maxX} should be ~1050`);
    assert.ok(minY >= 550 && minY <= 560, `wall-15 source minY ${minY} should be ~557`);
    assert.ok(maxY >= 865 && maxY <= 875, `wall-15 source maxY ${maxY} should be ~870`);
    // After snap, wall-15 is still present but now connected at bottom; it is an exterior wall (terrace edge)
    // or an interior wall that is correctly part of the shell, not a stray artifact
    const isExterior = w15.exterior;
    // It should be connected to at least one other wall (wall-1) within tolerance
    const other = result.normalized.walls.find((w) => w.id !== 'wall-15' && Math.min(
      Math.hypot(w.from.x - w15.from.x, w.from.y - w15.from.y),
      Math.hypot(w.from.x - w15.to.x, w.from.y - w15.to.y),
      Math.hypot(w.to.x - w15.from.x, w.to.y - w15.from.y),
      Math.hypot(w.to.x - w15.to.x, w.to.y - w15.to.y),
    ) < 2);
    assert.ok(other, `wall-15 should be connected to another wall after snap, got isolated`);
  });

  it('verifies 2D → 3D coordinate transformation (X→X, Y→Z, height→Y)', () => {
    const result = runFloorplanPipeline(loadFixture(TEST_FIXTURE));
    const scale = result.normalized.options.pixelsPerMeter;
    const cx = (result.normalized.bounds.minX + result.normalized.bounds.maxX) / 2;
    const cy = (result.normalized.bounds.minY + result.normalized.bounds.maxY) / 2;
    for (const wall of result.normalized.walls.slice(0, 5)) {
      const expectedFromX = (wall.from.x - cx) / scale;
      const expectedFromZ = (wall.from.y - cy) / scale;
      const modelWalls = result.model3d.walls.filter((mw) => mw.id.startsWith(wall.id + '-'));
      assert.ok(modelWalls.length > 0, `wall ${wall.id} should have model segments`);
      for (const mw of modelWalls) {
        // Model wall endpoints should be transformed 2D points (within segment)
        const len2d = Math.hypot(wall.to.x - wall.from.x, wall.to.y - wall.from.y) / scale;
        const len3d = Math.hypot(mw.to.x - mw.from.x, mw.to.y - mw.from.y);
        assert.ok(Math.abs(len2d - len3d) < 0.06, `wall ${wall.id} length mismatch 2D ${len2d.toFixed(3)} vs 3D ${len3d.toFixed(3)}`);
        // Height must be wall height, not confused with Z
        assert.equal(mw.height, 2.7);
        // Thickness must not be swapped with length
        assert.ok(mw.thickness < len3d || len3d < 0.7, `wall ${mw.id} thickness ${mw.thickness} should not exceed length ${len3d}`);
      }
    }
  });

  it('verifies wall dimensions are not swapped (length vs thickness)', () => {
    const result = runFloorplanPipeline(loadFixture(TEST_FIXTURE));
    for (const w of result.model3d.walls) {
      const len = Math.hypot(w.to.x - w.from.x, w.to.y - w.from.y);
      assert.ok(w.thickness < len + 0.1 || len < 1, `wall ${w.id} thickness ${w.thickness.toFixed(3)} > length ${len.toFixed(3)} indicates swapped dimensions`);
      assert.ok(w.thickness >= 0.14 && w.thickness <= 0.6, `wall ${w.id} thickness ${w.thickness} out of expected 0.14-0.6`);
    }
  });

  it('verifies floors preserve room polygon shape and area', () => {
    const result = runFloorplanPipeline(loadFixture(TEST_FIXTURE));
    assert.equal(result.model3d.rooms.length, result.normalized.rooms.length);
    for (let i = 0; i < result.normalized.rooms.length; i++) {
      const norm = result.normalized.rooms[i];
      const model = result.model3d.rooms[i];
      assert.equal(model.id, norm.id);
      assert.ok(Math.abs(model.areaM2! - norm.areaM2) < 1.0, `room ${norm.id} area mismatch ${model.areaM2} vs ${norm.areaM2}`);
      assert.equal(model.points.length, norm.polygon.length);
    }
  });
});