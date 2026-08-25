/**
 * Narrow integration boundary for openPlan3D's shared floor-plan model.
 *
 * Upstream model reference:
 * https://github.com/laanlabs/openPlan3D/blob/main/src/lib/models/types.ts
 * https://github.com/laanlabs/openPlan3D/blob/main/src/lib/components/viewer3d/ThreeViewer.svelte
 *
 * The upstream application is SvelteKit rather than a distributable React
 * package, so this prototype reuses the compatible data conventions and the
 * pure wall-segmentation algorithm without copying the application shell.
 */

import type { Building, Door2D, Floor2D, Point2D, Wall2D, Window2D } from "./floorPlan";

export type OpenPlan3DWall = {
  id: string;
  start: Point2D;
  end: Point2D;
  thickness: number;
  height: number;
  color: string;
};

export type OpenPlan3DDoor = {
  id: string;
  wallId: string;
  position: number;
  width: number;
  height: number;
  type: "single";
  swingDirection: "left" | "right";
  flipSide: boolean;
};

export type OpenPlan3DWindow = {
  id: string;
  wallId: string;
  position: number;
  width: number;
  height: number;
  sillHeight: number;
  type: "standard";
};

export type OpenPlan3DRoom = {
  id: string;
  name: string;
  walls: string[];
  floorTexture: "none";
  area: number;
};

export type OpenPlan3DFloor = {
  id: string;
  name: string;
  level: number;
  elevation: number;
  walls: OpenPlan3DWall[];
  rooms: OpenPlan3DRoom[];
  doors: OpenPlan3DDoor[];
  windows: OpenPlan3DWindow[];
};

export type OpenPlan3DProject = {
  name: string;
  unit: "m";
  floors: OpenPlan3DFloor[];
};

const polygonArea = (vertices: Point2D[]) => Math.abs(vertices.reduce((area, point, index) => {
  const next = vertices[(index + 1) % vertices.length];
  return area + point.x * next.y - next.x * point.y;
}, 0) / 2);

const wallLength = (wall: Wall2D) => Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y);

const openingPosition = (wall: Wall2D, offset: number, width: number) => (offset + width / 2) / wallLength(wall);

const toOpenPlan3DFloor = (floor: Floor2D): OpenPlan3DFloor => {
  const doors: OpenPlan3DDoor[] = floor.plan.doors.map((door: Door2D) => ({
    id: door.id,
    wallId: door.wallId,
    position: openingPosition(floor.plan.walls.find((wall) => wall.id === door.wallId)!, door.offset, door.width),
    width: door.width * 100,
    height: door.height * 100,
    type: "single",
    swingDirection: door.openingDirection === "right" ? "right" : "left",
    flipSide: door.openingDirection === "outward",
  }));
  const windows: OpenPlan3DWindow[] = floor.plan.windows.map((window: Window2D) => ({
    id: window.id,
    wallId: window.wallId,
    position: openingPosition(floor.plan.walls.find((wall) => wall.id === window.wallId)!, window.offset, window.width),
    width: window.width * 100,
    height: window.height * 100,
    sillHeight: window.sillHeight * 100,
    type: "standard",
  }));

  return {
    id: floor.id,
    name: floor.name,
    level: floor.elevation,
    elevation: floor.elevation,
    walls: floor.plan.walls.map((wall) => ({
      id: wall.id,
      start: { x: wall.start.x * 100, y: wall.start.y * 100 },
      end: { x: wall.end.x * 100, y: wall.end.y * 100 },
      thickness: wall.thickness * 100,
      height: wall.height * 100,
      color: wall.kind === "exterior" ? "#3d5a59" : "#81938d",
    })),
    rooms: floor.plan.rooms.map((room) => ({
      id: room.id,
      name: room.name,
      walls: floor.plan.walls.filter((wall) => room.boundary.some((point) => point.x === wall.start.x && point.y === wall.start.y)).map((wall) => wall.id),
      floorTexture: "none",
      area: polygonArea(room.boundary) * 10000,
    })),
    doors,
    windows,
  };
};

export const toOpenPlan3DProject = (building: Building): OpenPlan3DProject => ({
  name: "Deterministic Villa",
  unit: building.unit,
  floors: building.floors.map(toOpenPlan3DFloor),
});

export type OpenPlan3DWallSegment = {
  width: number;
  height: number;
  offsetX: number;
  offsetY: number;
};

/** Extracted from openPlan3D ThreeViewer.svelte's buildWallSegments algorithm. */
export const buildOpenPlan3DWallSegments = (
  wallLength: number,
  wallHeight: number,
  doors: Array<Pick<OpenPlan3DDoor, "position" | "width" | "height">>,
  windows: Array<Pick<OpenPlan3DWindow, "position" | "width" | "sillHeight" | "height">>,
): OpenPlan3DWallSegment[] => {
  type Opening = { pos: number; width: number; bottomY: number; topY: number };
  const openings: Opening[] = [
    ...doors.map((door) => ({ pos: door.position * wallLength - door.width / 2, width: door.width, bottomY: 0, topY: door.height })),
    ...windows.map((window) => ({ pos: window.position * wallLength - window.width / 2, width: window.width, bottomY: window.sillHeight, topY: window.sillHeight + window.height })),
  ].sort((first, second) => first.pos - second.pos);

  const segments: OpenPlan3DWallSegment[] = [];
  let cursor = 0;
  for (const opening of openings) {
    if (opening.pos > cursor) segments.push({ width: opening.pos - cursor, height: wallHeight, offsetX: (cursor + opening.pos) / 2, offsetY: 0 });
    if (opening.bottomY > 0) segments.push({ width: opening.width, height: opening.bottomY, offsetX: opening.pos + opening.width / 2, offsetY: 0 });
    if (opening.topY < wallHeight) segments.push({ width: opening.width, height: wallHeight - opening.topY, offsetX: opening.pos + opening.width / 2, offsetY: opening.topY });
    cursor = Math.max(cursor, opening.pos + opening.width);
  }
  if (cursor < wallLength) segments.push({ width: wallLength - cursor, height: wallHeight, offsetX: (cursor + wallLength) / 2, offsetY: 0 });
  return segments;
};