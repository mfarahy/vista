import { describe, expect, it } from "vitest";
import { demoFloorPlan, type FloorPlan2D } from "./floorPlan";
import { FloorPlanValidationError, generateBuildingModel, validateFloorPlan, wallLength } from "./geometryGenerator";

const baseWallPlan = (wallOverrides: Partial<FloorPlan2D["walls"][number]> = {}): FloorPlan2D => ({
  unit: "m",
  walls: [
    {
      id: "wall-a",
      start: { x: 0, y: 0 },
      end: { x: 5, y: 0 },
      thickness: 0.2,
      height: 2.8,
      kind: "exterior",
      ...wallOverrides,
    },
  ],
  doors: [],
  windows: [],
  rooms: [{ id: "room", name: "Room", boundary: [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 4 }, { x: 0, y: 4 }] }],
});

describe("generateBuildingModel - walls", () => {
  it("preserves wall length, thickness, and height", () => {
    const plan = baseWallPlan();
    const wall = plan.walls[0];
    const model = generateBuildingModel(plan);

    expect(wallLength(wall)).toBe(5);
    expect(model.wallBoxes).toHaveLength(1);
    expect(model.wallBoxes[0]).toMatchObject({ length: 5, thickness: 0.2, height: 2.8 });
  });

  it("preserves wall orientation", () => {
    const plan = baseWallPlan({ start: { x: 1, y: 1 }, end: { x: 4, y: 5 } });
    const model = generateBuildingModel(plan);
    const expectedRotation = Math.atan2(4, 3);

    expect(model.wallBoxes).toHaveLength(1);
    expect(model.wallBoxes[0].rotationZ).toBeCloseTo(expectedRotation, 8);
  });
});

describe("generateBuildingModel - doors", () => {
  it("preserves door width, height, and position while creating a wall opening", () => {
    const plan = baseWallPlan();
    plan.doors.push({ id: "door-1", wallId: "wall-a", offset: 1, width: 1, height: 2.1 });

    const model = generateBuildingModel(plan);
    const door = model.openings.find((opening) => opening.id === "door-1");
    expect(door).toBeDefined();
    expect(door).toMatchObject({ type: "door", width: 1, height: 2.1, offset: 1, sillHeight: 0 });
    expect(door?.center.x).toBeCloseTo(1.5, 8);

    const doorIntervalStart = 1;
    const doorIntervalEnd = 2;
    const fullHeightBoxesOverDoor = model.wallBoxes.filter((box) => {
      if (box.sourceWallId !== "wall-a") return false;
      const boxStart = box.center.x - box.length / 2;
      const boxEnd = box.center.x + box.length / 2;
      const overlapsDoor = boxStart < doorIntervalEnd && boxEnd > doorIntervalStart;
      return overlapsDoor && Math.abs(box.height - 2.8) < 1e-9;
    });

    expect(fullHeightBoxesOverDoor).toHaveLength(0);
  });
});

describe("generateBuildingModel - windows", () => {
  it("preserves window width, height, sill height, and opening placement", () => {
    const plan = baseWallPlan();
    plan.windows.push({ id: "window-1", wallId: "wall-a", offset: 2, width: 1.2, height: 1, sillHeight: 0.9 });

    const model = generateBuildingModel(plan);
    const windowOpening = model.openings.find((opening) => opening.id === "window-1");
    expect(windowOpening).toBeDefined();
    expect(windowOpening).toMatchObject({ type: "window", width: 1.2, height: 1, sillHeight: 0.9, offset: 2 });
    expect(windowOpening?.center.z).toBeCloseTo(1.4, 8);

    const windowBandBoxes = model.wallBoxes.filter((box) => {
      if (box.sourceWallId !== "wall-a") return false;
      const boxStart = box.center.x - box.length / 2;
      const boxEnd = box.center.x + box.length / 2;
      return boxStart < 3.2 && boxEnd > 2;
    });
    expect(windowBandBoxes.some((box) => box.height > 0.99 && box.height < 1.01)).toBe(false);
  });
});

describe("generateBuildingModel - multiple openings", () => {
  it("supports multiple openings on one wall with deterministic segmentation", () => {
    const plan = baseWallPlan();
    plan.doors.push({ id: "door-a", wallId: "wall-a", offset: 0.8, width: 0.9, height: 2.1 });
    plan.windows.push({ id: "window-a", wallId: "wall-a", offset: 2.6, width: 1.1, height: 1.1, sillHeight: 0.9 });
    plan.windows.push({ id: "window-b", wallId: "wall-a", offset: 4.0, width: 0.7, height: 1.1, sillHeight: 0.9 });

    const model = generateBuildingModel(plan);
    const wallBoxes = model.wallBoxes.filter((box) => box.sourceWallId === "wall-a");

    const fullHeightSpanLengths = wallBoxes
      .filter((box) => Math.abs(box.height - 2.8) < 1e-9)
      .map((box) => box.length)
      .sort((a, b) => a - b);

    expect(fullHeightSpanLengths).toHaveLength(4);
    expect(fullHeightSpanLengths[0]).toBeCloseTo(0.3, 8);
    expect(fullHeightSpanLengths[1]).toBeCloseTo(0.3, 8);
    expect(fullHeightSpanLengths[2]).toBeCloseTo(0.8, 8);
    expect(fullHeightSpanLengths[3]).toBeCloseTo(0.9, 8);
    expect(model.openings.map((opening) => opening.id)).toEqual(["door-a", "window-a", "window-b"]);
  });

  it("rejects overlapping openings on the same wall", () => {
    const plan = baseWallPlan();
    plan.doors.push({ id: "door-a", wallId: "wall-a", offset: 1, width: 1.2, height: 2.1 });
    plan.windows.push({ id: "window-a", wallId: "wall-a", offset: 1.8, width: 1, height: 1, sillHeight: 0.9 });

    expect(() => generateBuildingModel(plan)).toThrowError(FloorPlanValidationError);
    expect(() => generateBuildingModel(plan)).toThrowError(/overlap/i);
  });
});

describe("determinism", () => {
  it("returns identical geometry for identical input", () => {
    expect(generateBuildingModel(demoFloorPlan)).toEqual(generateBuildingModel(demoFloorPlan));
  });
});

describe("validation", () => {
  it("rejects invalid dimensions, wall references, and outside ranges", () => {
    const plan = baseWallPlan({ thickness: -0.2, height: 0 });
    plan.walls.push({ id: "zero", start: { x: 1, y: 1 }, end: { x: 1, y: 1 }, thickness: 0.2, height: 2.8, kind: "interior" });
    plan.doors.push({ id: "door-x", wallId: "missing", offset: 0, width: 0.9, height: 2.1 });
    plan.windows.push({ id: "window-x", wallId: "wall-a", offset: 4.8, width: 1, height: 1.2, sillHeight: 2 });

    expect(() => validateFloorPlan(plan)).toThrowError(FloorPlanValidationError);
    expect(() => validateFloorPlan(plan)).toThrowError(/unknown wall|zero length|positive finite|extends outside|exceeds host wall/i);
  });

  it("rejects an opening wider than its host wall", () => {
    const plan = baseWallPlan();
    plan.windows.push({ id: "window-wide", wallId: "wall-a", offset: 0, width: 6, height: 1, sillHeight: 0.8 });

    expect(() => generateBuildingModel(plan)).toThrowError(/width exceeds host wall/i);
  });
});