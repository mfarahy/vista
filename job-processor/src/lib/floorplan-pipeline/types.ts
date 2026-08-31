/**
 * Normalized floor-plan geometry.
 *
 * This is the clean intermediate representation between the raw
 * floorplan-recognition output and the 3D model / debug views. It is
 * independent from the recognition model: only pixel-space geometry is kept,
 * in a canonical shape that downstream consumers (room detection, 3D builder,
 * debug renderers) rely on.
 */

export type Point = { x: number; y: number };

/** A straight wall run expressed as a centerline segment plus thickness. */
export interface WallRun {
  id: string;
  /** Centerline from endpoint A to endpoint B (pixel space, y down). */
  from: Point;
  to: Point;
  /** Wall thickness in pixels (inferred from the recognized polygon). */
  thickness: number;
  /** Wall length in pixels. */
  length: number;
  /** True when the wall separates the interior from the outside. */
  exterior: boolean;
  /** Raw polygon the run was extracted from (debugging). */
  polygon: Point[];
}

export type OpeningKind = 'door' | 'entry_door' | 'window';

export interface Opening {
  id: string;
  kind: OpeningKind;
  /** Centerline segment along the host wall (pixel space, y down). */
  from: Point;
  to: Point;
  /** Opening width in pixels (centerline length). */
  width: number;
  /** Id of the wall run the opening sits on, when one was found. */
  wallId: string | null;
  /** Room ids on each side of the opening (0-2 entries). */
  roomIds: string[];
}

export type RoomHint = 'kitchen' | null;

export interface DetectedRoom {
  id: string;
  /** Closed polygon of the walkable room area (pixel space, y down). */
  polygon: Point[];
  /** Area in square pixels. */
  area: number;
  /** Area in square meters using the configured pixels-per-meter scale. */
  areaM2: number;
  /** True when the component connects to the outside (terrace, garden, …). */
  exterior: boolean;
  /** Deterministic hint derived from recognized regions (e.g. kitchen). */
  hint: RoomHint;
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** A connectivity edge between two rooms through a door/entry-door opening. */
export interface RoomAdjacency {
  roomA: string;
  roomB: string;
  openingId: string;
}

/**
 * The complete normalized floor plan, ready for room detection, the 2D
 * debug view and the 3D builder.
 */
export interface NormalizedFloorPlan {
  units: 'pixel';
  bounds: Bounds;
  /** Source image dimensions in pixels, when known. */
  imageSize: { width: number; height: number } | null;
  walls: WallRun[];
  openings: Opening[];
  rooms: DetectedRoom[];
  /** Room-to-room connectivity graph derived from door openings. */
  roomAdjacency: RoomAdjacency[];
  /**
   * Raw recognized regions, kept for the occupancy mask (rooms are the
   * enclosed free space between them) and for debugging.
   */
  regions: {
    wall: Point[][];
    door: Point[][];
    entry_door: Point[][];
    window: Point[][];
  };
  /** Recognized kitchen regions (raw polygons, debugging). */
  kitchenRegions: Point[][];
  /** Options used while building this plan. */
  options: {
    /** Pixels that map to one meter in the 3D model. */
    pixelsPerMeter: number;
  };
}

/** Raw recognition geometry, exactly as returned by the model. */
export interface RecognitionGeometry {
  wall: number[][][];
  door: number[][][];
  entry_door: number[][][];
  window: number[][][];
  kitchen: number[][][];
  door_center_line: number[][][];
  entry_door_center_line: number[][][];
  window_center_line: number[][][];
}