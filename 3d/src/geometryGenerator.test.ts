import { describe, expect, it } from "vitest";
import { demoBuilding, type Building, type FloorPlan2D } from "./floorPlan";
import { FloorPlanValidationError, generateBuildingModel, validateFloorPlan, wallLength } from "./geometryGenerator";
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
