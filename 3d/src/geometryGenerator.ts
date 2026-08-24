import type { Building, Door2D, Floor2D, FloorPlan2D, Point2D, Roof2D, Stair2D, Wall2D, Window2D } from "./floorPlan";
import { buildOpenPlan3DWallSegments, toOpenPlan3DProject } from "./openPlan3D";

export type WallBox3D = {
  id: string;
  floorId: string;
  sourceWallId: string;
  kind: Wall2D["kind"];
  center: { x: number; y: number; z: number };
  length: number;
  thickness: number;
  height: number;
  rotationZ: number;
};

export type FloorSurface3D = {
  floorId: string;
  roomId: string;
  vertices: Point2D[];
  area: number;
  elevation: number;
};

export type Opening3D = {
  id: string;
  floorId: string;
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

export type StairBox3D = {
  id: string;
  stairId: string;
  sourceFloorId: string;
  targetFloorId: string;
  center: { x: number; y: number; z: number };
  width: number;
  length: number;
  height: number;
  step: number;
};

export type Roof3D = {
  id: string;
  floorId: string;
  center: { x: number; y: number; z: number };
  width: number;
  length: number;
  height: number;
};

export type BuildingModel3D = {
  unit: "m";
  wallBoxes: WallBox3D[];
  floors: FloorSurface3D[];
  openings: Opening3D[];
  stairs: StairBox3D[];
  roof: Roof3D;
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

const createWallBox = (floorId: string, elevation: number, wall: Wall2D, startOffset: number, endOffset: number, baseHeight: number, height: number, index: number): WallBox3D | null => {
  const length = endOffset - startOffset;
  if (length <= EPSILON || height <= EPSILON) return null;

  const start = pointAlongWall(wall, startOffset);
  const end = pointAlongWall(wall, endOffset);
  return {
    id: `${wall.id}-${index}`,
    floorId,
    sourceWallId: wall.id,
    kind: wall.kind,
    center: { x: (start.x + end.x) / 2, y: elevation + baseHeight + height / 2, z: -(start.y + end.y) / 2 },
    length,
    thickness: wall.thickness,
    height,
    rotationZ: Math.atan2(wall.end.y - wall.start.y, wall.end.x - wall.start.x),
  };
};

const generateWallBoxes = (floorId: string, elevation: number, wall: Wall2D, openings: WallOpening[]): WallBox3D[] => {
  const wallLengthValue = distance(wall.start, wall.end);
  const openPlanFloor = toOpenPlan3DProject({ unit: "m", floors: [{ id: floorId, name: floorId, elevation, floorToFloorHeight: wall.height, plan: { unit: "m", walls: [wall], doors: openings.filter((opening): opening is Door2D => !("sillHeight" in opening)), windows: openings.filter((opening): opening is Window2D => "sillHeight" in opening), rooms: [] } }], stairs: [], roof: { id: "unused", floorId, height: 0 } }).floors[0];
  return buildOpenPlan3DWallSegments(wallLengthValue * 100, wall.height * 100, openPlanFloor.doors, openPlanFloor.windows).flatMap((segment, index) => {
    const startOffset = (segment.offsetX - segment.width / 2) / 100;
    return createWallBox(floorId, elevation, wall, startOffset, startOffset + segment.width / 100, segment.offsetY / 100, segment.height / 100, index) ?? [];
  });
};

const createOpening3D = (floorId: string, elevation: number, opening: NormalizedOpening, wall: Wall2D): Opening3D => {
  const center2D = pointAlongWall(wall, opening.offset + opening.width / 2);
  return {
    id: opening.id,
    floorId,
    wallId: opening.wallId,
    type: opening.type,
    offset: opening.offset,
    width: opening.width,
    height: opening.height,
    sillHeight: opening.sillHeight,
    openingDirection: opening.openingDirection,
    center: { x: center2D.x, y: elevation + opening.sillHeight + opening.height / 2, z: -center2D.y },
    rotationZ: Math.atan2(wall.end.y - wall.start.y, wall.end.x - wall.start.x),
    thickness: wall.thickness,
  };
};

const generateFloorGeometry = (floor: Floor2D) => {
  const floorPlan = floor.plan;
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
      return createOpening3D(floor.id, floor.elevation, opening, wall);
    });

  return {
    unit: floorPlan.unit,
    wallBoxes: floorPlan.walls.flatMap((wall) => generateWallBoxes(floor.id, floor.elevation, wall, openingsByWall.get(wall.id) ?? [])),
    floors: floorPlan.rooms.map((room) => ({ floorId: floor.id, roomId: room.id, vertices: room.boundary, area: polygonArea(room.boundary), elevation: floor.elevation })),
    openings,
  };
};

const createStairBoxes = (stair: Stair2D, sourceElevation: number, targetElevation: number): StairBox3D[] => {
  const stepCount = 8;
  return Array.from({ length: stepCount }, (_, index) => {
    const progress = (index + 1) / stepCount;
    return {
      id: `${stair.id}-${index}`,
      stairId: stair.id,
      sourceFloorId: stair.sourceFloorId,
      targetFloorId: stair.targetFloorId,
      center: { x: stair.position.x, y: sourceElevation + stair.height * progress / 2, z: -(stair.position.y + stair.length * (progress - 0.5)) },
      width: stair.width,
      length: stair.length / stepCount,
      height: stair.height * progress,
      step: index + 1,
    };
  });
};

export const generateBuildingModel = (building: Building): BuildingModel3D => {
  const floorIds = new Set<string>();
  for (const floor of building.floors) {
    if (floorIds.has(floor.id)) throw new FloorPlanValidationError([`Duplicate floor id '${floor.id}'.`]);
    floorIds.add(floor.id);
    if (!Number.isFinite(floor.elevation) || !Number.isFinite(floor.floorToFloorHeight) || floor.floorToFloorHeight <= 0) {
      throw new FloorPlanValidationError([`Floor '${floor.id}' must have a finite elevation and positive floor-to-floor height.`]);
    }
  }
  const generatedFloors = building.floors.map(generateFloorGeometry);
  const stairs = building.stairs.flatMap((stair) => {
    const source = building.floors.find((floor) => floor.id === stair.sourceFloorId);
    const target = building.floors.find((floor) => floor.id === stair.targetFloorId);
    if (!source || !target) throw new FloorPlanValidationError([`Stair '${stair.id}' references an unknown floor.`]);
    return createStairBoxes(stair, source.elevation, target.elevation);
  });
  const highest = building.floors.find((floor) => floor.id === building.roof.floorId);
  if (!highest) throw new FloorPlanValidationError([`Roof references an unknown floor '${building.roof.floorId}'.`]);
  return {
    unit: building.unit,
    wallBoxes: generatedFloors.flatMap((floor) => floor.wallBoxes),
    floors: generatedFloors.flatMap((floor) => floor.floors),
    openings: generatedFloors.flatMap((floor) => floor.openings),
    stairs,
    roof: { id: building.roof.id, floorId: highest.id, center: { x: 4.5, y: highest.elevation + highest.plan.walls[0].height + building.roof.height / 2, z: -3.5 }, width: 9.4, length: 7.4, height: building.roof.height },
  };
};

export const wallLength = (wall: Wall2D) => distance(wall.start, wall.end);