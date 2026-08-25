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

  it("keeps rooms attached to the correct floor", () => {
    const model = generateBuildingModel(demoBuilding);
    expect(model.floors.filter((floor) => floor.floorId === "first").map((floor) => floor.roomId)).toEqual(["first-main", "first-north", "first-east", "first-bathroom"]);
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
