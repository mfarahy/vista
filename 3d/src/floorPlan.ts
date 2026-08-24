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
  openingDirection?: "left" | "right" | "inward" | "outward";
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

export const FLOOR_PLAN_COORDINATES = {
  unit: "m",
  axis2D: {
    x: "east-west on ground plane",
    y: "north-south on ground plane",
  },
  axis3D: {
    x: "east-west",
    y: "vertical height",
    z: "negative 2D y direction",
  },
  origin: "(0,0) at the south-west corner of the apartment on floor elevation",
} as const;

const wallHeight = 2.8;
const exteriorThickness = 0.2;
const interiorThickness = 0.15;

export const demoFloorPlan: FloorPlan2D = {
  unit: "m",
  walls: [
    { id: "west", start: { x: 0, y: 0 }, end: { x: 0, y: 7 }, thickness: exteriorThickness, height: wallHeight, kind: "exterior" },
    { id: "north", start: { x: 0, y: 7 }, end: { x: 9, y: 7 }, thickness: exteriorThickness, height: wallHeight, kind: "exterior" },
    { id: "east", start: { x: 9, y: 7 }, end: { x: 9, y: 0 }, thickness: exteriorThickness, height: wallHeight, kind: "exterior" },
    { id: "south", start: { x: 9, y: 0 }, end: { x: 0, y: 0 }, thickness: exteriorThickness, height: wallHeight, kind: "exterior" },
    { id: "center-divider", start: { x: 5, y: 0 }, end: { x: 5, y: 7 }, thickness: interiorThickness, height: wallHeight, kind: "interior" },
    { id: "cross-divider", start: { x: 0, y: 4 }, end: { x: 9, y: 4 }, thickness: interiorThickness, height: wallHeight, kind: "interior" }
  ],
  doors: [
    { id: "living-bedroom", wallId: "center-divider", offset: 1.1, width: 0.9, height: 2.1, openingDirection: "left" },
    { id: "living-kitchen", wallId: "cross-divider", offset: 1.9, width: 0.9, height: 2.1, openingDirection: "inward" },
    { id: "bedroom-bathroom", wallId: "cross-divider", offset: 6.1, width: 0.8, height: 2.1, openingDirection: "right" }
  ],
  windows: [
    { id: "kitchen-north-window", wallId: "north", offset: 0.8, width: 1.6, height: 1.2, sillHeight: 0.9 },
    { id: "bathroom-north-window", wallId: "north", offset: 6.0, width: 1.2, height: 1.0, sillHeight: 1.2 },
    { id: "bedroom-east-window", wallId: "east", offset: 4.6, width: 1.4, height: 1.2, sillHeight: 0.9 },
    { id: "living-south-window", wallId: "south", offset: 6.4, width: 1.8, height: 1.2, sillHeight: 0.9 }
  ],
  rooms: [
    { id: "living-room", name: "Living Room", boundary: [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 4 }, { x: 0, y: 4 }] },
    { id: "kitchen", name: "Kitchen", boundary: [{ x: 0, y: 4 }, { x: 5, y: 4 }, { x: 5, y: 7 }, { x: 0, y: 7 }] },
    { id: "bedroom", name: "Bedroom", boundary: [{ x: 5, y: 0 }, { x: 9, y: 0 }, { x: 9, y: 4 }, { x: 5, y: 4 }] },
    { id: "bathroom", name: "Bathroom", boundary: [{ x: 5, y: 4 }, { x: 9, y: 4 }, { x: 9, y: 7 }, { x: 5, y: 7 }] }
  ]
};