import { describe, expect, it } from "vitest";
import { demoBuilding, type Building, type Door2D, type FloorPlan2D, type Point2D, type Wall2D, type Window2D } from "./floorPlan";
import {
  DOOR_FRAME_WIDTH,
  DOOR_SWING_ANGLE,
  WINDOW_FRAME_WIDTH,
  WINDOW_SILL_OVERHANG,
  WINDOW_SILL_PROTRUSION,
  WINDOW_SILL_THICKNESS,
  FloorPlanValidationError,
  MEASUREMENT_OFFSET,
  generateBuildingModel,
  validateFloorPlan,
  wallLength,
  buildWallSegments,
  type BoxPart3D,
  type WallBox3D,
} from "./geometryGenerator";
import { buildOpenPlan3DWallSegments, toOpenPlan3DProject } from "./openPlan3D";

const baseWallPlan = (wallOverrides: Partial<FloorPlan2D["walls"][number]> = {}): FloorPlan2D => ({
  unit: "m",
  walls: [{ id: "wall-a", start: { x: 0, y: 0 }, end: { x: 5, y: 0 }, thickness: 0.2, height: 2.8, kind: "exterior", ...wallOverrides }],
  doors: [], windows: [], rooms: [{ id: "room", name: "Room", boundary: [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 4 }, { x: 0, y: 4 }] }],
});

const asBuilding = (plan: FloorPlan2D, elevation = 0): Building => ({
  id: "test-building",
  unit: "m",
  floors: [{ id: "test-floor", name: "Test Floor", elevation, floorToFloorHeight: 2.8, plan }],
  stairs: [],
  roof: { id: "test-roof", floorId: "test-floor", height: 0.3 },
});

type StairPatch = Partial<NonNullable<Building["stairs"]>[number]>;

const asStairBuilding = (lowerElevation: number, upperElevation: number, stairPatch: StairPatch = {}): Building => ({
  id: "stair-building",
  unit: "m",
  floors: [
    { id: "lower", name: "Lower", elevation: lowerElevation, floorToFloorHeight: 2.8, plan: baseWallPlan() },
    { id: "upper", name: "Upper", elevation: upperElevation, floorToFloorHeight: 2.8, plan: baseWallPlan() },
  ],
  stairs: [
    {
      id: "stairs-1",
      sourceFloorId: "lower",
      targetFloorId: "upper",
      position: { x: 2.5, y: 2 },
      width: 1.1,
      length: 3.2,
      height: 2.8,
      ...stairPatch,
    },
  ],
  roof: { id: "stair-roof", floorId: "upper", height: 0.3 },
});

describe("single floor geometry", () => {
  it("preserves wall dimensions and orientation", () => {
    const plan = baseWallPlan({ start: { x: 1, y: 1 }, end: { x: 4, y: 5 } });
    const model = generateBuildingModel(asBuilding(plan));
    expect(wallLength(plan.walls[0])).toBe(5);
    expect(model.wallBoxes[0]).toMatchObject({ length: 5, thickness: 0.2, height: 2.8, floorId: "test-floor" });
    expect(model.wallBoxes[0].rotationZ).toBeCloseTo(Math.atan2(4, 3), 8);
  });

  it("creates real deterministic door and window voids", () => {
    const plan = baseWallPlan();
    plan.doors.push({ id: "door-1", wallId: "wall-a", offset: 1, width: 1, height: 2.1 });
    plan.windows.push({ id: "window-1", wallId: "wall-a", offset: 2.5, width: 1.2, height: 1, sillHeight: 0.9 });
    const model = generateBuildingModel(asBuilding(plan));
    expect(model.openings.map((opening) => opening.id)).toEqual(["door-1", "window-1"]);
    expect(model.openings[1]).toMatchObject({ type: "window", floorId: "test-floor", width: 1.2, sillHeight: 0.9 });
    expect(model.wallBoxes.filter((box) => Math.abs(box.height - 2.8) < 1e-9)).toHaveLength(3);
  });

  it("rejects overlapping openings", () => {
    const plan = baseWallPlan();
    plan.doors.push({ id: "door-a", wallId: "wall-a", offset: 1, width: 1.2, height: 2.1 });
    plan.windows.push({ id: "window-a", wallId: "wall-a", offset: 1.8, width: 1, height: 1, sillHeight: 0.9 });
    expect(() => generateBuildingModel(asBuilding(plan))).toThrowError(FloorPlanValidationError);
    expect(() => generateBuildingModel(asBuilding(plan))).toThrowError(/overlap/i);
  });
});

describe("canonical spatial elements", () => {
  it("exposes wall, room, door, window, and floor spatial metadata", () => {
    const model = generateBuildingModel(demoBuilding);
    const northWall = model.spatialElements.walls.find((wall) => wall.id === "north" && wall.floorId === "ground");
    const livingRoom = model.spatialElements.rooms.find((room) => room.id === "ground-main");
    const windowElement = model.spatialElements.windows.find((window) => window.id === "ground-north-window");
    const doorElement = model.spatialElements.doors.find((door) => door.id === "ground-entry");
    const floor = model.spatialElements.floors.find((entry) => entry.id === "ground");

    expect(northWall).toMatchObject({
      id: "north",
      floorId: "ground",
      length: 9,
      thickness: 0.2,
      height: 2.8,
    });
    expect(northWall?.worldPosition).toMatchObject({ x: 4.5, y: 1.4, z: -7 });

    expect(livingRoom).toMatchObject({
      id: "ground-main",
      floorId: "ground",
      area: 20,
      dimensions: { width: 5, length: 4 },
    });
    expect(livingRoom?.worldPosition).toMatchObject({ x: 2.5, y: 0, z: -2 });

    expect(windowElement).toMatchObject({
      id: "ground-north-window",
      floorId: "ground",
      hostWallId: "north",
      width: 1.6,
      height: 1.2,
      sillHeight: 0.9,
    });
    expect(windowElement?.rotation).toBeCloseTo(0, 8);
    expect(windowElement?.worldPosition).toMatchObject({ x: 1.6, y: 1.5, z: -7 });

    expect(doorElement).toMatchObject({
      id: "ground-entry",
      floorId: "ground",
      hostWallId: "south",
      width: 1,
      height: 2.1,
    });
    expect(doorElement?.worldPosition).toMatchObject({ x: 7.4, y: 1.05, z: 0 });

    expect(floor).toMatchObject({
      id: "ground",
      name: "Ground Floor",
      elevation: 0,
    });
    expect(model.measurements.some((measurement) => measurement.subjectType === "wall" && measurement.subjectId === "north" && measurement.kind === "length")).toBe(true);
    expect(model.measurements.some((measurement) => measurement.subjectType === "window" && measurement.subjectId === "ground-north-window" && measurement.kind === "width")).toBe(true);
  });

  it("keeps the same building input deterministic across repeated model generation", () => {
    const first = generateBuildingModel(demoBuilding);
    const second = generateBuildingModel(demoBuilding);
    expect(first).toEqual(second);
  });
});

describe("multi-floor building", () => {
  it("preserves explicit elevations, height, thickness, and floor ownership", () => {
    const model = generateBuildingModel(demoBuilding);
    expect(demoBuilding.floors.map((floor) => floor.elevation)).toEqual([-2.8, 0, 2.8]);
    expect(model.wallBoxes.find((wall) => wall.floorId === "basement")?.center.y).toBeCloseTo(-1.4, 8);
    expect(model.wallBoxes.find((wall) => wall.floorId === "ground")?.center.y).toBeCloseTo(1.4, 8);
    expect(model.wallBoxes.find((wall) => wall.floorId === "first")?.center.y).toBeCloseTo(4.2, 8);
    expect(model.wallBoxes.every((wall) => wall.height > 0 && wall.height <= 2.8 && wall.thickness > 0)).toBe(true);
    expect(model.floors.filter((floor) => floor.floorId === "basement")).toHaveLength(4);
  });

  it("generates stairs between declared source and target floors", () => {
    const model = generateBuildingModel(demoBuilding);
    expect(model.stairs).toHaveLength(16);
    expect(model.stairs[0]).toMatchObject({ stairId: "basement-stairs", sourceFloorId: "basement", targetFloorId: "ground", step: 1 });
    expect(model.stairs[0].center.y).toBeCloseTo(-2.625, 8);
    expect(model.stairs[15]).toMatchObject({ stairId: "first-floor-stairs", sourceFloorId: "ground", targetFloorId: "first", step: 8 });
  });

  it("keeps stairs physically coherent: every step sits exactly one riser above the previous", () => {
    const model = generateBuildingModel(demoBuilding);

    for (const box of model.stairs) {
      const top = box.center.y + box.height / 2;
      const bottom = box.center.y - box.height / 2;
      expect(bottom).toBeCloseTo(top - box.height, 10);
      expect(top - bottom).toBeCloseTo(box.height, 10);
    }

    const basement = model.stairs.filter((box) => box.stairId === "basement-stairs");
    expect(basement).toHaveLength(8);
    for (let index = 1; index < basement.length; index += 1) {
      expect(basement[index].center.y).toBeGreaterThan(basement[index - 1].center.y);
      expect(basement[index].center.y - basement[index - 1].center.y).toBeCloseTo(0.35, 10);
    }
    expect(basement[0]).toMatchObject({ step: 1, height: 0.35 });
    expect(basement[0].center.y - basement[0].height / 2).toBeCloseTo(-2.8, 10);
    expect(basement[basement.length - 1].center.y + basement[basement.length - 1].height / 2).toBeCloseTo(0, 10);

    const firstFloor = model.stairs.filter((box) => box.stairId === "first-floor-stairs");
    expect(firstFloor).toHaveLength(8);
    for (let index = 1; index < firstFloor.length; index += 1) {
      expect(firstFloor[index].center.y - firstFloor[index - 1].center.y).toBeCloseTo(0.35, 10);
    }
    expect(firstFloor[0].center.y - firstFloor[0].height / 2).toBeCloseTo(0, 10);
    expect(firstFloor[firstFloor.length - 1].center.y + firstFloor[firstFloor.length - 1].height / 2).toBeCloseTo(2.8, 10);
  });

  it("keeps rooms attached to the correct floor", () => {
    const model = generateBuildingModel(demoBuilding);
    expect(model.floors.filter((floor) => floor.floorId === "first").map((floor) => floor.roomId)).toEqual(["first-main", "first-north", "first-east", "first-bathroom"]);
  });
});

describe("stair geometry", () => {
  it("emits consistent tread depths and total run matching the source length", () => {
    const model = generateBuildingModel(asStairBuilding(0, 2.8));
    const stairs = model.stairs;
    expect(stairs).toHaveLength(8);
    expect(stairs.map((box) => box.length).every((depth) => Math.abs(depth - 0.4) < 1e-9)).toBe(true);
    expect(stairs.reduce((total, box) => total + box.length, 0)).toBeCloseTo(3.2, 10);
    expect(stairs.every((box) => box.width === 1.1)).toBe(true);
    expect(stairs.every((box) => box.height === 0.35)).toBe(true);
  });

  it("places every consecutive step one riser above the previous", () => {
    const stairs = generateBuildingModel(asStairBuilding(0, 2.8)).stairs;
    for (let index = 1; index < stairs.length; index += 1) {
      const previousTop = stairs[index - 1].center.y + stairs[index - 1].height / 2;
      const currentTop = stairs[index].center.y + stairs[index].height / 2;
      expect(currentTop).toBeGreaterThan(previousTop);
      expect(currentTop - previousTop).toBeCloseTo(0.35, 10);
    }
    expect(stairs[0].center.y - stairs[0].height / 2).toBeCloseTo(0, 10);
    expect(stairs[stairs.length - 1].center.y + stairs[stairs.length - 1].height / 2).toBeCloseTo(2.8, 10);
  });

  it("supports a single-step stair", () => {
    const stairs = generateBuildingModel(asStairBuilding(0, 2.8, { stepCount: 1 })).stairs;
    expect(stairs).toHaveLength(1);
    expect(stairs[0]).toMatchObject({ step: 1, height: 2.8 });
    expect(stairs[0].center.y).toBeCloseTo(1.4, 10);
    expect(stairs[0].length).toBeCloseTo(3.2, 10);
  });

  it("derives the run direction and orientation from the stair data", () => {
    const northRun = generateBuildingModel(asStairBuilding(0, 2.8)).stairs;
    expect(northRun.every((box) => box.center.x === 2.5)).toBe(true);
    const zSpan = northRun.map((box) => box.center.z);
    expect(Math.min(...zSpan)).toBeLessThan(Math.max(...zSpan));

    const eastRun = generateBuildingModel(asStairBuilding(0, 2.8, { direction: 0 })).stairs;
    expect(eastRun.every((box) => box.center.z === -2)).toBe(true);
    const xSpan = eastRun.map((box) => box.center.x);
    expect(Math.min(...xSpan)).toBeLessThan(Math.max(...xSpan));
    expect(eastRun[0].center.x).toBeLessThan(eastRun[eastRun.length - 1].center.x);
    expect(eastRun[0].rotationY).toBeCloseTo(Math.PI / 2, 10);
  });

  it("descending stairs step downward toward the target floor", () => {
    const stairs = generateBuildingModel(asStairBuilding(2.8, 0, { stepCount: 4 })).stairs;
    expect(stairs).toHaveLength(4);
    for (let index = 1; index < stairs.length; index += 1) {
      expect(stairs[index].center.y).toBeLessThan(stairs[index - 1].center.y);
      expect(stairs[index - 1].center.y - stairs[index].center.y).toBeCloseTo(0.7, 10);
    }
    expect(stairs[0].center.y + stairs[0].height / 2).toBeCloseTo(2.8, 10);
    expect(stairs[stairs.length - 1].center.y - stairs[stairs.length - 1].height / 2).toBeCloseTo(0, 10);
  });

  it("skips stairs with zero or invalid dimensions without crashing", () => {
    expect(generateBuildingModel(asStairBuilding(0, 2.8, { width: 0 })).stairs).toEqual([]);
    expect(generateBuildingModel(asStairBuilding(0, 2.8, { length: -1 })).stairs).toEqual([]);
    expect(generateBuildingModel(asStairBuilding(0, 2.8, { stepCount: 0 })).stairs).toEqual([]);
    expect(generateBuildingModel(asStairBuilding(0, 2.8, { stepCount: 7.5 })).stairs).toEqual([]);
    expect(generateBuildingModel(asStairBuilding(2.8, 2.8)).stairs).toEqual([]);
  });

  it("falls back to the default direction for non-finite direction data", () => {
    const stairs = generateBuildingModel(asStairBuilding(0, 2.8, { direction: Number.NaN })).stairs;
    expect(stairs).toHaveLength(8);
    expect(stairs.every((box) => box.rotationY === 0)).toBe(true);
  });
});

describe("validation and determinism", () => {
  it("rejects invalid dimensions and opening references", () => {
    const plan = baseWallPlan({ thickness: -0.2, height: 0 });
    plan.doors.push({ id: "door-x", wallId: "missing", offset: 0, width: 0.9, height: 2.1 });
    expect(() => validateFloorPlan(plan)).toThrowError(/unknown wall|positive finite/i);
  });

  it("returns identical geometry for identical building input", () => {
    expect(generateBuildingModel(demoBuilding)).toEqual(generateBuildingModel(demoBuilding));
  });
});

const rotatedRect = (width: number, length: number, angle: number, center: Point2D = { x: 0, y: 0 }) => {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return [
    { x: -width / 2, y: -length / 2 },
    { x: width / 2, y: -length / 2 },
    { x: width / 2, y: length / 2 },
    { x: -width / 2, y: length / 2 },
  ].map((point) => ({
    x: center.x + point.x * cos - point.y * sin,
    y: center.y + point.x * sin + point.y * cos,
  }));
};

const rectPlan = (width: number, length: number): FloorPlan2D => {
  const corners = rotatedRect(width, length, 0);
  const walls = corners.map((corner, index) => ({
    id: `wall-${index}`,
    start: corner,
    end: corners[(index + 1) % corners.length],
    thickness: 0.15,
    height: 2.8,
    kind: "exterior" as const,
  }));
  return { unit: "m", walls, doors: [], windows: [], rooms: [{ id: "room-a", name: "Room A", boundary: corners }] };
};

const rotatedPlan = (angle: number): FloorPlan2D => {
  const corners = rotatedRect(4, 2, angle);
  const walls = corners.map((corner, index) => ({
    id: `wall-${index}`,
    start: corner,
    end: corners[(index + 1) % corners.length],
    thickness: 0.15,
    height: 2.8,
    kind: "exterior" as const,
  }));
  return { unit: "m", walls, doors: [], windows: [], rooms: [{ id: "room-rot", name: "Rotated Room", boundary: corners }] };
};

const axisAlignedPlan = (): FloorPlan2D => ({
  unit: "m",
  walls: [
    { id: "s", start: { x: 0, y: 0 }, end: { x: 6, y: 0 }, thickness: 0.2, height: 2.8, kind: "exterior" },
    { id: "e", start: { x: 6, y: 0 }, end: { x: 6, y: 4 }, thickness: 0.2, height: 2.8, kind: "exterior" },
    { id: "n", start: { x: 6, y: 4 }, end: { x: 0, y: 4 }, thickness: 0.2, height: 2.8, kind: "exterior" },
    { id: "w", start: { x: 0, y: 4 }, end: { x: 0, y: 0 }, thickness: 0.2, height: 2.8, kind: "exterior" },
  ],
  doors: [],
  windows: [],
  rooms: [{ id: "axis-room", name: "Axis Room", boundary: [{ x: 0, y: 0 }, { x: 6, y: 0 }, { x: 6, y: 4 }, { x: 0, y: 4 }] }],
});

describe("room boundaries and topology", () => {
  it("keeps the axis-aligned room boundary intact", () => {
    const model = generateBuildingModel(asBuilding(axisAlignedPlan()));
    const room = model.spatialElements.rooms[0];
    expect(room.boundary).toEqual([{ x: 0, y: 0 }, { x: 6, y: 0 }, { x: 6, y: 4 }, { x: 0, y: 4 }]);
    expect(room.area).toBeCloseTo(24, 8);
    expect(room.boundingWalls).toEqual(["s", "e", "n", "w"]);
  });

  it("keeps a rotated room boundary rotated (not an axis-aligned box)", () => {
    const plan = rotatedPlan(Math.PI / 6);
    const model = generateBuildingModel(asBuilding(plan));
    const room = model.spatialElements.rooms[0];
    const xs = room.boundary.map((point) => point.x);
    const ys = room.boundary.map((point) => point.y);
    expect(room.boundary).not.toEqual([
      { x: Math.min(...xs), y: Math.min(...ys) },
      { x: Math.max(...xs), y: Math.min(...ys) },
      { x: Math.max(...xs), y: Math.max(...ys) },
      { x: Math.min(...xs), y: Math.max(...ys) },
    ]);
    expect(room.area).toBeCloseTo(8, 8);
    expect(room.boundingWalls).toHaveLength(4);
  });

  it("measures a rotated room along its own axes", () => {
    const plan = rotatedPlan(Math.PI / 6);
    const model = generateBuildingModel(asBuilding(plan));
    const room = model.spatialElements.rooms[0];
    expect(Math.max(room.dimensions.width, room.dimensions.length)).toBeCloseTo(4, 8);
    expect(Math.min(room.dimensions.width, room.dimensions.length)).toBeCloseTo(2, 8);
  });
});

describe("ceiling geometry", () => {
  it("matches the room footprint and sits at the wall-top elevation", () => {
    const plan = rotatedPlan(Math.PI / 6);
    const model = generateBuildingModel(asBuilding(plan));
    const room = model.spatialElements.rooms[0];
    const ceiling = model.ceilings.find((entry) => entry.roomId === room.id)!;
    expect(ceiling.vertices).toEqual(room.boundary);
    expect(ceiling.area).toBeCloseTo(room.area, 8);
    expect(ceiling.elevation).toBeCloseTo(2.8, 8);
  });

  it("follows the floor elevation and wall height", () => {
    const plan = rotatedPlan(0);
    plan.walls = plan.walls.map((wall) => ({ ...wall, height: 3 }));
    const model = generateBuildingModel(asBuilding(plan, 1.2));
    const ceiling = model.ceilings[0];
    expect(ceiling.elevation).toBeCloseTo(1.2 + 3, 8);
  });

  it("produces one independent ceiling per room", () => {
    const model = generateBuildingModel(demoBuilding);
    const groundRooms = model.spatialElements.rooms.filter((room) => room.floorId === "ground");
    const groundCeilings = model.ceilings.filter((ceiling) => ceiling.floorId === "ground");
    expect(groundCeilings).toHaveLength(groundRooms.length);
    expect(groundCeilings.map((ceiling) => ceiling.roomId).sort()).toEqual(groundRooms.map((room) => room.id).sort());
    for (const ceiling of groundCeilings) {
      const room = model.spatialElements.rooms.find((entry) => entry.id === ceiling.roomId)!;
      expect(ceiling.vertices).toEqual(room.boundary);
    }
    const ids = new Set(groundCeilings.map((ceiling) => ceiling.roomId));
    expect(ids.size).toBe(groundCeilings.length);
  });

  it("keeps floor and ceiling on the same room footprint", () => {
    const model = generateBuildingModel(demoBuilding);
    for (const ceiling of model.ceilings) {
      const floor = model.floors.find((entry) => entry.floorId === ceiling.floorId && entry.roomId === ceiling.roomId)!;
      expect(floor.vertices).toEqual(ceiling.vertices);
    }
  });

  it("handles invalid or degenerate room geometry safely", () => {
    const degenerate = { ...baseWallPlan(), rooms: [{ id: "bad", name: "Bad", boundary: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 0 }] }] };
    expect(() => generateBuildingModel(asBuilding(degenerate))).toThrowError(FloorPlanValidationError);
    const empty = { ...baseWallPlan(), rooms: [{ id: "bad", name: "Bad", boundary: [] }] };
    expect(() => generateBuildingModel(asBuilding(empty))).toThrowError(FloorPlanValidationError);
  });
});

describe("openPlan3D integration boundary", () => {
  it("maps the canonical model to normalized upstream openings and ownership", () => {
    const project = toOpenPlan3DProject(demoBuilding);
    const ground = project.floors.find((floor) => floor.id === "ground");
    expect(ground?.elevation).toBe(0);
    expect(ground?.rooms.every((room) => room.walls.every((wallId) => ground.walls.some((wall) => wall.id === wallId)))).toBe(true);
    expect(ground?.doors.every((door) => door.position >= 0 && door.position <= 1)).toBe(true);
    expect(ground?.windows.every((window) => window.position >= 0 && window.position <= 1)).toBe(true);
  });

  it("keeps custom door heights as real upstream-style opening segments", () => {
    const segments = buildOpenPlan3DWallSegments(5, 2.8, [{ position: 0.5, width: 1, height: 2 }], []);
    expect(segments).toHaveLength(3);
    expect(segments[0]).toMatchObject({ width: 2, height: 2.8, offsetX: 1, offsetY: 0 });
    expect(segments[1]).toMatchObject({ width: 1, offsetX: 2.5, offsetY: 2 });
    expect(segments[1].height).toBeCloseTo(0.8, 10);
    expect(segments[2]).toMatchObject({ width: 2, height: 2.8, offsetX: 4, offsetY: 0 });
  });

  it("produces identical adapted projects for identical input", () => {
    expect(toOpenPlan3DProject(demoBuilding)).toEqual(toOpenPlan3DProject(demoBuilding));
  });
});

const junctionFixturePlan = (): FloorPlan2D => ({
  unit: "m",
  walls: [
    { id: "la", start: { x: 0, y: 0 }, end: { x: 3, y: 0 }, thickness: 0.2, height: 2.8, kind: "exterior" },
    { id: "lb", start: { x: 3, y: 0 }, end: { x: 3, y: 2 }, thickness: 0.2, height: 2.8, kind: "exterior" },
    { id: "ta", start: { x: 0, y: 10 }, end: { x: 6, y: 10 }, thickness: 0.15, height: 2.8, kind: "interior" },
    { id: "tb", start: { x: 3, y: 10 }, end: { x: 3, y: 14 }, thickness: 0.15, height: 2.8, kind: "interior" },
    { id: "ca", start: { x: 0, y: 20 }, end: { x: 6, y: 20 }, thickness: 0.15, height: 2.8, kind: "interior" },
    { id: "cb", start: { x: 3, y: 18 }, end: { x: 3, y: 22 }, thickness: 0.15, height: 2.8, kind: "interior" },
    { id: "rd1", start: { x: 12, y: 0 }, end: { x: 16, y: 4 }, thickness: 0.15, height: 2.8, kind: "interior" },
    { id: "rd2", start: { x: 14, y: 0 }, end: { x: 14, y: 4 }, thickness: 0.15, height: 2.8, kind: "interior" },
  ],
  doors: [],
  windows: [],
  rooms: [{ id: "cross-room", name: "Cross", boundary: [{ x: 3, y: 18 }, { x: 6, y: 18 }, { x: 6, y: 22 }, { x: 3, y: 22 }] }],
});

const fixtureSegments = () => {
  const plan = junctionFixturePlan();
  const segments = buildWallSegments(plan.walls, plan.rooms);
  const byWall = (id: string) => segments.filter((segment) => segment.sourceWallId === id);
  return { segments, byWall, plan };
};

describe("wall junction segmentation", () => {
  it("keeps two walls meeting at a shared endpoint (corner) unsplit", () => {
    const { byWall } = fixtureSegments();
    expect(byWall("la").map((segment) => segment.length)).toEqual([3]);
    expect(byWall("lb").map((segment) => segment.length)).toEqual([2]);
    expect(byWall("la")[0].end).toEqual({ x: 3, y: 0 });
    expect(byWall("lb")[0].start).toEqual({ x: 3, y: 0 });
  });

  it("splits only the pierced wall at a T-junction", () => {
    const { byWall } = fixtureSegments();
    expect(byWall("ta").map((segment) => segment.length)).toEqual([3, 3]);
    expect(byWall("tb").map((segment) => segment.length)).toEqual([4]);
    expect(byWall("ta").length).toBe(2);
    expect(byWall("tb").length).toBe(1);
  });

  it("splits both walls at a cross-junction", () => {
    const { byWall } = fixtureSegments();
    expect(byWall("ca").map((segment) => segment.length)).toEqual([3, 3]);
    expect(byWall("cb").map((segment) => segment.length)).toEqual([2, 2]);
  });

  it("splits both walls at a rotated junction", () => {
    const { byWall } = fixtureSegments();
    const halfDiagonal = Math.sqrt(8);
    const rounded = (value: number) => Number(value.toFixed(9));
    expect(byWall("rd1").map((segment) => rounded(segment.length))).toEqual([rounded(halfDiagonal), rounded(halfDiagonal)]);
    expect(byWall("rd2").map((segment) => segment.length)).toEqual([2, 2]);
  });

  it("produces no junction when walls are outside the tolerance", () => {
    const plan = junctionFixturePlan();
    plan.walls = [
      { id: "a", start: { x: 0, y: 0 }, end: { x: 5, y: 0 }, thickness: 0.2, height: 2.8, kind: "exterior" },
      { id: "b", start: { x: 2.5, y: 0.001 }, end: { x: 2.5, y: 3 }, thickness: 0.15, height: 2.8, kind: "interior" },
    ];
    const segments = buildWallSegments(plan.walls, plan.rooms);
    expect(segments.filter((segment) => segment.sourceWallId === "a")).toHaveLength(1);
    expect(segments.filter((segment) => segment.sourceWallId === "b")).toHaveLength(1);
    expect(segments.filter((segment) => segment.sourceWallId === "a")[0].length).toBe(5);
  });

  it("preserves total length and thickness for every split wall", () => {
    const { plan, byWall } = fixtureSegments();
    for (const wall of plan.walls) {
      const original = Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y);
      const split = byWall(wall.id);
      const total = split.reduce((sum, segment) => sum + segment.length, 0);
      expect(total).toBeCloseTo(original, 9);
      for (const segment of split) {
        expect(segment.thickness).toBe(wall.thickness);
        expect(segment.height).toBe(wall.height);
        expect(segment.startOffset).toBeGreaterThanOrEqual(0);
        expect(segment.endOffset).toBeLessThanOrEqual(original + 1e-9);
      }
    }
  });

  it("tiles each wall contiguously with matching endpoints (no gaps or overlaps)", () => {
    const { byWall } = fixtureSegments();
    for (const id of ["ta", "ca", "cb", "rd1", "rd2"]) {
      const segments = byWall(id);
      for (let index = 1; index < segments.length; index += 1) {
        expect(segments[index].start.x).toBeCloseTo(segments[index - 1].end.x, 9);
        expect(segments[index].start.y).toBeCloseTo(segments[index - 1].end.y, 9);
      }
    }
  });

  it("exposes junction-split segments with floor ownership on the demo building", () => {
    const model = generateBuildingModel(demoBuilding);
    const groundSegments = model.spatialElements.wallSegments.filter((segment) => segment.floorId === "ground");
    expect(groundSegments.filter((segment) => segment.sourceWallId === "south").map((segment) => segment.length)).toEqual([4, 5]);
    expect(groundSegments.filter((segment) => segment.sourceWallId === "center-divider").map((segment) => segment.length)).toEqual([4, 3]);
    expect(model.spatialElements.wallSegments.filter((segment) => segment.floorId === "ground")).toHaveLength(12);
    expect(model.spatialElements.wallSegments).toHaveLength(36);
  });

  it("preserves room-wall relationships after segmentation", () => {
    const model = generateBuildingModel(demoBuilding);
    const groundMain = model.spatialElements.rooms.find((room) => room.id === "ground-main")!;
    expect(groundMain.boundingWalls).toEqual(["west", "south", "center-divider", "cross-divider"]);
    const centerSeg = model.spatialElements.wallSegments.find(
      (segment) => segment.floorId === "ground" && segment.sourceWallId === "center-divider" && segment.id === "center-divider-seg-0",
    )!;
    expect(centerSeg.roomIds).toEqual(["ground-east", "ground-main"]);
    const southSegSouth = model.spatialElements.wallSegments.find(
      (segment) => segment.floorId === "ground" && segment.sourceWallId === "south" && segment.id === "south-seg-1",
    )!;
    expect(southSegSouth.roomIds).toEqual(["ground-main"]);
  });

  it("keeps existing room boundaries, floor geometry and ceiling geometry unchanged", () => {
    const model = generateBuildingModel(demoBuilding);
    expect(model.floors).toHaveLength(12);
    expect(model.ceilings).toHaveLength(12);
    for (const room of model.spatialElements.rooms) {
      const planRoom = demoBuilding.floors.find((floor) => floor.id === room.floorId)!.plan.rooms.find((entry) => entry.id === room.id)!;
      expect(room.boundary).toEqual(planRoom.boundary);
      const floorSurface = model.floors.find((entry) => entry.floorId === room.floorId && entry.roomId === room.id)!;
      const ceilingSurface = model.ceilings.find((entry) => entry.floorId === room.floorId && entry.roomId === room.id)!;
      expect(floorSurface.vertices).toEqual(room.boundary);
      expect(ceilingSurface.vertices).toEqual(room.boundary);
      expect(floorSurface.area).toBeCloseTo(room.area, 9);
      expect(ceilingSurface.area).toBeCloseTo(room.area, 9);
    }
  });
});

describe("real door and window wall openings", () => {
  const doorOn = (plan: FloorPlan2D, patch: Partial<Door2D> = {}): FloorPlan2D => {
    plan.doors.push({ id: "door-1", wallId: "wall-a", offset: 1, width: 1, height: 2.1, ...patch });
    return plan;
  };

  const windowOn = (plan: FloorPlan2D, patch: Partial<Window2D> = {}): FloorPlan2D => {
    plan.windows.push({ id: "window-1", wallId: "wall-a", offset: 2, width: 1.2, height: 1, sillHeight: 0.9, ...patch });
    return plan;
  };

  const intervalsOverlap = (first: readonly [number, number], second: readonly [number, number], eps = 1e-6) =>
    first[0] < second[1] - eps && second[0] < first[1] - eps;

  const boxAlongInterval = (box: WallBox3D, wall: Wall2D): [number, number] => {
    const cos = Math.cos(box.rotationZ);
    const sin = Math.sin(box.rotationZ);
    const along = (box.center.x - wall.start.x) * cos + (-box.center.z - wall.start.y) * sin;
    return [along - box.length / 2, along + box.length / 2];
  };

  const boxVerticalInterval = (box: WallBox3D): [number, number] => [box.center.y - box.height / 2, box.center.y + box.height / 2];

  const partOffsetAlong = (part: BoxPart3D, wall: Wall2D): number => {
    const cos = Math.cos(part.rotationZ);
    const sin = Math.sin(part.rotationZ);
    return (part.center.x - wall.start.x) * cos + (-part.center.z - wall.start.y) * sin;
  };

  const assertNoWallInsideOpenings = (model: ReturnType<typeof generateBuildingModel>, plan: FloorPlan2D, elevation = 0) => {
    for (const wall of plan.walls) {
      const boxes = model.wallBoxes.filter((box) => box.sourceWallId === wall.id);
      const openings = [
        ...plan.doors.filter((door) => door.wallId === wall.id).map((door) => ({ offset: door.offset, width: door.width, sill: 0, height: door.height })),
        ...plan.windows.filter((window) => window.wallId === wall.id).map((window) => ({ offset: window.offset, width: window.width, sill: window.sillHeight, height: window.height })),
      ];
      for (const opening of openings) {
        const along = [opening.offset, opening.offset + opening.width] as [number, number];
        const vertical = [elevation + opening.sill, elevation + opening.sill + opening.height] as [number, number];
        for (const box of boxes) {
          expect(intervalsOverlap(boxAlongInterval(box, wall), along) && intervalsOverlap(boxVerticalInterval(box), vertical)).toBe(false);
        }
      }
    }
  };

  it("splits a straight wall into solid regions around a single door", () => {
    const plan = doorOn(baseWallPlan());
    const model = generateBuildingModel(asBuilding(plan));
    expect(model.wallBoxes).toHaveLength(3);
    const sorted = model.wallBoxes.map((box) => boxAlongInterval(box, plan.walls[0])).sort((first, second) => first[0] - second[0]);
    expect(sorted[0][0]).toBeCloseTo(0, 9);
    expect(sorted[0][1]).toBeCloseTo(1, 9);
    expect(sorted[1][0]).toBeCloseTo(1, 9);
    expect(sorted[1][1]).toBeCloseTo(2, 9);
    expect(sorted[2][0]).toBeCloseTo(2, 9);
    expect(sorted[2][1]).toBeCloseTo(5, 9);
    assertNoWallInsideOpenings(model, plan);
  });

  it("splits a straight wall around a single window into before, sill, lintel, and after regions", () => {
    const plan = windowOn(baseWallPlan());
    const model = generateBuildingModel(asBuilding(plan));
    expect(model.wallBoxes).toHaveLength(4);
    expect(model.wallBoxes.filter((box) => Math.abs(box.height - 2.8) < 1e-9)).toHaveLength(2);
    assertNoWallInsideOpenings(model, plan);
  });

  it("cuts a door opening with the exact canonical width", () => {
    const plan = doorOn(baseWallPlan(), { width: 1.25 });
    const model = generateBuildingModel(asBuilding(plan));
    const intervals = model.wallBoxes.map((box) => boxAlongInterval(box, plan.walls[0])).sort((first, second) => first[0] - second[0]);
    expect(intervals[intervals.length - 1][0] - intervals[0][1]).toBeCloseTo(1.25, 9);
    expect(model.architecturalOpenings[0]).toMatchObject({ type: "door", width: 1.25 });
  });

  it("cuts a window opening with the exact canonical width", () => {
    const plan = windowOn(baseWallPlan(), { width: 1.6 });
    const model = generateBuildingModel(asBuilding(plan));
    const intervals = model.wallBoxes.map((box) => boxAlongInterval(box, plan.walls[0])).sort((first, second) => first[0] - second[0]);
    expect(intervals[intervals.length - 1][0] - intervals[0][1]).toBeCloseTo(1.6, 9);
  });

  it("cuts a door opening with the exact canonical height", () => {
    const plan = doorOn(baseWallPlan(), { height: 2.1 });
    const model = generateBuildingModel(asBuilding(plan));
    const lintel = model.wallBoxes.find((box) => {
      const [start, end] = boxAlongInterval(box, plan.walls[0]);
      return Math.abs(start - 1) < 1e-9 && Math.abs(end - 2) < 1e-9;
    });
    expect(lintel).toBeTruthy();
    expect(lintel!.height).toBeCloseTo(0.7, 9);
    expect(model.doors[0].leaf?.height).toBeCloseTo(2.1, 9);
    expect(model.architecturalOpenings[0]).toMatchObject({ bottomElevation: 0, topElevation: 2.1 });
  });

  it("cuts a window opening with the exact canonical height and sill elevation", () => {
    const plan = windowOn(baseWallPlan(), { height: 1.1, sillHeight: 0.9 });
    const model = generateBuildingModel(asBuilding(plan));
    const sill = model.wallBoxes.find((box) => {
      const [start, end] = boxAlongInterval(box, plan.walls[0]);
      return Math.abs(start - 2) < 1e-9 && Math.abs(end - 3.2) < 1e-9;
    });
    expect(sill).toBeTruthy();
    expect(sill!.height).toBeCloseTo(0.9, 9);
    expect(model.windows[0].glass?.height).toBeCloseTo(1.1 - 2 * WINDOW_FRAME_WIDTH, 9);
    expect(model.architecturalOpenings[0]).toMatchObject({ bottomElevation: 0.9, topElevation: 2 });
  });

  it("centres a door and a window in the middle of a wall", () => {
    const doorPlan = doorOn(baseWallPlan(), { offset: 2 });
    const doorModel = generateBuildingModel(asBuilding(doorPlan));
    expect(partOffsetAlong(doorModel.doors[0].leaf!, doorPlan.walls[0])).toBeCloseTo(2.5, 9);

    const windowPlan = windowOn(baseWallPlan(), { offset: 1.9 });
    const windowModel = generateBuildingModel(asBuilding(windowPlan));
    expect(partOffsetAlong(windowModel.windows[0].glass!, windowPlan.walls[0])).toBeCloseTo(2.5, 9);
  });

  it("handles doors and windows near wall endpoints without breaking geometry", () => {
    const doorStart = doorOn(baseWallPlan(), { offset: 0 });
    const doorStartModel = generateBuildingModel(asBuilding(doorStart));
    expect(doorStartModel.wallBoxes).toHaveLength(2);
    assertNoWallInsideOpenings(doorStartModel, doorStart);

    const doorEnd = doorOn(baseWallPlan(), { offset: 4 });
    const doorEndModel = generateBuildingModel(asBuilding(doorEnd));
    expect(doorEndModel.wallBoxes).toHaveLength(2);
    assertNoWallInsideOpenings(doorEndModel, doorEnd);

    const windowStart = windowOn(baseWallPlan(), { offset: 0 });
    const windowStartModel = generateBuildingModel(asBuilding(windowStart));
    assertNoWallInsideOpenings(windowStartModel, windowStart);

    const windowEnd = windowOn(baseWallPlan(), { offset: 3.8 });
    const windowEndModel = generateBuildingModel(asBuilding(windowEnd));
    assertNoWallInsideOpenings(windowEndModel, windowEnd);
  });

  it("supports multiple non-overlapping openings on one wall", () => {
    const plan = baseWallPlan();
    plan.doors.push({ id: "door-1", wallId: "wall-a", offset: 0.5, width: 1, height: 2.1 });
    plan.windows.push({ id: "window-1", wallId: "wall-a", offset: 2, width: 1.2, height: 1, sillHeight: 0.9 });
    plan.doors.push({ id: "door-2", wallId: "wall-a", offset: 3.6, width: 0.9, height: 2.1 });
    const model = generateBuildingModel(asBuilding(plan));
    expect(model.doors).toHaveLength(2);
    expect(model.windows).toHaveLength(1);
    expect(model.architecturalOpenings.map((opening) => opening.id).sort()).toEqual(["door-1", "door-2", "window-1"]);
    assertNoWallInsideOpenings(model, plan);
  });

  it("keeps multiple openings strictly non-overlapping along the wall", () => {
    const plan = baseWallPlan();
    plan.doors.push({ id: "door-1", wallId: "wall-a", offset: 0.5, width: 1, height: 2.1 });
    plan.windows.push({ id: "window-1", wallId: "wall-a", offset: 2, width: 1.2, height: 1, sillHeight: 0.9 });
    plan.doors.push({ id: "door-2", wallId: "wall-a", offset: 3.6, width: 0.9, height: 2.1 });
    const model = generateBuildingModel(asBuilding(plan));
    const intervals = model.architecturalOpenings
      .map((opening) => [opening.startOffset, opening.endOffset] as [number, number])
      .sort((first, second) => first[0] - second[0]);
    for (let index = 1; index < intervals.length; index += 1) {
      expect(intervals[index][0]).toBeGreaterThanOrEqual(intervals[index - 1][1] - 1e-6);
    }
    assertNoWallInsideOpenings(model, plan);
  });

  it("rejects overlapping openings safely instead of generating invalid geometry", () => {
    const plan = windowOn(baseWallPlan(), { offset: 1.5, width: 1.4 });
    plan.windows.push({ id: "window-2", wallId: "wall-a", offset: 1.8, width: 1, height: 1, sillHeight: 0.9 });
    expect(() => generateBuildingModel(asBuilding(plan))).toThrowError(FloorPlanValidationError);
    expect(() => generateBuildingModel(asBuilding(plan))).toThrowError(/overlap/i);
  });

  it("places a door on a wall that is not aligned to the world axes", () => {
    const plan = doorOn(baseWallPlan({ start: { x: 0, y: 0 }, end: { x: 5, y: 5 } }));
    const model = generateBuildingModel(asBuilding(plan));
    const door = model.doors[0];
    expect(door.leaf!.rotationZ).toBeCloseTo(Math.PI / 4, 9);
    expect(partOffsetAlong(door.leaf!, plan.walls[0])).toBeCloseTo(1 + DOOR_FRAME_WIDTH + (1 - 2 * DOOR_FRAME_WIDTH) / 2, 9);
    expect(model.architecturalOpenings[0]).toMatchObject({ rotationZ: Math.PI / 4, segmentId: "wall-a-seg-0" });
    assertNoWallInsideOpenings(model, plan);
  });

  it("places a window on a rotated wall", () => {
    const plan = windowOn(baseWallPlan({ start: { x: 0, y: 0 }, end: { x: 3, y: 4 } }));
    const model = generateBuildingModel(asBuilding(plan));
    const window = model.windows[0];
    expect(window.glass!.rotationZ).toBeCloseTo(Math.atan2(4, 3), 9);
    expect(partOffsetAlong(window.glass!, plan.walls[0])).toBeCloseTo(2 + WINDOW_FRAME_WIDTH + (1.2 - 2 * WINDOW_FRAME_WIDTH) / 2, 9);
    assertNoWallInsideOpenings(model, plan);
  });

  it("spans door and window frames across the full wall thickness", () => {
    const plan = baseWallPlan({ thickness: 0.3 });
    doorOn(plan);
    const model = generateBuildingModel(asBuilding(plan));
    for (const part of model.doors[0].frame) expect(part.depth).toBeCloseTo(0.3, 9);
    expect(model.doors[0].leaf!.depth).toBeLessThanOrEqual(0.3);
  });

  it("aligns door and window parts with the host wall orientation", () => {
    const plan = baseWallPlan({ start: { x: 0, y: 0 }, end: { x: 3, y: 4 } });
    doorOn(plan);
    windowOn(plan, { offset: 2.5 });
    const model = generateBuildingModel(asBuilding(plan));
    const wallRotation = Math.atan2(4, 3);
    for (const door of model.doors) {
      for (const part of door.frame) expect(part.rotationZ).toBeCloseTo(wallRotation, 9);
      expect(door.leaf!.rotationZ).toBeCloseTo(wallRotation, 9);
    }
    for (const window of model.windows) {
      for (const part of window.frame) expect(part.rotationZ).toBeCloseTo(wallRotation, 9);
      expect(window.glass!.rotationZ).toBeCloseTo(wallRotation, 9);
    }
  });

  it("leaves no solid wall geometry inside any opening volume", () => {
    const plan = baseWallPlan({ start: { x: 1, y: 0 }, end: { x: 8, y: 0 } });
    plan.doors.push({ id: "door-1", wallId: "wall-a", offset: 0.5, width: 1, height: 2.1 });
    plan.windows.push({ id: "window-1", wallId: "wall-a", offset: 2.2, width: 1.4, height: 1.2, sillHeight: 0.9 });
    plan.doors.push({ id: "door-2", wallId: "wall-a", offset: 4.5, width: 0.9, height: 2.1 });
    plan.windows.push({ id: "window-2", wallId: "wall-a", offset: 5.8, width: 1, height: 1, sillHeight: 1.1 });
    const model = generateBuildingModel(asBuilding(plan));
    assertNoWallInsideOpenings(model, plan);
  });

  it("resolves architectural openings to host segments with elevations and offsets", () => {
    const plan = windowOn(baseWallPlan());
    plan.windows.push({ id: "window-2", wallId: "wall-a", offset: 4, width: 0.8, height: 1, sillHeight: 1.2 });
    const model = generateBuildingModel(asBuilding(plan, 1.5));
    expect(model.architecturalOpenings).toHaveLength(2);
    expect(model.architecturalOpenings[0]).toMatchObject({
      type: "window",
      wallId: "wall-a",
      segmentId: "wall-a-seg-0",
      startOffset: 2,
      endOffset: 3.2,
      bottomElevation: 2.4,
      topElevation: 3.4,
    });
  });

  it("keeps the existing room topology unchanged when openings are added", () => {
    const model = generateBuildingModel(demoBuilding);
    const groundSegments = model.spatialElements.wallSegments.filter((segment) => segment.floorId === "ground");
    expect(groundSegments).toHaveLength(12);
    const centerSegment = groundSegments.find((segment) => segment.id === "center-divider-seg-0")!;
    expect(centerSegment.roomIds).toEqual(["ground-east", "ground-main"]);
    const groundMain = model.spatialElements.rooms.find((room) => room.id === "ground-main")!;
    expect(groundMain.boundary).toEqual([{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 4 }, { x: 0, y: 4 }]);
    expect(groundMain.boundingWalls).toEqual(["west", "south", "center-divider", "cross-divider"]);
    expect(model.spatialElements.doors.find((door) => door.id === "ground-entry")!.hostSegmentId).toBe("south-seg-0");
    expect(model.spatialElements.windows.find((window) => window.id === "ground-north-window")!.hostSegmentId).toBe("north-seg-0");
  });

  it("preserves total wall dimensions across opening cuts", () => {
    const plan = baseWallPlan();
    doorOn(plan);
    windowOn(plan);
    const model = generateBuildingModel(asBuilding(plan));
    const wall = plan.walls[0];
    const boxes = model.wallBoxes.filter((box) => box.sourceWallId === "wall-a");
    expect(boxes.every((box) => box.thickness === 0.2)).toBe(true);
    let coveredTo = 0;
    for (const [start, end] of boxes.map((box) => boxAlongInterval(box, wall)).sort((first, second) => first[0] - second[0])) {
      expect(start).toBeLessThanOrEqual(coveredTo + 1e-6);
      coveredTo = Math.max(coveredTo, end);
    }
    expect(coveredTo).toBeCloseTo(5, 9);

    const demo = generateBuildingModel(demoBuilding);
    for (const wall of demoBuilding.floors[1].plan.walls) {
      const wallBoxes = demo.wallBoxes.filter((box) => box.floorId === "ground" && box.sourceWallId === wall.id);
      let covered = 0;
      for (const [start, end] of wallBoxes.map((box) => boxAlongInterval(box, wall)).sort((first, second) => first[0] - second[0])) {
        expect(start).toBeLessThanOrEqual(covered + 1e-6);
        covered = Math.max(covered, end);
      }
      expect(covered).toBeCloseTo(wallLength(wall), 9);
    }
  });

  it("clamps door frame members so the leaf always stays positive and finite", () => {
    const plan = doorOn(baseWallPlan(), { width: 0.05 });
    const model = generateBuildingModel(asBuilding(plan));
    expect(model.doors[0].frame.every((part) => Number.isFinite(part.width) && part.width > 0)).toBe(true);
    expect(model.doors[0].frame.every((part) => Number.isFinite(part.center.x) && Number.isFinite(part.center.y) && Number.isFinite(part.center.z))).toBe(true);
    expect(model.doors[0].leaf === null || (model.doors[0].leaf.width > 0 && Number.isFinite(model.doors[0].leaf.width))).toBe(true);
  });

  it("lines a door opening with a full-thickness frame and keeps the leaf narrower than the opening", () => {
    const plan = doorOn(baseWallPlan(), { width: 1, height: 2.1 });
    const model = generateBuildingModel(asBuilding(plan));
    const door = model.doors[0];
    expect(door.frame).toHaveLength(3);
    for (const part of door.frame) expect(part.depth).toBeCloseTo(0.2, 9);
    expect(door.leaf!.width).toBeCloseTo(1 - 2 * DOOR_FRAME_WIDTH, 9);
    expect(door.leaf!.width).toBeLessThan(1);
    expect(door.leaf!.depth).toBeLessThanOrEqual(0.2);
  });

  it("represents the door swing with a swung leaf and a handle that rotate about the hinge", () => {
    const plan = doorOn(baseWallPlan(), { width: 1, height: 2.1 });
    const model = generateBuildingModel(asBuilding(plan));
    const door = model.doors[0];
    const wall = plan.walls[0];
    const wallRotation = Math.atan2(wall.end.y - wall.start.y, wall.end.x - wall.start.x);

    expect(door.leaf!.rotationZ).toBeCloseTo(wallRotation, 9);
    expect(door.leafSwing).not.toBeNull();
    expect(door.handle).not.toBeNull();

    expect(door.leafSwing!.rotationZ).toBeCloseTo(wallRotation - DOOR_SWING_ANGLE, 9);
    expect(door.leafSwing!.width).toBe(door.leaf!.width);
    expect(door.leafSwing!.height).toBe(door.leaf!.height);
    expect(door.leafSwing!.center.x).not.toBeCloseTo(door.leaf!.center.x, 6);
    expect(door.leafSwing!.center.z).not.toBeCloseTo(door.leaf!.center.z, 6);
    expect(door.handle!.rotationZ).toBeCloseTo(door.leafSwing!.rotationZ, 9);
  });

  it("swings the leaf about a fixed vertical hinge so the pivot distance is preserved", () => {
    const plan = doorOn(baseWallPlan(), { width: 1, height: 2.1 });
    const model = generateBuildingModel(asBuilding(plan));
    const door = model.doors[0];
    const wall = plan.walls[0];
    const hinge = { x: wall.start.x + plan.doors[0].offset + DOOR_FRAME_WIDTH, z: -wall.start.y };
    const horizontalDistance = (point: { x: number; z: number }) => Math.hypot(point.x - hinge.x, point.z - hinge.z);
    expect(horizontalDistance(door.leaf!.center)).toBeCloseTo(horizontalDistance(door.leafSwing!.center), 6);
  });

  it("keeps the door swing consistent on rotated and diagonal walls", () => {
    const plan = doorOn(baseWallPlan({ start: { x: 0, y: 0 }, end: { x: 3, y: 4 } }), { width: 1, height: 2.1 });
    const model = generateBuildingModel(asBuilding(plan));
    const door = model.doors[0];
    const wallRotation = Math.atan2(4, 3);
    expect(door.leaf!.rotationZ).toBeCloseTo(wallRotation, 9);
    expect(door.leafSwing!.rotationZ).toBeCloseTo(wallRotation - DOOR_SWING_ANGLE, 9);
    assertNoWallInsideOpenings(model, plan);
  });

  it("frames a window with four bars and keeps the glass strictly inside the opening", () => {
    const plan = windowOn(baseWallPlan(), { width: 1.6, height: 1.2, sillHeight: 0.9 });
    const model = generateBuildingModel(asBuilding(plan));
    const win = model.windows[0];
    expect(win.frame).toHaveLength(4);
    for (const part of win.frame) expect(part.depth).toBeCloseTo(0.2, 9);
    const glass = win.glass!;
    expect(glass.width).toBeCloseTo(1.6 - 2 * WINDOW_FRAME_WIDTH, 9);
    expect(glass.height).toBeCloseTo(1.2 - 2 * WINDOW_FRAME_WIDTH, 9);
    expect(glass.center.y - glass.height / 2).toBeCloseTo(0.9 + WINDOW_FRAME_WIDTH, 9);
    assertNoWallInsideOpenings(model, plan);
  });

  it("adds a protruding sill board that is wider than and deeper than the enclosing wall", () => {
    const plan = windowOn(baseWallPlan(), { width: 1.6, height: 1.2, sillHeight: 0.9 });
    const model = generateBuildingModel(asBuilding(plan));
    const sill = model.windows[0].sill!;
    expect(sill).not.toBeNull();
    expect(sill.width).toBeCloseTo(1.6 + 2 * WINDOW_SILL_OVERHANG, 9);
    expect(sill.depth).toBeCloseTo(0.2 + 2 * WINDOW_SILL_PROTRUSION, 9);
    expect(sill.height).toBeCloseTo(WINDOW_SILL_THICKNESS, 9);
    expect(sill.center.y - sill.height / 2).toBeCloseTo(0.9 - WINDOW_SILL_THICKNESS, 9);
    expect(sill.center.y + sill.height / 2).toBeCloseTo(0.9, 9);
    expect(sill.rotationZ).toBeCloseTo(Math.atan2(plan.walls[0].end.y - plan.walls[0].start.y, plan.walls[0].end.x - plan.walls[0].start.x), 9);
    assertNoWallInsideOpenings(model, plan);
  });

  it("aligns the sill and the window frame on a rotated wall", () => {
    const plan = windowOn(baseWallPlan({ start: { x: 0, y: 0 }, end: { x: 3, y: 4 } }), { width: 1.4, height: 1.2, sillHeight: 0.9 });
    const model = generateBuildingModel(asBuilding(plan));
    const win = model.windows[0];
    const wallRotation = Math.atan2(4, 3);
    expect(win.sill!.rotationZ).toBeCloseTo(wallRotation, 9);
    for (const part of win.frame) expect(part.rotationZ).toBeCloseTo(wallRotation, 9);
    expect(win.glass!.rotationZ).toBeCloseTo(wallRotation, 9);
    assertNoWallInsideOpenings(model, plan);
  });

  it("keeps the real openings empty on a wall with door, window and sill combinations", () => {
    const plan = baseWallPlan({ end: { x: 8, y: 0 } });
    plan.doors.push({ id: "door-1", wallId: "wall-a", offset: 0.5, width: 1, height: 2.1 });
    plan.windows.push({ id: "window-1", wallId: "wall-a", offset: 2, width: 1.2, height: 1, sillHeight: 0.9 });
    plan.doors.push({ id: "door-2", wallId: "wall-a", offset: 3.6, width: 0.9, height: 2.1 });
    plan.windows.push({ id: "window-2", wallId: "wall-a", offset: 5, width: 0.8, height: 1, sillHeight: 1 });
    const model = generateBuildingModel(asBuilding(plan));
    assertNoWallInsideOpenings(model, plan);
    expect(model.windows.every((window) => window.sill)).toBe(true);
    expect(model.doors.every((door) => door.leafSwing && door.handle)).toBe(true);
  });
});

const measurementOf = (model: ReturnType<typeof generateBuildingModel>, subjectId: string, kind: string) =>
  model.measurements.find((measurement) => measurement.subjectId === subjectId && measurement.kind === kind)!;

const orientedDirection = (measurement: { start: { x: number; y: number; z: number }; end: { x: number; y: number; z: number } }) => {
  const dx = measurement.end.x - measurement.start.x;
  const dy = measurement.end.y - measurement.start.y;
  const dz = measurement.end.z - measurement.start.z;
  const length = Math.hypot(dx, dy, dz);
  return { x: dx / length, y: dy / length, z: dz / length };
};

const dot = (first: { x: number; y: number; z: number }, second: { x: number; y: number; z: number }) =>
  first.x * second.x + first.y * second.y + first.z * second.z;

describe("orientation-aware measurement rendering", () => {
  it("axis-aligned room: width follows principal X, length follows principal Z/Y", () => {
    const model = generateBuildingModel(asBuilding(axisAlignedPlan()));
    const width = measurementOf(model, "axis-room", "width");
    const length = measurementOf(model, "axis-room", "length");
    expect(width.value).toBeCloseTo(6, 8);
    expect(length.value).toBeCloseTo(4, 8);

    const widthDir = orientedDirection(width);
    const lengthDir = orientedDirection(length);
    expect(Math.abs(widthDir.x)).toBeCloseTo(1, 6);
    expect(Math.abs(widthDir.z)).toBeCloseTo(0, 6);
    expect(Math.abs(lengthDir.z)).toBeCloseTo(1, 6);
    expect(Math.abs(lengthDir.x)).toBeCloseTo(0, 6);
    expect(dot(widthDir, lengthDir)).toBeCloseTo(0, 6);
  });

  it("45-degree rotated room: width and length lines follow the rotated axes", () => {
    const angle = Math.PI / 4;
    const model = generateBuildingModel(asBuilding(rotatedPlan(angle)));
    const width = measurementOf(model, "room-rot", "width");
    const length = measurementOf(model, "room-rot", "length");

    expect(Math.max(width.value, length.value)).toBeCloseTo(4, 8);
    expect(Math.min(width.value, length.value)).toBeCloseTo(2, 8);

    const expectedWidth = { x: Math.cos(angle), y: 0, z: -Math.sin(angle) };
    const expectedLength = { x: -Math.sin(angle), y: 0, z: -Math.cos(angle) };
    const widthDir = orientedDirection(width);
    const lengthDir = orientedDirection(length);
    expect(widthDir.x).toBeCloseTo(expectedWidth.x, 6);
    expect(widthDir.z).toBeCloseTo(expectedWidth.z, 6);
    expect(lengthDir.x).toBeCloseTo(expectedLength.x, 6);
    expect(lengthDir.z).toBeCloseTo(expectedLength.z, 6);
    expect(dot(widthDir, lengthDir)).toBeCloseTo(0, 6);
  });

  it("arbitrarily rotated room (27 deg): width and length lines follow the rotated axes", () => {
    const angle = (27 * Math.PI) / 180;
    const model = generateBuildingModel(asBuilding(rotatedPlan(angle)));
    const width = measurementOf(model, "room-rot", "width");
    const length = measurementOf(model, "room-rot", "length");

    expect(Math.max(width.value, length.value)).toBeCloseTo(4, 8);
    expect(Math.min(width.value, length.value)).toBeCloseTo(2, 8);

    const expectedWidth = { x: Math.cos(angle), y: 0, z: -Math.sin(angle) };
    const expectedLength = { x: -Math.sin(angle), y: 0, z: -Math.cos(angle) };
    const widthDir = orientedDirection(width);
    const lengthDir = orientedDirection(length);
    expect(widthDir.x).toBeCloseTo(expectedWidth.x, 6);
    expect(widthDir.z).toBeCloseTo(expectedWidth.z, 6);
    expect(lengthDir.x).toBeCloseTo(expectedLength.x, 6);
    expect(lengthDir.z).toBeCloseTo(expectedLength.z, 6);
    expect(dot(widthDir, lengthDir)).toBeCloseTo(0, 6);
  });

  it("non-square room: width and length values are preserved and distinct", () => {
    const model = generateBuildingModel(asBuilding(rectPlan(5, 3)));
    const width = measurementOf(model, "room-a", "width");
    const length = measurementOf(model, "room-a", "length");
    expect(width.value).toBeCloseTo(5, 8);
    expect(length.value).toBeCloseTo(3, 8);
    expect(width.value).not.toBeCloseTo(length.value, 6);
    expect(dot(orientedDirection(width), orientedDirection(length))).toBeCloseTo(0, 6);
  });

  it("keeps dimension line length equal to the measured value (no world-axis distortion)", () => {
    const angle = Math.PI / 5;
    const model = generateBuildingModel(asBuilding(rotatedPlan(angle)));
    const width = measurementOf(model, "room-rot", "width");
    const length = measurementOf(model, "room-rot", "length");
    const lineLength = (m: { start: { x: number; y: number; z: number }; end: { x: number; y: number; z: number } }) =>
      Math.hypot(m.end.x - m.start.x, m.end.y - m.start.y, m.end.z - m.start.z);
    expect(lineLength(width)).toBeCloseTo(width.value, 8);
    expect(lineLength(length)).toBeCloseTo(length.value, 8);
  });

  it("offsets the room dimension lines perpendicular to their own axis by MEASUREMENT_OFFSET", () => {
    const angle = Math.PI / 6;
    const model = generateBuildingModel(asBuilding(rotatedPlan(angle)));
    const room = model.spatialElements.rooms[0];
    const width = measurementOf(model, "room-rot", "width");
    const length = measurementOf(model, "room-rot", "length");
    const centroid = { x: room.worldPosition.x, y: 0, z: room.worldPosition.z };

    const widthDir = orientedDirection(width);
    const lengthDir = orientedDirection(length);

    const widthCenter = {
      x: (width.start.x + width.end.x) / 2,
      y: 0,
      z: (width.start.z + width.end.z) / 2,
    };
    const lengthCenter = {
      x: (length.start.x + length.end.x) / 2,
      y: 0,
      z: (length.start.z + length.end.z) / 2,
    };

    const fromCentroid = (point: { x: number; z: number }) => ({ x: point.x - centroid.x, y: 0, z: point.z - centroid.z });
    const widthOffset = fromCentroid(widthCenter);
    const lengthOffset = fromCentroid(lengthCenter);

    expect(Math.abs(dot(widthOffset, lengthDir))).toBeCloseTo(1 + MEASUREMENT_OFFSET, 6);
    expect(Math.abs(dot(lengthOffset, widthDir))).toBeCloseTo(2 + MEASUREMENT_OFFSET, 6);
  });

  it("labels carry the exact formatted numeric value", () => {
    const model = generateBuildingModel(asBuilding(rectPlan(5, 3)));
    const width = measurementOf(model, "room-a", "width");
    const length = measurementOf(model, "room-a", "length");
    expect(width.label).toBe(`${width.value.toFixed(2)} m`);
    expect(length.label).toBe(`${length.value.toFixed(2)} m`);
  });

  it("measurement annotation is one oriented unit: start->end order matches the principal axis", () => {
    const angle = (40 * Math.PI) / 180;
    const model = generateBuildingModel(asBuilding(rotatedPlan(angle)));
    const width = measurementOf(model, "room-rot", "width");
    const length = measurementOf(model, "room-rot", "length");
    const expectedWidth = { x: Math.cos(angle), y: 0, z: -Math.sin(angle) };
    const expectedLength = { x: -Math.sin(angle), y: 0, z: -Math.cos(angle) };
    expect(orientedDirection(width).x).toBeCloseTo(expectedWidth.x, 6);
    expect(orientedDirection(width).z).toBeCloseTo(expectedWidth.z, 6);
    expect(orientedDirection(length).x).toBeCloseTo(expectedLength.x, 6);
    expect(orientedDirection(length).z).toBeCloseTo(expectedLength.z, 6);
  });

  it("multiple rooms with different orientations each follow their own axis", () => {
    const plan: FloorPlan2D = {
      unit: "m",
      walls: [{ id: "w0", start: { x: 0, y: 0 }, end: { x: 1, y: 0 }, thickness: 0.15, height: 2.8, kind: "exterior" }],
      doors: [],
      windows: [],
      rooms: [
        { id: "r0", name: "R0", boundary: rotatedRect(4, 2, 0, { x: 0, y: 0 }) },
        { id: "r45", name: "R45", boundary: rotatedRect(4, 2, Math.PI / 4, { x: 0, y: 0 }) },
        { id: "r27", name: "R27", boundary: rotatedRect(4, 2, (27 * Math.PI) / 180, { x: 0, y: 0 }) },
      ],
    };
    const model = generateBuildingModel(asBuilding(plan));
    for (const [roomId, angle] of [["r0", 0], ["r45", Math.PI / 4], ["r27", (27 * Math.PI) / 180]] as const) {
      const width = measurementOf(model, roomId, "width");
      const length = measurementOf(model, roomId, "length");
      expect(width.value).toBeCloseTo(4, 8);
      expect(length.value).toBeCloseTo(2, 8);
      const widthDir = orientedDirection(width);
      const lengthDir = orientedDirection(length);
      expect(widthDir.x).toBeCloseTo(Math.cos(angle), 6);
      expect(widthDir.z).toBeCloseTo(-Math.sin(angle), 6);
      expect(lengthDir.x).toBeCloseTo(-Math.sin(angle), 6);
      expect(lengthDir.z).toBeCloseTo(-Math.cos(angle), 6);
      expect(dot(widthDir, lengthDir)).toBeCloseTo(0, 6);
    }
  });

  it("rotated wall length measurement follows the wall segment direction and length", () => {
    const wall = { id: "wall-a", start: { x: 0, y: 0 }, end: { x: 3, y: 4 }, thickness: 0.2, height: 2.8, kind: "exterior" as const };
    const plan: FloorPlan2D = { unit: "m", walls: [wall], doors: [], windows: [], rooms: [] };
    const model = generateBuildingModel(asBuilding(plan));
    const length = measurementOf(model, "wall-a", "length");
    expect(length.value).toBeCloseTo(5, 8);
    const direction = orientedDirection(length);
    const rotation = Math.atan2(4, 3);
    expect(direction.x).toBeCloseTo(Math.cos(rotation), 6);
    expect(direction.z).toBeCloseTo(-Math.sin(rotation), 6);
  });

  it("rotated wall thickness measurement is perpendicular to the wall", () => {
    const wall = { id: "wall-a", start: { x: 0, y: 0 }, end: { x: 3, y: 4 }, thickness: 0.2, height: 2.8, kind: "exterior" as const };
    const plan: FloorPlan2D = { unit: "m", walls: [wall], doors: [], windows: [], rooms: [] };
    const model = generateBuildingModel(asBuilding(plan));
    const thickness = measurementOf(model, "wall-a", "thickness");
    expect(thickness.value).toBeCloseTo(0.2, 8);
    const thicknessDir = orientedDirection(thickness);
    const rotation = Math.atan2(4, 3);
    const wallDir = { x: Math.cos(rotation), y: 0, z: -Math.sin(rotation) };
    expect(dot(thicknessDir, wallDir)).toBeCloseTo(0, 6);
    const lineLength = (m: { start: { x: number; y: number; z: number }; end: { x: number; y: number; z: number } }) =>
      Math.hypot(m.end.x - m.start.x, m.end.y - m.start.y, m.end.z - m.start.z);
    expect(lineLength(thickness)).toBeCloseTo(0.2, 8);
  });

  it("door width measurement follows the host wall orientation", () => {
    const wall = { id: "wall-a", start: { x: 0, y: 0 }, end: { x: 3, y: 4 }, thickness: 0.2, height: 2.8, kind: "exterior" as const };
    const plan: FloorPlan2D = {
      unit: "m",
      walls: [wall],
      doors: [{ id: "door-1", wallId: "wall-a", offset: 1, width: 1, height: 2.1 }],
      windows: [],
      rooms: [],
    };
    const model = generateBuildingModel(asBuilding(plan));
    const width = measurementOf(model, "door-1", "width");
    expect(width.value).toBeCloseTo(1, 8);
    const direction = orientedDirection(width);
    const rotation = Math.atan2(4, 3);
    expect(direction.x).toBeCloseTo(Math.cos(rotation), 6);
    expect(direction.z).toBeCloseTo(-Math.sin(rotation), 6);
  });
});
