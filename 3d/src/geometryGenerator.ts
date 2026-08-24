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
  openingDirection?: Door2D["openingDirection"];
  center: { x: number; y: number; z: number };
  rotationZ: number;
  thickness: number;
};

export type BuildingModel3D = {
  unit: "m";
  wallBoxes: WallBox3D[];
  floors: FloorSurface3D[];
  openings: Opening3D[];
};

type WallOpening = Door2D | Window2D;
type NormalizedOpening = {
  id: string;
  wallId: string;
  type: "door" | "window";
  offset: number;
  width: number;
  height: number;
  sillHeight: number;
  openingDirection?: Door2D["openingDirection"];
};

const EPSILON = 1e-9;

export class FloorPlanValidationError extends Error {
  readonly issues: string[];

  constructor(issues: string[]) {
    super(`Floor plan validation failed:\n${issues.map((issue) => `- ${issue}`).join("\n")}`);
    this.name = "FloorPlanValidationError";
    this.issues = issues;
  }
}

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

const asNormalizedOpening = (opening: WallOpening): NormalizedOpening => {
  if ("sillHeight" in opening) {
    return {
      id: opening.id,
      wallId: opening.wallId,
      type: "window",
      offset: opening.offset,
      width: opening.width,
      height: opening.height,
      sillHeight: opening.sillHeight,
    };
  }

  return {
    id: opening.id,
    wallId: opening.wallId,
    type: "door",
    offset: opening.offset,
    width: opening.width,
    height: opening.height,
    sillHeight: 0,
    openingDirection: opening.openingDirection,
  };
};

const compareOpenings = (first: Pick<NormalizedOpening, "offset" | "width" | "id">, second: Pick<NormalizedOpening, "offset" | "width" | "id">) => {
  if (first.offset !== second.offset) return first.offset - second.offset;
  if (first.width !== second.width) return first.width - second.width;
  return first.id.localeCompare(second.id);
};

const assertFinitePositive = (value: number, label: string, issues: string[]) => {
  if (!Number.isFinite(value) || value <= 0) issues.push(`${label} must be a positive finite number.`);
};

export const validateFloorPlan = (floorPlan: FloorPlan2D): void => {
  const issues: string[] = [];

  if (floorPlan.unit !== "m") issues.push("Floor plan unit must be meters ('m').");

  const seenWallIds = new Set<string>();
  const wallLengthById = new Map<string, number>();
  const wallById = new Map<string, Wall2D>();

  for (const wall of floorPlan.walls) {
    if (seenWallIds.has(wall.id)) issues.push(`Duplicate wall id '${wall.id}'.`);
    seenWallIds.add(wall.id);

    const length = distance(wall.start, wall.end);
    if (!Number.isFinite(length) || length <= EPSILON) issues.push(`Wall '${wall.id}' has zero length.`);
    assertFinitePositive(wall.thickness, `Wall '${wall.id}' thickness`, issues);
    assertFinitePositive(wall.height, `Wall '${wall.id}' height`, issues);

    wallLengthById.set(wall.id, length);
    wallById.set(wall.id, wall);
  }

  const openingRangesByWall = new Map<string, NormalizedOpening[]>();

  for (const opening of [...floorPlan.doors, ...floorPlan.windows].map(asNormalizedOpening)) {
    const hostWall = wallById.get(opening.wallId);
    if (!hostWall) {
      issues.push(`${opening.type} '${opening.id}' references unknown wall '${opening.wallId}'.`);
      continue;
    }

    if (!Number.isFinite(opening.offset) || opening.offset < 0) {
      issues.push(`${opening.type} '${opening.id}' offset must be >= 0.`);
    }
    assertFinitePositive(opening.width, `${opening.type} '${opening.id}' width`, issues);
    assertFinitePositive(opening.height, `${opening.type} '${opening.id}' height`, issues);
    if (opening.type === "window" && (!Number.isFinite(opening.sillHeight) || opening.sillHeight < 0)) {
      issues.push(`window '${opening.id}' sillHeight must be >= 0.`);
    }

    const hostLength = wallLengthById.get(opening.wallId) ?? 0;
    if (opening.width > hostLength + EPSILON) {
      issues.push(`${opening.type} '${opening.id}' width exceeds host wall '${opening.wallId}' length.`);
    }
    if (opening.offset + opening.width > hostLength + EPSILON) {
      issues.push(`${opening.type} '${opening.id}' extends outside host wall '${opening.wallId}'.`);
    }
    if (opening.sillHeight + opening.height > hostWall.height + EPSILON) {
      issues.push(`${opening.type} '${opening.id}' exceeds host wall '${opening.wallId}' height.`);
    }

    const openingsOnWall = openingRangesByWall.get(opening.wallId) ?? [];
    openingsOnWall.push(opening);
    openingRangesByWall.set(opening.wallId, openingsOnWall);
  }

  for (const [wallId, openings] of openingRangesByWall) {
    const sorted = openings.slice().sort(compareOpenings);
    for (let index = 1; index < sorted.length; index += 1) {
      const previous = sorted[index - 1];
      const current = sorted[index];
      if (current.offset < previous.offset + previous.width - EPSILON) {
        issues.push(
          `Openings '${previous.id}' and '${current.id}' overlap on wall '${wallId}'.`,
        );
      }
    }
  }

  for (const room of floorPlan.rooms) {
    if (room.boundary.length < 3) issues.push(`Room '${room.id}' must have at least 3 boundary points.`);
    const area = polygonArea(room.boundary);
    if (!Number.isFinite(area) || area <= EPSILON) issues.push(`Room '${room.id}' has invalid area.`);
  }

  if (issues.length > 0) throw new FloorPlanValidationError(issues);
};

const createWallBox = (wall: Wall2D, startOffset: number, endOffset: number, baseHeight: number, height: number, index: number): WallBox3D | null => {
  const length = endOffset - startOffset;
  if (length <= EPSILON || height <= EPSILON) return null;

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
  const wallLengthValue = distance(wall.start, wall.end);
  const sortedOpenings = openings.map(asNormalizedOpening).slice().sort(compareOpenings);
  const boxes: WallBox3D[] = [];
  let cursor = 0;
  let index = 0;

  for (const opening of sortedOpenings) {
    const before = createWallBox(wall, cursor, opening.offset, 0, wall.height, index++);
    if (before) boxes.push(before);

    const below = createWallBox(wall, opening.offset, opening.offset + opening.width, 0, opening.sillHeight, index++);
    if (below) boxes.push(below);

    const aboveHeight = wall.height - opening.sillHeight - opening.height;
    const above = createWallBox(wall, opening.offset, opening.offset + opening.width, opening.sillHeight + opening.height, aboveHeight, index++);
    if (above) boxes.push(above);
    cursor = opening.offset + opening.width;
  }

  const after = createWallBox(wall, cursor, wallLengthValue, 0, wall.height, index++);
  if (after) boxes.push(after);
  return boxes;
};

const createOpening3D = (opening: NormalizedOpening, wall: Wall2D): Opening3D => {
  const center2D = pointAlongWall(wall, opening.offset + opening.width / 2);
  return {
    id: opening.id,
    wallId: opening.wallId,
    type: opening.type,
    offset: opening.offset,
    width: opening.width,
    height: opening.height,
    sillHeight: opening.sillHeight,
    openingDirection: opening.openingDirection,
    center: { x: center2D.x, y: center2D.y, z: opening.sillHeight + opening.height / 2 },
    rotationZ: Math.atan2(wall.end.y - wall.start.y, wall.end.x - wall.start.x),
    thickness: wall.thickness,
  };
};

export const generateBuildingModel = (floorPlan: FloorPlan2D): BuildingModel3D => {
  validateFloorPlan(floorPlan);

  const openingsByWall = new Map<string, WallOpening[]>();
  for (const opening of [...floorPlan.doors, ...floorPlan.windows]) {
    const matches = openingsByWall.get(opening.wallId) ?? [];
    matches.push(opening);
    openingsByWall.set(opening.wallId, matches);
  }

  const wallsById = new Map(floorPlan.walls.map((wall) => [wall.id, wall]));
  const openings: Opening3D[] = [...floorPlan.doors, ...floorPlan.windows]
    .map(asNormalizedOpening)
    .map((opening) => {
      const wall = wallsById.get(opening.wallId);
      if (!wall) throw new Error(`Unknown wall '${opening.wallId}' while creating opening '${opening.id}'.`);
      return createOpening3D(opening, wall);
    });

  return {
    unit: floorPlan.unit,
    wallBoxes: floorPlan.walls.flatMap((wall) => generateWallBoxes(wall, openingsByWall.get(wall.id) ?? [])),
    floors: floorPlan.rooms.map((room) => ({ roomId: room.id, vertices: room.boundary, area: polygonArea(room.boundary) })),
    openings,
  };
};

export const wallLength = (wall: Wall2D) => distance(wall.start, wall.end);