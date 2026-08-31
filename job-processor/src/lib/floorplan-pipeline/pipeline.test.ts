import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { normalizeGeometry } from './normalize.js';
import { detectRooms } from './rooms.js';
import { buildFloorPlan3DModel } from './model3d.js';
import { renderDebugSvg } from './svg.js';
import { runFloorplanPipeline } from './index.js';
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
    assert.ok(interiors[0].area > 30_000 && interiors[0].area < 45_000, `unexpected room area ${interiors[0].area}`);
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