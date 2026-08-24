export type Point2D = {
  x: number;
  y: number;
};

export type WallKind = "exterior" | "interior";

export type Wall2D = {
  id: string;
  start: Point2D;
  end: Point2D;
  thickness: number;
  height: number;
  kind: WallKind;
};

export type Door2D = {
  id: string;
  wallId: string;
  offset: number;
  width: number;
  height: number;
};

export type Window2D = {
  id: string;
  wallId: string;
  offset: number;
  width: number;
  height: number;
  sillHeight: number;
};

export type Room2D = {
  id: string;
  name: string;
  boundary: Point2D[];
};

export type FloorPlan2D = {
  unit: "m";
  walls: Wall2D[];
  doors: Door2D[];
  windows: Window2D[];
  rooms: Room2D[];
};

const wallHeight = 2.8;
const exteriorThickness = 0.2;
const interiorThickness = 0.15;

export const demoFloorPlan: FloorPlan2D = {
  unit: "m",
  walls: [
    { id: "west", start: { x: 0, y: 0 }, end: { x: 0, y: 6 }, thickness: exteriorThickness, height: wallHeight, kind: "exterior" },
    { id: "north", start: { x: 0, y: 6 }, end: { x: 8, y: 6 }, thickness: exteriorThickness, height: wallHeight, kind: "exterior" },
    { id: "east", start: { x: 8, y: 6 }, end: { x: 8, y: 0 }, thickness: exteriorThickness, height: wallHeight, kind: "exterior" },
    { id: "south", start: { x: 8, y: 0 }, end: { x: 0, y: 0 }, thickness: exteriorThickness, height: wallHeight, kind: "exterior" },
    { id: "divider", start: { x: 5, y: 0 }, end: { x: 5, y: 6 }, thickness: interiorThickness, height: wallHeight, kind: "interior" },
    { id: "bedroom-bathroom", start: { x: 5, y: 3.7 }, end: { x: 8, y: 3.7 }, thickness: interiorThickness, height: wallHeight, kind: "interior" }
  ],
  doors: [
    { id: "living-bedroom", wallId: "divider", offset: 1.2, width: 0.9, height: 2.1 },
    { id: "living-bathroom", wallId: "divider", offset: 4.35, width: 0.8, height: 2.1 }
  ],
  windows: [
    { id: "living-window", wallId: "north", offset: 1.2, width: 1.8, height: 1.2, sillHeight: 0.9 },
    { id: "bedroom-window", wallId: "east", offset: 0.9, width: 1.2, height: 1.2, sillHeight: 0.9 }
  ],
  rooms: [
    { id: "living-room", name: "Living room", boundary: [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 6 }, { x: 0, y: 6 }] },
    { id: "bedroom", name: "Bedroom", boundary: [{ x: 5, y: 0 }, { x: 8, y: 0 }, { x: 8, y: 3.7 }, { x: 5, y: 3.7 }] },
    { id: "bathroom", name: "Bathroom", boundary: [{ x: 5, y: 3.7 }, { x: 8, y: 3.7 }, { x: 8, y: 6 }, { x: 5, y: 6 }] }
  ]
};