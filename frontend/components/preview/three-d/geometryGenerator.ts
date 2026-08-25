import type { Building, Door2D, Floor2D, FloorPlan2D, Point2D, Room2D, Roof2D, Stair2D, Wall2D, WallSegment2D, Window2D } from "./floorPlan";
import { buildOpenPlan3DWallSegments, type OpenPlan3DDoor, type OpenPlan3DWindow } from "./openPlan3D";

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

/**
 * A wall-owned architectural opening, resolved to its host junction-split wall
 * segment. This is the minimal representation an opening needs to cut a wall:
 * its horizontal extent is expressed relative to the host segment's actual
 * endpoints, and its vertical extent is expressed as world elevations.
 */
export type ArchitecturalOpening = {
  id: string;
  floorId: string;
  type: "door" | "window";
  /** Id of the canonical wall that contains the opening. */
  wallId: string;
  /** Id of the junction-split wall segment that hosts this opening. */
  segmentId: string;
  /** Start offset along the host segment measured from its start (m). */
  startOffset: number;
  /** End offset along the host segment measured from its start (m). */
  endOffset: number;
  width: number;
  height: number;
  sillHeight: number;
  /** World elevation of the opening's bottom edge. */
  bottomElevation: number;
  /** World elevation of the opening's top edge. */
  topElevation: number;
  openingDirection?: Door2D["openingDirection"];
  center: Vector3;
  rotationZ: number;
  thickness: number;
};

/** A single axis-aligned box part (frame member, leaf, glass pane) of a door or window. */
export type BoxPart3D = {
  id: string;
  center: Vector3;
  width: number;
  height: number;
  depth: number;
  rotationZ: number;
};

export type DoorGeometry3D = {
  id: string;
  floorId: string;
  hostWallId: string;
  hostSegmentId: string;
  openingDirection?: Door2D["openingDirection"];
  /** The door leaf in its closed position, filling the wall opening. This is the
   *  canonical leaf placement used by measurements and by the existing tests. */
  leaf: BoxPart3D | null;
  /** The door frame (jambs + header) occupying the real wall opening. */
  frame: BoxPart3D[];
  /**
   * The leaf repositioned as a static, gently-ajar panel about its hinge edge,
   * representing the door swing. When present the renderer draws this instead of
   * the closed `leaf`. `null` when the opening is too degenerate to swing safely.
   */
  leafSwing?: BoxPart3D | null;
  /** A small lever on the swing side of the leaf, so hinge and free edge read clearly. */
  handle?: BoxPart3D | null;
};

export type WindowGeometry3D = {
  id: string;
  floorId: string;
  hostWallId: string;
  hostSegmentId: string;
  /** Outer framing bars (left/right jambs, top header, bottom bar) that line the opening. */
  frame: BoxPart3D[];
  glass: BoxPart3D | null;
  /** A protruding sill board that runs along the wall at the bottom of the opening. */
  sill: BoxPart3D | null;
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

export type WallSegmentSpatial = WallSegment2D & {
  floorId: string;
};

export type DoorSpatial = {
  id: string;
  floorId: string;
  hostWallId: string;
  /** Id of the junction-split wall segment that hosts this door. */
  hostSegmentId: string;
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
  /** Id of the junction-split wall segment that hosts this window. */
  hostSegmentId: string;
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
  /** Junction-split wall segments with explicit endpoints (foundation for wall-owned openings). */
  wallSegments: WallSegmentSpatial[];
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
  architecturalOpenings: ArchitecturalOpening[];
  doors: DoorGeometry3D[];
  windows: WindowGeometry3D[];
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

/** Default thickness of a door frame member (m). Scaled down for narrow doors. */
export const DOOR_FRAME_WIDTH = 0.06;
/** Default thickness of a door leaf (m). Clamped to half the wall thickness. */
export const DOOR_LEAF_THICKNESS = 0.04;
/** Default thickness of a window frame member (m). Scaled down for narrow windows. */
export const WINDOW_FRAME_WIDTH = 0.06;
/** Default thickness of a window glass pane (m). Clamped to a fraction of the wall. */
export const WINDOW_GLASS_THICKNESS = 0.02;

/**
 * Static swing angle (radians) applied to every door leaf about its hinge edge,
 * matching OpenPlan3D's gently-ajar (~15°) default door. This is a static pose,
 * not an animation, and is enough to communicate the leaf, its hinge and its
 * swing direction.
 */
export const DOOR_SWING_ANGLE = 0.26;
/** Height (m) of the door handle's lever above the finished floor. */
export const DOOR_HANDLE_HEIGHT = 1.0;
/** Horizontal length (m) of the door handle lever along the leaf. */
export const DOOR_HANDLE_LENGTH = 0.12;
/** Vertical extent (m) of the door handle lever. */
export const DOOR_HANDLE_VERTICAL = 0.02;
/** Depth (m) of the door handle lever measured from the leaf face. */
export const DOOR_HANDLE_DEPTH = 0.03;
/** Inset (m) of the handle from the leaf's free (non-hinge) edge. */
export const DOOR_HANDLE_INSET = 0.12;

/** Horizontal overhang (m) of the window sill board beyond each side of the opening. */
export const WINDOW_SILL_OVERHANG = 0.08;
/** How far (m) the window sill protrudes beyond each face of the wall. */
export const WINDOW_SILL_PROTRUSION = 0.05;
/** Vertical thickness (m) of the window sill board. */
export const WINDOW_SILL_THICKNESS = 0.04;

/** Lateral gap (m) between a measured element and its dimension line, applied
 *  along the measurement's own orientation so rotated elements keep a readable
 *  separation rather than a world-axis offset. */
export const MEASUREMENT_OFFSET = 0.25;

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

/**
 * Geometric tolerance (in meters) used when detecting wall junctions.
 * Two walls are considered to meet when they intersect, or when one of their
 * endpoints lands on the other wall, within this distance. This avoids relying
 * on exact floating-point equality while still treating two walls that are
 * genuinely apart (beyond the tolerance) as non-junctions.
 */
export const JUNCTION_TOLERANCE = 1e-6;

type WallCut = { t: number; point: Point2D };

const interpolatePoint = (start: Point2D, end: Point2D, t: number): Point2D => ({
  x: start.x + (end.x - start.x) * t,
  y: start.y + (end.y - start.y) * t,
});

/**
 * Computes the intersection of two wall line segments.
 *
 * Returns the parametric `t` along the receiver wall (clamped into [0,1]) and
 * the intersection point when the segments cross or one endpoint touches the
 * other segment within `JUNCTION_TOLERANCE`; returns `null` for parallel,
 * collinear or clearly disjoint segments.
 */
const segmentIntersection = (wall: Wall2D, other: Wall2D): { t: number; point: Point2D } | null => {
  const ax = wall.end.x - wall.start.x;
  const ay = wall.end.y - wall.start.y;
  const bx = other.end.x - other.start.x;
  const by = other.end.y - other.start.y;
  const denominator = ax * by - ay * bx;
  if (Math.abs(denominator) <= EPSILON) return null;

  const dx = other.start.x - wall.start.x;
  const dy = other.start.y - wall.start.y;
  const t = (dx * by - dy * bx) / denominator;
  const u = (dx * ay - dy * ax) / denominator;

  if (t < -JUNCTION_TOLERANCE || t > 1 + JUNCTION_TOLERANCE) return null;
  if (u < -JUNCTION_TOLERANCE || u > 1 + JUNCTION_TOLERANCE) return null;

  const clampedT = Math.min(1, Math.max(0, t));
  return { t: clampedT, point: interpolatePoint(wall.start, wall.end, clampedT) };
};

/** True when a cut at parameter `t` lies strictly inside the wall (not at an endpoint). */
const isInteriorJunction = (wall: Wall2D, t: number): boolean => {
  const length = distance(wall.start, wall.end);
  const endTolerance = JUNCTION_TOLERANCE / length;
  return t > endTolerance && t < 1 - endTolerance;
};

/**
 * Finds every meaningful junction point on each wall, expressed as a parametric
 * position along that wall. A junction is recorded on a wall only when another
 * wall meets it in its interior, so:
 *  - corner joins (two walls sharing an endpoint) produce no interior cut,
 *  - a T-junction splits only the wall that is pierced, not the one that ends,
 *  - a crossing splits both walls,
 *  - several walls meeting at the same point each get a cut at that point.
 */
const detectJunctionCuts = (walls: Wall2D[]): Map<string, WallCut[]> => {
  const cuts = new Map<string, WallCut[]>();
  for (const wall of walls) cuts.set(wall.id, []);

  for (let index = 0; index < walls.length; index += 1) {
    const wall = walls[index];
    for (let otherIndex = index + 1; otherIndex < walls.length; otherIndex += 1) {
      const other = walls[otherIndex];

      const hitWall = segmentIntersection(wall, other);
      if (hitWall && isInteriorJunction(wall, hitWall.t)) {
        cuts.get(wall.id)!.push({ t: hitWall.t, point: hitWall.point });
      }

      const hitOther = segmentIntersection(other, wall);
      if (hitOther && isInteriorJunction(other, hitOther.t)) {
        cuts.get(other.id)!.push({ t: hitOther.t, point: hitOther.point });
      }
    }
  }

  return cuts;
};

/** Maps each room boundary edge to the segment it lies on and assigns room ids. */
const assignRoomIds = (segments: WallSegment2D[], rooms: Room2D[]): void => {
  if (rooms.length === 0) return;
  for (const segment of segments) {
    const roomIds: string[] = [];
    for (const room of rooms) {
      for (let edge = 0; edge < room.boundary.length; edge += 1) {
        const start = room.boundary[edge];
        const end = room.boundary[(edge + 1) % room.boundary.length];
        if (pointOnSegment(start, segment.start, segment.end) && pointOnSegment(end, segment.start, segment.end)) {
          roomIds.push(room.id);
          break;
        }
      }
    }
    segment.roomIds = roomIds.sort();
  }
};

/**
 * Splits every wall of a floor at its meaningful junctions into clean,
 * contiguous `WallSegment2D` pieces with explicit endpoints. The segments keep
 * the parent wall's location, thickness, height and kind; consecutive segments
 * of a wall tile it exactly so the total length is preserved within tolerance.
 */
export const buildWallSegments = (walls: Wall2D[], rooms: Room2D[] = []): WallSegment2D[] => {
  const cuts = detectJunctionCuts(walls);
  const segments: WallSegment2D[] = [];

  for (const wall of walls) {
    const length = distance(wall.start, wall.end);
    const wallCuts = cuts.get(wall.id) ?? [];

    const cutParameters = wallCuts.map((cut) => Math.min(1, Math.max(0, cut.t)));
    cutParameters.push(0, 1);
    cutParameters.sort((first, second) => first - second);

    const uniqueParameters: number[] = [];
    const relativeTolerance = JUNCTION_TOLERANCE / length;
    for (const parameter of cutParameters) {
      const previous = uniqueParameters[uniqueParameters.length - 1];
      if (previous === undefined || Math.abs(parameter - previous) > relativeTolerance) {
        uniqueParameters.push(parameter);
      }
    }

    for (let index = 0; index < uniqueParameters.length - 1; index += 1) {
      const startT = uniqueParameters[index];
      const endT = uniqueParameters[index + 1];
      if (endT - startT <= relativeTolerance) continue;

      const start = interpolatePoint(wall.start, wall.end, startT);
      const end = interpolatePoint(wall.start, wall.end, endT);
      segments.push({
        id: `${wall.id}-seg-${index}`,
        sourceWallId: wall.id,
        kind: wall.kind,
        start,
        end,
        length: (endT - startT) * length,
        thickness: wall.thickness,
        height: wall.height,
        startOffset: startT * length,
        endOffset: endT * length,
        roomIds: [],
      });
    }
  }

  assignRoomIds(segments, rooms);
  return segments;
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
 * as "depth". `width` is the extent along the first principal axis (`primary`)
 * and `length` the extent along the second (`secondary`); for axis-aligned
 * rooms this still yields the conventional width (X) and length (Y).
 *
 * The returned `primary`/`secondary` unit directions let measurement rendering
 * draw annotation lines along the room's actual orientation instead of the
 * world axes, so a rotated room's width/length measurements rotate with it.
 */
type RoomExtents = {
  width: number;
  length: number;
  /** Unit direction of the primary (width) axis in planar coordinates. */
  primary: Point2D;
  /** Unit direction of the secondary (length) axis in planar coordinates. */
  secondary: Point2D;
};

const roomExtents = (boundary: Point2D[]): RoomExtents => {
  const count = boundary.length;
  if (count < 3) return { width: 0, length: 0, primary: { x: 1, y: 0 }, secondary: { x: 0, y: 1 } };

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
    primary: { x: primaryX, y: primaryY },
    secondary: { x: secondaryX, y: secondaryY },
  };
};

const roomDimensions = (boundary: Point2D[]) => {
  const { width, length } = roomExtents(boundary);
  return { width, length };
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

const generateWallBoxes = (floorId: string, elevation: number, wall: Wall2D, openings: WallOpening[], segments: WallSegment2D[]): WallBox3D[] => {
  const boxes: WallBox3D[] = [];
  let index = 0;

  for (const segment of segments) {
    const segmentStart = segment.startOffset;
    const segmentEnd = segment.endOffset;
    const segmentLength = segment.length;

    const subDoors: OpenPlan3DDoor[] = [];
    const subWindows: OpenPlan3DWindow[] = [];

    for (const opening of openings) {
      const openingStart = opening.offset;
      const openingEnd = opening.offset + opening.width;
      const localStart = Math.max(0, openingStart - segmentStart);
      const localEnd = Math.min(segmentLength, openingEnd - segmentStart);
      const localWidth = localEnd - localStart;
      if (localWidth <= EPSILON) continue;
      const localCenter = ((localStart + localEnd) / 2) / segmentLength;

      if ("sillHeight" in opening) {
        subWindows.push({
          id: opening.id,
          wallId: wall.id,
          position: localCenter,
          width: localWidth * 100,
          height: opening.height * 100,
          sillHeight: opening.sillHeight * 100,
          type: "standard",
        });
      } else {
        subDoors.push({
          id: opening.id,
          wallId: wall.id,
          position: localCenter,
          width: localWidth * 100,
          height: opening.height * 100,
          type: "single",
          swingDirection: opening.openingDirection === "right" ? "right" : "left",
          flipSide: opening.openingDirection === "outward",
        });
      }
    }

    const openPlanSegments = buildOpenPlan3DWallSegments(segmentLength * 100, wall.height * 100, subDoors, subWindows);
    for (const part of openPlanSegments) {
      const partStartOffset = segmentStart + (part.offsetX - part.width / 2) / 100;
      const partEndOffset = segmentStart + (part.offsetX + part.width / 2) / 100;
      const box = createWallBox(floorId, elevation, wall, partStartOffset, partEndOffset, part.offsetY / 100, part.height / 100, index);
      if (box) {
        boxes.push(box);
        index += 1;
      }
    }
  }

  return boxes;
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

const segmentUnitDirection = (segment: WallSegment2D): Point2D => {
  const length = distance(segment.start, segment.end);
  return { x: (segment.end.x - segment.start.x) / length, y: (segment.end.y - segment.start.y) / length };
};

const pointAtSegmentOffset = (segment: WallSegment2D, offset: number): Point2D => {
  const direction = segmentUnitDirection(segment);
  return { x: segment.start.x + direction.x * offset, y: segment.start.y + direction.y * offset };
};

/**
 * Resolves the junction-split wall segment that owns an opening. Prefers the
 * segment that contains the opening's centre, otherwise the segment with the
 * largest overlap. Because validation keeps openings inside their host wall and
 * segments tile their wall contiguously, a host segment always exists.
 */
const resolveHostSegment = (segments: WallSegment2D[], offset: number, width: number): WallSegment2D => {
  if (segments.length === 0) throw new Error("Cannot resolve an opening host: host wall has no segments.");
  const center = offset + width / 2;

  let best = segments[0];
  let bestOverlap = -1;
  for (const segment of segments) {
    const overlap = Math.min(offset + width, segment.endOffset) - Math.max(offset, segment.startOffset);
    if (overlap > bestOverlap) {
      bestOverlap = overlap;
      best = segment;
    }
  }

  const containing = segments.filter((segment) => center >= segment.startOffset - EPSILON && center <= segment.endOffset + EPSILON);
  if (containing.length > 0) {
    best = containing.reduce((first, second) => (first.endOffset - first.startOffset >= second.endOffset - second.startOffset ? first : second));
  }

  return best;
};

const createBoxPart = (
  id: string,
  segment: WallSegment2D,
  elevation: number,
  rotationZ: number,
  alongOffset: number,
  width: number,
  localBottom: number,
  height: number,
  depth: number,
): BoxPart3D | null => {
  if (width <= EPSILON || height <= EPSILON || depth <= EPSILON) return null;
  if (!Number.isFinite(width) || !Number.isFinite(height) || !Number.isFinite(depth) || !Number.isFinite(alongOffset) || !Number.isFinite(localBottom)) return null;
  const point = pointAtSegmentOffset(segment, alongOffset + width / 2);
  return {
    id,
    center: { x: point.x, y: elevation + localBottom + height / 2, z: -point.y },
    width,
    height,
    depth,
    rotationZ,
  };
};

const createArchitecturalOpening = (floorId: string, elevation: number, opening: NormalizedOpening, segment: WallSegment2D): ArchitecturalOpening => {
  const openingStart = opening.offset;
  const openingEnd = opening.offset + opening.width;
  const localStart = Math.max(0, openingStart - segment.startOffset);
  const localEnd = Math.min(segment.length, openingEnd - segment.startOffset);
  const bottomElevation = elevation + opening.sillHeight;
  const topElevation = bottomElevation + opening.height;
  const rotationZ = Math.atan2(segment.end.y - segment.start.y, segment.end.x - segment.start.x);
  const centerPoint = pointAtSegmentOffset(segment, (localStart + localEnd) / 2);
  return {
    id: opening.id,
    floorId,
    type: opening.type,
    wallId: opening.wallId,
    segmentId: segment.id,
    startOffset: localStart,
    endOffset: localEnd,
    width: localEnd - localStart,
    height: opening.height,
    sillHeight: opening.sillHeight,
    bottomElevation,
    topElevation,
    openingDirection: opening.openingDirection,
    center: { x: centerPoint.x, y: (bottomElevation + topElevation) / 2, z: -centerPoint.y },
    rotationZ,
    thickness: segment.thickness,
  };
};

/**
 * Rotates a point around a vertical (world Y) axis passing through `pivot` by
 * `angle` radians. Both the wall rotation and the door swing are rotations about
 * the vertical axis, so they combine into the single `rotationZ` quantity that
 * `BoxPart3D` carries and the renderer applies as a Y rotation.
 */
const rotateAboutVertical = (point: Vector3, pivot: Vector3, angle: number): Vector3 => {
  const dx = point.x - pivot.x;
  const dz = point.z - pivot.z;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return {
    x: pivot.x + dx * cos + dz * sin,
    y: point.y,
    z: pivot.z - dx * sin + dz * cos,
  };
};

/**
 * Builds the swung leaf and its handle for a door.
 *
 * Hinge convention: the canonical `openingDirection` ("left"/"right"/"inward"/
 * "outward") does not reliably encode a hinge side, so in keeping with the phase
 * requirements Vista deliberately avoids inventing per-door hinge data. A single
 * deterministic convention is used: the hinge sits on the leaf's near edge in the
 * wall-running direction, and every door renders as gently ajar by
 * `DOOR_SWING_ANGLE`. Because the pivot and swing are always expressed in the
 * host segment's own local frame, the result stays consistent on world-axis,
 * 45-degree and arbitrary rotated walls and is never mirrored incorrectly.
 */
const createDoorSwing = (
  closedLeaf: BoxPart3D,
  segment: WallSegment2D,
  elevation: number,
  opening: NormalizedOpening,
  rotationZ: number,
): { leafSwing: BoxPart3D; handle: BoxPart3D } | null => {
  if (!Number.isFinite(opening.height) || opening.height <= EPSILON) return null;

  const swing = DOOR_SWING_ANGLE;
  const frameWidth = Math.min(DOOR_FRAME_WIDTH, Math.max(0.02, opening.width * 0.15));
  const localStart = opening.offset - segment.startOffset;

  const hingePoint2D = pointAtSegmentOffset(segment, localStart + frameWidth);
  const hinge: Vector3 = { x: hingePoint2D.x, y: elevation + opening.height / 2, z: -hingePoint2D.y };

  const leafSwing: BoxPart3D = {
    id: `${opening.id}-leaf-swing`,
    center: rotateAboutVertical(closedLeaf.center, hinge, swing),
    width: closedLeaf.width,
    height: closedLeaf.height,
    depth: closedLeaf.depth,
    rotationZ: rotationZ - swing,
  };

  const freeEdgeLocal = localStart + opening.width - frameWidth;
  const handleAlong = Math.max(localStart + frameWidth, freeEdgeLocal - DOOR_HANDLE_INSET);
  const handlePoint2D = pointAtSegmentOffset(segment, handleAlong);
  const normalX = -Math.sin(rotationZ);
  const normalZ = Math.cos(rotationZ);
  const handleOffset = closedLeaf.depth / 2 + DOOR_HANDLE_DEPTH / 2;
  const handleCenterClosed: Vector3 = {
    x: handlePoint2D.x + normalX * handleOffset,
    y: elevation + DOOR_HANDLE_HEIGHT,
    z: -handlePoint2D.y + normalZ * handleOffset,
  };

  const handle: BoxPart3D = {
    id: `${opening.id}-handle`,
    center: rotateAboutVertical(handleCenterClosed, hinge, swing),
    width: DOOR_HANDLE_LENGTH,
    height: DOOR_HANDLE_VERTICAL,
    depth: DOOR_HANDLE_DEPTH,
    rotationZ: rotationZ - swing,
  };

  return { leafSwing, handle };
};

const createDoorGeometry = (floorId: string, elevation: number, opening: NormalizedOpening, segment: WallSegment2D): DoorGeometry3D => {
  const rotationZ = Math.atan2(segment.end.y - segment.start.y, segment.end.x - segment.start.x);
  const localStart = opening.offset - segment.startOffset;
  const frameWidth = Math.min(DOOR_FRAME_WIDTH, Math.max(0.02, opening.width * 0.15));
  const leafThickness = Math.min(DOOR_LEAF_THICKNESS, Math.max(0.02, segment.thickness * 0.5));
  const leafWidth = opening.width - 2 * frameWidth;

  const frame = [
    createBoxPart(`${opening.id}-jamb-left`, segment, elevation, rotationZ, localStart, frameWidth, 0, opening.height, segment.thickness),
    createBoxPart(`${opening.id}-jamb-right`, segment, elevation, rotationZ, localStart + opening.width - frameWidth, frameWidth, 0, opening.height, segment.thickness),
    createBoxPart(`${opening.id}-header`, segment, elevation, rotationZ, localStart, opening.width, opening.height - frameWidth, frameWidth, segment.thickness),
  ].filter((part): part is BoxPart3D => part !== null);

  const leaf = createBoxPart(`${opening.id}-leaf`, segment, elevation, rotationZ, localStart + frameWidth, leafWidth, 0, opening.height, leafThickness);

  let leafSwing: BoxPart3D | null = null;
  let handle: BoxPart3D | null = null;
  if (leaf) {
    const swing = createDoorSwing(leaf, segment, elevation, opening, rotationZ);
    if (swing) {
      leafSwing = swing.leafSwing;
      handle = swing.handle;
    }
  }

  return {
    id: opening.id,
    floorId,
    hostWallId: opening.wallId,
    hostSegmentId: segment.id,
    openingDirection: opening.openingDirection,
    leaf,
    frame,
    leafSwing,
    handle,
  };
};

const createWindowGeometry = (floorId: string, elevation: number, opening: NormalizedOpening, segment: WallSegment2D): WindowGeometry3D => {
  const rotationZ = Math.atan2(segment.end.y - segment.start.y, segment.end.x - segment.start.x);
  const localStart = opening.offset - segment.startOffset;
  const frameWidth = Math.min(WINDOW_FRAME_WIDTH, Math.max(0.02, opening.width * 0.15));
  const glassThickness = Math.min(WINDOW_GLASS_THICKNESS, Math.max(0.01, segment.thickness * 0.25));

  const frame = [
    createBoxPart(`${opening.id}-jamb-left`, segment, elevation, rotationZ, localStart, frameWidth, opening.sillHeight, opening.height, segment.thickness),
    createBoxPart(`${opening.id}-jamb-right`, segment, elevation, rotationZ, localStart + opening.width - frameWidth, frameWidth, opening.sillHeight, opening.height, segment.thickness),
    createBoxPart(`${opening.id}-header`, segment, elevation, rotationZ, localStart, opening.width, opening.sillHeight + opening.height - frameWidth, frameWidth, segment.thickness),
    createBoxPart(`${opening.id}-bottom`, segment, elevation, rotationZ, localStart, opening.width, opening.sillHeight, frameWidth, segment.thickness),
  ].filter((part): part is BoxPart3D => part !== null);

  const glass = createBoxPart(
    `${opening.id}-glass`,
    segment,
    elevation,
    rotationZ,
    localStart + frameWidth,
    opening.width - 2 * frameWidth,
    opening.sillHeight + frameWidth,
    opening.height - 2 * frameWidth,
    glassThickness,
  );

  const sill = createBoxPart(
    `${opening.id}-sill`,
    segment,
    elevation,
    rotationZ,
    localStart + opening.width / 2 - (opening.width + 2 * WINDOW_SILL_OVERHANG) / 2,
    opening.width + 2 * WINDOW_SILL_OVERHANG,
    opening.sillHeight - WINDOW_SILL_THICKNESS,
    WINDOW_SILL_THICKNESS,
    segment.thickness + 2 * WINDOW_SILL_PROTRUSION,
  );

  return {
    id: opening.id,
    floorId,
    hostWallId: opening.wallId,
    hostSegmentId: segment.id,
    frame,
    glass,
    sill,
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

const createDoorSpatial = (floor: Floor2D, door: Door2D, wall: Wall2D, hostSegmentId: string): DoorSpatial => {
  const center2D = pointAlongWall(wall, door.offset + door.width / 2);
  return {
    id: door.id,
    floorId: floor.id,
    hostWallId: door.wallId,
    hostSegmentId,
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

const createWindowSpatial = (floor: Floor2D, window: Window2D, wall: Wall2D, hostSegmentId: string): WindowSpatial => {
  const center2D = pointAlongWall(wall, window.offset + window.width / 2);
  return {
    id: window.id,
    floorId: floor.id,
    hostWallId: window.wallId,
    hostSegmentId,
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

    const thicknessNormal = {
      x: Math.sin(wall.rotation),
      z: Math.cos(wall.rotation),
    };
    const halfThickness = wall.thickness / 2;
    measurements.push({
      id: `${wall.id}-thickness`,
      subjectType: "wall",
      subjectId: wall.id,
      kind: "thickness",
      value: wall.thickness,
      unit: "m",
      axis: "horizontal",
      floorId: wall.floorId,
      start: { x: wall.worldPosition.x - thicknessNormal.x * halfThickness, y: wall.elevation + 0.12, z: wall.worldPosition.z - thicknessNormal.z * halfThickness },
      end: { x: wall.worldPosition.x + thicknessNormal.x * halfThickness, y: wall.elevation + 0.12, z: wall.worldPosition.z + thicknessNormal.z * halfThickness },
      label: `${wall.thickness.toFixed(2)} m`,
    });
  }

  for (const room of spatial.rooms) {
    const extents = roomExtents(room.boundary);
    const primary3D = { x: extents.primary.x, z: -extents.primary.y };
    const secondary3D = { x: extents.secondary.x, z: -extents.secondary.y };
    const halfWidth = extents.width / 2;
    const halfLength = extents.length / 2;
    const centerX = room.worldPosition.x;
    const centerZ = room.worldPosition.z;
    const measureY = room.worldPosition.y + 0.12;

    const offsetPoint = (from3D: { x: number; z: number }, amount: number) => ({
      x: centerX + from3D.x * amount,
      z: centerZ + from3D.z * amount,
    });

    const widthCenter = offsetPoint(secondary3D, halfLength + MEASUREMENT_OFFSET);
    const widthStart = { x: widthCenter.x - primary3D.x * halfWidth, y: measureY, z: widthCenter.z - primary3D.z * halfWidth };
    const widthEnd = { x: widthCenter.x + primary3D.x * halfWidth, y: measureY, z: widthCenter.z + primary3D.z * halfWidth };

    const lengthCenter = offsetPoint(primary3D, halfWidth + MEASUREMENT_OFFSET);
    const lengthStart = { x: lengthCenter.x - secondary3D.x * halfLength, y: measureY, z: lengthCenter.z - secondary3D.z * halfLength };
    const lengthEnd = { x: lengthCenter.x + secondary3D.x * halfLength, y: measureY, z: lengthCenter.z + secondary3D.z * halfLength };

    const areaCenter = offsetPoint(secondary3D, 0);
    const areaStart = { x: areaCenter.x - primary3D.x * halfWidth, y: measureY, z: areaCenter.z - primary3D.z * halfWidth };
    const areaEnd = { x: areaCenter.x + primary3D.x * halfWidth, y: measureY, z: areaCenter.z + primary3D.z * halfWidth };

    measurements.push({
      id: `${room.id}-area`,
      subjectType: "room",
      subjectId: room.id,
      kind: "area",
      value: room.area,
      unit: "m",
      axis: "horizontal",
      floorId: room.floorId,
      start: areaStart,
      end: areaEnd,
      label: `${room.area.toFixed(2)} m²`,
    });
    measurements.push({
      id: `${room.id}-width`,
      subjectType: "room",
      subjectId: room.id,
      kind: "width",
      value: extents.width,
      unit: "m",
      axis: "horizontal",
      floorId: room.floorId,
      start: widthStart,
      end: widthEnd,
      label: `${extents.width.toFixed(2)} m`,
    });
    measurements.push({
      id: `${room.id}-length`,
      subjectType: "room",
      subjectId: room.id,
      kind: "length",
      value: extents.length,
      unit: "m",
      axis: "horizontal",
      floorId: room.floorId,
      start: lengthStart,
      end: lengthEnd,
      label: `${extents.length.toFixed(2)} m`,
    });
  }

  for (const door of spatial.doors) {
    const direction = { x: Math.cos(door.rotation), z: -Math.sin(door.rotation) };
    const normal = { x: Math.sin(door.rotation), z: Math.cos(door.rotation) };
    const baseX = door.worldPosition.x + normal.x * MEASUREMENT_OFFSET;
    const baseZ = door.worldPosition.z + normal.z * MEASUREMENT_OFFSET;
    const halfWidth = door.width / 2;
    const widthLine = {
      id: `${door.id}-width`,
      subjectType: "door" as const,
      subjectId: door.id,
      kind: "width" as const,
      value: door.width,
      unit: "m" as const,
      axis: "horizontal" as const,
      floorId: door.floorId,
      start: { x: baseX - direction.x * halfWidth, y: door.worldPosition.y + 0.08, z: baseZ - direction.z * halfWidth },
      end: { x: baseX + direction.x * halfWidth, y: door.worldPosition.y + 0.08, z: baseZ + direction.z * halfWidth },
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
    const direction = { x: Math.cos(opening.rotation), z: -Math.sin(opening.rotation) };
    const normal = { x: Math.sin(opening.rotation), z: Math.cos(opening.rotation) };
    const baseX = opening.worldPosition.x + normal.x * MEASUREMENT_OFFSET;
    const baseZ = opening.worldPosition.z + normal.z * MEASUREMENT_OFFSET;
    const halfWidth = opening.width / 2;
    measurements.push({
      id: `${opening.id}-width`,
      subjectType: "window",
      subjectId: opening.id,
      kind: "width",
      value: opening.width,
      unit: "m",
      axis: "horizontal",
      floorId: opening.floorId,
      start: { x: baseX - direction.x * halfWidth, y: opening.worldPosition.y + 0.08, z: baseZ - direction.z * halfWidth },
      end: { x: baseX + direction.x * halfWidth, y: opening.worldPosition.y + 0.08, z: baseZ + direction.z * halfWidth },
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
  const normalizedOpenings = [...floorPlan.doors, ...floorPlan.windows].map(asNormalizedOpening);
  const openings: Opening3D[] = normalizedOpenings
    .map((opening) => {
      const wall = wallsById.get(opening.wallId);
      if (!wall) throw new Error(`Unknown wall '${opening.wallId}' while creating opening '${opening.id}'.`);
      return createOpening3D(floor.id, floor.elevation, opening, wall);
    });

  const wallSegments = buildWallSegments(floorPlan.walls, floorPlan.rooms);
  const segmentsForWall = new Map<string, WallSegment2D[]>();
  for (const segment of wallSegments) {
    const matches = segmentsForWall.get(segment.sourceWallId) ?? [];
    matches.push(segment);
    segmentsForWall.set(segment.sourceWallId, matches);
  }

  const architecturalOpenings: ArchitecturalOpening[] = [];
  const doors: DoorGeometry3D[] = [];
  const windows: WindowGeometry3D[] = [];
  for (const opening of normalizedOpenings) {
    const segments = segmentsForWall.get(opening.wallId) ?? [];
    const hostSegment = resolveHostSegment(segments, opening.offset, opening.width);
    architecturalOpenings.push(createArchitecturalOpening(floor.id, floor.elevation, opening, hostSegment));
    if (opening.type === "door") {
      doors.push(createDoorGeometry(floor.id, floor.elevation, opening, hostSegment));
    } else {
      windows.push(createWindowGeometry(floor.id, floor.elevation, opening, hostSegment));
    }
  }

  return {
    unit: floorPlan.unit,
    wallBoxes: floorPlan.walls.flatMap((wall) => generateWallBoxes(floor.id, floor.elevation, wall, openingsByWall.get(wall.id) ?? [], segmentsForWall.get(wall.id) ?? [])),
    wallSegments,
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
    architecturalOpenings,
    doors,
    windows,
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
    wallSegments: building.floors.flatMap((floor, floorIndex) =>
      generatedFloors[floorIndex].wallSegments.map((segment) => ({ ...segment, floorId: floor.id })),
    ),
    rooms: building.floors.flatMap((floor) => floor.plan.rooms.map((room) => createRoomSpatial(floor, room, floor.plan.walls))),
    doors: building.floors.flatMap((floor, floorIndex) => floor.plan.doors.map((door) => {
      const wall = floor.plan.walls.find((entry) => entry.id === door.wallId);
      if (!wall) throw new Error(`Unknown wall '${door.wallId}' for door '${door.id}'.`);
      const hostSegments = generatedFloors[floorIndex].wallSegments.filter((segment) => segment.sourceWallId === wall.id);
      const hostSegment = resolveHostSegment(hostSegments, door.offset, door.width);
      return createDoorSpatial(floor, door, wall, hostSegment.id);
    })),
    windows: building.floors.flatMap((floor, floorIndex) => floor.plan.windows.map((window) => {
      const wall = floor.plan.walls.find((entry) => entry.id === window.wallId);
      if (!wall) throw new Error(`Unknown wall '${window.wallId}' for window '${window.id}'.`);
      const hostSegments = generatedFloors[floorIndex].wallSegments.filter((segment) => segment.sourceWallId === wall.id);
      const hostSegment = resolveHostSegment(hostSegments, window.offset, window.width);
      return createWindowSpatial(floor, window, wall, hostSegment.id);
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
    architecturalOpenings: generatedFloors.flatMap((floor) => floor.architecturalOpenings),
    doors: generatedFloors.flatMap((floor) => floor.doors),
    windows: generatedFloors.flatMap((floor) => floor.windows),
    stairs,
    roof: { id: building.roof.id, floorId: highest.id, center: { x: 4.5, y: highest.elevation + highest.plan.walls[0].height + building.roof.height / 2, z: -3.5 }, width: 9.4, length: 7.4, height: building.roof.height },
    spatialElements,
    measurements: createMeasurements(building, spatialElements),
  };
};

export const wallLength = (wall: Wall2D) => distance(wall.start, wall.end);