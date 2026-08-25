import type { Building, Door2D, Floor2D, FloorPlan2D, Point2D, Roof2D, Stair2D, Wall2D, Window2D } from "./floorPlan";
import { buildOpenPlan3DWallSegments, toOpenPlan3DProject } from "./openPlan3D";

export type Vector3 = {
  x: number;
  y: number;
  z: number;
};

export type WallBox3D = {
  id: string;
  floorId: string;
  sourceWallId: string;
  kind: Wall2D["kind"];
  center: Vector3;
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

export type CeilingSurface3D = {
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
  center: Vector3;
  rotationZ: number;
  thickness: number;
};

export type StairBox3D = {
  id: string;
  stairId: string;
  sourceFloorId: string;
  targetFloorId: string;
  center: Vector3;
  width: number;
  length: number;
  height: number;
  step: number;
  rotationY: number;
};

export type Roof3D = {
  id: string;
  floorId: string;
  center: Vector3;
  width: number;
  length: number;
  height: number;
};

export type FloorSpatial = {
  id: string;
  name: string;
  elevation: number;
  floorToFloorHeight: number;
  worldPosition: Vector3;
  dimensions: { width: number; length: number };
};

export type WallSpatial = {
  id: string;
  floorId: string;
  elevation: number;
  start: Point2D;
  end: Point2D;
  length: number;
  thickness: number;
  height: number;
  worldPosition: Vector3;
  rotation: number;
  dimensions: { length: number; thickness: number; height: number };
};

export type RoomSpatial = {
  id: string;
  floorId: string;
  name: string;
  boundary: Point2D[];
  area: number;
  worldPosition: Vector3;
  dimensions: { width: number; length: number };
  /** Wall ids that bound this room, derived from the room footprint. */
  boundingWalls: string[];
};

export type DoorSpatial = {
  id: string;
  floorId: string;
  hostWallId: string;
  positionAlongWall: number;
  width: number;
  height: number;
  worldPosition: Vector3;
  rotation: number;
  dimensions: { width: number; height: number };
};

export type WindowSpatial = {
  id: string;
  floorId: string;
  hostWallId: string;
  positionAlongWall: number;
  width: number;
  height: number;
  sillHeight: number;
  worldPosition: Vector3;
  rotation: number;
  dimensions: { width: number; height: number; sillHeight: number };
};

export type BuildingSpatial = {
  id: string;
  floors: FloorSpatial[];
  walls: WallSpatial[];
  rooms: RoomSpatial[];
  doors: DoorSpatial[];
  windows: WindowSpatial[];
};

export type Measurement = {
  id: string;
  subjectType: "wall" | "room" | "door" | "window" | "floor";
  subjectId: string;
  kind: "length" | "thickness" | "height" | "width" | "area" | "sillHeight" | "elevation";
  value: number;
  unit: "m";
  axis: "horizontal" | "vertical";
  floorId: string;
  start: Vector3;
  end: Vector3;
  label: string;
};

export type BuildingModel3D = {
  unit: "m";
  wallBoxes: WallBox3D[];
  floors: FloorSurface3D[];
  ceilings: CeilingSurface3D[];
  openings: Opening3D[];
  stairs: StairBox3D[];
  roof: Roof3D;
  spatialElements: BuildingSpatial;
  measurements: Measurement[];
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

const polygonCentroid = (vertices: Point2D[]) => {
  let signedArea = 0;
  let centerX = 0;
  let centerY = 0;

  for (let index = 0; index < vertices.length; index += 1) {
    const current = vertices[index];
    const next = vertices[(index + 1) % vertices.length];
    const cross = current.x * next.y - next.x * current.y;
    signedArea += cross;
    centerX += (current.x + next.x) * cross;
    centerY += (current.y + next.y) * cross;
  }

  const area = signedArea / 2;
  return {
    x: centerX / (6 * area),
    y: centerY / (6 * area),
  };
};

const pointOnSegment = (point: Point2D, start: Point2D, end: Point2D) => {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared <= EPSILON) return false;
  const along = ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared;
  if (along < -EPSILON || along > 1 + EPSILON) return false;
  const perpendicular = (dx * (point.y - start.y) - dy * (point.x - start.x)) / Math.sqrt(lengthSquared);
  return Math.abs(perpendicular) <= EPSILON;
};

/**
 * Derives the walls that bound a room from the room's footprint and the
 * floor's wall segments. A boundary edge belongs to a wall when both of its
 * endpoints lie on that wall's segment, so the derivation is rotation-agnostic
 * and works for axis-aligned and rotated rooms alike.
 */
const roomBoundingWalls = (boundary: Point2D[], walls: Wall2D[]): Wall2D[] => {
  const ids = new Set<string>();
  for (let index = 0; index < boundary.length; index += 1) {
    const start = boundary[index];
    const end = boundary[(index + 1) % boundary.length];
    for (const wall of walls) {
      if (pointOnSegment(start, wall.start, wall.end) && pointOnSegment(end, wall.start, wall.end)) {
        ids.add(wall.id);
      }
    }
  }
  return walls.filter((wall) => ids.has(wall.id));
};

const roomHeight = (boundingWalls: Wall2D[]) => boundingWalls.reduce((height, wall) => Math.max(height, wall.height), 0);

const normalizeZero = (value: number) => (Object.is(value, -0) ? 0 : value);

/**
 * Measures a room along its own orientation rather than the world X/Y axes.
 *
 * An axis-aligned bounding box is wrong for rotated rooms and for rooms whose
 * walls are not aligned to the world axes. Instead we find the room's two
 * dominant (principal) directions from the covariance of its boundary points
 * and measure the extent of the footprint along each of those directions.
 *
 * This is exact for the axis-aligned and rotated rectangular rooms the
 * canonical model produces, and it never treats world X as "width" or world Z
 * as "depth". `width` is the extent along the first principal axis and
 * `length` the extent along the second; for axis-aligned rooms this still
 * yields the conventional width (X) and length (Y).
 */
const roomDimensions = (boundary: Point2D[]) => {
  const count = boundary.length;
  if (count < 3) return { width: 0, length: 0 };

  let centroidX = 0;
  let centroidY = 0;
  for (const point of boundary) {
    centroidX += point.x;
    centroidY += point.y;
  }
  centroidX /= count;
  centroidY /= count;

  let vxx = 0;
  let vxy = 0;
  let vyy = 0;
  for (const point of boundary) {
    const dx = point.x - centroidX;
    const dy = point.y - centroidY;
    vxx += dx * dx;
    vxy += dx * dy;
    vyy += dy * dy;
  }

  const angle = 0.5 * Math.atan2(2 * vxy, vxx - vyy);
  const primaryX = Math.cos(angle);
  const primaryY = Math.sin(angle);
  const secondaryX = -primaryY;
  const secondaryY = primaryX;

  let minPrimary = Infinity;
  let maxPrimary = -Infinity;
  let minSecondary = Infinity;
  let maxSecondary = -Infinity;
  for (const point of boundary) {
    const primary = (point.x - centroidX) * primaryX + (point.y - centroidY) * primaryY;
    const secondary = (point.x - centroidX) * secondaryX + (point.y - centroidY) * secondaryY;
    if (primary < minPrimary) minPrimary = primary;
    if (primary > maxPrimary) maxPrimary = primary;
    if (secondary < minSecondary) minSecondary = secondary;
    if (secondary > maxSecondary) maxSecondary = secondary;
  }

  return {
    width: maxPrimary - minPrimary,
    length: maxSecondary - minSecondary,
  };
};

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
        issues.push(`Openings '${previous.id}' and '${current.id}' overlap on wall '${wallId}'.`);
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
  const openPlanFloor = toOpenPlan3DProject({
    id: "wall-segment-adapter",
    unit: "m",
    floors: [{ id: floorId, name: floorId, elevation, floorToFloorHeight: wall.height, plan: { unit: "m", walls: [wall], doors: openings.filter((opening): opening is Door2D => !("sillHeight" in opening)), windows: openings.filter((opening): opening is Window2D => "sillHeight" in opening), rooms: [] } }],
    stairs: [],
    roof: { id: "unused", floorId, height: 0 },
  }).floors[0];

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

const createFloorSpatial = (floor: Floor2D): FloorSpatial => {
  const bounds = floor.plan.walls.reduce((acc, wall) => {
    const points = [wall.start, wall.end];
    return {
      minX: Math.min(acc.minX, ...points.map((point) => point.x)),
      maxX: Math.max(acc.maxX, ...points.map((point) => point.x)),
      minY: Math.min(acc.minY, ...points.map((point) => point.y)),
      maxY: Math.max(acc.maxY, ...points.map((point) => point.y)),
    };
  }, { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity });

  return {
    id: floor.id,
    name: floor.name,
    elevation: floor.elevation,
    floorToFloorHeight: floor.floorToFloorHeight,
    worldPosition: {
      x: normalizeZero((bounds.minX + bounds.maxX) / 2),
      y: normalizeZero(floor.elevation),
      z: normalizeZero(-((bounds.minY + bounds.maxY) / 2)),
    },
    dimensions: {
      width: bounds.maxX - bounds.minX,
      length: bounds.maxY - bounds.minY,
    },
  };
};

const createWallSpatial = (floor: Floor2D, wall: Wall2D): WallSpatial => {
  const start = wall.start;
  const end = wall.end;
  const rotation = Math.atan2(end.y - start.y, end.x - start.x);
  const center = { x: (start.x + end.x) / 2, y: floor.elevation + wall.height / 2, z: -((start.y + end.y) / 2) };
  const length = distance(start, end);

  return {
    id: wall.id,
    floorId: floor.id,
    elevation: floor.elevation,
    start,
    end,
    length,
    thickness: wall.thickness,
    height: wall.height,
    worldPosition: {
      x: normalizeZero(center.x),
      y: normalizeZero(center.y),
      z: normalizeZero(center.z),
    },
    rotation,
    dimensions: { length, thickness: wall.thickness, height: wall.height },
  };
};

const createRoomSpatial = (floor: Floor2D, room: FloorPlan2D["rooms"][number], walls: Wall2D[]): RoomSpatial => {
  const centroid = polygonCentroid(room.boundary);
  const boundingWalls = roomBoundingWalls(room.boundary, walls).map((wall) => wall.id);
  const dimensions = roomDimensions(room.boundary);
  return {
    id: room.id,
    floorId: floor.id,
    name: room.name,
    boundary: room.boundary,
    area: polygonArea(room.boundary),
    worldPosition: {
      x: normalizeZero(centroid.x),
      y: normalizeZero(floor.elevation),
      z: normalizeZero(-centroid.y),
    },
    dimensions,
    boundingWalls,
  };
};

const createDoorSpatial = (floor: Floor2D, door: Door2D, wall: Wall2D): DoorSpatial => {
  const center2D = pointAlongWall(wall, door.offset + door.width / 2);
  return {
    id: door.id,
    floorId: floor.id,
    hostWallId: door.wallId,
    positionAlongWall: door.offset + door.width / 2,
    width: door.width,
    height: door.height,
    worldPosition: {
      x: normalizeZero(center2D.x),
      y: normalizeZero(floor.elevation + door.height / 2),
      z: normalizeZero(-center2D.y),
    },
    rotation: Math.atan2(wall.end.y - wall.start.y, wall.end.x - wall.start.x),
    dimensions: { width: door.width, height: door.height },
  };
};

const createWindowSpatial = (floor: Floor2D, window: Window2D, wall: Wall2D): WindowSpatial => {
  const center2D = pointAlongWall(wall, window.offset + window.width / 2);
  return {
    id: window.id,
    floorId: floor.id,
    hostWallId: window.wallId,
    positionAlongWall: window.offset + window.width / 2,
    width: window.width,
    height: window.height,
    sillHeight: window.sillHeight,
    worldPosition: {
      x: normalizeZero(center2D.x),
      y: normalizeZero(floor.elevation + window.sillHeight + window.height / 2),
      z: normalizeZero(-center2D.y),
    },
    rotation: Math.atan2(wall.end.y - wall.start.y, wall.end.x - wall.start.x),
    dimensions: { width: window.width, height: window.height, sillHeight: window.sillHeight },
  };
};

const createMeasurements = (building: Building, spatial: BuildingSpatial): Measurement[] => {
  const measurements: Measurement[] = [];

  for (const floor of building.floors) {
    const floorSpatial = spatial.floors.find((entry) => entry.id === floor.id)!;
    measurements.push({
      id: `${floor.id}-elevation`,
      subjectType: "floor",
      subjectId: floor.id,
      kind: "elevation",
      value: floor.elevation,
      unit: "m",
      axis: "vertical",
      floorId: floor.id,
      start: { x: floorSpatial.worldPosition.x, y: floor.elevation, z: floorSpatial.worldPosition.z },
      end: { x: floorSpatial.worldPosition.x, y: floor.elevation + 0.25, z: floorSpatial.worldPosition.z },
      label: `${floor.elevation.toFixed(2)} m`,
    });
  }

  for (const wall of spatial.walls) {
    measurements.push({
      id: `${wall.id}-length`,
      subjectType: "wall",
      subjectId: wall.id,
      kind: "length",
      value: wall.length,
      unit: "m",
      axis: "horizontal",
      floorId: wall.floorId,
      start: { x: wall.start.x, y: wall.elevation + wall.height + 0.12, z: -wall.start.y },
      end: { x: wall.end.x, y: wall.elevation + wall.height + 0.12, z: -wall.end.y },
      label: `${wall.length.toFixed(2)} m`,
    });
    measurements.push({
      id: `${wall.id}-thickness`,
      subjectType: "wall",
      subjectId: wall.id,
      kind: "thickness",
      value: wall.thickness,
      unit: "m",
      axis: "horizontal",
      floorId: wall.floorId,
      start: { x: wall.worldPosition.x - wall.thickness / 2, y: wall.elevation + 0.12, z: wall.worldPosition.z },
      end: { x: wall.worldPosition.x + wall.thickness / 2, y: wall.elevation + 0.12, z: wall.worldPosition.z },
      label: `${wall.thickness.toFixed(2)} m`,
    });
  }

  for (const room of spatial.rooms) {
    const halfWidth = room.dimensions.width / 2;
    const halfLength = room.dimensions.length / 2;
    measurements.push({
      id: `${room.id}-area`,
      subjectType: "room",
      subjectId: room.id,
      kind: "area",
      value: room.area,
      unit: "m",
      axis: "horizontal",
      floorId: room.floorId,
      start: { x: room.worldPosition.x - halfWidth, y: room.worldPosition.y + 0.12, z: room.worldPosition.z },
      end: { x: room.worldPosition.x + halfWidth, y: room.worldPosition.y + 0.12, z: room.worldPosition.z },
      label: `${room.area.toFixed(2)} m²`,
    });
    measurements.push({
      id: `${room.id}-width`,
      subjectType: "room",
      subjectId: room.id,
      kind: "width",
      value: room.dimensions.width,
      unit: "m",
      axis: "horizontal",
      floorId: room.floorId,
      start: { x: room.worldPosition.x - halfWidth, y: room.worldPosition.y + 0.12, z: room.worldPosition.z },
      end: { x: room.worldPosition.x + halfWidth, y: room.worldPosition.y + 0.12, z: room.worldPosition.z },
      label: `${room.dimensions.width.toFixed(2)} m`,
    });
    measurements.push({
      id: `${room.id}-length`,
      subjectType: "room",
      subjectId: room.id,
      kind: "length",
      value: room.dimensions.length,
      unit: "m",
      axis: "horizontal",
      floorId: room.floorId,
      start: { x: room.worldPosition.x, y: room.worldPosition.y + 0.12, z: room.worldPosition.z - halfLength },
      end: { x: room.worldPosition.x, y: room.worldPosition.y + 0.12, z: room.worldPosition.z + halfLength },
      label: `${room.dimensions.length.toFixed(2)} m`,
    });
  }

  for (const door of spatial.doors) {
    const widthLine = {
      id: `${door.id}-width`,
      subjectType: "door" as const,
      subjectId: door.id,
      kind: "width" as const,
      value: door.width,
      unit: "m" as const,
      axis: "horizontal" as const,
      floorId: door.floorId,
      start: { x: door.worldPosition.x - door.width / 2, y: door.worldPosition.y + 0.08, z: door.worldPosition.z },
      end: { x: door.worldPosition.x + door.width / 2, y: door.worldPosition.y + 0.08, z: door.worldPosition.z },
      label: `${door.width.toFixed(2)} m`,
    };
    measurements.push(widthLine);
    measurements.push({
      id: `${door.id}-height`,
      subjectType: "door",
      subjectId: door.id,
      kind: "height",
      value: door.height,
      unit: "m",
      axis: "vertical",
      floorId: door.floorId,
      start: { x: door.worldPosition.x, y: door.worldPosition.y - door.height / 2, z: door.worldPosition.z },
      end: { x: door.worldPosition.x, y: door.worldPosition.y + door.height / 2, z: door.worldPosition.z },
      label: `${door.height.toFixed(2)} m`,
    });
  }

  for (const opening of spatial.windows) {
    measurements.push({
      id: `${opening.id}-width`,
      subjectType: "window",
      subjectId: opening.id,
      kind: "width",
      value: opening.width,
      unit: "m",
      axis: "horizontal",
      floorId: opening.floorId,
      start: { x: opening.worldPosition.x - opening.width / 2, y: opening.worldPosition.y + 0.08, z: opening.worldPosition.z },
      end: { x: opening.worldPosition.x + opening.width / 2, y: opening.worldPosition.y + 0.08, z: opening.worldPosition.z },
      label: `${opening.width.toFixed(2)} m`,
    });
    measurements.push({
      id: `${opening.id}-height`,
      subjectType: "window",
      subjectId: opening.id,
      kind: "height",
      value: opening.height,
      unit: "m",
      axis: "vertical",
      floorId: opening.floorId,
      start: { x: opening.worldPosition.x, y: opening.worldPosition.y - opening.height / 2, z: opening.worldPosition.z },
      end: { x: opening.worldPosition.x, y: opening.worldPosition.y + opening.height / 2, z: opening.worldPosition.z },
      label: `${opening.height.toFixed(2)} m`,
    });
    measurements.push({
      id: `${opening.id}-sillHeight`,
      subjectType: "window",
      subjectId: opening.id,
      kind: "sillHeight",
      value: opening.sillHeight,
      unit: "m",
      axis: "vertical",
      floorId: opening.floorId,
      start: { x: opening.worldPosition.x, y: opening.worldPosition.y - opening.height / 2 - opening.sillHeight, z: opening.worldPosition.z },
      end: { x: opening.worldPosition.x, y: opening.worldPosition.y - opening.height / 2, z: opening.worldPosition.z },
      label: `${opening.sillHeight.toFixed(2)} m`,
    });
  }

  return measurements;
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
    ceilings: floorPlan.rooms.map((room) => {
      const boundingWalls = roomBoundingWalls(room.boundary, floorPlan.walls);
      return {
        floorId: floor.id,
        roomId: room.id,
        vertices: room.boundary,
        area: polygonArea(room.boundary),
        elevation: floor.elevation + roomHeight(boundingWalls),
      };
    }),
    openings,
  };
};

export const DEFAULT_STAIR_STEP_COUNT = 8;
export const DEFAULT_STAIR_DIRECTION = Math.PI / 2;

const createStairBoxes = (stair: Stair2D, sourceElevation: number, targetElevation: number): StairBox3D[] => {
  const stepCount = stair.stepCount ?? DEFAULT_STAIR_STEP_COUNT;
  const totalRise = targetElevation - sourceElevation;
  if (!Number.isInteger(stepCount) || stepCount <= 0) return [];
  if (!Number.isFinite(totalRise) || Math.abs(totalRise) <= EPSILON) return [];
  if (!Number.isFinite(stair.width) || stair.width <= EPSILON) return [];
  if (!Number.isFinite(stair.length) || stair.length <= EPSILON) return [];

  const direction = Number.isFinite(stair.direction) ? stair.direction! : DEFAULT_STAIR_DIRECTION;
  const runX = Math.cos(direction);
  const runY = Math.sin(direction);
  const riserHeight = Math.abs(totalRise) / stepCount;
  const treadDepth = stair.length / stepCount;
  const halfRun = stair.length / 2;
  const rotationY = Math.PI / 2 - direction;

  return Array.from({ length: stepCount }, (_, index) => {
    const step = index + 1;
    const along = (index + 0.5) * treadDepth - halfRun;
    const centerX = stair.position.x + runX * along;
    const centerY = stair.position.y + runY * along;
    const top = sourceElevation + (totalRise * step) / stepCount;
    const bottom = sourceElevation + (totalRise * (step - 1)) / stepCount;
    return {
      id: `${stair.id}-${index}`,
      stairId: stair.id,
      sourceFloorId: stair.sourceFloorId,
      targetFloorId: stair.targetFloorId,
      center: { x: centerX, y: (top + bottom) / 2, z: -centerY },
      width: stair.width,
      length: treadDepth,
      height: riserHeight,
      step,
      rotationY,
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
  const spatialElements: BuildingSpatial = {
    id: building.id,
    floors: building.floors.map(createFloorSpatial),
    walls: building.floors.flatMap((floor) => floor.plan.walls.map((wall) => createWallSpatial(floor, wall))),
    rooms: building.floors.flatMap((floor) => floor.plan.rooms.map((room) => createRoomSpatial(floor, room, floor.plan.walls))),
    doors: building.floors.flatMap((floor) => floor.plan.doors.map((door) => {
      const wall = floor.plan.walls.find((entry) => entry.id === door.wallId);
      if (!wall) throw new Error(`Unknown wall '${door.wallId}' for door '${door.id}'.`);
      return createDoorSpatial(floor, door, wall);
    })),
    windows: building.floors.flatMap((floor) => floor.plan.windows.map((window) => {
      const wall = floor.plan.walls.find((entry) => entry.id === window.wallId);
      if (!wall) throw new Error(`Unknown wall '${window.wallId}' for window '${window.id}'.`);
      return createWindowSpatial(floor, window, wall);
    })),
  };

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
    ceilings: generatedFloors.flatMap((floor) => floor.ceilings),
    openings: generatedFloors.flatMap((floor) => floor.openings),
    stairs,
    roof: { id: building.roof.id, floorId: highest.id, center: { x: 4.5, y: highest.elevation + highest.plan.walls[0].height + building.roof.height / 2, z: -3.5 }, width: 9.4, length: 7.4, height: building.roof.height },
    spatialElements,
    measurements: createMeasurements(building, spatialElements),
  };
};

export const wallLength = (wall: Wall2D) => distance(wall.start, wall.end);