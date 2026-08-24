import { describe, expect, it } from "vitest";
import { demoFloorPlan, type FloorPlan2D } from "./floorPlan";
import { generateBuildingModel, wallLength } from "./geometryGenerator";

const fiveMeterWallPlan: FloorPlan2D = {
  unit: "m",
  walls: [{ id: "wall", start: { x: 0, y: 0 }, end: { x: 5, y: 0 }, thickness: 0.2, height: 2.8, kind: "exterior" }],
  doors: [],
  windows: [],
  rooms: [{ id: "room", name: "Test room", boundary: [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 4 }, { x: 0, y: 4 }] }],
};

describe("generateBuildingModel", () => {
  it("preserves an exact 5 m wall, thickness, and height", () => {
    const wall = fiveMeterWallPlan.walls[0];
    const model = generateBuildingModel(fiveMeterWallPlan);

    expect(wallLength(wall)).toBe(5);
    expect(model.wallBoxes).toHaveLength(1);
    expect(model.wallBoxes[0]).toMatchObject({ length: 5, thickness: 0.2, height: 2.8 });
  });

  it("preserves door and window widths in the canonical 3D model", () => {
    const model = generateBuildingModel(demoFloorPlan);

    expect(model.openings.find((opening) => opening.id === "living-bedroom")).toMatchObject({ type: "door", width: 0.9 });
    expect(model.openings.find((opening) => opening.id === "living-window")).toMatchObject({ type: "window", width: 1.8 });
  });

  it("preserves room boundaries and floor area", () => {
    const model = generateBuildingModel(fiveMeterWallPlan);

    expect(model.floors[0]).toMatchObject({ roomId: "room", vertices: fiveMeterWallPlan.rooms[0].boundary, area: 20 });
  });

  it("returns identical serializable geometry for identical input", () => {
    expect(generateBuildingModel(demoFloorPlan)).toEqual(generateBuildingModel(demoFloorPlan));
  });
});