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