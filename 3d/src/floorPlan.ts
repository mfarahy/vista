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

export type Floor2D = {
  id: string;
  name: string;
  elevation: number;
  floorToFloorHeight: number;
  plan: FloorPlan2D;
};

export type Stair2D = {
  id: string;
  sourceFloorId: string;
  targetFloorId: string;
  position: Point2D;
  width: number;
  length: number;
  height: number;
};

export type Roof2D = {
  id: string;
  floorId: string;
  height: number;
};

export type Building = {
  unit: "m";
  floors: Floor2D[];
  stairs: Stair2D[];
  roof: Roof2D;
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

const villaPlan = (variant: "basement" | "ground" | "first"): FloorPlan2D => ({
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
    { id: `${variant}-entry`, wallId: "south", offset: 1.1, width: 1, height: 2.1, openingDirection: "inward" },
    { id: `${variant}-center`, wallId: "center-divider", offset: 1.1, width: 0.9, height: 2.1, openingDirection: "left" },
    { id: `${variant}-cross`, wallId: "cross-divider", offset: 1.9, width: 0.9, height: 2.1, openingDirection: "inward" }
  ],
  windows: [
    { id: `${variant}-north-window`, wallId: "north", offset: 0.8, width: 1.6, height: 1.2, sillHeight: 0.9 },
    { id: `${variant}-bath-window`, wallId: "north", offset: 6, width: 1.2, height: 1, sillHeight: 1.2 },
    { id: `${variant}-east-window`, wallId: "east", offset: 4.6, width: 1.4, height: 1.2, sillHeight: 0.9 },
    { id: `${variant}-south-window`, wallId: "south", offset: 6.4, width: 1.8, height: 1.2, sillHeight: 0.9 }
  ],
  rooms: [
    { id: `${variant}-main`, name: variant === "basement" ? "Basement Room" : variant === "ground" ? "Living Room" : "Bedroom 1", boundary: [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 4 }, { x: 0, y: 4 }] },
    { id: `${variant}-north`, name: variant === "basement" ? "Utility / Storage" : variant === "ground" ? "Kitchen" : "Bedroom 2", boundary: [{ x: 0, y: 4 }, { x: 5, y: 4 }, { x: 5, y: 7 }, { x: 0, y: 7 }] },
    { id: `${variant}-east`, name: variant === "first" ? "Hallway" : "Entrance", boundary: [{ x: 5, y: 0 }, { x: 9, y: 0 }, { x: 9, y: 4 }, { x: 5, y: 4 }] },
    { id: `${variant}-bathroom`, name: "Bathroom", boundary: [{ x: 5, y: 4 }, { x: 9, y: 4 }, { x: 9, y: 7 }, { x: 5, y: 7 }] }
  ]
});

export const demoBuilding: Building = {
  unit: "m",
  floors: [
    { id: "basement", name: "Basement", elevation: -2.8, floorToFloorHeight: 2.8, plan: villaPlan("basement") },
    { id: "ground", name: "Ground Floor", elevation: 0, floorToFloorHeight: 2.8, plan: villaPlan("ground") },
    { id: "first", name: "First Floor", elevation: 2.8, floorToFloorHeight: 2.8, plan: villaPlan("first") },
  ],
  stairs: [
    { id: "basement-stairs", sourceFloorId: "basement", targetFloorId: "ground", position: { x: 6.1, y: 1.2 }, width: 1.2, length: 3, height: 2.8 },
    { id: "first-floor-stairs", sourceFloorId: "ground", targetFloorId: "first", position: { x: 6.1, y: 1.2 }, width: 1.2, length: 3, height: 2.8 },
  ],
  roof: { id: "villa-roof", floorId: "first", height: 0.35 },
};

export const demoFloorPlan = demoBuilding.floors[1].plan;