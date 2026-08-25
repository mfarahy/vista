import { describe, expect, it } from "vitest";
import { demoBuilding, type Building, type FloorPlan2D, type Point2D } from "./floorPlan";
import { FloorPlanValidationError, generateBuildingModel, validateFloorPlan, wallLength, buildWallSegments } from "./geometryGenerator";
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
