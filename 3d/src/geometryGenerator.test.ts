import { describe, expect, it } from "vitest";
import { demoBuilding, type Building, type FloorPlan2D } from "./floorPlan";
import { FloorPlanValidationError, generateBuildingModel, validateFloorPlan, wallLength } from "./geometryGenerator";

const baseWallPlan = (wallOverrides: Partial<FloorPlan2D["walls"][number]> = {}): FloorPlan2D => ({
  unit: "m",
  walls: [{ id: "wall-a", start: { x: 0, y: 0 }, end: { x: 5, y: 0 }, thickness: 0.2, height: 2.8, kind: "exterior", ...wallOverrides }],
  doors: [], windows: [], rooms: [{ id: "room", name: "Room", boundary: [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 4 }, { x: 0, y: 4 }] }],
});

const asBuilding = (plan: FloorPlan2D, elevation = 0): Building => ({
  unit: "m", floors: [{ id: "test-floor", name: "Test Floor", elevation, floorToFloorHeight: 2.8, plan }], stairs: [], roof: { id: "test-roof", floorId: "test-floor", height: 0.3 },
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
