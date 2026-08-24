import type { Door2D, FloorPlan2D, Point2D, Wall2D, Window2D } from "./floorPlan";

export type WallBox3D = {
  id: string;
  sourceWallId: string;
  kind: Wall2D["kind"];
  center: { x: number; y: number; z: number };
  length: number;
  thickness: number;
  height: number;
  rotationZ: number;
};

export type FloorSurface3D = {
  roomId: string;
  vertices: Point2D[];
  area: number;
};

export type Opening3D = {
  id: string;
  wallId: string;
  type: "door" | "window";
  offset: number;
  width: number;
  height: number;
  sillHeight: number;
};

export type BuildingModel3D = {
  unit: "m";
  wallBoxes: WallBox3D[];
  floors: FloorSurface3D[];
  openings: Opening3D[];
};

type WallOpening = Door2D | Window2D;

const distance = (start: Point2D, end: Point2D) => Math.hypot(end.x - start.x, end.y - start.y);

const pointAlongWall = (wall: Wall2D, offset: number): Point2D => {
  const length = distance(wall.start, wall.end);
  return {
    x: wall.start.x + ((wall.end.x - wall.start.x) * offset) / length,
    y: wall.start.y + ((wall.end.y - wall.start.y) * offset) / length,
  };
};

const polygonArea = (vertices: Point2D[]) => Math.abs(vertices.reduce((area, point, index) => {
  const next = vertices[(index + 1) % vertices.length];
  return area + point.x * next.y - next.x * point.y;
}, 0) / 2);

const openingSillHeight = (opening: WallOpening) => "sillHeight" in opening ? opening.sillHeight : 0;

const createWallBox = (wall: Wall2D, startOffset: number, endOffset: number, baseHeight: number, height: number, index: number): WallBox3D | null => {
  const length = endOffset - startOffset;
  if (length <= 0 || height <= 0) return null;

  const start = pointAlongWall(wall, startOffset);
  const end = pointAlongWall(wall, endOffset);
  return {
    id: `${wall.id}-${index}`,
    sourceWallId: wall.id,
    kind: wall.kind,
    center: { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2, z: baseHeight + height / 2 },
    length,
    thickness: wall.thickness,
    height,
    rotationZ: Math.atan2(wall.end.y - wall.start.y, wall.end.x - wall.start.x),
  };
};

const generateWallBoxes = (wall: Wall2D, openings: WallOpening[]): WallBox3D[] => {
  const wallLength = distance(wall.start, wall.end);
  const sortedOpenings = openings.slice().sort((first, second) => first.offset - second.offset);
  const boxes: WallBox3D[] = [];
  let cursor = 0;
  let index = 0;

  for (const opening of sortedOpenings) {
    if (opening.offset < cursor || opening.offset + opening.width > wallLength) {
      throw new Error(`Opening ${opening.id} is outside wall ${wall.id}`);
    }
    const before = createWallBox(wall, cursor, opening.offset, 0, wall.height, index++);
    if (before) boxes.push(before);

    const sillHeight = openingSillHeight(opening);
    const below = createWallBox(wall, opening.offset, opening.offset + opening.width, 0, sillHeight, index++);
    if (below) boxes.push(below);

    const aboveHeight = wall.height - sillHeight - opening.height;
    const above = createWallBox(wall, opening.offset, opening.offset + opening.width, sillHeight + opening.height, aboveHeight, index++);
    if (above) boxes.push(above);
    cursor = opening.offset + opening.width;
  }

  const after = createWallBox(wall, cursor, wallLength, 0, wall.height, index++);
  if (after) boxes.push(after);
  return boxes;
};

export const generateBuildingModel = (floorPlan: FloorPlan2D): BuildingModel3D => {
  const openingsByWall = new Map<string, WallOpening[]>();
  for (const opening of [...floorPlan.doors, ...floorPlan.windows]) {
    const matches = openingsByWall.get(opening.wallId) ?? [];
    matches.push(opening);
    openingsByWall.set(opening.wallId, matches);
  }

  return {
    unit: floorPlan.unit,
    wallBoxes: floorPlan.walls.flatMap((wall) => generateWallBoxes(wall, openingsByWall.get(wall.id) ?? [])),
    floors: floorPlan.rooms.map((room) => ({ roomId: room.id, vertices: room.boundary, area: polygonArea(room.boundary) })),
    openings: [
      ...floorPlan.doors.map((door) => ({ ...door, type: "door" as const, sillHeight: 0 })),
      ...floorPlan.windows.map((window) => ({ ...window, type: "window" as const })),
    ],
  };
};

export const wallLength = (wall: Wall2D) => distance(wall.start, wall.end);